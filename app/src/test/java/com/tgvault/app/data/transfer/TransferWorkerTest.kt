package com.tgvault.app.data.transfer

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.ListenableWorker
import androidx.work.testing.TestListenableWorkerBuilder
import androidx.work.workDataOf
import com.tgvault.app.core.engine.TransferEngine
import com.tgvault.app.domain.model.Transfer
import com.tgvault.app.domain.model.TransferDirection
import com.tgvault.app.domain.model.TransferState
import com.tgvault.app.domain.repository.TransferRepository
import io.mockk.mockk
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** M3-6: worker — chọn engine theo direction, bỏ qua transfer không chạy, requeue khi hệ thống dừng. */
@RunWith(RobolectricTestRunner::class)
class TransferWorkerTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private lateinit var transfers: InMemoryTransferRepository
    private lateinit var uploadEngine: RecordingEngine
    private lateinit var downloadEngine: RecordingEngine

    @Before
    fun setUp() {
        transfers = InMemoryTransferRepository()
        uploadEngine = RecordingEngine()
        downloadEngine = RecordingEngine()
        TransferWorker.depsOverride = fakeDeps()
    }

    @After
    fun tearDown() {
        TransferWorker.depsOverride = null
    }

    @Test
    fun `transfer QUEUED chạy engine upload`() =
        runTest {
            transfers.put(transfer("t1", TransferState.QUEUED, TransferDirection.UPLOAD))

            val result = buildWorker("t1").doWork()

            assertEquals(ListenableWorker.Result.success(), result)
            assertEquals(listOf("t1"), uploadEngine.ranIds)
            assertTrue(downloadEngine.ranIds.isEmpty())
        }

    @Test
    fun `transfer QUEUED direction DOWNLOAD chạy engine download`() =
        runTest {
            transfers.put(transfer("t1", TransferState.QUEUED, TransferDirection.DOWNLOAD))

            buildWorker("t1").doWork()

            assertEquals(listOf("t1"), downloadEngine.ranIds)
            assertTrue(uploadEngine.ranIds.isEmpty())
        }

    @Test
    fun `transfer PAUSED thì worker thoát êm, không gọi engine`() =
        runTest {
            transfers.put(transfer("t1", TransferState.PAUSED, TransferDirection.UPLOAD))

            val result = buildWorker("t1").doWork()

            assertEquals(ListenableWorker.Result.success(), result)
            assertTrue(uploadEngine.ranIds.isEmpty())
        }

    @Test
    fun `engine ném CancellationException khi state KHÔNG phải CANCELLED → requeue về QUEUED`() =
        runTest {
            transfers.put(transfer("t1", TransferState.QUEUED, TransferDirection.UPLOAD))
            uploadEngine.error = CancellationException("system stop")

            var thrown = false
            try {
                buildWorker("t1").doWork()
            } catch (e: CancellationException) {
                thrown = true
            }

            assertTrue(thrown)
            assertEquals(TransferState.QUEUED, transfers.getById("t1")?.state)
        }

    @Test
    fun `user huỷ (state CANCELLED) thì worker KHÔNG requeue`() =
        runTest {
            transfers.put(transfer("t1", TransferState.RUNNING, TransferDirection.UPLOAD))
            uploadEngine.error = CancellationException("cancelUniqueWork")
            uploadEngine.onRun = { transfers.cancel("t1") } // user bấm huỷ trong lúc chạy

            var thrown = false
            try {
                buildWorker("t1").doWork()
            } catch (e: CancellationException) {
                thrown = true
            }

            assertTrue(thrown)
            assertEquals(TransferState.CANCELLED, transfers.getById("t1")?.state)
        }

    @Test
    fun `transfer không tồn tại → failure, không crash`() =
        runTest {
            val result = buildWorker("ghost").doWork()
            assertEquals(ListenableWorker.Result.failure(), result)
            assertFalse(uploadEngine.ranIds.isNotEmpty())
        }

    private fun buildWorker(id: String): TransferWorker =
        TestListenableWorkerBuilder<TransferWorker>(context)
            .setInputData(workDataOf(TransferWorker.KEY_TRANSFER_ID to id))
            .build()

    private fun fakeDeps() =
        object : TransferWorker.Deps {
            override fun uploadEngine(): TransferEngine = uploadEngine

            override fun downloadEngine(): TransferEngine = downloadEngine

            override fun transferRepository(): TransferRepository = transfers

            override fun notifier(): TransferNotifier = TransferNotifier(context, transfers, mockk(relaxed = true))

            override fun concurrency(): TransferConcurrency = TransferConcurrency()
        }

    private fun transfer(
        id: String,
        state: TransferState,
        direction: TransferDirection,
    ) = Transfer(
        id = id,
        nodeId = "node-$id",
        direction = direction,
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

    private class RecordingEngine : TransferEngine {
        val ranIds = mutableListOf<String>()
        var error: Throwable? = null
        var onRun: suspend () -> Unit = {}

        override suspend fun run(transferId: String): Boolean {
            ranIds.add(transferId)
            onRun()
            error?.let { throw it }
            return true
        }
    }

    private class InMemoryTransferRepository : TransferRepository {
        private val items = MutableStateFlow<Map<String, Transfer>>(emptyMap())

        fun put(t: Transfer) {
            items.value = items.value + (t.id to t)
        }

        override fun observeAll(): Flow<List<Transfer>> = items.map { it.values.toList() }

        override fun observeActive(): Flow<List<Transfer>> = items.map { it.values.toList() }

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

        override suspend fun queuedIds(): List<String> = emptyList()

        override suspend fun createDownload(
            nodeId: String,
            bytesTotal: Long,
        ): Transfer = error("không dùng trong test này")

        override suspend fun requeue(id: String) {
            items.value[id]?.let { items.value = items.value + (id to it.copy(state = TransferState.QUEUED)) }
        }

        override suspend fun requeueOrphanedRunning(): Int = 0

        override suspend fun clearFinished() {}
    }
}
