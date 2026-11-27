package com.tgvault.app

import android.app.Application
import android.util.Log
import com.tgvault.app.core.common.TokenRedactor
import dagger.hilt.android.HiltAndroidApp
import timber.log.Timber

@HiltAndroidApp
class TgVaultApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // SPEC §16: debug log đầy đủ; release chỉ WARN/ERROR và luôn qua TokenRedactor
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        } else {
            Timber.plant(ReleaseTree())
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
