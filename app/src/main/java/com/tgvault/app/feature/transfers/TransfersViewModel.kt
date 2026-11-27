package com.tgvault.app.feature.transfers

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tgvault.app.data.transfer.TransferScheduler
import com.tgvault.app.domain.model.Transfer
import com.tgvault.app.domain.repository.NodeRepository
import com.tgvault.app.domain.repository.TransferRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/** Transfer + tên node (để hiển thị thay vì id). */
data class TransferUiItem(
    val transfer: Transfer,
    val nodeName: String,
)

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class TransfersViewModel
    @Inject
    constructor(
        private val transferRepository: TransferRepository,
        private val nodeRepository: NodeRepository,
        private val transferScheduler: TransferScheduler,
    ) : ViewModel() {
        val items: StateFlow<List<TransferUiItem>> =
            transferRepository.observeAll()
                .combine(kotlinx.coroutines.flow.flowOf(Unit)) { list, _ -> list }
                .mapToItems()
                .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

        // Tên node: tra một lần mỗi item (danh sách nhỏ; node đổi tên sẽ cập nhật ở lần emit kế)
        private fun kotlinx.coroutines.flow.Flow<List<Transfer>>.mapToItems() =
            map { list ->
                list.map { t ->
                    TransferUiItem(
                        transfer = t,
                        nodeName = runCatching { nodeRepository.getNode(t.nodeId)?.name }.getOrNull() ?: t.nodeId,
                    )
                }
            }

        fun pause(id: String) = launchSafely { transferScheduler.pause(id) }

        fun resume(id: String) = launchSafely { transferScheduler.resume(id) }

        fun cancel(id: String) = launchSafely { transferScheduler.cancel(id) }

        fun retry(id: String) = launchSafely { transferScheduler.retry(id) }

        private fun launchSafely(block: suspend () -> Unit) {
            viewModelScope.launch {
                runCatching { block() }.onFailure { Timber.w(it, "transfer action lỗi") }
            }
        }
    }
