package com.tgvault.app.core.thumb

import android.graphics.Bitmap
import coil3.ImageLoader
import coil3.asImage
import coil3.decode.DataSource
import coil3.fetch.FetchResult
import coil3.fetch.Fetcher
import coil3.fetch.ImageFetchResult
import coil3.request.Options
import com.tgvault.app.domain.model.Node

/**
 * M9-1: Coil Fetcher cho Node — `AsyncImage(model = node)` tự tải thumbnail qua
 * [ThumbnailCache] (ảnh ≤ 1 chunk); không lấy được → ném để Coil hiển thị fallback/error.
 */
class NodeThumbnailFetcher(
    private val node: Node,
    private val cache: ThumbnailCache,
) : Fetcher {
    override suspend fun fetch(): FetchResult {
        val bitmap: Bitmap = cache.get(node)
        checkNotNull(bitmap) { "không có thumbnail cho node ${node.id}" }
        return ImageFetchResult(
            image = bitmap.asImage(),
            isSampled = true,
            dataSource = DataSource.DISK,
        )
    }

    class Factory(
        private val cache: ThumbnailCache,
    ) : Fetcher.Factory<Node> {
        override fun create(
            data: Node,
            options: Options,
            imageLoader: ImageLoader,
        ): Fetcher = NodeThumbnailFetcher(data, cache)
    }
}
