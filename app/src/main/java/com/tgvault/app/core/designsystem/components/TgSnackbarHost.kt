package com.tgvault.app.core.designsystem.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/** Snackbar host chuẩn (M0-4) — bo góc theo shape small (12 dp). */
@Composable
fun TgSnackbarHost(
    hostState: SnackbarHostState,
    modifier: Modifier = Modifier
) {
    SnackbarHost(hostState = hostState, modifier = modifier) { data ->
        Snackbar(snackbarData = data, shape = MaterialTheme.shapes.small)
    }
}
