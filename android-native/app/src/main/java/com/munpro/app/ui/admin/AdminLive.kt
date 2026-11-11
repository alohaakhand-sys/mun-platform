package com.munpro.app.ui.admin

// App Admin live monitor (web /dashboard/admin/live-sessions): every running committee sitting
// across the platform, a silent observe, and Force stop. It uses the same server route as the
// web (GET lists from the `liveSessions` registry, server-cached 60 s; POST force-closes), read
// once on open and on Refresh — no polling, the Spark read cap is platform-wide.
//
// Observing is the ghost observer: the video joins as an audience that is never announced
// (token route `observer`, never a publisher), no presence node is written, and the server
// audits the join. Never drop `observer = true` here.

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.dp
import com.munpro.app.AppGraph
import com.munpro.app.data.Api
import com.munpro.app.data.MunJson
import com.munpro.app.domain.live.PHASE
import com.munpro.app.domain.live.videoEnded
import com.munpro.app.nav.AdminObserveRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.chair.WatchBoard
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Loading
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.live.rememberNow
import com.munpro.app.ui.live.rememberPresence
import com.munpro.app.ui.live.video.VideoRoom
import com.munpro.app.ui.live.video.rememberLiveVideo
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.put

/** requireAdmin's test, on the signed-in profile. */
fun isAppAdmin(role: String?): Boolean = role == "App Admin" || role == "admin"

@Serializable
data class AdminLiveSession(
    val eventId: String = "",
    val sessionId: String = "",
    val eventTitle: String = "",
    val committeeId: String = "",
    val dateStr: String = "",
    val phase: String = "",
    val presentCount: Int = 0,
    val totalDelegates: Int = 0,
    val onStageCount: Int = 0,
    val currentSpeaker: String = "",
    val updatedAtMs: Long = 0,
)

@Serializable
private data class AdminLiveList(val sessions: List<AdminLiveSession> = emptyList(), val stale: Boolean = false, val quotaExceeded: Boolean = false)

private suspend fun loadLive(): AdminLiveList? =
    Api.call("/api/admin/live-sessions")?.let { runCatching { MunJson.decodeFromJsonElement<AdminLiveList>(it) }.getOrNull() }

private suspend fun forceStop(eventId: String, sessionId: String): Boolean =
    (Api.call("/api/admin/live-sessions", "POST", buildJsonObject { put("eventId", eventId); put("sessionId", sessionId) }.toString()) as? JsonObject) != null

@Composable
fun AdminLiveScreen() {
    val nav = LocalNav.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val admin = isAppAdmin(AppGraph.auth.profile?.role)
    var reloads by remember { mutableIntStateOf(0) }
    var error by remember { mutableStateOf<String?>(null) }
    val list by produceState<AdminLiveList?>(null, reloads) { value = loadLive() ?: AdminLiveList().also { error = "Couldn't load the live sessions." } }

    if (!admin) return Screen(back = "Profile", title = "Live Sessions", tabBar = false) { Empty("App Admins only", "This monitor is for platform administrators.") }
    Screen(back = "Profile", title = "Live Sessions", tabBar = false, onRefresh = { reloads++ }) {
        ErrorText(error)
        val l = list
        when {
            l == null -> Loading()
            l.sessions.isEmpty() -> Empty("Nothing is sitting", "Running committee sessions across every conference appear here.")
            else -> Section(
                header = "Running now",
                footer = listOfNotNull(
                    "Observing is invisible: no presence, never on video. Force stop closes the sitting for everyone.",
                    if (l.stale) "Showing the last good snapshot${if (l.quotaExceeded) " (daily read quota reached)" else ""}." else null,
                ).joinToString(" "),
            ) {
                l.sessions.forEach { s ->
                    cell(
                        "${s.committeeId} · ${s.eventTitle}",
                        subtitle = listOfNotNull(
                            PHASE[s.phase] ?: s.phase,
                            "${s.presentCount}/${s.totalDelegates} present",
                            s.currentSpeaker.ifEmpty { null }?.let { "speaking: ${com.munpro.app.domain.countryName(it)}" },
                            s.onStageCount.takeIf { it > 0 }?.let { "$it on air" },
                        ).joinToString(" · "),
                        onClick = { nav.go(AdminObserveRoute(s.eventId, s.sessionId, s.committeeId, s.dateStr)) },
                    )
                }
            }
        }
        MunButton("Refresh", { reloads++ }, variant = ButtonVariant.Tinted)
    }
}

@Composable
fun AdminObserveScreen(eventId: String, sessionId: String, committee: String, dateStr: String) {
    val nav = LocalNav.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val uid = AppGraph.auth.user?.uid.orEmpty()
    val admin = isAppAdmin(AppGraph.auth.profile?.role)
    // An admin's own sync arms their presence-read mirror (/platformAdmins) for the ghost view.
    val memberReady by produceState(false, uid, eventId) { com.munpro.app.data.Membership.ensure(uid, eventId); value = true }
    val session by remember(eventId, sessionId, memberReady) {
        if (memberReady) AppGraph.sessions.session(eventId, sessionId) else kotlinx.coroutines.flow.flowOf(null)
    }.collectAsState(initial = null)
    var error by remember { mutableStateOf<String?>(null) }
    val now = rememberNow()

    if (!admin) return Screen(back = "Live Sessions", title = committee, tabBar = false) { Empty("App Admins only", "This view is for platform administrators.") }
    val s = session ?: return Screen(back = "Live Sessions", title = committee, tabBar = false, live = true) { Loading("Connecting…") }

    // The ghost: audience for life, never announced, never publishes presence.
    val room = remember(eventId, committee, dateStr, uid) { VideoRoom(eventId, committee, dateStr, uid, observer = true) }
    val video = rememberLiveVideo(room, amHost = false, onStage = false, ended = videoEnded(s))
    val presence = rememberPresence(eventId, sessionId, uid, "", null, null, enabled = !videoEnded(s), publishSelf = false)

    Screen(back = "Live Sessions", navTitle = committee, tabBar = false, live = true, gap = 20.dp) {
        WatchBoard(s, now, "App Admin, invisible", video, uid, presence)
        ErrorText(error)
        if (!videoEnded(s)) {
            MunButton("Force Stop Session", {
                scope.launch {
                    if (alerts.confirm("Force stop this sitting?", "$committee closes for everyone: the video ends and the console locks. Its record and marks stay.", "Force Stop")) {
                        if (forceStop(eventId, sessionId)) nav.back() else error = "Couldn't stop the sitting."
                    }
                }
            }, variant = ButtonVariant.Tinted, destructive = true)
        }
    }
}
