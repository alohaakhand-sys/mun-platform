import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// Firebase is started from the WEB app's config (no google-services.json until push). The values
// live in this folder's local.properties (git-ignored; see README.md). Like NEXT_PUBLIC_* on the
// web, they are baked in at build time.
val local = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun cfg(key: String): String = (local.getProperty(key) ?: "").replace("\"", "\\\"")

// The version comes from the newest entry of the changelog the app shows in Settings -> What's New,
// so a release can't ship without its notes. tools/release.mjs reads the same file.
@Suppress("UNCHECKED_CAST")
val latestRelease = (groovy.json.JsonSlurper().parse(file("src/main/assets/changelog.json")) as List<Map<String, Any>>).first()

// Release builds split per ABI (one ~half-size APK per phone type, for in-app updates); debug
// builds stay a single APK for the emulator and e2e scripts.
val abis = listOf("arm64-v8a", "x86_64")
val splitAbis = gradle.startParameter.taskNames.any { it.contains("Release", ignoreCase = true) }

android {
    namespace = "com.munpro.app"
    compileSdk = 37

    defaultConfig {
        // ".kt" while the RN app still owns com.munpro.app, so both install side by side (PLAN.md §1).
        applicationId = "com.munpro.app.kt"
        minSdk = 26
        targetSdk = 36
        versionCode = (latestRelease["versionCode"] as Number).toInt()
        versionName = latestRelease["versionName"] as String
        // Agora ships native code per ABI. Phones are arm64; x86_64 runs the emulator.
        if (!splitAbis) ndk { abiFilters += abis }

        buildConfigField("String", "FIREBASE_API_KEY", "\"${cfg("FIREBASE_API_KEY")}\"")
        buildConfigField("String", "FIREBASE_PROJECT_ID", "\"${cfg("FIREBASE_PROJECT_ID")}\"")
        buildConfigField("String", "FIREBASE_APP_ID", "\"${cfg("FIREBASE_APP_ID")}\"")
        buildConfigField("String", "FIREBASE_STORAGE_BUCKET", "\"${cfg("FIREBASE_STORAGE_BUCKET")}\"")
        buildConfigField("String", "FIREBASE_SENDER_ID", "\"${cfg("FIREBASE_MESSAGING_SENDER_ID")}\"")
        buildConfigField("String", "FIREBASE_DATABASE_URL", "\"${cfg("FIREBASE_DATABASE_URL")}\"")
        buildConfigField("String", "API_URL", "\"${cfg("API_URL").trimEnd('/')}\"")
        // Google sign-in: the project's WEB OAuth client id (Firebase console -> Auth -> Google ->
        // Web SDK configuration). Empty hides every Google button. See README.md.
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"${cfg("GOOGLE_WEB_CLIENT_ID")}\"")
        // In-app updates: the public base URL of the R2 bucket tools/release.mjs publishes to
        // (android/latest.json under it). Empty falls back to API_URL's /api/app/latest.
        buildConfigField("String", "UPDATE_BASE_URL", "\"${cfg("UPDATE_BASE_URL").trimEnd('/')}\"")
    }

    splits {
        abi {
            isEnable = splitAbis
            reset()
            include(*abis.toTypedArray())
            isUniversalApk = false
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Debug key until K8 (release): fine for testers, not for the Play Store.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        optIn.add("androidx.compose.foundation.ExperimentalFoundationApi")
        optIn.add("androidx.compose.material3.ExperimentalMaterial3Api")
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.work.runtime)

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)

    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.play.services)

    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth)
    implementation(libs.firebase.firestore)
    // Live session join/leave pills (the web's /sessionPresence on the Realtime Database).
    implementation(libs.firebase.database)

    // Position papers: the text of a PDF is extracted on the phone (the web does the same with
    // pdf.js); the file itself is never stored.
    implementation(libs.pdfbox.android)

    // Live MUN video (Agora Interactive Live Streaming, the web's agora-rtc-sdk-ng on Android).
    // Core engine only: the AI/beauty/content-inspect extensions full-sdk pulls in go unused.
    implementation(libs.agora.rtc)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play)
    implementation(libs.googleid)

    // Profile photos and covers (board A3): the site stores them on Cloudinary as plain URLs.
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    // QR passes (setup/qr-passes-plan.md): zxing draws the holder's pass and reads it in the
    // scanner, fed by CameraX frames (no ML Kit / Play Services model download at the venue).
    implementation(libs.zxing.core)
    implementation(libs.camera.camera2)
    implementation(libs.camera.lifecycle)
    implementation(libs.camera.view)
    // OpenStreetMap tiles for the event location pin (no API key, Apache-2.0).
    implementation(libs.osmdroid.android)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
}
