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
