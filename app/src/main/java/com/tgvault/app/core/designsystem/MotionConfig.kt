package com.tgvault.app.core.designsystem

/**
 * Cấu hình motion thuần Kotlin — test được trên JVM (PLAN M0 Acceptance).
 * SPEC §15.4: thời lượng 150–350 ms; khi hệ thống bật "giảm chuyển động"
 * (ANIMATOR_DURATION_SCALE == 0) thì mọi thời lượng về 0 (= chuyển đổi tức thì/snap()).
 */
data class MotionConfig(val reduceMotion: Boolean) {
    /** Thời lượng thực tế của một animation có thời lượng chuẩn [base] ms. */
    fun durationMs(base: Int): Int = if (reduceMotion) 0 else base

    /** Khoảng trễ stagger giữa các mục (speed-dial 40 ms, checklist 120 ms). */
    fun staggerMs(base: Int): Int = if (reduceMotion) 0 else base

    companion object {
        const val DURATION_SHORT = 200
        const val DURATION_MEDIUM = 300
        const val DURATION_NAV = 275

        const val STAGGER_SPEED_DIAL = 40
        const val STAGGER_CHECKLIST = 120

        const val SHIMMER_PERIOD = 1200
        const val BREATHING_PERIOD = 1200

        const val SELECT_SCALE = 0.96f
    }
}
