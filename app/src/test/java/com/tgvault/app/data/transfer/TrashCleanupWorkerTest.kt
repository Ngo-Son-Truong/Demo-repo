package com.tgvault.app.data.transfer

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.WorkerParameters
import com.tgvault.app.domain.repository.NodeRepository
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** M9-5: TrashCleanupWorker — gọi purgeExpiredTrash(30 ngày); retry khi repo lỗi. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class TrashCleanupWorkerTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val nodeRepository = mockk<NodeRepository>()

    @Before
    fun setUp() {
        TrashCleanupWorker.depsOverride =
            object : TrashCleanupWorker.Deps {
                override fun nodeRepository(): NodeRepository = nodeRepository
            }
    }

    @After
    fun tearDown() {
        TrashCleanupWorker.depsOverride = null
    }

    private fun buildWorker(): TrashCleanupWorker = TrashCleanupWorker(context, mockk<WorkerParameters>(relaxed = true))

    @Test
    fun `doWork gọi purgeExpiredTrash 30 ngày và success`() =
        runTest {
            coEvery { nodeRepository.purgeExpiredTrash(any()) } returns 3

            val result = buildWorker().doWork()

            assertEquals(androidx.work.ListenableWorker.Result.success(), result)
            coVerify { nodeRepository.purgeExpiredTrash(TrashCleanupWorker.TTL_MILLIS) }
        }

    @Test
    fun `repo ném lỗi thì retry`() =
        runTest {
            coEvery { nodeRepository.purgeExpiredTrash(any()) } throws RuntimeException("db lỗi")

            val result = buildWorker().doWork()

            assertEquals(androidx.work.ListenableWorker.Result.retry(), result)
        }
}
