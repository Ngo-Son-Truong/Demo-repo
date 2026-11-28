package com.tgvault.app.core.crypto

import android.content.Context
import android.util.Base64
import androidx.core.content.edit
import com.google.crypto.tink.Aead
import com.google.crypto.tink.KeyTemplates
import com.google.crypto.tink.aead.AeadConfig
import com.google.crypto.tink.integration.android.AndroidKeysetManager
import dagger.hilt.android.qualifiers.ApplicationContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Quản lý master key mã hoá đầu-cuối (M7-1, SPEC §12, FR-SEC-1).
 *
 * Hai lớp bọc song song:
 * - **Cục bộ**: master key bọc bằng AES-GCM key không xuất được trong Android Keystore
 *   (Tink AndroidKeysetManager) → mở khoá không cần hỏi passphrase mỗi lần.
 * - **Passphrase blob**: master key bọc bằng scrypt+AES-GCM ([CryptoScheme]) — để M8
 *   nhúng vào snapshot khôi phục trên máy khác và để verify passphrase người dùng.
 *
 * Session key chỉ nằm trong RAM; [lock] xoá trắng. KHÔNG log bất kỳ byte khoá nào.
 */
@Singleton
class CryptoManager
    @Inject
    constructor(
        @ApplicationContext context: Context,
    ) {
        private val prefs = context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)

        private val keystoreAead: Aead by lazy {
            AeadConfig.register()
            AndroidKeysetManager
                .Builder()
                .withSharedPref(context, KEYSET_NAME, KEYSET_PREFS_FILE)
                .withKeyTemplate(KeyTemplates.get("AES256_GCM"))
                .withMasterKeyUri("android-keystore://$MASTER_KEY_ALIAS")
                .build()
                .keysetHandle
                .getPrimitive(Aead::class.java)
        }

        @Volatile
        private var sessionKey: ByteArray? = null

        val isUnlocked: Boolean get() = sessionKey != null

        /** Đã bật mã hoá (có master key lưu cục bộ) — độc lập trạng thái unlock. */
        fun isConfigured(): Boolean = prefs.contains(KEY_KEYSTORE_WRAPPED)

        /**
         * Bật mã hoá lần đầu với passphrase người dùng: tạo master key mới, bọc Keystore
         * + bọc passphrase (blob giữ lại để M8 nhúng snapshot), mở session.
         */
        fun enable(passphrase: CharArray) {
            check(!isConfigured()) { "mã hoá đã được bật — dùng changePassphrase" }
            val master = CryptoScheme.generateMasterKey()
            val passphraseBlob = CryptoScheme.wrapWithPassphrase(master, passphrase)
            val keystoreBlob = keystoreAead.encrypt(master, AD_KEYSTORE)
            prefs.edit {
                putString(KEY_KEYSTORE_WRAPPED, Base64.encodeToString(keystoreBlob, Base64.NO_WRAP))
                putString(KEY_PASSPHRASE_BLOB, Base64.encodeToString(passphraseBlob, Base64.NO_WRAP))
            }
            setSession(master)
        }

        /** Mở khoá session từ blob bọc Keystore (không cần passphrase). */
        fun unlock(): Boolean {
            if (sessionKey != null) return true
            val encoded = prefs.getString(KEY_KEYSTORE_WRAPPED, null) ?: return false
            return try {
                setSession(keystoreAead.decrypt(Base64.decode(encoded, Base64.NO_WRAP), AD_KEYSTORE))
                true
            } catch (e: Exception) {
                // Keystore key mất (gỡ app, đổi khoá hệ thống) → chỉ còn đường khôi phục qua snapshot (M8)
                Timber.w(e, "không mở được master key từ Keystore")
                false
            }
        }

        /** Khoá session: xoá trắng master key trong RAM (app lock, FR-SEC-2/4). */
        fun lock() {
            sessionKey?.fill(0)
            sessionKey = null
        }

        /** Master key đang mở — ném IllegalStateException nếu chưa unlock. */
        fun requireKey(): ByteArray = checkNotNull(sessionKey) { "khoá mã hoá chưa mở — gọi unlock() trước" }

        /** Xác minh passphrase người dùng nhập có mở được blob không (đổi/tắt mã hoá, M8 restore). */
        fun verifyPassphrase(passphrase: CharArray): Boolean {
            val blob = passphraseBlob() ?: return false
            return try {
                CryptoScheme.unwrapWithPassphrase(blob, passphrase).fill(0)
                true
            } catch (e: Exception) {
                false
            }
        }

        /** Đổi passphrase (yêu cầu đã unlock): bọc lại master key bằng KEK mới + salt mới. */
        fun changePassphrase(newPassphrase: CharArray) {
            val master = requireKey()
            val blob = CryptoScheme.wrapWithPassphrase(master, newPassphrase)
            prefs.edit { putString(KEY_PASSPHRASE_BLOB, Base64.encodeToString(blob, Base64.NO_WRAP)) }
        }

        /** Blob bọc bằng passphrase — M8 nhúng vào header snapshot (wrappedMasterKey). */
        fun passphraseBlob(): ByteArray? =
            prefs.getString(KEY_PASSPHRASE_BLOB, null)?.let { Base64.decode(it, Base64.NO_WRAP) }

        /** Tắt mã hoá: xoá session + toàn bộ blob (tệp đã mã hoá vẫn cần master key cũ — caller cảnh báo). */
        fun disable() {
            lock()
            prefs.edit { clear() }
        }

        private fun setSession(key: ByteArray) {
            sessionKey?.fill(0)
            sessionKey = key
        }

        private companion object {
            const val PREFS_FILE = "tgvault_crypto"
            const val KEYSET_PREFS_FILE = "tgvault_crypto_keyset_prefs"
            const val KEYSET_NAME = "tgvault_crypto_keyset"
            const val MASTER_KEY_ALIAS = "tgvault_crypto_master_key"
            const val KEY_KEYSTORE_WRAPPED = "master_key_keystore_wrapped"
            const val KEY_PASSPHRASE_BLOB = "master_key_passphrase_wrapped"
            val AD_KEYSTORE = "tgvault-master-key-v1".toByteArray()
        }
    }
