package com.tgvault.app.domain.repository

import com.tgvault.app.domain.model.Transfer
import kotlinx.coroutines.flow.Flow

/** Hàng đợi truyền tải (SPEC §8/§13). */
interface TransferRepository {
    /** Tất cả, sắp xếp: RUNNING/QUEUED/PAUSED trước, lỗi và hoàn tất sau. */
    fun observeAll(): Flow<List<Transfer>>

    /** Đang hoạt động (QUEUED/RUNNING/PAUSED) — cho thanh tiến độ mini (M6). */
    fun observeActive(): Flow<List<Transfer>>

    fun observeById(id: String): Flow<Transfer?>

    suspend fun getById(id: String): Transfer?

    suspend fun setPaused(
        id: String,
        paused: Boolean,
    )

    suspend fun cancel(id: String)

    /** Thử lại tác vụ FAILED/CANCELLED → QUEUED. */
    suspend fun retry(id: String)

    /** Id các tác vụ QUEUED (phục hồi khi khởi động — M3-5). */
    suspend fun queuedIds(): List<String>

    /** Worker bị hệ thống dừng → đưa về QUEUED (WorkManager tự chạy lại khi đủ constraint). */
    suspend fun requeue(id: String)

    /** M3-5: RUNNING mồ côi (app bị kill) → QUEUED. Trả về số tác vụ đã đưa về hàng đợi. */
    suspend fun requeueOrphanedRunning(): Int

    /** Xoá các bản ghi DONE/CANCELLED (dọn tab Truyền tải). */
    suspend fun clearFinished()
}
