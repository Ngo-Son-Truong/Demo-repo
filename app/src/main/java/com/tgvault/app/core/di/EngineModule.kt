package com.tgvault.app.core.di

import com.tgvault.app.core.engine.DownloadEngine
import com.tgvault.app.core.engine.DownloadTransferEngine
import com.tgvault.app.core.engine.TransferEngine
import com.tgvault.app.core.engine.UploadEngine
import com.tgvault.app.core.engine.UploadTransferEngine
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/** Đưa 2 engine về cùng kiểu TransferEngine để TransferWorker/test dùng qua interface. */
@Module
@InstallIn(SingletonComponent::class)
object EngineModule {
    @Provides
    @UploadTransferEngine
    fun provideUploadEngine(engine: UploadEngine): TransferEngine = engine

    @Provides
    @DownloadTransferEngine
    fun provideDownloadEngine(engine: DownloadEngine): TransferEngine = engine
}
