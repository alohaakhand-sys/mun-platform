package com.munpro.app.ui.live

// The conference-wide ceremony room (web /dashboard/ceremony/[eventId] + CeremonyConsole) and its
// "LIVE · Join" door (CeremonyLiveBanner).
//
// A ceremony is not a sitting: no roll call, no lists, no votes, no chat. One host (the
// organizer) on camera, whoever they hand the floor to, everyone else watching. It reuses the
// committee video stack; what makes it a ceremony is the reserved `__ceremony__<kind>` session
// doc and the token route's ceremony branch (publisher = the organizer or whoever is on
// `live.stage`, any approved delegate of the event may watch).
//
// Presence is asymmetric on purpose: only staff and the host publish a node. A ceremony can hold
// the whole conference and the Spark plan caps Realtime Database at 100 connections.

import com.munpro.app.ui.kit.tap
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.foundation.verticalScroll
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.munpro.app.AppGraph
import com.munpro.app.domain.live.EventLiveControl
import com.munpro.app.domain.live.LiveSession
import com.munpro.app.domain.live.StaffAccess
import com.munpro.app.domain.live.ceremonyLabel
import com.munpro.app.domain.live.liveCeremony
import com.munpro.app.domain.roleLabel
import com.munpro.app.nav.CeremonyRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.kit.Capsule
import com.munpro.app.ui.kit.Dot
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.Loading
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.live.video.VideoRoom
import com.munpro.app.ui.live.video.VideoStage
import com.munpro.app.ui.live.video.rememberLiveVideo

fun ceremonySessionId(kind: String) = "__ceremony__$kind"

private fun ceremonyTitle(control: EventLiveControl?, kind: String): String =
    (if (kind == "opening") control?.opening?.title else control?.closing?.title)?.ifEmpty { null } ?: ceremonyLabel(kind)

/**
 * "Opening Ceremony · LIVE · Join" for each of these events whose ceremony is live. ONE read per
 * event when the screen opens, no listener: a ceremony is a scheduled event, not something
 * anyone waits on this screen for (Spark read budget).
 */
@Composable
fun CeremonyBanner(eventIds: List<String>) {
    val c = palette
    val nav = LocalNav.current
    val key = eventIds.distinct().sorted()
    val live by produceState(emptyList<Triple<String, String, String>>(), key) {
        value = key.mapNotNull { id ->
            val ctl = runCatching { AppGraph.sessions.liveControlOnce(id) }.getOrNull()
            liveCeremony(ctl)?.let { k -> Triple(id, k, ceremonyTitle(ctl, k)) }
        }
    }
    if (live.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        live.forEach { (eventId, kind, title) ->
            val press = com.munpro.app.ui.kit.rememberPress()
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.cell)
                    .border(1.5.dp, c.red, RoundedCornerShape(20.dp))
                    .tap(press, label = "Join $title") { nav.go(CeremonyRoute(eventId, kind)) }
                    .padding(horizontal = 14.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                LiveBadge()
                Column(Modifier.weight(1f)) {
                    Text(title, style = Type.headline, color = c.label, maxLines = 2)
                    Text("The organizer is hosting right now", style = Type.footnote, color = c.label2)
                }
                Capsule("Join", { nav.go(CeremonyRoute(eventId, kind)) }, destructive = true)
            }
        }
    }
}

/** The red "● LIVE" capsule a ceremony wears everywhere (boards 89-93). */
@Composable
fun LiveBadge() {
    val c = palette
    Row(
        Modifier.clip(CircleShape).background(c.red).padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Dot(androidx.compose.ui.graphics.Color.White, 6.dp)
        Text("LIVE", style = Type.caption.copy(fontSize = 11.sp, fontWeight = FontWeight.Bold), color = androidx.compose.ui.graphics.Color.White)
    }
}

@Composable
fun CeremonyScreen(eventId: String, kind: String) {
    val c = palette
    val user = AppGraph.auth.user
    val uid = user?.uid.orEmpty()
    val repo = AppGraph.sessions
    val sessionId = ceremonySessionId(kind)
    val control by remember(eventId) { repo.liveControl(eventId) }.collectAsState(initial = null)
    // The room doc is read under the live read rules: ask for our membership marker first.
    val memberReady by produceState(false, uid, eventId) { com.munpro.app.data.Membership.ensure(uid, eventId); value = true }
    val session by remember(eventId, sessionId, memberReady) {
        if (memberReady) repo.session(eventId, sessionId) else kotlinx.coroutines.flow.flowOf(null)
    }.collectAsState(initial = null)
    val access by produceState<StaffAccess?>(null, eventId, uid) { value = AppGraph.content.staffAccess(eventId, uid) }
    val title = ceremonyTitle(control, kind)
    val state = if (kind == "opening") control?.opening else control?.closing

    val a = access
    if (a == null || control == null) return Screen(back = "Back", navTitle = ceremonyLabel(kind), tabBar = false, live = true) { Loading("Connecting…") }

    val isHost = a.isOrganizerLevel
    val live = state?.status == "live" && session?.phase != "closed"
    if (!live) {
        return Screen(back = "Back", title = title, tabBar = false, live = true) {
            Empty(
                icon = if (kind == "opening") com.munpro.app.ui.kit.Icons.mega else com.munpro.app.ui.kit.Icons.trophy,
                iconTone = com.munpro.app.ui.kit.Tone.Neutral,
                title = if (state?.status == "ended") "$title has ended" else "${ceremonyLabel(kind)} hasn't started",
                message = 
                when {
                    state?.status == "ended" -> "The organizer closed the room. Committee sessions carry on separately."
                    isHost -> "Start it from Live Control on the web, and the room opens for everyone."
                    else -> "The organizer hasn't opened this room yet. It appears here the moment they do."
                },
            )
        }
    }

    val s: LiveSession? = session
    val stage = s?.live?.stage.orEmpty()
    val onStage = uid in stage
    val myName = AppGraph.auth.profile?.fullName?.ifEmpty { null } ?: user?.displayName?.ifEmpty { null } ?: if (isHost) "Organizer" else "Participant"
    val myRole = if (isHost) "Organizer" else a.role.ifEmpty { null }?.let(::roleLabel)
    val room = remember(eventId, kind, uid) { VideoRoom(eventId, "", "", uid, ceremony = kind) }
    val video = rememberLiveVideo(room, amHost = isHost, onStage = onStage, ended = !live)
    // Only people who could be handed the floor announce themselves; the audience does not.
    val presence = rememberPresence(eventId, sessionId, uid, myName, null, myRole, enabled = live, publishSelf = isHost || a.role.isNotEmpty())

    var floorOpen by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val alerts = com.munpro.app.ui.kit.LocalAlerts.current
    Screen(
        back = "Back", navTitle = title, tabBar = false, live = true, gap = 16.dp,
        navRight = if (isHost) ({ com.munpro.app.ui.kit.RoundButton(com.munpro.app.ui.kit.Icons.people, "The floor", { floorOpen = true }, badge = stage.size) }) else null,
        // End Ceremony is docked under the room (board 89), out of reach of a stray scroll.
        bottomBar = if (isHost) ({
            com.munpro.app.ui.kit.MunButton("End Ceremony", {
                scope.launch {
                    if (alerts.confirm("End $title for everyone?", "Video stops for all participants.", "End")) {
                        runCatching { repo.endCeremony(eventId, kind) }
                    }
                }
            }, variant = com.munpro.app.ui.kit.ButtonVariant.Tinted, destructive = true)
        }) else null,
    ) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LiveBadge()
                Text("${stage.size + 1} on the floor", style = Type.footnote, color = c.label2)
            }
            Text(title, style = Type.title2.copy(fontWeight = FontWeight.Bold), color = c.label, textAlign = TextAlign.Center)
            Text(
                when { isHost -> "You're hosting. Hand the floor to speakers with the people button."; onStage -> "You have the floor. Your camera and mic are live."; else -> "You're watching. The organizer can hand you the floor." },
                style = Type.subhead, color = c.label2, textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 16.dp),
            )
        }
        video?.let { v ->
            // The speaker the organizer called up leads; otherwise the host.
            VideoStage(v, stage.firstOrNull(), uid, presence = presence, label = { u ->
                when {
                    u == uid -> "You"
                    else -> s?.staff?.get(u)?.name?.ifEmpty { null } ?: if (u !in stage) "Host" else "Speaker"
                }
            })
        }
        // The audience's mic state (board 93): off until the organizer hands them the floor.
        if (!isHost) {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(com.munpro.app.ui.kit.Radius.cell)).background(c.cell).padding(16.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                com.munpro.app.ui.kit.SfIcon(if (onStage) com.munpro.app.ui.kit.Icons.mic else com.munpro.app.ui.kit.Icons.micOff, if (onStage) c.tint else c.label2, size = 22.dp)
                Column(Modifier.weight(1f)) {
                    Text(if (onStage) "Your mic is on" else "Your mic is off", style = Type.headline, color = if (onStage) c.tint else c.label)
                    Text(if (onStage) "The organizer gave you the floor. Everyone can see and hear you." else "It turns on only if the organizer gives you the floor",
                        style = Type.footnote, color = c.label2)
                }
            }
        }
    }
    if (isHost) CeremonyFloorSheet(floorOpen, { floorOpen = false }, eventId, kind, stage, uid)
}

private const val CEREMONY_STAGE_MAX = 6

/** A person's initials in a soft tint circle (board 90); solid tint once they hold the floor. */
@Composable
private fun Initials(name: String, live: Boolean = false) {
    val c = palette
    val letters = name.split(' ').filter(String::isNotBlank).take(2).joinToString("") { it.take(1) }.uppercase().ifEmpty { "?" }
    androidx.compose.foundation.layout.Box(
        Modifier.size(32.dp).clip(CircleShape).background(if (live) c.tint else c.tintSoft),
        contentAlignment = Alignment.Center,
    ) { Text(letters, style = Type.caption.copy(fontSize = 12.sp, fontWeight = FontWeight.Bold), color = if (live) c.onTint else c.tint) }
}

private data class FloorCandidate(val uid: String, val name: String, val detail: String)

/**
 * CeremonyFloorPanel for a phone: everyone in the conference (accepted staff and approved
 * applicants, read once when the sheet opens), searchable; Give / Take back. Up to six at once,
 * a panel rather than a speakers list. The audience publishes no presence, so this list — not
 * the room's presence — is what makes anyone promotable.
 */
@Composable
private fun CeremonyFloorSheet(visible: Boolean, onDismiss: () -> Unit, eventId: String, kind: String, stage: List<String>, hostUid: String) {
    val c = palette
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val people by produceState<List<FloorCandidate>?>(null, visible, eventId) {
        if (!visible) return@produceState
        val staff = runCatching { AppGraph.content.eventStaff(eventId) }.getOrDefault(emptyList()).map {
            FloorCandidate(it.uid, it.name.ifEmpty { "Staff" }, listOf(roleLabel(it.role), it.committeeId).filter(String::isNotEmpty).joinToString(" · "))
        }
        val apps = runCatching { AppGraph.applications.getApplicationsByEvent(eventId) }.getOrDefault(emptyList())
            .filter { it.status == "approved" && it.userId.isNotEmpty() }.map { a ->
                val country = a.assignedCountry.orEmpty()
                FloorCandidate(a.userId, a.applicantName?.ifEmpty { null } ?: "Participant",
                    if (country.isNotEmpty()) "Delegate of ${com.munpro.app.domain.countryName(country)}" else a.role)
            }
        value = (staff + apps).filter { it.uid != hostUid }.distinctBy { it.uid }.sortedBy { it.name.lowercase() }
    }
    fun set(next: List<String>) {
        if (busy) return
        busy = true; error = null
        val all = people.orEmpty().associateBy { it.uid }
        // Label everyone on the resulting floor, not only the one just tapped.
        val labels = next.mapNotNull { u -> all[u]?.let { u to (it.name to it.detail) } }.toMap()
        scope.launch {
            try { AppGraph.sessions.setCeremonyStage(eventId, kind, next, labels) } catch (_: Exception) { error = "That didn't go through." } finally { busy = false }
        }
    }
    com.munpro.app.ui.kit.PageSheet(visible, onDismiss) {
        com.munpro.app.ui.kit.SheetHeader("The Floor", subtitle = "${stage.size} of $CEREMONY_STAGE_MAX on the microphone", trailing = "Done", onTrailing = onDismiss)
        Column(
            Modifier.fillMaxWidth().verticalScroll(androidx.compose.foundation.rememberScrollState())
                .padding(start = com.munpro.app.ui.kit.Space.gutter, end = com.munpro.app.ui.kit.Space.gutter, top = 8.dp, bottom = 48.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            com.munpro.app.ui.kit.ErrorText(error)
            com.munpro.app.ui.kit.SearchField(query, { query = it }, placeholder = "Search everyone")
            val list = people
            val q = query.trim().lowercase()
            val onFloor = list.orEmpty().filter { it.uid in stage }
            if (onFloor.isNotEmpty()) {
                Section(header = "On the floor") {
                    onFloor.forEach { p ->
                        cell(p.name, subtitle = p.detail.ifEmpty { null }, chevron = false, inset = 62.dp, leading = { Initials(p.name, live = true) },
                            trailing = { com.munpro.app.ui.kit.Pill("Take back", { set(stage - p.uid) }, enabled = !busy, tone = com.munpro.app.ui.kit.Tone.Destructive) })
                    }
                }
            }
            Section(header = "Everyone in the conference", footer = if (stage.size >= CEREMONY_STAGE_MAX) "The floor is full. Take someone back first." else null) {
                when {
                    list == null -> cell("Loading…", chevron = false)
                    else -> list.filter { it.uid !in stage && (q.isEmpty() || it.name.lowercase().contains(q) || it.detail.lowercase().contains(q)) }.take(60).forEach { p ->
                        cell(p.name, subtitle = p.detail.ifEmpty { null }, chevron = false, inset = 62.dp, leading = { Initials(p.name) },
                            trailing = { com.munpro.app.ui.kit.Pill("Give", { set(stage + p.uid) }, enabled = !busy && stage.size < CEREMONY_STAGE_MAX) })
                    }
                }
            }
        }
    }
}
