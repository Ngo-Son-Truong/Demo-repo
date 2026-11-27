package com.tgvault.app.data.remote

import com.tgvault.app.core.common.AppError
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

/** Ánh xạ lỗi theo bảng SPEC §9.2. */
class TelegramErrorMapperTest {
    private val mapper = TelegramErrorMapper(Json { ignoreUnknownKeys = true })

    private fun httpError(
        code: Int,
        body: String,
    ): HttpException {
        val response = Response.error<Any>(code, body.toResponseBody("application/json".toMediaType()))
        return HttpException(response)
    }

    @Test
    fun `401 thanh InvalidToken`() {
        val e = httpError(401, """{"ok":false,"error_code":401,"description":"Unauthorized"}""")
        assertTrue(mapper.map(e) is AppError.InvalidToken)
    }

    @Test
    fun `403 kicked thanh BotNoAccess`() {
        val e =
            httpError(
                403,
                """{"ok":false,"error_code":403,"description":"Forbidden: bot was kicked from the channel"}""",
            )
        assertTrue(mapper.map(e) is AppError.BotNoAccess)
    }

    @Test
    fun `400 chat not found thanh ChannelNotFound`() {
        val e = httpError(400, """{"ok":false,"error_code":400,"description":"Bad Request: chat not found"}""")
        assertTrue(mapper.map(e) is AppError.ChannelNotFound)
    }

    @Test
    fun `400 file is too big thanh ChunkTooLarge`() {
        val e = httpError(400, """{"ok":false,"error_code":400,"description":"Bad Request: file is too big"}""")
        assertTrue(mapper.map(e) is AppError.ChunkTooLarge)
    }

    @Test
    fun `429 co retry_after thanh RateLimited voi so giay`() {
        val e =
            httpError(
                429,
                """{"ok":false,"error_code":429,"description":"Too Many Requests","parameters":{"retry_after":7}}""",
            )
        val error = mapper.map(e)
        assertTrue(error is AppError.RateLimited)
        assertEquals(7L, (error as AppError.RateLimited).retryAfterSeconds)
    }

    @Test
    fun `429 khong co retry_after dung mac dinh`() {
        val e = httpError(429, """{"ok":false,"error_code":429,"description":"Too Many Requests"}""")
        val error = mapper.map(e)
        assertEquals(TelegramErrorMapper.DEFAULT_RETRY_AFTER_SECONDS, (error as AppError.RateLimited).retryAfterSeconds)
    }

    @Test
    fun `5xx thanh Transient`() {
        val e = httpError(502, """{"ok":false,"error_code":502,"description":"Bad Gateway"}""")
        assertTrue(mapper.map(e) is AppError.Transient)
    }

    @Test
    fun `IOException thanh Transient`() {
        assertTrue(mapper.map(IOException("timeout")) is AppError.Transient)
    }

    @Test
    fun `mo ta loi duoc che token`() {
        val e =
            httpError(
                400,
                """{"ok":false,"error_code":400,"description":"Bad Request: chat not found for bot123456789:AAEhBOweik6ad9r_QXMENQjcrGbq7C1bxptz8"}""",
            )
        val error = mapper.map(e)
        assertTrue(error.message.orEmpty().contains("bot***"))
    }

    @Test
    fun `CancellationException duoc nem lai khong bi anh xa`() {
        var cancelled = false
        try {
            mapper.map(kotlinx.coroutines.CancellationException("cancel"))
        } catch (e: kotlinx.coroutines.CancellationException) {
            cancelled = true
        }
        assertTrue(cancelled)
    }
}
