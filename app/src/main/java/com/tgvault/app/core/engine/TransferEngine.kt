package com.tgvault.app.core.engine

/** Seam cho TransferWorker/test: một engine biết chạy transfer tới trạng thái cuối. */
interface TransferEngine {
    /** Chạy tới khi DONE/FAILED/CANCELLED/PAUSED. Trả true nếu DONE. */
    suspend fun run(transferId: String): Boolean
}

@javax.inject.Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class UploadTransferEngine

@javax.inject.Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class DownloadTransferEngine
