package com.tgvault.app.core.di

import com.tgvault.app.BuildConfig
import com.tgvault.app.core.common.TimeProvider
import com.tgvault.app.core.common.TokenRedactor
import com.tgvault.app.data.remote.TelegramRateLimiter
import com.tgvault.app.data.remote.api.TelegramBotApi
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import timber.log.Timber
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient {
        // Mọi dòng log HTTP đều qua TokenRedactor (SPEC §14: không log bot token)
        val logging =
            HttpLoggingInterceptor { message ->
                Timber.tag("TelegramApi").d(TokenRedactor.redact(message))
            }
        logging.level =
            if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BASIC
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        return OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            // upload chunk 19 MiB trên mạng chậm + long polling getUpdates(30s) (PLAN M1-1)
            .writeTimeout(300, TimeUnit.SECONDS)
            .readTimeout(300, TimeUnit.SECONDS)
            // callTimeout tắt (0) cho upload — SPEC/PLAN M1-1
            .callTimeout(0, TimeUnit.SECONDS)
            .addInterceptor(logging)
            .build()
    }

    @Provides
    @Singleton
    fun provideTelegramBotApi(
        client: OkHttpClient,
        json: Json,
    ): TelegramBotApi =
        Retrofit.Builder()
            .baseUrl(com.tgvault.app.data.remote.BotApiGateway.API_BASE_URL)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(TelegramBotApi::class.java)

    @Provides
    @Singleton
    fun provideTelegramRateLimiter(timeProvider: TimeProvider): TelegramRateLimiter = TelegramRateLimiter(timeProvider)

    // BotApiGateway được tạo ở M4 khi có BotTokenProvider an toàn (Tink AEAD — FR-SEC-3);
    // engine (M2) nhận TelegramGateway qua constructor nên test không cần DI.
}
