package com.tgvault.app.data.transfer

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.tgvault.app.domain.repository.NodeRepository
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import timber.log.Timber
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * M9-3: dọn thùng rác định kỳ — xoá vĩnh viễn các nút gốc quá 30 ngày (FR-FILE-4, SPEC §8).
 * PeriodicWorkRequest tối thiểu 15 phút; đặt 6 giờ để tiết kiệm pin.
 */
class TrashCleanupWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    @EntryPoint
    @InstallIn(SingletonComponent::class)
    interface Deps {
        fun nodeRepository(): NodeRepository
    }

    override suspend fun doWork(): Result {
        val nodeRepository =
            EntryPointAccessors.fromApplication(applicationContext, Deps::class.java).nodeRepository()
        val purged =
            runCatching { nodeRepository.purgeExpiredTrash(TTL_MILLIS) }
                .onFailure { Timber.w(it, "purgeExpiredTrash lỗi") }
                .getOrElse { return Result.retry() }
        if (purged > 0) Timber.d("đã xoá vĩnh viễn $purged mục hết hạn trong thùng rác")
        return Result.success()
    }

    companion object {
        const val WORK_NAME = "trash_cleanup_periodic"
        const val TTL_MILLIS = 30L * 24 * 60 * 60 * 1000
        private const val INTERVAL_HOURS = 6L
    }
}

@Singleton
class TrashCleanupScheduler
    @Inject
    constructor(
        @ApplicationContext context: Context,
    ) {
        private val workManager by lazy {
            runCatching { WorkManager.getInstance(context) }.getOrNull()
        }

        /** Gọi một lần khi app khởi động — KEEP để không xếp chồng. */
        fun schedule() {
            val wm = workManager ?: return
            val constraints =
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
            val request =
                PeriodicWorkRequestBuilder<TrashCleanupWorker>(TrashCleanupWorker.INTERVAL_HOURS, TimeUnit.HOURS)
                    .setConstraints(constraints)
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.MINUTES)
                    .build()
            wm.enqueueUniquePeriodicWork(
                TrashCleanupWorker.WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
        }
    }
