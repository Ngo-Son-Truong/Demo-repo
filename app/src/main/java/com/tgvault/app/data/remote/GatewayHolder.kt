package com.tgvault.app.data.remote

import com.tgvault.app.core.common.AppError
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Giữ TelegramGateway hiện hành. M4 (onboarding) tạo gateway với BotTokenProvider an toàn
 * rồi gọi [set]; các tầng khác (repository/engine) dùng [current] — không phụ thuộc vào
 * thời điểm token sẵn sàng trong DI graph.
 */
@Singleton
class GatewayHolder
    @Inject
    constructor() {
        @Volatile
        private var gateway: TelegramGateway? = null

        fun set(value: TelegramGateway) {
            gateway = value
        }

        fun clear() {
            gateway = null
        }

        fun current(): TelegramGateway =
            gateway ?: throw AppError.NotConnected("chưa kết nối Telegram — cần hoàn tất onboarding (M4)")
    }
