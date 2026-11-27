package com.tgvault.app.data.remote.api

import com.tgvault.app.data.remote.dto.ApiResponse
import com.tgvault.app.data.remote.dto.ChatDto
import com.tgvault.app.data.remote.dto.ChatMemberDto
import com.tgvault.app.data.remote.dto.FileDto
import com.tgvault.app.data.remote.dto.MessageDto
import com.tgvault.app.data.remote.dto.UpdateDto
import com.tgvault.app.data.remote.dto.UserDto
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Endpoint Bot API dùng trong app (SPEC §9.1).
 * Token đi trong path ("bot{token}/...") — mọi log đều qua TokenRedactor (SPEC §14).
 */
interface TelegramBotApi {
    @GET("bot{token}/getMe")
    suspend fun getMe(
        @Path("token") token: String,
    ): ApiResponse<UserDto>

    @POST("bot{token}/deleteWebhook")
    suspend fun deleteWebhook(
        @Path("token") token: String,
    ): ApiResponse<Boolean>

    @GET("bot{token}/getUpdates")
    suspend fun getUpdates(
        @Path("token") token: String,
        @Query("offset") offset: Long?,
        @Query("timeout") timeoutSeconds: Int,
        @Query("allowed_updates") allowedUpdates: String,
    ): ApiResponse<List<UpdateDto>>

    @GET("bot{token}/getChat")
    suspend fun getChat(
        @Path("token") token: String,
        @Query("chat_id") chatId: Long,
    ): ApiResponse<ChatDto>

    @GET("bot{token}/getChatMember")
    suspend fun getChatMember(
        @Path("token") token: String,
        @Query("chat_id") chatId: Long,
        @Query("user_id") userId: Long,
    ): ApiResponse<ChatMemberDto>

    @Multipart
    @POST("bot{token}/sendDocument")
    suspend fun sendDocument(
        @Path("token") token: String,
        @Part("chat_id") chatId: RequestBody,
        @Part document: MultipartBody.Part,
        @Part("caption") caption: RequestBody?,
        @Part("disable_notification") disableNotification: RequestBody,
    ): ApiResponse<MessageDto>

    @POST("bot{token}/sendMessage")
    suspend fun sendMessage(
        @Path("token") token: String,
        @Query("chat_id") chatId: Long,
        @Query("text") text: String,
    ): ApiResponse<MessageDto>

    @POST("bot{token}/pinChatMessage")
    suspend fun pinChatMessage(
        @Path("token") token: String,
        @Query("chat_id") chatId: Long,
        @Query("message_id") messageId: Long,
        @Query("disable_notification") disableNotification: Boolean = true,
    ): ApiResponse<Boolean>

    @POST("bot{token}/unpinChatMessage")
    suspend fun unpinChatMessage(
        @Path("token") token: String,
        @Query("chat_id") chatId: Long,
        @Query("message_id") messageId: Long,
    ): ApiResponse<Boolean>

    @GET("bot{token}/getFile")
    suspend fun getFile(
        @Path("token") token: String,
        @Query("file_id") fileId: String,
    ): ApiResponse<FileDto>

    @POST("bot{token}/deleteMessage")
    suspend fun deleteMessage(
        @Path("token") token: String,
        @Query("chat_id") chatId: Long,
        @Query("message_id") messageId: Long,
    ): ApiResponse<Boolean>
}
