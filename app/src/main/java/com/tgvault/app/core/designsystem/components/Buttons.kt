package com.tgvault.app.core.designsystem.components

import androidx.compose.foundation.layout.RowScope
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/** Nút chính (M0-4). Slot content để truyền Text/Icon — không hard-code chuỗi. */
@Composable
fun TgPrimaryButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    content: @Composable RowScope.() -> Unit
) {
    Button(onClick = onClick, modifier = modifier, enabled = enabled, content = content)
}

@Composable
fun TgSecondaryButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    content: @Composable RowScope.() -> Unit
) {
    OutlinedButton(onClick = onClick, modifier = modifier, enabled = enabled, content = content)
}
