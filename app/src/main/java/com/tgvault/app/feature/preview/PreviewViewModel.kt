package com.tgvault.app.feature.preview

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.core.graphics.scale
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tgvault.app.core.crypto.CryptoManager
import com.tgvault.app.core.crypto.CryptoScheme
import com.tgvault.app.core.crypto.NodeCipher
import com.tgvault.app.data.local.dao.ChunkDao
import com.tgvault.app.data.local.entity.ChunkEntity
import com.tgvault.app.data.remote.GatewayHolder
import com.tgvault.app.domain.model.Node
import com.tgvault.app.domain.model.NodeStatus
import com.tgvault.app.domain.repository.NodeRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import javax.inject.Inject

/** Nội dung xem trước đã giải mã sẵn (ảnh full-res / text / file PDF tạm). */
sealed interface PreviewContent {
    data class Image(
        val bitmap: Bitmap,
    ) : PreviewContent

    data class TextContent(
        val text: String,
        val truncated: Boolean,
    ) : PreviewContent

    data class Pdf(
        val file: File,
    ) : PreviewContent
}

data class PreviewUiState(
    val node: Node? = null,
    val loading: Boolean = true,
    val error: String? = null,
    val content: PreviewContent? = null,
)

/**
 * M9-2: tải + giải mã nội dung xem trước cho ảnh (mọi kích thước), text (≤1 MiB đầu), PDF.
 * Dùng chung cơ chế chunk với truyền tải: resolve file_path → download → (giải mã nếu encrypted).
 */
@HiltViewModel
class PreviewViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val nodeRepository: NodeRepository,
        private val chunkDao: ChunkDao,
        private val gatewayHolder: GatewayHolder,
        private val cryptoManager: CryptoManager,
        @ApplicationContext private val context: Context,
    ) : ViewModel() {
        private val nodeId: String = checkNotNull(savedStateHandle["nodeId"])

        private val _uiState = MutableStateFlow(PreviewUiState())
        val uiState: StateFlow<PreviewUiState> = _uiState.asStateFlow()

        init {
            viewModelScope.launch {
                val node = nodeRepository.getNode(nodeId)
                if (node == null || node.status != NodeStatus.READY) {
                    _uiState.value = PreviewUiState(node = node, loading = false, error = "not_ready")
                    return@launch
                }
                _uiState.value = PreviewUiState(node = node, loading = true)
                val content =
                    withContext(Dispatchers.IO) {
                        runCatching { loadContent(node) }.getOrElse {
                            _uiState.value = PreviewUiState(node = node, loading = false, error = it.message ?: "load")
                            null
                        }
                    }
                if (content != null) {
                    _uiState.value = PreviewUiState(node = node, loading = false, content = content)
                }
            }
        }

        private suspend fun loadContent(node: Node): PreviewContent? {
            val kind = com.tgvault.app.core.util.FileUtils.mimeKind(node.mimeType)
            val chunks = chunkDao.forNode(node.id).sortedBy { it.idx }
            if (chunks.isEmpty()) return null
            return when (kind) {
                com.tgvault.app.core.util.FileUtils.MimeKind.IMAGE -> loadImage(node, chunks)
                com.tgvault.app.core.util.FileUtils.MimeKind.TEXT -> loadText(node, chunks)
                com.tgvault.app.core.util.FileUtils.MimeKind.PDF -> loadPdf(node, chunks)
                else -> null
            }
        }

        // ---------------- Nguồn bytes ----------------

        /** Ghép toàn bộ chunks thành plaintext (chỉ dùng cho ảnh/PDF — caller giới hạn kích thước). */
        private suspend fun allPlainBytes(node: Node): ByteArray? {
            val chunks = chunkDao.forNode(node.id).sortedBy { it.idx }
            if (chunks.isEmpty()) return null
            val cipher = cipherForNode(node) ?: return null
            val out = ByteArrayOutputStream(node.sizeBytes.coerceAtMost(MAX_WHOLE_BYTES).toInt().coerceAtLeast(MIN_BUF))
            for (chunk in chunks) {
                val plain = fetchChunkPlain(node, chunk, cipher) ?: return null
                out.write(plain)
                if (out.size() > MAX_WHOLE_BYTES) return null
            }
            return out.toByteArray()
        }

        /** plaintext của [limitBytes] đầu (text preview); truncated=true nếu còn dư. */
        private suspend fun headPlainBytes(node: Node): Pair<ByteArray, Boolean>? {
            val chunks = chunkDao.forNode(node.id).sortedBy { it.idx }
            if (chunks.isEmpty()) return null
            val cipher = cipherForNode(node) ?: return null
            val out = ByteArrayOutputStream(TEXT_PREVIEW_BYTES + MIN_BUF)
            var truncated = false
            for (chunk in chunks) {
                val plain = fetchChunkPlain(node, chunk, cipher) ?: return null
                val remaining = TEXT_PREVIEW_BYTES - out.size()
                if (plain.size > remaining) {
                    out.write(plain, 0, remaining.coerceAtLeast(0))
                    truncated = true
                    break
                }
                out.write(plain)
            }
            return out.toByteArray() to truncated
        }

        private suspend fun fetchChunkPlain(
            node: Node,
            chunk: ChunkEntity,
            cipher: NodeCipher?,
        ): ByteArray? {
            val gateway = runCatching { gatewayHolder.current() }.getOrNull() ?: return null
            val fileId = chunk.tgFileId ?: return null
            val path = gateway.resolveFilePath(fileId)
            val raw = ByteArrayOutputStream(chunk.storedSizeBytes.toInt().coerceAtLeast(MIN_BUF))
            gateway.download(path, raw, null)
            if (raw.size() != chunk.storedSizeBytes.toInt()) return null
            if (cipher == null) return raw.toByteArray()
            val aad = CryptoScheme.chunkAad(node.id, chunk.idx, node.chunkCount)
            val out = ByteArrayOutputStream(chunk.plainSizeBytes.toInt().coerceAtLeast(MIN_BUF))
            cipher.newDecryptingStream(ByteArrayInputStream(raw.toByteArray()), aad).use { dec ->
                dec.copyTo(out)
            }
            if (out.size() != chunk.plainSizeBytes.toInt()) return null
            return out.toByteArray()
        }

        /** null = không mã hoá; throw→null khi không mở được khoá. */
        private fun cipherForNode(node: Node): NodeCipher? {
            if (!node.encrypted) return null
            if (!cryptoManager.isConfigured() || !cryptoManager.unlock()) return null
            return runCatching { NodeCipher(cryptoManager.requireKey()) }.getOrNull()
        }

        // ---------------- Loại nội dung ----------------

        private suspend fun loadImage(
            node: Node,
            chunks: List<ChunkEntity>,
        ): PreviewContent? {
            val bytes = allPlainBytes(node) ?: return null
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
            if (bounds.outWidth <= 0) return null
            var sample = 1
            while (bounds.outWidth / (sample * 2) >= MAX_IMAGE_DIM && bounds.outHeight / (sample * 2) >= MAX_IMAGE_DIM) {
                sample *= 2
            }
            val decoded =
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
                    ?: return null
            return PreviewContent.Image(scaleDown(decoded))
        }

        private suspend fun loadText(
            node: Node,
            chunks: List<ChunkEntity>,
        ): PreviewContent? {
            val (bytes, truncated) = headPlainBytes(node) ?: return null
            return PreviewContent.TextContent(String(bytes, Charsets.UTF_8), truncated)
        }

        private suspend fun loadPdf(
            node: Node,
            chunks: List<ChunkEntity>,
        ): PreviewContent? {
            val bytes = allPlainBytes(node) ?: return null
            val tmp = File(context.cacheDir, "preview_$nodeId.pdf")
            tmp.writeBytes(bytes)
            return PreviewContent.Pdf(tmp)
        }

        private fun scaleDown(src: Bitmap): Bitmap {
            val maxSide = maxOf(src.width, src.height)
            if (maxSide <= MAX_IMAGE_DIM) return src
            val scale = MAX_IMAGE_DIM.toFloat() / maxSide
            val w = (src.width * scale).toInt().coerceAtLeast(1)
            val h = (src.height * scale).toInt().coerceAtLeast(1)
            return src.scale(w, h)
        }

        override fun onCleared() {
            File(context.cacheDir, "preview_$nodeId.pdf").delete()
            super.onCleared()
        }

        companion object {
            private const val MAX_IMAGE_DIM = 2048
            private const val TEXT_PREVIEW_BYTES = 1 * 1024 * 1024
            private const val MAX_WHOLE_BYTES = 48L * 1024 * 1024
            private const val MIN_BUF = 64 * 1024
        }
    }
