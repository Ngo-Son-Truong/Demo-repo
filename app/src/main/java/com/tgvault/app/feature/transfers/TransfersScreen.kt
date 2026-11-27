package com.tgvault.app.feature.transfers

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Cancel
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.CloudDownload
import androidx.compose.material.icons.rounded.CloudUpload
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.SwapVert
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tgvault.app.R
import com.tgvault.app.core.designsystem.Spacing
import com.tgvault.app.core.designsystem.components.EmptyState
import com.tgvault.app.core.util.FileUtils
import com.tgvault.app.domain.model.TransferDirection
import com.tgvault.app.domain.model.TransferState

/** Màn Truyền tải (SPEC §15.3 màn 4): hàng đợi với pause/resume/cancel/retry (FR-TR-2). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TransfersScreen(viewModel: TransfersViewModel = hiltViewModel()) {
    val items by viewModel.items.collectAsStateWithLifecycle()

    Scaffold(
        topBar = { TopAppBar(title = { Text(stringResource(R.string.tab_transfers)) }) },
    ) { padding ->
        if (items.isEmpty()) {
            Box(Modifier.padding(padding)) {
                EmptyState(
                    icon = Icons.Rounded.SwapVert,
                    title = stringResource(R.string.transfers_empty_title),
                    message = stringResource(R.string.transfers_empty_message),
                )
            }
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize().padding(padding)) {
                items(items, key = { it.transfer.id }) { item ->
                    TransferRow(item, viewModel)
                }
            }
        }
    }
}

@Composable
private fun TransferRow(
    item: TransferUiItem,
    viewModel: TransfersViewModel,
) {
    val t = item.transfer
    val progress =
        if (t.bytesTotal > 0) {
            (t.bytesDone.toFloat() / t.bytesTotal).coerceIn(0f, 1f)
        } else {
            0f
        }
    ListItem(
        leadingContent = {
            Icon(
                if (t.direction == TransferDirection.UPLOAD) {
                    Icons.Rounded.CloudUpload
                } else {
                    Icons.Rounded.CloudDownload
                },
                contentDescription = null,
            )
        },
        headlineContent = {
            Text(item.nodeName, maxLines = 1, overflow = TextOverflow.Ellipsis)
        },
        supportingContent = {
            Column {
                LinearProgressIndicator(
                    progress = { progress },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.size(Spacing.x1))
                Row {
                    Text(
                        "${FileUtils.formatBytes(t.bytesDone)} / ${FileUtils.formatBytes(t.bytesTotal)}",
                        style = MaterialTheme.typography.labelSmall,
                    )
                    Spacer(Modifier.width(Spacing.x2))
                    Text(
                        stateLabel(t.state),
                        style = MaterialTheme.typography.labelSmall,
                        color = stateColor(t.state),
                    )
                }
            }
        },
        trailingContent = {
            Row {
                when (t.state) {
                    TransferState.RUNNING ->
                        IconButton(onClick = { viewModel.pause(t.id) }) {
                            Icon(Icons.Rounded.Pause, contentDescription = stringResource(R.string.tr_pause))
                        }
                    TransferState.QUEUED ->
                        IconButton(onClick = { viewModel.cancel(t.id) }) {
                            Icon(Icons.Rounded.Close, contentDescription = stringResource(R.string.tr_cancel))
                        }
                    TransferState.PAUSED -> {
                        IconButton(onClick = { viewModel.resume(t.id) }) {
                            Icon(Icons.Rounded.PlayArrow, contentDescription = stringResource(R.string.tr_resume))
                        }
                        IconButton(onClick = { viewModel.cancel(t.id) }) {
                            Icon(Icons.Rounded.Cancel, contentDescription = stringResource(R.string.tr_cancel))
                        }
                    }
                    TransferState.FAILED, TransferState.CANCELLED ->
                        IconButton(onClick = { viewModel.retry(t.id) }) {
                            Icon(Icons.Rounded.Refresh, contentDescription = stringResource(R.string.tr_retry))
                        }
                    TransferState.DONE -> Unit
                }
            }
        },
    )
}

@Composable
private fun stateLabel(state: TransferState): String =
    when (state) {
        TransferState.QUEUED -> stringResource(R.string.tr_state_queued)
        TransferState.RUNNING -> stringResource(R.string.tr_state_running)
        TransferState.PAUSED -> stringResource(R.string.tr_state_paused)
        TransferState.FAILED -> stringResource(R.string.tr_state_failed)
        TransferState.DONE -> stringResource(R.string.tr_state_done)
        TransferState.CANCELLED -> stringResource(R.string.tr_state_cancelled)
    }

@Composable
private fun stateColor(state: TransferState) =
    when (state) {
        TransferState.FAILED -> MaterialTheme.colorScheme.error
        TransferState.DONE -> MaterialTheme.colorScheme.primary
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
