package com.tgvault.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tgvault.app.core.designsystem.TgVaultTheme
import com.tgvault.app.feature.onboarding.OnboardingScreen
import com.tgvault.app.navigation.TgVaultNavHost
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    private val rootViewModel: RootViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            TgVaultTheme {
                val onboardingDone by rootViewModel.onboardingDone.collectAsStateWithLifecycle()
                when (onboardingDone) {
                    null ->
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator()
                        }
                    false -> OnboardingScreen()
                    true -> {
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
