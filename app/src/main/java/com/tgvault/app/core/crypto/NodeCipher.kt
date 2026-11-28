package com.tgvault.app.core.crypto

import com.google.crypto.tink.InsecureSecretKeyAccess
import com.google.crypto.tink.KeysetHandle
import com.google.crypto.tink.StreamingAead
import com.google.crypto.tink.proto.AesGcmHkdfStreamingKey
import com.google.crypto.tink.proto.HashType
import com.google.crypto.tink.proto.KeyData
import com.google.crypto.tink.proto.KeyStatusType
import com.google.crypto.tink.proto.Keyset
import com.google.crypto.tink.proto.OutputPrefixType
import com.google.crypto.tink.streamingaead.StreamingAeadConfig
import com.google.crypto.tink.subtle.TinkProtoKeysetFormat
import com.google.protobuf.ByteString
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

        /**
         * Dựng KeysetHandle trực tiếp từ master key (ikm) — proto keyset serialize
         * qua TinkProtoKeysetFormat (API công khai, không cần registry writer).
         */
        fun buildHandle(masterKey: ByteArray): KeysetHandle {
            val params =
                com.google.crypto.tink.proto.AesGcmHkdfStreamingParams
                    .newBuilder()
                    .setCiphertextSegmentSize(CryptoScheme.STREAM_SEGMENT_SIZE)
                    .setDerivedKeySize(32)
                    .setHkdfHashType(HashType.SHA256)
                    .build()
            val keyData =
                KeyData
                    .newBuilder()
                    .setTypeUrl("type.googleapis.com/google.crypto.tink.AesGcmHkdfStreamingKey")
                    .setValue(
                        AesGcmHkdfStreamingKey
                            .newBuilder()
                            .setVersion(0)
                            .setKeyValue(ByteString.copyFrom(masterKey))
                            .setParams(params)
                            .build()
                            .toByteString(),
                    ).setKeyMaterialType(KeyData.KeyMaterialType.SYMMETRIC)
                    .build()
            val keyset =
                Keyset
                    .newBuilder()
                    .setPrimaryKeyId(1)
                    .addKey(
                        Keyset.Key
                            .newBuilder()
                            .setKeyId(1)
                            .setStatus(KeyStatusType.ENABLED)
                            .setOutputPrefixType(OutputPrefixType.RAW)
                            .setKeyData(keyData),
                    ).build()
            return TinkProtoKeysetFormat.parseKeyset(
                keyset.toByteArray(),
                InsecureSecretKeyAccess.getInstance(),
            )
        }
    }
}
