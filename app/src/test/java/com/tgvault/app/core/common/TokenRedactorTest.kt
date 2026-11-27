package com.tgvault.app.core.common

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TokenRedactorTest {

    @Test
    fun `che token trong URL api telegram`() {
        val url = "https://api.telegram.org/bot123456789:AAEhBOweik6ad9r_QXMENQjcrGbq7C1bxptz8/sendDocument"
        val redacted = TokenRedactor.redact(url)
        assertEquals("https://api.telegram.org/bot***/sendDocument", redacted)
    }

    @Test
    fun `che token trong URL tai file`() {
        val url = "https://api.telegram.org/file/bot123456789:AAEhBOweik6ad9r_QXMENQjcrGbq7C1bxptz8/documents/f.bin"
        val redacted = TokenRedactor.redact(url)
        assertTrue(redacted.contains("bot***"))
        assertFalse(redacted.contains("AAEhBOweik6ad9r_QXMENQjcrGbq7C1bxptz8"))
    }

    @Test
    fun `che token trần không kèm tien to bot`() {
        val text = "HTTP 401 for token 123456789:AAEhBOweik6ad9r_QXMENQjcrGbq7C1bxptz8"
        assertFalse(TokenRedactor.redact(text).contains("123456789:"))
    }

    @Test
    fun `khong dong vao text binh thuong`() {
        val text = "chat_id=-1001234567890, retry after 5, lỗi abc:def"
        assertEquals(text, TokenRedactor.redact(text))
    }
}
