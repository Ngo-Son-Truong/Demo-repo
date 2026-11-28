# PLAN.md — Kế hoạch build TgVault bằng AI agent

> Đi kèm `SPEC.md`. SPEC là "cái gì và tại sao"; PLAN là "làm theo thứ tự nào và thế nào là xong".
> Mã `FR-*` tham chiếu tới yêu cầu trong SPEC; mục `§` tham chiếu tới mục của SPEC.

---

## 0. Cách làm việc với AI agent

### 0.1 Quy tắc chung (agent PHẢI tuân thủ)
1. **Đọc `SPEC.md` và `AGENTS.md` trước khi viết code.** Khi SPEC mâu thuẫn với thực tế (API thay đổi, thư viện không tồn tại), KHÔNG tự đổi âm thầm: ghi vào `docs/DECISIONS.md` (ngày, vấn đề, quyết định, lý do) rồi tiếp tục.
2. **Một milestone mỗi phiên làm việc.** Làm tuần tự các task trong milestone; commit nhỏ, mỗi task một commit (`feat(files): …`, `test(chunker): …`).
3. **Xong một task = code + test + chạy được.** Chạy `./gradlew ktlintCheck detekt lintDebug testDebugUnitTest assembleDebug` trước khi báo xong.
4. **Không bịa API hay phiên bản.** Khi dùng thư viện/Android API, kiểm tra tài liệu hiện hành; đặc biệt: foreground service types, quyền thông báo, Tink streaming AEAD, Material 3 / Compose API.
5. **Không phạm các điều cấm** trong SPEC: không đọc nguyên chunk vào RAM, không log bot token, không tự viết thuật toán mã hoá, không hard-code chuỗi giao diện, không `READ_EXTERNAL_STORAGE`.
6. **Khi không chắc về hành vi của Telegram**, viết test thật (cờ `-PrunTelegramLive=true`, token từ `local.properties`), ghi kết quả vào `docs/TELEGRAM_FINDINGS.md` thay vì đoán.
7. Cuối mỗi milestone, cập nhật `docs/PROGRESS.md` (đã làm, chưa làm, vấn đề tồn đọng, việc tiếp theo) để phiên sau (hoặc agent khác) tiếp tục được.
8. Nếu một task quá lớn so với một lần làm, tách nhỏ và ghi lại, đừng bỏ qua test.

### 0.2 Việc bạn (chủ dự án) cần chuẩn bị trước khi bắt đầu
- Chốt **tên app và package** (mặc định `TgVault` / `com.yourname.tgvault`); thay chỗ giữ chỗ trong SPEC/PLAN.
- Tạo **bot thử nghiệm** qua @BotFather và **một channel riêng tư thử nghiệm** (thêm bot làm admin với quyền Post/Delete/Pin). Dùng riêng cho test, không dùng channel chứa dữ liệu thật.
- Cài Android Studio bản ổn định mới nhất + JDK mà AGP yêu cầu; một máy thật hoặc emulator API 29+ (nên có thêm API 34+).
- Tạo repo Git trống; đặt `SPEC.md`, `PLAN.md` vào gốc repo.
- Quyết định các **câu hỏi mở** ở SPEC §18 (đặc biệt: chỉ APK cá nhân hay lên Google Play).

### 0.3 Định nghĩa "Hoàn thành" (Definition of Done) chung
- Build debug + release (R8) thành công; lint/ktlint/detekt không lỗi.
- Test của milestone viết và pass; không giảm độ phủ các thành phần lõi (chunker, crypto, rate limiter, index).
- Mọi chuỗi UI có bản `en` và `vi`.
- Mọi màn hình có đủ trạng thái loading/empty/error theo SPEC §15.3.
- Animation dùng `MotionSpecs` và tôn trọng "giảm chuyển động" (SPEC §15.4).
- Tài liệu `docs/PROGRESS.md` được cập nhật.

### 0.4 Prompt mẫu

**Khởi động (một lần):**
```
Bạn là kỹ sư Android cao cấp. Đọc SPEC.md, PLAN.md và AGENTS.md ở gốc repo.
Thực hiện Milestone M0 trong PLAN.md. Làm tuần tự từng task, commit nhỏ sau mỗi task,
chạy đủ lệnh kiểm tra ở mục 0.1 và báo cáo ngắn gọn: đã làm gì, quyết định nào đã ghi
vào docs/DECISIONS.md, còn vướng gì. Không làm sang milestone khác.
```

**Mỗi milestone:**
```
Đọc docs/PROGRESS.md để biết trạng thái hiện tại, sau đó thực hiện Milestone M<n> trong PLAN.md
(tham chiếu các FR và mục § trong SPEC.md). Tuân thủ Definition of Done ở mục 0.3.
Nếu gặp mâu thuẫn giữa SPEC và thực tế, ghi vào docs/DECISIONS.md rồi tiếp tục. Cuối cùng
cập nhật docs/PROGRESS.md.
```

**Review chéo (nên dùng một phiên/agent khác):**
```
Review mã của Milestone M<n> so với SPEC.md và Acceptance criteria trong PLAN.md.
Liệt kê: (1) chỗ lệch SPEC, (2) lỗi/rủi ro (concurrency, rò rỉ bộ nhớ, xử lý lỗi, bảo mật),
(3) thiếu test. Phân loại Blocker / Nên sửa / Gợi ý. Chưa sửa code, chỉ báo cáo.
```

---

## 1. Tổng quan lộ trình

| Milestone | Nội dung | Phụ thuộc | FR chính |
|---|---|---|---|
| **M0** | Bootstrap dự án, design system, CI | — | — |
| **M1** | Telegram Gateway + rate limiter + kiểm thử Telegram thật | M0 | §5, §9 |
| **M2** | Dữ liệu (Room), Chunker, UploadEngine/DownloadEngine | M1 | FR-TR-3, FR-TR-6 |
| **M3** | Truyền tải nền (WorkManager, thông báo, resume) | M2 | FR-TR-1…5 |
| **M4** | Onboarding + lưu token an toàn | M1 | FR-ONB-1…3, FR-SEC-3 |
| **M5** | Màn hình Tệp (duyệt, thao tác, animation) | M2, M4 | FR-FILE-1…7 |
| **M6** | Màn hình Truyền tải, share-in/share-out, tải về | M3, M5 | FR-TR-2, FR-FILE-2,3,8 |
| **M7** | Mã hoá đầu-cuối + khoá app | M2 | FR-SEC-1,2,4, FR-ONB-4 |
| **M8** | Sao lưu/khôi phục index | M2, M7 | FR-IDX-*, FR-ONB-5 |
| **M9** | Xem trước, thumbnail, thùng rác, tìm kiếm | M5, M6 | FR-PRV-*, FR-FILE-5,6 |
| **M10** | Hoàn thiện: animation, a11y, i18n, hiệu năng, bản phát hành | tất cả | §15–16 |

Thứ tự M4 có thể chạy song song với M2–M3 nếu có nhiều agent; mặc định làm tuần tự theo số.

---

## 2. Chi tiết milestone

### M0 — Bootstrap
**Mục tiêu**: dự án chạy được, có khung kiến trúc, theme, CI.

Tasks
- [ ] **M0-1** Tạo dự án Android (Kotlin, Compose, Gradle KTS, version catalog, KSP), `minSdk 29`, `targetSdk` theo yêu cầu Google Play hiện hành; ghi phiên bản đã chọn vào `docs/DECISIONS.md`.
- [ ] **M0-2** Dựng cấu trúc package theo SPEC §7; cấu hình Hilt, Timber, `Application` class.
- [ ] **M0-3** Cấu hình ktlint (lệnh `ktlintCheck`), detekt, Lint (warnings as errors cho `:app`), `.editorconfig`.
- [ ] **M0-4** Design system: `Theme` (seed `#2AABEE`, dynamic color, sáng/tối), tokens (shape, spacing), `MotionSpecs` + `LocalReduceMotion` (SPEC §15.4), bộ component cơ bản (nút, thẻ, ô nhập, trạng thái trống, Snackbar host).
- [ ] **M0-5** `NavHost` với 3 tab + màn hình giữ chỗ; `strings.xml` `en` + `vi`; icon app tạm (vector).
- [ ] **M0-6** GitHub Actions (hoặc CI tương đương): lint + test + `assembleDebug`.
- [ ] **M0-7** Tạo `AGENTS.md` (xem phụ lục A), `docs/DECISIONS.md`, `docs/PROGRESS.md`, `docs/TELEGRAM_FINDINGS.md`.

Acceptance
- App chạy trên emulator, hiện 3 tab, chuyển tab có animation, theme sáng/tối/dynamic hoạt động.
- Một test thử (ví dụ `MotionSpecs`) pass; CI xanh.

---

### M1 — Telegram Gateway
**Mục tiêu**: giao tiếp Telegram Bot API ổn định, có test, và có bằng chứng thực tế cho các điểm chưa chắc chắn.
Tham chiếu: SPEC §5, §9.

Tasks
- [ ] **M1-1** DTO + Retrofit/OkHttp (kotlinx.serialization); interceptor che token trong log; timeout phù hợp (đọc/ghi dài cho upload, call timeout tắt cho upload).
- [ ] **M1-2** `BotApiGateway` triển khai toàn bộ interface `TelegramGateway` (SPEC §9.1), gồm `sendDocument` multipart **streaming** từ `ChunkSource` có báo tiến độ byte, và `download` ghi streaming ra `OutputStream`.
- [ ] **M1-3** Ánh xạ lỗi (SPEC §9.2) thành sealed exception/`AppError`; chính sách retry/backoff trong một lớp riêng, có test.
- [ ] **M1-4** `TelegramRateLimiter` (SPEC §9.3), dùng `Clock`/`TestScope` để test thời gian ảo; test khoảng cách 1,1 s, cửa sổ 18/60 s, xử lý 429.
- [ ] **M1-5** `watchForChannel()` bằng `getUpdates` long polling (`deleteWebhook` trước; `allowed_updates=["my_chat_member","channel_post"]`; nhớ `offset`; có thể huỷ bằng cancel `Flow`).
- [ ] **M1-6** `MockWebServer` test: thành công, 401, 403, 429 + `retry_after`, 5xx rồi thành công, mất kết nối giữa chừng, multipart đúng định dạng.
- [ ] **M1-7** **Bộ test Telegram thật** (bật bằng `-PrunTelegramLive=true`, token/channel từ `local.properties`) trả lời các câu hỏi mở và ghi vào `docs/TELEGRAM_FINDINGS.md`:
  1. Gửi chunk 19 MiB → `getFile` tải được không, `file_path`, tốc độ.
  2. `file_id` tải lại được sau khi khởi động lại app/ngày hôm sau.
  3. `deleteMessage` cho tin vừa gửi, và tin cũ hơn 48 giờ (để lại một tin thử nghiệm, kiểm tra lại sau; ghi rõ kết quả).
  4. Gửi liên tiếp 30 chunk nhỏ: quan sát 429, `retry_after` thực tế cho channel.
  5. `pinChatMessage` + `getChat().pinned_message`; ghim nhiều tin thì `getChat` trả tin nào.
  6. Header `Range` khi tải tệp có được hỗ trợ không.

Acceptance
- Tất cả test M1 pass; bộ test live chạy được và `docs/TELEGRAM_FINDINGS.md` có kết luận cho 6 câu hỏi (nếu không chạy được, ghi rõ lý do và rủi ro).
- Không có chỗ nào đọc nguyên chunk vào RAM; token không xuất hiện trong log (có test).
- Nếu phát hiện khác biệt so với giả định ở SPEC §5/§9.3, cập nhật `docs/DECISIONS.md` và (với sự đồng ý của chủ dự án) cập nhật SPEC.

---

### M2 — Dữ liệu và engine chunk
**Mục tiêu**: lõi nghiệp vụ lưu/tải tệp chunked, kiểm thử được mà không cần UI hay Telegram thật.
Tham chiếu: SPEC §8, §10.

Tasks
- [ ] **M2-1** Room: `NodeEntity`, `ChunkEntity`, `TransferEntity`, `OrphanChunkEntity`; DAO (duyệt theo `parentId` có sắp xếp, tìm theo `nameNormalized`, cây thư mục, thống kê); `exportSchema=true`; test DAO bằng Room in-memory.
- [ ] **M2-2** DataStore cho cấu hình (SPEC §8); repository interface ở `domain`, triển khai ở `data`.
- [ ] **M2-3** `Chunker`: tính `chunkCount`, offset/length từng chunk; `ChunkSource` từ `Uri` (ContentResolver) và `File`; test biên.
- [ ] **M2-4** `ChunkTransform` (interface; triển khai `IdentityTransform` bây giờ, `CipherTransform` ở M7) — để upload/download gọi qua interface này.
- [ ] **M2-5** `UploadEngine` theo SPEC §10.2: hash SHA-256 streaming, resume theo chunk, idempotent, cập nhật Room trong transaction, phát tiến độ qua `Flow`; phát hiện tệp nguồn đổi giữa chừng.
- [ ] **M2-6** `DownloadEngine` theo SPEC §10.3: `getFile` trước mỗi chunk, xác minh hash chunk + toàn tệp, ghép tệp, resume theo chunk.
- [ ] **M2-7** Use case xoá (SPEC §10.4) kèm `OrphanChunkEntity`; use case tạo/đổi tên/di chuyển Node (xử lý trùng tên, chặn di chuyển thư mục vào chính hậu duệ của nó).
- [ ] **M2-8** `FakeTelegramGateway` (bộ nhớ, có thể chèn lỗi/độ trễ/kill) dùng chung cho test; test end-to-end engine: upload tệp 0/1/N chunk → download → so khớp byte; kill giữa chừng rồi resume; tệp nguồn đổi giữa chừng; hash lệch.

Acceptance
- Test end-to-end engine pass với tệp tổng hợp 1 byte, đúng 1 chunk, 1 chunk + 1 byte, ~100 MiB.
- Dung lượng bộ nhớ khi upload/download tệp 100 MiB không tăng tuyến tính theo kích thước tệp (kiểm tra bằng test hoặc ghi nhận đo thủ công).
- Xoá Node → các chunk tương ứng bị xoá trong Room và `deleteMessage` được gọi đúng số lần (kiểm chứng bằng Fake).

---

### M3 — Truyền tải nền
**Mục tiêu**: upload/download sống sót khi app bị đóng, có thông báo, có điều khiển.
Tham chiếu: SPEC §13, FR-TR-*.

Tasks
- [ ] **M3-1** `TransferScheduler` (enqueue unique work, huỷ, tạm dừng/tiếp tục), `TransferWorker` (một Worker cho cả upload/download, chọn engine theo `direction`) với `setForeground` loại `dataSync`.
- [ ] **M3-2** Điều phối số tác vụ đồng thời (`maxParallelTransfers`; mặc định 1 upload, 2 download) trong `data/transfer`.
- [ ] **M3-3** Thông báo tiến trình gộp (cập nhật ≤ 1 lần/giây), thông báo hoàn tất/lỗi; kênh thông báo riêng; xin `POST_NOTIFICATIONS` đúng lúc (chỉ định nghĩa luồng xin quyền ở tầng domain/UI-agnostic, UI gắn ở M6).
- [ ] **M3-4** Constraints Wi-Fi only theo cài đặt; backoff theo `RateLimited`/`Transient`; xử lý `onTimeout` của foreground service (lưu trạng thái, dừng gọn, lên lịch lại).
- [ ] **M3-5** Phục hồi khi khởi động app: `RUNNING` mồ côi → `QUEUED` và enqueue lại (SPEC §13).
- [ ] **M3-6** Test: `TestListenableWorkerBuilder`/`WorkManagerTestInitHelper` cho resume sau kill, huỷ, tạm dừng, đổi constraint; kiểm thử thủ công trên máy thật: bật chế độ máy bay giữa chừng, force-stop, khởi động lại máy.

Acceptance
- Upload tệp ~200 MiB trên máy thật, force-stop app giữa chừng → mở lại, tiếp tục từ chunk kế tiếp, hoàn tất, hash khớp.
- Trong lúc chạy, thông báo hiển thị tiến độ chính xác, có thể Tạm dừng/Huỷ ngay từ thông báo (hoặc ghi rõ trong `DECISIONS.md` nếu hạn chế của hệ thống).

---

### M4 — Onboarding và lưu token
**Mục tiêu**: người dùng mới kết nối được bot + channel mà không cần đọc tài liệu ngoài.
Tham chiếu: FR-ONB-1…3, FR-SEC-3, SPEC §15.3 (màn 1–2), §15.4.

Tasks
- [ ] **M4-1** Lưu token an toàn (Tink AEAD + Keystore) qua `ConfigRepository`; kiểm tra token không rò vào log/backup (`allowBackup=false`).
- [ ] **M4-2** `OnboardingViewModel` + state machine: Welcome → CreateBot → EnterToken → ConnectChannel → VerifyPermissions → (EncryptionChoice, nối ở M7) → Done; xử lý quay lại, xoay màn hình, tiến trình bị kill.
- [ ] **M4-3** UI từng bước theo SPEC §15.3, minh hoạ vector, nút mở @BotFather (`Intent` tới `https://t.me/BotFather`), nút Dán/Sao chép.
- [ ] **M4-4** Phát hiện channel tự động (dùng `watchForChannel()`), chỉ báo chờ có "nhịp thở", lối thoát nhập tay (`@username`/`-100…`), kiểm tra quyền (`getBotRights`) với checklist animation.
- [ ] **M4-5** Animation theo bảng §15.4: chuyển bước (parallax nhẹ), chấm tiến trình, kiểm tra token (spinner → tích "vẽ"/lắc khi sai), checklist quyền lần lượt.
- [ ] **M4-6** Thông báo lỗi thân thiện cho từng tình huống (token sai, bot chưa vào channel, thiếu quyền, mất mạng) với hành động gợi ý.
- [ ] **M4-7** Test: ViewModel (state machine, Turbine), UI test luồng thành công và các lỗi chính với Fake gateway.

Acceptance
- Với bot + channel thử nghiệm thật: hoàn thành onboarding < 2 phút không cần nhập tay channel ID.
- Nhập token sai, bot chưa thêm vào channel, bot thiếu quyền Delete: mỗi trường hợp hiện thông báo dễ hiểu và có đường sửa.
- Tắt/mở lại app giữa onboarding: tiếp tục đúng bước (hoặc quay về bước hợp lý).

---

### M5 — Màn hình Tệp
**Mục tiêu**: duyệt và quản lý tệp thoải mái, có animation nhẹ.
Tham chiếu: FR-FILE-1,2(phần chọn tệp),4,7; SPEC §15.3 (màn 3–4), §15.4.

Tasks
- [ ] **M5-1** `FilesViewModel`/`UiState`: thư mục hiện tại, sắp xếp, chế độ list/grid, chọn nhiều, tìm kiếm, trạng thái từng mục (kèm tiến độ upload từ `TransferEntity`).
- [ ] **M5-2** UI danh sách/lưới với `LazyColumn`/`LazyVerticalGrid` (`key` ổn định), breadcrumb, `animateItem()`, trạng thái loading/empty/error/offline.
- [ ] **M5-3** FAB mở rộng thu gọn khi cuộn + speed-dial (Tải tệp lên, Tạo thư mục); chọn tệp bằng `OPEN_DOCUMENT` đa chọn → tạo `Node` + `Transfer` (UI chỉ enqueue; hiển thị ở M6).
- [ ] **M5-4** Tạo thư mục, đổi tên, di chuyển (cây chọn đích), xoá mềm kèm Snackbar "Hoàn tác" (logic thùng rác đầy đủ ở M9; ở M5 chỉ cần đặt `trashedAt`).
- [ ] **M5-5** Chế độ chọn nhiều + thanh ngữ cảnh; hành động hàng loạt (Di chuyển, Xoá; Tải về/Chia sẻ nối ở M6).
- [ ] **M5-6** Bottom sheet chi tiết tệp.
- [ ] **M5-7** Tìm kiếm theo tên (`nameNormalized`), có debounce 250 ms.
- [ ] **M5-8** Test: ViewModel, UI test duyệt/tạo thư mục/chọn nhiều/empty state; kiểm thử hiệu năng danh sách 10.000 mục (dữ liệu giả) — ghi số đo vào `docs/PROGRESS.md`.

Acceptance
- Duyệt thư mục 10.000 mục mượt (SPEC §16); animation đúng bảng §15.4; bật "giảm chuyển động" thì không còn animation.
- Mọi thao tác thay đổi dữ liệu cập nhật UI qua `Flow` (không refresh thủ công).

---

### M6 — Truyền tải UI, share-in/out, tải về
**Mục tiêu**: toàn bộ vòng đời upload/download thấy được và điều khiển được từ UI.
Tham chiếu: FR-TR-2,5, FR-FILE-2,3,8.

Tasks
- [ ] **M6-1** Tab Truyền tải: nhóm Đang chạy/Hoàn tất, thẻ tiến độ (tốc độ, ETA), Tạm dừng/Tiếp tục/Huỷ/Thử lại, thao tác toàn cục; thanh tiến độ mini ở màn hình Tệp.
- [ ] **M6-2** Luồng xin `POST_NOTIFICATIONS` ngay lần upload đầu tiên (kèm giải thích; nếu từ chối vẫn chạy nhưng thông báo hiển thị hạn chế, hướng dẫn mở cài đặt).
- [ ] **M6-3** Share-in: `intent-filter` `ACTION_SEND`/`ACTION_SEND_MULTIPLE`; màn hình chọn thư mục đích; sao chép sang `files/staging/` khi không có quyền bền vững (SPEC §8) và dọn dẹp sau đó.
- [ ] **M6-4** Download/export: chọn đích bằng `CREATE_DOCUMENT` hoặc thư mục mặc định (`OPEN_DOCUMENT_TREE` đã nhớ); thông báo hoàn tất có nút "Mở".
- [ ] **M6-5** Chia sẻ ra ngoài: tải vào cache → `FileProvider` → share sheet; dọn cache theo LRU (mặc định tối đa 500 MiB, đo bằng tổng dung lượng cache).
- [ ] **M6-6** Giải thích lỗi thân thiện + "Chi tiết kỹ thuật" gập lại; nút "Thử lại" gọi đúng tác vụ.
- [ ] **M6-7** Test UI/ViewModel cho hàng đợi; kiểm thử thủ công share-in từ Gallery/Files/Chrome.

Acceptance
- Chọn 5 tệp → tiến độ hiển thị đúng, tạm dừng/tiếp tục/huỷ hoạt động; tải về và chia sẻ thành công, hash khớp với tệp gốc.
- Share-in từ app khác (ảnh từ Gallery, tệp từ Files) hoạt động trên API 29 và API mới nhất.

---

### M7 — Mã hoá đầu-cuối và khoá app
**Mục tiêu**: bật mã hoá không đánh mất khả năng khôi phục; app có khoá sinh trắc học.
Tham chiếu: SPEC §12, FR-SEC-1,2,4, FR-ONB-4.

Tasks
- [x] **M7-1** ✅ 2026-11-28 — `CryptoScheme`/`NodeCipher`/`CryptoManager`; scrypt N=2^15,r=8,p=1 → DECISIONS.md `core/crypto`: tạo/bọc/mở master key (Keystore + Tink), dẫn xuất khoá từ passphrase (Argon2id hoặc scrypt; ghi tham số vào `DECISIONS.md`), đóng gói `wrappedMasterKey` và `kdf` params (kiểu dữ liệu sẽ được M8 đưa vào `header` snapshot).
- [x] **M7-2** ✅ 2026-11-28 — `EncryptingChunkSource` + wire Upload/DownloadEngine + tên `.tgv` opaque; player giải mã qua NodeStreamDataSource `CipherTransform` dùng `AesGcmHkdfStreaming` (segment 1 MiB), AAD = `nodeId ‖ idx ‖ chunkCount`; nối vào `UploadEngine`/`DownloadEngine` qua `ChunkTransform` (M2-4); đặt tên tệp/caption mờ khi mã hoá (SPEC §10.2).
- [x] **M7-3** ✅ 2026-11-28 — CryptoSchemeTest/NodeCipherTest/EncryptingChunkSourceTest (khứ hồi, sai passphrase/AAD, đảo chunk, cắt cụt, size bound) Test mã hoá: khứ hồi, sai passphrase, sai AAD, chunk bị đảo thứ tự/cắt cụt, kích thước bản mã ≤ chunk + vài trăm byte và < 20.000.000 byte; test engine với `CipherTransform`.
- [x] **M7-4** ✅ 2026-11-28 — step ENCRYPTION trong onboarding + Settings toggle (tắt không mã hoá lại tệp cũ) UI bước "Mã hoá" trong onboarding (đặt passphrase, nhập lại, tick xác nhận cảnh báo mất dữ liệu) và mục Cài đặt (bật/tắt cho tệp mới, ghi chú không mã hoá lại tệp cũ).
- [x] **M7-5** ✅ 2026-11-28 — AppLockManager (PIN scrypt, timeout nền, clear cache), LockScreen + BiometricPrompt, FLAG_SECURE Khoá app: `BiometricPrompt`/PIN thiết bị, timeout cấu hình, màn hình khoá, `FLAG_SECURE` (SPEC FR-SEC-4); xoá cache giải mã khi khoá.
- [x] **M7-6** ✅ 2026-11-28 — AppLockManagerTest (Robolectric: PIN/timeout/lock-on-start); đánh giá thủ công còn lại cho người dùng Test UI luồng đặt passphrase và khoá app; đánh giá thủ công trên máy thật.

Acceptance
- Upload tệp có mã hoá → xem nội dung chunk trên Telegram là dữ liệu ngẫu nhiên; tải về giải mã đúng, hash khớp.
- Sửa một byte của chunk (trong test) → giải mã thất bại, không ghi ra dữ liệu sai.
- App khoá khi vào nền quá thời gian đã đặt; recent apps không lộ nội dung khi `FLAG_SECURE` bật.

---

### M8 — Sao lưu và khôi phục index
**Mục tiêu**: mất máy vẫn khôi phục được danh mục tệp.
Tham chiếu: SPEC §11, FR-IDX-*, FR-ONB-5.

Tasks
- [x] **M8-1** ✅ 2026-11-28 — `IndexSnapshotCodec` (writer/reader theo SPEC §11): magic `TGSN`, version, header JSON (revision, mã hoá, kdf), payload kotlinx.serialization + gzip, mã hoá AesGcmHkdfStreaming nếu bật; parseManifest prefix `#tgvault-index`; 7 test khứ hồi/sai magic/sai version/snapshot 10000 node.
- [x] **M8-2** ✅ 2026-11-28 — `IndexBackupManager` (@Singleton): mutex, encrypt khi encryptionEnabled, tách parts theo chunkSizeBytes, sendDocument từng part, manifest text ghim, unpin + xoá bản prevPrev (giữ 2 phiên bản); `TgVaultApp.watchIndexBackup` debounce 10 phút trên revision.
- [x] **M8-3** ✅ 2026-11-28 — `RootViewModel` so cloudRevision vs localRevision khi mở app → `_cloudNewerRevision`; `CloudNewerDialog` trong MainActivity (khôi phục / giữ bản máy, passphrase ngay trong dialog).
- [x] **M8-4** ✅ 2026-11-28 — `restoreFromPinned`: getChat().pinnedMessageId → parseManifest → tải/ghép parts → verify SHA-256 + size → (passphrase nếu có kdf; sai → WrongPassphrase; importMasterKey) → ghi đè Room trong 1 transaction; không ghi tới khi snapshot đủ + khớp.
- [x] **M8-5** ✅ 2026-11-28 — Cài đặt: section "Sao lưu index" (lần cuối formatted, Sao lưu ngay, Khôi phục + dialog passphrase + thông báo kết quả); Onboarding thêm step RESTORE sau verify quyền (restore hoặc bỏ qua).
- [x] **M8-6** ✅ 2026-11-28 — E2E Robolectric + FakeTelegramGateway: backup → xoá DB → restore → so sánh node/chunk; giữ 2 phiên bản (r5 xoá, r6+r7 còn); restore không pinned → NotFound.

Acceptance
- Xoá dữ liệu app (hoặc cài lại), chọn "Khôi phục từ Telegram" với cùng token + channel → thấy lại toàn bộ cây thư mục; tải được tệp (có và không mã hoá).
- Khi không có bản sao lưu hoặc manifest hỏng: thông báo rõ ràng, không làm hỏng dữ liệu cục bộ hiện có.

---

### M9 — Xem trước, thumbnail, thùng rác, tìm kiếm hoàn chỉnh
Tham chiếu: FR-PRV-*, FR-FILE-5,6.

Tasks
- [x] **M9-1** ✅ 2026-11-28 — `ThumbnailCache` (2 tầng: LruCache + `cacheDir/thumbnails/*.webp`, ≤320px WebP; chỉ ảnh ≤1 chunk; mã hoá → NodeCipher, không mở khoá → null); Coil `NodeThumbnailFetcher` + `AsyncImage` trong `FilesScreen`; 6 test Robolectric (decode PNG 800×600→320, không ảnh/nhiều chunk/no fileId/no-key → null, ảnh nhỏ giữ nguyên). Thumbnail ảnh cục bộ (tối đa 320 px, WebP), cache trong `cacheDir`; tải bằng Coil với `Fetcher` riêng cho Node (tải chunk đầu nếu ảnh ≤ 1 chunk; tệp lớn hơn: dùng icon); sinh thumbnail khi upload để khỏi tải lại.
- [x] **M9-2** ✅ 2026-11-28 — `PreviewViewModel`/`PreviewScreen`: ảnh full-res (pinch-zoom + pan + double-tap), văn bản ≤1MiB đầu (truncated flag), PDF qua PdfRenderer (tối đa 10 trang, scale 2x); route `preview/{nodeId}` phân theo MimeKind (VIDEO/AUDIO→player, còn lại→preview); giải mã chunk giống pipeline truyền tải. Xem trước ảnh (zoom/pan, shared element từ thumbnail, vuốt xuống để đóng), văn bản (≤ 1 MiB đầu tệp), PDF (`PdfRenderer`); loại khác → màn hình tải về + "Mở bằng…". **Cập nhật**: video/audio đã có player streaming trong app (xem mục backlog #4 đã thực hiện); "Mở bằng…" chỉ còn áp dụng cho zip/loại không xem trước được.
- [x] **M9-3** ✅ 2026-11-28 — Tab THÙNG RÁC (TopLevelDestination.TRASH); `TrashScreen`/`TrashViewModel`: liệt kê trashRoots, khôi phục (restoreFromTrash cả cây con), xoá vĩnh viễn (deletePermanently + confirm), banner 30 ngày; `TrashCleanupWorker` periodic 6h gọi purgeExpiredTrash(30 ngày). Thùng rác đầy đủ: liệt kê theo `trashRootId`, khôi phục (khôi phục cả cây con), xoá vĩnh viễn (qua M2-7), dọn tự động > 30 ngày (một Worker định kỳ), banner thông tin.
- [x] **M9-4** ✅ 2026-11-28 — tìm kiếm toàn drive hiển thị đường dẫn thư mục cha (`searchPaths` trong FilesUiState + dòng path trong NodeRow khi đang search); NameNormalizer (lowercase, bỏ dấu kể cả đ/Đ qua NFD) và loại mục trong thùng rác (trashedAt IS NULL) đã có sẵn từ M5. Hoàn thiện tìm kiếm (toàn drive, hiển thị đường dẫn thư mục cha, bỏ dấu tiếng Việt, kết quả không gồm mục trong thùng rác).
- [ ] **M9-5** Test: thumbnail pipeline, khôi phục/xoá cây thư mục, Worker dọn thùng rác, UI xem trước.

Acceptance
- Ảnh hiển thị thumbnail nhanh sau lần đầu; xem trước PDF/văn bản hoạt động offline sau khi đã tải vào cache.
- Xoá thư mục có tệp → vào thùng rác 1 mục → khôi phục thì cả cây trở lại đúng vị trí; "Xoá vĩnh viễn" xoá hết chunk (hoặc ghi `ORPHANED` theo SPEC §10.4).

---

### M10 — Hoàn thiện và phát hành
Tham chiếu: SPEC §15–16, §18.

Tasks
- [ ] **M10-1** Rà soát toàn bộ animation theo bảng §15.4 (thời lượng, `MotionSpecs`, giảm chuyển động); đo jank bằng Macrobenchmark hoặc `FrameTimingMetric` trên danh sách + onboarding; sửa chỗ giật.
- [ ] **M10-2** Accessibility: TalkBack, cỡ chữ 200%, tương phản, `contentDescription`, vùng chạm 48 dp (SPEC §15.5).
- [ ] **M10-3** i18n: kiểm tra đủ chuỗi `en`/`vi`, định dạng kích thước/ngày theo locale, pluralization.
- [ ] **M10-4** Hiệu năng/bộ nhớ: profile upload/download tệp lớn, kiểm tra không rò rỉ (LeakCanary ở debug), tối ưu kích thước APK (R8, loại tài nguyên thừa).
- [ ] **M10-5** Bảo mật cuối: rà soát log, `allowBackup`, cleartext, quyền `AndroidManifest`, xác nhận không có analytics.
- [ ] **M10-6** Màn hình "Giới thiệu & giấy phép", điều khoản/ghi chú rủi ro (SPEC §5), icon app và splash chính thức.
- [ ] **M10-7** Cấu hình ký bản phát hành (`keystore` do chủ dự án giữ, KHÔNG commit), tạo AAB/APK release, danh sách kiểm thử cuối (checklist) ghi vào `docs/RELEASE_CHECKLIST.md`.
- [ ] **M10-8** README cho người dùng (cách tạo bot/channel) và cho nhà phát triển (build, test, test live).

Acceptance
- Checklist phát hành hoàn tất, bản release chạy sạch trên ≥ 2 thiết bị/emulator (API 29 và API mới nhất).
- Không còn Blocker trong báo cáo review chéo cuối.

---

## 3. Backlog sau MVP (đề xuất, chưa cam kết)

1. **Local Bot API server** (tuỳ chọn, người dùng tự host): bỏ giới hạn 20 MB khi tải, chunk lớn hơn, nhanh hơn rất nhiều.
2. **Backend TDLib** (đăng nhập bằng tài khoản người dùng): khôi phục danh mục bằng cách quét lịch sử channel, tệp lớn hơn trên mỗi tin nhắn; đổi lại cần thư viện native, `api_id/api_hash`, và rủi ro điều khoản khi tự động hoá tài khoản người dùng.
3. Tự động sao lưu ảnh/thư mục (lịch, Wi-Fi/sạc, mẫu loại trừ).
4. ~~Phát video/audio streaming từ chunk (ExoPlayer + `DataSource` tuỳ biến, Range theo chunk)~~ **ĐÃ LÀM SỚM (2026-11-27, theo yêu cầu người dùng)**: `NodeStreamDataSource` + PlayerScreen; xem DECISIONS 2026-11-27. Tương tác duy nhất với các mốc còn lại: **M7 mã hoá** sẽ cần lớp giải mã xen giữa trước khi đưa bytes cho ExoPlayer.
5. Nhiều drive/nhiều channel; widget; chia sẻ giữa nhiều người (kênh/nhóm chung).
6. Layout máy tính bảng nâng cao, drag & drop, kéo thả giữa thư mục.
7. Tìm kiếm toàn văn (FTS5), thẻ (tag), mục yêu thích.
8. Tối ưu trùng lặp (deduplicate theo SHA-256).

---

## Phụ lục A — Nội dung gợi ý cho `AGENTS.md` (đặt ở gốc repo)

```markdown
# AGENTS.md

## Dự án
TgVault: app Android (Kotlin, Compose, Material 3) dùng Telegram Bot API làm nơi lưu trữ tệp.
Nguồn sự thật: SPEC.md (yêu cầu), PLAN.md (thứ tự làm), docs/DECISIONS.md (quyết định lệch SPEC),
docs/PROGRESS.md (trạng thái), docs/TELEGRAM_FINDINGS.md (kết quả thử Telegram thật).

## Lệnh
- Kiểm tra đầy đủ: ./gradlew ktlintCheck detekt lintDebug testDebugUnitTest assembleDebug
- Test thiết bị: ./gradlew connectedDebugAndroidTest
- Test Telegram thật (cần token/channel trong local.properties): ./gradlew testDebugUnitTest -PrunTelegramLive=true

## Quy ước
- Kiến trúc: feature → domain ← data. Domain không phụ thuộc Android framework.
- Mọi truy cập Telegram qua interface TelegramGateway. Không gọi Retrofit trực tiếp từ nơi khác.
- Không đọc nguyên chunk vào RAM; stream. Chunk tối đa 19 MiB.
- Không log bot token. Không hard-code chuỗi UI (strings.xml, có en + vi).
- Animation dùng MotionSpecs (core/designsystem/Motion.kt); phải tôn trọng giảm chuyển động.
- Không tự viết crypto; dùng Tink. Không commit keystore, local.properties, token.
- Mỗi task một commit nhỏ (Conventional Commits). Không refactor ngoài phạm vi task.

## Khi bế tắc
Ghi vào docs/DECISIONS.md (vấn đề, phương án, lựa chọn, lý do) rồi tiếp tục; không đổi SPEC âm thầm.
```

## Phụ lục B — Danh sách tệp tài liệu cần có trong repo

```
/SPEC.md
/PLAN.md
/AGENTS.md
/README.md                      (M10-8)
/docs/DECISIONS.md              (M0-7)
/docs/PROGRESS.md               (M0-7)
/docs/TELEGRAM_FINDINGS.md      (M0-7, điền ở M1 và M8)
/docs/RELEASE_CHECKLIST.md      (M10-7)
```