package com.tgvault.app.feature.lock

import android.content.Context
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Fingerprint
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.tgvault.app.R
import com.tgvault.app.core.designsystem.Spacing
import com.tgvault.app.core.designsystem.components.TgPrimaryButton
import com.tgvault.app.core.security.AppLockManager

/**
 * Màn khoá app (M7-5, FR-SEC-2): nhập PIN hoặc sinh trắc học.
 * Sinh trắc học tự bật khi vào màn (nếu máy hỗ trợ); PIN luôn sẵn sàng làm phương án dự phòng.
 */
@Composable
fun LockScreen(appLockManager: AppLockManager) {
    val context = LocalContext.current
    var pin by remember { mutableStateOf("") }
    var error by remember { mutableStateOf(false) }
    val canBiometric =
        remember {
            BiometricManager
                .from(context)
                .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK) ==
                BiometricManager.BIOMETRIC_SUCCESS
        }

    // Tự bật sinh trắc học khi màn khoá xuất hiện
    LaunchedEffect(canBiometric) {
        if (canBiometric) {
            showBiometricPrompt(context, onSuccess = appLockManager::unlockWithBiometric)
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(Spacing.x6),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            Icons.Rounded.Lock,
            contentDescription = null,
            modifier = Modifier.size(72.dp),
            tint = MaterialTheme.colorScheme.primary,
        )
        Spacer(Modifier.height(Spacing.x4))
        Text(stringResource(R.string.lock_title), style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(Spacing.x6))
        OutlinedTextField(
            value = pin,
            onValueChange = {
                pin = it.filter(Char::isDigit).take(8)
                error = false
            },
            label = { Text(stringResource(R.string.lock_pin_hint)) },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            singleLine = true,
            isError = error,
            supportingText = {
                if (error) Text(stringResource(R.string.lock_wrong_pin))
            },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(Spacing.x4))
        TgPrimaryButton(
            onClick = {
                if (!appLockManager.unlockWithPin(pin.toCharArray())) {
                    error = true
                    pin = ""
                }
            },
            enabled = pin.length >= 4,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.lock_unlock))
        }
        if (canBiometric) {
            Spacer(Modifier.height(Spacing.x3))
            TextButton(
                onClick = { showBiometricPrompt(context, onSuccess = appLockManager::unlockWithBiometric) },
            ) {
                Icon(Icons.Rounded.Fingerprint, contentDescription = null)
                Spacer(Modifier.size(Spacing.x2))
                Text(stringResource(R.string.lock_use_biometric))
            }
        }
    }
}

private fun showBiometricPrompt(
    context: Context,
    onSuccess: () -> Unit,
) {
    val activity = context as? FragmentActivity ?: return
    val prompt =
        BiometricPrompt(
            activity,
            ContextCompat.getMainExecutor(context),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    onSuccess()
                }
            },
        )
    prompt.authenticate(
        BiometricPrompt.PromptInfo
            .Builder()
            .setTitle(context.getString(R.string.lock_biometric_title))
            .setNegativeButtonText(context.getString(R.string.lock_biometric_cancel))
            .build(),
    )
}
