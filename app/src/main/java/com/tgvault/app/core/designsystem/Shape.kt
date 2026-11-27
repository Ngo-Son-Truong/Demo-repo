package com.tgvault.app.core.designsystem

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/**
 * Hình dạng bo góc (SPEC §15.2):
 * 12 dp thẻ nhỏ · 16 dp thẻ · 28 dp bottom sheet/dialog/FAB lớn.
 */
val TgShapes = Shapes(
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(20.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

/** Lưới khoảng cách 4 dp (SPEC §15.2): 4/8/12/16/24/32 */
object Spacing {
    val x1 = 4.dp
    val x2 = 8.dp
    val x3 = 12.dp
    val x4 = 16.dp
    val x6 = 24.dp
    val x8 = 32.dp
}
