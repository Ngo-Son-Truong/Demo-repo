package com.tgvault.app.core.playback

import android.net.Uri
import androidx.media3.datasource.DataSpec
import com.tgvault.app.data.remote.BotInfo
import com.tgvault.app.data.remote.BotRights
import com.tgvault.app.data.remote.ChannelCandidate
import com.tgvault.app.data.remote.ChatInfo
import com.tgvault.app.data.remote.DeleteResult
import com.tgvault.app.data.remote.SentDocument
import com.tgvault.app.data.remote.SentMessage
import com.tgvault.app.data.remote.TelegramGateway
import com.tgvault.app.domain.model.Chunk
import com.tgvault.app.domain.model.ChunkSource
import com.tgvault.app.domain.model.Node
import com.tgvault.app.domain.model.NodeStatus
import com.tgvault.app.domain.model.NodeType
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.OutputStream
import java.util.concurrent.Executor

/** NodeStreamDataSource: đọc xuyên ranh giới chunk, seek giữa chunk, cache LRU (M9+). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class NodeStreamDataSourceTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private val chunkSize = 8
    private val chunkCount = 4

    // Nội dung gốc 30 byte: 4 chunk (8+8+8+6)
    private val content = "abcdefghijklmnopqrstuvwxyz0123".toByteArray()

    private lateinit var node: Node
    private lateinit var chunks: List<Chunk>

    @Before
    fun setUp() {
        node =
            Node(
                id = "n1",
                parentId = null,
                type = NodeType.FILE,
                name = "clip.mp4",
                nameNormalized = "clip.mp4",
                mimeType = "video/mp4",
                sizeBytes = content.size.toLong(),
                sha256 = null,
                chunkCount = chunkCount,
                chunkSize = chunkSize,
                encrypted = false,
                status = NodeStatus.READY,
                createdAt = 0,
                modifiedAt = 0,
                trashedAt = null,
                trashRootId = null,
            )
        chunks =
            (0 until chunkCount).map { i ->
                val start = i * chunkSize
                val len = minOf(chunkSize, content.size - start)
                Chunk(
                    id = i.toLong(),
                    nodeId = "n1",
                    idx = i,
                    plainSizeBytes = len.toLong(),
                    storedSizeBytes = len.toLong(),
                    tgChatId = -100,
                    tgMessageId = i.toLong(),
                    tgFileId = "file-$i",
                    tgFileUniqueId = null,
                    sha256 = null,
                )
            }
    }

    /** Gateway giả: resolveFilePath trả chính fileId; download ghi đúng đoạn byte theo range. */
    private inner class FakeGateway : TelegramGateway {
        var downloadCalls = 0

        override suspend fun download(
            filePath: String,
            sink: OutputStream,
            range: LongRange?,
            onProgress: (bytesWritten: Long) -> Unit,
        ) {
            downloadCalls++
            val idx = filePath.removePrefix("file-").toInt()
            val start = idx * chunkSize
            val len = chunks[idx].plainSizeBytes.toInt()
            val from = (range?.first?.toInt() ?: 0)
            val to = (range?.last?.toInt()?.plus(1) ?: len)
            sink.write(content, start + from, to - from)
        }

        override suspend fun resolveFilePath(fileId: String): String = fileId

        override suspend fun getMe(): BotInfo = error("unused")

        override fun watchForChannel(): Flow<ChannelCandidate> = emptyFlow()

        override suspend fun getChat(chatId: Long): ChatInfo = error("unused")

        override suspend fun getChatByUsername(username: String): ChatInfo = error("unused")

        override suspend fun getBotRights(chatId: Long): BotRights = error("unused")

        override suspend fun probePin(chatId: Long): Boolean = error("unused")

        override suspend fun sendDocument(
            chatId: Long,
            part: ChunkSource,
            fileName: String,
            caption: String?,
            onProgress: (bytesWritten: Long) -> Unit,
        ): SentDocument = error("unused")

        override suspend fun sendText(
            chatId: Long,
            text: String,
        ): SentMessage = error("unused")

        override suspend fun pinMessage(
            chatId: Long,
            messageId: Long,
        ) = error("unused")

        override suspend fun unpinMessage(
            chatId: Long,
            messageId: Long,
        ) = error("unused")

        override suspend fun deleteMessage(
            chatId: Long,
            messageId: Long,
        ): DeleteResult = error("unused")
    }

    private val sharedCacheDir by lazy { tmp.newFolder("stream-n1") }

    private fun newSource(gateway: TelegramGateway): NodeStreamDataSource =
        NodeStreamDataSource(
            node = node,
            chunks = chunks,
            gateway = gateway,
            nodeCacheDir = sharedDir(),
            prefetchExecutor = Executor { it.run() },
        )

    private fun sharedDir(): java.io.File = sharedCacheDir

    private fun readAll(ds: NodeStreamDataSource): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        val buf = ByteArray(5) // cố tình nhỏ để đọc xuyên ranh giới chunk
        while (true) {
            val got = ds.read(buf, 0, buf.size)
            if (got == androidx.media3.common.C.RESULT_END_OF_INPUT) break
            out.write(buf, 0, got)
        }
        return out.toByteArray()
    }

    @Test
    fun `đọc toàn bộ stream khớp nội dung gốc`() {
        val ds = newSource(FakeGateway())
        ds.open(DataSpec(Uri.parse("tgvault://stream/n1")))
        assertArrayEquals(content, readAll(ds))
        ds.close()
    }

    @Test
    fun `seek vào giữa chunk trả đúng đuôi dữ liệu`() {
        val ds = newSource(FakeGateway())
        ds.open(DataSpec(Uri.parse("tgvault://stream/n1"), 11, androidx.media3.common.C.LENGTH_UNSET.toLong()))
        assertArrayEquals(content.copyOfRange(11, content.size), readAll(ds))
        ds.close()
    }

    @Test
    fun `cache LRU giữ tối đa số chunk cho phép`() {
        val gateway = FakeGateway()
        val dir = sharedDir()
        val ds = newSource(gateway)
        ds.open(DataSpec(Uri.parse("tgvault://stream/n1")))
        readAll(ds)
        ds.close()
        val cached = dir.listFiles { f -> f.name.startsWith("chunk_") }!!.toList()
        assertTrue(cached.size <= NodeStreamDataSource.MAX_CACHED_CHUNKS)
    }
}
