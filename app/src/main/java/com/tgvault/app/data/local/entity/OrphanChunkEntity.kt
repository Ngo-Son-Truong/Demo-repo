package com.tgvault.app.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Dữ liệu còn sót trên Telegram do deleteMessage thất bại (SPEC §10.4) —
 * hiển thị cảnh báo một lần để người dùng xoá thủ công trong channel.
 */
@Entity(tableName = "orphan_chunks")
data class OrphanChunkEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val tgChatId: Long,
    val tgMessageId: Long,
    /** tên node gốc để hiển thị */
    val nodeName: String,
    val reason: String?,
    val createdAt: Long
)
