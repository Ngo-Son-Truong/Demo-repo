package com.tgvault.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tgvault.app.domain.repository.ConfigRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

/** Quyết định màn gốc: onboarding (chưa kết nối) hay app chính (SPEC §15.3 màn 1). */
@HiltViewModel
class RootViewModel
    @Inject
    constructor(
        configRepository: ConfigRepository,
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
    }
