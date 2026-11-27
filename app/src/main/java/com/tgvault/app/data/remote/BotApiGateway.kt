package com.tgvault.app.data.remote

import com.tgvault.app.core.common.AppError
import com.tgvault.app.core.common.TokenRedactor
import com.tgvault.app.data.remote.api.TelegramBotApi
import com.tgvault.app.data.remote.dto.ApiResponse
import com.tgvault.app.domain.model.ChunkSource
import java.io.IOException
import java.io.OutputStream
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okio.BufferedSink
import retrofit2.HttpException

/**
 * Telegram Bot API (HTTPS) — SPEC §9. Upload multipart STREAMING từ ChunkSource,
 * download streaming ra OutputStream; KHÔNG đọc nguyên chunk vào RAM (SPEC §16).
 *
 * Lệnh gửi/pin/xoá đi qua [TelegramRateLimiter] (SPEC §9.3); lỗi ánh xạ theo SPEC §9.2;
 * 429 được pause + tự retry (tối đa [MAX_RATE_LIMIT_RETRIES] lần liên tiếp).
 */
class BotApiGateway(
    private val api: TelegramBotApi,
    private val okHttpClient: OkHttpClient,
    json: Json,
    private val tokenProvider: BotTokenProvider,
    private val rateLimiter: TelegramRateLimiter,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : TelegramGateway {

    private val errorMapper = TelegramErrorMapper(json)

    /** SPEC §9.3: tối đa 3 kết nối download đồng thời toàn app */
    private val downloadPermits = Semaphore(MAX_PARALLEL_DOWNLOADS)

    private suspend fun token(): String = tokenProvider.token()

    override suspend fun getMe(): BotInfo {
        val user = call { api.getMe(token()) }
        return BotInfo(id = user.id, username = user.username.orEmpty(), firstName = user.firstName)
    }

    override fun watchForChannel(): Flow<ChannelCandidate> = flow {
        call { api.deleteWebhook(token()) }
        var offset: Long? = null
        while (currentCoroutineContext().isActive) {
            val updates = try {
                call { api.getUpdates(token(), offset, LONG_POLL_TIMEOUT_SECONDS, ALLOWED_UPDATES) }
            } catch (e: AppError.Transient) {
                // mất mạng/timeout khi long polling — chờ rồi tiếp tục (SPEC §9.2)
                delay(RECONNECT_DELAY_MS)
                continue
            }
            for (update in updates) {
                offset = update.updateId + 1
                val candidate = update.myChatMember?.let { memberUpdated ->
                    memberUpdated.chat.takeIf {
                        memberUpdated.newChatMember?.status == STATUS_ADMINISTRATOR
                    }
                } ?: update.channelPost?.chat
                if (candidate != null) {
                    emit(ChannelCandidate(candidate.id, candidate.title, candidate.username))
                }
            }
        }
    }

    override suspend fun getChat(chatId: Long): ChatInfo {
        val chat = call { api.getChat(token(), chatId) }
        return ChatInfo(
            chatId = chat.id,
            title = chat.title,
            username = chat.username,
            pinnedMessageText = chat.pinnedMessage?.text,
        )
    }

    override suspend fun getBotRights(chatId: Long): BotRights {
        val me = call { api.getMe(token()) }
        val member = call { api.getChatMember(token(), chatId, me.id) }
        return BotRights(
            canPost = member.canPostMessages == true,
            canDelete = member.canDeleteMessages == true,
            canPin = member.canPinMessages == true,
        )
    }

    override suspend fun sendDocument(
        chatId: Long,
        part: ChunkSource,
        fileName: String,
        caption: String?,
        onProgress: (bytesWritten: Long) -> Unit,
    ): SentDocument {
        val token = token()
        val documentPart = MultipartBody.Part.createFormData(
            PART_DOCUMENT,
            fileName,
            ChunkRequestBody(part, onProgress),
        )
        val chatIdBody = chatId.toString().toRequestBody(PlainTextMediaType)
        val captionBody = caption?.toRequestBody(PlainTextMediaType)
        val disableBody = "true".toRequestBody(PlainTextMediaType)
        val message = sendWithRateLimit(chatId) {
            call { api.sendDocument(token, chatIdBody, documentPart, captionBody, disableBody) }
        }
        val document = message.document
            ?: throw AppError.Unknown(detail = "sendDocument response thiếu document")
        return SentDocument(
            messageId = message.messageId,
            fileId = document.fileId,
            fileUniqueId = document.fileUniqueId,
        )
    }

    override suspend fun sendText(chatId: Long, text: String): SentMessage = sendWithRateLimit(chatId) {
        SentMessage(call { api.sendMessage(token(), chatId, text) }.messageId)
    }

    override suspend fun pinMessage(chatId: Long, messageId: Long) {
        sendWithRateLimit(chatId) {
            call { api.pinChatMessage(token(), chatId, messageId, disableNotification = true) }
        }
    }

    override suspend fun unpinMessage(chatId: Long, messageId: Long) {
        sendWithRateLimit(chatId) {
            call { api.unpinChatMessage(token(), chatId, messageId) }
        }
    }

    override suspend fun resolveFilePath(fileId: String): String {
        val file = call { api.getFile(token(), fileId) }
        return file.filePath ?: throw AppError.Unknown(detail = "getFile response thiếu file_path")
    }

    override suspend fun download(
        filePath: String,
        sink: OutputStream,
        range: LongRange?,
        onProgress: (bytesWritten: Long) -> Unit,
    ) {
        downloadPermits.withPermit {
            withContext(ioDispatcher) {
                val url = "$DOWNLOAD_URL_PREFIX${token()}/$filePath"
                val requestBuilder = Request.Builder().url(url).get()
                if (range != null) {
                    requestBuilder.header(HEADER_RANGE, "bytes=${range.first}-${range.last}")
                }
                try {
                    okHttpClient.newCall(requestBuilder.build()).execute().use { response ->
                        mapDownloadError(response.code, response.header(HEADER_RETRY_AFTER))
                        if (range != null && response.code == HTTP_OK) {
                            // Server bỏ qua Range — KHÔNG ghi byte nào, để engine tải lại từ đầu
                            throw AppError.RangeNotSupported()
                        }
                        val body = response.body ?: throw AppError.Unknown(detail = "download body rỗng")
                        body.byteStream().use { input ->
                            val buffer = ByteArray(COPY_BUFFER_SIZE)
                            var written = 0L
                            while (true) {
                                val read = input.read(buffer)
                                if (read == -1) break
                                sink.write(buffer, 0, read)
                                written += read
                                onProgress(written)
                            }
                            sink.flush()
                        }
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: AppError) {
                    throw e
                } catch (e: IOException) {
                    throw AppError.Transient(cause = e)
                }
            }
        }
    }

    override suspend fun deleteMessage(chatId: Long, messageId: Long): DeleteResult = try {
        sendWithRateLimit(chatId) {
            call { api.deleteMessage(token(), chatId, messageId) }
        }
        DeleteResult.Deleted
    } catch (e: AppError.InvalidToken) {
        throw e
    } catch (e: AppError.RateLimited) {
        throw e
    } catch (e: AppError) {
        val detail = e.message.orEmpty().lowercase()
        if ("message to delete not found" in detail) {
            DeleteResult.AlreadyGone
        } else {
            DeleteResult.Failed(TokenRedactor.redact(e.message))
        }
    }

    // --- helpers ---

    /**
     * Gọi API: unwrap ApiResponse + ánh xạ lỗi (SPEC §9.2). CancellationException luôn ném lại.
     */
    private suspend fun <T> call(block: suspend () -> ApiResponse<T>): T {
        try {
            val response = block()
            if (!response.ok) {
                throw errorMapper.mapStatus(
                    code = response.errorCode ?: 0,
                    description = response.description.orEmpty(),
                    retryAfter = response.parameters?.retryAfter,
                )
            }
            return response.result ?: throw AppError.Unknown(detail = "API response thiếu result")
        } catch (e: CancellationException) {
            throw e
        } catch (e: AppError) {
            throw e
        } catch (e: HttpException) {
            throw errorMapper.map(e)
        } catch (e: IOException) {
            throw AppError.Transient(cause = e)
        }
    }

    /**
     * Lệnh gửi qua rate limiter; khi bị 429 thì retry — vòng lặp sau sẽ chờ pauseUntil
     * (SPEC §9.2: tạm dừng toàn bộ hàng gửi, chờ retry_after + 1s).
     */
    private suspend fun <T> sendWithRateLimit(chatId: Long, block: suspend () -> T): T {
        var rateLimitRetries = 0
        while (true) {
            try {
                return rateLimiter.withPermit(chatId) { block() }
            } catch (e: AppError.RateLimited) {
                rateLimitRetries++
                if (rateLimitRetries > MAX_RATE_LIMIT_RETRIES) {
                    throw AppError.Transient(detail = "rate limit kéo dài", cause = e)
                }
            }
        }
    }

    private fun mapDownloadError(code: Int, retryAfterHeader: String?) {
        when {
            code == HTTP_UNAUTHORIZED -> throw AppError.InvalidToken()
            code == HTTP_TOO_MANY_REQUESTS -> throw AppError.RateLimited(
                retryAfterHeader?.toLongOrNull() ?: TelegramErrorMapper.DEFAULT_RETRY_AFTER_SECONDS,
            )
            code in 500..599 -> throw AppError.Transient(detail = "HTTP $code khi tải file")
            code == HTTP_OK || code == HTTP_PARTIAL_CONTENT -> Unit
            else -> throw AppError.Unknown(detail = "HTTP $code khi tải file")
        }
    }

    /** RequestBody streaming từ ChunkSource (multipart sendDocument). Không buffer vào RAM. */
    private class ChunkRequestBody(
        private val source: ChunkSource,
        private val onProgress: (Long) -> Unit,
    ) : RequestBody() {

        override fun contentType(): MediaType = OctetStreamMediaType

        override fun contentLength(): Long = source.length

        override fun writeTo(sink: BufferedSink) {
            source.writeTo(sink.outputStream(), onProgress)
        }
    }

    companion object {
        const val API_BASE_URL = "https://api.telegram.org/"
        const val DOWNLOAD_URL_PREFIX = "https://api.telegram.org/file/bot"

        const val LONG_POLL_TIMEOUT_SECONDS = 30
        const val RECONNECT_DELAY_MS = 3_000L
        const val ALLOWED_UPDATES = """["my_chat_member","channel_post"]"""
        const val STATUS_ADMINISTRATOR = "administrator"

        const val MAX_PARALLEL_DOWNLOADS = 3
        const val MAX_RATE_LIMIT_RETRIES = 10
        const val COPY_BUFFER_SIZE = 64 * 1024

        const val PART_DOCUMENT = "document"
        const val HEADER_RANGE = "Range"
        const val HEADER_RETRY_AFTER = "Retry-After"
        const val HTTP_OK = 200
        const val HTTP_PARTIAL_CONTENT = 206
        const val HTTP_UNAUTHORIZED = 401
        const val HTTP_TOO_MANY_REQUESTS = 429

        private val PlainTextMediaType = "text/plain".toMediaType()
        private val OctetStreamMediaType = "application/octet-stream".toMediaType()
    }
}
