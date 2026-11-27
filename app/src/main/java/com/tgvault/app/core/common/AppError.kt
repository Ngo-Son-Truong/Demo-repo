package com.tgvault.app.core.common

/**
 * Lỗi domain toàn app — ánh xạ từ SPEC §9.2 và các lỗi engine (SPEC §10).
 * Message ở đây là "chi tiết kỹ thuật" (log/copy được), KHÔNG phải chuỗi UI;
 * tầng feature map AppError -> strings.xml (SPEC §15.1.3).
 */
sealed class AppError(message: String? = null, cause: Throwable? = null) : Exception(message, cause) {

    /** HTTP 401 — token sai/thu hồi */
    class InvalidToken(detail: String? = null) : AppError(detail)

    /** HTTP 403 / bot bị kick / thiếu quyền */
    class BotNoAccess(detail: String? = null) : AppError(detail)

    /** HTTP 400 "chat not found" */
    class ChannelNotFound(detail: String? = null) : AppError(detail)

    /** HTTP 400 "file is too big" — lỗi lập trình (chunk vượt giới hạn) */
    class ChunkTooLarge(detail: String? = null) : AppError(detail)

    /** HTTP 429 — toàn bộ hàng gửi tạm dừng retryAfterSeconds + 1s (SPEC §9.2/§9.3) */
    class RateLimited(val retryAfterSeconds: Long) : AppError("rate limited, retry after ${retryAfterSeconds}s")

    /** 5xx, timeout, mất mạng — retry exponential backoff (SPEC §9.2) */
    class Transient(detail: String? = null, cause: Throwable? = null) : AppError(detail ?: cause?.message, cause)

    /** Server bỏ qua header Range khi tải — engine tải lại chunk từ đầu (xem DECISIONS 2026-11-26) */
    class RangeNotSupported : AppError("server ignored Range header")

    /** SHA-256 lệch khi ghép tải về (FR-TR-6) */
    class IntegrityMismatch(val expected: String, val actual: String) :
        AppError("sha256 mismatch: expected=$expected actual=$actual")

    /** Tệp nguồn đổi kích thước/mtime giữa chừng upload (SPEC §10.2.5) */
    class SourceChanged : AppError("source file changed during upload")

    /** Chưa kết nối bot/channel (gateway chưa sẵn sàng) */
    class NotConnected(detail: String? = null) : AppError(detail)

    class Unknown(detail: String? = null, cause: Throwable? = null) : AppError(detail, cause)
}
