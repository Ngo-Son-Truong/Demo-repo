package com.tgvault.app.core.crypto

import android.content.Context
import android.util.Base64
import com.google.crypto.tink.Aead
import com.google.crypto.tink.KeyTemplates
import com.google.crypto.tink.aead.AeadConfig
import com.google.crypto.tink.integration.android.AndroidKeysetManager
import dagger.hilt.android.qualifiers.ApplicationContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Lưu bot token an toàn (M4-1, FR-SEC-3): Tink AEAD (AES256-GCM), master key trong
 * Android Keystore. Ciphertext nằm trong SharedPreferences riêng — app đã tắt
 * allowBackup + dataExtractionRules nên không rời máy qua backup.
 */
@Singleton
class TokenStore
    @Inject
    constructor(
        @ApplicationContext context: Context,
    ) {
        private val prefs = context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)

        private val aead: Aead by lazy {
            AeadConfig.register()
            AndroidKeysetManager.Builder()
                .withSharedPref(context, KEYSET_NAME, KEYSET_PREFS_FILE)
                .withKeyTemplate(KeyTemplates.get("AES256_GCM"))
                .withMasterKeyUri("android-keystore://$MASTER_KEY_ALIAS")
                .build()
                .keysetHandle
                .getPrimitive(Aead::class.java)
        }

        fun read(): String? =
            try {
                val encoded = prefs.getString(KEY_TOKEN, null) ?: return null
                String(aead.decrypt(Base64.decode(encoded, Base64.NO_WRAP), ASSOCIATED_DATA), Charsets.UTF_8)
            } catch (e: Exception) {
                // Keystore key mất (gỡ app/đổi khoá) → coi như chưa có token, onboarding lại
                Timber.w(e, "không giải mã được token — yêu cầu nhập lại")
                null
            }

        fun write(token: String) {
            val encrypted = aead.encrypt(token.toByteArray(Charsets.UTF_8), ASSOCIATED_DATA)
            prefs.edit().putString(KEY_TOKEN, Base64.encodeToString(encrypted, Base64.NO_WRAP)).apply()
        }

        fun clear() {
            prefs.edit().remove(KEY_TOKEN).apply()
        }

        private companion object {
            const val PREFS_FILE = "tgvault_secrets"
            const val KEYSET_PREFS_FILE = "tgvault_keyset_prefs"
            const val KEYSET_NAME = "tgvault_token_keyset"
            const val MASTER_KEY_ALIAS = "tgvault_token_master_key"
            const val KEY_TOKEN = "bot_token"
            val ASSOCIATED_DATA = "tgvault-bot-token-v1".toByteArray()
        }
    }
