package com.tgvault.app.core.thumb

import android.graphics.Bitmap
import android.graphics.Color
import com.tgvault.app.core.crypto.CryptoManager
import com.tgvault.app.data.local.dao.ChunkDao
import com.tgvault.app.data.local.entity.ChunkEntity
import com.tgvault.app.data.remote.GatewayHolder
import com.tgvault.app.domain.model.Node
import com.tgvault.app.domain.model.NodeStatus
import com.tgvault.app.domain.model.NodeType
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.ByteArrayOutputStream
import java.io.OutputStream

/** M9-1: ThumbnailCache — PNG nhỏ → decode đúng, ≤320px; file lớn/nhiều chunk → null; từ chối không ảnh. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ThumbnailCacheTest {
    private val chunkDao = mockk<ChunkDao>()
    private val gatewayHolder = mockk<GatewayHolder>()
    private val cryptoManager = mockk<CryptoManager>()
    private val context = RuntimeEnvironment.getApplication()

    private fun cache(): ThumbnailCache = ThumbnailCache(context, chunkDao, gatewayHolder, cryptoManager)

    private fun node(
        id: String = "n1",
        mime: String? = "image/png",
        chunks: Int = 1,
        status: NodeStatus = NodeStatus.READY,
        size: Long = 100,
        encrypted: Boolean = false,
    ) = Node(
        id = id,
        parentId = null,
        type = NodeType.FILE,
        name = "$id.png",
        nameNormalized = "$id.png",
        mimeType = mime,
        sizeBytes = size,
        sha256 = null,
        chunkCount = chunks,
        chunkSize = 1 shl 20,
        encrypted = encrypted,
        status = status,
        createdAt = 0,
        modifiedAt = 0,
        trashedAt = null,
        trashRootId = null,
    )

    private fun chunk(
        nodeId: String,
        plain: Int,
        fileId: String? = "fid",
    ) = ChunkEntity(
        id = 1,
        nodeId = nodeId,
        idx = 0,
        plainSizeBytes = plain.toLong(),
        storedSizeBytes = plain.toLong(),
        tgChatId = -100,
        tgMessageId = 1,
        tgFileId = fileId,
        tgFileUniqueId = null,
        sha256 = null,
    )

    /** PNG 800×600 đỏ đặc → plaintext bytes. */
    private fun pngBytes(
        w: Int = 800,
        h: Int = 600,
    ): ByteArray {
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        bmp.eraseColor(Color.RED)
        val out = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.PNG, 100, out)
        bmp.recycle()
        return out.toByteArray()
    }

    /** Gateway giả: ghi [bytes] vào sink khi download. */
    private fun gatewayServing(bytes: ByteArray): com.tgvault.app.data.remote.TelegramGateway {
        val gw = mockk<com.tgvault.app.data.remote.TelegramGateway>()
        coEvery { gw.resolveFilePath(any()) } returns "file/path"
        coEvery { gw.download(any(), any<OutputStream>(), any(), any()) } coAnswers {
            val sink = secondArg<OutputStream>()
            sink.write(bytes)
        }
        return gw
    }

    @Test
    fun `ảnh png 1 chunk giải mã ra thumbnail dưới 320px`() =
        runTest {
            val png = pngBytes(800, 600)
            coEvery { chunkDao.forNode("n1") } returns listOf(chunk("n1", png.size))
            every { gatewayHolder.current() } returns gatewayServing(png)

            val thumb = cache().get(node(size = png.size.toLong()))

            assertNotNull(thumb)
            assertTrue(maxOf(thumb!!.width, thumb.height) <= ThumbnailCache.MAX_DIM)
            assertEquals(320, maxOf(thumb.width, thumb.height))
        }

    @Test
    fun `node không phải ảnh trả null`() =
        runTest {
            assertNull(cache().get(node(mime = "application/pdf")))
            assertNull(cache().get(node(mime = null)))
        }

    @Test
    fun `ảnh nhiều chunk trả null vì chỉ hỗ trợ 1 chunk`() =
        runTest {
            assertNull(cache().get(node(chunks = 2)))
        }

    @Test
    fun `chunk chưa có fileId trả null`() =
        runTest {
            coEvery { chunkDao.forNode("n1") } returns listOf(chunk("n1", 100, fileId = null))
            every { gatewayHolder.current() } returns gatewayServing(ByteArray(0))
            assertNull(cache().get(node()))
        }

    @Test
    fun `node mã hoá nhưng không mở được khoá trả null`() =
        runTest {
            val png = pngBytes()
            coEvery { chunkDao.forNode("n1") } returns listOf(chunk("n1", png.size))
            every { gatewayHolder.current() } returns gatewayServing(png)
            every { cryptoManager.isConfigured() } returns true
            every { cryptoManager.unlock() } returns false

            assertNull(cache().get(node(encrypted = true)))
        }

    @Test
    fun `ảnh đã nhỏ hơn 320 giữ nguyên kích thước`() =
        runTest {
            val png = pngBytes(200, 150)
            coEvery { chunkDao.forNode("n1") } returns listOf(chunk("n1", png.size))
            every { gatewayHolder.current() } returns gatewayServing(png)

            val thumb = cache().get(node(size = png.size.toLong()))

            assertNotNull(thumb)
            assertEquals(200, thumb!!.width)
            assertEquals(150, thumb.height)
        }
}
