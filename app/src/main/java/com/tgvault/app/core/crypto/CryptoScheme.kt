package com.tgvault.app.core.crypto

import org.bouncycastle.crypto.generators.SCrypt
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.GeneralSecurityException
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Lược đồ mã hoá đầu-cuối (M7-1, SPEC §12) — PHẦN THUẦN JVM, unit test được.
 *
 * - Master key: 32 byte ngẫu nhiên.
 * - Bọc bằng passphrase: scrypt(N=2^15, r=8, p=1) → KEK 32 byte → AES-256-GCM.
 *   Blob = version(1) ‖ salt(16) ‖ nonce(12) ‖ ciphertext(48) = 77 byte.
 * - Mã hoá chunk: Tink AesGcmHkdfStreaming, segment 1 MiB (xem [NodeCipher]).
 *
 * THAM SỐ KDF CHỈ ĐỊNH NGHĨA Ở ĐÂY (SPEC §12) — đổi tham số = blob cũ không mở được,
 * nên version blob và KHÔNG BAO GIỜ đổi ngầm. Ghi chú: docs/DECISIONS.md (2026-11-27).
 */
object CryptoScheme {
    const val MASTER_KEY_SIZE = 32
    const val SALT_SIZE = 16
    const val SCRYPT_N = 1 shl 15
    const val SCRYPT_R = 8
    const val SCRYPT_P = 1
    const val MIN_PASSPHRASE_CHARS = 8
    const val BLOB_VERSION: Byte = 1

    /** Segment Tink AesGcmHkdfStreaming — SPEC §12: 1 MiB. */
    const val STREAM_SEGMENT_SIZE = 1 shl 20

    private const val GCM_NONCE_SIZE = 12
    private const val GCM_TAG_BITS = 128
    private const val STREAM_HEADER_SIZE = 40 // 1 (keySize) + 32 (salt HKDF) + 7 (nonce prefix)
    private const val GCM_TAG_SIZE = 16

    /** Kích thước blob bọc master key bằng passphrase (cố định). */
    const val WRAPPED_BLOB_SIZE = 1 + SALT_SIZE + GCM_NONCE_SIZE + MASTER_KEY_SIZE + GCM_TAG_SIZE

    private val secureRandom = SecureRandom()

    fun generateMasterKey(): ByteArray = ByteArray(MASTER_KEY_SIZE).also(secureRandom::nextBytes)

    fun generateSalt(): ByteArray = ByteArray(SALT_SIZE).also(secureRandom::nextBytes)

    /** scrypt(passphrase, salt) → KEK 32 byte. Không tạo String trung gian (passphrase nằm trong CharArray). */
    fun deriveKek(
        passphrase: CharArray,
        salt: ByteArray,
    ): ByteArray {
        require(passphrase.size >= MIN_PASSPHRASE_CHARS) {
            "passphrase tối thiểu $MIN_PASSPHRASE_CHARS ký tự"
        }
        require(salt.size == SALT_SIZE) { "salt phải $SALT_SIZE byte" }
        return scryptHash(passphrase, salt)
    }

    /**
     * Hash PIN khoá app (M7-5, FR-SEC-2) — PIN 4–8 số nên KHÔNG áp min-length của passphrase.
     * Cùng tham số scrypt; salt riêng mỗi lần đặt.
     */
    fun hashPin(
        pin: CharArray,
        salt: ByteArray,
    ): ByteArray {
        require(pin.isNotEmpty()) { "PIN rỗng" }
        require(salt.size == SALT_SIZE) { "salt phải $SALT_SIZE byte" }
        return scryptHash(pin, salt)
    }

    private fun scryptHash(
        chars: CharArray,
        salt: ByteArray,
    ): ByteArray {
        val pwBytes = utf8Bytes(chars)
        try {
            return SCrypt.generate(pwBytes, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, MASTER_KEY_SIZE)
        } finally {
            pwBytes.fill(0)
        }
    }

    /** Bọc master key: version ‖ salt ‖ nonce ‖ AES-256-GCM(KEK, masterKey). */
    fun wrapWithPassphrase(
        masterKey: ByteArray,
        passphrase: CharArray,
        salt: ByteArray = generateSalt(),
    ): ByteArray {
        require(masterKey.size == MASTER_KEY_SIZE) { "master key phải $MASTER_KEY_SIZE byte" }
        val kek = deriveKek(passphrase, salt)
        try {
            val nonce = ByteArray(GCM_NONCE_SIZE).also(secureRandom::nextBytes)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(kek, "AES"), GCMParameterSpec(GCM_TAG_BITS, nonce))
            val ct = cipher.doFinal(masterKey)
            return ByteBuffer.allocate(WRAPPED_BLOB_SIZE)
                .put(BLOB_VERSION).put(salt).put(nonce).put(ct)
                .array()
        } finally {
            kek.fill(0)
        }
    }

    /**
     * Mở blob bọc bằng passphrase. Ném [GeneralSecurityException] (AEADBadTagException)
     * khi passphrase sai hoặc blob bị sửa — caller KHÔNG được phân biệt chi tiết hơn.
     */
    fun unwrapWithPassphrase(
        blob: ByteArray,
        passphrase: CharArray,
    ): ByteArray {
        require(blob.size == WRAPPED_BLOB_SIZE) { "blob bọc sai kích thước: ${blob.size}" }
        if (blob[0] != BLOB_VERSION) {
            throw GeneralSecurityException("blob version không hỗ trợ: ${blob[0]}")
        }
        val salt = blob.copyOfRange(1, 1 + SALT_SIZE)
        val nonce = blob.copyOfRange(1 + SALT_SIZE, 1 + SALT_SIZE + GCM_NONCE_SIZE)
        val ct = blob.copyOfRange(1 + SALT_SIZE + GCM_NONCE_SIZE, blob.size)
        val kek = deriveKek(passphrase, salt)
        try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(kek, "AES"), GCMParameterSpec(GCM_TAG_BITS, nonce))
            return cipher.doFinal(ct)
        } finally {
            kek.fill(0)
        }
    }

    /**
     * Associated data cho chunk (SPEC §12): "tgv1-chunk" ‖ nodeId(UTF-8) ‖ idx(BE u32) ‖ chunkCount(BE u32).
     * Chống đảo thứ tự, cắt bớt, thay chunk giữa các tệp.
     */
    fun chunkAad(
        nodeId: String,
        idx: Int,
        chunkCount: Int,
    ): ByteArray {
        val idBytes = nodeId.toByteArray(Charsets.UTF_8)
        return ByteBuffer.allocate(AAD_PREFIX.size + idBytes.size + 8)
            .order(ByteOrder.BIG_ENDIAN)
            .put(AAD_PREFIX)
            .put(idBytes)
            .putInt(idx)
            .putInt(chunkCount)
            .array()
    }

    /** AAD cho snapshot index (SPEC §12): "tgv1-index" ‖ revision(BE u64). */
    fun indexAad(revision: Long): ByteArray =
        ByteBuffer.allocate(10 + 8)
            .order(ByteOrder.BIG_ENDIAN)
            .put("tgv1-index".toByteArray(Charsets.UTF_8))
            .putLong(revision)
            .array()

    /**
     * Kích thước ciphertext Tink AesGcmHkdfStreaming cho [plainSize] byte:
     * header(40) + plain + 16 byte tag × số segment. Tink LUÔN ghi thêm 1 segment cuối
     * (kể cả rỗng) mang cờ "last" → số segment = floor(plain/segment) + 1.
     * PHẢI khớp implementation Tink — có unit test đo lại bằng Tink thật.
     */
    fun ciphertextSizeFor(plainSize: Long): Long {
        require(plainSize > 0) { "chunk rỗng — không hỗ trợ" }
        val segments = plainSize / STREAM_SEGMENT_SIZE + 1
        return STREAM_HEADER_SIZE + plainSize + segments * GCM_TAG_SIZE
    }

    private fun utf8Bytes(chars: CharArray): ByteArray {
        val buf = Charsets.UTF_8.encode(java.nio.CharBuffer.wrap(chars))
        val out = ByteArray(buf.remaining())
        buf.get(out)
        return out
    }

    private val AAD_PREFIX = "tgv1-chunk".toByteArray(Charsets.UTF_8)
}
