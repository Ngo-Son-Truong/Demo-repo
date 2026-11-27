package com.tgvault.app.core.common

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import javax.inject.Inject
import javax.inject.Singleton

/** Nguồn thời gian inject được để test bằng đồng hồ ảo (PLAN M1-4). */
fun interface TimeProvider {
    fun nowMillis(): Long
}

object SystemTimeProvider : TimeProvider {
    override fun nowMillis(): Long = System.currentTimeMillis()
}

/** Dispatchers inject được để test. */
@Singleton
class DispatcherProvider
    @Inject
    constructor() {
        val io: CoroutineDispatcher = Dispatchers.IO
        val default: CoroutineDispatcher = Dispatchers.Default
        val main: CoroutineDispatcher = Dispatchers.Main
    }
