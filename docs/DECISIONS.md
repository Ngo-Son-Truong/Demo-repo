# DECISIONS.md — Quyết định kỹ thuật

Mỗi mục: ngày · vấn đề · quyết định · lý do. Tham chiếu SPEC/PLAN khi cần.

## 2026-11-26 · Tên app và package (PLAN 0.2)
- Quyết định: tên app **TgVault**, package **`com.tgvault.app`** (chủ dự án chốt, thay placeholder `com.yourname.tgvault`).

## 2026-11-26 · Ma trận phiên bản (SPEC §6, PLAN M0-1)
Sandbox build không có quyền truy cập Maven/Gradle nên không resolve được dependency; các phiên bản dưới đây
được chọn theo nguyên tắc: **đã kiểm chứng là tồn tại** (mvnrepository/plugins.gradle.org qua web) hoặc có độ tin cậy cao,
và **đồng bộ với Kotlin 2.2.21** (tránh lỗi metadata Kotlin khi dùng thư viện build bằng Kotlin quá mới).

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| Gradle | 8.14.3 | tương thích AGP 8.13 |
| AGP | 8.13.0 | chọn nhánh 8.x thay vì 9.x (ổn định mới nhất là 9.5.1) vì AGP 9 đổi cách tích hợp Kotlin ("built-in Kotlin") và DSL mới chưa thể kiểm chứng khi không build được; nâng AGP 9 sau khi build xanh |
| Kotlin | 2.2.21 | bản ổn định mới nhất là 2.4.x, nhưng ghép cặp chắc chắn với KSP `2.2.21-2.0.5` (đã kiểm chứng tồn tại) |
| KSP | 2.2.21-2.0.5 | ghép đúng Kotlin 2.2.21 |
| compileSdk / targetSdk / minSdk | 36 / 36 / 29 | Google Play bắt buộc targetSdk 36 từ 31-08-2026 (đã kiểm chứng) |
| Compose BOM | 2025.10.01 | đồng thời Kotlin 2.2.x (BOM 2026.x yêu cầu Kotlin mới hơn — chưa kiểm chứng được tương thích) |
| activity-compose / lifecycle / navigation | 1.11.0 / 2.9.4 / 2.9.4 | đồng thời Compose BOM 2025.10 |
| Hilt | 2.57.2 | đã kiểm chứng tồn tại (mới nhất 2.60.1 — nâng sau khi build xanh) |
| Room | 2.8.1 | đã kiểm chứng; mới nhất 2.8.5 (nâng sau) |
| WorkManager | 2.10.5 | đã kiểm chứng tồn tại |
| DataStore | 1.2.0 | |
| Coroutines / Serialization | 1.10.2 / 1.9.0 | |
| Retrofit / OkHttp | 3.0.0 / 4.12.0 | OkHttp 4.12.0 là bản chắc chắn ổn định; OkHttp 5.x cân nhắc sau |
| Timber | 5.0.1 | |
| Coil 3 | 3.2.0 | dùng từ M5/M9 |
| Tink | 1.18.0 (`tink-android`) | dùng từ M7 |
| androidx.biometric | 1.1.0 | dùng từ M7; đánh giá lại bản mới ở M7 |
| argon2kt | 1.6.1 | **chưa kiểm chứng được**; M7 PHẢI xác nhận tồn tại, fallback scrypt (BouncyCastle) |
| ktlint (plugin) | org.jlleitschuh.gradle.ktlint 12.2.0 · ktlint 1.5.0 | |
| detekt | 1.23.8 | |
| Test | JUnit 4.13.2, MockK 1.14.2, Turbine 1.2.1, MockWebServer 4.12.0, Robolectric 4.15.1, androidx.test core 1.6.1 | |

## 2026-11-26 · JUnit4 + Robolectric thay vì JUnit5
- Vấn đề: SPEC §6 cho phép "JUnit5/JUnit4"; JUnit5 trên Android cần plugin `de.mannodermaus` và cấu hình thêm.
- Quyết định: JUnit4 + Robolectric (test Room in-memory trên JVM). Đơn giản, chuẩn Android, không thêm plugin.

## 2026-11-26 · Không commit `gradle-wrapper.jar`
- Vấn đề: sandbox không tải được Gradle distribution nên không sinh được wrapper jar (binary) một cách tin cậy.
- Quyết định: commit `gradle-wrapper.properties`; người dùng chạy `gradle wrapper` (hoặc mở bằng Android Studio) một lần
  để sinh `gradlew`/jar. CI tự sinh wrapper trước khi build (xem `.github/workflows/ci.yml`).

## 2026-11-26 · Che bot token bằng regex thay vì inject token vào logger (SPEC §14)
- Quyết định: `TokenRedactor` (core/common) che mọi chuỗi dạng `bot<digits>:<secret>` bằng regex, dùng trong
  HttpLoggingInterceptor.Logger và khi log exception. Không phụ thuộc nơi lưu token (M4).

## 2026-11-26 · `ChunkSource` đặt ở `domain/model`
- Vấn đề: SPEC §7 đặt TelegramGateway ở data/remote, §9.1 gateway nhận ChunkSource; nếu ChunkSource ở data/transfer
  thì data/remote phụ thuộc ngang hàng (không sạch).
- Quyết định: interface `ChunkSource` (thuần Kotlin, chỉ dùng java.io) ở `domain/model`; implementation
  `FileChunkSource`/`UriChunkSource` ở `data/transfer`. data → domain đúng quy tắc phụ thuộc.

## 2026-11-26 · Use case xoá nằm ở tầng data (SPEC §10.4, PLAN M2-7)
- Vấn đề: xoá vĩnh viễn cần gọi `TelegramGateway.deleteMessage` (data/remote) + ghi Room + OrphanChunkEntity;
  domain không được phụ thuộc data nên use case domain không gọi gateway trực tiếp.
- Quyết định: orchestration xoá nằm trong `NodeRepositoryImpl` (data/repository); domain chỉ giữ interface
  `NodeRepository.deletePermanently(...)`. Các use case thuần DB (tạo thư mục, đổi tên, di chuyển) giữ ở domain/usecase.

## 2026-11-26 · Header `Range` khi tải chunk (SPEC §10.3)
- Quyết định: gateway gửi `Range` khi được yêu cầu; nếu server trả 200 thay vì 206 thì ném `AppError.RangeNotSupported`
  **trước khi ghi byte nào** để engine xoá file tạm và tải lại từ đầu. Chữ ký hàm `download()` giữ nguyên SPEC §9.1.
  Hỗ trợ Range thực tế của Telegram cần test live (TELEGRAM_FINDINGS câu 6).

## 2026-11-26 · ktlint/detekt nới một số rule
- ktlint: ban đầu định dùng `intellij_idea`, nhưng ktlint 1.5.x không còn hỗ trợ style này (rơi về mặc định)
  → chốt `ktlint_official`: BẮT BUỘC trailing comma, import theo layout `*,java.**,javax.**,kotlin.**,^`;
  tắt `property-naming`
  (CompositionLocal đặt tên PascalCase), tắt `filename`, cho phép Composable đặt tên PascalCase; `max_line_length = 120`.
- detekt: `buildUponDefaultConfig`; tắt `MagicNumber` (số dp/ms trong UI), `MatchingDeclarationName`
  (file nhiều khai báo), `ForbiddenComment` (cho phép TODO(Mx) có chủ đích), `TopLevelPropertyNaming`;
  `FunctionNaming`/`LongParameterList`/`LongMethod` bỏ qua hàm annotated `@Composable`; `ReturnCount` max 4 + guard clauses.

## 2026-11-26 · Tham số KDF (SPEC §12)
- Placeholder cho M7: Argon2id qua argon2kt (m=64 MiB, t=3, p=2, salt 16 byte) — M7 PHẢI xác nhận thư viện và ghi lại.

## 2026-11-26 · M2: một số chọn lựa triển khai
- `fallbackToDestructiveMigration()` chỉ cho giai đoạn dev; M10 (phát hành) PHẢI thay bằng
  `Migration` thật vì người dùng đã có dữ liệu (Room là source of truth).
- Engine nhận `chatId` từ `ConfigRepository.current().chatId` thay vì gateway; `GatewayHolder`
  giữ gateway để DI không phụ thuộc thời điểm có token (token an toàn — Tink AEAD — ở M4).
- Resume upload: chỉ hỗ trợ tiền tố 0..k-1 (engine upload tuần tự nên đây là trạng thái duy nhất
  có thể xảy ra); resume download theo byte trong file staging `.part` tại cacheDir.
- `NodeDao.subtreeIds` dùng `WITH RECURSIVE` — nếu Room query verifier kêu khi build, chuyển
  sang `@RawQuery` (đã ghi ở PROGRESS).

## 2026-11-27 · CI thật sự xanh (PR #6) — bài học & sửa sai
- **gradle-wrapper.jar ĐƯỢC commit** trong repo (entry cũ ghi "không commit" là sai). CI dùng luôn wrapper;
  `gradle/actions/setup-gradle@v4` chỉ để cache.
- **CI tự format**: bước `ktlintFormat` chạy trước `ktlintCheck`; nếu có thay đổi (push event) thì
  github-actions[bot] commit "style: ktlintFormat tự động" và push lại. ktlintFormat idempotent nên không loop.
  → Không bao giờ sửa style bằng tay nữa; kéo `git pull --rebase` trước khi push tiếp.
- **Kênh chẩn đoán đáng tin: comment PR** (`gh pr comment`, đọc bằng `gh api .../issues/<PR>/comments` —
  NHỚ `per_page=100 --paginate` vì mặc định chỉ trả trang 1 = comment cũ). Release `ci-debug` chỉ là kênh phụ:
  upload/edit đều `|| true` và chỉ chạy ở push event (2 run push+PR upload --clobber đồng thời sẽ đá nhau).
- **`.editorconfig` `[app/src/test/**]` tắt max_line_length**: test chứa JSON fixture Telegram dài;
  detekt `MaxLineLength` cũng tắt (ktlint đã kiểm).
- **detekt config đợt 2** (config/detekt/detekt.yml): section name phải khớp default-detekt-config.yml của
  1.23.8 — `MatchingDeclarationName` thuộc `naming` (không phải `style`), `ForbiddenComment` thuộc `style`
  (không phải `comments`), `TooGenericExceptionCaught`/`SwallowedException` thuộc `exceptions`
  (không phải `potential-bugs`). Thêm: `TooManyFunctions` threshold class/interface = 25 (API/gateway/DAO
  nhiều hàm là bản chất), `NestedBlockDepth` = 5, `ThrowsCount`/`SwallowedException`/`EmptyFunctionBlock` tắt
  (engine map lỗi theo nhánh, fake test no-op là hợp lệ), `LongParameterList.ignoreDefaultParameters`.
- **Bắt được bug thật nhờ CI** (code chưa từng compile trước đó):
  1. Retrofit path `"bot{token}/..."` — token có `:` khiến HttpUrl.parse nhầm thành scheme → Malformed URL.
     Fix: leading slash `"/bot{token}/..."`. Test MockWebServer phát hiện.
  2. `ChunkSource.writeTo` interface non-suspend (OkHttp gọi blocking trên thread IO) nhưng 2 impl khai
     `suspend` + `withContext(IO)` — thừa và lỗi override. Fix: impl non-suspend.
  3. `TelegramRateLimiter`: `Long.MIN_VALUE + interval - now` TRÀN sang số dương khổng lồ → lệnh gửi đầu
     tiên chờ vô hạn (4 test timeout 1 phút). Fix: kiểm tra `lastCallAt == Long.MIN_VALUE` trước khi cộng.
  4. `NameNormalizer` không gộp khoảng trắng trong → test "  Hello   World " mong "hello world". Fix:
     `replace(Regex("\\s+"), " ")` trước trim.
  5. Test từng gọi API Telegram THẬT (gateway hardcode `https://api.telegram.org/file/bot`): thêm param
     `downloadUrlPrefix` để test trỏ về MockWebServer. Bài học: không bao giờ hardcode URL thật trong lớp
     được unit test.
  6. `RoomDatabaseTest` factory set `nameNormalized = name.lowercase()` (giữ dấu) trong khi production dùng
     `NameNormalizer.normalize` → search test fail. Factory PHẢI gọi đúng normalizer production.
- **Robolectric**: tải `android-all-instrumented` từ Maven LÚC CHẠY test → flake mạng. Task
  `primeRobolectricJars` kéo trước bằng Gradle (được cache) + `robolectric.dependency.dir` trỏ tới.
- **lint**: tắt 4 check "đã có bản mới" (GradleDependency/NewerVersionAvailable/OldTargetApi/
  AndroidGradlePluginVersion) vì version pin có chủ đích; bật `textReport` để CI đọc được.
  Sửa thật: dataExtractionRules (vault không backup gì — SPEC §14), monochrome icon, `String.toUri()`,
  `StorageManager.getAllocatableBytes`, bỏ `mipmap-anydpi-v26` (minSdk 29).
- **Telegram live test trên CI**: bước riêng sau testDebugUnitTest, chỉ chạy khi repo có secrets
  `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHANNEL_ID` (bot là admin channel test). Token ở secrets, KHÔNG commit;
  `local.properties` đã gitignore. Secrets do maintainer tự thêm qua Settings → Secrets and variables → Actions
  (bot/token CI không có quyền ghi secrets).

## 2026-11-27 — Streaming video/audio trong app (mở rộng FR-PRV-4)

**Bối cảnh**: SPEC gốc xếp phát video streaming vào backlog; người dùng yêu cầu xem video/nghe MP3 ngay trong app.

**Quyết định**: ExoPlayer (Media3 1.5.1) + `NodeStreamDataSource` tự viết: vị trí đọc → (chunk, offset),
tải nguyên chunk qua Range request (Telegram 206 — xác minh Q6), cache đĩa LRU tối đa 3 chunk
(~57 MiB) trong `cacheDir/stream/<nodeId>/`, prefetch chunk kế. Không lưu file vĩnh viễn — khác
với "Tải về" (Downloads). Fallback khi stream lỗi: màn lỗi + người dùng dùng "Tải về" + mở app ngoài.
Chỉ áp dụng node chưa mã hoá (M7 sẽ cần lớp giải mã xen giữa).
