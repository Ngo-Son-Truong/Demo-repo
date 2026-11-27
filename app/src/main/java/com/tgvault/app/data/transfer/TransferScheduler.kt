package com.tgvault.app.data.transfer

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.tgvault.app.domain.repository.ConfigRepository
import com.tgvault.app.domain.repository.TransferRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import timber.log.Timber
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * API điều khiển hàng đợi truyền tải (M3-1) — tầng UI/domain gọi vào đây, KHÔNG gọi
 * WorkManager trực tiếp. Unique work theo transferId; REPLACE = "bảo là phải chạy"
 * (enqueue/resume/retry đều an toàn khi work cũ đã kết thúc).
 */
@Singleton
class TransferScheduler
    @Inject
    constructor(
        @ApplicationContext context: Context,
        private val transferRepository: TransferRepository,
        private val configRepository: ConfigRepository,
    ) {
        private val workManager = WorkManager.getInstance(context)

        /** Đưa transfer (đã QUEUED trong Room) vào WorkManager với constraint mạng theo cài đặt. */
        suspend fun enqueue(transferId: String) {
            val wifiOnly = configRepository.current().wifiOnly
            val constraints =
                Constraints.Builder()
                    .setRequiredNetworkType(
                        if (wifiOnly) NetworkType.UNMETERED else NetworkType.CONNECTED,
                    )
                    .build()
            val request =
                OneTimeWorkRequestBuilder<TransferWorker>()
                    .setInputData(workDataOf(TransferWorker.KEY_TRANSFER_ID to transferId))
                    .setConstraints(constraints)
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_SECONDS, TimeUnit.SECONDS)
                    .build()
            workManager.enqueueUniqueWork(
                TransferWorker.workName(transferId),
                ExistingWorkPolicy.REPLACE,
                request,
            )
        }

        /** Tạm dừng: engine dừng ở ranh giới chunk kế tiếp (FR-TR-2). */
        suspend fun pause(transferId: String) = transferRepository.setPaused(transferId, true)

        suspend fun resume(transferId: String) {
            transferRepository.setPaused(transferId, false)
            enqueue(transferId)
        }

        suspend fun cancel(transferId: String) {
            transferRepository.cancel(transferId)
            workManager.cancelUniqueWork(TransferWorker.workName(transferId))
        }

        suspend fun retry(transferId: String) {
            transferRepository.retry(transferId)
            enqueue(transferId)
        }

        /** M3-5: khi app khởi động — RUNNING mồ côi → QUEUED, enqueue lại toàn bộ hàng đợi. */
        suspend fun recoverOrphaned() {
            val requeued = transferRepository.requeueOrphanedRunning()
            if (requeued > 0) Timber.i("đưa %d transfer RUNNING mồ côi về QUEUED", requeued)
            for (id in transferRepository.queuedIds()) {
                enqueue(id)
            }
        }

        private companion object {
            const val BACKOFF_SECONDS = 30L
        }
    }
