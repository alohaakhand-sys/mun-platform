package com.munpro.app

import android.app.Application
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.munpro.app.notify.BackgroundCheck
import com.munpro.app.notify.Notifier

class MunApp : Application(), coil3.SingletonImageLoader.Factory {
    override fun onCreate() {
        super.onCreate()
        // The web app's config (see app/build.gradle.kts): same project, same rules as the website.
        if (FirebaseApp.getApps(this).isEmpty()) {
            val options = FirebaseOptions.Builder()
                .setApiKey(BuildConfig.FIREBASE_API_KEY)
                .setApplicationId(BuildConfig.FIREBASE_APP_ID)
                .setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
                .setStorageBucket(BuildConfig.FIREBASE_STORAGE_BUCKET)
                .setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID)
                .setDatabaseUrl(BuildConfig.FIREBASE_DATABASE_URL)
                .build()
            FirebaseApp.initializeApp(this, options)
        }
        AppGraph.init(this)
        Notifier.ensureChannels(this)
        BackgroundCheck.schedule(this)
    }

    /**
     * Photos and covers: downloaded once, then kept on the phone (in app storage, not the cache dir
     * the system may clear) and served from there, so a picture costs the site one request.
     */
    override fun newImageLoader(context: coil3.PlatformContext): coil3.ImageLoader =
        coil3.ImageLoader.Builder(context)
            .diskCache {
                coil3.disk.DiskCache.Builder()
                    .directory(okio.Path.Companion.run { filesDir.resolve("images").absolutePath.toPath() })
                    .maxSizeBytes(256L * 1024 * 1024)
                    .build()
            }
            .build()
}
