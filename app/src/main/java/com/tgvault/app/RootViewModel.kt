package com.tgvault.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tgvault.app.core.indexbackup.IndexBackupManager
import com.tgvault.app.domain.repository.ConfigRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/** Quyết định màn gốc: onboarding (chưa kết nối) hay app chính (SPEC §15.3 màn 1). */
@HiltViewModel
class RootViewModel
    @Inject
    constructor(
        private val configRepository: ConfigRepository,
        private val indexBackupManager: IndexBackupManager,
    ) : ViewModel() {
        /** null = đang đọc cấu hình (giữ splash). */
        val onboardingDone: StateFlow<Boolean?> =
            configRepository.config
                .map { it.onboardingDone }
                .stateIn(viewModelScope, SharingStarted.Eagerly, null)

        /** FR-SEC-4: bật khoá app → FLAG_SECURE (chặn screenshot/recents). */
        val appLockEnabled: StateFlow<Boolean> =
            configRepository.config
                .map { it.appLockEnabled }
                .stateIn(viewModelScope, SharingStarted.Eagerly, false)

        /** M8-3 (FR-IDX-4): revision trên cloud MỚI HƠN máy → hỏi người dùng khi mở app. */
        private val _cloudNewerRevision = MutableStateFlow<Long?>(null)
        val cloudNewerRevision: StateFlow<Long?> = _cloudNewerRevision.asStateFlow()

        init {
            viewModelScope.launch {
                // Chờ onboarding xong + gateway sẵn sàng rồi mới hỏi Telegram
                configRepository.config.collect { cfg ->
                    if (cfg.onboardingDone && cfg.chatId != null) {
                        delay(2_000)
                        runCatching {
                            val cloud = indexBackupManager.cloudRevision()
                            if (cloud != null && cloud > cfg.localRevision) {
                                Timber.i("phát hiện bản sao lưu cloud mới hơn: r$cloud > r${cfg.localRevision}")
                                _cloudNewerRevision.value = cloud
                            }
                        }.onFailure { Timber.w(it, "kiểm tra cloud revision thất bại") }
                        return@collect // kiểm tra MỘT lần sau khi sẵn sàng
                    }
                }
            }
        }

        fun dismissCloudNewer() {
            _cloudNewerRevision.value = null
        }

        /** Khôi phục bản cloud (M8-3) — trả kết quả để UI xử lý (có thể cần passphrase). */
        suspend fun restoreCloud(passphrase: CharArray?): IndexBackupManager.RestoreResult {
            val r = indexBackupManager.restoreFromPinned(passphrase)
            if (r is IndexBackupManager.RestoreResult.Success) _cloudNewerRevision.value = null
            return r
        }
    }
