package com.tgvault.app.core.indexbackup

import com.tgvault.app.core.crypto.CryptoScheme
import com.tgvault.app.core.crypto.NodeCipher
import com.tgvault.app.core.indexbackup.IndexSnapshotCodec.toEntity
import com.tgvault.app.core.indexbackup.IndexSnapshotCodec.toSnapshot
import com.tgvault.app.data.local.entity.ChunkEntity
import com.tgvault.app.data.local.entity.NodeEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

/** M8-1: khứ hồi, sai magic/version, mã hoá, manifest roundtrip. */
class IndexSnapshotCodecTest {
    private fun samplePayload(): IndexSnapshotCodec.SnapshotPayload {
        val node =
            NodeEntity(
                id = "n1",
                parentId = null,
                type = "FILE",
                name = "ảnh tết.jpg",
                nameNormalized = "anh tet.jpg",
                mimeType = "image/jpeg",
                sizeBytes = 12345,
                sha256 = "ab".repeat(32),
                chunkCount = 1,
                chunkSize = 19 * 1024 * 1024,
                encrypted = true,
                status = "READY",
                createdAt = 1000,
                modifiedAt = 2000,
                trashedAt = null,
                trashRootId = null,
            )
        val chunk =
            ChunkEntity(
                // id autoGenerate — KHÔNG được đưa vào snapshot
                id = 5,
                nodeId = "n1",
                idx = 0,
                plainSizeBytes = 12345,
                storedSizeBytes = 12401,
                tgChatId = -100,
                tgMessageId = 42,
                tgFileId = "file-id-1",
                tgFileUniqueId = "uniq-1",
                sha256 = null,
            )
        return IndexSnapshotCodec.SnapshotPayload(listOf(node.toSnapshot()), listOf(chunk.toSnapshot()))
    }

    private fun header(
        encrypted: Boolean,
        revision: Long = 7,
    ) = IndexSnapshotCodec.SnapshotHeader(
        revision = revision,
        createdAt = 999,
        deviceId = "dev-1",
        encrypted = encrypted,
        kdf = if (encrypted) IndexSnapshotCodec.KdfInfo() else null,
        wrappedMasterKey = if (encrypted) "YmxvYg==" else null,
    )

    @Test
    fun `khứ hồi không mã hoá — nodes và chunks giữ nguyên`() {
        val payload = samplePayload()
        val bytes = IndexSnapshotCodec.encode(payload, header(encrypted = false), cipher = null)
        val (h, payloadBytes) = IndexSnapshotCodec.parse(bytes)
        assertEquals(false, h.encrypted)
        val back = IndexSnapshotCodec.decodePayload(h, payloadBytes, cipher = null)
        assertEquals(payload.nodes, back.nodes)
        assertEquals(payload.chunks, back.chunks)
        // entity roundtrip (id autoGenerate của chunk không serialize → về 0)
        assertEquals(payload.nodes[0].toEntity().copy(), back.nodes[0].toEntity())
        assertEquals(payload.chunks[0].toEntity().copy(id = 0), back.chunks[0].toEntity())
    }

    @Test
    fun `khứ hồi có mã hoá — đúng khoá mở được, sai khoá thất bại`() {
        val payload = samplePayload()
        val key = CryptoScheme.generateMasterKey()
        val cipher = NodeCipher(key)
        val bytes = IndexSnapshotCodec.encode(payload, header(encrypted = true), cipher)
        val (h, payloadBytes) = IndexSnapshotCodec.parse(bytes)
        assertTrue(h.encrypted)
        assertEquals("scrypt", h.kdf?.algo)

        // header KHÔNG mã hoá nhưng payload phải là ngẫu nhiên
        val payloadText = String(payloadBytes, Charsets.ISO_8859_1)
        assertTrue(!payloadText.contains("n1") || payloadBytes.size > 0) // ciphertext — kiểm chính ở giải mã
        val back = IndexSnapshotCodec.decodePayload(h, payloadBytes, NodeCipher(key))
        assertEquals(payload, back)

        // Sai khoá
        assertThrows(IOException::class.java) {
            IndexSnapshotCodec.decodePayload(h, payloadBytes, NodeCipher(CryptoScheme.generateMasterKey()))
        }
        // Sai revision → sai AAD → thất bại
        val wrongHeader = h.copy(revision = h.revision + 1)
        assertThrows(IOException::class.java) {
            IndexSnapshotCodec.decodePayload(wrongHeader, payloadBytes, NodeCipher(key))
        }
    }

    @Test
    fun `sai magic hoặc version bị từ chối`() {
        val bytes = IndexSnapshotCodec.encode(samplePayload(), header(false), null)
        val badMagic = bytes.copyOf().also { it[0] = 'X'.code.toByte() }
        assertThrows(IndexSnapshotCodec.SnapshotFormatException::class.java) { IndexSnapshotCodec.parse(badMagic) }
        val badVersion = bytes.copyOf().also { it[4] = 99 }
        assertThrows(IndexSnapshotCodec.SnapshotFormatException::class.java) { IndexSnapshotCodec.parse(badVersion) }
        assertThrows(IndexSnapshotCodec.SnapshotFormatException::class.java) { IndexSnapshotCodec.parse(ByteArray(3)) }
    }

    @Test
    fun `snapshot lớn (10000 node) nén và khứ hồi đúng`() {
        val nodes =
            (1..10_000).map {
                NodeEntity(
                    id = "node-$it", parentId = "p${it % 7}", type = "FILE",
                    name = "tệp số $it rất dài.mp4", nameNormalized = "tep so $it rat dai.mp4",
                    mimeType = "video/mp4", sizeBytes = it * 1000L, sha256 = null,
                    chunkCount = 2, chunkSize = 19 * 1024 * 1024, encrypted = false,
                    status = "READY", createdAt = 1, modifiedAt = 2, trashedAt = null, trashRootId = null,
                ).toSnapshot()
            }
        val chunks =
            (1..10_000).flatMap { i ->
                (0..1).map { c ->
                    ChunkEntity(
                        nodeId = "node-$i", idx = c, plainSizeBytes = 100, storedSizeBytes = 100,
                        tgChatId = -100, tgMessageId = i * 10L + c, tgFileId = "f$i$c",
                        tgFileUniqueId = "u$i$c", sha256 = null,
                    ).toSnapshot()
                }
            }
        val payload = IndexSnapshotCodec.SnapshotPayload(nodes, chunks)
        val bytes = IndexSnapshotCodec.encode(payload, header(false), null)
        // gzip phải nén mạnh dữ liệu lặp — dưới vài MB
        assertTrue("snapshot 10k node nên < 3 MB, được ${bytes.size}", bytes.size < 3 * 1024 * 1024)
        val (h, pb) = IndexSnapshotCodec.parse(bytes)
        assertEquals(payload, IndexSnapshotCodec.decodePayload(h, pb, null))
    }

    @Test
    fun `manifest roundtrip và parse an toàn với rác`() {
        val m =
            IndexSnapshotCodec.IndexManifest(
                revision = 12,
                sha256 = "cd".repeat(32),
                createdAt = 5,
                parts = listOf(IndexSnapshotCodec.ManifestPart("fid", 555, 1000)),
                prev = null,
            )
        val text = IndexSnapshotCodec.encodeManifest(m)
        assertTrue(text.startsWith(IndexSnapshotCodec.MANIFEST_PREFIX))
        val parsed = IndexSnapshotCodec.parseManifest(text)
        assertEquals(m, parsed)

        assertNull(IndexSnapshotCodec.parseManifest(null))
        assertNull(IndexSnapshotCodec.parseManifest("tin nhắn thường"))
        assertNull(IndexSnapshotCodec.parseManifest(IndexSnapshotCodec.MANIFEST_PREFIX))
        assertNull(IndexSnapshotCodec.parseManifest(IndexSnapshotCodec.MANIFEST_PREFIX + "\n{rác"))
    }

    @Test
    fun `manifest nhúng prev giữ được phiên bản cũ`() {
        val old = IndexSnapshotCodec.IndexManifest(10, "aa", 1, listOf(IndexSnapshotCodec.ManifestPart("f0", 100, 10)))
        val new =
            IndexSnapshotCodec.IndexManifest(
                11,
                "bb",
                2,
                listOf(IndexSnapshotCodec.ManifestPart("f1", 200, 20)),
                prev = IndexSnapshotCodec.encodeManifest(old),
            )
        val parsed = IndexSnapshotCodec.parseManifest(IndexSnapshotCodec.encodeManifest(new))!!
        val prevParsed = IndexSnapshotCodec.parseManifest(parsed.prev)
        assertEquals(old, prevParsed)
    }

    @Test
    fun `ciphertext snapshot trông ngẫu nhiên`() {
        val key = CryptoScheme.generateMasterKey()
        val bytes = IndexSnapshotCodec.encode(samplePayload(), header(true), NodeCipher(key))
        val (_, payloadBytes) = IndexSnapshotCodec.parse(bytes)
        val text = String(payloadBytes, Charsets.ISO_8859_1)
        assertTrue(!text.contains("ảnh tết") && !text.contains("file-id-1"))
        assertTrue(payloadBytes.size > 40) // có header Tink + tag
    }
}
