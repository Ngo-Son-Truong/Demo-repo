package com.tgvault.app.data.transfer

import com.tgvault.app.domain.model.TransferDirection
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Cổng song song toàn process (M3-2): upload tuần tự (engine resume theo tiền tố chunk),
 * download tối đa [TransferConcurrency.maxDownloads] tác vụ (mặc định 2 — SPEC §13).
 * Worker cùng chạy trong 1 process nên Semaphore ở đây là đủ; process chết → semaphore mới
 * cùng trạng thái sạch.
 */
@Singleton
class TransferConcurrency
    @Inject
    constructor() {
        private val uploadGate = Semaphore(MAX_UPLOADS)
        private val downloadGate = Semaphore(MAX_DOWNLOADS)

        suspend fun <T> withPermit(
            direction: TransferDirection,
            block: suspend () -> T,
        ): T =
            when (direction) {
                TransferDirection.UPLOAD -> uploadGate.withPermit { block() }
                TransferDirection.DOWNLOAD -> downloadGate.withPermit { block() }
            }

        companion object {
            const val MAX_UPLOADS = 1
            const val MAX_DOWNLOADS = 2
        }
    }
