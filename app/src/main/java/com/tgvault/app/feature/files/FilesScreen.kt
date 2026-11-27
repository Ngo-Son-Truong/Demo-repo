package com.tgvault.app.feature.files

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.AudioFile
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.CloudUpload
import androidx.compose.material.icons.rounded.CreateNewFolder
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.InsertDriveFile
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.PictureAsPdf
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Slideshow
import androidx.compose.material.icons.rounded.Sort
import androidx.compose.material.icons.rounded.TableChart
import androidx.compose.material.icons.rounded.UploadFile
import androidx.compose.material.icons.rounded.VideoFile
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tgvault.app.R
import com.tgvault.app.core.designsystem.Spacing
import com.tgvault.app.core.designsystem.components.EmptyState
import com.tgvault.app.core.designsystem.components.TgTextField
import com.tgvault.app.core.util.FileUtils
import com.tgvault.app.domain.model.Node
import com.tgvault.app.domain.model.NodeSortField
import com.tgvault.app.domain.model.NodeStatus
import java.io.File

/**
 * Màn Tệp (SPEC §15.3 màn 3): breadcrumbs, list, sort, search, FAB Upload/Tạo thư mục,
 * trình đơn Đổi tên/Xoá. Trạng thái PENDING/UPLOADING hiển thị huy hiệu "Đang tải lên"
 * với chỉ báo bất định (FR-FILE-1).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FilesScreen(viewModel: FilesViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbar = remember { SnackbarHostState() }

    // Staging nội bộ cho upload (SPEC: stagingPath thay sourceUri với SAF)
    val stagingDir = remember { File(context.filesDir, "staging") }

    val pickLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
            if (!uris.isNullOrEmpty()) viewModel.uploadUris(uris, context.contentResolver, stagingDir)
        }

    // Nút back hệ thống: lên thư mục cha trước, hết cha mới thoát tab
    BackHandler(enabled = state.searching || state.breadcrumbs.isNotEmpty()) {
        viewModel.navigateUp()
    }

    LaunchedEffect(state.error) {
        state.error?.let { snackbar.showSnackbar(it) }
    }

    var showCreateFolder by remember { mutableStateOf(false) }
    var renameTarget by remember { mutableStateOf<Node?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    if (state.searching) {
                        TgTextField(
                            value = state.query,
                            onValueChange = viewModel::onQueryChange,
                            label = stringResource(R.string.files_search_hint),
                            modifier = Modifier.fillMaxWidth(),
                        )
                    } else {
                        Text(stringResource(R.string.tab_files))
                    }
                },
                navigationIcon = {
                    when {
                        state.searching ->
                            IconButton(onClick = { viewModel.onQueryChange("") }) {
                                Icon(Icons.Rounded.Close, contentDescription = null)
                            }
                        state.breadcrumbs.isNotEmpty() ->
                            IconButton(onClick = { viewModel.navigateUp() }) {
                                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = null)
                            }
                    }
                },
                actions = {
                    if (!state.searching) {
                        IconButton(onClick = { viewModel.onQueryChange(" ") }) {
                            Icon(Icons.Rounded.Search, contentDescription = null)
                        }
                        SortMenu(state.sort.field, state.sort.ascending, viewModel::setSort)
                    }
                },
            )
        },
        floatingActionButton = {
            Column(horizontalAlignment = Alignment.End) {
                ExtendedFloatingActionButton(
                    onClick = { showCreateFolder = true },
                    icon = { Icon(Icons.Rounded.CreateNewFolder, contentDescription = null) },
                    text = { Text(stringResource(R.string.files_new_folder)) },
                )
                Spacer(Modifier.size(Spacing.x3))
                ExtendedFloatingActionButton(
                    onClick = { pickLauncher.launch(arrayOf("*/*")) },
                    icon = { Icon(Icons.Rounded.UploadFile, contentDescription = null) },
                    text = { Text(stringResource(R.string.files_upload)) },
                )
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            if (state.breadcrumbs.isNotEmpty() && !state.searching) {
                Breadcrumbs(state.breadcrumbs) { index ->
                    // index -1 = gốc; i = lên tới crumbs[i] (lùi size-1-i lần)
                    val steps = if (index < 0) state.breadcrumbs.size else state.breadcrumbs.size - 1 - index
                    repeat(steps) { viewModel.navigateUp() }
                }
                HorizontalDivider()
            }
            if (state.nodes.isEmpty()) {
                EmptyState(
                    icon = Icons.Rounded.CloudUpload,
                    title = stringResource(R.string.files_empty_title),
                    message = stringResource(R.string.files_empty_message),
                    actionLabel = stringResource(R.string.files_upload),
                    onAction = { pickLauncher.launch(arrayOf("*/*")) },
                )
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(state.nodes, key = { it.id }) { node ->
                        NodeRow(
                            node = node,
                            onClick = { viewModel.openFolder(node) },
                            onRename = { renameTarget = node },
                            onTrash = { viewModel.trash(node) },
                        )
                        HorizontalDivider()
                    }
                }
            }
        }
    }

    if (showCreateFolder) {
        NameDialog(
            title = stringResource(R.string.files_new_folder),
            initial = "",
            onDismiss = { showCreateFolder = false },
            onConfirm = {
                viewModel.createFolder(it)
                showCreateFolder = false
            },
        )
    }
    renameTarget?.let { target ->
        NameDialog(
            title = stringResource(R.string.files_rename),
            initial = target.name,
            onDismiss = { renameTarget = null },
            onConfirm = {
                viewModel.rename(target, it)
                renameTarget = null
            },
        )
    }
}

@Composable
private fun Breadcrumbs(
    breadcrumbs: List<Node>,
    onCrumbClick: (Int) -> Unit,
) {
    LazyRow(modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.x4, vertical = Spacing.x2)) {
        item {
            AssistChip(
                onClick = { onCrumbClick(-1) },
                label = { Text(stringResource(R.string.files_root)) },
            )
        }
        items(breadcrumbs.size) { index ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(" / ", color = MaterialTheme.colorScheme.onSurfaceVariant)
                AssistChip(
                    onClick = { onCrumbClick(index) },
                    label = {
                        Text(
                            breadcrumbs[index].name,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    },
                )
            }
        }
    }
}

@Composable
private fun SortMenu(
    current: NodeSortField,
    ascending: Boolean,
    onSelect: (NodeSortField, Boolean) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { open = true }) {
            Icon(Icons.Rounded.Sort, contentDescription = null)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.files_sort_name)) },
                onClick = {
                    onSelect(NodeSortField.NAME, if (current == NodeSortField.NAME) !ascending else true)
                    open = false
                },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.files_sort_date)) },
                onClick = {
                    onSelect(NodeSortField.DATE, false)
                    open = false
                },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.files_sort_size)) },
                onClick = {
                    onSelect(NodeSortField.SIZE, false)
                    open = false
                },
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun NodeRow(
    node: Node,
    onClick: () -> Unit,
    onRename: () -> Unit,
    onTrash: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    ListItem(
        headlineContent = {
            Text(node.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
        },
        supportingContent = {
            if (node.isFolder) {
                Text(stringResource(R.string.files_folder))
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(FileUtils.formatBytes(node.sizeBytes))
                    if (node.status == NodeStatus.PENDING || node.status == NodeStatus.UPLOADING) {
                        Spacer(Modifier.width(Spacing.x2))
                        Text(
                            stringResource(R.string.files_uploading),
                            color = MaterialTheme.colorScheme.primary,
                            style = MaterialTheme.typography.labelSmall,
                        )
                    }
                }
            }
        },
        leadingContent = {
            Icon(iconFor(node), contentDescription = null)
        },
        trailingContent = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (!node.isFolder && (node.status == NodeStatus.PENDING || node.status == NodeStatus.UPLOADING)) {
                    LinearProgressIndicator(modifier = Modifier.width(Spacing.x8))
                }
                Box {
                    IconButton(onClick = { menuOpen = true }) {
                        Icon(Icons.Rounded.MoreVert, contentDescription = null)
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.files_rename)) },
                            onClick = {
                                menuOpen = false
                                onRename()
                            },
                        )
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.files_trash)) },
                            onClick = {
                                menuOpen = false
                                onTrash()
                            },
                        )
                    }
                }
            }
        },
        modifier =
            Modifier.combinedClickable(
                onClick = onClick,
                onLongClick = { menuOpen = true },
            ),
    )
}

private fun iconFor(node: Node): ImageVector =
    if (node.isFolder) {
        Icons.Rounded.Folder
    } else {
        when (FileUtils.mimeKind(node.mimeType)) {
            FileUtils.MimeKind.IMAGE -> Icons.Rounded.Image
            FileUtils.MimeKind.VIDEO -> Icons.Rounded.VideoFile
            FileUtils.MimeKind.AUDIO -> Icons.Rounded.AudioFile
            FileUtils.MimeKind.PDF -> Icons.Rounded.PictureAsPdf
            FileUtils.MimeKind.SHEET -> Icons.Rounded.TableChart
            FileUtils.MimeKind.SLIDE -> Icons.Rounded.Slideshow
            FileUtils.MimeKind.DOC, FileUtils.MimeKind.TEXT -> Icons.Rounded.Description
            else -> Icons.Rounded.InsertDriveFile
        }
    }

@Composable
private fun NameDialog(
    title: String,
    initial: String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var value by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            TgTextField(
                value = value,
                onValueChange = { value = it },
                label = stringResource(R.string.files_name_label),
            )
        },
        confirmButton = {
            TextButton(
                onClick = { if (value.isNotBlank()) onConfirm(value.trim()) },
                enabled = value.isNotBlank(),
            ) {
                Text(stringResource(R.string.action_ok))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) }
        },
    )
}
