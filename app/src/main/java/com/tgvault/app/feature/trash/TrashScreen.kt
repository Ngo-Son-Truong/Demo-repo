package com.tgvault.app.feature.trash

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.InsertDriveFile
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tgvault.app.R
import com.tgvault.app.core.designsystem.Spacing
import com.tgvault.app.core.designsystem.components.TgSecondaryButton
import com.tgvault.app.core.util.FileUtils
import com.tgvault.app.domain.model.Node
import java.text.DateFormat
import java.util.Date

/** M9-3: màn thùng rác — liệt kê, khôi phục, xoá vĩnh viễn (confirm), banner 30 ngày. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TrashScreen(viewModel: TrashViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var deleteTarget by remember { mutableStateOf<Node?>(null) }

    Scaffold(
        topBar = { TopAppBar(title = { Text(stringResource(R.string.trash_title)) }) },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            Card(
                modifier = Modifier.fillMaxWidth().padding(Spacing.x4),
                colors =
                    CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                    ),
            ) {
                Text(
                    stringResource(R.string.trash_banner),
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(Spacing.x3),
                )
            }
            if (state.roots.isEmpty() && !state.loading) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        stringResource(R.string.trash_empty),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                LazyColumn(Modifier.fillMaxSize()) {
                    items(state.roots, key = { it.id }) { node ->
                        TrashRow(
                            node = node,
                            onRestore = { viewModel.restore(node) },
                            onDeleteForever = { deleteTarget = node },
                        )
                    }
                }
            }
        }
    }

    deleteTarget?.let { target ->
        AlertDialog(
            onDismissRequest = { deleteTarget = null },
            title = { Text(stringResource(R.string.trash_delete_confirm_title)) },
            text = { Text(stringResource(R.string.trash_delete_confirm_body)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.deleteForever(target)
                        deleteTarget = null
                    },
                ) {
                    Text(stringResource(R.string.trash_delete_forever))
                }
            },
            dismissButton = {
                TextButton(onClick = { deleteTarget = null }) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }
}

@Composable
private fun TrashRow(
    node: Node,
    onRestore: () -> Unit,
    onDeleteForever: () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.x4, vertical = Spacing.x2),
    ) {
        Icon(
            if (node.isFolder) Icons.Rounded.Folder else Icons.Rounded.InsertDriveFile,
            contentDescription = null,
        )
        Column(Modifier.weight(1f).padding(start = Spacing.x3)) {
            Text(node.name, style = MaterialTheme.typography.bodyLarge, maxLines = 1)
            val sub =
                buildString {
                    if (!node.isFolder) append(FileUtils.formatBytes(node.sizeBytes)).append(" · ")
                    node.trashedAt?.let {
                        append(DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(it)))
                    }
                }
            Text(
                sub,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        TgSecondaryButton(onClick = onRestore) {
            Text(stringResource(R.string.trash_restore))
        }
        TextButton(onClick = onDeleteForever) {
            Text(
                stringResource(R.string.trash_delete_forever),
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}
