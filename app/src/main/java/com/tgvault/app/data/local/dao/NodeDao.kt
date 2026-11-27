package com.tgvault.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.RawQuery
import androidx.sqlite.db.SupportSQLiteQuery
import com.tgvault.app.data.local.entity.NodeEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface NodeDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(node: NodeEntity)

    @Query("SELECT * FROM nodes WHERE id = :id")
    suspend fun getById(id: String): NodeEntity?

    @Query("SELECT * FROM nodes WHERE id = :id")
    fun observeById(id: String): Flow<NodeEntity?>

    /**
     * Duyệt con của một thư mục có sắp xếp động (FR-FILE-1).
     * Sort động nên dùng RawQuery — câu SQL dựng ở NodeRepositoryImpl.
     */
    @RawQuery(observedEntities = [NodeEntity::class])
    fun observeChildrenSorted(query: SupportSQLiteQuery): Flow<List<NodeEntity>>

    @Query("SELECT nameNormalized FROM nodes WHERE parentId IS :parentId AND trashedAt IS NULL")
    suspend fun childNamesNormalized(parentId: String?): List<String>

    @Query(
        """
        SELECT * FROM nodes
        WHERE nameNormalized LIKE '%' || :normalizedQuery || '%' AND trashedAt IS NULL
        ORDER BY nameNormalized ASC
        """,
    )
    fun searchByName(normalizedQuery: String): Flow<List<NodeEntity>>

    /** Cây con (gồm cả gốc) — WITH RECURSIVE; nếu Room verifier kêu thì chuyển RawQuery (xem PROGRESS). */
    @Query(
        """
        WITH RECURSIVE subtree(id) AS (
            SELECT id FROM nodes WHERE id = :rootId
            UNION ALL
            SELECT n.id FROM nodes n JOIN subtree s ON n.parentId = s.id
        )
        SELECT id FROM subtree
        """,
    )
    suspend fun subtreeIds(rootId: String): List<String>

    @Query("UPDATE nodes SET trashedAt = :trashedAt, trashRootId = :trashRootId WHERE id IN (:ids)")
    suspend fun markTrashed(
        ids: List<String>,
        trashedAt: Long?,
        trashRootId: String?,
    )

    @Query("UPDATE nodes SET trashedAt = NULL, trashRootId = NULL WHERE trashRootId = :trashRootId")
    suspend fun restoreTrash(trashRootId: String)

    /** Thùng rác chỉ liệt kê nút có id == trashRootId (SPEC §8) */
    @Query("SELECT * FROM nodes WHERE id = trashRootId AND trashedAt IS NOT NULL ORDER BY trashedAt DESC")
    fun observeTrashRoots(): Flow<List<NodeEntity>>

    /** Gốc của các cụm trong thùng rác đã quá hạn (dọn tự động — FR-FILE-5) */
    @Query("SELECT id FROM nodes WHERE id = trashRootId AND trashedAt IS NOT NULL AND trashedAt < :cutoff")
    suspend fun expiredTrashRootIds(cutoff: Long): List<String>

    @Query("UPDATE nodes SET name = :name, nameNormalized = :nameNormalized, modifiedAt = :modifiedAt WHERE id = :id")
    suspend fun rename(
        id: String,
        name: String,
        nameNormalized: String,
        modifiedAt: Long,
    )

    @Query(
        """
        UPDATE nodes SET parentId = :newParentId, name = :name, nameNormalized = :nameNormalized,
        modifiedAt = :modifiedAt WHERE id = :id
        """,
    )
    suspend fun move(
        id: String,
        newParentId: String?,
        name: String,
        nameNormalized: String,
        modifiedAt: Long,
    )

    @Query("UPDATE nodes SET status = :status WHERE id = :id")
    suspend fun updateStatus(
        id: String,
        status: String,
    )

    @Query(
        """
        UPDATE nodes SET sha256 = :sha256, chunkCount = :chunkCount, chunkSize = :chunkSize,
        status = :status, modifiedAt = :modifiedAt WHERE id = :id
        """,
    )
    suspend fun updateUploadMeta(
        id: String,
        sha256: String?,
        chunkCount: Int,
        chunkSize: Int,
        status: String,
        modifiedAt: Long,
    )

    @Query("DELETE FROM nodes WHERE id = :id")
    suspend fun deleteById(id: String)

    // --- Thống kê (FR-SET-3) ---

    @Query(
        """
        SELECT COUNT(*) AS fileCount, COALESCE(SUM(sizeBytes), 0) AS totalBytes
        FROM nodes WHERE type = 'FILE' AND trashedAt IS NULL
        """,
    )
    fun observeFileStats(): Flow<FileStatsTuple>

    @Query("SELECT COUNT(*) FROM nodes")
    suspend fun countAll(): Long
}

/** Projection cho thống kê. */
data class FileStatsTuple(val fileCount: Long, val totalBytes: Long)
