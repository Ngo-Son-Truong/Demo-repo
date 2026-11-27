# TELEGRAM_FINDINGS.md — Kết quả kiểm thử Telegram thật

> Điền khi chạy bộ test live: `./gradlew testDebugUnitTest -PrunTelegramLive=true`
> (yêu cầu `tgvault.botToken` + `tgvault.chatId` trong `local.properties`, bot là admin của channel test).
> CI tự chạy khi repo có secrets `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHANNEL_ID`.
> Mỗi câu hỏi: kết luận · ngày chạy · bằng chứng (log trích). Tham chiếu SPEC §5, PLAN M1-7.

| # | Câu hỏi | Kết luận |
|---|---|---|
| 1 | Gửi chunk 19 MiB qua `sendDocument` → `getFile` tải lại được không? `file_path`? tốc độ? | ✅ OK (2026-11-27, CI): upload 2.55 MB/s, download 11.88 MB/s, `file_path=documents/file_0.bin` |
| 2 | `file_id` có tải lại được sau khi khởi động lại app / ngày hôm sau không? | 🟡 Ngay sau upload: OK (2026-11-27). Xuyên ngày: CHƯA KIỂM TRA — chạy lại với `-Dtgvault.knownFileId=BQACAgUAAyEGAAMBVR5yjgADKGsJKKpGyUqKhyAyGlKIE5G7KZUoAALwIgACXKFQVOJqI2g4Vv_JPQQ` |
| 3 | `deleteMessage` với tin vừa gửi? Với tin cũ hơn 48 giờ? | 🟡 Tin mới: Deleted (2026-11-27). Tin >48h: CHƯA KIỂM TRA — tin test `message_id=39`, chạy lại sau 48h với `-Dtgvault.oldMessageId=39` |
| 4 | Gửi liên tiếp 30 chunk nhỏ: có bị 429 không? `retry_after` thực tế cho channel? | ✅ 30/30 chunk 32 KiB trong 77.2s (limiter pace 1,1s/lệnh), KHÔNG gặp 429 (2026-11-27) |
| 5 | `pinChatMessage` + `getChat().pinned_message`? Ghim nhiều tin thì `getChat` trả tin nào? | ✅ OK (2026-11-27): ghim được; `pinned_message` trả về tin MỚI NHẤT được ghim |
| 6 | Header `Range` khi tải file có được hỗ trợ (HTTP 206) không? | ✅ ĐƯỢC hỗ trợ (2026-11-27): HTTP 206, 10 byte đầu khớp dữ liệu gốc → resume download dùng Range an toàn |

## Ghi chú thêm
- Bằng chứng đầy đủ: release `ci-debug` → phần "Telegram live findings" trong release notes.
- Bot test là admin channel test; token nằm trong GitHub secrets (sẽ thu hồi/thay sau đợt test).
- Q2b/Q3b là test 2 lượt cách thời gian — lần chạy đầu đã in tham số cần truyền cho lần sau (cột kết luận).
