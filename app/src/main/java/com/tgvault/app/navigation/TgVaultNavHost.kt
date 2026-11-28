package com.tgvault.app.navigation

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.tgvault.app.core.designsystem.MotionConfig
import com.tgvault.app.core.designsystem.MotionSpecs
import com.tgvault.app.core.designsystem.currentMotionConfig
import com.tgvault.app.core.util.FileUtils
import com.tgvault.app.feature.files.FilesScreen
import com.tgvault.app.feature.preview.PlayerScreen
import com.tgvault.app.feature.preview.PreviewScreen
import com.tgvault.app.feature.settings.SettingsScreen
import com.tgvault.app.feature.transfers.TransfersScreen
import com.tgvault.app.feature.trash.TrashScreen

/**
 * Điều hướng chính (SPEC §15.3): 3 tab; NavigationSuiteScaffold tự thích ứng
 * NavigationBar (compact) / NavigationRail (màn hình rộng ≥ 600 dp).
 * Chuyển tab: fade-through (SPEC §15.4) qua MotionSpecs.
 */
@Composable
fun TgVaultNavHost() {
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    val motion = currentMotionConfig()

    NavigationSuiteScaffold(
        navigationSuiteItems = {
            TopLevelDestination.entries.forEach { destination ->
                item(
                    selected = currentRoute == destination.route,
                    onClick = {
                        navController.navigate(destination.route) {
                            popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    },
                    icon = {
                        Icon(
                            imageVector = destination.icon,
                            contentDescription = stringResource(destination.labelRes),
                        )
                    },
                    label = { Text(stringResource(destination.labelRes)) },
                )
            }
        },
    ) {
        NavHost(
            navController = navController,
            startDestination = TopLevelDestination.FILES.route,
            modifier = Modifier.fillMaxSize(),
            enterTransition = { MotionSpecs.fadeIn(motion, MotionConfig.DURATION_NAV) },
            exitTransition = { MotionSpecs.fadeOut(motion, MotionConfig.DURATION_NAV) },
        ) {
            composable(TopLevelDestination.FILES.route) {
                FilesScreen(
                    onOpenFile = { node ->
                        when (FileUtils.mimeKind(node.mimeType)) {
                            FileUtils.MimeKind.VIDEO, FileUtils.MimeKind.AUDIO ->
                                navController.navigate("player/${node.id}")
                            else -> navController.navigate("preview/${node.id}")
                        }
                    },
                )
            }
            composable(
                route = "player/{nodeId}",
                arguments = listOf(navArgument("nodeId") { type = NavType.StringType }),
            ) {
                PlayerScreen(onBack = { navController.popBackStack() })
            }
            composable(
                route = "preview/{nodeId}",
                arguments = listOf(navArgument("nodeId") { type = NavType.StringType }),
            ) {
                PreviewScreen(onBack = { navController.popBackStack() })
            }
            composable(TopLevelDestination.TRASH.route) { TrashScreen() }
            composable(TopLevelDestination.TRANSFERS.route) { TransfersScreen() }
            composable(TopLevelDestination.SETTINGS.route) { SettingsScreen() }
        }
    }
}
