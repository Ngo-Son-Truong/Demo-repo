package com.tgvault.app.data.remote

import com.tgvault.app.core.common.AppError
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class RetryPolicyTest {
    @Test
    fun `backoff tang mu va chan tran 60s`() {
        val policy = RetryPolicy()
        assertEquals(1_000, policy.backoffDelayMs(1))
        assertEquals(2_000, policy.backoffDelayMs(2))
        assertEquals(4_000, policy.backoffDelayMs(3))
        assertEquals(8_000, policy.backoffDelayMs(4))
        assertEquals(60_000, policy.backoffDelayMs(8))
        assertEquals(60_000, policy.backoffDelayMs(100))
    }

    @Test
    fun `retry loi Transient den khi thanh cong`() =
        runTest {
            val policy = RetryPolicy()
            var attempts = 0
            val result =
                policy.execute {
                    attempts++
                    if (attempts < 3) throw AppError.Transient(detail = "flaky")
                    "ok"
                }
            assertEquals("ok", result)
            assertEquals(3, attempts)
        }

    @Test
    fun `bo cuoc sau maxAttempts`() =
        runTest {
            val policy = RetryPolicy(maxAttempts = 3)
            var attempts = 0
            var thrown: AppError.Transient? = null
            try {
                policy.execute<Unit> {
                    attempts++
                    throw AppError.Transient(detail = "down")
                }
            } catch (e: AppError.Transient) {
                thrown = e
            }
            assertNotNull(thrown)
            assertEquals(3, attempts)
        }

    @Test
    fun `khong retry loi khong phai Transient`() =
        runTest {
            val policy = RetryPolicy()
            var attempts = 0
            var thrown: AppError.InvalidToken? = null
            try {
                policy.execute<Unit> {
                    attempts++
                    throw AppError.InvalidToken("401")
                }
            } catch (e: AppError.InvalidToken) {
                thrown = e
            }
            assertNotNull(thrown)
            assertEquals(1, attempts)
        }
}
