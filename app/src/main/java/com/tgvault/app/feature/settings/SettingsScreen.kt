package com.tgvault.app.feature.settings

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.tgvault.app.R
import com.tgvault.app.core.designsystem.components.EmptyState

/** Màn hình Cài đặt — placeholder M0; bản đầy đủ theo FR-SET-* ở các milestone sau. */
@Composable
fun SettingsScreen() {
    EmptyState(
        icon = Icons.Rounded.Settings,
        title = stringResource(R.string.settings_placeholder_title),
        message = stringResource(R.string.settings_placeholder_message),
    )
}
