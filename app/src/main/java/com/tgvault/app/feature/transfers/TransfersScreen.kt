package com.tgvault.app.feature.transfers

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.SwapVert
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.tgvault.app.R
import com.tgvault.app.core.designsystem.components.EmptyState

/** Màn hình Truyền tải — placeholder M0; bản đầy đủ ở M6 (FR-TR-2, FR-TR-5). */
@Composable
fun TransfersScreen() {
    EmptyState(
        icon = Icons.Rounded.SwapVert,
        title = stringResource(R.string.transfers_empty_title),
        message = stringResource(R.string.transfers_empty_message)
    )
}
