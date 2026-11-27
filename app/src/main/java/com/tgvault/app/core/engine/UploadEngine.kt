package com.tgvault.app.core.engine

import android.content.Context
import android.net.Uri
import androidx.room.withTransaction
import com.tgvault.app.core.chunker.Chunker
import com.tgvault.app.core.common.AppError
import com.tgvault.app.core.common.TimeProvider
import com.tgvault.app.data.local.TgVaultDatabase
import com.tgvault.app.data.local.dao.ChunkDao
import com.tgvault.app.data.local.dao.NodeDao
import com.tgvault.app.data.local.dao.TransferDao
import com.tgvault.app.data.local.entity.ChunkEntity
import com.tgvault.app.data.remote.GatewayHolder
import com.tgvault.app.domain.model.ChunkSource
import com.tgvault.app.domain.model.NodeStatus
import com.tgvault.app.domain.model.TransferState
import com.tgvault.app.domain.model.toTransferErrorCode
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import timber.log.Timber
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Engine upload theo chunk (PLAN M2-3, SPEC §10.1).
 *
 * - Đọc nguồn (content:// URI hoặc staging file) qua [Chunker] — streaming 64 KiB, không RAM.
 * - Resume: các chunk đầu đã có tgFileId trong Room được bỏ qua (FR-TR-3); engine upload
 *   tuần tự nên trạng thái resume hợp lệ luôn là tiền tố 0..k-1.
 * - Mỗi chunk thành công → upsert bản ghi chunk + cập nhật progress transfer.
 * - Lỗi → FAILED + errorCode; huỷ → CANCELLED.
 */
@Singleton
class UploadEngine
    @Inject
    constructor(
        @ApplicationContext private val context: Context,
        private val db: TgVaultDatabase,
        private val nodeDao: NodeDao,
        private val chunkDao: ChunkDao,
        private val transferDao: TransferDao,
        private val gatewayHolder: GatewayHolder,
        private val timeProvider: TimeProvider,
        private val configRepository: com.tgvault.app.domain.repository.ConfigRepository,
    ) {
        /** Chạy tới khi DONE/FAILED/CANCELLED. Trả true nếu DONE. */
        suspend fun run(transferId: String): Boolean {
            val transfer = transferDao.getById(transferId) ?: return false
            val node = nodeDao.getById(transfer.nodeId) ?: return false
            val gateway = gatewayHolder.current()
            val chatId =
                configRepository.current().chatId
                    ?: throw AppError.NotConnected("chưa có chatId — cần onboarding (M4)")

            transferDao.updateState(transferId, TransferState.RUNNING.name, timeProvider.nowMillis())

            val doneIdx =
                chunkDao.forNode(node.id)
                    .filter { it.tgFileId != null }
                    .map { it.idx }
                    .toSet()
            val prefix = longestDonePrefix(doneIdx)
            var bytesDone = prefix.fold(0L) { acc, i -> acc + plainSizeFor(i, node.sizeBytes, node.chunkSize) }
            val sha = MessageDigest.getInstance("SHA-256")

            try {
                openSource(transfer.sourceUri, transfer.stagingPath).use { input ->
                    // Resume: bỏ qua byte của các chunk đã xong
                    var skipped = 0L
                    while (skipped < bytesDone) {
                        val s = input.skip(bytesDone - skipped)
                        if (s <= 0) break
                        skipped += s
                    }
                    if (skipped != bytesDone) {
                        throw AppError.SourceChanged("nguồn ngắn hơn trạng thái đã upload")
                    }

                    val chunker = Chunker(input, node.chunkSize, node.sizeBytes - bytesDone)
                    var idx = prefix.size
                    while (true) {
                        ensureNotCancelled(transferId)
                        val source = chunker.next() ?: break
                        val chunkIdx = idx
                        val plainSize = source.length
                        gateway.sendDocument(
                            chatId = chatId,
                            part = HashingChunkSource(source, sha),
                            fileName = "${node.name}.part${chunkIdx.toString().padStart(4, '0')}",
                            caption = null,
                        ).let { sent ->
                            chunkDao.upsert(
                                ChunkEntity(
                                    nodeId = node.id,
                                    idx = chunkIdx,
                                    plainSizeBytes = plainSize,
                                    storedSizeBytes = plainSize,
                                    tgChatId = chatId,
                                    tgMessageId = sent.messageId,
                                    tgFileId = sent.fileId,
                                    tgFileUniqueId = sent.fileUniqueId,
                                    sha256 = null,
                                ),
                            )
                        }
                        bytesDone += plainSize
                        transferDao.updateProgress(
                            transferId,
                            bytesDone,
                            node.sizeBytes,
                            chunkIdx,
                            timeProvider.nowMillis(),
                        )
                        idx++
                    }
                }

                val digest = sha.digest().joinToString("") { "%02x".format(it) }
                val totalChunks = chunkDao.forNode(node.id).count { it.tgFileId != null }
                db.withTransaction {
                    nodeDao.updateUploadMeta(
                        id = node.id,
                        sha256 = digest,
                        chunkCount = totalChunks,
                        chunkSize = node.chunkSize,
                        status = NodeStatus.READY.name,
                        modifiedAt = timeProvider.nowMillis(),
                    )
                    transferDao.updateState(transferId, TransferState.DONE.name, timeProvider.nowMillis())
                }
                return true
            } catch (e: CancellationException) {
                transferDao.updateState(transferId, TransferState.CANCELLED.name, timeProvider.nowMillis())
                throw e
            } catch (e: TransferCancelledException) {
            Timber.d(e, "transfer bị huỷ theo yêu cầu")
                transferDao.updateState(transferId, TransferState.CANCELLED.name, timeProvider.nowMillis())
                return false
            } catch (e: Throwable) {
                Timber.w(e, "upload thất bại")
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

        private fun plainSizeFor(
            idx: Int,
            total: Long,
            chunkSize: Int,
        ): Long {
            val chunkCount = ((total + chunkSize - 1) / chunkSize).toInt()
            return if (idx == chunkCount - 1) {
                val rem = total % chunkSize
                if (rem == 0L) chunkSize.toLong() else rem
            } else {
                chunkSize.toLong()
            }
        }

        /** Tiền tố dài nhất 0,1,2,... trong tập đã xong (engine upload tuần tự nên đây là dạng duy nhất). */
        private fun longestDonePrefix(done: Set<Int>): List<Int> {
            val result = mutableListOf<Int>()
            var i = 0
            while (i in done) {
                result.add(i)
                i++
            }
            return result
        }

        private suspend fun ensureNotCancelled(transferId: String) {
            val state = transferDao.getById(transferId)?.state
            if (state == TransferState.CANCELLED.name) throw TransferCancelledException()
        }

        private fun openSource(
            sourceUri: String?,
            stagingPath: String?,
        ): java.io.InputStream =
            when {
                stagingPath != null -> java.io.File(stagingPath).inputStream().buffered()
                sourceUri != null ->
                    context.contentResolver.openInputStream(Uri.parse(sourceUri))
                        ?: throw AppError.SourceChanged()
                else -> throw AppError.SourceChanged()
            }

        /** Bọc source để tích luỹ SHA-256 toàn tệp trong khi streaming. */
        private class HashingChunkSource(
            private val delegate: ChunkSource,
            private val digest: MessageDigest,
        ) : ChunkSource {
            override val length: Long get() = delegate.length

            override suspend fun writeTo(
                out: java.io.OutputStream,
                onProgress: (bytesWritten: Long) -> Unit,
            ) {
                val digestOut = java.security.DigestOutputStream(out, digest)
                delegate.writeTo(digestOut, onProgress)
                digestOut.flush()
            }
        }

        private class TransferCancelledException : Exception("transfer đã bị huỷ")
    }
