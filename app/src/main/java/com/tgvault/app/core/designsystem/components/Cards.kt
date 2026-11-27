package com.tgvault.app.core.designsystem.components

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/** Thẻ chuẩn (bo góc 16 dp — SPEC §15.2). */
@Composable
fun TgCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    if (onClick != null) {
        Card(onClick = onClick, modifier = modifier, shape = MaterialTheme.shapes.medium, content = content)
    } else {
        Card(modifier = modifier, shape = MaterialTheme.shapes.medium, content = content)
    }
}
