package com.tgvault.app

import android.app.Application
import android.util.Log
import com.tgvault.app.core.common.TokenRedactor
import com.tgvault.app.data.remote.ConnectionManager
import com.tgvault.app.data.transfer.TransferNotifier
import com.tgvault.app.data.transfer.TrashCleanupScheduler
import com.tgvault.app.data.transfer.TransferScheduler
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.android.HiltAndroidApp
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import timber.log.Timber

@HiltAndroidApp
class TgVaultApp : Application() {
    @EntryPoint
    @InstallIn(SingletonComponent::class)
    interface BootstrapEntryPoint {
        fun transferScheduler(): TransferScheduler

        fun transferNotifier(): TransferNotifier

        fun connectionManager(): ConnectionManager

        fun indexBackupManager(): com.tgvault.app.core.indexbackup.IndexBackupManager

        fun trashCleanupScheduler(): TrashCleanupScheduler

        fun configRepository(): com.tgvault.app.domain.repository.ConfigRepository
    }

    /** Scope sống cùng process — cho notifier và tác vụ nền nhỏ lúc khởi động. */
    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onCreate() {
        super.onCreate()
        // SPEC §16: debug log đầy đủ; release chỉ WARN/ERROR và luôn qua TokenRedactor
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        } else {
            Timber.plant(ReleaseTree())
        }

        val entryPoint = EntryPointAccessors.fromApplication(this, BootstrapEntryPoint::class.java)
        // M3-3: thông báo tiến trình gộp theo dõi hàng đợi
        entryPoint.transferNotifier().start(appScope)
        // M9-3: dọn thùng rác định kỳ (6h)
        entryPoint.trashCleanupScheduler().schedule()
        // M3-5: phục hồi transfer RUNNING mồ côi + enqueue lại hàng đợi
        appScope.launch {
            // M4-3: khôi phục gateway từ token đã mã hoá (nếu đã onboarding)
            runCatching { entryPoint.connectionManager().restore() }
                .onFailure { Timber.w(it, "restore gateway thất bại") }
            entryPoint.transferScheduler().recoverOrphaned()
        }
        // M8-2: auto backup index — debounce 10 phút sau mỗi thay đổi localRevision (FR-IDX-3)
        appScope.launch {
            watchIndexBackup(entryPoint)
        }
    }

    @kotlin.OptIn(kotlinx.coroutines.FlowPreview::class)
    private suspend fun watchIndexBackup(entryPoint: BootstrapEntryPoint) {
        val cfg = entryPoint.configRepository()
        val backup = entryPoint.indexBackupManager()
        var first = true
        cfg.config
            .map { it.onboardingDone to it.localRevision }
            .distinctUntilChanged()
            .debounce { (done, _) -> if (first || !done) 0L else BACKUP_DEBOUNCE_MS }
            .collect { (done, _) ->
                first = false
                if (done) backup.backupNow()
            }
    }

    private companion object {
        /** 10 phút sau thay đổi index cuối cùng (M8-2, PLAN). */
        const val BACKUP_DEBOUNCE_MS = 10 * 60 * 1000L
    }

    private class ReleaseTree : Timber.Tree() {
        override fun log(
            priority: Int,
            tag: String?,
            message: String,
            t: Throwable?,
        ) {
            if (priority < Log.WARN) return
            Log.println(priority, tag ?: "TgVault", TokenRedactor.redact(message))
        }
    }
}
