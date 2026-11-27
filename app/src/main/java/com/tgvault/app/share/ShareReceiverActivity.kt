package com.tgvault.app.share

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.tgvault.app.R
import com.tgvault.app.core.util.FileUtils
import com.tgvault.app.data.transfer.TransferScheduler
import com.tgvault.app.domain.repository.NodeRepository
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import timber.log.Timber
import android.widget.Toast
import java.io.File

/**
 * Share-in (FR-FILE-3, M6-4): nhận ACTION_SEND/ACTION_SEND_MULTIPLE →
 * staging vào bộ nhớ riêng → Node(PENDING)+Transfer(QUEUED) → WorkManager.
 * Activity không UI (theme translucent); không khoá xoay vì màn hình chớp rồi đóng.
 */
@AndroidEntryPoint
class ShareReceiverActivity : ComponentActivity() {
    @EntryPoint
    @InstallIn(SingletonComponent::class)
    interface Deps {
        fun nodeRepository(): NodeRepository

        fun transferScheduler(): TransferScheduler
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val uris = extractUris(intent)
        if (uris.isEmpty()) {
            finish()
            return
        }
        val deps = EntryPointAccessors.fromApplication(applicationContext, Deps::class.java)
        val stagingDir = File(filesDir, "staging")
        val resolver = contentResolver

        Toast.makeText(this, R.string.share_received, Toast.LENGTH_SHORT).show()
        lifecycleScope.launch {
            withContext(Dispatchers.IO) {
                for (uri in uris) {
                    runCatching {
                        val name = displayName(uri) ?: "shared-${System.currentTimeMillis()}"
                        val staging = FileUtils.copyToPrivateStorage(uri, stagingDir, resolver)
                        val (_, transfer) =
                            deps.nodeRepository().createPendingUpload(
                                parentId = null,
                                name = name,
                                mimeType = resolver.getType(uri),
                                sizeBytes = staging.length(),
                                sourceUri = null,
                                stagingPath = staging.absolutePath,
                            )
                        deps.transferScheduler().enqueue(transfer.id)
                    }.onFailure { Timber.w(it, "share-in lỗi: %s", uri) }
                }
            }
            finish()
        }
    }

    private fun extractUris(intent: Intent?): List<Uri> =
        when (intent?.action) {
            Intent.ACTION_SEND ->
                @Suppress("DEPRECATION") // minSdk 29 — bản generic mới chỉ có từ API 33
                listOfNotNull(intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))
            Intent.ACTION_SEND_MULTIPLE ->
                @Suppress("DEPRECATION")
                intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM).orEmpty()
            else -> emptyList()
        }

    private fun displayName(uri: Uri): String? =
        runCatching {
            contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) c.getString(0) else null
            }
        }.getOrNull()
}
