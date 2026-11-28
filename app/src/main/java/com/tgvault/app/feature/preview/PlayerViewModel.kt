package com.tgvault.app.feature.preview

import android.content.Context
import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import com.tgvault.app.core.playback.NodeStreamDataSource
import com.tgvault.app.core.util.FileUtils
import com.tgvault.app.data.remote.GatewayHolder
import com.tgvault.app.domain.model.Node
import com.tgvault.app.domain.repository.NodeRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import timber.log.Timber
import java.io.File
import javax.inject.Inject

data class PlayerUiState(
    val node: Node? = null,
    val loading: Boolean = true,
    val error: String? = null,
    val isVideo: Boolean = false,
    val isAudio: Boolean = false,
)

/** Màn phát video/audio streaming từ Telegram (Range request qua NodeStreamDataSource). */
@HiltViewModel
@OptIn(UnstableApi::class)
class PlayerViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val nodeRepository: NodeRepository,
        private val gatewayHolder: GatewayHolder,
        @ApplicationContext private val context: Context,
    ) : ViewModel() {
        private val nodeId: String = checkNotNull(savedStateHandle["nodeId"])

        private val _uiState = MutableStateFlow(PlayerUiState())
        val uiState: StateFlow<PlayerUiState> = _uiState.asStateFlow()

        /** Player tạo sau khi node + chunks sẵn sàng; UI gắn vào PlayerView. */
        var player: ExoPlayer? = null
            private set

        init {
            loadAndPrepare()
        }

        private fun loadAndPrepare() {
            viewModelScope.launch {
                try {
                    val node =
                        nodeRepository.getNode(nodeId)
                            ?: error("không tìm thấy node $nodeId")
                    val chunks = nodeRepository.getChunks(nodeId).filter { it.isUploaded }
                    require(chunks.size == node.chunkCount) {
                        "tệp chưa upload đủ chunk (${chunks.size}/${node.chunkCount})"
                    }
                    val kind = FileUtils.mimeKind(node.mimeType)
                    val dataSourceFactory =
                        NodeStreamDataSource.Factory(
                            node = node,
                            chunks = chunks,
                            gateway = gatewayHolder.current(),
                            streamCacheRoot = File(context.cacheDir, "stream"),
                        )
                    prepare(node, dataSourceFactory, kind)
                } catch (e: Exception) {
                    Timber.w(e, "không mở được stream")
                    _uiState.value =
                        _uiState.value.copy(loading = false, error = e.message ?: "lỗi mở stream")
                }
            }
        }

        private fun prepare(
            node: Node,
            dataSourceFactory: NodeStreamDataSource.Factory,
            kind: FileUtils.MimeKind,
        ) {
            val mediaItem =
                MediaItem.Builder()
                    .setUri(Uri.parse("tgvault://stream/${node.id}"))
                    .setMimeType(node.mimeType ?: "application/octet-stream")
                    .build()
            val mediaSource =
                DefaultMediaSourceFactory(context)
                    .setDataSourceFactory(dataSourceFactory)
                    .createMediaSource(mediaItem)
            val exo =
                ExoPlayer.Builder(context).build().apply {
                    setMediaSource(mediaSource)
                    prepare()
                    playWhenReady = true
                }
            player = exo
            _uiState.value =
                PlayerUiState(
                    node = node,
                    loading = false,
                    isVideo = kind == FileUtils.MimeKind.VIDEO,
                    isAudio = kind == FileUtils.MimeKind.AUDIO,
                )
        }

        override fun onCleared() {
            player?.release()
            player = null
        }
    }
