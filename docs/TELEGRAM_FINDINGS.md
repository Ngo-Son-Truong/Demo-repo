# TELEGRAM_FINDINGS.md — Kết quả kiểm thử Telegram thật

> Điền khi chạy bộ test live: `./gradlew testDebugUnitTest -PrunTelegramLive=true`
> (yêu cầu `tgvault.botToken` + `tgvault.chatId` trong `local.properties`, bot là admin của channel test).
> Mỗi câu hỏi: kết luận · ngày chạy · bằng chứng (log trích). Tham chiếu SPEC §5, PLAN M1-7.

| # | Câu hỏi | Kết luận |
|---|---|---|
| 1 | Gửi chunk 19 MiB qua `sendDocument` → `getFile` tải lại được không? `file_path`? tốc độ? | ⬜ Chưa chạy |
| 2 | `file_id` có tải lại được sau khi khởi động lại app / ngày hôm sau không? | ⬜ Chưa chạy |
| 3 | `deleteMessage` với tin vừa gửi? Với tin cũ hơn 48 giờ? (để lại 1 tin test, kiểm tra sau) | ⬜ Chưa chạy |
| 4 | Gửi liên tiếp 30 chunk nhỏ: có bị 429 không? `retry_after` thực tế cho channel? | ⬜ Chưa chạy |
| 5 | `pinChatMessage` + `getChat().pinned_message`? Ghim nhiều tin thì `getChat` trả tin nào? | ⬜ Chưa chạy |
| 6 | Header `Range` khi tải file có được hỗ trợ (HTTP 206) không? | ⬜ Chưa chạy |

## Ghi chú thêm
- (điền phát hiện khác: giới hạn thực tế, lỗi lạ, chênh lệch tài liệu…)
