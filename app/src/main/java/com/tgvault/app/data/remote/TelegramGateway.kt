package com.tgvault.app.data.remote

import com.tgvault.app.domain.model.ChunkSource
import kotlinx.coroutines.flow.Flow
import java.io.OutputStream

/** Thông tin bot (từ getMe). */
data class BotInfo(val id: Long, val username: String, val firstName: String)

/** Channel phát hiện được qua getUpdates (FR-ONB-2). */
data class ChannelCandidate(val chatId: Long, val title: String?, val username: String?)

data class ChatInfo(
    val chatId: Long,
    val title: String?,
    val username: String?,
    /** Nội dung tin ghim mới nhất (manifest index — SPEC §11) */
    val pinnedMessageText: String?,
)

/** Quyền cần của bot trong channel (FR-ONB-3). */
data class BotRights(val canPost: Boolean, val canDelete: Boolean, val canPin: Boolean) {
    val hasAll: Boolean get() = canPost && canDelete && canPin
}

data class SentDocument(val messageId: Long, val fileId: String, val fileUniqueId: String?)

data class SentMessage(val messageId: Long)

/** Kết quả deleteMessage (SPEC §10.4). */
sealed interface DeleteResult {
    data object Deleted : DeleteResult

    /** "message to delete not found" — coi như đã xoá */
    data object AlreadyGone : DeleteResult

    /** Telegram từ chối (ví dụ tin quá cũ) → ghi OrphanChunkEntity */
    data class Failed(val reason: String?) : DeleteResult
}

/** Cung cấp bot token cho gateway. Impl an toàn (Tink AEAD + Keystore) ở M4 — FR-SEC-3. */
fun interface BotTokenProvider {
    suspend fun token(): String
}

/**
 * Toàn bộ truy cập Telegram Bot API đi qua interface này (SPEC §9.1, D3).
 * Implementation: [BotApiGateway] (Bot API công cộng); backlog: Local Bot API server / TDLib.
 */
interface TelegramGateway {
    suspend fun getMe(): BotInfo

    /** Long polling getUpdates (deleteWebhook trước) để phát hiện channel. Huỷ bằng cancel Flow. */
    fun watchForChannel(): Flow<ChannelCandidate>

    /** getChat — gồm pinnedMessageText. */
    suspend fun getChat(chatId: Long): ChatInfo

    /** getChatMember của chính bot → quyền Post/Delete/Pin. */
    suspend fun getBotRights(chatId: Long): BotRights

    /**
     * sendDocument multipart STREAMING từ [part] (tối đa 19 MiB), có báo tiến độ byte.
     * Luôn gửi disable_notification=true.
     */
    suspend fun sendDocument(
        chatId: Long,
        part: ChunkSource,
        fileName: String,
        caption: String?,
        onProgress: (bytesWritten: Long) -> Unit = {},
    ): SentDocument

    suspend fun sendText(
        chatId: Long,
        text: String,
    ): SentMessage

    suspend fun pinMessage(
        chatId: Long,
        messageId: Long,
    )

    suspend fun unpinMessage(
        chatId: Long,
        messageId: Long,
    )

    /** getFile → file_path (hết hạn ~1 giờ — gọi ngay trước khi tải từng chunk, SPEC §5). */
    suspend fun resolveFilePath(fileId: String): String

    /**
     * Tải file STREAMING ra [sink]. [range] != null → gửi header Range;
     * nếu server trả 200 thay vì 206 → ném AppError.RangeNotSupported TRƯỚC khi ghi byte nào
     * (xem DECISIONS 2026-11-26).
     */
    suspend fun download(
        filePath: String,
        sink: OutputStream,
        range: LongRange?,
        onProgress: (bytesWritten: Long) -> Unit = {},
    )

    suspend fun deleteMessage(
        chatId: Long,
        messageId: Long,
    ): DeleteResult
}
