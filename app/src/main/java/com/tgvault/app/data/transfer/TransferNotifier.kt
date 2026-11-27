package com.tgvault.app.data.transfer

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.work.ForegroundInfo
import com.tgvault.app.MainActivity
import com.tgvault.app.R
import com.tgvault.app.domain.model.Transfer
import com.tgvault.app.domain.model.TransferDirection
import com.tgvault.app.domain.model.TransferState
import com.tgvault.app.domain.repository.NodeRepository
import com.tgvault.app.domain.repository.TransferRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import timber.log.Timber
import java.util.concurrent.atomic.AtomicLong
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Thông báo truyền tải (M3-3, FR-TR-5):
 * - Một thông báo GỘP đang chạy (id cố định), cập nhật tối đa 1 lần/giây.
 * - Thông báo riêng khi hoàn tất/lỗi (tự ẩn khi bấm), bấm mở app.
 * - Không gọi notify khi chưa có quyền POST_NOTIFICATIONS (API 33+) — worker vẫn chạy bình thường.
 */
@Singleton
class TransferNotifier
    @Inject
    constructor(
        @ApplicationContext private val context: Context,
        private val transferRepository: TransferRepository,
        private val nodeRepository: NodeRepository,
    ) {
        private val manager = context.getSystemService(NotificationManager::class.java)
        private val lastSummaryAt = AtomicLong(0L)
        private var scope: CoroutineScope? = null

        /** Gọi từ Application.onCreate — theo dõi hàng đợi và cập nhật thông báo gộp. */
        fun start(scope: CoroutineScope) {
            this.scope = scope
            ensureChannels()
            scope.launch {
                transferRepository.observeActive().collectLatest { active ->
                    updateSummary(active)
                }
            }
        }

        /** ForegroundInfo cho TransferWorker (FGS loại dataSync — FR-TR-1). */
        fun buildSummaryForegroundInfo(): ForegroundInfo {
            ensureChannels()
            return ForegroundInfo(
                SUMMARY_NOTIFICATION_ID,
                buildSummaryNotification(emptyList()),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
            )
        }

        fun notifyDone(transfer: Transfer) {
            launchSafe {
                val name = nodeRepository.getNode(transfer.nodeId)?.name ?: transfer.nodeId
                val titleRes =
                    if (transfer.direction == TransferDirection.UPLOAD) {
                        R.string.notif_upload_done_title
                    } else {
                        R.string.notif_download_done_title
                    }
                post(
                    DONE_BASE_ID + transfer.id.hashCode(),
                    NotificationCompat.Builder(context, CHANNEL_ALERTS)
                        .setSmallIcon(android.R.drawable.stat_sys_upload_done)
                        .setContentTitle(context.getString(titleRes))
                        .setContentText(name)
                        .setAutoCancel(true)
                        .setContentIntent(openAppIntent())
                        .build(),
                )
            }
        }

        fun notifyError(transfer: Transfer) {
            launchSafe {
                val name = nodeRepository.getNode(transfer.nodeId)?.name ?: transfer.nodeId
                post(
                    DONE_BASE_ID + transfer.id.hashCode(),
                    NotificationCompat.Builder(context, CHANNEL_ALERTS)
                        .setSmallIcon(android.R.drawable.stat_notify_error)
                        .setContentTitle(context.getString(R.string.notif_error_title))
                        .setContentText(name)
                        .setAutoCancel(true)
                        .setContentIntent(openAppIntent())
                        .build(),
                )
            }
        }

        private fun launchSafe(block: suspend () -> Unit) {
            val s = scope ?: return
            s.launch {
                try {
                    block()
                } catch (e: Exception) {
                    Timber.w(e, "không đăng được thông báo")
                }
            }
        }

        private fun updateSummary(active: List<Transfer>) {
            if (active.isEmpty()) {
                manager?.cancel(SUMMARY_NOTIFICATION_ID)
                return
            }
            // FR-TR-5: tối đa 1 lần/giây
            val now = System.currentTimeMillis()
            val last = lastSummaryAt.get()
            if (now - last < SUMMARY_MIN_INTERVAL_MS) return
            if (!lastSummaryAt.compareAndSet(last, now)) return
            post(SUMMARY_NOTIFICATION_ID, buildSummaryNotification(active))
        }

        private fun buildSummaryNotification(active: List<Transfer>): Notification {
            val running = active.filter { it.state == TransferState.RUNNING }
            val uploads = running.count { it.direction == TransferDirection.UPLOAD }
            val downloads = running.size - uploads
            val progress =
                running
                    .filter { it.bytesTotal > 0 }
                    .let { list ->
                        if (list.isEmpty()) {
                            0f
                        } else {
                            list.sumOf { it.bytesDone }.toFloat() / list.sumOf { it.bytesTotal }
                        }
                    }
            val text =
                context.getString(
                    R.string.notif_summary_text,
                    uploads,
                    downloads,
                    (progress * 100).toInt(),
                )
            return NotificationCompat.Builder(context, CHANNEL_PROGRESS)
                .setSmallIcon(android.R.drawable.stat_sys_upload)
                .setContentTitle(context.getString(R.string.notif_summary_title))
                .setContentText(text)
                .setProgress(100, (progress * 100).toInt(), active.isEmpty())
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(openAppIntent())
                .build()
        }

        private fun openAppIntent(): PendingIntent {
            val intent = Intent(context, MainActivity::class.java)
            return PendingIntent.getActivity(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        private fun post(
            id: Int,
            notification: Notification,
        ) {
            // API 33+: chưa có quyền thì bỏ qua lặng lẽ (luồng xin quyền ở M6-2)
            if (
                Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                return
            }
            try {
                manager?.notify(id, notification)
            } catch (e: SecurityException) {
                Timber.w(e, "thiếu quyền thông báo")
            }
        }

        private fun ensureChannels() {
            val nm = manager ?: return
            if (nm.getNotificationChannel(CHANNEL_PROGRESS) == null) {
                nm.createNotificationChannel(
                    NotificationChannel(
                        CHANNEL_PROGRESS,
                        context.getString(R.string.notif_channel_progress),
                        NotificationManager.IMPORTANCE_LOW,
                    ),
                )
            }
            if (nm.getNotificationChannel(CHANNEL_ALERTS) == null) {
                nm.createNotificationChannel(
                    NotificationChannel(
                        CHANNEL_ALERTS,
                        context.getString(R.string.notif_channel_alerts),
                        NotificationManager.IMPORTANCE_DEFAULT,
                    ),
                )
            }
        }

        companion object {
            const val SUMMARY_NOTIFICATION_ID = 1
            const val CHANNEL_PROGRESS = "transfers_progress"
            const val CHANNEL_ALERTS = "transfers_alerts"
            private const val DONE_BASE_ID = 1000
            private const val SUMMARY_MIN_INTERVAL_MS = 1_000L
        }
    }
