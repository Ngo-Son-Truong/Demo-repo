package com.tgvault.app.feature.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tgvault.app.core.common.AppError
import com.tgvault.app.data.remote.BotRights
import com.tgvault.app.data.remote.ChannelCandidate
import com.tgvault.app.data.remote.ConnectionManager
import com.tgvault.app.domain.repository.ConfigRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/** Các bước onboarding (SPEC §15.3 màn 2). ENCRYPTION = bước đặt passphrase (M7-4, FR-ONB-4). */
enum class OnboardingStep { WELCOME, CREATE_BOT, ENTER_TOKEN, CONNECT_CHANNEL, VERIFY_RIGHTS, ENCRYPTION, DONE }

/** Lỗi onboarding thân thiện (M4-6) — UI map sang chuỗi + hành động gợi ý. */
enum class OnboardingError { INVALID_TOKEN, NETWORK, CHANNEL_NOT_FOUND, UNKNOWN }

data class OnboardingUiState(
    val step: OnboardingStep = OnboardingStep.WELCOME,
    val tokenInput: String = "",
    val checkingToken: Boolean = false,
    val botUsername: String? = null,
    val waitingForChannel: Boolean = false,
    val detectedChannelTitle: String? = null,
    val manualChannelInput: String = "",
    val rights: BotRights? = null,
    val checkingRights: Boolean = false,
    val error: OnboardingError? = null,
) {
    val canGoBack: Boolean get() =
        step != OnboardingStep.WELCOME &&
            step != OnboardingStep.ENCRYPTION &&
            step != OnboardingStep.DONE
}

@HiltViewModel
class OnboardingViewModel
    @Inject
    constructor(
        private val connectionManager: ConnectionManager,
        private val configRepository: ConfigRepository,
        private val cryptoManager: com.tgvault.app.core.crypto.CryptoManager,
    ) : ViewModel() {
        private val _uiState = MutableStateFlow(OnboardingUiState())
        val uiState: StateFlow<OnboardingUiState> = _uiState.asStateFlow()

        private var watchJob: Job? = null

        /** chatId đang kiểm tra — giữ để nút "Kiểm tra lại" dùng (đặt ở đầu checkRights). */
        private var lastChatId: Long? = null

        // --- điều hướng bước ---

        fun next() {
            val next =
                when (_uiState.value.step) {
                    OnboardingStep.WELCOME -> OnboardingStep.CREATE_BOT
                    OnboardingStep.CREATE_BOT -> OnboardingStep.ENTER_TOKEN
                    else -> return
                }
            _uiState.update { it.copy(step = next, error = null) }
        }

        fun back() {
            val prev =
                when (_uiState.value.step) {
                    OnboardingStep.CREATE_BOT -> OnboardingStep.WELCOME
                    OnboardingStep.ENTER_TOKEN -> OnboardingStep.CREATE_BOT
                    OnboardingStep.CONNECT_CHANNEL -> {
                        watchJob?.cancel()
                        OnboardingStep.ENTER_TOKEN
                    }
                    OnboardingStep.VERIFY_RIGHTS -> OnboardingStep.CONNECT_CHANNEL
                    else -> return
                }
            _uiState.update { it.copy(step = prev, error = null) }
        }

        // --- Bước 3: nhập + kiểm tra token (FR-ONB-1) ---

        fun onTokenChange(value: String) {
            _uiState.update { it.copy(tokenInput = value.trim(), error = null) }
        }

        fun verifyToken() {
            val token = _uiState.value.tokenInput
            if (token.isBlank() || _uiState.value.checkingToken) return
            _uiState.update { it.copy(checkingToken = true, error = null) }
            viewModelScope.launch {
                try {
                    val me = connectionManager.previewGateway(token).getMe()
                    _uiState.update {
                        it.copy(
                            checkingToken = false,
                            botUsername = me.username,
                            step = OnboardingStep.CONNECT_CHANNEL,
                        )
                    }
                    startWatchingChannel(token)
                } catch (e: AppError.InvalidToken) {
                    _uiState.update { it.copy(checkingToken = false, error = OnboardingError.INVALID_TOKEN) }
                } catch (e: AppError.Transient) {
                    _uiState.update { it.copy(checkingToken = false, error = OnboardingError.NETWORK) }
                } catch (e: Exception) {
                    Timber.w(e, "verifyToken lỗi")
                    _uiState.update { it.copy(checkingToken = false, error = OnboardingError.UNKNOWN) }
                }
            }
        }

        // --- Bước 4: phát hiện channel (FR-ONB-2) ---

        private fun startWatchingChannel(token: String) {
            watchJob?.cancel()
            _uiState.update { it.copy(waitingForChannel = true) }
            watchJob =
                viewModelScope.launch {
                    connectionManager.previewGateway(token).watchForChannel()
                        .catch { e ->
                            Timber.w(e, "watchForChannel lỗi")
                            _uiState.update { it.copy(waitingForChannel = false, error = OnboardingError.NETWORK) }
                        }
                        .collect { candidate -> onChannelCandidate(candidate) }
                }
        }

        private suspend fun onChannelCandidate(candidate: ChannelCandidate) {
            watchJob?.cancel()
            _uiState.update {
                it.copy(
                    waitingForChannel = false,
                    detectedChannelTitle = candidate.title ?: candidate.username,
                )
            }
            checkRights(candidate.chatId)
        }

        /** Lối thoát nhập tay: `-100…` (id) hoặc `@username`. */
        fun onManualChannelChange(value: String) {
            _uiState.update { it.copy(manualChannelInput = value.trim(), error = null) }
        }

        fun submitManualChannel() {
            val raw = _uiState.value.manualChannelInput
            if (raw.isBlank()) return
            val token = _uiState.value.tokenInput
            _uiState.update { it.copy(checkingRights = true, error = null) }
            viewModelScope.launch {
                try {
                    watchJob?.cancel()
                    val gateway = connectionManager.previewGateway(token)
                    val chat =
                        if (raw.startsWith("@")) {
                            gateway.getChatByUsername(raw)
                        } else {
                            gateway.getChat(raw.toLong())
                        }
                    _uiState.update { it.copy(detectedChannelTitle = chat.title ?: raw) }
                    checkRights(chat.chatId)
                } catch (e: NumberFormatException) {
                    _uiState.update { it.copy(checkingRights = false, error = OnboardingError.CHANNEL_NOT_FOUND) }
                } catch (e: AppError) {
                    Timber.w(e, "manual channel lỗi")
                    _uiState.update {
                        it.copy(
                            checkingRights = false,
                            error =
                                when (e) {
                                    is AppError.Transient -> OnboardingError.NETWORK
                                    else -> OnboardingError.CHANNEL_NOT_FOUND
                                },
                        )
                    }
                }
            }
        }

        // --- Bước 5: kiểm tra quyền (FR-ONB-3) ---

        private fun checkRights(chatId: Long) {
            lastChatId = chatId
            val token = _uiState.value.tokenInput
            _uiState.update { it.copy(step = OnboardingStep.VERIFY_RIGHTS, checkingRights = true, error = null) }
            viewModelScope.launch {
                try {
                    val gateway = connectionManager.previewGateway(token)
                    var rights = gateway.getBotRights(chatId)
                    // Cờ can_pin_messages hay bị Telegram cache trễ — nếu chỉ thiếu ghim,
                    // thử ghim THẬT (gửi tin tự xoá) trước khi báo thiếu quyền.
                    val onlyPinMissing = !rights.hasAll && rights.canPost && rights.canDelete
                    if (onlyPinMissing) {
                        val pinOk = runCatching { gateway.probePin(chatId) }.getOrDefault(false)
                        if (pinOk) rights = rights.copy(canPin = true)
                    }
                    _uiState.update { it.copy(rights = rights, checkingRights = false) }
                    if (rights.hasAll) {
                        finish(chatId)
                    }
                } catch (e: AppError.Transient) {
                    _uiState.update { it.copy(checkingRights = false, error = OnboardingError.NETWORK) }
                } catch (e: Exception) {
                    Timber.w(e, "getBotRights lỗi")
                    _uiState.update { it.copy(checkingRights = false, error = OnboardingError.CHANNEL_NOT_FOUND) }
                }
            }
        }

        fun recheckRights() {
            lastChatId?.let { checkRights(it) }
        }

        private suspend fun finish(chatId: Long) {
            val state = _uiState.value
            connectionManager.persistConnection(
                token = state.tokenInput,
                botUsername = state.botUsername.orEmpty(),
                chatId = chatId,
            )
            // M7-4 (FR-ONB-4): sau khi kết nối → bước đặt passphrase mã hoá (có thể bỏ qua);
            // setOnboardingDone chỉ gọi khi rời bước đó (enable hoặc skip).
            _uiState.update { it.copy(step = OnboardingStep.ENCRYPTION, error = null) }
        }

        /** Bật mã hoá đầu-cuối với passphrase người dùng (M7-4). Trả false nếu lỗi. */
        fun enableEncryption(passphrase: CharArray) {
            viewModelScope.launch {
                runCatching { cryptoManager.enable(passphrase) }
                    .onSuccess {
                        configRepository.setEncryptionEnabled(true)
                        configRepository.setOnboardingDone(true)
                        _uiState.update { it.copy(step = OnboardingStep.DONE, error = null) }
                    }
                    .onFailure { e ->
                        timber.log.Timber.w(e, "bật mã hoá thất bại")
                        _uiState.update { it.copy(error = OnboardingError.UNKNOWN) }
                    }
            }
        }

        /** Bỏ qua mã hoá — có thể bật sau trong Cài đặt (chỉ áp dụng tệp upload sau đó). */
        fun skipEncryption() {
            viewModelScope.launch {
                configRepository.setOnboardingDone(true)
                _uiState.update { it.copy(step = OnboardingStep.DONE, error = null) }
            }
        }
    }
