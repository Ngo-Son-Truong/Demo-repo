package com.tgvault.app.data.local

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.cash.turbine.test
import com.tgvault.app.data.local.entity.NodeEntity
import com.tgvault.app.domain.model.NodeStatus
import com.tgvault.app.domain.model.NodeType
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Test Room in-memory trên Robolectric (M2-4). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class RoomDatabaseTest {

    private lateinit var db: TgVaultDatabase

    private fun node(
        id: String,
        parentId: String? = null,
        type: NodeType = NodeType.FOLDER,
        name: String = id,
        sizeBytes: Long = 0,
        status: NodeStatus = NodeStatus.READY,
        trashedAt: Long? = null,
        trashRootId: String? = null,
    ) = NodeEntity(
        id = id,
        parentId = parentId,
        type = type.name,
        name = name,
        nameNormalized = name.lowercase(),
        mimeType = null,
        sizeBytes = sizeBytes,
        sha256 = null,
        chunkCount = 0,
        chunkSize = 0,
        encrypted = false,
        status = status.name,
        createdAt = 1L,
        modifiedAt = 1L,
        trashedAt = trashedAt,
        trashRootId = trashRootId,
    )

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            TgVaultDatabase::class.java,
        ).allowMainThreadQueries().build()
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun `upsert và đọc node`() = runTest {
        db.nodeDao().upsert(node("root"))
        val loaded = db.nodeDao().getById("root")
        assertEquals("root", loaded?.id)
        assertEquals(NodeType.FOLDER.name, loaded?.type)
    }

    @Test
    fun `subtreeIds trả về cả cây con`() = runTest {
        db.nodeDao().upsert(node("a"))
        db.nodeDao().upsert(node("b", parentId = "a"))
        db.nodeDao().upsert(node("c", parentId = "b"))
        db.nodeDao().upsert(node("d", parentId = "b"))
        val ids = db.nodeDao().subtreeIds("a").toSet()
        assertEquals(setOf("a", "b", "c", "d"), ids)
    }

    @Test
    fun `trash đánh dấu cả cây và restore gỡ đúng root`() = runTest {
        db.nodeDao().upsert(node("a"))
        db.nodeDao().upsert(node("b", parentId = "a"))
        db.nodeDao().upsert(node("c", parentId = "b"))
        val subtree = db.nodeDao().subtreeIds("a")
        db.nodeDao().markTrashed(subtree, 100L, "a")

        assertTrue(db.nodeDao().getById("c")!!.trashedAt == 100L)
        assertEquals("a", db.nodeDao().getById("c")!!.trashRootId)

        db.nodeDao().restoreTrash("a")
        assertNull(db.nodeDao().getById("c")!!.trashedAt)
        assertNull(db.nodeDao().getById("c")!!.trashRootId)
    }

    @Test
    fun `observeTrashRoots chỉ trả gốc thùng rác`() = runTest {
        db.nodeDao().upsert(node("a", trashedAt = 100L, trashRootId = "a"))
        db.nodeDao().upsert(node("b", parentId = "a", trashedAt = 100L, trashRootId = "a"))
        db.nodeDao().upsert(node("x"))
        db.nodeDao().observeTrashRoots().test {
            val roots = awaitItem()
            assertEquals(listOf("a"), roots.map { it.id })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `xoá node cascade xoá chunks`() = runTest {
        db.nodeDao().upsert(node("f", type = NodeType.FILE))
        db.chunkDao().upsert(
            com.tgvault.app.data.local.entity.ChunkEntity(
                nodeId = "f", idx = 0, plainSizeBytes = 10, storedSizeBytes = 10,
                tgChatId = 1, tgMessageId = 2, tgFileId = "fid", tgFileUniqueId = null, sha256 = null,
            )
        )
        assertEquals(1, db.chunkDao().forNode("f").size)
        db.nodeDao().deleteById("f")
        assertEquals(0, db.chunkDao().forNode("f").size)
    }

    @Test
    fun `unique index nodeId+idx chặn chunk trùng`() = runTest {
        db.nodeDao().upsert(node("f", type = NodeType.FILE))
        val chunk = com.tgvault.app.data.local.entity.ChunkEntity(
            nodeId = "f", idx = 0, plainSizeBytes = 10, storedSizeBytes = 10,
            tgChatId = null, tgMessageId = null, tgFileId = null, tgFileUniqueId = null, sha256 = null,
        )
        db.chunkDao().upsert(chunk)
        try {
            db.chunkDao().upsert(chunk)
        } catch (e: android.database.sqlite.SQLiteConstraintException) {
            // REPLACE strategy → không ném; nếu ném thì schema đổi — test vẫn pass qua nhánh dưới
        }
        assertEquals(1, db.chunkDao().forNode("f").size)
    }

    @Test
    fun `requeueRunning chuyển RUNNING về QUEUED`() = runTest {
        db.nodeDao().upsert(node("f", type = NodeType.FILE))
        db.transferDao().upsert(
            com.tgvault.app.data.local.entity.TransferEntity(
                id = "t1", nodeId = "f", direction = "UPLOAD", state = "RUNNING",
                bytesDone = 0, bytesTotal = 10, currentChunk = 0,
                sourceUri = null, destUri = null, stagingPath = null,
                errorCode = null, errorMessage = null, retryCount = 0,
                createdAt = 1L, updatedAt = 1L,
            )
        )
        assertEquals(1, db.transferDao().requeueRunning(2L))
        assertEquals("QUEUED", db.transferDao().getById("t1")!!.state)
    }

    @Test
    fun `searchByName tìm theo tên chuẩn hoá`() = runTest {
        db.nodeDao().upsert(node("f1", type = NodeType.FILE, name = "Báo cáo.pdf"))
        db.nodeDao().observeById("f1")
        val results = mutableListOf<List<NodeEntity>>()
        db.nodeDao().searchByName("bao cao").test {
            results.add(awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
        assertEquals(listOf("f1"), results.first().map { it.id })
    }
}
