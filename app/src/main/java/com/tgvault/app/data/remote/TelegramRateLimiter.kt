package com.tgvault.app.data.remote

import com.tgvault.app.core.common.AppError
import com.tgvault.app.core.common.TimeProvider
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.ArrayDeque
import java.util.concurrent.ConcurrentHashMap

/**
 * Rate limiter cho lệnh gửi/pin/xoá (SPEC §9.3), theo từng chatId:
 * - khoảng cách tối thiểu 1,1 s giữa hai lệnh gửi
 * - cửa sổ trượt 18 lệnh / 60 s (bảo thủ — giới hạn channel thực tế cần test live, TELEGRAM_FINDINGS câu 4)
 * - nhận 429: pauseUntil = now + retry_after + 1s; nhân đôi khoảng cách tối thiểu (tối đa 5 s),
 *   giảm dần về mặc định khi thành công liên tiếp.
 *
 * Download (getFile, tải file) KHÔNG đi qua hàng đợi này.
 * Test bằng đồng hồ ảo: inject [TimeProvider] đọc TestScope.currentTime (PLAN M1-4).
 */
class TelegramRateLimiter(
    private val timeProvider: TimeProvider,
    private val config: Config = Config(),
) {
    data class Config(
        val minIntervalMs: Long = 1_100,
        val maxIntervalMs: Long = 5_000,
        val windowSizeMs: Long = 60_000,
        val windowMaxCalls: Int = 18,
        val rateLimitExtraDelayMs: Long = 1_000,
        /** Số lần thành công liên tiếp trước khi nới nhịp gửi về gần mặc định */
        val successStreakToRelax: Int = 5,
    )

    private inner class ChatState {
        val mutex = Mutex()

        // MIN_VALUE = chưa gửi lệnh nào (tránh chờ oan ở lệnh đầu tiên, kể cả với đồng hồ ảo bắt đầu từ 0)
        var lastCallAt = Long.MIN_VALUE
        var pauseUntil = 0L
        var currentIntervalMs = config.minIntervalMs
        var consecutiveSuccesses = 0
        val window = ArrayDeque<Long>()
    }

    private val states = ConcurrentHashMap<Long, ChatState>()

    /**
     * Chạy [block] (MỘT lệnh gửi) sau khi chờ đủ nhịp. Giữ mutex trong suốt lệnh gọi
     * nên các lệnh gửi cùng chatId luôn nối tiếp nhau (SPEC §9.3: hàng đợi dùng chung).
     */
    suspend fun <T> withPermit(
        chatId: Long,
        block: suspend () -> T,
    ): T {
        val state = states.getOrPut(chatId) { ChatState() }
        return state.mutex.withLock {
            awaitTurn(state)
            try {
                val result = block()
                onSuccess(state)
                result
            } catch (e: AppError.RateLimited) {
                onRateLimited(state, e.retryAfterSeconds)
                throw e
            }
        }
    }

    private suspend fun awaitTurn(state: ChatState) {
        while (true) {
            val now = timeProvider.nowMillis()
            val windowStart = now - config.windowSizeMs
            while (!state.window.isEmpty() && state.window.first() <= windowStart) {
                state.window.removeFirst()
            }

            // lastCallAt = MIN_VALUE nghĩa là chưa gửi lệnh nào — phải loại ra khỏi
            // phép cộng, nếu không MIN_VALUE + interval - now tràn sang số dương khổng lồ
            val sinceLastCall =
                if (state.lastCallAt == Long.MIN_VALUE) 0L else state.lastCallAt + state.currentIntervalMs - now
            var waitMs =
                maxOf(
                    state.pauseUntil - now,
                    sinceLastCall,
                    0L,
                )
            if (state.window.size >= config.windowMaxCalls) {
                val oldest = state.window.first()
                waitMs = maxOf(waitMs, oldest + config.windowSizeMs - now + 1)
            }
            if (waitMs <= 0L) break
            delay(waitMs)
        }
        state.lastCallAt = timeProvider.nowMillis()
        state.window.addLast(state.lastCallAt)
    }

    private fun onSuccess(state: ChatState) {
        state.consecutiveSuccesses++
        if (state.consecutiveSuccesses >= config.successStreakToRelax &&
            state.currentIntervalMs > config.minIntervalMs
        ) {
            state.currentIntervalMs = maxOf(config.minIntervalMs, state.currentIntervalMs * 9 / 10)
        }
    }

    private fun onRateLimited(
        state: ChatState,
        retryAfterSeconds: Long,
    ) {
        val now = timeProvider.nowMillis()
        state.pauseUntil = now + retryAfterSeconds * 1_000 + config.rateLimitExtraDelayMs
        state.currentIntervalMs =
            minOf(config.maxIntervalMs, maxOf(config.minIntervalMs, state.currentIntervalMs * 2))
        state.consecutiveSuccesses = 0
    }

    // --- API phục vụ test ---

    internal fun currentIntervalFor(chatId: Long): Long = states[chatId]?.currentIntervalMs ?: config.minIntervalMs

    internal fun pauseUntilFor(chatId: Long): Long = states[chatId]?.pauseUntil ?: 0L
}
