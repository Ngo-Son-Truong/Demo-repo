package com.tgvault.app.data.remote

import com.tgvault.app.core.common.AppError
import com.tgvault.app.core.common.TimeProvider
import com.tgvault.app.data.remote.api.TelegramBotApi
import com.tgvault.app.domain.model.ChunkSource
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume
import org.junit.BeforeClass
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.util.concurrent.TimeUnit

/**
 * PLAN M1-7 — Bộ test Telegram THẬT (không chạy trong CI):
 *
 *     ./gradlew testDebugUnitTest -PrunTelegramLive=true
 *
 * Yêu cầu `tgvault.botToken` + `tgvault.chatId` trong local.properties; bot là admin của channel TEST
 * (đừng dùng channel dữ liệu thật). Mỗi test in ra dòng "[TELEGRAM_FINDINGS] Qn: ..." —
 * chép kết quả vào docs/TELEGRAM_FINDINGS.md.
 *
 * Câu hỏi 3b/2b (tin >48h, file_id ngày hôm sau) cần chạy 2 lần cách nhau: truyền thêm
 * -Dtgvault.oldMessageId=... / -Dtgvault.knownFileId=... (xem hướng dẫn in ra ở lần chạy đầu).
 */
class TelegramLiveTest {
    private fun finding(
        question: String,
        message: String,
    ) {
        println("[TELEGRAM_FINDINGS] $question: $message")
    }

    /** Chunk tổng hợp deterministic (byte[i] = i mod 256), không giữ nguyên chunk trong RAM. */
    private class SyntheticChunkSource(private val sizeBytes: Long) : ChunkSource {
        override val length: Long get() = sizeBytes

        override fun writeTo(
            sink: OutputStream,
            onProgress: (Long) -> Unit,
        ) {
            val buffer = ByteArray(64 * 1024) { (it % 256).toByte() }
            var written = 0L
            while (written < sizeBytes) {
                val n = minOf(buffer.size.toLong(), sizeBytes - written).toInt()
                sink.write(buffer, 0, n)
                written += n
                onProgress(written)
            }
        }
    }

    @Test
    fun `Q1 chunk 19 MiB gui roi tai lai duoc`() =
        runBlocking {
            val size = 19L * 1024 * 1024
            val upStart = System.currentTimeMillis()
            val sent =
                gateway.sendDocument(
                    CHAT_ID,
                    SyntheticChunkSource(size),
                    "tgvault-live-19mib.bin",
                    "#tgvault live q1",
                )
            val upSec = (System.currentTimeMillis() - upStart) / 1000.0

            val path = gateway.resolveFilePath(sent.fileId)
            val out = ByteArrayOutputStream()
            val dlStart = System.currentTimeMillis()
            gateway.download(path, out, null) {}
            val dlSec = (System.currentTimeMillis() - dlStart) / 1000.0

            assertEquals(size, out.size().toLong())
            finding(
                "Q1",
                "upload 19 MiB OK (${"%.2f".format(size / 1_048_576.0 / upSec)} MB/s), " +
                    "file_path=$path, download OK (${"%.2f".format(size / 1_048_576.0 / dlSec)} MB/s)",
            )
            gateway.deleteMessage(CHAT_ID, sent.messageId) // dọn dẹp
            Unit
        }

    @Test
    fun `Q2 file_id tai lai duoc (va kiem tra file_id cu neu co)`() =
        runBlocking {
            val sent =
                gateway.sendDocument(
                    CHAT_ID,
                    SyntheticChunkSource(128 * 1024),
                    "tgvault-live-q2.bin",
                    "#tgvault live q2",
                )
            val path = gateway.resolveFilePath(sent.fileId)
            val out = ByteArrayOutputStream()
            gateway.download(path, out, null) {}
            assertEquals(128 * 1024, out.size())
            finding("Q2a", "file_id vừa upload tải lại OK. fileId=${sent.fileId}")

            val knownFileId = System.getProperty("tgvault.knownFileId").orEmpty()
            if (knownFileId.isNotBlank()) {
                val oldPath = gateway.resolveFilePath(knownFileId)
                val oldOut = ByteArrayOutputStream()
                gateway.download(oldPath, oldOut, null) {}
                finding("Q2b", "file_id CŨ ($knownFileId) vẫn tải được, ${oldOut.size()} bytes")
            } else {
                finding(
                    "Q2b",
                    "CHƯA KIỂM TRA file_id xuyên ngày. Lưu fileId ở Q2a, chạy lại ngày mai với " +
                        "-Dtgvault.knownFileId=<fileId> (thêm systemProperty trong app/build.gradle.kts nếu cần)",
                )
            }
            gateway.deleteMessage(CHAT_ID, sent.messageId)
            Unit
        }

    @Test
    fun `Q3 deleteMessage tin moi va tin cu`() =
        runBlocking {
            val sent = gateway.sendText(CHAT_ID, "#tgvault live q3 - tin mới")
            val result = gateway.deleteMessage(CHAT_ID, sent.messageId)
            finding("Q3a", "deleteMessage tin vừa gửi: $result")
            assertTrue(result is DeleteResult.Deleted)

            val oldMessageId = System.getProperty("tgvault.oldMessageId")?.toLongOrNull()
            if (oldMessageId != null) {
                val oldResult = gateway.deleteMessage(CHAT_ID, oldMessageId)
                finding("Q3b", "deleteMessage tin >48h: $oldResult (Failed => cơ chế ORPHANED SPEC §10.4)")
            } else {
                val keep = gateway.sendText(CHAT_ID, "#tgvault live q3 - TIN ĐỂ LẠI, xoá thử sau 48h")
                finding(
                    "Q3b",
                    "CHƯA KIỂM TRA tin >48h. Đã gửi tin message_id=${keep.messageId}; " +
                        "chạy lại sau 48h với -Dtgvault.oldMessageId=${keep.messageId}",
                )
            }
            Unit
        }

    @Test
    fun `Q4 gui 30 chunk nho quan sat 429`() =
        runBlocking {
            val started = System.currentTimeMillis()
            var sent = 0
            var error: String? = null
            try {
                repeat(30) { i ->
                    gateway.sendDocument(
                        CHAT_ID,
                        SyntheticChunkSource(32 * 1024),
                        "tgvault-live-q4-$i.bin",
                        "#tgvault live q4 $i/30",
                    )
                    sent++
                }
            } catch (e: AppError) {
                error = e.message
            }
            val elapsedSec = (System.currentTimeMillis() - started) / 1000.0
            finding(
                "Q4",
                "gửi $sent/30 chunk 32 KiB trong ${"%.1f".format(elapsedSec)}s " +
                    "(limiter đã pace 1,1s/lệnh). Lỗi gặp: ${error ?: "không có — không thấy 429 trần"}",
            )
            Unit
        }

    @Test
    fun `Q5 pin va getChat pinned_message`() =
        runBlocking {
            val first = gateway.sendText(CHAT_ID, "TGVAULT_INDEX_V1\n{\"revision\":1,\"test\":\"q5-first\"}")
            gateway.pinMessage(CHAT_ID, first.messageId)
            val afterFirst = gateway.getChat(CHAT_ID)
            val firstPinned = afterFirst.pinnedMessageText
            assertNotNull(firstPinned)
            assertTrue(firstPinned.orEmpty().startsWith("TGVAULT_INDEX_V1"))

            val second = gateway.sendText(CHAT_ID, "TGVAULT_INDEX_V1\n{\"revision\":2,\"test\":\"q5-second\"}")
            gateway.pinMessage(CHAT_ID, second.messageId)
            val afterSecond = gateway.getChat(CHAT_ID)
            val secondPinned = afterSecond.pinnedMessageText
            val pinnedState =
                if (secondPinned?.contains("q5-second") == true) {
                    "tin MỚI NHẤT được ghim"
                } else {
                    "tin khác: $secondPinned"
                }
            finding(
                "Q5",
                "pinChatMessage OK; getChat().pinned_message sau khi ghim tin thứ 2 trả về: $pinnedState",
            )

            gateway.unpinMessage(CHAT_ID, second.messageId)
            gateway.deleteMessage(CHAT_ID, first.messageId)
            gateway.deleteMessage(CHAT_ID, second.messageId)
            Unit
        }

    @Test
    fun `Q6 header Range khi tai file`() =
        runBlocking {
            val sent =
                gateway.sendDocument(
                    CHAT_ID,
                    SyntheticChunkSource(64 * 1024),
                    "tgvault-live-q6.bin",
                    "#tgvault live q6",
                )
            val path = gateway.resolveFilePath(sent.fileId)
            val sink = ByteArrayOutputStream()
            try {
                gateway.download(path, sink, 0L..9L) {}
                val bytes = sink.toByteArray()
                val expected = ByteArray(10) { it.toByte() }
                val ok = bytes.contentEquals(expected)
                finding("Q6", "Range ĐƯỢC hỗ trợ (HTTP 206), 10 byte đầu ${if (ok) "khớp" else "LỆCH"} dữ liệu gốc")
                assertTrue(ok)
            } catch (e: AppError.RangeNotSupported) {
                finding("Q6", "Range KHÔNG được hỗ trợ (server trả 200) — engine tải lại chunk từ đầu")
            }
            gateway.deleteMessage(CHAT_ID, sent.messageId)
            Unit
        }

    companion object {
        private val RUN_LIVE = System.getProperty("tgvault.runLive") == "true"
        private val TOKEN = System.getProperty("tgvault.botToken").orEmpty()
        private val CHAT_ID = System.getProperty("tgvault.chatId")?.toLongOrNull() ?: 0L

        private lateinit var gateway: BotApiGateway

        @BeforeClass
        @JvmStatic
        fun setUpClass() {
            Assume.assumeTrue(
                "Bỏ qua live test: cần ./gradlew testDebugUnitTest -PrunTelegramLive=true " +
                    "và tgvault.botToken/tgvault.chatId trong local.properties",
                RUN_LIVE && TOKEN.isNotBlank() && CHAT_ID != 0L,
            )
            val json =
                Json {
                    ignoreUnknownKeys = true
                    explicitNulls = false
                }
            val client =
                OkHttpClient.Builder()
                    .connectTimeout(30, TimeUnit.SECONDS)
                    .writeTimeout(600, TimeUnit.SECONDS)
                    .readTimeout(600, TimeUnit.SECONDS)
                    .callTimeout(0, TimeUnit.SECONDS)
                    .build()
            val api =
                Retrofit.Builder()
                    .baseUrl(BotApiGateway.API_BASE_URL)
                    .client(client)
                    .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
                    .build()
                    .create(TelegramBotApi::class.java)
            gateway =
                BotApiGateway(
                    api = api,
                    okHttpClient = client,
                    json = json,
                    tokenProvider = BotTokenProvider { TOKEN },
                    rateLimiter = TelegramRateLimiter(TimeProvider { System.currentTimeMillis() }),
                )
        }
    }
}
