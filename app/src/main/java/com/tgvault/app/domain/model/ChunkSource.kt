package com.tgvault.app.domain.model

import java.io.OutputStream

/**
 * Một lát cắt của nguồn (tệp/Uri) được phát trực tiếp (streaming) — SPEC §9.1.
 * Ở domain vì cả gateway (data/remote) lẫn engine (data/transfer) cùng dùng (xem DECISIONS 2026-11-26).
 *
 * QUY TẮC BẮT BUỘC: KHÔNG đọc nguyên chunk vào RAM.
 */
interface ChunkSource {
    /** Số byte sẽ ghi ra (để OkHttp đặt Content-Length, tránh buffer). */
    val length: Long

    /**
     * Ghi toàn bộ dữ liệu ra [sink] (blocking — OkHttp gọi trên thread IO).
     * Implementation PHẢI mở stream mới mỗi lần gọi (OkHttp có thể gọi lại khi retry/redirect).
     */
    fun writeTo(
        sink: OutputStream,
        onProgress: (bytesWritten: Long) -> Unit = {},
    )
}
