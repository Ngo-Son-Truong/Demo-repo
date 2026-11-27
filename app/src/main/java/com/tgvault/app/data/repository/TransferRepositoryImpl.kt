package com.tgvault.app.data.repository

import com.tgvault.app.core.common.TimeProvider
import com.tgvault.app.data.local.dao.TransferDao
import com.tgvault.app.domain.model.Transfer
import com.tgvault.app.domain.model.TransferState
import com.tgvault.app.domain.repository.TransferRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TransferRepositoryImpl @Inject constructor(
    private val transferDao: TransferDao,
    private val timeProvider: TimeProvider,
) : TransferRepository {

    override fun observeAll(): Flow<List<Transfer>> =
        transferDao.observeAll().map { list -> list.map { it.toDomain() } }

    override fun observeActive(): Flow<List<Transfer>> =
        transferDao.observeActive().map { list -> list.map { it.toDomain() } }

    override fun observeById(id: String): Flow<Transfer?> =
        transferDao.observeById(id).map { it?.toDomain() }

    override suspend fun getById(id: String): Transfer? = transferDao.getById(id)?.toDomain()

    override suspend fun setPaused(id: String, paused: Boolean) {
        val target = if (paused) TransferState.PAUSED.name else TransferState.QUEUED.name
        transferDao.updateState(id, target, timeProvider.nowMillis())
    }

    override suspend fun cancel(id: String) {
        transferDao.updateState(id, TransferState.CANCELLED.name, timeProvider.nowMillis())
    }

    override suspend fun retry(id: String) {
        transferDao.markRetry(id, timeProvider.nowMillis())
    }

    override suspend fun requeueOrphanedRunning(): Int =
        transferDao.requeueRunning(timeProvider.nowMillis())

    override suspend fun clearFinished() {
        transferDao.deleteFinished()
    }
}
