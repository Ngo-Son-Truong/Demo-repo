package com.tgvault.app.core.common

/**
 * Trùng tên trong cùng thư mục → thêm hậu tố " (1)", " (2)"… (FR-FILE-4).
 * So sánh theo tên đã chuẩn hoá (không phân biệt hoa thường/dấu).
 */
object UniqueNameResolver {
    fun resolve(
        desired: String,
        existingNormalized: Set<String>,
    ): String {
        if (NameNormalizer.normalize(desired) !in existingNormalized) return desired

        val dot = desired.lastIndexOf('.')
        val hasExtension = dot > 0 && dot < desired.length - 1 && desired.length - dot <= 6
        val base = if (hasExtension) desired.substring(0, dot) else desired
        val extension = if (hasExtension) desired.substring(dot) else ""

        var n = 1
        while (true) {
            val candidate = "$base ($n)$extension"
            if (NameNormalizer.normalize(candidate) !in existingNormalized) return candidate
            n++
        }
    }
}
