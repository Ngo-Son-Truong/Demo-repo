package com.tgvault.app.core.crypto

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.Random

/** M7-3: roundtrip + chống giả mạo (sai AAD, đảo thứ tự, cắt bớt, sửa byte). */
class NodeCipherTest {
    private val cipher = NodeCipher(CryptoScheme.generateMasterKey())

    private fun encrypt(
        plain: ByteArray,
        aad: ByteArray,
    ): ByteArray {
        val sink = ByteArrayOutputStream()
        cipher.newEncryptingStream(sink, aad).use { it.write(plain) }
        return sink.toByteArray()
    }

    private fun decrypt(
        ciphertext: ByteArray,
        aad: ByteArray,
    ): ByteArray = cipher.newDecryptingStream(ByteArrayInputStream(ciphertext), aad).use { it.readBytes() }

    @Test
    fun `roundtrip dữ liệu lớn hơn 1 segment (2,5 MiB)`() {
        val plain = ByteArray(2 * CryptoScheme.STREAM_SEGMENT_SIZE + 500_000).also { Random(42).nextBytes(it) }
        val aad = CryptoScheme.chunkAad("node-1", 0, 3)
        val ct = encrypt(plain, aad)
        assertArrayEquals(plain, decrypt(ct, aad))
    }

    @Test
    fun `giải mã với AAD sai (idx khác) thất bại`() {
        val ct = encrypt("dữ liệu mật".toByteArray(), CryptoScheme.chunkAad("node-1", 0, 3))
        assertThrows(IOException::class.java) {
            decrypt(ct, CryptoScheme.chunkAad("node-1", 1, 3))
        }
    }

    @Test
    fun `giải mã chunk của node khác (AAD nodeId khác) thất bại`() {
        val ct = encrypt("dữ liệu mật".toByteArray(), CryptoScheme.chunkAad("node-1", 0, 3))
        assertThrows(IOException::class.java) {
            decrypt(ct, CryptoScheme.chunkAad("node-2", 0, 3))
        }
    }

    @Test
    fun `đảo thứ tự chunk bị phát hiện — ciphertext chunk 0 không giải được bằng AAD chunk 1`() {
        val nodeId = "node-1"
        val ct0 = encrypt(ByteArray(100) { 1 }, CryptoScheme.chunkAad(nodeId, 0, 2))
        val ct1 = encrypt(ByteArray(100) { 2 }, CryptoScheme.chunkAad(nodeId, 1, 2))
        // Kẻ tấn công đảo: engine giải ct1 với AAD idx=0 → fail; ct0 với AAD idx=1 → fail
        assertThrows(IOException::class.java) { decrypt(ct1, CryptoScheme.chunkAad(nodeId, 0, 2)) }
        assertThrows(IOException::class.java) { decrypt(ct0, CryptoScheme.chunkAad(nodeId, 1, 2)) }
    }

    @Test
    fun `cắt bớt ciphertext thất bại`() {
        val ct = encrypt(ByteArray(10_000) { it.toByte() }, CryptoScheme.chunkAad("node-1", 0, 1))
        assertThrows(IOException::class.java) {
            decrypt(ct.copyOf(ct.size - 5), CryptoScheme.chunkAad("node-1", 0, 1))
        }
    }

    @Test
    fun `sửa 1 byte giữa ciphertext thất bại`() {
        val ct = encrypt(ByteArray(10_000) { it.toByte() }, CryptoScheme.chunkAad("node-1", 0, 1))
        val tampered = ct.copyOf()
        tampered[tampered.size / 2] = (tampered[tampered.size / 2] + 1).toByte()
        assertThrows(IOException::class.java) {
            decrypt(tampered, CryptoScheme.chunkAad("node-1", 0, 1))
        }
    }

    @Test
    fun `master key khác không giải được`() {
        val ct = encrypt("bí mật".toByteArray(), CryptoScheme.chunkAad("node-1", 0, 1))
        val other = NodeCipher(CryptoScheme.generateMasterKey())
        assertThrows(IOException::class.java) {
            other.newDecryptingStream(ByteArrayInputStream(ct), CryptoScheme.chunkAad("node-1", 0, 1))
                .use { it.readBytes() }
        }
    }

    @Test
    fun `ciphertext overhead nhỏ — chunk 19 MiB vẫn dưới 20 MB Telegram`() {
        val chunkPlain = 19L * 1024 * 1024
        val ctSize = CryptoScheme.ciphertextSizeFor(chunkPlain)
        assertTrue("overhead phải < vài trăm byte: $ctSize", ctSize - chunkPlain < 1024)
        assertTrue("phải < 20.000.000: $ctSize", ctSize < 20_000_000L)
    }

    @Test
    fun `ciphertext trông ngẫu nhiên — không chứa plaintext`() {
        val plain = ByteArray(4096) { 'A'.code.toByte() }
        val ct = encrypt(plain, CryptoScheme.chunkAad("node-1", 0, 1))
        // không có chuỗi 'AAAA' dài nào lọt vào ciphertext
        val haystack = String(ct, Charsets.ISO_8859_1)
        assertTrue(!haystack.contains("AAAA"))
    }
}
