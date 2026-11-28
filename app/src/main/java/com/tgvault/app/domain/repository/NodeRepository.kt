package com.tgvault.app.domain.repository

import com.tgvault.app.domain.model.DeleteOutcome
import com.tgvault.app.domain.model.Node
import com.tgvault.app.domain.model.NodeSort
import com.tgvault.app.domain.model.StorageStats
import com.tgvault.app.domain.model.Transfer
import kotlinx.coroutines.flow.Flow

/** Danh mục tệp — Room là nguồn sự thật (SPEC D6). */
interface NodeRepository {
    fun observeChildren(
        parentId: String?,
        sort: NodeSort,
    ): Flow<List<Node>>

    fun observeNode(id: String): Flow<Node?>

    suspend fun getNode(id: String): Node?

    /** Danh sách chunk đã upload của node (theo thứ tự idx) — phục vụ streaming (M9+). */
    suspend fun getChunks(nodeId: String): List<com.tgvault.app.domain.model.Chunk>

    /** Tìm theo tên đã chuẩn hoá (bỏ dấu), bỏ qua thùng rác (FR-FILE-6). */
    fun searchByName(normalizedQuery: String): Flow<List<Node>>

    /** Thùng rác: chỉ các nút gốc bị xoá (id == trashRootId) — SPEC §8. */
    fun observeTrashRoots(): Flow<List<Node>>

    /** nameNormalized của các con trực tiếp (phục vụ kiểm tra trùng tên). */
    suspend fun childNamesNormalized(parentId: String?): Set<String>

    suspend fun createFolder(
        parentId: String?,
        name: String,
    ): Node

    suspend fun renameNode(
        id: String,
        newName: String,
    )

    /** Chặn di chuyển thư mục vào chính hậu duệ của nó (PLAN M2-7). */
    suspend fun moveNode(
        id: String,
        newParentId: String?,
    )

    /** Tạo Node(PENDING) + Transfer(QUEUED) trong một transaction (SPEC §10.2.1). */
    suspend fun createPendingUpload(
        parentId: String?,
        name: String,
        mimeType: String?,
        sizeBytes: Long,
        sourceUri: String?,
        stagingPath: String?,
    ): Pair<Node, Transfer>

    /** Xoá mềm (đặt trashedAt/trashRootId cho cả cây con) — M5 dùng, thùng rác đầy đủ ở M9. */
    suspend fun trashNodes(rootIds: List<String>)

    suspend fun restoreFromTrash(rootId: String)

    /**
     * Xoá vĩnh viễn (SPEC §10.4): deleteMessage từng chunk (của cả cây con),
     * thất bại → OrphanChunkEntity; xoá Room sau khi hết chunk.
     */
    suspend fun deletePermanently(id: String): DeleteOutcome

    /** Xoá vĩnh viễn các mục trong thùng rác quá [olderThanMillis]. Trả về số gốc đã xoá. */
    suspend fun purgeExpiredTrash(olderThanMillis: Long): Int

    fun observeStorageStats(): Flow<StorageStats>
}
