package com.tgvault.app.core.designsystem

import org.junit.Assert.assertEquals
import org.junit.Test

/** Test thử cho M0 (PLAN M0 Acceptance) + quy tắc giảm chuyển động (SPEC §15.4). */
class MotionConfigTest {

    @Test
    fun `thời lượng giữ nguyên khi không giảm chuyển động`() {
        val config = MotionConfig(reduceMotion = false)
        assertEquals(300, config.durationMs(300))
        assertEquals(40, config.staggerMs(40))
    }

    @Test
    fun `thời lượng về 0 khi giảm chuyển động`() {
        val config = MotionConfig(reduceMotion = true)
        assertEquals(0, config.durationMs(300))
        assertEquals(0, config.staggerMs(120))
    }

    @Test
    fun `thời lượng chuẩn nằm trong khoảng SPEC cho phép (150-350 ms)`() {
        assert(MotionConfig.DURATION_SHORT in 150..350)
        assert(MotionConfig.DURATION_MEDIUM in 150..350)
        assert(MotionConfig.DURATION_NAV in 150..350)
    }
}
