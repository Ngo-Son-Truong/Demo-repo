package com.tgvault.app.data.local.entity

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

/** SPEC §8 ChunkEntity. Ràng buộc duy nhất (nodeId, idx); xoá node → cascade xoá chunk. */
@Entity(
    tableName = "chunks",
    foreignKeys = [
        ForeignKey(
            entity = NodeEntity::class,
            parentColumns = ["id"],
            childColumns = ["nodeId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index(value = ["nodeId", "idx"], unique = true)],
)
data class ChunkEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val nodeId: String,
    val idx: Int,
    val plainSizeBytes: Long,
    val storedSizeBytes: Long,
    val tgChatId: Long?,
    val tgMessageId: Long?,
    val tgFileId: String?,
    val tgFileUniqueId: String?,
    /** SHA-256 hex của byte đã lưu trên Telegram */
    val sha256: String?,
)
