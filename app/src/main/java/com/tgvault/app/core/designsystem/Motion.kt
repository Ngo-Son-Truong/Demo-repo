package com.tgvault.app.core.designsystem

import android.provider.Settings
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.EmphasizedDecelerateEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.TweenSpec
import androidx.compose.animation.core.spring
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalContext

/**
 * Cờ "giảm chuyển động" toàn app (SPEC §15.4). Đọc từ Settings.Global.ANIMATOR_DURATION_SCALE.
 * Được provide ở [TgVaultTheme]; mọi animation PHẢI đi qua [MotionSpecs] + [MotionConfig].
 */
val LocalReduceMotion = staticCompositionLocalOf { false }

@Composable
fun rememberReduceMotion(): Boolean {
    val context = LocalContext.current
    return remember {
        Settings.Global.getFloat(
            context.contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
            1f,
        ) == 0f
    }
}

@Composable
fun currentMotionConfig(): MotionConfig = MotionConfig(LocalReduceMotion.current)

/**
 * Spec animation dùng chung (SPEC §15.4 bảng animation).
 * Khi reduceMotion bật: tween về 0 ms, spring giữ nguyên (spring tự kết thúc nhanh,
 * không gây chuyển động dư thừa khi duration = 0 được ưu tiên dùng).
 */
object MotionSpecs {
    val emphasizedDecelerate = EmphasizedDecelerateEasing

    fun <T> tween(
        config: MotionConfig,
        durationMs: Int,
        delayMs: Int = 0,
    ): TweenSpec<T> =
        androidx.compose.animation.core.tween(
            durationMillis = config.durationMs(durationMs),
            delayMillis = delayMs,
            easing = emphasizedDecelerate,
        )

    /** Spring mềm (FAB mở rộng/thu gọn: dampingRatio 0.8, stiffness Medium — SPEC §15.4). */
    fun <T> spring(config: MotionConfig) =
        spring<T>(
            dampingRatio = if (config.reduceMotion) Spring.DampingRatioNoBouncy else 0.8f,
            stiffness = Spring.StiffnessMedium,
        )

    fun fadeIn(
        config: MotionConfig,
        durationMs: Int = MotionConfig.DURATION_MEDIUM,
    ): EnterTransition = androidx.compose.animation.fadeIn(animationSpec = tween(config, durationMs))

    fun fadeOut(
        config: MotionConfig,
        durationMs: Int = MotionConfig.DURATION_MEDIUM,
    ): ExitTransition = androidx.compose.animation.fadeOut(animationSpec = tween(config, durationMs))
}
