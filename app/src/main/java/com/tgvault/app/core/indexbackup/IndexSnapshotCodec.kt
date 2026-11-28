package com.tgvault.app.core.indexbackup

import com.tgvault.app.core.crypto.CryptoScheme
import com.tgvault.app.core.crypto.NodeCipher
import com.tgvault.app.data.local.entity.ChunkEntity
import com.tgvault.app.data.local.entity.NodeEntity
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream

/**
 * Định dạng snapshot index (M8-1, SPEC §11):
 * `magic "TGVI"`(4) ‖ `version`(1) ‖ `headerLength`(4, BE) ‖ `header`(JSON, KHÔNG mã hoá) ‖ `payload`.
 * payload = gzip(JSON {nodes[], chunks[]}) → nếu mã hoá: Tink AesGcmHkdfStreaming, AAD = "index"‖revision.
 *
 * Manifest (tin nhắn văn bản ghim): dòng đầu `TGVAULT_INDEX_V1`, dòng sau là JSON
 * {revision, sha256, parts:[{file_id, message_id, size}], prev}.
 * `prev` = manifest JSON nguyên văn của phiên bản trước → giữ 2 phiên bản + xoá được bản cũ
 * (message_id cần để deleteMessage; SPEC chỉ định file_id nhưng không cấm field mở rộng).
 *
 * Snapshot được xử lý trong RAM (index nhỏ — JSON gzip của metadata, không phải dữ liệu tệp; D7
 * chỉ cấm đưa CHUNK TỆP vào RAM).
 */
object IndexSnapshotCodec {
    const val MAGIC = "TGVI"
    const val VERSION: Byte = 1
    const val MANIFEST_PREFIX = "TGVAULT_INDEX_V1"
    private const val FIXED_HEADER_SIZE = 4 + 1 + 4

    private val json = Json { ignoreUnknownKeys = true }

    class SnapshotFormatException(
        message: String,
    ) : Exception(message)

    @Serializable
    data class KdfInfo(
        val algo: String = "scrypt",
        val n: Int = CryptoScheme.SCRYPT_N,
        val r: Int = CryptoScheme.SCRYPT_R,
        val p: Int = CryptoScheme.SCRYPT_P,
    )

    @Serializable
    data class SnapshotHeader(
        val revision: Long,
        val createdAt: Long,
        val deviceId: String,
        val encrypted: Boolean,
        val kdf: KdfInfo? = null,
        /** base64 blob 77 byte bọc bởi passphrase (CryptoScheme.wrapWithPassphrase) */
        val wrappedMasterKey: String? = null,
    )

    @Serializable
    data class SnapshotNode(
        val id: String,
        val parentId: String? = null,
        val type: String,
        val name: String,
        val nameNormalized: String,
        val mimeType: String? = null,
        val sizeBytes: Long,
        val sha256: String? = null,
        val chunkCount: Int,
        val chunkSize: Int,
        val encrypted: Boolean,
        val status: String,
        val createdAt: Long,
        val modifiedAt: Long,
        val trashedAt: Long? = null,
        val trashRootId: String? = null,
    )

    @Serializable
    data class SnapshotChunk(
        val nodeId: String,
        val idx: Int,
        val plainSizeBytes: Long,
        val storedSizeBytes: Long,
        val tgChatId: Long? = null,
        val tgMessageId: Long? = null,
        val tgFileId: String? = null,
        val tgFileUniqueId: String? = null,
        val sha256: String? = null,
    )

    @Serializable
    data class SnapshotPayload(
        val nodes: List<SnapshotNode>,
        val chunks: List<SnapshotChunk>,
    )

    @Serializable
    data class ManifestPart(
        @SerialName("file_id") val fileId: String,
        @SerialName("message_id") val messageId: Long,
        val size: Long,
    )

    @Serializable
    data class IndexManifest(
        val revision: Long,
        val sha256: String,
        val createdAt: Long,
        val parts: List<ManifestPart>,
        /** manifest JSON nguyên văn của phiên bản trước (để xoá bản cũ hơn nữa) */
        val prev: String? = null,
        /** messageId của tin manifest phiên bản trước (unpin/xoá khi dọn dẹp) */
        val prevManifestMessageId: Long? = null,
    )

    // ---------- entity <-> DTO ----------

    fun NodeEntity.toSnapshot() =
        SnapshotNode(
            id, parentId, type, name, nameNormalized, mimeType, sizeBytes, sha256,
            chunkCount, chunkSize, encrypted, status, createdAt, modifiedAt, trashedAt, trashRootId,
        )

    fun ChunkEntity.toSnapshot() =
        SnapshotChunk(
            nodeId, idx, plainSizeBytes, storedSizeBytes,
            tgChatId, tgMessageId, tgFileId, tgFileUniqueId, sha256,
        )

    fun SnapshotNode.toEntity() =
        NodeEntity(
            id, parentId, type, name, nameNormalized, mimeType, sizeBytes, sha256,
            chunkCount, chunkSize, encrypted, status, createdAt, modifiedAt, trashedAt, trashRootId,
        )

    fun SnapshotChunk.toEntity() =
        ChunkEntity(
            nodeId = nodeId, idx = idx, plainSizeBytes = plainSizeBytes, storedSizeBytes = storedSizeBytes,
            tgChatId = tgChatId, tgMessageId = tgMessageId, tgFileId = tgFileId,
            tgFileUniqueId = tgFileUniqueId, sha256 = sha256,
        )

    // ---------- encode / decode ----------

    /**
     * Mã hoá snapshot thành byte chuỗi. [cipher] != null → payload mã hoá bằng master key,
     * AAD = indexAad(revision); header.encrypted phải tương ứng.
     */
    fun encode(
        payload: SnapshotPayload,
        header: SnapshotHeader,
        cipher: NodeCipher?,
    ): ByteArray {
        require(header.encrypted == (cipher != null)) { "header.encrypted không khớp cipher" }
        val payloadJson = json.encodeToString(SnapshotPayload.serializer(), payload)
        val gzipped = gzip(payloadJson.toByteArray(Charsets.UTF_8))
        val payloadBytes =
            if (cipher != null) {
                val aad = CryptoScheme.indexAad(header.revision)
                val sink = ByteArrayOutputStream()
                cipher.newEncryptingStream(sink, aad).use { it.write(gzipped) }
                sink.toByteArray()
            } else {
                gzipped
            }
        val headerBytes = json.encodeToString(SnapshotHeader.serializer(), header).toByteArray(Charsets.UTF_8)
        return ByteBuffer
            .allocate(FIXED_HEADER_SIZE + headerBytes.size + payloadBytes.size)
            .order(ByteOrder.BIG_ENDIAN)
            .put(MAGIC.toByteArray(Charsets.US_ASCII))
            .put(VERSION)
            .putInt(headerBytes.size)
            .put(headerBytes)
            .put(payloadBytes)
            .array()
    }

    /** Tách header + payload bytes (CHƯA giải mã) — để đọc header trước khi hỏi passphrase. */
    fun parse(bytes: ByteArray): Pair<SnapshotHeader, ByteArray> {
        if (bytes.size < FIXED_HEADER_SIZE) throw SnapshotFormatException("snapshot quá ngắn: ${bytes.size}")
        val buf = ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN)
        val magic = ByteArray(4).also { buf.get(it) }
        if (String(magic, Charsets.US_ASCII) != MAGIC) throw SnapshotFormatException("sai magic")
        val version = buf.get()
        if (version != VERSION) throw SnapshotFormatException("version không hỗ trợ: $version")
        val headerLen = buf.int
        if (headerLen <= 0 || headerLen > bytes.size - FIXED_HEADER_SIZE) {
            throw SnapshotFormatException("headerLength bất thường: $headerLen")
        }
        val headerBytes = ByteArray(headerLen).also { buf.get(it) }
        val header =
            try {
                json.decodeFromString(SnapshotHeader.serializer(), String(headerBytes, Charsets.UTF_8))
            } catch (e: Exception) {
                throw SnapshotFormatException("header JSON hỏng: ${e.message}")
            }
        val payload = ByteArray(buf.remaining()).also { buf.get(it) }
        return header to payload
    }

    /** Giải mã (nếu cần) + gunzip + parse payload. Sai khoá/AAD → IOException từ Tink. */
    fun decodePayload(
        header: SnapshotHeader,
        payloadBytes: ByteArray,
        cipher: NodeCipher?,
    ): SnapshotPayload {
        require(header.encrypted == (cipher != null)) { "header.encrypted không khớp cipher" }
        val gzipped =
            if (cipher != null) {
                val aad = CryptoScheme.indexAad(header.revision)
                cipher.newDecryptingStream(ByteArrayInputStream(payloadBytes), aad).use { it.readBytes() }
            } else {
                payloadBytes
            }
        val jsonText = gunzip(gzipped).toString(Charsets.UTF_8)
        return json.decodeFromString(SnapshotPayload.serializer(), jsonText)
    }

    // ---------- manifest ----------

    fun encodeManifest(manifest: IndexManifest): String =
        MANIFEST_PREFIX + "\n" + json.encodeToString(IndexManifest.serializer(), manifest)

    /** Parse tin ghim → manifest; null nếu không phải manifest TgVault. */
    fun parseManifest(text: String?): IndexManifest? {
        if (text == null || !text.startsWith(MANIFEST_PREFIX)) return null
        val jsonPart = text.substringAfter('\n', "")
        if (jsonPart.isEmpty()) return null
        return try {
            json.decodeFromString(IndexManifest.serializer(), jsonPart)
        } catch (e: Exception) {
            null
        }
    }

    private fun gzip(data: ByteArray): ByteArray {
        val out = ByteArrayOutputStream()
        GZIPOutputStream(out).use { it.write(data) }
        return out.toByteArray()
    }

    private fun gunzip(data: ByteArray): ByteArray = GZIPInputStream(ByteArrayInputStream(data)).use { it.readBytes() }
}
