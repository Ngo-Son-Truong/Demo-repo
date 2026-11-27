package com.tgvault.app.data.local.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/** SPEC §8 TransferEntity — trạng thái truyền tải bền (sống sót khi app bị kill, SPEC §13). */
@Entity(
    tableName = "transfers",
    indices = [Index("nodeId"), Index("state")],
)
data class TransferEntity(
    @PrimaryKey val id: String,
    val nodeId: String,
    /** UPLOAD | DOWNLOAD */
    val direction: String,
    /** QUEUED | RUNNING | PAUSED | FAILED | DONE | CANCELLED */
    val state: String,
    val bytesDone: Long,
    val bytesTotal: Long,
    val currentChunk: Int,
    /** upload: Uri nguồn */
    val sourceUri: String?,
    /** download: Uri đích (SAF) */
    val destUri: String?,
    /** file tạm nội bộ (share-in staging / download cache) */
    val stagingPath: String?,
    val errorCode: String?,
    val errorMessage: String?,
    val retryCount: Int,
    val createdAt: Long,
    val updatedAt: Long,
)
