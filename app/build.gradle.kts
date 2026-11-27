import org.gradle.api.tasks.testing.Test
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ktlint)
    alias(libs.plugins.detekt)
}

android {
    namespace = "com.tgvault.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.tgvault.app"
        minSdk = 29
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlin {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_17)
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += setOf(
                "META-INF/DEPENDENCIES",
                "META-INF/LICENSE",
                "META-INF/LICENSE.txt",
                "META-INF/NOTICE",
                "META-INF/NOTICE.txt",
                "META-INF/ASL2.0"
            )
        }
    }

    // SPEC §6: Android Lint warnings-as-errors cho :app
    lint {
        abortOnError = true
        warningsAsErrors = true
    }

    testOptions {
        // Robolectric cần truy cập tài nguyên (Room in-memory test)
        unitTests.isIncludeAndroidResources = true
    }
}

ksp {
    // SPEC §16: exportSchema — schema JSON sinh vào app/schemas/ và được commit
    arg("room.schemaLocation", "$projectDir/schemas")
}

ktlint {
    version.set(libs.versions.ktlint.get())
    android.set(false)
    outputToConsole.set(true)
    ignoreFailures.set(false)
}

detekt {
    config.setFrom("${rootProject.projectDir}/config/detekt/detekt.yml")
    buildUponDefaultConfig.set(true)
    parallel.set(true)
}

tasks.withType<io.gitlab.arturbosch.detekt.Detekt>().configureEach {
    jvmTarget = "17"
}

// Bộ test Telegram thật (PLAN M1-7): bật bằng -PrunTelegramLive=true,
// token/channel đọc từ local.properties (KHÔNG commit, KHÔNG đưa vào BuildConfig/APK)
val localProps = Properties()
val localPropsFile = rootProject.file("local.properties")
if (localPropsFile.exists()) {
    localPropsFile.inputStream().use { localProps.load(it) }
}

tasks.withType<Test>().configureEach {
    if (project.hasProperty("runTelegramLive")) {
        systemProperty("tgvault.runLive", "true")
        systemProperty("tgvault.botToken", localProps.getProperty("tgvault.botToken").orEmpty())
        systemProperty("tgvault.chatId", localProps.getProperty("tgvault.chatId").orEmpty())
    }
}

dependencies {
    // Compose (BOM quản lý phiên bản)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    implementation(libs.compose.foundation)
    implementation(libs.compose.runtime)
    implementation(libs.compose.material3.adaptive.navigation.suite)

    // AndroidX nền tảng
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.core.splashscreen)

    // DI
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)

    // Dữ liệu
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
    implementation(libs.androidx.datastore.preferences)

    // Bất đồng bộ + mạng
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.retrofit)
    implementation(libs.retrofit.converter.kotlinx.serialization)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging.interceptor)

    // Log (che token qua TokenRedactor — SPEC §14)
    implementation(libs.timber)

    // Test JVM
    testImplementation(libs.junit)
    testImplementation(libs.mockk)
    testImplementation(libs.turbine)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.androidx.arch.core.testing)

    // Test thiết bị (Compose UI — dùng từ M4)
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.androidx.test.junit.ext)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.compose.ui.test.junit4)

    debugImplementation(libs.compose.ui.tooling)
    debugImplementation(libs.compose.ui.test.manifest)
}
