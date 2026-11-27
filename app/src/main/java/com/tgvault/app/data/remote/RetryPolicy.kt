package com.tgvault.app.data.remote

import com.tgvault.app.core.common.AppError
import kotlinx.coroutines.delay

/**
 * Chính sách retry cho lỗi Transient (SPEC §9.2), tách lớp riêng (PLAN M1-3):
 * backoff mũ 1s → 2s → 4s … tối đa 60s, tối đa 8 lần thử.
 * RateLimited KHÔNG retry ở lớp này (đã có TelegramRateLimiter pause + engine xử lý).
 */
class RetryPolicy(
    val maxAttempts: Int = 8,
    val baseDelayMs: Long = 1_000,
    val maxDelayMs: Long = 60_000,
) {

    /** Delay trước lần retry sau khi lần thử thứ [failedAttempt] (1-based) thất bại. */
    fun backoffDelayMs(failedAttempt: Int): Long {
        val shift = (failedAttempt - 1).coerceIn(0, 20)
        return minOf(baseDelayMs shl shift, maxDelayMs)
    }

    /** Chạy [block], retry khi gặp [AppError.Transient]. Lỗi khác ném thẳng ra ngoài. */
    suspend fun <T> execute(block: suspend (attempt: Int) -> T): T {
        var attempt = 1
        while (true) {
            try {
                return block(attempt)
            } catch (e: AppError.Transient) {
                if (attempt >= maxAttempts) throw e
                delay(backoffDelayMs(attempt))
                attempt++
            }
        }
    }
}
