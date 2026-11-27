package com.tgvault.app.core.util

import android.content.ContentResolver
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.Locale

/** Tiện ích tệp dùng chung (M5): staging URI, định dạng dung lượng, icon MIME. */
object FileUtils {
    /** Chép nội dung URI (SAF/share) vào thư mục riêng của app; trả File đích (đã xoá nếu lỗi). */
    suspend fun copyToPrivateStorage(
        uri: Uri,
        targetDir: File,
        resolver: ContentResolver,
    ): File =
        withContext(Dispatchers.IO) {
            targetDir.mkdirs()
            val dest = File(targetDir, "${java.util.UUID.randomUUID()}.bin")
            try {
                resolver.openInputStream(uri)?.use { input ->
                    dest.outputStream().use { output -> input.copyTo(output, bufferSize = 256 * 1024) }
                } ?: error("không mở được $uri")
                dest
            } catch (e: Exception) {
                dest.delete()
                throw e
            }
        }

    /** "1,5 MB" theo đơn vị SI — trung lập ngôn ngữ (SPEC §15.5). */
    fun formatBytes(bytes: Long): String =
        when {
            bytes < 1_000 -> "$bytes B"
            bytes < 1_000_000 -> String.format(Locale.US, "%.1f KB", bytes / 1_000f)
            bytes < 1_000_000_000 -> String.format(Locale.US, "%.1f MB", bytes / 1_000_000f)
            else -> String.format(Locale.US, "%.2f GB", bytes / 1_000_000_000f)
        }

    enum class MimeKind { IMAGE, VIDEO, AUDIO, PDF, ZIP, DOC, SHEET, SLIDE, TEXT, OTHER }

    fun mimeKind(mimeType: String?): MimeKind =
        when {
            mimeType == null -> MimeKind.OTHER
            mimeType.startsWith("image/") -> MimeKind.IMAGE
            mimeType.startsWith("video/") -> MimeKind.VIDEO
            mimeType.startsWith("audio/") -> MimeKind.AUDIO
            mimeType == "application/pdf" -> MimeKind.PDF
            mimeType == "application/zip" || mimeType.endsWith("x-7z-compressed") ||
                mimeType.endsWith("x-rar-compressed") -> MimeKind.ZIP
            mimeType.contains("word") || mimeType.endsWith("msword") -> MimeKind.DOC
            mimeType.contains("excel") || mimeType.contains("spreadsheet") -> MimeKind.SHEET
            mimeType.contains("presentation") || mimeType.contains("powerpoint") -> MimeKind.SLIDE
            mimeType.startsWith("text/") -> MimeKind.TEXT
            else -> MimeKind.OTHER
        }
}
