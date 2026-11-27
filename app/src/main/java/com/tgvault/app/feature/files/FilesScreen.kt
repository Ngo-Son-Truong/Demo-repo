package com.tgvault.app.feature.files

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CloudUpload
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.tgvault.app.R
import com.tgvault.app.core.designsystem.components.EmptyState

/** Màn hình Tệp — placeholder M0; bản đầy đủ ở M5 (FR-FILE-*). */
@Composable
fun FilesScreen() {
    EmptyState(
        icon = Icons.Rounded.CloudUpload,
        title = stringResource(R.string.files_empty_title),
        message = stringResource(R.string.files_empty_message)
    )
}
