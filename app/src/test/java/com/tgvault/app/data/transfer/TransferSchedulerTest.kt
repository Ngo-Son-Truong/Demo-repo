package com.tgvault.app.data.transfer

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.tgvault.app.domain.model.DriveConfig
import com.tgvault.app.domain.model.Transfer
import com.tgvault.app.domain.model.TransferDirection
import com.tgvault.app.domain.model.TransferState
import com.tgvault.app.domain.repository.ConfigRepository
import com.tgvault.app.domain.repository.TransferRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.UUID

/** M3-6: scheduler — enqueue unique work, pause/resume/cancel, phục hồi khi khởi động. */
@RunWith(RobolectricTestRunner::class)
class TransferSchedulerTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private lateinit var workManager: WorkManager
    private lateinit var transfers: FakeTransferRepository
    private lateinit var scheduler: TransferScheduler

    @Before
    fun setUp() {
        androidx.work.testing.WorkManagerTestInitHelper
            .initializeTestWorkManager(context)
        workManager = WorkManager.getInstance(context)
        transfers = FakeTransferRepository()
        scheduler = TransferScheduler(context, transfers, FakeConfigRepository())
    }

    @Test
    fun `enqueue tạo unique work theo transferId`() =
        runTest {
            scheduler.enqueue("t1")

            val infos = workManager.getWorkInfosForUniqueWork("transfer_t1").get()
            assertEquals(1, infos.size)
            assertEquals(WorkInfo.State.ENQUEUED, infos[0].state)
        }

    @Test
    fun `pause đặt PAUSED, resume về QUEUED và enqueue lại`() =
        runTest {
            transfers.put(transfer("t1", TransferState.RUNNING))
            scheduler.pause("t1")
            assertEquals(TransferState.PAUSED, transfers.getById("t1")?.state)

            scheduler.resume("t1")
            assertEquals(TransferState.QUEUED, transfers.getById("t1")?.state)
            assertTrue(workManager.getWorkInfosForUniqueWork("transfer_t1").get().isNotEmpty())
        }

    @Test
    fun `cancel đặt CANCELLED và huỷ work`() =
        runTest {
            transfers.put(transfer("t1", TransferState.RUNNING))
            scheduler.enqueue("t1")
            scheduler.cancel("t1")

            assertEquals(TransferState.CANCELLED, transfers.getById("t1")?.state)
            val infos = workManager.getWorkInfosForUniqueWork("transfer_t1").get()
            assertEquals(WorkInfo.State.CANCELLED, infos[0].state)
        }

    @Test
    fun `recoverOrphaned đưa RUNNING về QUEUED và enqueue lại`() =
        runTest {
            transfers.put(transfer("t1", TransferState.RUNNING))
            transfers.put(transfer("t2", TransferState.DONE))

            scheduler.recoverOrphaned()

            assertEquals(TransferState.QUEUED, transfers.getById("t1")?.state)
            assertTrue(workManager.getWorkInfosForUniqueWork("transfer_t1").get().isNotEmpty())
            // t2 DONE — không bị động vào
            assertEquals(TransferState.DONE, transfers.getById("t2")?.state)
        }

    private fun transfer(
        id: String,
        state: TransferState,
    ) = Transfer(
        id = id,
        nodeId = UUID.randomUUID().toString(),
        direction = TransferDirection.UPLOAD,
        state = state,
        bytesDone = 0,
        bytesTotal = 100,
        currentChunk = 0,
        sourceUri = null,
        destUri = null,
        stagingPath = null,
        errorCode = null,
        errorMessage = null,
        retryCount = 0,
        createdAt = 0,
        updatedAt = 0,
    )

    private class FakeTransferRepository : TransferRepository {
        private val items = MutableStateFlow<Map<String, Transfer>>(emptyMap())

        fun put(t: Transfer) {
            items.value = items.value + (t.id to t)
        }

        override fun observeAll(): Flow<List<Transfer>> = items.map { it.values.toList() }

        override fun observeActive(): Flow<List<Transfer>> =
            items.map { m ->
                m.values.filter {
                    it.state in setOf(TransferState.QUEUED, TransferState.RUNNING, TransferState.PAUSED)
                }
            }

        override fun observeById(id: String): Flow<Transfer?> = items.map { it[id] }

        override suspend fun getById(id: String): Transfer? = items.value[id]

        override suspend fun setPaused(
            id: String,
            paused: Boolean,
        ) {
            items.value[id]?.let {
                items.value =
                    items.value + (
                        id to
                            it.copy(
                                state = if (paused) TransferState.PAUSED else TransferState.QUEUED,
                            )
                    )
            }
        }

        override suspend fun cancel(id: String) {
            items.value[id]?.let { items.value = items.value + (id to it.copy(state = TransferState.CANCELLED)) }
        }

        override suspend fun retry(id: String) {
            items.value[id]?.let { items.value = items.value + (id to it.copy(state = TransferState.QUEUED)) }
        }

        override suspend fun queuedIds(): List<String> =
            items.value.values.filter { it.state == TransferState.QUEUED }.map { it.id }

        override suspend fun createDownload(
            nodeId: String,
            bytesTotal: Long,
        ): Transfer = error("không dùng trong test này")

        override suspend fun requeue(id: String) {
            items.value[id]?.let { items.value = items.value + (id to it.copy(state = TransferState.QUEUED)) }
        }

        override suspend fun requeueOrphanedRunning(): Int {
            var n = 0
            items.value.values.filter { it.state == TransferState.RUNNING }.forEach {
                items.value = items.value + (it.id to it.copy(state = TransferState.QUEUED))
                n++
            }
            return n
        }

        override suspend fun clearFinished() {
            items.value =
                items.value.filterValues {
                    it.state != TransferState.DONE && it.state != TransferState.CANCELLED
                }
        }
    }

    private class FakeConfigRepository : ConfigRepository {
        override val config: Flow<DriveConfig> = MutableStateFlow(DriveConfig.DEFAULT)

        override suspend fun current(): DriveConfig = DriveConfig.DEFAULT

        override suspend fun setConnection(
            botUsername: String,
            chatId: Long,
        ) {}

        override suspend fun clearConnection() {}

        override suspend fun setChunkSizeBytes(value: Int) {}

        override suspend fun setWifiOnly(value: Boolean) {}

        override suspend fun setMaxParallelTransfers(value: Int) {}

        override suspend fun setThemeMode(value: com.tgvault.app.domain.model.ThemeMode) {}

        override suspend fun setDynamicColor(value: Boolean) {}

        override suspend fun setLanguage(value: String?) {}

        override suspend fun setEncryptionEnabled(value: Boolean) {}

        override suspend fun setAppLock(
            enabled: Boolean,
            timeoutSec: Int,
        ) {}

        override suspend fun incrementLocalRevision(): Long = 1L

        override suspend fun setLocalRevision(value: Long) {}

        override suspend fun setLastIndexBackupAt(epochMillis: Long) {}

        override suspend fun setDownloadTreeUri(value: String?) {}

        override suspend fun setOnboardingDone(value: Boolean) {}
    }
}
