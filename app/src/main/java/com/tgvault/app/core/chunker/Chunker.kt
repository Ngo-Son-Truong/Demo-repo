package com.tgvault.app.core.chunker

import com.tgvault.app.domain.model.ChunkSource
import java.io.InputStream
import java.io.OutputStream
import kotlinx.coroutines.Dispatchers as KtDispatchers
import kotlinx.coroutines.withContext

/**
 * Chunker — nguồn streaming duy nhất cho upload; KHÔNG BAO GIỜ đưa nguyên chunk vào RAM (D7).
 *
 * Với mỗi chunk nó ghi đúng `length` byte từ [InputStream] hiện tại vào [OutputStream] đích
 * (thường là HTTP request body) theo vòng lặp 64 KiB. SHA-256 tích luỹ ở tầng engine.
 */
class Chunker(
    private val input: InputStream,
    private val chunkSize: Int,
    private val totalBytes: Long,
) {
    init {
        require(chunkSize > 0) { "chunkSize phải > 0" }
        require(totalBytes > 0) { "tệp rỗng — không hỗ trợ (SPEC §10.1)" }
    }

    val chunkCount: Int = ((totalBytes + chunkSize - 1) / chunkSize).toInt()

    /** Kích thước plaintext của chunk [idx] (chunk cuối có thể nhỏ hơn). */
    fun plainSizeOf(idx: Int): Long {
        require(idx in 0 until chunkCount) { "idx ngoài phạm vi: $idx" }
        return if (idx == chunkCount - 1) {
            val remainder = totalBytes % chunkSize
            if (remainder == 0L) chunkSize.toLong() else remainder
        } else {
            chunkSize.toLong()
        }
    }

    /**
     * Trả [ChunkSource] cho chunk tiếp theo trong luồng. Gọi tuần tự 0..chunkCount-1;
     * trả null khi hết. Source KHÔNG đọc trước — byte chỉ chảy khi [ChunkSource.writeTo] được gọi
     * (Retrofit gọi trong lúc ghi request body).
     */
    fun next(): ChunkSource? {
        if (produced >= chunkCount) return null
        val idx = produced
        produced++
        val length = plainSizeOf(idx)
        return StreamChunkSource(input, length)
    }

    /** Bỏ qua phần còn lại của luồng (dùng khi huỷ giữa chừng). */
    fun discard() {
        input.close()
        produced = chunkCount
    }

    private var produced = 0

    private class StreamChunkSource(
        private val input: InputStream,
        override val length: Long,
    ) : ChunkSource {
        override suspend fun writeTo(
            out: OutputStream,
            onProgress: (bytesWritten: Long) -> Unit,
        ) = withContext(KtDispatchers.IO) {
            val buffer = ByteArray(BUFFER_SIZE)
            var remaining = length
            var written = 0L
            while (remaining > 0) {
                val want = minOf(buffer.size.toLong(), remaining).toInt()
                val read = input.read(buffer, 0, want)
                if (read < 0) break
                out.write(buffer, 0, read)
                remaining -= read
                written += read
                onProgress(written)
            }
            if (written != length) {
                throw java.io.IOException(
                    "nguồn kết thúc sớm: đọc được $written/$length byte (SOURCE_CHANGED?)",
                )
            }
        }
    }

    companion object {
        const val BUFFER_SIZE = 64 * 1024
    }
}
