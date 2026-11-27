package com.tgvault.app.domain.model

import com.tgvault.app.core.common.AppError

enum class NodeType { FOLDER, FILE }

enum class NodeStatus { PENDING, UPLOADING, READY, FAILED }

/** Node = tệp hoặc thư mục (SPEC §8 NodeEntity). id là UUID dạng chuỗi. */
data class Node(
    val id: String,
    val parentId: String?,
    val type: NodeType,
    val name: String,
    val nameNormalized: String,
    val mimeType: String?,
    val sizeBytes: Long,
    val sha256: String?,
    val chunkCount: Int,
    val chunkSize: Int,
    val encrypted: Boolean,
    val status: NodeStatus,
    val createdAt: Long,
    val modifiedAt: Long,
    val trashedAt: Long?,
    val trashRootId: String?
) {
    val isFolder: Boolean get() = type == NodeType.FOLDER
    val isTrashed: Boolean get() = trashedAt != null
}

/** Chunk đã (hoặc sẽ) upload — SPEC §8 ChunkEntity. */
data class Chunk(
    val id: Long,
    val nodeId: String,
    val idx: Int,
    val plainSizeBytes: Long,
    val storedSizeBytes: Long,
    val tgChatId: Long?,
    val tgMessageId: Long?,
    val tgFileId: String?,
    val tgFileUniqueId: String?,
    /** SHA-256 hex của byte ĐÃ LƯU trên Telegram (bản mã nếu mã hoá) */
    val sha256: String?
) {
    val isUploaded: Boolean get() = tgFileId != null
}

enum class TransferDirection { UPLOAD, DOWNLOAD }

enum class TransferState { QUEUED, RUNNING, PAUSED, FAILED, DONE, CANCELLED }

/** Hàng đợi truyền tải — SPEC §8 TransferEntity. Trạng thái nguồn sự thật ở Room (SPEC §13). */
data class Transfer(
    val id: String,
    val nodeId: String,
    val direction: TransferDirection,
    val state: TransferState,
    val bytesDone: Long,
    val bytesTotal: Long,
    val currentChunk: Int,
    val sourceUri: String?,
    val destUri: String?,
    val stagingPath: String?,
    val errorCode: String?,
    val errorMessage: String?,
    val retryCount: Int,
    val createdAt: Long,
    val updatedAt: Long
) {
    val progress: Float
        get() = if (bytesTotal <= 0L) 0f else (bytesDone.toFloat() / bytesTotal).coerceIn(0f, 1f)
}

/** errorCode lưu trong TransferEntity (UI map sang chuỗi thân thiện — SPEC §15.1.3) */
object TransferErrorCodes {
    const val AUTH = "AUTH"
    const val NETWORK = "NETWORK"
    const val RATE_LIMITED = "RATE_LIMITED"
    const val INTEGRITY = "INTEGRITY"
    const val SOURCE_CHANGED = "SOURCE_CHANGED"
    const val CHUNK_TOO_LARGE = "CHUNK_TOO_LARGE"
    const val UNKNOWN = "UNKNOWN"
}

/** Map AppError → errorCode (redact token trong message — SPEC §14). */
fun AppError.toTransferErrorCode(): String = when (this) {
    is AppError.InvalidToken, is AppError.BotNoAccess, is AppError.ChannelNotFound,
    is AppError.NotConnected -> TransferErrorCodes.AUTH
    is AppError.RateLimited -> TransferErrorCodes.RATE_LIMITED
    is AppError.Transient -> TransferErrorCodes.NETWORK
    is AppError.IntegrityMismatch -> TransferErrorCodes.INTEGRITY
    is AppError.SourceChanged -> TransferErrorCodes.SOURCE_CHANGED
    is AppError.ChunkTooLarge -> TransferErrorCodes.CHUNK_TOO_LARGE
    else -> TransferErrorCodes.UNKNOWN
}

/** Quy tắc chunk (SPEC §10.1). */
object ChunkRules {
    /** 19 MiB = 19.922.944 byte — nhỏ hơn giới hạn getFile 20 MB theo cả hai cách hiểu */
    const val DEFAULT_CHUNK_SIZE: Int = 19 * 1024 * 1024

    /** Không được vượt 19 MiB khi dùng Bot API công cộng */
    const val MAX_CHUNK_SIZE: Int = DEFAULT_CHUNK_SIZE
}

enum class NodeSortField { NAME, DATE, SIZE }

data class NodeSort(
    val field: NodeSortField = NodeSortField.NAME,
    val ascending: Boolean = true
)

data class StorageStats(val fileCount: Long, val totalBytes: Long, val chunkCount: Long)

data class DeleteOutcome(val deletedChunks: Int, val orphanedChunks: Int)
