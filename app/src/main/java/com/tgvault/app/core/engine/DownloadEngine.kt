package com.tgvault.app.core.engine

import android.content.Context
import android.os.storage.StorageManager
import androidx.core.net.toUri
import androidx.room.withTransaction
import com.tgvault.app.core.common.AppError
import com.tgvault.app.core.common.TimeProvider
import com.tgvault.app.data.local.TgVaultDatabase
import com.tgvault.app.data.local.dao.ChunkDao
import com.tgvault.app.data.local.dao.NodeDao
import com.tgvault.app.data.local.dao.TransferDao
import com.tgvault.app.data.remote.GatewayHolder
import com.tgvault.app.domain.model.NodeStatus
import com.tgvault.app.domain.model.TransferState
import com.tgvault.app.domain.model.toTransferErrorCode
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withContext
import timber.log.Timber
import java.io.File
import java.io.RandomAccessFile
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers as KtDispatchers

/**
 * Engine download theo chunk (PLAN M2-3, SPEC §10.2):
 * - Ghép các chunk theo idx tăng dần vào file tạm trong cacheDir (staging), resume theo byte.
 * - Mỗi chunk: resolveFilePath để lấy file_path tươi (path hết hạn ~1 giờ, SPEC §5).
 * - Trước khi tải: kiểm tổng dung lượng trống ≥ bytes còn lại (FR-TR-6).
 * - Sau chunk cuối: verify SHA-256 toàn tệp với Room; sai → FAILED + INTEGRITY (FR-TR-4).
 * - Thành công: chuyển staging sang đích (destUri SAF hoặc thư mục Downloads công khai).
 */
@Singleton
class DownloadEngine
    @Inject
    constructor(
        @ApplicationContext private val context: Context,
        private val db: TgVaultDatabase,
        private val nodeDao: NodeDao,
        private val chunkDao: ChunkDao,
        private val transferDao: TransferDao,
        private val gatewayHolder: GatewayHolder,
        private val timeProvider: TimeProvider,
        private val cryptoManager: com.tgvault.app.core.crypto.CryptoManager,
    ) : TransferEngine {
        /** Chạy tới khi DONE/FAILED/CANCELLED. Trả true nếu DONE. */
        override suspend fun run(transferId: String): Boolean {
            val transfer = transferDao.getById(transferId) ?: return false
            val node = nodeDao.getById(transfer.nodeId) ?: return false
            if (node.status != NodeStatus.READY.name) {
                transferDao.updateError(
                    transferId,
                    TransferState.FAILED.name,
                    "UNKNOWN",
                    "node chưa sẵn sàng",
                    timeProvider.nowMillis(),
                )
                return false
            }
            val gateway = gatewayHolder.current()
            transferDao.updateState(transferId, TransferState.RUNNING.name, timeProvider.nowMillis())

            val staging = File(stagingDir(), "${transfer.nodeId}.part")
            // M7-2: node mã hoá → mở khoá + cipher dùng chung; ciphertext tải về tệp tạm
            // trong cacheDir rồi giải mã streaming (không đưa nguyên chunk vào RAM — D7)
            val cipher = cipherForNode(node.encrypted)
            val cipherTmpDir = File(context.cacheDir, "dec").apply { mkdirs() }
            try {
                val chunks = chunkDao.forNode(node.id).sortedBy { it.idx }
                require(chunks.size == node.chunkCount) {
                    "thiếu chunk trong Room: ${chunks.size}/${node.chunkCount}"
                }

                // FR-TR-6: kiểm dung lượng trống trước khi tải
                val existing = if (staging.exists()) staging.length() else 0L
                val remaining = node.sizeBytes - existing
                val free = allocatableFreeBytes()
                if (free < remaining + MIN_FREE_HEADROOM) {
                    throw AppError.Transient("không đủ dung lượng: cần ${remaining}B, còn ${free}B")
                }

                RandomAccessFile(staging, "rw").use { raf ->
                    var bytesDone = existing
                    raf.seek(existing)
                    for (chunk in chunks) {
                        ensureNotCancelled(transferId)
                        val chunkStart = chunks.filter { it.idx < chunk.idx }.sumOf { it.plainSizeBytes }
                        if (chunkStart + chunk.plainSizeBytes <= existing) continue // đã có trong staging
                        if (chunkStart < existing) {
                            // staging lẻ một phần chunk → cắt lại tới ranh giới chunk, tải lại chunk đó
                            raf.setLength(chunkStart)
                            raf.seek(chunkStart)
                            bytesDone = chunkStart
                        }
                        // file_path hết hạn ~1 giờ → lấy tươi ngay trước khi tải từng chunk
                        val freshPath = gateway.resolveFilePath(requireNotNull(chunk.tgFileId))
                        bytesDone =
                            fetchChunk(
                                ctx =
                                    ChunkFetchContext(
                                        cipher = cipher,
                                        gateway = gateway,
                                        nodeId = node.id,
                                        nodeChunkCount = node.chunkCount,
                                        cipherTmpDir = cipherTmpDir,
                                    ),
                                freshPath = freshPath,
                                chunk = chunk,
                                chunkStart = chunkStart,
                                raf = raf,
                            )
                        transferDao.updateProgress(
                            transferId,
                            bytesDone,
                            node.sizeBytes,
                            chunk.idx,
                            timeProvider.nowMillis(),
                        )
                    }
                    raf.fd.sync()
                }

                // FR-TR-4: verify SHA-256 toàn tệp
                if (!node.sha256.isNullOrBlank()) {
                    val actual = sha256Of(staging)
                    if (!actual.equals(node.sha256, ignoreCase = true)) {
                        staging.delete()
                        throw AppError.IntegrityMismatch(node.sha256, actual)
                    }
                }

                moveToDestination(staging, node.name, transfer.destUri)
                db.withTransaction {
                    transferDao.updateProgress(
                        transferId,
                        node.sizeBytes,
                        node.sizeBytes,
                        node.chunkCount,
                        timeProvider.nowMillis(),
                    )
                    transferDao.updateState(transferId, TransferState.DONE.name, timeProvider.nowMillis())
                }
                return true
            } catch (e: CancellationException) {
                // Hệ thống dừng coroutine (constraint/timeout/kill) HOẶC huỷ từ ngoài —
                // KHÔNG ghi trạng thái ở đây; TransferWorker đọc DB để phân biệt và requeue nếu cần.
                throw e
            } catch (e: TransferPausedException) {
                Timber.d("transfer tạm dừng theo yêu cầu — giữ nguyên PAUSED")
                return false
            } catch (e: TransferCancelledException) {
                Timber.d(e, "transfer bị huỷ theo yêu cầu")
                transferDao.updateState(transferId, TransferState.CANCELLED.name, timeProvider.nowMillis())
                return false
            } catch (e: Throwable) {
                Timber.w(e, "download thất bại")
                transferDao.updateError(
                    transferId,
                    TransferState.FAILED.name,
                    e.toTransferErrorCode(),
                    e.message?.take(200),
                    timeProvider.nowMillis(),
                )
                return false
            }
        }

        /** RandomAccessFile → OutputStream không đóng file khi close (để ta tự quản vòng đời). */
        private fun RandomAccessFile.toOutputStream() =
            object : java.io.OutputStream() {
                override fun write(b: Int) = this@toOutputStream.write(b)

                override fun write(
                    b: ByteArray,
                    off: Int,
                    len: Int,
                ) = this@toOutputStream.write(b, off, len)

                override fun flush() {}

                override fun close() {}
            }

        private suspend fun ensureNotCancelled(transferId: String) {
            when (transferDao.getById(transferId)?.state) {
                TransferState.CANCELLED.name -> throw TransferCancelledException()
                TransferState.PAUSED.name -> throw TransferPausedException()
            }
        }

        /** Dung lượng cấp phát được trên volume chứa staging (đã trừ vùng hệ thống giữ lại). */
        private fun allocatableFreeBytes(): Long =
            try {
                val sm = context.getSystemService(StorageManager::class.java)
                sm?.getAllocatableBytes(sm.getUuidForPath(stagingDir())) ?: stagingDir().usableSpace
            } catch (e: Exception) {
                Timber.w(e, "getAllocatableBytes lỗi — fallback usableSpace")
                stagingDir().usableSpace
            }

        /** Ngữ cảnh dùng chung cho việc tải một chunk (gom để tránh parameter list dài). */
        private class ChunkFetchContext(
            val cipher: com.tgvault.app.core.crypto.NodeCipher?,
            val gateway: com.tgvault.app.data.remote.TelegramGateway,
            val nodeId: String,
            val nodeChunkCount: Int,
            val cipherTmpDir: File,
        )

        /** M7-2: cipher cho node mã hoá; null nếu node plaintext. Ném Transient nếu không mở được khoá. */
        private fun cipherForNode(encrypted: Boolean): com.tgvault.app.core.crypto.NodeCipher? {
            if (!encrypted) return null
            if (!cryptoManager.unlock()) {
                throw AppError.Transient("mã hoá đã bật nhưng không mở được khoá — mở lại app")
            }
            return com.tgvault.app.core.crypto.NodeCipher(cryptoManager.requireKey())
        }

        /**
         * Tải một chunk và ghi vào [raf] tại vị trí hiện tại; trả bytesDone mới (chunkStart + bytes).
         * Chunk mã hoá: tải nguyên ciphertext (AesGcmHkdfStreaming giải tuần tự, không Range)
         * vào tệp tạm, giải mã streaming; AEAD tag sai → Transient (SPEC §12).
         */
        private suspend fun fetchChunk(
            ctx: ChunkFetchContext,
            freshPath: String,
            chunk: com.tgvault.app.data.local.entity.ChunkEntity,
            chunkStart: Long,
            raf: RandomAccessFile,
        ): Long {
            if (ctx.cipher == null) {
                var chunkBytes = 0L
                ctx.gateway.download(freshPath, raf.toOutputStream(), null) { written -> chunkBytes = written }
                if (chunkBytes != chunk.storedSizeBytes) {
                    throw AppError.Transient(
                        "chunk ${chunk.idx} tải thiếu: $chunkBytes/${chunk.storedSizeBytes}",
                    )
                }
                return chunkStart + chunkBytes
            }
            val tmp = File(ctx.cipherTmpDir, "${ctx.nodeId}-${chunk.idx}.enc")
            try {
                var cipherBytes = 0L
                tmp.outputStream().use { out ->
                    ctx.gateway.download(freshPath, out, null) { written -> cipherBytes = written }
                }
                if (cipherBytes != chunk.storedSizeBytes) {
                    throw AppError.Transient(
                        "chunk ${chunk.idx} tải thiếu: $cipherBytes/${chunk.storedSizeBytes}",
                    )
                }
                val plainBytes =
                    decryptInto(ctx.cipher, tmp, ctx.nodeId, chunk, nodeChunkCount = ctx.nodeChunkCount, raf)
                if (plainBytes != chunk.plainSizeBytes) {
                    throw AppError.Transient(
                        "chunk ${chunk.idx} giải mã thiếu: $plainBytes/${chunk.plainSizeBytes}",
                    )
                }
                return chunkStart + plainBytes
            } finally {
                tmp.delete()
            }
        }

        /** Giải mã stream chunk vào [raf]; trả số byte plaintext. AEAD tag sai → Transient. */
        private fun decryptInto(
            cipher: com.tgvault.app.core.crypto.NodeCipher,
            tmp: File,
            nodeId: String,
            chunk: com.tgvault.app.data.local.entity.ChunkEntity,
            nodeChunkCount: Int,
            raf: RandomAccessFile,
        ): Long {
            val aad = com.tgvault.app.core.crypto.CryptoScheme.chunkAad(nodeId, chunk.idx, nodeChunkCount)
            var plainBytes = 0L
            try {
                cipher.newDecryptingStream(tmp.inputStream(), aad).use { dec ->
                    val buf = ByteArray(DECRYPT_BUFFER_SIZE)
                    while (true) {
                        val n = dec.read(buf)
                        if (n < 0) break
                        raf.write(buf, 0, n)
                        plainBytes += n
                    }
                }
            } catch (e: java.io.IOException) {
                throw AppError.Transient("chunk ${chunk.idx} không giải mã được (bị sửa?): ${e.message}")
            }
            return plainBytes
        }

        private fun stagingDir(): File = File(context.cacheDir, "staging").apply { mkdirs() }

        /** Chuyển staging sang đích: SAF document (destUri) hoặc thư mục Downloads công khai. */
        private fun moveToDestination(
            staging: File,
            name: String,
            destUri: String?,
        ) {
            if (destUri != null) {
                context.contentResolver.openOutputStream(destUri.toUri(), "wt")?.use { out ->
                    staging.inputStream().use { it.copyTo(out, BUFFER_SIZE) }
                } ?: throw AppError.Unknown("không mở được đích SAF")
                staging.delete()
                return
            }
            val target =
                uniqueTarget(
                    File(
                        android.os.Environment.getExternalStoragePublicDirectory(
                            android.os.Environment.DIRECTORY_DOWNLOADS,
                        ),
                        name,
                    ),
                )
            staging.copyTo(target, overwrite = false)
            staging.delete()
        }

        private fun uniqueTarget(file: File): File {
            if (!file.exists()) return file
            val base = file.nameWithoutExtension
            val ext = file.extension
            var i = 1
            while (true) {
                val candidate = File(file.parentFile, if (ext.isEmpty()) "$base ($i)" else "$base ($i).$ext")
                if (!candidate.exists()) return candidate
                i++
            }
        }

        private suspend fun sha256Of(file: File): String =
            withContext(KtDispatchers.IO) {
                val digest = MessageDigest.getInstance("SHA-256")
                file.inputStream().buffered().use { input ->
                    val buffer = ByteArray(BUFFER_SIZE)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        digest.update(buffer, 0, read)
                    }
                }
                digest.digest().joinToString("") { "%02x".format(it) }
            }

        private class TransferCancelledException : Exception("transfer đã bị huỷ")

        private class TransferPausedException : Exception("transfer đã tạm dừng")

        private companion object {
            const val BUFFER_SIZE = 64 * 1024
            const val DECRYPT_BUFFER_SIZE = 64 * 1024
            const val MIN_FREE_HEADROOM = 16L * 1024 * 1024
        }
    }
