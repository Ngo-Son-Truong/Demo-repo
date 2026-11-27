package com.tgvault.app.core.common

import java.text.Normalizer

/** Chuẩn hoá tên để tìm kiếm (FR-FILE-6): chữ thường, bỏ dấu (kể cả đ/Đ), trim. */
object NameNormalizer {

    private val DIACRITICS = Regex("\\p{M}+")

    fun normalize(name: String): String {
        // đ/Đ không phân rã được bằng NFD — xử lý riêng
        val withD = name.replace('đ', 'd').replace('Đ', 'D')
        val decomposed = Normalizer.normalize(withD, Normalizer.Form.NFD)
        return decomposed.replace(DIACRITICS, "").lowercase().trim()
    }
}
