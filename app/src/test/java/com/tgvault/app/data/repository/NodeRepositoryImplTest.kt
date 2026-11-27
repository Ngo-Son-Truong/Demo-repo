package com.tgvault.app.data.repository

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.tgvault.app.core.common.SystemTimeProvider
import com.tgvault.app.data.local.TgVaultDatabase
import com.tgvault.app.data.remote.GatewayHolder
import com.tgvault.app.domain.model.DriveConfig
import com.tgvault.app.domain.repository.ConfigRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Fake ConfigRepository cho test repository (không cần DataStore thật). */
private class FakeConfigRepository : ConfigRepository {
    private val state = MutableStateFlow(DriveConfig.DEFAULT.copy(chatId = 100L))
    override val config: Flow<DriveConfig> = state

    override suspend fun current(): DriveConfig = state.value

    override suspend fun setConnection(botUsername: String, chatId: Long) {}

    override suspend fun clearConnection() {}

    override suspend fun setChunkSizeBytes(value: Int) {}

    override suspend fun setWifiOnly(value: Boolean) {}

    override suspend fun setMaxParallelTransfers(value: Int) {}

    override suspend fun setThemeMode(value: com.tgvault.app.domain.model.ThemeMode) {}

    override suspend fun setDynamicColor(value: Boolean) {}

    override suspend fun setLanguage(value: String?) {}

    override suspend fun setEncryptionEnabled(value: Boolean) {}

    override suspend fun setAppLock(enabled: Boolean, timeoutSec: Int) {}

    override suspend fun incrementLocalRevision(): Long = 1L

    override suspend fun setLocalRevision(value: Long) {}

    override suspend fun setLastIndexBackupAt(epochMillis: Long) {}

    override suspend fun setDownloadTreeUri(value: String?) {}

    override suspend fun setOnboardingDone(value: Boolean) {}
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class NodeRepositoryImplTest {
    private lateinit var db: TgVaultDatabase
    private lateinit var repo: NodeRepositoryImpl

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            TgVaultDatabase::class.java,
        ).allowMainThreadQueries().build()
        repo = NodeRepositoryImpl(
            db = db,
            nodeDao = db.nodeDao(),
            chunkDao = db.chunkDao(),
            transferDao = db.transferDao(),
            orphanChunkDao = db.orphanChunkDao(),
            configRepository = FakeConfigRepository(),
            gatewayHolder = GatewayHolder(),
            timeProvider = SystemTimeProvider,
        )
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun `createFolder sinh tên duy nhất khi trùng`() =
        runTest {
        val a = repo.createFolder(null, "Tài liệu")
        val b = repo.createFolder(null, "tài liệu") // khác hoa thường
        assertNotEquals(a.name, b.name)
        assertEquals("Tài liệu", a.name)
        assertEquals("tài liệu (1)", b.name)
    }

    @Test
    fun `moveNode chặn di chuyển vào hậu duệ`() =
        runTest {
        val a = repo.createFolder(null, "A")
        val b = repo.createFolder(a.id, "B")
        try {
            repo.moveNode(a.id, b.id)
            org.junit.Assert.fail("phải chặn move vào hậu duệ")
        } catch (e: IllegalArgumentException) {
            // kỳ vọng
        }
    }

    @Test
    fun `createPendingUpload tạo node PENDING và transfer QUEUED nguyên tử`() =
        runTest {
        val (node, transfer) =
            repo.createPendingUpload(
            parentId = null,
            name = "video.mp4",
            mimeType = "video/mp4",
            sizeBytes = 1000,
            sourceUri = "content://x",
            stagingPath = null,
        )
        assertEquals("PENDING", node.status.name)
        assertEquals("QUEUED", transfer.state.name)
        assertEquals(node.id, transfer.nodeId)
    }

    @Test
    fun `createPendingUpload từ chối tệp rỗng`() =
        runTest {
        try {
            repo.createPendingUpload(null, "empty.txt", null, 0, "content://x", null)
            org.junit.Assert.fail("phải từ chối tệp rỗng")
        } catch (e: IllegalArgumentException) {
            // kỳ vọng
        }
    }

    @Test
    fun `trash và khôi phục`() =
        runTest {
        val a = repo.createFolder(null, "A")
        val b = repo.createFolder(a.id, "B")
        repo.trashNodes(listOf(a.id))
        val trashed = db.nodeDao().getById(b.id)!!
        assertEquals(a.id, trashed.trashRootId)

        repo.restoreFromTrash(a.id)
        org.junit.Assert.assertNull(db.nodeDao().getById(b.id)!!.trashedAt)
    }

    @Test
    fun `renameNode sinh tên duy nhất`() =
        runTest {
        val a = repo.createFolder(null, "A")
        val b = repo.createFolder(null, "B")
        repo.renameNode(b.id, "a") // trùng chuẩn hoá với "A"
        val renamed = db.nodeDao().getById(b.id)!!
        assertEquals("a (1)", renamed.name)
    }
}
