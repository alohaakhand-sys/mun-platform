package com.munpro.app.notify

// Every 15 minutes (Android's shortest periodic interval), with a network, even when the app is
// closed: is there a new version (Cloudflare R2, no Firestore cost), and — every 30 minutes — are
// there new conference alerts for the signed-in user.
//
// The alerts check is the one place the app polls Firestore, so it is shaped for the Spark read
// budget: a query for notifications NEWER than the last one seen, which costs one read when there
// is nothing new (index: notifications uid + createdAt, firestore.indexes.json). The first run
// after sign-in only records "now", so old notifications never pop up.

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.munpro.app.AppGraph
import com.munpro.app.data.decode
import com.munpro.app.domain.AppNotification
import kotlinx.coroutines.tasks.await
import java.util.concurrent.TimeUnit

class BackgroundCheck(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        runCatching { checkUpdate() }
        runCatching { checkAlerts() }
        return Result.success()
    }

    private suspend fun checkUpdate() {
        val release = AppGraph.updates.check() ?: return
        if (AppGraph.saved.getString(UPDATES_PREF) == "off") return
        // Once per version: the prompt in the app and Settings carry it after that.
        if (AppGraph.saved.getString(UPDATE_NOTIFIED) == release.versionCode.toString()) return
        Notifier.update(applicationContext, release)
        AppGraph.saved.putString(UPDATE_NOTIFIED, release.versionCode.toString())
    }

    private suspend fun checkAlerts() {
        if (AppGraph.saved.getString(ALERTS_PREF) == "off") return
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return
        val now = System.currentTimeMillis()
        val lastRun = AppGraph.saved.getString(ALERTS_RAN_AT)?.toLongOrNull() ?: 0L
        if (now - lastRun < ALERTS_EVERY_MS) return
        AppGraph.saved.putString(ALERTS_RAN_AT, now.toString())

        val seenKey = "$ALERTS_SEEN:$uid"
        val seen = AppGraph.saved.getString(seenKey)?.split(":")?.let { p ->
            val s = p.getOrNull(0)?.toLongOrNull(); val n = p.getOrNull(1)?.toIntOrNull()
            if (s != null && n != null) Timestamp(s, n) else null
        }
        if (seen == null) {
            AppGraph.saved.putString(seenKey, Timestamp.now().let { "${it.seconds}:${it.nanoseconds}" })
            return
        }
        val docs = FirebaseFirestore.getInstance().collection("notifications")
            .whereEqualTo("uid", uid)
            .whereGreaterThan("createdAt", seen)
            .orderBy("createdAt", Query.Direction.ASCENDING)
            .limit(10)
            .get().await().documents
        if (docs.isEmpty()) return
        docs.forEach { d ->
            val n = d.decode<AppNotification>() ?: return@forEach
            if (!n.read) Notifier.alert(applicationContext, n)
        }
        docs.last().getTimestamp("createdAt")?.let { AppGraph.saved.putString(seenKey, "${it.seconds}:${it.nanoseconds}") }
    }

    companion object {
        private const val WORK = "munpro.backgroundCheck"
        const val UPDATES_PREF = "munpro.notify.updates"
        const val ALERTS_PREF = "munpro.notify.alerts"
        private const val UPDATE_NOTIFIED = "munpro.update.notified"
        private const val ALERTS_RAN_AT = "munpro.alerts.ranAt"
        private const val ALERTS_SEEN = "munpro.alerts.seen"
        private const val ALERTS_EVERY_MS = 30 * 60_000L - 60_000L // a 15-min worker drifts; allow it

        /** Idempotent: keeps the existing schedule, refreshing its definition after an app update. */
        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<BackgroundCheck>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.UPDATE, request)
        }
    }
}
