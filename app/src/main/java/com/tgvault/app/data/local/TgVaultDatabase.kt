package com.tgvault.app.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import com.tgvault.app.data.local.dao.ChunkDao
import com.tgvault.app.data.local.dao.NodeDao
import com.tgvault.app.data.local.dao.OrphanChunkDao
import com.tgvault.app.data.local.dao.TransferDao
import com.tgvault.app.data.local.entity.ChunkEntity
import com.tgvault.app.data.local.entity.NodeEntity
import com.tgvault.app.data.local.entity.OrphanChunkEntity
import com.tgvault.app.data.local.entity.TransferEntity

/**
 * Room — nguồn sự thật của danh mục tệp (SPEC D6).
 * exportSchema = true (SPEC §16): schema JSON sinh vào app/schemas/ và được commit.
 */
@Database(
    entities = [
        NodeEntity::class,
        ChunkEntity::class,
        TransferEntity::class,
        OrphanChunkEntity::class,
    ],
    version = 1,
    exportSchema = true,
)
abstract class TgVaultDatabase : RoomDatabase() {
    abstract fun nodeDao(): NodeDao

    abstract fun chunkDao(): ChunkDao

    abstract fun transferDao(): TransferDao

    abstract fun orphanChunkDao(): OrphanChunkDao

    companion object {
        const val NAME = "tgvault.db"
    }
}
