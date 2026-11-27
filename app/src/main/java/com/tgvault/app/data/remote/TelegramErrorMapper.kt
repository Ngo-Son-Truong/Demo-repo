package com.tgvault.app.data.remote

import com.tgvault.app.core.common.AppError
import com.tgvault.app.core.common.TokenRedactor
import com.tgvault.app.data.remote.dto.ApiResponse
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json
import retrofit2.HttpException

/**
 * Ánh xạ lỗi Telegram/HTTP → AppError (SPEC §9.2).
 * Mọi message đều qua TokenRedactor trước khi ghi vào AppError.
 */
class TelegramErrorMapper(private val json: Json) {

    fun map(t: Throwable): AppError = when (t) {
        is CancellationException -> throw t
        is AppError -> t
        is HttpException -> mapHttp(t)
        is IOException -> AppError.Transient(cause = t)
        else -> AppError.Unknown(detail = TokenRedactor.redact(t.message ?: t.javaClass.simpleName), cause = t)
    }

    fun mapHttp(e: HttpException): AppError {
        val body = e.response()?.errorBody()?.string()
        val apiError = body?.let { runCatching { json.decodeFromString<ApiResponse<Unit>>(it) }.getOrNull() }
        val code = apiError?.errorCode ?: e.code()
        val description = apiError?.description ?: e.message().orEmpty()
        return mapStatus(code, description, apiError?.parameters?.retryAfter)
    }

    /** Ánh xạ theo bảng SPEC §9.2. [description] được redact token ở đây. */
    fun mapStatus(code: Int, description: String, retryAfter: Long? = null): AppError {
        val d = description.lowercase()
        val safeDescription = TokenRedactor.redact(description)
        return when {
            code == 401 -> AppError.InvalidToken(safeDescription)
            code == 429 -> AppError.RateLimited(retryAfter ?: DEFAULT_RETRY_AFTER_SECONDS)
            code == 403 ||
                "kicked" in d ||
                "not enough rights" in d ||
                "have no rights" in d ||
                "member list is inaccessible" in d -> AppError.BotNoAccess(safeDescription)
            code == 400 && "chat not found" in d -> AppError.ChannelNotFound(safeDescription)
            code == 400 && "file is too big" in d -> AppError.ChunkTooLarge(safeDescription)
            code in 500..599 -> AppError.Transient(detail = "HTTP $code: $safeDescription")
            else -> AppError.Unknown(detail = "HTTP $code: $safeDescription")
        }
    }

    companion object {
        const val DEFAULT_RETRY_AFTER_SECONDS = 5L
    }
}
