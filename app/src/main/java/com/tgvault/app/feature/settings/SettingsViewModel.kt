package com.tgvault.app.feature.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tgvault.app.domain.model.DriveConfig
import com.tgvault.app.domain.repository.ConfigRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/**
 * Cài đặt — M7-4: toggle mã hoá đầu-cuối (FR-SEC-1).
 * Bật lần đầu cần đặt passphrase (tạo master key); bật lại sau khi tắt dùng lại master key cũ.
 * Tắt KHÔNG mã hoá lại tệp cũ — chỉ áp dụng cho upload sau đó (SPEC §12), master key được giữ
 * để tệp cũ vẫn mở được.
 */
@HiltViewModel
class SettingsViewModel
    @Inject
    constructor(
        private val configRepository: ConfigRepository,
        private val cryptoManager: com.tgvault.app.core.crypto.CryptoManager,
        private val appLockManager: com.tgvault.app.core.security.AppLockManager,
    ) : ViewModel() {
        val config: StateFlow<DriveConfig?> =
            configRepository.config
                .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

        /** Master key đã tồn tại (đã từng bật mã hoá) → bật lại không cần passphrase mới. */
        private val _cryptoConfigured = MutableStateFlow(cryptoManager.isConfigured())
        val cryptoConfigured: StateFlow<Boolean> = _cryptoConfigured.asStateFlow()

        /** Sai passphrase / lỗi khi bật — UI hiện thông báo. */
        private val _encryptionError = MutableStateFlow(false)
        val encryptionError: StateFlow<Boolean> = _encryptionError.asStateFlow()

        /** Bật mã hoá lần đầu với passphrase mới. */
        fun enableEncryptionWithPassphrase(passphrase: CharArray) {
            viewModelScope.launch {
                runCatching { cryptoManager.enable(passphrase) }
                    .onSuccess {
                        configRepository.setEncryptionEnabled(true)
                        _cryptoConfigured.value = true
                        _encryptionError.value = false
                    }
                    .onFailure { e ->
                        Timber.w(e, "bật mã hoá thất bại")
                        _encryptionError.value = true
                    }
            }
        }

        /** Bật lại mã hoá khi master key đã tồn tại (không cần passphrase mới). */
        fun enableEncryptionExisting() {
            viewModelScope.launch {
                configRepository.setEncryptionEnabled(true)
            }
        }

        /** Tắt mã hoá cho upload sau này; giữ master key để đọc tệp cũ (SPEC §12). */
        fun disableEncryption() {
            viewModelScope.launch {
                configRepository.setEncryptionEnabled(false)
            }
        }

        // --- Khoá app (M7-5, FR-SEC-2) ---

        private val _hasPin = MutableStateFlow(appLockManager.hasPin())
        val hasPin: StateFlow<Boolean> = _hasPin.asStateFlow()

        /** PIN cũ sai khi đổi PIN — UI báo lỗi. */
        private val _wrongOldPin = MutableStateFlow(false)
        val wrongOldPin: StateFlow<Boolean> = _wrongOldPin.asStateFlow()

        /** Bật khoá app: đặt PIN mới (timeout giữ giá trị hiện có, mặc định 60s). */
        fun enableAppLock(pin: CharArray) {
            viewModelScope.launch {
                runCatching { appLockManager.setPin(pin) }
                    .onSuccess {
                        val timeout = config.value?.appLockTimeoutSec ?: 60
                        configRepository.setAppLock(true, timeout)
                        _hasPin.value = true
                    }
                    .onFailure { Timber.w(it, "đặt PIN thất bại") }
            }
        }

        /** Tắt khoá app: xoá PIN, mở khoá ngay. */
        fun disableAppLock() {
            viewModelScope.launch {
                configRepository.setAppLock(false, config.value?.appLockTimeoutSec ?: 60)
                appLockManager.clearPin()
                _hasPin.value = false
            }
        }

        /** Đổi PIN — yêu cầu PIN cũ đúng. */
        fun changePin(
            oldPin: CharArray,
            newPin: CharArray,
        ) {
            viewModelScope.launch {
                val ok = appLockManager.changePin(oldPin, newPin)
                _wrongOldPin.value = !ok
            }
        }

        /** Đặt timeout khoá (giây; coerce 5..600 ở repository). */
        fun setLockTimeout(timeoutSec: Int) {
            viewModelScope.launch {
                configRepository.setAppLock(true, timeoutSec)
            }
        }
    }
