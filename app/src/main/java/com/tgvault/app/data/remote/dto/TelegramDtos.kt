package com.tgvault.app.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Envelope chuẩn của Bot API: { ok, result?, error_code?, description?, parameters? } */
@Serializable
data class ApiResponse<T>(
    val ok: Boolean,
    val result: T? = null,
    @SerialName("error_code") val errorCode: Int? = null,
    val description: String? = null,
    val parameters: ResponseParametersDto? = null
)

@Serializable
data class ResponseParametersDto(
    @SerialName("retry_after") val retryAfter: Long? = null
)

@Serializable
data class UserDto(
    val id: Long,
    @SerialName("first_name") val firstName: String,
    val username: String? = null,
    @SerialName("is_bot") val isBot: Boolean = false
)

@Serializable
data class ChatDto(
    val id: Long,
    val type: String? = null,
    val title: String? = null,
    val username: String? = null,
    @SerialName("pinned_message") val pinnedMessage: MessageDto? = null
)

@Serializable
data class MessageDto(
    @SerialName("message_id") val messageId: Long,
    val chat: ChatDto? = null,
    val text: String? = null,
    val caption: String? = null,
    val document: DocumentDto? = null
)

@Serializable
data class DocumentDto(
    @SerialName("file_id") val fileId: String,
    @SerialName("file_unique_id") val fileUniqueId: String? = null,
    @SerialName("file_name") val fileName: String? = null,
    @SerialName("file_size") val fileSize: Long? = null,
    @SerialName("mime_type") val mimeType: String? = null
)

@Serializable
data class FileDto(
    @SerialName("file_id") val fileId: String,
    @SerialName("file_unique_id") val fileUniqueId: String? = null,
    @SerialName("file_size") val fileSize: Long? = null,
    @SerialName("file_path") val filePath: String? = null
)

@Serializable
data class ChatMemberDto(
    val status: String,
    @SerialName("can_post_messages") val canPostMessages: Boolean? = null,
    @SerialName("can_delete_messages") val canDeleteMessages: Boolean? = null,
    @SerialName("can_pin_messages") val canPinMessages: Boolean? = null,
    val user: UserDto? = null
)

@Serializable
data class UpdateDto(
    @SerialName("update_id") val updateId: Long,
    @SerialName("my_chat_member") val myChatMember: ChatMemberUpdatedDto? = null,
    @SerialName("channel_post") val channelPost: MessageDto? = null
)

@Serializable
data class ChatMemberUpdatedDto(
    val chat: ChatDto,
    @SerialName("new_chat_member") val newChatMember: ChatMemberDto? = null
)
