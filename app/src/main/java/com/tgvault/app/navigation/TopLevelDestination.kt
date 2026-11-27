package com.tgvault.app.navigation

import androidx.annotation.StringRes
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.SwapVert
import androidx.compose.ui.graphics.vector.ImageVector
import com.tgvault.app.R

/** 3 tab chính (SPEC §15.3): Tệp · Truyền tải · Cài đặt. */
enum class TopLevelDestination(
    val route: String,
    @StringRes val labelRes: Int,
    val icon: ImageVector,
) {
    FILES("files", R.string.tab_files, Icons.Rounded.Folder),
    TRANSFERS("transfers", R.string.tab_transfers, Icons.Rounded.SwapVert),
    SETTINGS("settings", R.string.tab_settings, Icons.Rounded.Settings),
}
