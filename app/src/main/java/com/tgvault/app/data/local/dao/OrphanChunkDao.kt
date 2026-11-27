package com.tgvault.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import com.tgvault.app.data.local.entity.OrphanChunkEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface OrphanChunkDao {

    @Insert
    suspend fun insert(orphan: OrphanChunkEntity)

    @Query("SELECT * FROM orphan_chunks ORDER BY createdAt DESC")
    fun observeAll(): Flow<List<OrphanChunkEntity>>

    @Query("SELECT COUNT(*) FROM orphan_chunks")
    fun observeCount(): Flow<Int>

    @Query("DELETE FROM orphan_chunks")
    suspend fun deleteAll()
}
