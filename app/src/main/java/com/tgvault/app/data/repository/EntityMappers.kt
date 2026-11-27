package com.tgvault.app.data.repository

import com.tgvault.app.data.local.entity.ChunkEntity
import com.tgvault.app.data.local.entity.NodeEntity
import com.tgvault.app.data.local.entity.TransferEntity
import com.tgvault.app.domain.model.Chunk
import com.tgvault.app.domain.model.Node
import com.tgvault.app.domain.model.NodeStatus
import com.tgvault.app.domain.model.NodeType
import com.tgvault.app.domain.model.Transfer
import com.tgvault.app.domain.model.TransferDirection
import com.tgvault.app.domain.model.TransferState

fun NodeEntity.toDomain(): Node = Node(
    id = id,
    parentId = parentId,
    type = NodeType.valueOf(type),
    name = name,
    nameNormalized = nameNormalized,
    mimeType = mimeType,
    sizeBytes = sizeBytes,
    sha256 = sha256,
    chunkCount = chunkCount,
    chunkSize = chunkSize,
    encrypted = encrypted,
    status = NodeStatus.valueOf(status),
    createdAt = createdAt,
    modifiedAt = modifiedAt,
    trashedAt = trashedAt,
    trashRootId = trashRootId
)

fun Node.toEntity(): NodeEntity = NodeEntity(
    id = id,
    parentId = parentId,
    type = type.name,
    name = name,
    nameNormalized = nameNormalized,
    mimeType = mimeType,
    sizeBytes = sizeBytes,
    sha256 = sha256,
    chunkCount = chunkCount,
    chunkSize = chunkSize,
    encrypted = encrypted,
    status = status.name,
    createdAt = createdAt,
    modifiedAt = modifiedAt,
    trashedAt = trashedAt,
    trashRootId = trashRootId
)

fun ChunkEntity.toDomain(): Chunk = Chunk(
    id = id,
    nodeId = nodeId,
    idx = idx,
    plainSizeBytes = plainSizeBytes,
    storedSizeBytes = storedSizeBytes,
    tgChatId = tgChatId,
    tgMessageId = tgMessageId,
    tgFileId = tgFileId,
    tgFileUniqueId = tgFileUniqueId,
    sha256 = sha256
)

fun Chunk.toEntity(): ChunkEntity = ChunkEntity(
    id = id,
    nodeId = nodeId,
    idx = idx,
    plainSizeBytes = plainSizeBytes,
    storedSizeBytes = storedSizeBytes,
    tgChatId = tgChatId,
    tgMessageId = tgMessageId,
    tgFileId = tgFileId,
    tgFileUniqueId = tgFileUniqueId,
    sha256 = sha256
)

fun TransferEntity.toDomain(): Transfer = Transfer(
    id = id,
    nodeId = nodeId,
    direction = TransferDirection.valueOf(direction),
    state = TransferState.valueOf(state),
    bytesDone = bytesDone,
    bytesTotal = bytesTotal,
    currentChunk = currentChunk,
    sourceUri = sourceUri,
    destUri = destUri,
    stagingPath = stagingPath,
    errorCode = errorCode,
    errorMessage = errorMessage,
    retryCount = retryCount,
    createdAt = createdAt,
    updatedAt = updatedAt
)

fun Transfer.toEntity(): TransferEntity = TransferEntity(
    id = id,
    nodeId = nodeId,
    direction = direction.name,
    state = state.name,
    bytesDone = bytesDone,
    bytesTotal = bytesTotal,
    currentChunk = currentChunk,
    sourceUri = sourceUri,
    destUri = destUri,
    stagingPath = stagingPath,
    errorCode = errorCode,
    errorMessage = errorMessage,
    retryCount = retryCount,
    createdAt = createdAt,
    updatedAt = updatedAt
)
