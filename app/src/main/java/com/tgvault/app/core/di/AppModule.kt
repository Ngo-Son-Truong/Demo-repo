package com.tgvault.app.core.di

import android.content.Context
import coil3.ImageLoader
import coil3.SingletonImageLoader
import com.tgvault.app.core.common.SystemTimeProvider
import com.tgvault.app.core.common.TimeProvider
import com.tgvault.app.core.thumb.NodeThumbnailFetcher
import com.tgvault.app.core.thumb.ThumbnailCache
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides
    @Singleton
    fun provideTimeProvider(): TimeProvider = SystemTimeProvider

    @Provides
    @Singleton
    fun provideJson(): Json =
        Json {
            ignoreUnknownKeys = true
            explicitNulls = false
            encodeDefaults = true
        }

    /** Coil ImageLoader mặc định (SingletonImageLoader) — có Fetcher thumbnail cho Node (M9-1). */
    @Provides
    @Singleton
    fun provideImageLoader(
        @ApplicationContext context: Context,
        thumbnailCache: ThumbnailCache,
    ): ImageLoader =
        ImageLoader
            .Builder(context)
            .components { add(NodeThumbnailFetcher.Factory(thumbnailCache)) }
            .build()
            .also { SingletonImageLoader.setSafe { it } }
}
