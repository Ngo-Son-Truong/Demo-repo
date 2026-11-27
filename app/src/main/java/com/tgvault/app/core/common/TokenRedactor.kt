package com.tgvault.app.core.common

/**
 * Che bot token khỏi log/exception (SPEC §14: không log token).
 * Token bot Telegram có dạng `<digits>:<secret>` (ví dụ `123456789:AAE...`).
 * Dùng trong HttpLoggingInterceptor.Logger và mọi chỗ log Throwable/HTTP.
 */
object TokenRedactor {
    private val TOKEN_PATTERN = Regex("""(?:bot)?\d{6,}:[A-Za-z0-9_-]{20,}""")

    const val PLACEHOLDER = "bot***"

    fun redact(text: String): String = TOKEN_PATTERN.replace(text, PLACEHOLDER)

    /** Dùng khi log Throwable: message của exception có thể chứa URL kèm token. */
    fun redact(throwable: Throwable?): String =
        redact(throwable?.message ?: throwable?.javaClass?.simpleName ?: "unknown")
}
