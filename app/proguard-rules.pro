# TgVault — ProGuard/R8 rules (release)
# Các thư viện chính (Room, Hilt, Retrofit, OkHttp, kotlinx.serialization, Tink) đã kèm consumer rules.

# DTO Telegram dùng kotlinx.serialization — giữ lại để an toàn khi R8 strip
-keep class com.tgvault.app.data.remote.dto.** { *; }

# Không strip Timber: release chỉ log WARN/ERROR bằng code (TgVaultApp), không strip ở đây
