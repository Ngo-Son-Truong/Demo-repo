package com.tgvault.app.data.local.datastore

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.tgvault.app.domain.model.ChunkRules
import com.tgvault.app.domain.model.DriveConfig
import com.tgvault.app.domain.model.ThemeMode
import com.tgvault.app.domain.repository.ConfigRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onStart

private val Context.configDataStore by preferencesDataStore(name = "tgvault_config")

/** Cấu hình qua DataStore (SPEC §8, PLAN M2-2). */
@Singleton
class ConfigRepositoryImpl @Inject constructor(
    @ApplicationContext private val context: Context
) : ConfigRepository {

    private object Keys {
        val BOT_USERNAME = stringPreferencesKey("botUsername")
        val CHAT_ID = longPreferencesKey("chatId")
        val CHUNK_SIZE_BYTES = intPreferencesKey("chunkSizeBytes")
        val WIFI_ONLY = booleanPreferencesKey("wifiOnly")
        val MAX_PARALLEL_TRANSFERS = intPreferencesKey("maxParallelTransfers")
        val THEME_MODE = stringPreferencesKey("themeMode")
        val DYNAMIC_COLOR = booleanPreferencesKey("dynamicColor")
        val LANGUAGE = stringPreferencesKey("language")
        val ENCRYPTION_ENABLED = booleanPreferencesKey("encryptionEnabled")
        val APP_LOCK_ENABLED = booleanPreferencesKey("appLockEnabled")
        val APP_LOCK_TIMEOUT_SEC = intPreferencesKey("appLockTimeoutSec")
        val LOCAL_REVISION = longPreferencesKey("localRevision")
        val LAST_INDEX_BACKUP_AT = longPreferencesKey("lastIndexBackupAt")
        val DOWNLOAD_TREE_URI = stringPreferencesKey("downloadTreeUri")
        val DEVICE_ID = stringPreferencesKey("deviceId")
        val ONBOARDING_DONE = booleanPreferencesKey("onboardingDone")
    }

    override val config: Flow<DriveConfig> = context.configDataStore.data
        .onStart { ensureDeviceId() }
        .map { it.toConfig() }

    override suspend fun current(): DriveConfig = config.first()

    override suspend fun setConnection(botUsername: String, chatId: Long) {
        context.configDataStore.edit {
            it[Keys.BOT_USERNAME] = botUsername
            it[Keys.CHAT_ID] = chatId
        }
    }

    /** FR-SET-1: ngắt kết nối — xoá thông tin kết nối + revision; giữ deviceId và tuỳ chọn app. */
    override suspend fun clearConnection() {
        context.configDataStore.edit {
            it.remove(Keys.BOT_USERNAME)
            it.remove(Keys.CHAT_ID)
            it.remove(Keys.LOCAL_REVISION)
            it.remove(Keys.LAST_INDEX_BACKUP_AT)
            it[Keys.ONBOARDING_DONE] = false
        }
    }

    override suspend fun setChunkSizeBytes(value: Int) {
        // SPEC §10.1: không vượt 19 MiB với Bot API công cộng
        val safe = value.coerceIn(MIN_CHUNK_SIZE, ChunkRules.MAX_CHUNK_SIZE)
        context.configDataStore.edit { it[Keys.CHUNK_SIZE_BYTES] = safe }
    }

    override suspend fun setWifiOnly(value: Boolean) {
        context.configDataStore.edit { it[Keys.WIFI_ONLY] = value }
    }

    override suspend fun setMaxParallelTransfers(value: Int) {
        context.configDataStore.edit { it[Keys.MAX_PARALLEL_TRANSFERS] = value.coerceIn(1, 4) }
    }

    override suspend fun setThemeMode(value: ThemeMode) {
        context.configDataStore.edit { it[Keys.THEME_MODE] = value.name }
    }

    override suspend fun setDynamicColor(value: Boolean) {
        context.configDataStore.edit { it[Keys.DYNAMIC_COLOR] = value }
    }

    override suspend fun setLanguage(value: String?) {
        context.configDataStore.edit {
            if (value == null) it.remove(Keys.LANGUAGE) else it[Keys.LANGUAGE] = value
        }
    }

    override suspend fun setEncryptionEnabled(value: Boolean) {
        context.configDataStore.edit { it[Keys.ENCRYPTION_ENABLED] = value }
    }

    override suspend fun setAppLock(enabled: Boolean, timeoutSec: Int) {
        context.configDataStore.edit {
            it[Keys.APP_LOCK_ENABLED] = enabled
            it[Keys.APP_LOCK_TIMEOUT_SEC] = timeoutSec.coerceIn(5, 600)
        }
    }

    override suspend fun incrementLocalRevision(): Long {
        var newValue = 0L
        context.configDataStore.edit {
            newValue = (it[Keys.LOCAL_REVISION] ?: 0L) + 1
            it[Keys.LOCAL_REVISION] = newValue
        }
        return newValue
    }

    override suspend fun setLocalRevision(value: Long) {
        context.configDataStore.edit { it[Keys.LOCAL_REVISION] = value }
    }

    override suspend fun setLastIndexBackupAt(epochMillis: Long) {
        context.configDataStore.edit { it[Keys.LAST_INDEX_BACKUP_AT] = epochMillis }
    }

    override suspend fun setDownloadTreeUri(value: String?) {
        context.configDataStore.edit {
            if (value == null) it.remove(Keys.DOWNLOAD_TREE_URI) else it[Keys.DOWNLOAD_TREE_URI] = value
        }
    }

    override suspend fun setOnboardingDone(value: Boolean) {
        context.configDataStore.edit { it[Keys.ONBOARDING_DONE] = value }
    }

    private suspend fun ensureDeviceId() {
        val prefs = context.configDataStore.data.first()
        if (prefs[Keys.DEVICE_ID].isNullOrBlank()) {
            context.configDataStore.edit { it[Keys.DEVICE_ID] = UUID.randomUUID().toString() }
        }
    }

    private fun Preferences.toConfig(): DriveConfig = DriveConfig(
        botUsername = this[Keys.BOT_USERNAME],
        chatId = this[Keys.CHAT_ID],
        chunkSizeBytes = this[Keys.CHUNK_SIZE_BYTES] ?: ChunkRules.DEFAULT_CHUNK_SIZE,
        wifiOnly = this[Keys.WIFI_ONLY] ?: false,
        maxParallelTransfers = this[Keys.MAX_PARALLEL_TRANSFERS] ?: 2,
        themeMode = this[Keys.THEME_MODE]?.let { name ->
            runCatching { ThemeMode.valueOf(name) }.getOrNull()
        } ?: ThemeMode.SYSTEM,
        dynamicColor = this[Keys.DYNAMIC_COLOR] ?: true,
        language = this[Keys.LANGUAGE],
        encryptionEnabled = this[Keys.ENCRYPTION_ENABLED] ?: false,
        appLockEnabled = this[Keys.APP_LOCK_ENABLED] ?: false,
        appLockTimeoutSec = this[Keys.APP_LOCK_TIMEOUT_SEC] ?: 60,
        localRevision = this[Keys.LOCAL_REVISION] ?: 0L,
        lastIndexBackupAt = this[Keys.LAST_INDEX_BACKUP_AT],
        downloadTreeUri = this[Keys.DOWNLOAD_TREE_URI],
        deviceId = this[Keys.DEVICE_ID].orEmpty(),
        onboardingDone = this[Keys.ONBOARDING_DONE] ?: false
    )

    private companion object {
        const val MIN_CHUNK_SIZE = 64 * 1024
    }
}
