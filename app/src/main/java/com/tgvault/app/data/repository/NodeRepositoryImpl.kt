package com.tgvault.app.data.repository

import androidx.room.withTransaction
import androidx.sqlite.db.SimpleSQLiteQuery
import com.tgvault.app.core.common.AppError
import com.tgvault.app.core.common.NameNormalizer
import com.tgvault.app.core.common.TimeProvider
import com.tgvault.app.core.common.UniqueNameResolver
import com.tgvault.app.data.local.TgVaultDatabase
import com.tgvault.app.data.local.dao.ChunkDao
import com.tgvault.app.data.local.dao.NodeDao
import com.tgvault.app.data.local.dao.OrphanChunkDao
import com.tgvault.app.data.local.dao.TransferDao
import com.tgvault.app.data.local.entity.NodeEntity
import com.tgvault.app.data.local.entity.OrphanChunkEntity
import com.tgvault.app.data.local.entity.TransferEntity
import com.tgvault.app.data.remote.DeleteResult
import com.tgvault.app.data.remote.GatewayHolder
import com.tgvault.app.data.remote.TelegramGateway
import com.tgvault.app.domain.model.DeleteOutcome
import com.tgvault.app.domain.model.Node
import com.tgvault.app.domain.model.NodeSort
import com.tgvault.app.domain.model.NodeSortField
import com.tgvault.app.domain.model.NodeStatus
import com.tgvault.app.domain.model.NodeType
import com.tgvault.app.domain.model.StorageStats
import com.tgvault.app.domain.model.Transfer
import com.tgvault.app.domain.model.TransferDirection
import com.tgvault.app.domain.model.TransferState
import com.tgvault.app.domain.repository.ConfigRepository
import com.tgvault.app.domain.repository.NodeRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import timber.log.Timber
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** NodeRepository trên Room; thao tác nhiều bảng luôn trong transaction (SPEC §16). */
@Singleton
class NodeRepositoryImpl
    @Inject
    constructor(
        private val db: TgVaultDatabase,
        private val nodeDao: NodeDao,
        private val chunkDao: ChunkDao,
        private val transferDao: TransferDao,
        private val orphanChunkDao: OrphanChunkDao,
        private val configRepository: ConfigRepository,
        private val gatewayHolder: GatewayHolder,
        private val timeProvider: TimeProvider,
    ) : NodeRepository {
        override fun observeChildren(
            parentId: String?,
            sort: NodeSort,
        ): Flow<List<Node>> {
            val column =
                when (sort.field) {
                    NodeSortField.NAME -> "nameNormalized"
                    NodeSortField.DATE -> "modifiedAt"
                    NodeSortField.SIZE -> "sizeBytes"
                }
            val direction = if (sort.ascending) "ASC" else "DESC"
            val parentClause = if (parentId == null) "parentId IS NULL" else "parentId = ?"
            // Thư mục luôn lên đầu, sau đó theo tiêu chí sắp xếp
            val sql =
                """
                SELECT * FROM nodes
                WHERE trashedAt IS NULL AND $parentClause
                ORDER BY CASE type WHEN 'FOLDER' THEN 0 ELSE 1 END, $column $direction, id ASC
                """.trimIndent()
            val args = if (parentId == null) emptyArray<Any?>() else arrayOf(parentId)
            return nodeDao.observeChildrenSorted(SimpleSQLiteQuery(sql, args))
                .map { list -> list.map { it.toDomain() } }
        }

        override fun observeNode(id: String): Flow<Node?> = nodeDao.observeById(id).map { it?.toDomain() }

        override suspend fun getNode(id: String): Node? = nodeDao.getById(id)?.toDomain()

        override suspend fun getChunks(nodeId: String): List<com.tgvault.app.domain.model.Chunk> =
            chunkDao.forNode(nodeId).sortedBy { it.idx }.map { it.toDomain() }

        override fun searchByName(normalizedQuery: String): Flow<List<Node>> =
            nodeDao.searchByName(normalizedQuery).map { list -> list.map { it.toDomain() } }

        override fun observeTrashRoots(): Flow<List<Node>> =
            nodeDao.observeTrashRoots().map { list -> list.map { it.toDomain() } }

        override suspend fun childNamesNormalized(parentId: String?): Set<String> =
            nodeDao.childNamesNormalized(parentId).toSet()

        override suspend fun createFolder(
            parentId: String?,
            name: String,
        ): Node {
            require(name.isNotBlank()) { "tên thư mục trống" }
            val now = timeProvider.nowMillis()
            val uniqueName = resolveUniqueName(parentId, name.trim())
            val node =
                NodeEntity(
                    id = UUID.randomUUID().toString(),
                    parentId = parentId,
                    type = NodeType.FOLDER.name,
                    name = uniqueName,
                    nameNormalized = NameNormalizer.normalize(uniqueName),
                    mimeType = null,
                    sizeBytes = 0,
                    sha256 = null,
                    chunkCount = 0,
                    chunkSize = 0,
                    encrypted = false,
                    status = NodeStatus.READY.name,
                    createdAt = now,
                    modifiedAt = now,
                    trashedAt = null,
                    trashRootId = null,
                )
            nodeDao.upsert(node)
            configRepository.incrementLocalRevision()
            return node.toDomain()
        }

        override suspend fun renameNode(
            id: String,
            newName: String,
        ) {
            require(newName.isNotBlank()) { "tên trống" }
            val node = nodeDao.getById(id) ?: throw IllegalArgumentException("node không tồn tại")
            if (node.name == newName.trim()) return
            val uniqueName = resolveUniqueName(node.parentId, newName.trim())
            nodeDao.rename(id, uniqueName, NameNormalizer.normalize(uniqueName), timeProvider.nowMillis())
            configRepository.incrementLocalRevision()
        }

        override suspend fun moveNode(
            id: String,
            newParentId: String?,
        ) {
            val node = nodeDao.getById(id) ?: throw IllegalArgumentException("node không tồn tại")
            if (node.parentId == newParentId) return
            if (newParentId != null) {
                val target =
                    nodeDao.getById(newParentId)
                        ?: throw IllegalArgumentException("thư mục đích không tồn tại")
                require(target.type == NodeType.FOLDER.name) { "đích không phải thư mục" }
                require(newParentId != id) { "không thể di chuyển vào chính nó" }
                require(newParentId !in nodeDao.subtreeIds(id)) {
                    "không thể di chuyển thư mục vào hậu duệ của nó"
                }
            }
            val uniqueName = resolveUniqueName(newParentId, node.name)
            nodeDao.move(id, newParentId, uniqueName, NameNormalizer.normalize(uniqueName), timeProvider.nowMillis())
            configRepository.incrementLocalRevision()
        }

        override suspend fun createPendingUpload(
            parentId: String?,
            name: String,
            mimeType: String?,
            sizeBytes: Long,
            sourceUri: String?,
            stagingPath: String?,
        ): Pair<Node, Transfer> {
            require(name.isNotBlank()) { "tên tệp trống" }
            require(sizeBytes > 0) { "tệp rỗng — từ chối (SPEC §10.1)" }
            val now = timeProvider.nowMillis()
            val uniqueName = resolveUniqueName(parentId, name)
            val node =
                NodeEntity(
                    id = UUID.randomUUID().toString(),
                    parentId = parentId,
                    type = NodeType.FILE.name,
                    name = uniqueName,
                    nameNormalized = NameNormalizer.normalize(uniqueName),
                    mimeType = mimeType,
                    sizeBytes = sizeBytes,
                    sha256 = null,
                    chunkCount = 0,
                    chunkSize = configRepository.current().chunkSizeBytes,
                    encrypted = configRepository.current().encryptionEnabled,
                    status = NodeStatus.PENDING.name,
                    createdAt = now,
                    modifiedAt = now,
                    trashedAt = null,
                    trashRootId = null,
                )
            val transfer =
                TransferEntity(
                    id = UUID.randomUUID().toString(),
                    nodeId = node.id,
                    direction = TransferDirection.UPLOAD.name,
                    state = TransferState.QUEUED.name,
                    bytesDone = 0,
                    bytesTotal = sizeBytes,
                    currentChunk = 0,
                    sourceUri = sourceUri,
                    destUri = null,
                    stagingPath = stagingPath,
                    errorCode = null,
                    errorMessage = null,
                    retryCount = 0,
                    createdAt = now,
                    updatedAt = now,
                )
            db.withTransaction {
                nodeDao.upsert(node)
                transferDao.upsert(transfer)
            }
            configRepository.incrementLocalRevision()
            return node.toDomain() to transfer.toDomain()
        }

        override suspend fun trashNodes(rootIds: List<String>) {
            val now = timeProvider.nowMillis()
            for (rootId in rootIds) {
                val subtree = nodeDao.subtreeIds(rootId)
                nodeDao.markTrashed(subtree, now, rootId)
            }
            configRepository.incrementLocalRevision()
        }

        override suspend fun restoreFromTrash(rootId: String) {
            nodeDao.restoreTrash(rootId)
            configRepository.incrementLocalRevision()
        }

        override suspend fun deletePermanently(id: String): DeleteOutcome {
            val root = nodeDao.getById(id) ?: return DeleteOutcome(0, 0)
            val ids = nodeDao.subtreeIds(id)
            val chunks = ids.flatMap { chunkDao.forNode(it) }

            var deleted = 0
            var orphaned = 0
            val gateway = gatewayHolder.current()
            for (chunk in chunks) {
                val chatId = chunk.tgChatId
                val messageId = chunk.tgMessageId
                if (chatId == null || messageId == null) continue
                when (val result = deleteMessageWithRetry(gateway, chatId, messageId)) {
                    DeleteResult.Deleted, DeleteResult.AlreadyGone -> deleted++
                    is DeleteResult.Failed -> {
                        orphaned++
                        orphanChunkDao.insert(
                            OrphanChunkEntity(
                                tgChatId = chatId,
                                tgMessageId = messageId,
                                nodeName = root.name,
                                reason = result.reason,
                                createdAt = timeProvider.nowMillis(),
                            ),
                        )
                    }
                }
            }

            // Xoá Room CHỈ SAU KHI hết chunk (SPEC §10.4) — cascade xoá bản ghi chunks
            db.withTransaction {
                ids.forEach { nodeDao.deleteById(it) }
            }
            configRepository.incrementLocalRevision()
            return DeleteOutcome(deleted, orphaned)
        }

        override suspend fun purgeExpiredTrash(olderThanMillis: Long): Int {
            val cutoff = timeProvider.nowMillis() - olderThanMillis
            val roots = nodeDao.expiredTrashRootIds(cutoff)
            var purged = 0
            for (rootId in roots) {
                deletePermanently(rootId)
                purged++
            }
            return purged
        }

        override fun observeStorageStats(): Flow<StorageStats> =
            combine(nodeDao.observeFileStats(), chunkDao.observeTotalCount()) { stats, chunkCount ->
                StorageStats(
                    fileCount = stats.fileCount,
                    totalBytes = stats.totalBytes,
                    chunkCount = chunkCount,
                )
            }

        /** Tên duy nhất trong thư mục đích (FR-FILE-4). */
        private suspend fun resolveUniqueName(
            parentId: String?,
            desired: String,
        ): String {
            val existing = childNamesNormalized(parentId)
            return UniqueNameResolver.resolve(desired, existing)
        }

        /**
         * Xoá tin Telegram có chịu 429: RateLimited ném ra từ gateway đã đặt pauseUntil
         * trong rate limiter — thử lại sẽ tự chờ đúng nhịp (SPEC §9.3).
         */
        private suspend fun deleteMessageWithRetry(
            gateway: TelegramGateway,
            chatId: Long,
            messageId: Long,
        ): DeleteResult {
            var lastError: String? = null
            repeat(MAX_DELETE_ATTEMPTS) { attempt ->
                try {
                    return gateway.deleteMessage(chatId, messageId)
                } catch (e: AppError.RateLimited) {
                    lastError = e.message
                    Timber.w("deleteMessage bị rate limit (lần ${attempt + 1}), thử lại theo pauseUntil")
                }
            }
            return DeleteResult.Failed(lastError ?: "rate limit kéo dài")
        }

        private companion object {
            const val MAX_DELETE_ATTEMPTS = 3
        }
    }
