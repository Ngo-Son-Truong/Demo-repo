package com.tgvault.app.core.indexbackup

import android.util.Base64
import androidx.room.withTransaction
import com.tgvault.app.core.common.TimeProvider
import com.tgvault.app.core.crypto.CryptoManager
import com.tgvault.app.core.crypto.CryptoScheme
import com.tgvault.app.core.crypto.NodeCipher
import com.tgvault.app.core.indexbackup.IndexSnapshotCodec.IndexManifest
import com.tgvault.app.core.indexbackup.IndexSnapshotCodec.KdfInfo
import com.tgvault.app.core.indexbackup.IndexSnapshotCodec.ManifestPart
import com.tgvault.app.core.indexbackup.IndexSnapshotCodec.SnapshotHeader
import com.tgvault.app.core.indexbackup.IndexSnapshotCodec.SnapshotPayload
import com.tgvault.app.core.indexbackup.IndexSnapshotCodec.toEntity
import com.tgvault.app.core.indexbackup.IndexSnapshotCodec.toSnapshot
import com.tgvault.app.data.local.TgVaultDatabase
import com.tgvault.app.data.local.dao.ChunkDao
import com.tgvault.app.data.local.dao.NodeDao
import com.tgvault.app.data.remote.GatewayHolder
import com.tgvault.app.domain.model.ChunkSource
import com.tgvault.app.domain.repository.ConfigRepository
import kotlinx.coroutines.sync.Mutex
import timber.log.Timber
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Sao lưu/khôi phục index lên chính channel Telegram (M8-2, M8-4, SPEC §11).
 *
 * Backup: encode snapshot → tách theo chunkSize → sendDocument từng phần (caption
 * `#tgvault-index r<rev> <i>/<n>`) → gửi manifest văn bản → ghim → bỏ ghim bản trước,
 * xoá bản cũ hơn 2 phiên bản (parts + manifest, nhờ prev/prevManifestMessageId nhúng).
 *
 * Restore: pinned_message → manifest → tải/ghép/xác minh SHA-256 → (passphrase nếu có kdf)
 * → ghi đè Room trong MỘT transaction → lưu localRevision.
 */
@Singleton
class IndexBackupManager
    @Inject
    constructor(
        private val db: TgVaultDatabase,
        private val nodeDao: NodeDao,
        private val chunkDao: ChunkDao,
        private val gatewayHolder: GatewayHolder,
        private val configRepository: ConfigRepository,
        private val cryptoManager: CryptoManager,
        private val timeProvider: TimeProvider,
    ) {
        private val mutex = Mutex()

        sealed interface RestoreResult {
            /** Không có tin ghim manifest hoặc manifest hỏng. */
            data object NotFound : RestoreResult

            /** Snapshot có mã hoá — cần gọi lại với passphrase. */
            data class NeedPassphrase(
                val revision: Long,
            ) : RestoreResult

            data object WrongPassphrase : RestoreResult

            data class Success(
                val revision: Long,
                val nodeCount: Int,
                val chunkCount: Int,
            ) : RestoreResult

            data class Failure(
                val message: String,
            ) : RestoreResult
        }

        /** Manifest trên cloud hiện tại (pinned) — null nếu chưa có backup nào. */
        suspend fun readPinnedManifest(): IndexManifest? {
            val chatId = configRepository.current().chatId ?: return null
            val chat = gatewayHolder.current().getChat(chatId)
            return IndexSnapshotCodec.parseManifest(chat.pinnedMessageText)
        }

        /** Revision trên cloud — null nếu chưa có backup (phát hiện xung đột M8-3). */
        suspend fun cloudRevision(): Long? = readPinnedManifest()?.revision

        /**
         * Sao lưu index ngay. Trả true nếu thành công. An toàn gọi trùng (mutex);
         * lỗi mạng/Telegram → false (caller retry qua debounce lần sau).
         */
        suspend fun backupNow(): Boolean {
            if (!mutex.tryLock()) return false
            try {
                val cfg = configRepository.current()
                val chatId = cfg.chatId ?: return false
                val gateway = gatewayHolder.current()

                val payload =
                    SnapshotPayload(
                        nodes = nodeDao.getAll().map { it.toSnapshot() },
                        chunks = chunkDao.getAll().map { it.toSnapshot() },
                    )
                val revision = cfg.localRevision
                val encrypt = cfg.encryptionEnabled && cryptoManager.isConfigured()
                val cipher =
                    if (encrypt) {
                        if (!cryptoManager.unlock()) {
                            Timber.w("backup: mã hoá bật nhưng không mở được khoá — bỏ qua lần này")
                            return false
                        }
                        NodeCipher(cryptoManager.requireKey())
                    } else {
                        null
                    }
                val header =
                    SnapshotHeader(
                        revision = revision,
                        createdAt = timeProvider.nowMillis(),
                        deviceId = cfg.deviceId,
                        encrypted = encrypt,
                        kdf = if (encrypt) KdfInfo() else null,
                        wrappedMasterKey =
                            if (encrypt) {
                                cryptoManager.passphraseBlob()?.let {
                                    Base64.encodeToString(it, Base64.NO_WRAP)
                                }
                            } else {
                                null
                            },
                    )
                val snapshotBytes = IndexSnapshotCodec.encode(payload, header, cipher)
                val sha =
                    MessageDigest.getInstance(
                        "SHA-256",
                    ).digest(snapshotBytes).joinToString("") { "%02x".format(it) }

                // Tách phần theo chunk size cấu hình (SPEC §11)
                val partSize = cfg.chunkSizeBytes.coerceAtLeast(1)
                val parts = mutableListOf<ByteArray>()
                var off = 0
                while (off < snapshotBytes.size) {
                    val end = minOf(off + partSize, snapshotBytes.size)
                    parts.add(snapshotBytes.copyOfRange(off, end))
                    off = end
                }

                // Đọc manifest cũ TRƯỚC khi pin bản mới
                val chat = gateway.getChat(chatId)
                val prevRaw = IndexSnapshotCodec.parseManifest(chat.pinnedMessageText)?.let { chat.pinnedMessageText }
                val prevManifestId = if (prevRaw != null) chat.pinnedMessageId else null

                // Upload các phần
                val sentParts =
                    parts.mapIndexed { i, part ->
                        val sent =
                            gateway.sendDocument(
                                chatId = chatId,
                                part = BytesChunkSource(part),
                                fileName = "tgvault_index_r${revision}_p${i + 1}.tgsnap",
                                caption = "#tgvault-index r$revision ${i + 1}/${parts.size}",
                            )
                        ManifestPart(fileId = sent.fileId, messageId = sent.messageId, size = part.size.toLong())
                    }

                // Manifest mới → ghim
                val manifest =
                    IndexManifest(
                        revision = revision,
                        sha256 = sha,
                        createdAt = timeProvider.nowMillis(),
                        parts = sentParts,
                        prev = prevRaw,
                        prevManifestMessageId = prevManifestId,
                    )
                val manifestMsg = gateway.sendText(chatId, IndexSnapshotCodec.encodeManifest(manifest))
                gateway.pinMessage(chatId, manifestMsg.messageId)

                // Dọn: bỏ ghim bản trước + XOÁ bản cũ hơn 2 phiên bản (giữ N và N-1)
                if (prevManifestId != null) {
                    runCatching { gateway.unpinMessage(chatId, prevManifestId) }
                }
                val prevPrev =
                    prevRaw?.let { IndexSnapshotCodec.parseManifest(it)?.prev }
                        ?.let { IndexSnapshotCodec.parseManifest(it) }
                if (prevPrev != null) {
                    prevPrev.parts.forEach { runCatching { gateway.deleteMessage(chatId, it.messageId) } }
                    val prevPrevManifestId =
                        IndexSnapshotCodec.parseManifest(prevRaw!!)?.prevManifestMessageId
                    if (prevPrevManifestId != null) {
                        runCatching { gateway.deleteMessage(chatId, prevPrevManifestId) }
                    }
                }

                configRepository.setLastIndexBackupAt(timeProvider.nowMillis())
                Timber.i("backup index r$revision: ${parts.size} phần, ${snapshotBytes.size}B")
                return true
            } catch (e: Exception) {
                Timber.w(e, "backup index thất bại — sẽ thử lại ở lần debounce sau")
                return false
            } finally {
                mutex.unlock()
            }
        }

        /**
         * Khôi phục index từ tin ghim (M8-4). [passphrase] cần khi snapshot mã hoá —
         * gọi không passphrase trước để biết [RestoreResult.NeedPassphrase].
         * KHÔNG ghi gì cho tới khi snapshot tải đủ + xác minh xong (an toàn với dữ liệu cục bộ).
         */
        suspend fun restoreFromPinned(passphrase: CharArray? = null): RestoreResult {
            if (!mutex.tryLock()) return RestoreResult.Failure("đang có tác vụ backup/restore khác")
            try {
                val cfg = configRepository.current()
                val chatId = cfg.chatId ?: return RestoreResult.Failure("chưa kết nối channel")
                val gateway = gatewayHolder.current()

                val chat = gateway.getChat(chatId)
                val manifest =
                    IndexSnapshotCodec.parseManifest(chat.pinnedMessageText)
                        ?: return RestoreResult.NotFound

                // Tải + ghép các phần
                val bytes = ByteArrayOutputStream()
                manifest.parts.forEach { part ->
                    val path = gateway.resolveFilePath(part.file_id)
                    gateway.download(path, bytes, null)
                }
                val snapshot = bytes.toByteArray()
                val expectedSize = manifest.parts.sumOf { it.size }
                if (snapshot.size.toLong() != expectedSize) {
                    return RestoreResult.Failure("snapshot tải thiếu: ${snapshot.size}/$expectedSize")
                }
                val sha = MessageDigest.getInstance("SHA-256").digest(snapshot).joinToString("") { "%02x".format(it) }
                if (!sha.equals(manifest.sha256, ignoreCase = true)) {
                    return RestoreResult.Failure("SHA-256 snapshot không khớp manifest")
                }

                val (header, payloadBytes) =
                    try {
                        IndexSnapshotCodec.parse(snapshot)
                    } catch (e: IndexSnapshotCodec.SnapshotFormatException) {
                        return RestoreResult.Failure("snapshot sai định dạng: ${e.message}")
                    }

                val cipher =
                    if (header.encrypted) {
                        val pass = passphrase ?: return RestoreResult.NeedPassphrase(header.revision)
                        val blob =
                            header.wrappedMasterKey?.let { Base64.decode(it, Base64.NO_WRAP) }
                                ?: return RestoreResult.Failure("snapshot thiếu wrappedMasterKey")
                        val master =
                            try {
                                CryptoScheme.unwrapWithPassphrase(blob, pass)
                            } catch (e: Exception) {
                                return RestoreResult.WrongPassphrase
                            }
                        // Nhập master key vào khoá cục bộ để mở được tệp mã hoá sau restore
                        cryptoManager.importMasterKey(master, blob)
                        NodeCipher(master)
                    } else {
                        null
                    }

                val payload =
                    try {
                        IndexSnapshotCodec.decodePayload(header, payloadBytes, cipher)
                    } catch (e: Exception) {
                        return RestoreResult.Failure("không giải mã/đọc được payload: ${e.message}")
                    }

                // Ghi đè Room trong MỘT transaction (FK: xoá chunks trước, insert nodes trước)
                db.withTransaction {
                    chunkDao.deleteAll()
                    nodeDao.deleteAll()
                    payload.nodes.forEach { nodeDao.upsert(it.toEntity()) }
                    payload.chunks.forEach { chunkDao.upsert(it.toEntity()) }
                }
                configRepository.setLocalRevision(header.revision)
                if (header.encrypted) configRepository.setEncryptionEnabled(true)
                Timber.i("restore xong: r${header.revision}, ${payload.nodes.size} node")
                return RestoreResult.Success(header.revision, payload.nodes.size, payload.chunks.size)
            } catch (e: Exception) {
                Timber.w(e, "restore thất bại")
                return RestoreResult.Failure(e.message ?: "lỗi không rõ")
            } finally {
                mutex.unlock()
            }
        }

        /** ChunkSource bọc ByteArray cho phần snapshot (snapshot nhỏ — RAM chấp nhận được). */
        private class BytesChunkSource(
            private val data: ByteArray,
        ) : ChunkSource {
            override val length: Long get() = data.size.toLong()

            override fun writeTo(
                sink: OutputStream,
                onProgress: (bytesWritten: Long) -> Unit,
            ) {
                sink.write(data)
                onProgress(data.size.toLong())
            }
        }
    }
