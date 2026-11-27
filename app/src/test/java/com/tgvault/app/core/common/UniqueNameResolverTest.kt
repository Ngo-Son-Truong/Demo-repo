package com.tgvault.app.core.common

import org.junit.Assert.assertEquals
import org.junit.Test

class UniqueNameResolverTest {
    @Test
    fun `không trùng thì giữ nguyên`() {
        assertEquals("photo.jpg", UniqueNameResolver.resolve("photo.jpg", setOf("other.jpg")))
    }

    @Test
    fun `trùng thì thêm hậu tố trước phần mở rộng`() {
        assertEquals(
            "photo (1).jpg",
            UniqueNameResolver.resolve("photo.jpg", setOf("photo.jpg")),
        )
    }

    @Test
    fun `tăng dần cho tới khi hết trùng`() {
        val existing = setOf("photo.jpg", "photo (1).jpg", "photo (2).jpg")
        assertEquals("photo (3).jpg", UniqueNameResolver.resolve("photo.jpg", existing))
    }

    @Test
    fun `so sánh không phân biệt hoa thường và dấu`() {
        val existing = setOf(NameNormalizer.normalize("Báo cáo.pdf"))
        assertEquals(
            "Báo cáo (1).pdf",
            UniqueNameResolver.resolve("báo cáo.pdf", existing),
        )
    }

    @Test
    fun `file không có phần mở rộng`() {
        assertEquals("README (1)", UniqueNameResolver.resolve("README", setOf("readme")))
    }

    @Test
    fun `phần mở rộng dài bất thường coi như không có`() {
        // ext > 6 ký tự → không tách
        assertEquals(
            "a.verylongext (1)",
            UniqueNameResolver.resolve("a.verylongext", setOf("a.verylongext")),
        )
    }
}
