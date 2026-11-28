package com.tgvault.app.feature.preview

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.PlayerView
import com.tgvault.app.R
import com.tgvault.app.core.designsystem.Spacing

/**
 * Màn phát (M9+ mở rộng): video toàn màn hình; audio = icon + thanh điều khiển.
 * Stream trực tiếp từ Telegram qua NodeStreamDataSource (Range request + cache đĩa LRU).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
@OptIn(UnstableApi::class)
fun PlayerScreen(
    onBack: () -> Unit,
    viewModel: PlayerViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(state.node?.name ?: stringResource(R.string.player_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
    ) { padding ->
        Box(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentAlignment = Alignment.Center,
        ) {
            when {
                state.loading ->
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator()
                        Spacer(Modifier.height(Spacing.x3))
                        Text(stringResource(R.string.player_buffering))
                    }
                state.error != null ->
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(Spacing.x6),
                    ) {
                        Text(
                            stringResource(R.string.player_error),
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Spacer(Modifier.height(Spacing.x2))
                        Text(
                            state.error.orEmpty(),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                        )
                    }
                else ->
                    viewModel.player?.let { exo ->
                        if (state.isAudio) {
                            Column(
                                modifier = Modifier.fillMaxWidth().padding(Spacing.x6),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.Center,
                            ) {
                                Icon(
                                    Icons.Rounded.MusicNote,
                                    contentDescription = null,
                                    modifier = Modifier.size(96.dp),
                                    tint = MaterialTheme.colorScheme.primary,
                                )
                                Spacer(Modifier.height(Spacing.x4))
                                PlayerAndroidView(exo, Modifier.fillMaxWidth())
                            }
                        } else {
                            PlayerAndroidView(exo, Modifier.fillMaxSize())
                        }
                    }
            }
        }
    }
}

@Composable
private fun PlayerAndroidView(
    player: androidx.media3.common.Player,
    modifier: Modifier,
) {
    AndroidView(
        factory = { ctx ->
            PlayerView(ctx).apply {
                this.player = player
                useController = true
                controllerShowTimeoutMs = -1 // luôn hiện thanh điều khiển (audio)
            }
        },
        modifier = modifier,
    )
}
