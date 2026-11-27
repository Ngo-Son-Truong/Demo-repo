package com.tgvault.app.core.di

import com.tgvault.app.data.remote.ConnectionManager
import com.tgvault.app.data.remote.ConnectionManagerImpl
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class ConnectionModule {
    @Binds
    @Singleton
    abstract fun bindConnectionManager(impl: ConnectionManagerImpl): ConnectionManager
}
