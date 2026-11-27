package com.tgvault.app.core.common

import org.junit.Assert.assertEquals
import org.junit.Test

class NameNormalizerTest {
    @Test
    fun `tiếng Việt có dấu về dạng không dấu`() {
        assertEquals("bao cao tai chinh", NameNormalizer.normalize("Báo cáo Tài chính"))
    }

    @Test
    fun `chữ đ hoa và thường về d`() {
        assertEquals("dang van d", NameNormalizer.normalize("Đặng Văn Đ"))
    }

    @Test
    fun `chuỗi dựng sẵn và tổ hợp cho cùng kết quả`() {
        // "ế" dựng sẵn vs e + combining circumflex + combining acute
        val precomposed = "tiếng"
        val decomposed = "tie\u0302\u0301ng"
        assertEquals(NameNormalizer.normalize(precomposed), NameNormalizer.normalize(decomposed))
    }

    @Test
    fun `trim và lowercase`() {
        assertEquals("hello world", NameNormalizer.normalize("  Hello   World "))
    }

    @Test
    fun `ký tự đặc biệt giữ nguyên`() {
        assertEquals("file (1).txt", NameNormalizer.normalize("File (1).txt"))
    }
}
