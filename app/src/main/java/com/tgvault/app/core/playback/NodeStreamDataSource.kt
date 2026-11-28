package com.tgvault.app.core.playback

import android.net.Uri
import androidx.media3.common.C
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import com.tgvault.app.data.remote.TelegramGateway
import com.tgvault.app.domain.model.Chunk
import com.tgvault.app.domain.model.Node
import kotlinx.coroutines.runBlocking
import timber.log.Timber
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.util.concurrent.Executor
import java.util.concurrent.Executors

/**
 * DataSource của ExoPlayer đọc TRỰC TIẾP từ các chunk trên Telegram (streaming thật):
 * - Vị trí đọc → (chunk idx, offset trong chunk) theo chunkSize đều (chunk cuối ngắn hơn).
 * - Chunk được tải nguyên vẹn qua Range request (Telegram hỗ trợ 206 — đã xác minh Q6)
 *   vào cache đĩa `cacheDir/stream/<nodeId>/`, LRU giữ tối đa [MAX_CACHED_CHUNKS] chunk.
 * - Prefetch chunk kế tiếp ở nền để phát mượt; tua ngược không tải lại nếu còn cache.
 *
 * Lưu ý: chỉ áp dụng khi node CHƯA mã hoá (M7 sẽ cần lớp giải mã xen giữa).
 * Mọi lỗi được gói thành IOException để ExoPlayer đưa về trạng thái lỗi chuẩn.
 */
class NodeStreamDataSource(
    private val node: Node,
    private val chunks: List<Chunk>,
    private val gateway: TelegramGateway,
    private val nodeCacheDir: File,
    private val prefetchExecutor: Executor,
) : DataSource {
    private var opened = false
    private var position = 0L
    private var bytesRemaining = 0L
    private var currentReader: RandomAccessFile? = null
    private var currentChunkIdx = -1

    override fun open(dataSpec: DataSpec): Long {
        val total = node.sizeBytes
        position = dataSpec.position.coerceIn(0L, total)
        bytesRemaining = total - position
        opened = true
        return bytesRemaining
    }

    override fun read(
        buffer: ByteArray,
        offset: Int,
        readLength: Int,
    ): Int {
        if (readLength == 0) return 0
        if (!opened || bytesRemaining == 0L) return C.RESULT_END_OF_INPUT
        return try {
            readInternal(buffer, offset, readLength)
        } catch (e: Exception) {
            Timber.w(e, "stream read lỗi tại %d", position)
            throw IOException("đọc chunk stream thất bại tại $position", e)
        }
    }

    private fun readInternal(
        buffer: ByteArray,
        offset: Int,
        readLength: Int,
    ): Int {
        val chunkSize = node.chunkSize.toLong()
        val chunkIdx = (position / chunkSize).toInt()
        val within = (position % chunkSize)

        val reader = readerFor(chunkIdx)
        reader.seek(within)

        val chunkLen = chunks[chunkIdx].plainSizeBytes
        val want = minOf(readLength.toLong(), chunkLen - within, bytesRemaining).toInt()
        if (want <= 0) return C.RESULT_END_OF_INPUT
        val got = reader.read(buffer, offset, want)
        if (got <= 0) return C.RESULT_END_OF_INPUT

        position += got
        bytesRemaining -= got

        // Hết chunk hiện tại → prefetch chunk kế (nếu có)
        if (within + got >= chunkLen && chunkIdx + 1 < chunks.size) {
            prefetch(chunkIdx + 1)
        }
        return got
    }

    @Synchronized
    private fun readerFor(chunkIdx: Int): RandomAccessFile {
        if (currentChunkIdx == chunkIdx && currentReader != null) return currentReader!!
        currentReader?.close()
        val file = ensureChunkCached(chunkIdx)
        currentReader = RandomAccessFile(file, "r")
        currentChunkIdx = chunkIdx
        return currentReader!!
    }

    /** Tải chunk về cache đĩa (blocking — ExoPlayer gọi read trên loader thread). */
    private fun ensureChunkCached(chunkIdx: Int): File {
        val chunk = chunks[chunkIdx]
        val file = chunkFile(chunkIdx)
        if (file.exists() && file.length() == chunk.plainSizeBytes) {
            file.setLastModified(System.currentTimeMillis())
            return file
        }
        nodeCacheDir.mkdirs()
        val tmp = File(nodeCacheDir, "chunk_$chunkIdx.tmp")
        try {
            runBlocking {
                val fileId =
                    chunk.tgFileId ?: throw IOException("chunk $chunkIdx chưa có fileId")
                val path = gateway.resolveFilePath(fileId)
                tmp.outputStream().use { sink ->
                    gateway.download(path, sink, 0L until chunk.plainSizeBytes)
                }
            }
            if (tmp.length() != chunk.plainSizeBytes) {
                throw IOException("chunk $chunkIdx tải thiếu: ${tmp.length()}/${chunk.plainSizeBytes}")
            }
            tmp.renameTo(file)
            evictOldChunks()
            return file
        } finally {
            tmp.delete()
        }
    }

    private fun prefetch(nextIdx: Int) {
        prefetchExecutor.execute {
            runCatching { ensureChunkCached(nextIdx) }
                .onFailure { Timber.w(it, "prefetch chunk %d lỗi", nextIdx) }
        }
    }

    /** LRU: giữ tối đa MAX_CACHED_CHUNKS chunk, xoá chunk cũ nhất theo lastModified. */
    private fun evictOldChunks() {
        val files =
            nodeCacheDir.listFiles { f -> f.name.startsWith("chunk_") && f.extension != "tmp" }
                ?: return
        if (files.size <= MAX_CACHED_CHUNKS) return
        files.sortedBy { it.lastModified() }
            .take(files.size - MAX_CACHED_CHUNKS)
            .forEach { it.delete() }
    }

    private fun chunkFile(idx: Int) = File(nodeCacheDir, "chunk_$idx")

    override fun addTransferListener(transferListener: androidx.media3.datasource.TransferListener) {
        // Không cần báo cáo băng thông — analytics ngoài phạm vi SPEC
    }

    override fun getUri(): Uri = Uri.parse("tgvault://stream/${node.id}")

    override fun close() {
        opened = false
        currentReader?.close()
        currentReader = null
        currentChunkIdx = -1
    }

    /** Factory cho DefaultMediaSourceFactory: một node = một stream. */
    class Factory(
        private val node: Node,
        private val chunks: List<Chunk>,
        private val gateway: TelegramGateway,
        private val streamCacheRoot: File,
    ) : androidx.media3.datasource.DataSource.Factory {
        // Executor dùng chung cho mọi DataSource của node này; player release → DataSource đóng.
        private val executor: Executor = Executors.newSingleThreadExecutor()

        override fun createDataSource(): DataSource =
            NodeStreamDataSource(
                node = node,
                chunks = chunks,
                gateway = gateway,
                nodeCacheDir = File(streamCacheRoot, node.id),
                prefetchExecutor = executor,
            )
    }

    companion object {
        const val MAX_CACHED_CHUNKS = 3
    }
}
