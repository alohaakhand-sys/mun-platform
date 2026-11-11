package com.munpro.app.ui.live

// The mockup's lock screen during a sitting, on Android an ongoing notification: who has the
// floor, their clock, and your turn. A foreground service because Android freezes a backgrounded
// app within seconds, and a frozen app's notice would go on showing a speaker long gone. It runs
// only while the live screen is open (started and stopped by LiveScreen) and listens to the same
// session doc that screen does; Firestore shares one listener between identical queries, so the
// notice costs no extra reads.

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.munpro.app.AppGraph
import com.munpro.app.R
import com.munpro.app.domain.live.FloorNotice
import com.munpro.app.domain.live.floorNotice
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.launch

class FloorService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var job: Job? = null
    private var watching: String? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val eventId = intent?.getStringExtra(EXTRA_EVENT).orEmpty()
        val sessionId = intent?.getStringExtra(EXTRA_SESSION).orEmpty()
        val me = intent?.getStringExtra(EXTRA_ME).orEmpty()
        val committee = intent?.getStringExtra(EXTRA_COMMITTEE).orEmpty()
        val link = intent?.getStringExtra(EXTRA_LINK).orEmpty()
        if (eventId.isEmpty() || sessionId.isEmpty() || me.isEmpty()) {
            stopSelf()
            return START_NOT_STICKY
        }
        // Must be in the foreground straight away, before the first snapshot arrives.
        val first = build(committee, link, FloorNotice("Connecting…", "", null))
        ServiceCompat.startForeground(this, NOTICE_ID, first, if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0)

        val key = "$eventId/$sessionId/$me"
        if (watching != key) {
            watching = key
            job?.cancel()
            // The turn estimate ages with the clock, so it is re-read every 15 s as well as on each
            // change; the speech clock itself is the system's countdown and needs no updates.
            val ticks = flow { while (true) { emit(Unit); delay(15_000) } }
            job = scope.launch {
                combine(AppGraph.sessions.session(eventId, sessionId), ticks) { s, _ -> s?.let { floorNotice(it, me, System.currentTimeMillis()) } }
                    .distinctUntilChanged()
                    .collect { notice ->
                        if (notice == null) { stopSelf(); return@collect }
                        if (canNotify(this@FloorService)) NotificationManagerCompat.from(this@FloorService).notify(NOTICE_ID, build(committee, link, notice))
                    }
            }
        }
        return START_NOT_STICKY
    }

    private fun build(committee: String, link: String, n: FloorNotice) = NotificationCompat.Builder(this, CHANNEL)
        .setSmallIcon(R.drawable.ic_stat_live)
        .setColor(0xFF0A7C57.toInt())
        .setSubText("${committee.ifEmpty { "Session" }} · Live")
        .setContentTitle(n.title)
        .setContentText(n.text.ifEmpty { null })
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setCategory(NotificationCompat.CATEGORY_STATUS)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        .setContentIntent(openLive(link))
        .apply {
            if (n.countdownTo != null) setWhen(n.countdownTo).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true)
            else setShowWhen(false).setUsesChronometer(false)
        }
        .build()

    private fun openLive(link: String): PendingIntent = PendingIntent.getActivity(
        this, 0,
        Intent(Intent.ACTION_VIEW, Uri.parse(link)).setPackage(packageName).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    override fun onDestroy() {
        scope.cancel()
        NotificationManagerCompat.from(this).cancel(NOTICE_ID)
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL = "live_floor"
        private const val NOTICE_ID = 4101
        private const val EXTRA_EVENT = "eventId"
        private const val EXTRA_SESSION = "sessionId"
        private const val EXTRA_ME = "me"
        private const val EXTRA_COMMITTEE = "committee"
        private const val EXTRA_LINK = "link"

        fun canNotify(context: Context): Boolean =
            Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

        /** Silent and low: it is a status, not an alert. Re-creating an existing channel is a no-op. */
        fun ensureChannel(context: Context) {
            val ch = NotificationChannel(CHANNEL, "Live session", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Who has the floor and when you speak, while a session is open"
                setShowBadge(false)
            }
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
        }

        fun start(context: Context, eventId: String, sessionId: String, me: String, committee: String, link: String) {
            ensureChannel(context)
            val i = Intent(context, FloorService::class.java)
                .putExtra(EXTRA_EVENT, eventId).putExtra(EXTRA_SESSION, sessionId).putExtra(EXTRA_ME, me)
                .putExtra(EXTRA_COMMITTEE, committee).putExtra(EXTRA_LINK, link)
            // Started from the open live screen, so the app is in the foreground and this is allowed.
            runCatching { ContextCompat.startForegroundService(context, i) }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, FloorService::class.java))
        }
    }
}
