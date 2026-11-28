package com.tgvault.app.feature.trash

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tgvault.app.domain.model.Node
import com.tgvault.app.domain.repository.NodeRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

data class TrashUiState(
    val roots: List<Node> = emptyList(),
    val loading: Boolean = true,
)

/** M9-3: thùng rác — liệt kê nút gốc bị xoá, khôi phục / xoá vĩnh viễn. */
@HiltViewModel
class TrashViewModel
    @Inject
    constructor(
        private val nodeRepository: NodeRepository,
    ) : ViewModel() {
        private val _uiState = MutableStateFlow(TrashUiState())
        val uiState: StateFlow<TrashUiState> = _uiState.asStateFlow()

        init {
            viewModelScope.launch {
                nodeRepository.observeTrashRoots().collect { roots ->
                    _uiState.value = TrashUiState(roots = roots, loading = false)
                }
            }
        }

        fun restore(node: Node) {
            viewModelScope.launch {
                runCatching { nodeRepository.restoreFromTrash(node.id) }
                    .onFailure { Timber.w(it, "khôi phục ${node.id} thất bại") }
            }
        }

        fun deleteForever(node: Node) {
            viewModelScope.launch {
                runCatching { nodeRepository.deletePermanently(node.id) }
                    .onFailure { Timber.w(it, "xoá vĩnh viễn ${node.id} thất bại") }
            }
        }
    }
