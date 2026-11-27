package com.tgvault.app

import android.app.Application
import android.util.Log
import com.tgvault.app.core.common.TokenRedactor
import com.tgvault.app.data.remote.ConnectionManager
import com.tgvault.app.data.transfer.TransferNotifier
import com.tgvault.app.data.transfer.TransferScheduler
import dagger.hilt.EntryPoint
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.InstallIn
import dagger.hilt.android.HiltAndroidApp
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
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
        // M3-5: phục hồi transfer RUNNING mồ côi + enqueue lại hàng đợi
        appScope.launch {
            // M4-3: khôi phục gateway từ token đã mã hoá (nếu đã onboarding)
            runCatching { entryPoint.connectionManager().restore() }
                .onFailure { Timber.w(it, "restore gateway thất bại") }
            entryPoint.transferScheduler().recoverOrphaned()
        }
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
