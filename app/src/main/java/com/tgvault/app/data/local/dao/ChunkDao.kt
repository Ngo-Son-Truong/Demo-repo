package com.tgvault.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.tgvault.app.data.local.entity.ChunkEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ChunkDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(chunk: ChunkEntity): Long

    @Query("SELECT * FROM chunks WHERE nodeId = :nodeId AND idx = :idx")
    suspend fun get(nodeId: String, idx: Int): ChunkEntity?

    @Query("SELECT * FROM chunks WHERE nodeId = :nodeId ORDER BY idx ASC")
    suspend fun forNode(nodeId: String): List<ChunkEntity>

    /** Số byte plaintext đã upload xong — cơ sở resume theo chunk (FR-TR-3) */
    @Query("SELECT COALESCE(SUM(plainSizeBytes), 0) FROM chunks WHERE nodeId = :nodeId AND tgFileId IS NOT NULL")
    suspend fun uploadedPlainBytes(nodeId: String): Long

    @Query("SELECT COUNT(*) FROM chunks WHERE nodeId = :nodeId AND tgFileId IS NOT NULL")
    suspend fun uploadedCount(nodeId: String): Int

    @Query("SELECT COUNT(*) FROM chunks")
    fun observeTotalCount(): Flow<Long>

    @Query("DELETE FROM chunks WHERE nodeId = :nodeId")
    suspend fun deleteForNode(nodeId: String)
}
