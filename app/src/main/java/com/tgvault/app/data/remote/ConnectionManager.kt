package com.tgvault.app.data.remote

import com.tgvault.app.core.crypto.TokenStore
import com.tgvault.app.data.remote.api.TelegramBotApi
import com.tgvault.app.domain.repository.ConfigRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Quản lý kết nối Telegram (M4): tạo gateway từ token, lưu/khôi phục token an toàn
 * (TokenStore — Tink AEAD), ngắt kết nối. UI (onboarding/settings) chỉ gọi interface này.
 */
interface ConnectionManager {
    /** Gateway tạm cho token đang nhập (onboarding kiểm tra trước khi lưu). */
    fun previewGateway(token: String): TelegramGateway

    /** Lưu token + connection sau khi đã xác minh quyền; gateway chính thức dùng từ đây. */
    suspend fun persistConnection(
        token: String,
        botUsername: String,
        chatId: Long,
    )

    /** Khôi phục gateway từ token đã lưu lúc app start. Trả true nếu có token. */
    suspend fun restore(): Boolean

    suspend fun disconnect()
}

@Singleton
class ConnectionManagerImpl
    @Inject
    constructor(
        private val tokenStore: TokenStore,
        private val gatewayHolder: GatewayHolder,
        private val api: TelegramBotApi,
        private val okHttpClient: OkHttpClient,
        private val json: Json,
        private val rateLimiter: TelegramRateLimiter,
        private val configRepository: ConfigRepository,
    ) : ConnectionManager {
        private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO

        override fun previewGateway(token: String): TelegramGateway = buildGateway(token)

        override suspend fun persistConnection(
            token: String,
            botUsername: String,
            chatId: Long,
        ) = withContext(ioDispatcher) {
            tokenStore.write(token)
            gatewayHolder.set(buildGateway(token))
            configRepository.setConnection(botUsername, chatId)
        }

        override suspend fun restore(): Boolean =
            withContext(ioDispatcher) {
                val token = tokenStore.read() ?: return@withContext false
                gatewayHolder.set(buildGateway(token))
                true
            }

        override suspend fun disconnect() =
            withContext(ioDispatcher) {
                tokenStore.clear()
                gatewayHolder.clear()
                configRepository.clearConnection()
            }

        private fun buildGateway(token: String): TelegramGateway =
            BotApiGateway(
                api = api,
                okHttpClient = okHttpClient,
                json = json,
                tokenProvider = BotTokenProvider { token },
                rateLimiter = rateLimiter,
            )
    }
