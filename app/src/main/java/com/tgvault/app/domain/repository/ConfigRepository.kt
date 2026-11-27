package com.tgvault.app.domain.repository

import com.tgvault.app.domain.model.DriveConfig
import com.tgvault.app.domain.model.ThemeMode
import kotlinx.coroutines.flow.Flow

/** Cấu hình (SPEC §8 — DataStore). Bot token KHÔNG nằm ở đây (M4 lưu riêng bằng Tink AEAD). */
interface ConfigRepository {
    val config: Flow<DriveConfig>

    suspend fun current(): DriveConfig

    suspend fun setConnection(
        botUsername: String,
        chatId: Long,
    )

    suspend fun clearConnection()

    suspend fun setChunkSizeBytes(value: Int)

    suspend fun setWifiOnly(value: Boolean)

    suspend fun setMaxParallelTransfers(value: Int)

    suspend fun setThemeMode(value: ThemeMode)

    suspend fun setDynamicColor(value: Boolean)

    suspend fun setLanguage(value: String?)

    suspend fun setEncryptionEnabled(value: Boolean)

    suspend fun setAppLock(
        enabled: Boolean,
        timeoutSec: Int,
    )

    /** localRevision tăng ở MỌI thay đổi index (FR-IDX-3/4, SPEC §11). */
    suspend fun incrementLocalRevision(): Long

    suspend fun setLocalRevision(value: Long)

    suspend fun setLastIndexBackupAt(epochMillis: Long)

    suspend fun setDownloadTreeUri(value: String?)

    suspend fun setOnboardingDone(value: Boolean)
}
