package com.tgvault.app.data.repository

import com.tgvault.app.core.common.TimeProvider
import com.tgvault.app.data.local.dao.TransferDao
import com.tgvault.app.data.local.entity.TransferEntity
import com.tgvault.app.domain.model.Transfer
import com.tgvault.app.domain.model.TransferDirection
import com.tgvault.app.domain.model.TransferState
import com.tgvault.app.domain.repository.TransferRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TransferRepositoryImpl
    @Inject
    constructor(
        private val transferDao: TransferDao,
        private val timeProvider: TimeProvider,
    ) : TransferRepository {
        override fun observeAll(): Flow<List<Transfer>> =
            transferDao.observeAll().map { list -> list.map { it.toDomain() } }

        override fun observeActive(): Flow<List<Transfer>> =
            transferDao.observeActive().map { list -> list.map { it.toDomain() } }

        override fun observeById(id: String): Flow<Transfer?> = transferDao.observeById(id).map { it?.toDomain() }

        override suspend fun getById(id: String): Transfer? = transferDao.getById(id)?.toDomain()

        override suspend fun setPaused(
            id: String,
            paused: Boolean,
        ) {
            val target = if (paused) TransferState.PAUSED.name else TransferState.QUEUED.name
            transferDao.updateState(id, target, timeProvider.nowMillis())
        }

        override suspend fun cancel(id: String) {
            transferDao.updateState(id, TransferState.CANCELLED.name, timeProvider.nowMillis())
        }

        override suspend fun retry(id: String) {
            transferDao.markRetry(id, timeProvider.nowMillis())
        }

        override suspend fun queuedIds(): List<String> = transferDao.queuedIds()

        override suspend fun createDownload(
            nodeId: String,
            bytesTotal: Long,
        ): Transfer {
            val now = timeProvider.nowMillis()
            val entity =
                TransferEntity(
                    id = "dl-$nodeId",
                    nodeId = nodeId,
                    direction = TransferDirection.DOWNLOAD.name,
                    state = TransferState.QUEUED.name,
                    bytesDone = 0,
                    bytesTotal = bytesTotal,
                    currentChunk = 0,
                    sourceUri = null,
                    destUri = null,
                    stagingPath = null,
                    errorCode = null,
                    errorMessage = null,
                    retryCount = 0,
                    createdAt = now,
                    updatedAt = now,
                )
            transferDao.upsert(entity)
            return entity.toDomain()
        }

        override suspend fun requeue(id: String) {
            transferDao.requeue(id, timeProvider.nowMillis())
        }

        override suspend fun requeueOrphanedRunning(): Int = transferDao.requeueRunning(timeProvider.nowMillis())

        override suspend fun clearFinished() {
            transferDao.deleteFinished()
        }
    }
