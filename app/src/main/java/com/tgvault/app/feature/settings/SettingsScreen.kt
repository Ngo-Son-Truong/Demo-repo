package com.tgvault.app.feature.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tgvault.app.R
import com.tgvault.app.core.crypto.CryptoScheme
import com.tgvault.app.core.designsystem.Spacing
import com.tgvault.app.core.designsystem.components.TgPrimaryButton

/**
 * Cài đặt — M7-4: phần Bảo mật (mã hoá đầu-cuối, FR-SEC-1).
 * Các phần khác (chunk, mạng, giao diện, khoá app…) nối dần theo PLAN (M7-5, M9, M10).
 */
@Composable
private fun timeoutLabel(sec: Int): String =
    when (sec) {
        in 0..29 -> stringResource(R.string.set_applock_timeout_immediately)
        in 30..179 -> stringResource(R.string.set_applock_timeout_1m)
        in 180..419 -> stringResource(R.string.set_applock_timeout_5m)
        else -> stringResource(R.string.set_applock_timeout_10m)
    }

@Composable
fun SettingsScreen(viewModel: SettingsViewModel = hiltViewModel()) {
    val config by viewModel.config.collectAsStateWithLifecycle()
    val cryptoConfigured by viewModel.cryptoConfigured.collectAsStateWithLifecycle()
    val encryptionError by viewModel.encryptionError.collectAsStateWithLifecycle()

    var showPassphraseDialog by remember { mutableStateOf(false) }
    var showDisableDialog by remember { mutableStateOf(false) }
    var showSetPinDialog by remember { mutableStateOf(false) }
    var showChangePinDialog by remember { mutableStateOf(false) }
    var showTimeoutDialog by remember { mutableStateOf(false) }
    var showDisableLockDialog by remember { mutableStateOf(false) }

    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(Spacing.x6),
    ) {
        Text(
            stringResource(R.string.set_security),
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.primary,
        )
        Spacer(Modifier.height(Spacing.x2))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(stringResource(R.string.set_encryption), style = MaterialTheme.typography.bodyLarge)
                Text(
                    stringResource(R.string.set_encryption_sub),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Switch(
                checked = config?.encryptionEnabled == true,
                onCheckedChange = { wantOn ->
                    if (wantOn) {
                        if (cryptoConfigured) {
                            viewModel.enableEncryptionExisting()
                        } else {
                            showPassphraseDialog = true
                        }
                    } else {
                        showDisableDialog = true
                    }
                },
            )
        }
        Spacer(Modifier.height(Spacing.x4))
        HorizontalDivider()

        // --- Khoá app (M7-5, FR-SEC-2) ---
        Spacer(Modifier.height(Spacing.x4))
        val hasPin by viewModel.hasPin.collectAsStateWithLifecycle()
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(stringResource(R.string.set_applock), style = MaterialTheme.typography.bodyLarge)
                Text(
                    stringResource(R.string.set_applock_sub),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Switch(
                checked = config?.appLockEnabled == true,
                onCheckedChange = { wantOn ->
                    if (wantOn) {
                        showSetPinDialog = true
                    } else {
                        showDisableLockDialog = true
                    }
                },
            )
        }
        if (config?.appLockEnabled == true) {
            Spacer(Modifier.height(Spacing.x2))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    stringResource(R.string.set_applock_timeout),
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = { showTimeoutDialog = true }) {
                    Text(timeoutLabel(config?.appLockTimeoutSec ?: 60))
                }
            }
            TextButton(onClick = { showChangePinDialog = true }) {
                Text(stringResource(R.string.set_applock_change_pin))
            }
        }
    }

    if (showSetPinDialog) {
        PinSetDialog(
            title = stringResource(R.string.set_applock_pin_title),
            onConfirm = {
                viewModel.enableAppLock(it)
                showSetPinDialog = false
            },
            onDismiss = { showSetPinDialog = false },
        )
    }

    if (showChangePinDialog) {
        PinChangeDialog(
            wrongOld = viewModel.wrongOldPin.collectAsStateWithLifecycle().value,
            onConfirm = { old, new ->
                viewModel.changePin(old, new)
                showChangePinDialog = false
            },
            onDismiss = { showChangePinDialog = false },
        )
    }

    if (showTimeoutDialog) {
        val options =
            listOf(
                5 to stringResource(R.string.set_applock_timeout_immediately),
                60 to stringResource(R.string.set_applock_timeout_1m),
                300 to stringResource(R.string.set_applock_timeout_5m),
                600 to stringResource(R.string.set_applock_timeout_10m),
            )
        AlertDialog(
            onDismissRequest = { showTimeoutDialog = false },
            title = { Text(stringResource(R.string.set_applock_timeout)) },
            text = {
                Column {
                    options.forEach { (sec, label) ->
                        TextButton(
                            onClick = {
                                viewModel.setLockTimeout(sec)
                                showTimeoutDialog = false
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(label)
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showTimeoutDialog = false }) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }

    if (showDisableLockDialog) {
        AlertDialog(
            onDismissRequest = { showDisableLockDialog = false },
            title = { Text(stringResource(R.string.set_applock_disable_title)) },
            text = { Text(stringResource(R.string.set_applock_disable_body)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.disableAppLock()
                        showDisableLockDialog = false
                    },
                ) {
                    Text(stringResource(R.string.action_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = { showDisableLockDialog = false }) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }
}

    if (showPassphraseDialog) {
        PassphraseDialog(
            errorShown = encryptionError,
            onConfirm = {
                viewModel.enableEncryptionWithPassphrase(it)
                showPassphraseDialog = false
            },
            onDismiss = { showPassphraseDialog = false },
        )
    }

    if (showDisableDialog) {
        AlertDialog(
            onDismissRequest = { showDisableDialog = false },
            title = { Text(stringResource(R.string.set_encryption_disable_title)) },
            text = { Text(stringResource(R.string.set_encryption_disable_body)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.disableEncryption()
                        showDisableDialog = false
                    },
                ) {
                    Text(stringResource(R.string.action_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = { showDisableDialog = false }) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }
}

/** Dialog đặt PIN lần đầu (4–8 chữ số, nhập lại khớp). */
@Composable
private fun PinSetDialog(
    title: String,
    onConfirm: (CharArray) -> Unit,
    onDismiss: () -> Unit,
) {
    var pin by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    val mismatch = confirm.isNotEmpty() && confirm != pin
    val canConfirm = pin.length in 4..8 && pin == confirm

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                PinField(pin, { pin = it }, stringResource(R.string.lock_pin_hint))
                Spacer(Modifier.height(Spacing.x2))
                PinField(confirm, { confirm = it }, stringResource(R.string.set_applock_pin_confirm), isError = mismatch)
                if (mismatch) {
                    Text(
                        stringResource(R.string.set_applock_pin_mismatch),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        },
        confirmButton = {
            TgPrimaryButton(onClick = { onConfirm(pin.toCharArray()) }, enabled = canConfirm) {
                Text(stringResource(R.string.action_confirm))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) }
        },
    )
}

/** Dialog đổi PIN: PIN hiện tại + PIN mới (nhập lại). */
@Composable
private fun PinChangeDialog(
    wrongOld: Boolean,
    onConfirm: (old: CharArray, new: CharArray) -> Unit,
    onDismiss: () -> Unit,
) {
    var oldPin by remember { mutableStateOf("") }
    var newPin by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    val mismatch = confirm.isNotEmpty() && confirm != newPin
    val canConfirm = oldPin.isNotEmpty() && newPin.length in 4..8 && newPin == confirm

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.set_applock_change_pin)) },
        text = {
            Column {
                PinField(oldPin, { oldPin = it }, stringResource(R.string.set_applock_old_pin), isError = wrongOld)
                if (wrongOld) {
                    Text(
                        stringResource(R.string.set_applock_wrong_old),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                Spacer(Modifier.height(Spacing.x2))
                PinField(newPin, { newPin = it }, stringResource(R.string.set_applock_pin_title))
                Spacer(Modifier.height(Spacing.x2))
                PinField(confirm, { confirm = it }, stringResource(R.string.set_applock_pin_confirm), isError = mismatch)
                if (mismatch) {
                    Text(
                        stringResource(R.string.set_applock_pin_mismatch),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        },
        confirmButton = {
            TgPrimaryButton(onClick = { onConfirm(oldPin.toCharArray(), newPin.toCharArray()) }, enabled = canConfirm) {
                Text(stringResource(R.string.action_confirm))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) }
        },
    )
}

@Composable
private fun PinField(
    value: String,
    onChange: (String) -> Unit,
    label: String,
    isError: Boolean = false,
) {
    OutlinedTextField(
        value = value,
        onValueChange = { onChange(it.filter(Char::isDigit).take(8)) },
        label = { Text(label) },
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        singleLine = true,
        isError = isError,
        modifier = Modifier.fillMaxWidth(),
    )
}

/** Dialog đặt passphrase lần đầu (SPEC §12: cảnh báo + nhập lại + tick xác nhận). */
@Composable
private fun PassphraseDialog(
    errorShown: Boolean,
    onConfirm: (CharArray) -> Unit,
    onDismiss: () -> Unit,
) {
    var passphrase by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var acknowledged by remember { mutableStateOf(false) }
    val mismatch = confirm.isNotEmpty() && confirm != passphrase
    val canConfirm =
        passphrase.length >= CryptoScheme.MIN_PASSPHRASE_CHARS && passphrase == confirm && acknowledged

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.onb_enc_title)) },
        text = {
            Column {
                Text(
                    stringResource(R.string.onb_enc_warning),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                )
                Spacer(Modifier.height(Spacing.x3))
                OutlinedTextField(
                    value = passphrase,
                    onValueChange = { passphrase = it },
                    label = { Text(stringResource(R.string.onb_enc_passphrase)) },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(Spacing.x2))
                OutlinedTextField(
                    value = confirm,
                    onValueChange = { confirm = it },
                    label = { Text(stringResource(R.string.onb_enc_passphrase_confirm)) },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    isError = mismatch,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (mismatch) {
                    Text(
                        stringResource(R.string.onb_enc_mismatch),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                if (errorShown) {
                    Text(
                        stringResource(R.string.set_encryption_wrong_pass),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    androidx.compose.material3.Checkbox(
                        checked = acknowledged,
                        onCheckedChange = { acknowledged = it },
                    )
                    Text(
                        stringResource(R.string.onb_enc_ack),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        },
        confirmButton = {
            TgPrimaryButton(onClick = { onConfirm(passphrase.toCharArray()) }, enabled = canConfirm) {
                Text(stringResource(R.string.action_confirm))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) }
        },
    )
}
