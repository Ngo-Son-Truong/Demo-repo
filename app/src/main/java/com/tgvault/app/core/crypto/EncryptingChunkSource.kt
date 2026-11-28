package com.tgvault.app.core.crypto

import com.tgvault.app.domain.model.ChunkSource
import java.io.FilterOutputStream
import java.io.OutputStream

/**
 * Bọc [ChunkSource] plaintext thành ciphertext streaming (M7-2): OkHttp ghi request body
 * → EncryptingChunkSource → Tink AesGcmHkdfStreaming → plaintext từ delegate. Không RAM (D7).
 *
 * [length] = kích thước ciphertext tính trước được ([CryptoScheme.ciphertextSizeFor]) để
 * OkHttp đặt Content-Length.
 */
class EncryptingChunkSource(
    private val cipher: NodeCipher,
    private val aad: ByteArray,
    private val delegate: ChunkSource,
) : ChunkSource {
    override val length: Long = CryptoScheme.ciphertextSizeFor(delegate.length)

    override fun writeTo(
        sink: OutputStream,
        onProgress: (bytesWritten: Long) -> Unit,
    ) {
        // NonClosing: sink thuộc OkHttp — Tink PHẢI close stream mã hoá để flush segment cuối
        // + tag, nhưng không được đóng request body sink (OkHttp tự đóng).
        val nonClosing =
            object : FilterOutputStream(sink) {
                override fun close() {
                    flush()
                }
            }
        cipher.newEncryptingStream(nonClosing, aad).use { enc ->
            delegate.writeTo(enc, onProgress)
        }
    }
}
