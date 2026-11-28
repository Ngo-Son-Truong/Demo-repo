package com.tgvault.app.core.thumb

import android.content.Context
import android.os.Build
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import com.tgvault.app.core.crypto.CryptoManager
import com.tgvault.app.core.crypto.CryptoScheme
import com.tgvault.app.core.crypto.NodeCipher
import com.tgvault.app.data.local.dao.ChunkDao
import com.tgvault.app.data.local.entity.ChunkEntity
import com.tgvault.app.data.remote.GatewayHolder
import com.tgvault.app.domain.model.Node
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * M9-1: thumbnail ảnh cục bộ (tối đa 320px, WebP).
 *
 * Hai tầng cache: bộ nhớ (LruCache) + đĩa `cacheDir/thumbnails/<nodeId>.webp`.
 * Chỉ tải khi node là ảnh ≤ 1 chunk (tệp lớn hơn → caller dùng icon).
 * Chunk mã hoá (node.encrypted) → giải mã qua NodeCipher; không mở được khoá → null.
 */
@Singleton
class ThumbnailCache
    @Inject
    constructor(
        @ApplicationContext context: Context,
        private val chunkDao: ChunkDao,
        private val gatewayHolder: GatewayHolder,
        private val cryptoManager: CryptoManager,
    ) {
        private val thumbDir = File(context.cacheDir, "thumbnails")

        private val memoryCache =
            object : LruCache<String, Bitmap>(MEMORY_CACHE_BYTES) {
                override fun sizeOf(
                    key: String,
                    value: Bitmap,
                ): Int = value.byteCount
            }

        /**
         * Lấy thumbnail cho [node] (ảnh, ≤ 1 chunk, READY). Trả null khi không lấy được
         * (không phải ảnh / nhiều chunk / chưa upload xong / không giải mã được / lỗi mạng).
         */
        suspend fun get(node: Node): Bitmap? {
            if (!isImage(node.mimeType) || node.chunkCount != 1) return null
            memoryCache.get(node.id)?.let { return it }
            val diskFile = File(thumbDir, "${node.id}.webp")
            if (diskFile.exists()) {
                BitmapFactory.decodeFile(diskFile.absolutePath)?.let { bmp ->
                    memoryCache.put(node.id, bmp)
                    return bmp
                }
                diskFile.delete()
            }
            val bmp = runCatching { loadAndDecode(node) }.getOrNull() ?: return null
            runCatching {
                thumbDir.mkdirs()
                diskFile.outputStream().use { out ->
                    @Suppress("DEPRECATION")
                    val format =
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                            Bitmap.CompressFormat.WEBP_LOSSY
                        } else {
                            Bitmap.CompressFormat.WEBP
                        }
                    bmp.compress(format, WEBP_QUALITY, out)
                }
            }
            memoryCache.put(node.id, bmp)
            return bmp
        }

        fun invalidate(nodeId: String) {
            memoryCache.remove(nodeId)
            File(thumbDir, "$nodeId.webp").delete()
        }

        private suspend fun loadAndDecode(node: Node): Bitmap? =
            withContext(Dispatchers.IO) {
                val chunk = chunkDao.forNode(node.id).singleOrNull() ?: return@withContext null
                val fileId = chunk.tgFileId ?: return@withContext null
                val plain = fetchPlain(node, chunk, fileId) ?: return@withContext null
                decodeBounded(plain)
            }

        /** Tải chunk 0 → giải mã nếu cần → plaintext ByteArray; null khi thiếu byte/sai khoá. */
        private suspend fun fetchPlain(
            node: Node,
            chunk: ChunkEntity,
            fileId: String,
        ): ByteArray? {
            val gateway = runCatching { gatewayHolder.current() }.getOrNull() ?: return null
            return when (val cipher = cipherForNode(node)) {
                CipherResult.FAIL -> null
                else -> downloadAndMaybeDecrypt(gateway, node, chunk, fileId, cipher)
            }
        }

        private suspend fun downloadAndMaybeDecrypt(
            gateway: com.tgvault.app.data.remote.TelegramGateway,
            node: Node,
            chunk: ChunkEntity,
            fileId: String,
            cipher: CipherResult,
        ): ByteArray? {
            val path = gateway.resolveFilePath(fileId)
            val raw = ByteArrayOutputStream(chunk.storedSizeBytes.toInt().coerceAtLeast(MIN_BUFFER))
            gateway.download(path, raw, null)
            if (raw.size() != chunk.storedSizeBytes.toInt()) return null
            if (cipher === CipherResult.NONE) return raw.toByteArray()
            val realCipher = (cipher as CipherResult.Ok).cipher
            val aad = CryptoScheme.chunkAad(node.id, 0, node.chunkCount)
            val out = ByteArrayOutputStream(chunk.plainSizeBytes.toInt().coerceAtLeast(MIN_BUFFER))
            realCipher.newDecryptingStream(ByteArrayInputStream(raw.toByteArray()), aad).use { dec ->
                dec.copyTo(out)
            }
            if (out.size() != chunk.plainSizeBytes.toInt()) return null
            return out.toByteArray()
        }

        private sealed interface CipherResult {
            data object NONE : CipherResult

            data object FAIL : CipherResult

            data class Ok(
                val cipher: NodeCipher,
            ) : CipherResult
        }

        private fun cipherForNode(node: Node): CipherResult {
            if (!node.encrypted) return CipherResult.NONE
            if (!cryptoManager.isConfigured() || !cryptoManager.unlock()) return CipherResult.FAIL
            return runCatching { CipherResult.Ok(NodeCipher(cryptoManager.requireKey())) }
                .getOrElse { CipherResult.FAIL }
        }

        private fun decodeBounded(plain: ByteArray): Bitmap? {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(plain, 0, plain.size, bounds)
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
            var sample = 1
            while (bounds.outWidth / (sample * 2) >= MAX_DIM && bounds.outHeight / (sample * 2) >= MAX_DIM) {
                sample *= 2
            }
            val opts = BitmapFactory.Options().apply { inSampleSize = sample }
            val decoded = BitmapFactory.decodeByteArray(plain, 0, plain.size, opts) ?: return null
            return scaleDown(decoded)
        }

        private fun scaleDown(src: Bitmap): Bitmap {
            val maxSide = maxOf(src.width, src.height)
            if (maxSide <= MAX_DIM) return src
            val scale = MAX_DIM.toFloat() / maxSide
            val w = (src.width * scale).toInt().coerceAtLeast(1)
            val h = (src.height * scale).toInt().coerceAtLeast(1)
            val scaled = Bitmap.createScaledBitmap(src, w, h, true)
            if (scaled != src) src.recycle()
            return scaled
        }

        companion object {
            const val MAX_DIM = 320
            private const val WEBP_QUALITY = 82
            private const val MEMORY_CACHE_BYTES = 16 * 1024 * 1024
            private const val MIN_BUFFER = 64 * 1024

            fun isImage(mimeType: String?): Boolean = mimeType?.startsWith("image/") == true
        }
    }
