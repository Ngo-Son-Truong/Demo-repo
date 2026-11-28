package com.tgvault.app.core.security

import androidx.test.core.app.ApplicationProvider
import com.tgvault.app.core.common.TimeProvider
import com.tgvault.app.core.crypto.CryptoManager
import com.tgvault.app.domain.model.DriveConfig
import com.tgvault.app.domain.model.ThemeMode
import com.tgvault.app.domain.repository.ConfigRepository
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** M7-6: khoá app — PIN hash, timeout nền, khoá khi mở lại (FR-SEC-2). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AppLockManagerTest {
    private var now = 1_000_000L
    private val timeProvider = TimeProvider { now }
    private var appLockEnabled = true
    private var timeoutSec = 60

    private val configRepository: ConfigRepository =
        mockk {
            coEvery { current() } answers {
                driveConfig(appLockEnabled, timeoutSec)
            }
            every { config } returns flowOf(driveConfig(appLockEnabled, timeoutSec))
        }
    private lateinit var cryptoManager: CryptoManager
    private lateinit var appLock: AppLockManager

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        context.getSharedPreferences("tgvault_applock", android.content.Context.MODE_PRIVATE).edit().clear().commit()
        cryptoManager = CryptoManager(context)
        appLock = AppLockManager(context, configRepository, cryptoManager, timeProvider)
    }

    @Test
    fun `đặt PIN rồi mở khoá đúng, sai PIN không mở được`() {
        appLock.setPin("2468".toCharArray())
        assertTrue(appLock.hasPin())
        appLock.lock()
        assertTrue(appLock.locked.value)
        assertFalse(appLock.unlockWithPin("1357".toCharArray()))
        assertTrue(appLock.locked.value)
        assertTrue(appLock.unlockWithPin("2468".toCharArray()))
        assertFalse(appLock.locked.value)
    }

    @Test
    fun `PIN sai định dạng bị từ chối`() {
        org.junit.Assert.assertThrows(IllegalArgumentException::class.java) {
            appLock.setPin("12".toCharArray())
        }
        org.junit.Assert.assertThrows(IllegalArgumentException::class.java) {
            appLock.setPin("12ab".toCharArray())
        }
    }

    @Test
    fun `đổi PIN yêu cầu PIN cũ đúng`() {
        appLock.setPin("1111".toCharArray())
        assertFalse(appLock.changePin("0000".toCharArray(), "2222".toCharArray()))
        assertTrue(appLock.unlockWithPin("1111".toCharArray()))
        assertTrue(appLock.changePin("1111".toCharArray(), "2222".toCharArray()))
        appLock.lock()
        assertFalse(appLock.unlockWithPin("1111".toCharArray()))
        assertTrue(appLock.unlockWithPin("2222".toCharArray()))
    }

    @Test
    fun `vào nền chưa quá timeout thì không khoá, quá timeout thì khoá`() =
        runTest {
            appLock.setPin("2468".toCharArray())
            appLock.onBackground()
            now += 10_000 // 10s < 60s
            appLock.onForeground()
            assertFalse(appLock.locked.value)

            appLock.onBackground()
            now += 61_000 // 61s > 60s
            appLock.onForeground()
            assertTrue(appLock.locked.value)
        }

    @Test
    fun `khoá app tắt thì không bao giờ tự khoá`() =
        runTest {
            appLockEnabled = false
            appLock.setPin("2468".toCharArray())
            appLock.onBackground()
            now += 3_600_000
            appLock.onForeground()
            assertFalse(appLock.locked.value)
        }

    @Test
    fun `process mở lại khi đang bật khoá thì khoá ngay`() =
        runTest {
            appLock.setPin("2468".toCharArray())
            appLock.lockOnStartIfEnabled()
            assertTrue(appLock.locked.value)

            appLockEnabled = false
            val appLock2 =
                AppLockManager(
                    ApplicationProvider.getApplicationContext(),
                    configRepository,
                    cryptoManager,
                    timeProvider,
                )
            appLock2.lockOnStartIfEnabled()
            assertFalse(appLock2.locked.value)
        }

    @Test
    fun `mở khoá bằng sinh trắc học xoá trạng thái khoá`() {
        appLock.setPin("2468".toCharArray())
        appLock.lock()
        appLock.unlockWithBiometric()
        assertFalse(appLock.locked.value)
    }

    private fun driveConfig(
        lockEnabled: Boolean,
        timeout: Int,
    ) = DriveConfig(
        botUsername = null,
        chatId = null,
        chunkSizeBytes = 19 * 1024 * 1024,
        wifiOnly = false,
        maxParallelTransfers = 2,
        themeMode = ThemeMode.SYSTEM,
        dynamicColor = true,
        language = null,
        encryptionEnabled = false,
        appLockEnabled = lockEnabled,
        appLockTimeoutSec = timeout,
        localRevision = 0,
        lastIndexBackupAt = null,
        downloadTreeUri = null,
        deviceId = "test",
        onboardingDone = true,
    )
}
