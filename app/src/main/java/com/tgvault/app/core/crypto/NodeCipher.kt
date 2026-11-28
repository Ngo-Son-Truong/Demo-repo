package com.tgvault.app.core.crypto

import com.google.crypto.tink.InsecureSecretKeyAccess
import com.google.crypto.tink.KeysetHandle
import com.google.crypto.tink.StreamingAead
import com.google.crypto.tink.streamingaead.AesGcmHkdfStreamingKey
import com.google.crypto.tink.streamingaead.AesGcmHkdfStreamingParameters
import com.google.crypto.tink.streamingaead.StreamingAeadConfig
import com.google.crypto.tink.util.SecretBytes
import java.io.InputStream
import java.io.OutputStream

/**
 * Mã hoá/giải mã chunk streaming bằng Tink `AesGcmHkdfStreaming` (M7-2, SPEC §12):
 * segment 1 MiB, ikm = master key, AAD = [CryptoScheme.chunkAad].
 *
 * Thuần JVM (không phụ thuộc Android) → unit test được. KHÔNG BAO GIỜ đọc nguyên
 * chunk vào RAM (D7): encrypt/decrypt chảy qua stream, segment 1 MiB.
 */
class NodeCipher(
    masterKey: ByteArray,
) {
    init {
        require(masterKey.size == CryptoScheme.MASTER_KEY_SIZE) { "master key sai kích thước" }
        ensureRegistered()
    }

    private val streamingAead: StreamingAead = buildHandle(masterKey).getPrimitive(StreamingAead::class.java)

    /** Stream bọc [sink]: dữ liệu ghi vào được mã hoá (ghi xong PHẢI close để flush segment cuối). */
    fun newEncryptingStream(
        sink: OutputStream,
        aad: ByteArray,
    ): OutputStream = streamingAead.newEncryptingStream(sink, aad)

    /** Stream bọc [source]: đọc ra plaintext; ném IOException(AEADBadTagException) khi sai khoá/AAD/cắt bớt. */
    fun newDecryptingStream(
        source: InputStream,
        aad: ByteArray,
    ): InputStream = streamingAead.newDecryptingStream(source, aad)

    private companion object {
        @Volatile
        private var registered = false

        @Synchronized
        fun ensureRegistered() {
            if (!registered) {
                StreamingAeadConfig.register()
                registered = true
            }
        }

        /** Dựng KeysetHandle trực tiếp từ master key (ikm) qua API object của Tink (không qua file keyset). */
        fun buildHandle(masterKey: ByteArray): KeysetHandle {
            val params =
                AesGcmHkdfStreamingParameters
                    .builder()
                    .setKeySizeBytes(CryptoScheme.MASTER_KEY_SIZE)
                    .setDerivedAesGcmKeySizeBytes(32)
                    .setHkdfHashType(AesGcmHkdfStreamingParameters.HashType.SHA256)
                    .setCiphertextSegmentSizeBytes(CryptoScheme.STREAM_SEGMENT_SIZE)
                    .build()
            val key =
                AesGcmHkdfStreamingKey.create(
                    params,
                    SecretBytes.copyFrom(masterKey, InsecureSecretKeyAccess.getInstance()),
                )
            return KeysetHandle
                .newBuilder()
                .addEntry(KeysetHandle.importKey(key).withFixedId(1).makePrimary())
                .build()
        }
    }
}
