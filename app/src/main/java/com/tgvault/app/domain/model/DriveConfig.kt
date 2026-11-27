package com.tgvault.app.domain.model

/** Cấu hình app — SPEC §8 DataStore (KHÔNG để trong Room). */
data class DriveConfig(
    val botUsername: String?,
    val chatId: Long?,
    val chunkSizeBytes: Int,
    val wifiOnly: Boolean,
    val maxParallelTransfers: Int,
    val themeMode: ThemeMode,
    val dynamicColor: Boolean,
    /** null = theo hệ thống; "vi" | "en" */
    val language: String?,
    val encryptionEnabled: Boolean,
    val appLockEnabled: Boolean,
    val appLockTimeoutSec: Int,
    val localRevision: Long,
    val lastIndexBackupAt: Long?,
    val downloadTreeUri: String?,
    val deviceId: String,
    val onboardingDone: Boolean,
) {
    companion object {
        val DEFAULT =
            DriveConfig(
                botUsername = null,
                chatId = null,
                chunkSizeBytes = ChunkRules.DEFAULT_CHUNK_SIZE,
                wifiOnly = false,
                maxParallelTransfers = 2,
                themeMode = ThemeMode.SYSTEM,
                dynamicColor = true,
                language = null,
                encryptionEnabled = false,
                appLockEnabled = false,
                appLockTimeoutSec = 60,
                localRevision = 0L,
                lastIndexBackupAt = null,
                downloadTreeUri = null,
                deviceId = "",
                onboardingDone = false,
            )
    }
}

enum class ThemeMode { SYSTEM, LIGHT, DARK }
