# TgVault

Ứng dụng Android (Kotlin + Jetpack Compose + Material 3) biến một **channel Telegram riêng tư của chính bạn**
thành ổ đĩa đám mây cá nhân: upload/download tệp lớn theo chunk 19 MiB, duyệt thư mục, mã hoá đầu-cuối tuỳ chọn,
truyền tải nền có resume, sao lưu/khôi phục danh mục tệp (index) qua chính Telegram.

Tài liệu gốc của dự án:

- `SPEC.md` — yêu cầu và kiến trúc (cái gì & tại sao)
- `PLAN.md` — lộ trình milestone M0–M10 (làm theo thứ tự nào)
- `AGENTS.md` — quy ước cho AI agent / contributor
- `docs/DECISIONS.md` · `docs/PROGRESS.md` · `docs/TELEGRAM_FINDINGS.md`

## Build

Yêu cầu: JDK 17, Android SDK 36, Android Studio bản ổn định mới nhất.

```bash
# Lần đầu (repo chưa commit gradle-wrapper.jar — xem docs/DECISIONS.md):
gradle wrapper        # hoặc chỉ cần mở project bằng Android Studio

# Kiểm tra đầy đủ:
./gradlew ktlintCheck detekt lintDebug testDebugUnitTest assembleDebug
```

## Test với Telegram thật

Tạo bot thử qua [@BotFather](https://t.me/BotFather) + một channel riêng tư (thêm bot làm admin với quyền
Post/Delete/Pin), rồi điền vào `local.properties` (KHÔNG commit file này):

```properties
tgvault.botToken=123456:ABC...
tgvault.chatId=-100...
```

```bash
./gradlew testDebugUnitTest -PrunTelegramLive=true
```

Kết quả ghi vào `docs/TELEGRAM_FINDINGS.md`.

## Trạng thái

Xem `docs/PROGRESS.md`. Hiện tại: M0–M2 đã code xong, đang chờ build kiểm chứng trên máy có Android SDK.
