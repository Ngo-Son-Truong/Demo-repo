package com.tgvault.app.feature.files

import android.net.Uri
import android.os.Environment
import android.provider.OpenableColumns
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tgvault.app.core.common.NameNormalizer
import com.tgvault.app.core.util.FileUtils
import com.tgvault.app.data.transfer.TransferScheduler
import com.tgvault.app.domain.model.Node
import com.tgvault.app.domain.model.NodeSort
import com.tgvault.app.domain.model.NodeSortField
import com.tgvault.app.domain.model.TransferState
import com.tgvault.app.domain.repository.NodeRepository
import com.tgvault.app.domain.repository.TransferRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

data class FilesUiState(
    val parentId: String? = null,
    val breadcrumbs: List<Node> = emptyList(),
    val sort: NodeSort = NodeSort(),
    val query: String = "",
    val searching: Boolean = false,
    val nodes: List<Node> = emptyList(),
    /** Khi đang tìm kiếm: nodeId → đường dẫn thư mục cha ("/a/b") — M9-4. */
    val searchPaths: Map<String, String> = emptyMap(),
    val error: String? = null,
)

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class FilesViewModel
    @Inject
    constructor(
        private val nodeRepository: NodeRepository,
        private val transferRepository: TransferRepository,
        private val transferScheduler: TransferScheduler,
    ) : ViewModel() {
        private val _uiState = MutableStateFlow(FilesUiState())

        /** StateFlow nguồn (breadcrumbs lồng vòng lặp DB) — uiState public là bản giàu node. */
        private val core = _uiState.asStateFlow()

        val uiState: StateFlow<FilesUiState> =
            combine(
                core,
                core.flatMapLatest { s ->
                    if (s.searching && s.query.isNotBlank()) {
                        nodeRepository.searchByName(NameNormalizer.normalize(s.query))
                    } else {
                        nodeRepository.observeChildren(s.parentId, s.sort)
                    }
                },
            ) { s, nodes -> s.copy(nodes = nodes) }
                .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), FilesUiState())

        /** Đường dẫn "/a/b" của các tổ tiên (không gồm chính node); kết quả chỉ có trong [byId] → chỉ hiện được phần trong kết quả. */
        private fun buildPathString(
            node: Node,
            byId: Map<String, Node>,
        ): String {
            val parts = mutableListOf<String>()
            var cur = node.parentId
            var guard = 0
            while (cur != null && guard < MAX_PATH_DEPTH) {
                val parent = byId[cur] ?: break
                parts.add(0, parent.name)
                cur = parent.parentId
                guard++
            }
            return if (parts.isEmpty()) "" else "/" + parts.joinToString("/")
        }

        fun openFolder(node: Node) {
            if (!node.isFolder) return
            _uiState.update {
                it.copy(parentId = node.id, breadcrumbs = it.breadcrumbs + node, error = null)
            }
        }

        /** Back: ra thư mục cha; trả true nếu đã xử lý (còn trong Files). */
        fun navigateUp(): Boolean {
            val s = _uiState.value
            return when {
                s.searching -> {
                    _uiState.update { it.copy(searching = false, query = "") }
                    true
                }
                s.breadcrumbs.isEmpty() -> false
                else -> {
                    val crumbs = s.breadcrumbs.dropLast(1)
                    _uiState.update { it.copy(parentId = crumbs.lastOrNull()?.id, breadcrumbs = crumbs) }
                    true
                }
            }
        }

        fun onQueryChange(value: String) {
            _uiState.update { it.copy(query = value, searching = value.isNotBlank()) }
        }

        fun setSort(
            field: NodeSortField,
            ascending: Boolean,
        ) {
            _uiState.update { it.copy(sort = NodeSort(field, ascending)) }
        }

        fun createFolder(name: String) {
            val parentId = _uiState.value.parentId
            viewModelScope.launch {
                runCatching { nodeRepository.createFolder(parentId, name) }
                    .onFailure { e ->
                        Timber.w(e, "createFolder lỗi")
                        _uiState.update { it.copy(error = e.message) }
                    }
            }
        }

        fun rename(
            node: Node,
            newName: String,
        ) {
            viewModelScope.launch {
                runCatching { nodeRepository.renameNode(node.id, newName) }
                    .onFailure { e ->
                        Timber.w(e, "rename lỗi")
                        _uiState.update { it.copy(error = e.message) }
                    }
            }
        }

        fun trash(node: Node) {
            viewModelScope.launch {
                runCatching { nodeRepository.trashNodes(listOf(node.id)) }
                    .onFailure { e ->
                        Timber.w(e, "trash lỗi")
                        _uiState.update { it.copy(error = e.message) }
                    }
            }
        }

        /** Upload URI được share/pick: staging nội bộ → Node(PENDING)+Transfer(QUEUED) → WorkManager. */
        fun uploadUris(
            uris: List<Uri>,
            resolver: android.content.ContentResolver,
            stagingDir: java.io.File,
        ) {
            val parentId = _uiState.value.parentId
            viewModelScope.launch {
                for (uri in uris) {
                    runCatching {
                        val name =
                            queryDisplayName(resolver, uri)
                                ?: "file-${System.currentTimeMillis()}"
                        val mime = resolver.getType(uri)
                        val staging = FileUtils.copyToPrivateStorage(uri, stagingDir, resolver)
                        val (_, transfer) =
                            nodeRepository.createPendingUpload(
                                parentId = parentId,
                                name = name,
                                mimeType = mime,
                                sizeBytes = staging.length(),
                                sourceUri = null,
                                stagingPath = staging.absolutePath,
                            )
                        transferScheduler.enqueue(transfer.id)
                    }.onFailure { e ->
                        Timber.w(e, "uploadUri lỗi: %s", uri)
                        _uiState.update { it.copy(error = e.message) }
                    }
                }
            }
        }

        /** Tải node về Downloads công khai (đích mặc định FR-FILE-4) rồi theo dõi qua WorkManager. */
        fun download(node: Node) {
            viewModelScope.launch {
                runCatching {
                    val transfer = transferRepository.createDownload(node.id, node.sizeBytes)
                    transferScheduler.enqueue(transfer.id)
                }.onFailure { e ->
                    Timber.w(e, "download lỗi")
                    _uiState.update { it.copy(error = e.message) }
                }
            }
        }

        /**
         * Tải node rồi CHỜ DONE; trả File trong Downloads public (share-out).
         * Huỷ bởi caller hủy coroutine; thất bại/hủy trả null.
         */
        suspend fun downloadAndAwait(node: Node): java.io.File? {
            val transfer = transferRepository.createDownload(node.id, node.sizeBytes)
            transferScheduler.enqueue(transfer.id)
            return kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                val done =
                    transferRepository.observeById(transfer.id)
                        .first { it?.state in setOf(TransferState.DONE, TransferState.FAILED, TransferState.CANCELLED) }
                if (done?.state != TransferState.DONE) return@withContext null
                val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                java.io.File(dir, node.name).takeIf { it.exists() }
            }
        }

        private fun queryDisplayName(
            resolver: android.content.ContentResolver,
            uri: Uri,
        ): String? =
            runCatching {
                resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                    if (c.moveToFirst()) c.getString(0) else null
                }
            }.getOrNull()
        private companion object {
            const val MAX_PATH_DEPTH = 20
        }
    }
