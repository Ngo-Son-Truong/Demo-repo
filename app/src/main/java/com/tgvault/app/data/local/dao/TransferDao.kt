package com.tgvault.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.tgvault.app.data.local.entity.TransferEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface TransferDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(transfer: TransferEntity)

    @Query("SELECT * FROM transfers WHERE id = :id")
    suspend fun getById(id: String): TransferEntity?

    @Query("SELECT * FROM transfers WHERE id = :id")
    fun observeById(id: String): Flow<TransferEntity?>

    /** Đang chạy trước, hoàn tất/huỷ sau; mới cập nhật lên đầu (SPEC §15.3 màn 6) */
    @Query(
        """
        SELECT * FROM transfers
        ORDER BY CASE state
            WHEN 'RUNNING' THEN 0
            WHEN 'QUEUED' THEN 1
            WHEN 'PAUSED' THEN 2
            WHEN 'FAILED' THEN 3
            ELSE 4 END,
        updatedAt DESC
        """
    )
    fun observeAll(): Flow<List<TransferEntity>>

    @Query("SELECT * FROM transfers WHERE state IN ('QUEUED', 'RUNNING', 'PAUSED') ORDER BY updatedAt ASC")
    fun observeActive(): Flow<List<TransferEntity>>

    @Query("UPDATE transfers SET state = :state, updatedAt = :updatedAt WHERE id = :id")
    suspend fun updateState(id: String, state: String, updatedAt: Long)

    @Query(
        """
        UPDATE transfers SET bytesDone = :bytesDone, bytesTotal = :bytesTotal,
        currentChunk = :currentChunk, updatedAt = :updatedAt WHERE id = :id
        """
    )
    suspend fun updateProgress(id: String, bytesDone: Long, bytesTotal: Long, currentChunk: Int, updatedAt: Long)

    @Query(
        """
        UPDATE transfers SET state = :state, errorCode = :errorCode, errorMessage = :errorMessage,
        updatedAt = :updatedAt WHERE id = :id
        """
    )
    suspend fun updateError(id: String, state: String, errorCode: String?, errorMessage: String?, updatedAt: Long)

    /** M3-5: RUNNING mồ côi sau khi app bị kill → QUEUED */
    @Query("UPDATE transfers SET state = 'QUEUED', updatedAt = :now WHERE state = 'RUNNING'")
    suspend fun requeueRunning(now: Long): Int

    @Query(
        """
        UPDATE transfers SET retryCount = retryCount + 1, state = 'QUEUED',
        errorCode = NULL, errorMessage = NULL, updatedAt = :now WHERE id = :id
        """
    )
    suspend fun markRetry(id: String, now: Long)

    @Query("DELETE FROM transfers WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM transfers WHERE state IN ('DONE', 'CANCELLED')")
    suspend fun deleteFinished(): Int

    @Query("SELECT COUNT(*) FROM transfers WHERE state = 'RUNNING' AND direction = :direction")
    suspend fun runningCount(direction: String): Int
}
