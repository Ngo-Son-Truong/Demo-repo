package com.tgvault.app.core.crypto

import com.tgvault.app.domain.model.ChunkSource
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.util.Random

/** M7-2/M7-3: đường upload — ChunkSource mã hoá streaming. */
class EncryptingChunkSourceTest {
    private class BytesChunkSource(
        val data: ByteArray,
    ) : ChunkSource {
        override val length: Long get() = data.size.toLong()

        override fun writeTo(
            sink: OutputStream,
            onProgress: (bytesWritten: Long) -> Unit,
        ) {
            sink.write(data)
            onProgress(data.size.toLong())
        }
    }

    @Test
    fun `length báo kích thước ciphertext (Content-Length)`() {
        val plain = ByteArray(100_000).also { Random(1).nextBytes(it) }
        val src = EncryptingChunkSource(NodeCipher(CryptoScheme.generateMasterKey()), CryptoScheme.chunkAad("n", 0, 1), BytesChunkSource(plain))
        assertEquals(CryptoScheme.ciphertextSizeFor(plain.size.toLong()), src.length)
    }

    @Test
    fun `writeTo phát ciphertext giải mã được đúng plaintext`() {
        val key = CryptoScheme.generateMasterKey()
        val aad = CryptoScheme.chunkAad("node-x", 2, 5)
        val plain = ByteArray(3_000_000).also { Random(7).nextBytes(it) }

        val src = EncryptingChunkSource(NodeCipher(key), aad, BytesChunkSource(plain))
        val sink = ByteArrayOutputStream()
        var reported = 0L
        src.writeTo(sink) { reported = it }

        val ciphertext = sink.toByteArray()
        assertEquals(src.length, ciphertext.size.toLong())
        assertEquals(plain.size.toLong(), reported) // onProgress theo plaintext bytes

        // Giải mã lại bằng cùng khoá + AAD
        val back = NodeCipher(key).newDecryptingStream(ByteArrayInputStream(ciphertext), aad).use { it.readBytes() }
        assertArrayEquals(plain, back)
        // Ciphertext phải trông ngẫu nhiên — không lộ plaintext
        assertTrue(!String(ciphertext, Charsets.ISO_8859_1).contains(String(plain.copyOf(64), Charsets.ISO_8859_1)))
    }

    @Test
    fun `writeTo không đóng sink của caller`() {
        val aad = CryptoScheme.chunkAad("n", 0, 1)
        val src = EncryptingChunkSource(NodeCipher(CryptoScheme.generateMasterKey()), aad, BytesChunkSource(ByteArray(1000)))
        var closed = false
        val sink =
            object : ByteArrayOutputStream() {
                override fun close() {
                    closed = true
                    super.close()
                }
            }
        src.writeTo(sink)
        assertTrue(!closed) // OkHttp tự đóng request body — EncryptingChunkSource không được đóng
    }
}
