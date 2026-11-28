package com.tgvault.app.feature.preview

import android.graphics.Bitmap
import androidx.core.graphics.createBitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
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
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tgvault.app.R
import com.tgvault.app.core.designsystem.Spacing
import java.io.File

/**
 * M9-2: xem trước ảnh (zoom/pan), văn bản (≤1 MiB đầu), PDF (PdfRenderer).
 * Nội dung đã giải mã sẵn trong PreviewViewModel — màn này chỉ hiển thị.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PreviewScreen(
    onBack: () -> Unit,
    viewModel: PreviewViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(state.node?.name ?: "") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            when {
                state.loading ->
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                state.error != null ->
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            stringResource(R.string.preview_error),
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(Spacing.x6),
                        )
                    }
                state.content != null -> PreviewBody(state.content!!)
            }
        }
    }
}

@Composable
private fun PreviewBody(content: PreviewContent) {
    when (content) {
        is PreviewContent.Image -> ImagePreview(content.bitmap)
        is PreviewContent.TextContent -> TextPreview(content.text, content.truncated)
        is PreviewContent.Pdf -> PdfPreview(content.file)
    }
}

// ---------------- Ảnh: pinch-zoom + pan ----------------

@Composable
private fun ImagePreview(bitmap: Bitmap) {
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }

    Box(
        modifier =
            Modifier
                .fillMaxSize()
                .pointerInput(Unit) {
                    detectTransformGestures { _, pan, zoom, _ ->
                        scale = (scale * zoom).coerceIn(1f, 6f)
                        offset = if (scale > 1f) offset + pan else Offset.Zero
                    }
                }
                .pointerInput(Unit) {
                    detectTapGestures(
                        onDoubleTap = {
                            scale = if (scale > 1f) 1f else 2.5f
                            if (scale == 1f) offset = Offset.Zero
                        },
                    )
                },
        contentAlignment = Alignment.Center,
    ) {
        Image(
            bitmap = bitmap.asImageBitmap(),
            contentDescription = null,
            modifier =
                Modifier
                    .fillMaxSize()
                    .graphicsLayer {
                        scaleX = scale
                        scaleY = scale
                        translationX = offset.x
                        translationY = offset.y
                    },
        )
    }
}

// ---------------- Văn bản ----------------

@Composable
private fun TextPreview(
    text: String,
    truncated: Boolean,
) {
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .horizontalScroll(rememberScrollState())
            .padding(Spacing.x4),
    ) {
        Text(
            text,
            style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
        )
        if (truncated) {
            Text(
                stringResource(R.string.preview_text_truncated),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = Spacing.x2),
            )
        }
    }
}

// ---------------- PDF: PdfRenderer qua ParcelFileDescriptor ----------------

@Composable
private fun PdfPreview(file: File) {
    val bitmaps =
        remember(file) {
            runCatching { renderPdfPages(file, MAX_PDF_PAGES) }.getOrElse { emptyList() }
        }
    if (bitmaps.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(
                stringResource(R.string.preview_error),
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(Spacing.x6),
            )
        }
        return
    }
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(Spacing.x2),
    ) {
        bitmaps.forEach { page ->
            Image(
                bitmap = page.asImageBitmap(),
                contentDescription = null,
                modifier = Modifier.fillMaxWidth().padding(bottom = Spacing.x2),
            )
        }
    }
}

private fun renderPdfPages(
    file: File,
    maxPages: Int,
): List<Bitmap> {
    val pfd =
        android.os.ParcelFileDescriptor.open(file, android.os.ParcelFileDescriptor.MODE_READ_ONLY)
    return pfd.use { descriptor ->
        android.graphics.pdf.PdfRenderer(descriptor).use { renderer ->
            val pages = mutableListOf<Bitmap>()
            val count = minOf(renderer.pageCount, maxPages)
            for (i in 0 until count) {
                renderer.openPage(i).use { page ->
                    val width = (page.width * PDF_RENDER_SCALE).toInt()
                    val height = (page.height * PDF_RENDER_SCALE).toInt()
                    val bmp = createBitmap(width, height)
                    bmp.eraseColor(android.graphics.Color.WHITE)
                    page.render(bmp, null, null, android.graphics.pdf.PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    pages.add(bmp)
                }
            }
            pages
        }
    }
}

private const val MAX_PDF_PAGES = 10
private const val PDF_RENDER_SCALE = 2.0f
