package com.munpro.app.ui.profile

// Settings -> Software Update and What's New, the "update available" prompt on opening the app,
// and the one-time notification permission ask. The update engine is data/Updates.kt.

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.data.ChangelogEntry
import com.munpro.app.data.Release
import com.munpro.app.data.UpdateState
import com.munpro.app.domain.ago
import com.munpro.app.nav.UpdateRoute
import com.munpro.app.notify.Notifier
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.kit.AlertButton
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.Notice
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.Tone
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/** The release an update state is about, if any. */
val UpdateState.pending: Release?
    get() = when (this) {
        is UpdateState.Available -> release
        is UpdateState.Downloading -> release
        is UpdateState.Ready -> release
        is UpdateState.Installing -> release
        is UpdateState.Failed -> release
        else -> null
    }

/** Settings -> Software Update. */
@Composable
fun UpdateScreen() {
    val c = palette
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val updates = AppGraph.updates
    val state by updates.state.collectAsStateWithLifecycle()
    val changelog by updates.changelog.collectAsStateWithLifecycle()
    // Back from "Install unknown apps": carry on with the install if it was just allowed.
    var waitingForPermission by remember { mutableStateOf(false) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle) {
        val obs = LifecycleEventObserver { _, e ->
            if (e == Lifecycle.Event.ON_RESUME && waitingForPermission && updates.canInstall()) {
                waitingForPermission = false
                scope.launch { updates.install() }
            }
        }
        lifecycle.addObserver(obs)
        onDispose { lifecycle.removeObserver(obs) }
    }
    LaunchedEffect(Unit) {
        Notifier.clearUpdate(context)
        if (state is UpdateState.Idle || state is UpdateState.Current || (state is UpdateState.Failed && state.pending == null)) updates.check()
    }

    fun install() {
        if (!updates.canInstall()) {
            waitingForPermission = true
            context.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")))
        } else scope.launch { updates.install() }
    }

    val release = state.pending
    Screen(back = "Settings", tabBar = false, title = "Software Update") {
        when (val s = state) {
            UpdateState.Idle, UpdateState.Checking -> Section { cell("Checking for updates…", chevron = false) }
            is UpdateState.Current -> Section(footer = "Checked ${ago(s.checkedAt).let { if (it == "now") "just now" else "$it ago" }}. The app also checks every 15 minutes and lets you know.") {
                cell("MUN Pilot ${updates.installedName}", subtitle = "MUN Pilot is up to date", chevron = false)
                cell("Check again", onClick = { scope.launch { updates.check() } }, chevron = false, tinted = true)
            }
            else -> {
                if (s is UpdateState.Failed) Notice(s.message, tone = Tone.Destructive)
                if (release != null) {
                    Section(header = "MUN Pilot ${release.versionName}", footer = "You have ${updates.installedName}. Your sign-in, saved conferences and settings stay as they are.") {
                        val notes = changelog.firstOrNull { it.versionCode == release.versionCode }?.notes.orEmpty()
                        item {
                            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                val size = updates.sizeFor(release)
                                Text(
                                    listOfNotNull(shortDate(release.publishedAt), if (size > 0) "%.0f MB".format(size / 1_048_576.0) else null).joinToString(" · "),
                                    style = Type.footnote, color = c.label2,
                                )
                                notes.forEach { Text("•  $it", style = Type.body, color = c.label) }
                            }
                        }
                    }
                    when (s) {
                        is UpdateState.Downloading -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            LinearProgressIndicator(progress = { s.progress }, color = c.tint, trackColor = c.fill, modifier = Modifier.fillMaxWidth())
                            Text("Downloading… ${(s.progress * 100).toInt()}%", style = Type.footnote, color = c.label2)
                        }
                        is UpdateState.Ready -> MunButton("Install Now", ::install)
                        is UpdateState.Installing -> MunButton("Installing…", {}, loading = true)
                        else -> MunButton("Download and Install", { scope.launch { updates.download() } })
                    }
                } else {
                    MunButton("Try Again", { scope.launch { updates.check() } }, variant = ButtonVariant.Tinted)
                }
            }
        }
    }
}

/** Settings -> What's New: every version's notes, newest first. */
@Composable
fun WhatsNewScreen() {
    val c = palette
    val changelog by AppGraph.updates.changelog.collectAsStateWithLifecycle()
    val installed = AppGraph.updates.installedCode
    Screen(back = "Settings", tabBar = false, title = "What's New") {
        changelog.forEach { e: ChangelogEntry ->
            val tag = when {
                e.versionCode == installed -> " · Installed"
                e.versionCode > installed -> " · Update"
                else -> ""
            }
            Section(header = "Version ${e.versionName}$tag", footer = shortDate(e.date)) {
                item {
                    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        e.notes.forEach { Text("•  $it", style = Type.body, color = c.label) }
                    }
                }
            }
        }
    }
}

/**
 * On opening the app: if a newer version is known (checked at most every 30 minutes, see
 * Updates.checkIfDue), ask once to update. "Later" stays quiet about that version for 12 hours.
 */
@Composable
fun UpdatePrompt() {
    val nav = LocalNav.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val state by AppGraph.updates.state.collectAsStateWithLifecycle()
    var asked by remember { mutableStateOf<Int?>(null) }
    val offer = (state as? UpdateState.Available)?.release ?: (state as? UpdateState.Ready)?.release
    LaunchedEffect(offer?.versionCode) {
        val r = offer ?: return@LaunchedEffect
        if (asked == r.versionCode || !AppGraph.updates.shouldPrompt(r)) return@LaunchedEffect
        asked = r.versionCode
        val note = AppGraph.updates.changelog.value.firstOrNull { it.versionCode == r.versionCode }?.notes?.take(3).orEmpty()
        alerts.show(
            "Update available",
            (listOf("MUN Pilot ${r.versionName} is ready to install.") + note.map { "• $it" }).joinToString("\n"),
            AlertButton("Later", AlertButton.Style.Cancel) { scope.launch { AppGraph.updates.snooze(r) } },
            AlertButton("Update") { nav.go(UpdateRoute) },
        )
    }
}

private const val ASKED_NOTIFY = "munpro.askedNotify"

/** Android 13+: asks for notifications once, after sign-in (shared with the live screen's ask). */
@Composable
fun NotificationPermissionAsk() {
    if (Build.VERSION.SDK_INT < 33) return
    val context = LocalContext.current
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(Unit) {
        if (!Notifier.enabled(context) && AppGraph.saved.getString(ASKED_NOTIFY) == null) {
            AppGraph.saved.putString(ASKED_NOTIFY, "1")
            ask.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}

private fun shortDate(iso: String): String? = runCatching {
    LocalDate.parse(iso.take(10)).format(DateTimeFormatter.ofPattern("d MMM yyyy", Locale.UK))
}.getOrNull()
