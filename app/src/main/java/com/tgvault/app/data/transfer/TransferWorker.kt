package com.tgvault.app.data.transfer

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.tgvault.app.core.engine.DownloadTransferEngine
import com.tgvault.app.core.engine.TransferEngine
import com.tgvault.app.core.engine.UploadTransferEngine
import com.tgvault.app.domain.model.TransferDirection
import com.tgvault.app.domain.model.TransferState
import com.tgvault.app.domain.repository.TransferRepository
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CancellationException
import timber.log.Timber

/**
 * Worker cho MỘT transfer (M3-1): chọn engine theo direction, foreground service dataSync.
 *
 * Vòng đời trạng thái (Room là source of truth):
 * - Worker chỉ chạy transfer QUEUED; engine tự set RUNNING/DONE/FAILED/CANCELLED.
 * - PAUSED: engine ném TransferPausedException ở ranh giới chunk → worker kết thúc êm,
 *   trạng thái giữ PAUSED cho tới khi người dùng Tiếp tục (enqueue lại).
 * - Hệ thống dừng worker (mất constraint Wi-Fi, timeout FGS dataSync, process bị kill):
 *   coroutine bị huỷ → DB về QUEUED, WorkManager tự lên lịch lại theo constraint (M3-4).
 * - User huỷ: DB đã CANCELLED trước → worker không đụng trạng thái nữa.
 */
class TransferWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    @EntryPoint
    @InstallIn(SingletonComponent::class)
    interface Deps {
        @UploadTransferEngine
        fun uploadEngine(): TransferEngine

        @DownloadTransferEngine
        fun downloadEngine(): TransferEngine

        fun transferRepository(): TransferRepository

        fun notifier(): TransferNotifier

        fun concurrency(): TransferConcurrency
    }

    override suspend fun doWork(): Result {
        val id = inputData.getString(KEY_TRANSFER_ID) ?: return Result.failure()
        val deps = deps(applicationContext)
        val repo = deps.transferRepository()
        val transfer = repo.getById(id) ?: return Result.failure()

        // Worker mới chỉ chạy QUEUED (hoặc RUNNING mồ côi vừa requeue). PAUSED/CANCELLED/DONE/FAILED → thoát êm.
        if (transfer.state != TransferState.QUEUED && transfer.state != TransferState.RUNNING) {
            Timber.d("transfer %s ở trạng thái %s — worker thoát", id, transfer.state)
            return Result.success()
        }

        val notifier = deps.notifier()
        setForeground(notifier.buildSummaryForegroundInfo())

        val engine =
            when (transfer.direction) {
                TransferDirection.UPLOAD -> deps.uploadEngine()
                TransferDirection.DOWNLOAD -> deps.downloadEngine()
            }

        return try {
            deps.concurrency().withPermit(transfer.direction) {
                engine.run(id)
            }
            when (repo.getById(id)?.state) {
                TransferState.DONE -> notifier.notifyDone(repo.getById(id)!!)
                TransferState.FAILED -> notifier.notifyError(repo.getById(id)!!)
                else -> Unit // PAUSED/CANCELLED: người dùng chủ động — không thông báo
            }
            Result.success()
        } catch (ce: CancellationException) {
            // System stop hoặc user cancel (WorkManager cancelUniqueWork)
            val state = repo.getById(id)?.state
            if (state != TransferState.CANCELLED) {
                // Hệ thống dừng (mất Wi-Fi/timeout/kill): đưa về QUEUED — WM tự chạy lại khi đủ constraint
                Timber.d("transfer %s bị dừng bởi hệ thống → QUEUED", id)
                repo.requeue(id)
            }
            throw ce
        }
    }

    companion object {
        const val KEY_TRANSFER_ID = "transferId"

        fun workName(transferId: String) = "transfer_$transferId"

        /** Test override — mặc định lấy từ Hilt EntryPoint. */
        @Volatile
        internal var depsOverride: Deps? = null

        private fun deps(context: Context): Deps =
            depsOverride
                ?: EntryPointAccessors.fromApplication(context.applicationContext, Deps::class.java)
    }
}
