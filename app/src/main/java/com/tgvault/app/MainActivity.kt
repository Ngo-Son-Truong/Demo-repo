package com.tgvault.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import com.tgvault.app.core.designsystem.TgVaultTheme
import com.tgvault.app.core.security.AppLockManager
import com.tgvault.app.feature.lock.LockScreen
import com.tgvault.app.feature.onboarding.OnboardingScreen
import com.tgvault.app.navigation.TgVaultNavHost
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : FragmentActivity() {
    private val rootViewModel: RootViewModel by viewModels()

    // M7-5: khoá app — FragmentActivity để BiometricPrompt hoạt động (FR-SEC-2)
    @Inject
    lateinit var appLockManager: AppLockManager

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // M7-5: khoá khi process mở lại + theo timeout nền (FR-SEC-2)
        lifecycleScope.launch { appLockManager.lockOnStartIfEnabled() }
        ProcessLifecycleOwner.get().lifecycle.addObserver(
            object : DefaultLifecycleObserver {
                override fun onStart(owner: LifecycleOwner) {
                    lifecycleScope.launch { appLockManager.onForeground() }
                }

                override fun onStop(owner: LifecycleOwner) {
                    appLockManager.onBackground()
                }
            },
        )

        setContent {
            TgVaultTheme {
                val onboardingDone by rootViewModel.onboardingDone.collectAsStateWithLifecycle()
                val appLockEnabled by rootViewModel.appLockEnabled.collectAsStateWithLifecycle()
                val locked by appLockManager.locked.collectAsStateWithLifecycle()

                // FR-SEC-4: chặn screenshot/recents khi bật khoá app
                LaunchedEffect(appLockEnabled) {
                    if (appLockEnabled) {
                        window.setFlags(
                            android.view.WindowManager.LayoutParams.FLAG_SECURE,
                            android.view.WindowManager.LayoutParams.FLAG_SECURE,
                        )
                    } else {
                        window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
                    }
                }

                when {
                    locked -> LockScreen(appLockManager)
                    onboardingDone == null ->
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator()
                        }
                    onboardingDone == false -> OnboardingScreen()
                    else -> {
                        NotificationPermissionEffect()
                        TgVaultNavHost()
                    }
                }
            }
        }
    }
}

/**
 * Xin quyền POST_NOTIFICATIONS lần đầu sau onboarding (M6-5, FR-TR-3):
 * notification tiến trình là cách chính người dùng theo dõi truyền tải.
 */
@androidx.compose.runtime.Composable
private fun NotificationPermissionEffect() {
    if (Build.VERSION.SDK_INT < 33) return
    val context = LocalContext.current
    val launcher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(Unit) {
        val granted =
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
        if (!granted) launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
}
