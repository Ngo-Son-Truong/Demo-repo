package com.tgvault.app.data.remote

import com.tgvault.app.core.common.AppError
import com.tgvault.app.core.common.TimeProvider
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Test rate limiter bằng đồng hồ ảo (PLAN M1-4): TimeProvider đọc testScheduler.currentTime,
 * delay() trong limiter chạy trên cùng ảo thời gian đó.
 */
class TelegramRateLimiterTest {

    private fun runTestWithLimiter(
        config: TelegramRateLimiter.Config = TelegramRateLimiter.Config(),
        block: suspend kotlinx.coroutines.test.TestScope.(TelegramRateLimiter) -> Unit
    ) = runTest {
        val limiter = TelegramRateLimiter(TimeProvider { testScheduler.currentTime }, config)
        block(limiter)
    }

    @Test
    fun `hai lenh gui cach nhau toi thieu 1,1 giay`() = runTestWithLimiter { limiter ->
        limiter.withPermit(CHAT) { }
        assertEquals(0, testScheduler.currentTime)

        limiter.withPermit(CHAT) { }
        assertEquals(1_100, testScheduler.currentTime)

        limiter.withPermit(CHAT) { }
        assertEquals(2_200, testScheduler.currentTime)
    }

    @Test
    fun `chat khac nhau co hang doi rieng`() = runTestWithLimiter { limiter ->
        limiter.withPermit(CHAT) { }
        limiter.withPermit(CHAT + 1) { }
        assertEquals(0, testScheduler.currentTime)
    }

    @Test
    fun `cua so truot 18 lenh moi 60 giay`() = runTestWithLimiter(
        TelegramRateLimiter.Config(minIntervalMs = 0)
    ) { limiter ->
        repeat(18) { limiter.withPermit(CHAT) { } }
        assertEquals(0, testScheduler.currentTime)

        limiter.withPermit(CHAT) { }
        assertTrue(
            "lệnh thứ 19 phải chờ cửa sổ 60s, currentTime=${testScheduler.currentTime}",
            testScheduler.currentTime >= 60_000
        )
    }

    @Test
    fun `429 dat pauseUntil va nhan doi khoang cach toi thieu`() = runTestWithLimiter { limiter ->
        var calls = 0
        var thrown: AppError.RateLimited? = null
        try {
            limiter.withPermit(CHAT) {
                calls++
                if (calls == 1) throw AppError.RateLimited(5)
            }
        } catch (e: AppError.RateLimited) {
            thrown = e
        }
        assertEquals(1, calls)
        assertTrue(thrown != null)
        assertEquals(6_000, limiter.pauseUntilFor(CHAT)) // retry_after 5s + 1s
        assertEquals(2_200, limiter.currentIntervalFor(CHAT)) // 1,1s x 2

        // lệnh tiếp theo chờ đến hết pauseUntil
        limiter.withPermit(CHAT) { }
        assertEquals(6_000, testScheduler.currentTime)
    }

    @Test
    fun `nhi nhip gui ve mac dinh sau chuoi thanh cong`() = runTestWithLimiter { limiter ->
        // gây 429 để interval lên 2200
        var calls = 0
        try {
            limiter.withPermit(CHAT) {
                calls++
                if (calls == 1) throw AppError.RateLimited(0)
            }
        } catch (e: AppError.RateLimited) {
            // mong đợi
        }
        assertEquals(2_200, limiter.currentIntervalFor(CHAT))

        repeat(5) { limiter.withPermit(CHAT) { } }
        assertTrue(limiter.currentIntervalFor(CHAT) < 2_200)
        assertTrue(limiter.currentIntervalFor(CHAT) >= 1_100)
    }

    private companion object {
        const val CHAT = -1001234567890L
    }
}
