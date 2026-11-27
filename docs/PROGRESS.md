# PROGRESS.md — Trạng thái dự án TgVault

> Cập nhật cuối mỗi milestone theo PLAN 0.1.7.

## Trạng thái tổng (2026-11-26)

| Milestone | Trạng thái |
|---|---|
| M0 Bootstrap | 🟡 Code hoàn tất — **chưa build kiểm chứng** (sandbox không có Android SDK/Maven) |
| M1 Telegram Gateway | 🟡 Code hoàn tất — chưa build; test live cần chạy trên máy có mạng |
| M2 Dữ liệu + engine chunk | 🟡 Code hoàn tất — chưa build |
| M3–M10 | ⬜ Chưa bắt đầu |

## Đã làm
- Đưa SPEC.md/PLAN.md vào repo; tạo AGENTS.md, DECISIONS.md, PROGRESS.md, TELEGRAM_FINDINGS.md (M0-7).
- Bootstrap Gradle (KTS, version catalog, KSP), minSdk 29 / target+compile 36 (M0-1).
- Cấu trúc package theo SPEC §7; Hilt, Timber, `TgVaultApp` (M0-2).
- ktlint + detekt + lint warnings-as-errors + .editorconfig (M0-3).
- Design system: theme seed #2AABEE (sáng/tối/dynamic), tokens, `MotionSpecs` + `LocalReduceMotion`,
  component cơ bản (nút, thẻ, ô nhập, empty state, snackbar host) (M0-4).
- NavigationSuiteScaffold 3 tab + màn hình giữ chỗ; strings en/vi; adaptive icon tạm (M0-5).
- GitHub Actions: lint + ktlint + detekt + test + assembleDebug (M0-6).
- M1: DTO + Retrofit/OkHttp, `BotApiGateway` (streaming multipart, download streaming, Range),
  ánh xạ lỗi §9.2, `RetryPolicy`, `TelegramRateLimiter` §9.3, `watchForChannel()` long polling,
  test MockWebServer + test live (`-PrunTelegramLive=true`).
- M2: Room (4 entity + DAO + CTE cây thư mục, exportSchema), DataStore config, repository impl,
  `Chunker` streaming, `UploadEngine` (resume theo chunk), `DownloadEngine` (staging + verify SHA-256),
  xoá vĩnh viễn + OrphanChunk, `GatewayHolder`; test Chunker/NameNormalizer/UniqueNameResolver
  (JVM thuần) và Room/NodeRepository (Robolectric in-memory).

## Chưa làm / việc tiếp theo
1. **BẮT BUỘC trên máy thật**: chạy `gradle wrapper` (hoặc mở Android Studio) rồi
   `./gradlew ktlintCheck detekt lintDebug testDebugUnitTest assembleDebug`; sửa các lỗi phát sinh
   (session này không build được — xem DECISIONS).
2. Tạo bot test + channel test (@BotFather), điền `tgvault.botToken`/`tgvault.chatId` vào `local.properties`,
  chạy `./gradlew testDebugUnitTest -PrunTelegramLive=true`, ghi kết quả vào TELEGRAM_FINDINGS.md (M1-7).
3. Milestone M3 theo PLAN (WorkManager, foreground service, thông báo, resume sau kill).

## Vấn đề tồn đọng
- `gradle-wrapper.jar` chưa có trong repo (xem DECISIONS) — cần `gradle wrapper` một lần.
- Phiên bản thư viện ghim theo ma trận Kotlin 2.2.21 (DECISIONS); cân nhắc nâng sau khi build xanh.
- Room dùng `WITH RECURSIVE` trong vài truy vấn (cây thư mục) — nếu query verifier kêu, chuyển `@RawQuery`.
- Câu hỏi mở SPEC §18 còn: (2) phát hành Play hay APK cá nhân, (3) Local Bot API server, (4) nhiều drive.
