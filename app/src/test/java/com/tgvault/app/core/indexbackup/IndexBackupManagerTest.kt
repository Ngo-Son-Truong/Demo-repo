package com.tgvault.app.core.indexbackup

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.tgvault.app.core.common.TimeProvider
import com.tgvault.app.core.crypto.CryptoManager
import com.tgvault.app.data.local.TgVaultDatabase
import com.tgvault.app.data.local.entity.NodeEntity
import com.tgvault.app.data.remote.BotInfo
import com.tgvault.app.data.remote.BotRights
import com.tgvault.app.data.remote.ChannelCandidate
import com.tgvault.app.data.remote.ChatInfo
import com.tgvault.app.data.remote.DeleteResult
import com.tgvault.app.data.remote.GatewayHolder
import com.tgvault.app.data.remote.SentDocument
import com.tgvault.app.data.remote.SentMessage
import com.tgvault.app.data.remote.TelegramGateway
import com.tgvault.app.domain.model.ChunkSource
import com.tgvault.app.domain.model.DriveConfig
import com.tgvault.app.domain.model.ThemeMode
import com.tgvault.app.domain.repository.ConfigRepository
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.OutputStream

/** Gateway in-memory: lưu "tin nhắn" (documents theo messageId) + pinned manifest. */
private class FakeGateway : TelegramGateway {
    val docs = mutableMapOf<Long, ByteArray>() // messageId -> bytes
    val fileIdToMessage = mutableMapOf<String, Long>()
    var pinnedText: String? = null
    var pinnedId: Long? = null
    private var nextMessageId = 1L
    private var nextFileId = 1

    override suspend fun getMe() = BotInfo(1, "bot", "Bot")

    override fun watchForChannel(): Flow<ChannelCandidate> = emptyFlow()

    override suspend fun getChat(chatId: Long) = ChatInfo(chatId, "ch", null, pinnedText, pinnedId)

    override suspend fun getChatByUsername(username: String) = getChat(-100)

    override suspend fun getBotRights(chatId: Long) = BotRights(true, true, true)

    override suspend fun probePin(chatId: Long) = true

    override suspend fun sendDocument(
        chatId: Long,
        part: ChunkSource,
        fileName: String,
        caption: String?,
        onProgress: (bytesWritten: Long) -> Unit,
    ): SentDocument {
        val out = java.io.ByteArrayOutputStream()
        part.writeTo(out, onProgress)
        val mid = nextMessageId++
        docs[mid] = out.toByteArray()
        val fid = "file-${nextFileId++}"
        fileIdToMessage[fid] = mid
        return SentDocument(mid, fid, "u$fid")
    }

    override suspend fun sendText(
        chatId: Long,
        text: String,
    ): SentMessage {
        val mid = nextMessageId++
        lastText = text // manifest là tin text cuối cùng — pinMessage sẽ ghim nó
        return SentMessage(mid)
    }

    var lastText: String? = null

    override suspend fun pinMessage(
        chatId: Long,
        messageId: Long,
    ) {
        pinnedId = messageId
        pinnedText = lastText
    }

    override suspend fun unpinMessage(
        chatId: Long,
        messageId: Long,
    ) {
        if (pinnedId == messageId) {
            pinnedId = null
            pinnedText = null
        }
    }

    override suspend fun resolveFilePath(fileId: String) = fileId

    override suspend fun download(
        filePath: String,
        sink: OutputStream,
        range: LongRange?,
        onProgress: (bytesWritten: Long) -> Unit,
    ) {
        val mid = fileIdToMessage[filePath] ?: error("file không tồn tại: $filePath")
        val data = docs[mid]!!
        sink.write(data)
        onProgress(data.size.toLong())
    }

    override suspend fun deleteMessage(
        chatId: Long,
        messageId: Long,
    ): DeleteResult {
        docs.remove(messageId)
        return DeleteResult.Deleted
    }
}

/** M8-6: end-to-end backup → xoá DB → restore → so sánh (fake gateway in-memory). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class IndexBackupManagerTest {
    private lateinit var db: TgVaultDatabase
    private lateinit var gateway: FakeGateway
    private lateinit var gatewayHolder: GatewayHolder
    private lateinit var manager: IndexBackupManager
    private var now = 1_000L
    private var localRevision = 5L
    private var lastBackupAt: Long? = null

    private fun driveConfig() =
        DriveConfig(
            botUsername = "bot",
            chatId = -100,
            chunkSizeBytes = 19 * 1024 * 1024,
            wifiOnly = false,
            maxParallelTransfers = 2,
            themeMode = ThemeMode.SYSTEM,
            dynamicColor = true,
            language = null,
            encryptionEnabled = false,
            appLockEnabled = false,
            appLockTimeoutSec = 60,
            localRevision = localRevision,
            lastIndexBackupAt = lastBackupAt,
            downloadTreeUri = null,
            deviceId = "dev-test",
            onboardingDone = true,
        )

    private val configRepository: ConfigRepository =
        mockk {
            coEvery { current() } answers { driveConfig() }
            every { config } returns MutableStateFlow(driveConfig())
            coEvery { setLastIndexBackupAt(any()) } answers { lastBackupAt = firstArg() }
            coEvery { setLocalRevision(any()) } answers { localRevision = firstArg() }
            coEvery { setEncryptionEnabled(any()) } returns Unit
        }

    private fun node(id: String) =
        NodeEntity(
            id = id,
            parentId = null,
            type = "FILE",
            name = "tệp $id.bin",
            nameNormalized = "tep $id.bin",
            mimeType = "application/octet-stream",
            sizeBytes = 1000,
            sha256 = "ab".repeat(32),
            chunkCount = 1,
            chunkSize = 19 * 1024 * 1024,
            encrypted = false,
            status = "READY",
            createdAt = 1,
            modifiedAt = 2,
            trashedAt = null,
            trashRootId = null,
        )

    @Before
    fun setUp() {
        db =
            Room.inMemoryDatabaseBuilder(
                ApplicationProvider.getApplicationContext(),
                TgVaultDatabase::class.java,
            ).allowMainThreadQueries().build()
        gateway = FakeGateway()
        gatewayHolder = GatewayHolder().also { it.set(gateway) }
        val crypto = CryptoManager(ApplicationProvider.getApplicationContext())
        manager =
            IndexBackupManager(
                db = db,
                nodeDao = db.nodeDao(),
                chunkDao = db.chunkDao(),
                gatewayHolder = gatewayHolder,
                configRepository = configRepository,
                cryptoManager = crypto,
                timeProvider = TimeProvider { now },
            )
        // Fake sendText: lưu text để pin — FakeGateway.sendText cần ghi lastText
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun `backup tạo manifest ghim + parts, restore khôi phục nguyên trạng DB`() =
        runTest {
            // Tạo dữ liệu
            val nodeDao = db.nodeDao()
            val chunkDao = db.chunkDao()
            nodeDao.upsert(node("a"))
            nodeDao.upsert(node("b"))
            chunkDao.upsert(
                com.tgvault.app.data.local.entity.ChunkEntity(
                    nodeId = "a", idx = 0, plainSizeBytes = 1000, storedSizeBytes = 1000,
                    tgChatId = -100, tgMessageId = 99, tgFileId = "fx", tgFileUniqueId = "ux", sha256 = null,
                ),
            )

            assertTrue(manager.backupNow())
            assertNotNull(gateway.pinnedText)
            assertTrue(gateway.pinnedText!!.startsWith(IndexSnapshotCodec.MANIFEST_PREFIX))
            assertNotNull(lastBackupAt)

            // "Xoá DB" mô phỏng mất máy
            chunkDao.deleteAll()
            nodeDao.deleteAll()
            assertEquals(0, nodeDao.getAll().size)
            assertEquals(0, chunkDao.getAll().size)

            // Restore → so sánh nguyên trạng
            val result = manager.restoreFromPinned()
            assertTrue("kết quả phải Success, được $result", result is IndexBackupManager.RestoreResult.Success)
            assertEquals(5L, (result as IndexBackupManager.RestoreResult.Success).revision)
            assertEquals(5L, localRevision)

            val nodes = nodeDao.getAll().sortedBy { it.id }
            assertEquals(listOf("a", "b"), nodes.map { it.id })
            assertEquals("tệp a.bin", nodes[0].name)
            assertEquals(1000L, nodes[0].sizeBytes)

            val chunks = chunkDao.getAll()
            assertEquals(1, chunks.size)
            assertEquals("a", chunks[0].nodeId)
            assertEquals("fx", chunks[0].tgFileId)
        }

    @Test
    fun `backup lần 3 xoá bản lần 1, giữ 2 phiên bản gần nhất`() =
        runTest {
            val nodeDao = db.nodeDao()
            nodeDao.upsert(node("a"))

            assertTrue(manager.backupNow()) // r5 — parts lần 1
            val manifest1 = gateway.pinnedText!!
            val parts1 = IndexSnapshotCodec.parseManifest(manifest1)!!.parts
            val manifest1Id = gateway.pinnedId!!

            localRevision = 6
            assertTrue(manager.backupNow()) // r6 — parts lần 2
            val parts2 = IndexSnapshotCodec.parseManifest(gateway.pinnedText!!)!!.parts

            localRevision = 7
            assertTrue(manager.backupNow()) // r7 — lúc này bản r5 (prev của prev) phải bị xoá

            // parts + manifest của r5 đã bị xoá khỏi "channel"
            for (p in parts1) {
                val mid = gateway.fileIdToMessage[p.file_id]
                assertTrue("part r5 phải bị xoá", mid == null || !gateway.docs.containsKey(mid))
            }
            assertTrue("manifest r5 phải bị xoá", !gateway.docs.containsKey(manifest1Id))
            // parts r6 còn nguyên (giữ 2 phiên bản)
            for (p in parts2) {
                val mid = gateway.fileIdToMessage[p.file_id]
                assertTrue(gateway.docs.containsKey(mid))
            }
            // manifest hiện tại là r7
            assertEquals(7L, IndexSnapshotCodec.parseManifest(gateway.pinnedText!!)!!.revision)
        }

    @Test
    fun `restore khi không có tin ghim trả NotFound`() =
        runTest {
            val result = manager.restoreFromPinned()
            assertTrue(result is IndexBackupManager.RestoreResult.NotFound)
        }
}
