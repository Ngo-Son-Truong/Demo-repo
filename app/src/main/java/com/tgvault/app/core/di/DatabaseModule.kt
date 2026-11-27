package com.tgvault.app.core.di

import android.content.Context
import androidx.room.Room
import com.tgvault.app.core.common.TimeProvider
import com.tgvault.app.data.local.TgVaultDatabase
import com.tgvault.app.data.local.dao.ChunkDao
import com.tgvault.app.data.local.dao.NodeDao
import com.tgvault.app.data.local.dao.OrphanChunkDao
import com.tgvault.app.data.local.dao.TransferDao
import com.tgvault.app.data.local.datastore.ConfigRepositoryImpl
import com.tgvault.app.data.repository.NodeRepositoryImpl
import com.tgvault.app.data.repository.TransferRepositoryImpl
import com.tgvault.app.domain.repository.ConfigRepository
import com.tgvault.app.domain.repository.NodeRepository
import com.tgvault.app.domain.repository.TransferRepository
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): TgVaultDatabase =
        Room.databaseBuilder(context, TgVaultDatabase::class.java, TgVaultDatabase.NAME)
            .fallbackToDestructiveMigration() // chỉ cho dev — M10 sẽ thay bằng migration thật (ghi DECISIONS)
            .build()

    @Provides fun provideNodeDao(db: TgVaultDatabase): NodeDao = db.nodeDao()
    @Provides fun provideChunkDao(db: TgVaultDatabase): ChunkDao = db.chunkDao()
    @Provides fun provideTransferDao(db: TgVaultDatabase): TransferDao = db.transferDao()
    @Provides fun provideOrphanChunkDao(db: TgVaultDatabase): OrphanChunkDao = db.orphanChunkDao()
}

@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    @Binds
    @Singleton
    abstract fun bindConfigRepository(impl: ConfigRepositoryImpl): ConfigRepository

    @Binds
    @Singleton
    abstract fun bindNodeRepository(impl: NodeRepositoryImpl): NodeRepository

    @Binds
    @Singleton
    abstract fun bindTransferRepository(impl: TransferRepositoryImpl): TransferRepository
}
