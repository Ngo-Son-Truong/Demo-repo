package com.tgvault.app.feature.onboarding

import android.content.Intent
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.CloudUpload
import androidx.compose.material.icons.rounded.ContentPaste
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.SmartToy
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tgvault.app.R
import com.tgvault.app.core.designsystem.MotionConfig
import com.tgvault.app.core.designsystem.Spacing
import com.tgvault.app.core.designsystem.components.TgCard
import com.tgvault.app.core.designsystem.components.TgPrimaryButton
import com.tgvault.app.core.designsystem.components.TgSecondaryButton
import com.tgvault.app.core.designsystem.components.TgTextField

/**
 * Onboarding theo SPEC §15.3 màn 2: Welcome → CreateBot → EnterToken →
 * ConnectChannel → VerifyRights → Done (mã hoá nối ở M7 — FR-ONB-4).
 * Chuyển bước: slide + fade theo MotionConfig.DURATION_NAV (§15.4).
 */
@Composable
fun OnboardingScreen(viewModel: OnboardingViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Column(modifier = Modifier.fillMaxSize().padding(Spacing.x6)) {
        // Thanh tiến trình bước (§15.3 màn 2)
        LinearProgressIndicator(
            progress = { state.step.ordinal / (OnboardingStep.entries.size - 1).toFloat() },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(Spacing.x4))

        AnimatedContent(
            targetState = state.step,
            transitionSpec = {
                val forward = targetState.ordinal > initialState.ordinal
                (
                    slideInHorizontally(
                        animationSpec = tween(MotionConfig.DURATION_NAV),
                        initialOffsetX = { if (forward) it / 3 else -it / 3 },
                    ) + fadeIn(tween(MotionConfig.DURATION_NAV))
                ).togetherWith(
                    slideOutHorizontally(
                        animationSpec = tween(MotionConfig.DURATION_NAV),
                        targetOffsetX = { if (forward) -it / 3 else it / 3 },
                    ) + fadeOut(tween(MotionConfig.DURATION_NAV)),
                )
            },
            label = "onboardingStep",
            modifier = Modifier.weight(1f),
        ) { step ->
            when (step) {
                OnboardingStep.WELCOME -> WelcomeStep(viewModel::next)
                OnboardingStep.CREATE_BOT -> CreateBotStep(viewModel::next, viewModel::back)
                OnboardingStep.ENTER_TOKEN -> EnterTokenStep(state, viewModel)
                OnboardingStep.CONNECT_CHANNEL -> ConnectChannelStep(state, viewModel)
                OnboardingStep.VERIFY_RIGHTS -> VerifyRightsStep(state, viewModel)
                OnboardingStep.ENCRYPTION -> EncryptionStep(viewModel)
                OnboardingStep.DONE -> DoneStep()
            }
        }
    }
}

@Composable
private fun StepScaffold(
    title: String,
    modifier: Modifier = Modifier,
    onBack: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (onBack != null) {
                TextButton(onClick = onBack) { Text(stringResource(R.string.action_back)) }
            }
            Text(title, style = MaterialTheme.typography.headlineSmall)
        }
        Spacer(Modifier.height(Spacing.x4))
        content()
    }
}

@Composable
private fun WelcomeStep(onStart: () -> Unit) {
    StepScaffold(title = stringResource(R.string.app_name)) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.x8),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                Icons.Rounded.CloudUpload,
                contentDescription = null,
                modifier = Modifier.size(96.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.height(Spacing.x6))
            Text(
                stringResource(R.string.onb_welcome_message),
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(Spacing.x2))
            Text(
                stringResource(R.string.onb_welcome_privacy),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(Spacing.x8))
            TgPrimaryButton(onClick = onStart, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.onb_start))
            }
        }
    }
}

@Composable
private fun CreateBotStep(
    onNext: () -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    StepScaffold(title = stringResource(R.string.onb_create_bot_title), onBack = onBack) {
        Text(stringResource(R.string.onb_create_bot_intro), style = MaterialTheme.typography.bodyLarge)
        Spacer(Modifier.height(Spacing.x4))
        TgCard(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(Spacing.x4)) {
                Text("1. " + stringResource(R.string.onb_create_bot_step1))
                Spacer(Modifier.height(Spacing.x2))
                Text("2. " + stringResource(R.string.onb_create_bot_step2))
                Spacer(Modifier.height(Spacing.x2))
                Text("3. " + stringResource(R.string.onb_create_bot_step3))
            }
        }
        Spacer(Modifier.height(Spacing.x6))
        TgSecondaryButton(
            onClick = {
                context.startActivity(Intent(Intent.ACTION_VIEW, "https://t.me/BotFather".toUri()))
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Icon(Icons.Rounded.SmartToy, contentDescription = null)
            Spacer(Modifier.size(Spacing.x2))
            Text(stringResource(R.string.onb_open_botfather))
        }
        Spacer(Modifier.height(Spacing.x3))
        TgPrimaryButton(onClick = onNext, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.onb_have_token))
        }
    }
}

@Composable
private fun EnterTokenStep(
    state: OnboardingUiState,
    viewModel: OnboardingViewModel,
) {
    val clipboard = LocalClipboardManager.current
    StepScaffold(
        title = stringResource(R.string.onb_enter_token_title),
        onBack = { viewModel.back() },
    ) {
        Text(stringResource(R.string.onb_enter_token_hint), style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(Spacing.x3))
        TgTextField(
            value = state.tokenInput,
            onValueChange = viewModel::onTokenChange,
            label = stringResource(R.string.onb_token_label),
            isError = state.error == OnboardingError.INVALID_TOKEN,
            supportingText =
                when (state.error) {
                    OnboardingError.INVALID_TOKEN -> stringResource(R.string.onb_error_invalid_token)
                    OnboardingError.NETWORK -> stringResource(R.string.onb_error_network)
                    OnboardingError.UNKNOWN -> stringResource(R.string.onb_error_unknown)
                    else -> null
                },
        )
        Spacer(Modifier.height(Spacing.x3))
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.x2)) {
            TgSecondaryButton(
                onClick = { clipboard.getText()?.text?.let(viewModel::onTokenChange) },
            ) {
                Icon(Icons.Rounded.ContentPaste, contentDescription = null)
                Spacer(Modifier.size(Spacing.x1))
                Text(stringResource(R.string.onb_paste))
            }
            TgPrimaryButton(
                onClick = viewModel::verifyToken,
                enabled = state.tokenInput.isNotBlank() && !state.checkingToken,
            ) {
                if (state.checkingToken) {
                    CircularProgressIndicator(modifier = Modifier.size(Spacing.x4))
                } else {
                    Text(stringResource(R.string.onb_check_token))
                }
            }
        }
        AnimatedVisibility(visible = state.botUsername != null) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(top = Spacing.x3),
            ) {
                Icon(
                    Icons.Rounded.CheckCircle,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                )
                Spacer(Modifier.size(Spacing.x2))
                Text(stringResource(R.string.onb_token_ok, state.botUsername.orEmpty()))
            }
        }
    }
}

@Composable
private fun ConnectChannelStep(
    state: OnboardingUiState,
    viewModel: OnboardingViewModel,
) {
    StepScaffold(
        title = stringResource(R.string.onb_channel_title),
        onBack = { viewModel.back() },
    ) {
        Text(stringResource(R.string.onb_channel_intro), style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(Spacing.x6))
        if (state.waitingForChannel) {
            // Chỉ báo "nhịp thở" (§15.3 màn 2.4)
            val infinite = rememberInfiniteTransition(label = "breathing")
            val alpha by infinite.animateFloat(
                initialValue = 0.35f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(tween(900), RepeatMode.Reverse),
                label = "breathingAlpha",
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(modifier = Modifier.size(Spacing.x6).alpha(alpha))
                Spacer(Modifier.size(Spacing.x3))
                Text(stringResource(R.string.onb_channel_waiting))
            }
        }
        Spacer(Modifier.height(Spacing.x8))
        Text(
            stringResource(R.string.onb_channel_manual_hint),
            style = MaterialTheme.typography.labelLarge,
        )
        Spacer(Modifier.height(Spacing.x2))
        TgTextField(
            value = state.manualChannelInput,
            onValueChange = viewModel::onManualChannelChange,
            label = stringResource(R.string.onb_channel_manual_label),
            isError = state.error == OnboardingError.CHANNEL_NOT_FOUND,
            supportingText =
                when (state.error) {
                    OnboardingError.CHANNEL_NOT_FOUND -> stringResource(R.string.onb_error_channel)
                    OnboardingError.NETWORK -> stringResource(R.string.onb_error_network)
                    else -> null
                },
        )
        Spacer(Modifier.height(Spacing.x2))
        TgSecondaryButton(
            onClick = viewModel::submitManualChannel,
            enabled = state.manualChannelInput.isNotBlank() && !state.checkingRights,
        ) {
            Text(stringResource(R.string.onb_channel_manual_submit))
        }
    }
}

@Composable
private fun VerifyRightsStep(
    state: OnboardingUiState,
    viewModel: OnboardingViewModel,
) {
    StepScaffold(title = stringResource(R.string.onb_rights_title)) {
        state.detectedChannelTitle?.let {
            Text(
                stringResource(R.string.onb_rights_channel, it),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(Spacing.x3))
        }
        if (state.checkingRights) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(modifier = Modifier.size(Spacing.x6))
                Spacer(Modifier.size(Spacing.x3))
                Text(stringResource(R.string.onb_rights_checking))
            }
        }
        state.rights?.let { rights ->
            RightItem(stringResource(R.string.onb_right_post), rights.canPost)
            RightItem(stringResource(R.string.onb_right_delete), rights.canDelete)
            RightItem(stringResource(R.string.onb_right_pin), rights.canPin)
            if (!rights.hasAll) {
                Spacer(Modifier.height(Spacing.x3))
                Text(
                    stringResource(R.string.onb_rights_fix_hint),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                )
                Spacer(Modifier.height(Spacing.x3))
                TgPrimaryButton(onClick = viewModel::recheckRights) {
                    Text(stringResource(R.string.onb_rights_recheck))
                }
            }
        }
        if (state.error == OnboardingError.NETWORK) {
            Text(
                stringResource(R.string.onb_error_network),
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}

@Composable
private fun RightItem(
    label: String,
    granted: Boolean,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.x1),
    ) {
        Icon(
            if (granted) Icons.Rounded.Check else Icons.Rounded.Close,
            contentDescription = null,
            tint =
                if (granted) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.error
                },
        )
        Spacer(Modifier.size(Spacing.x2))
        Text(label)
    }
}

/**
 * Bước đặt passphrase mã hoá đầu-cuối (M7-4, FR-ONB-4, SPEC §12):
 * cảnh báo rõ "mất passphrase = mất dữ liệu", nhập 2 lần + tick xác nhận. Có thể bỏ qua.
 */
@Composable
private fun EncryptionStep(viewModel: OnboardingViewModel) {
    var passphrase by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var acknowledged by remember { mutableStateOf(false) }
    val mismatch = confirm.isNotEmpty() && confirm != passphrase
    val canEnable =
        passphrase.length >= com.tgvault.app.core.crypto.CryptoScheme.MIN_PASSPHRASE_CHARS &&
            passphrase == confirm &&
            acknowledged

    StepScaffold(title = stringResource(R.string.onb_enc_title)) {
        Text(stringResource(R.string.onb_enc_body), style = MaterialTheme.typography.bodyLarge)
        Spacer(Modifier.height(Spacing.x4))
        TgCard(modifier = Modifier.fillMaxWidth()) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(Spacing.x4),
            ) {
                Icon(
                    Icons.Rounded.Lock,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.error,
                )
                Spacer(Modifier.size(Spacing.x3))
                Text(
                    stringResource(R.string.onb_enc_warning),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
        Spacer(Modifier.height(Spacing.x4))
        OutlinedTextField(
            value = passphrase,
            onValueChange = { passphrase = it },
            label = { Text(stringResource(R.string.onb_enc_passphrase)) },
            visualTransformation = PasswordVisualTransformation(),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(Spacing.x3))
        OutlinedTextField(
            value = confirm,
            onValueChange = { confirm = it },
            label = { Text(stringResource(R.string.onb_enc_passphrase_confirm)) },
            visualTransformation = PasswordVisualTransformation(),
            singleLine = true,
            isError = mismatch,
            supportingText = {
                if (mismatch) Text(stringResource(R.string.onb_enc_mismatch))
            },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(Spacing.x2))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = acknowledged, onCheckedChange = { acknowledged = it })
            Text(
                stringResource(R.string.onb_enc_ack),
                style = MaterialTheme.typography.bodyMedium,
            )
        }
        Spacer(Modifier.height(Spacing.x6))
        TgPrimaryButton(
            onClick = { viewModel.enableEncryption(passphrase.toCharArray()) },
            enabled = canEnable,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.onb_enc_enable))
        }
        Spacer(Modifier.height(Spacing.x2))
        TgSecondaryButton(onClick = viewModel::skipEncryption, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.onb_enc_skip))
        }
    }
}

@Composable
private fun DoneStep() {
    StepScaffold(title = stringResource(R.string.onb_done_title)) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.x8),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                Icons.Rounded.CheckCircle,
                contentDescription = null,
                modifier = Modifier.size(96.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.height(Spacing.x6))
            Text(
                stringResource(R.string.onb_done_message),
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
            )
        }
    }
}
