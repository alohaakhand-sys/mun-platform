package com.munpro.app.notify

// The app's phone notifications, one channel per kind so each can be silenced in Android's own
// settings: "App updates" (a new version is ready), "Conference alerts" (the web's in-app
// notifications: allocations, migrations, endorsements…) and "Live session" (FloorService).
// Every notification opens a munpro:// link, which MainActivity routes like any other link.

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.munpro.app.R
import com.munpro.app.data.Release
import com.munpro.app.domain.AppNotification
import com.munpro.app.ui.live.FloorService

object Notifier {
    const val UPDATES = "app_updates"
    const val ALERTS = "conference_alerts"
    /** MainActivity marks this notification read when its alert is tapped. */
    const val EXTRA_NOTIFICATION_ID = "munpro.notificationId"

    private const val UPDATE_ID = 4201
    private const val ALERT_ID = 4301

    /** Re-creating an existing channel is a no-op, so this runs at every launch. */
    fun ensureChannels(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(UPDATES, "App updates", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "A new version of MUN Pilot is ready to install"
            },
        )
        nm.createNotificationChannel(
            NotificationChannel(ALERTS, "Conference alerts", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Applications, allocations, migrations and endorsements"
            },
        )
        FloorService.ensureChannel(context)
    }

    /** The permission (Android 13+) and the app-wide switch in the system settings. */
    fun enabled(context: Context): Boolean =
        (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) &&
            NotificationManagerCompat.from(context).areNotificationsEnabled()

    /** Android's notification settings for this app (when the user said no to the prompt). */
    fun settingsIntent(context: Context): Intent =
        Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, context.packageName)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    fun update(context: Context, release: Release) {
        if (!enabled(context)) return
        val note = release.changelog.firstOrNull { it.versionCode == release.versionCode }?.notes?.firstOrNull()
        val n = NotificationCompat.Builder(context, UPDATES)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("MUN Pilot ${release.versionName} is available")
            .setContentText(note ?: "Tap to update.")
            .setStyle(NotificationCompat.BigTextStyle().bigText(note ?: "Tap to update."))
            .setContentIntent(open(context, "munpro://settings/update", UPDATE_ID))
            .addAction(0, "Update", open(context, "munpro://settings/update", UPDATE_ID + 1))
            .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(UPDATE_ID, n) }
    }

    fun clearUpdate(context: Context) = NotificationManagerCompat.from(context).cancel(UPDATE_ID)

    fun alert(context: Context, a: AppNotification) {
        if (!enabled(context)) return
        val href = a.href?.takeIf { it.isNotBlank() } ?: "/notifications"
        val n = NotificationCompat.Builder(context, ALERTS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(a.title)
            .setContentText(a.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(a.body))
            .setContentIntent(open(context, "munpro://" + href.trimStart('/'), a.id.hashCode(), a.id))
            .setWhen(a.createdAt ?: System.currentTimeMillis())
            .setShowWhen(true)
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setGroup(ALERTS)
            .setAutoCancel(true)
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(a.id, ALERT_ID, n) }
    }

    /** Opening Notifications in the app reads them all, so their phone notifications go too. */
    fun clearAlerts(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.activeNotifications.filter { it.id == ALERT_ID }.forEach { nm.cancel(it.tag, it.id) }
    }

    private fun open(context: Context, link: String, code: Int, notificationId: String? = null): PendingIntent =
        PendingIntent.getActivity(
            context, code,
            Intent(Intent.ACTION_VIEW, Uri.parse(link)).setPackage(context.packageName)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .apply { if (notificationId != null) putExtra(EXTRA_NOTIFICATION_ID, notificationId) },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
}
