package com.tgvault.app.core.security

import android.content.Context
import android.util.Base64
import androidx.core.content.edit
import com.tgvault.app.core.common.TimeProvider
import com.tgvault.app.core.crypto.CryptoManager
import com.tgvault.app.core.crypto.CryptoScheme
import com.tgvault.app.domain.repository.ConfigRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Khoá app (M7-5, FR-SEC-2/4, SPEC §14):
 * - PIN 4–8 số, lưu scrypt hash (salt 16B ‖ hash 32B, Base64) trong SharedPreferences riêng.
 * - Khoá sau `appLockTimeoutSec` ở nền (ProcessLifecycleOwner báo background/foreground),
 *   và khoá ngay khi process mở lại nếu đang bật khoá.
 * - Khi khoá: xoá session key mã hoá ([CryptoManager.lock]) + xoá cache giải mã
 *   (`cacheDir/stream`, `cacheDir/dec`) — SPEC §12.
 * - Sinh trắc học (BiometricPrompt) chỉ mở KHOÁ UI; master key mở lazy từ Keystore khi cần.
 */
@Singleton
class AppLockManager
    @Inject
    constructor(
        @ApplicationContext private val context: Context,
        private val configRepository: ConfigRepository,
        private val cryptoManager: CryptoManager,
        private val timeProvider: TimeProvider,
    ) {
        private val prefs = context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)

        private val _locked = MutableStateFlow(false)
        val locked: StateFlow<Boolean> = _locked.asStateFlow()

        @Volatile
        private var lastBackgroundAt: Long? = null

        fun hasPin(): Boolean = prefs.contains(KEY_PIN)

        /** Process mới mở app: khoá ngay nếu đang bật khoá app (FR-SEC-2). */
        suspend fun lockOnStartIfEnabled() {
            val cfg = configRepository.current()
            if (cfg.appLockEnabled && hasPin()) lock()
        }

        /** App vào nền (ON_STOP). */
        fun onBackground() {
            lastBackgroundAt = timeProvider.nowMillis()
        }

        /** App trở lại foreground (ON_START): quá timeout → khoá. */
        suspend fun onForeground() {
            val cfg = configRepository.current()
            if (!cfg.appLockEnabled || !hasPin()) {
                _locked.value = false
                return
            }
            val bg = lastBackgroundAt ?: return
            if (timeProvider.nowMillis() - bg >= cfg.appLockTimeoutSec * 1000L) lock()
        }

        fun lock() {
            cryptoManager.lock()
            clearDecryptCaches()
            _locked.value = true
        }

        fun unlockWithPin(pin: CharArray): Boolean {
            val blob = prefs.getString(KEY_PIN, null)?.let { Base64.decode(it, Base64.NO_WRAP) } ?: return false
            if (blob.size != CryptoScheme.SALT_SIZE + CryptoScheme.MASTER_KEY_SIZE) return false
            val salt = blob.copyOfRange(0, CryptoScheme.SALT_SIZE)
            val expected = blob.copyOfRange(CryptoScheme.SALT_SIZE, blob.size)
            val actual = CryptoScheme.hashPin(pin, salt)
            val ok = MessageDigest.isEqual(expected, actual)
            actual.fill(0)
            if (ok) markUnlocked()
            return ok
        }

        /** Gọi sau khi BiometricPrompt xác thực thành công. */
        fun unlockWithBiometric() = markUnlocked()

        /** Đặt PIN lần đầu (bật khoá app). PIN 4–8 chữ số. */
        fun setPin(pin: CharArray) {
            require(pin.size in MIN_PIN_LENGTH..MAX_PIN_LENGTH && pin.all { it.isDigit() }) {
                "PIN phải $MIN_PIN_LENGTH–$MAX_PIN_LENGTH chữ số"
            }
            val salt = CryptoScheme.generateSalt()
            val hash = CryptoScheme.hashPin(pin, salt)
            val blob = salt + hash
            hash.fill(0)
            prefs.edit { putString(KEY_PIN, Base64.encodeToString(blob, Base64.NO_WRAP)) }
        }

        /** Đổi PIN — yêu cầu PIN cũ đúng. */
        fun changePin(
            oldPin: CharArray,
            newPin: CharArray,
        ): Boolean {
            if (!unlockWithPin(oldPin)) return false // mượn verify; không đổi trạng thái khoá ngoài ý muốn
            setPin(newPin)
            return true
        }

        fun clearPin() {
            prefs.edit { remove(KEY_PIN) }
            _locked.value = false
        }

        private fun markUnlocked() {
            lastBackgroundAt = null
            _locked.value = false
        }

        private fun clearDecryptCaches() {
            File(context.cacheDir, "stream").deleteRecursively()
            File(context.cacheDir, "dec").deleteRecursively()
        }

        private companion object {
            const val PREFS_FILE = "tgvault_applock"
            const val KEY_PIN = "pin_hash"
            const val MIN_PIN_LENGTH = 4
            const val MAX_PIN_LENGTH = 8
        }
    }
