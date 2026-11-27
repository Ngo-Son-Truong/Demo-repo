package com.tgvault.app.data.local.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/** Tệp và thư mục dùng chung một bảng (SPEC §8). Enum lưu dạng String, map ở EntityMappers. */
@Entity(
    tableName = "nodes",
    indices = [Index("parentId"), Index("nameNormalized"), Index("trashRootId")]
)
data class NodeEntity(
    @PrimaryKey val id: String,
    /** null = thư mục gốc */
    val parentId: String?,
    /** FOLDER | FILE */
    val type: String,
    val name: String,
    /** chữ thường, bỏ dấu — phục vụ tìm kiếm (FR-FILE-6) */
    val nameNormalized: String,
    val mimeType: String?,
    /** kích thước tệp gốc (plaintext) */
    val sizeBytes: Long,
    /** SHA-256 hex của tệp gốc */
    val sha256: String?,
    val chunkCount: Int,
    /** kích thước chunk lúc upload (lưu lại để không phụ thuộc cấu hình sau này) */
    val chunkSize: Int,
    val encrypted: Boolean,
    /** PENDING | UPLOADING | READY | FAILED */
    val status: String,
    val createdAt: Long,
    val modifiedAt: Long,
    /** null = không ở thùng rác */
    val trashedAt: Long?,
    /** khi xoá thư mục: mọi hậu duệ nhận trashRootId = id thư mục gốc bị xoá */
    val trashRootId: String?
)
