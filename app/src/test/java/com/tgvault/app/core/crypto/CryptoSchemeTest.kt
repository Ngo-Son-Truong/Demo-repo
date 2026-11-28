package com.tgvault.app.core.crypto

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.GeneralSecurityException

class CryptoSchemeTest {
    @Test
    fun `bọc rồi mở master key bằng passphrase khôi phục đúng khoá`() {
        val master = CryptoScheme.generateMasterKey()
        val blob = CryptoScheme.wrapWithPassphrase(master, "mật khẩu siêu bí mật".toCharArray())
        assertEquals(CryptoScheme.WRAPPED_BLOB_SIZE, blob.size)
        assertArrayEquals(master, CryptoScheme.unwrapWithPassphrase(blob, "mật khẩu siêu bí mật".toCharArray()))
    }

    @Test
    fun `passphrase sai không mở được blob`() {
        val master = CryptoScheme.generateMasterKey()
        val blob = CryptoScheme.wrapWithPassphrase(master, "passphrase-đúng".toCharArray())
        assertThrows(GeneralSecurityException::class.java) {
            CryptoScheme.unwrapWithPassphrase(blob, "passphrase-sai!".toCharArray())
        }
    }

    @Test
    fun `sửa 1 byte bất kỳ của blob làm mở thất bại`() {
        val master = CryptoScheme.generateMasterKey()
        val blob = CryptoScheme.wrapWithPassphrase(master, "passphrase-123".toCharArray())
        // tamper ở 3 vùng: salt, nonce, ciphertext
        for (pos in listOf(1, 20, blob.size - 1)) {
            val tampered = blob.copyOf()
            tampered[pos] = (tampered[pos] + 1).toByte()
            assertThrows(Exception::class.java) {
                CryptoScheme.unwrapWithPassphrase(tampered, "passphrase-123".toCharArray())
            }
        }
    }

    @Test
    fun `hai lần bọc cùng khoá cho blob khác nhau (salt ngẫu nhiên)`() {
        val master = CryptoScheme.generateMasterKey()
        val a = CryptoScheme.wrapWithPassphrase(master, "passphrase-123".toCharArray())
        val b = CryptoScheme.wrapWithPassphrase(master, "passphrase-123".toCharArray())
        assertTrue(!a.contentEquals(b))
        assertArrayEquals(master, CryptoScheme.unwrapWithPassphrase(a, "passphrase-123".toCharArray()))
        assertArrayEquals(master, CryptoScheme.unwrapWithPassphrase(b, "passphrase-123".toCharArray()))
    }

    @Test
    fun `deriveKek ổn định với cùng passphrase và salt`() {
        val salt = CryptoScheme.generateSalt()
        val a = CryptoScheme.deriveKek("passphrase-123".toCharArray(), salt)
        val b = CryptoScheme.deriveKek("passphrase-123".toCharArray(), salt)
        assertArrayEquals(a, b)
        val c = CryptoScheme.deriveKek("passphrase-124".toCharArray(), salt)
        assertNotEquals(a.toList(), c.toList())
    }

    @Test
    fun `passphrase ngắn hơn tối thiểu bị từ chối`() {
        assertThrows(IllegalArgumentException::class.java) {
            CryptoScheme.deriveKek("ngắn".toCharArray(), CryptoScheme.generateSalt())
        }
    }

    @Test
    fun `chunkAad ràng buộc nodeId idx chunkCount`() {
        val base = CryptoScheme.chunkAad("node-abc", 0, 4)
        assertNotEquals(base.toList(), CryptoScheme.chunkAad("node-abc", 1, 4).toList())
        assertNotEquals(base.toList(), CryptoScheme.chunkAad("node-abc", 0, 5).toList())
        assertNotEquals(base.toList(), CryptoScheme.chunkAad("node-abd", 0, 4).toList())
        assertArrayEquals(base, CryptoScheme.chunkAad("node-abc", 0, 4))
    }

    @Test
    fun `ciphertextSizeFor khớp kích thước Tink thật`() {
        val cipher = NodeCipher(CryptoScheme.generateMasterKey())
        val aad = CryptoScheme.chunkAad("n", 0, 1)
        for (plainSize in listOf(1L, 1_000L, CryptoScheme.STREAM_SEGMENT_SIZE.toLong(), 2L * CryptoScheme.STREAM_SEGMENT_SIZE + 7)) {
            val sink = java.io.ByteArrayOutputStream()
            cipher.newEncryptingStream(sink, aad).use { out ->
                var left = plainSize
                val buf = ByteArray(8192)
                while (left > 0) {
                    val n = minOf(buf.size.toLong(), left).toInt()
                    out.write(buf, 0, n)
                    left -= n
                }
            }
            assertEquals(CryptoScheme.ciphertextSizeFor(plainSize), sink.size().toLong())
        }
    }
}
