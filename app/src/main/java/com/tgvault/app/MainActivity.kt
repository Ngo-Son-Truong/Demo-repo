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
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
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
                        // M8-3 (FR-IDX-4): bản sao lưu cloud mới hơn → hỏi khôi phục
                        CloudNewerDialog(rootViewModel)
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

/**
 * M8-3 (FR-IDX-4): cloud có bản sao lưu mới hơn máy → hỏi khôi phục.
 * Snapshot mã hoá → hỏi passphrase ngay trong dialog.
 */
@androidx.compose.runtime.Composable
private fun CloudNewerDialog(rootViewModel: RootViewModel) {
    val cloudRev by rootViewModel.cloudNewerRevision.collectAsStateWithLifecycle()
    val rev = cloudRev ?: return
    var showPass by remember { mutableStateOf(false) }
    var pass by remember { mutableStateOf("") }
    var errorMsg by remember { mutableStateOf<String?>(null) }
    val coroutineScope = rememberCoroutineScope()
    val wrongPassText = androidx.compose.ui.res.stringResource(R.string.restore_wrong_pass)
    val failText = androidx.compose.ui.res.stringResource(R.string.restore_fail)

    AlertDialog(
        onDismissRequest = rootViewModel::dismissCloudNewer,
        title = { Text(androidx.compose.ui.res.stringResource(R.string.conflict_title, rev)) },
        text = {
            Column {
                Text(androidx.compose.ui.res.stringResource(R.string.conflict_body))
                if (showPass) {
                    Spacer(Modifier.height(com.tgvault.app.core.designsystem.Spacing.x2))
                    OutlinedTextField(
                        value = pass,
                        onValueChange = { pass = it },
                        visualTransformation =
                            androidx.compose.ui.text.input.PasswordVisualTransformation(),
                        singleLine = true,
                        label = {
                            Text(androidx.compose.ui.res.stringResource(R.string.onb_enc_passphrase))
                        },
                    )
                }
                errorMsg?.let {
                    Text(
                        it,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    coroutineScope.launch {
                        when (
                            rootViewModel.restoreCloud(if (showPass) pass.toCharArray() else null)
                        ) {
                            is com.tgvault.app.core.indexbackup.IndexBackupManager.RestoreResult.Success ->
                                errorMsg = null
                            is com.tgvault.app.core.indexbackup.IndexBackupManager.RestoreResult.NeedPassphrase ->
                                showPass = true
                            com.tgvault.app.core.indexbackup.IndexBackupManager.RestoreResult.WrongPassphrase ->
                                errorMsg = wrongPassText
                            else -> errorMsg = failText
                        }
                    }
                },
            ) {
                Text(androidx.compose.ui.res.stringResource(R.string.conflict_restore))
            }
        },
        dismissButton = {
            TextButton(onClick = rootViewModel::dismissCloudNewer) {
                Text(androidx.compose.ui.res.stringResource(R.string.conflict_keep_local))
            }
        },
    )
}
