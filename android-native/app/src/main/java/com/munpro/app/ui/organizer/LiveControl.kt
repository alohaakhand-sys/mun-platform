package com.munpro.app.ui.organizer

// The organizer's Live MUN control (web /dashboard/organizer/events/[id]/live): the one-time
// "committee sessions" switch and its note for participants, today's sittings with a way in
// (and a Close for any left open from an earlier day), and the opening / closing ceremonies.
//
// The control doc is subscribed (this screen is where the organizer watches it); the sittings
// table is a one-shot read with Refresh, like the web — a listener over every sitting would
// cost a read per change across the whole conference (Spark budget).

import com.munpro.app.ui.kit.Type
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.foundation.layout.Column
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import com.munpro.app.AppGraph
import com.munpro.app.domain.live.CeremonyState
import com.munpro.app.domain.live.LiveSession
import com.munpro.app.domain.live.PHASE
import com.munpro.app.domain.live.StaffAccess
import com.munpro.app.domain.live.ceremonyLabel
import com.munpro.app.domain.live.isSeated
import com.munpro.app.domain.live.sessionDateStr
import com.munpro.app.nav.CeremonyRoute
import com.munpro.app.nav.ChairRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Loading
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.PlainInput
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.Toggle
import com.munpro.app.ui.kit.TrailingAction
import com.munpro.app.ui.kit.palette
import kotlinx.coroutines.launch

@Composable
fun LiveControlScreen(eventId: String) {
    val c = palette
    val nav = LocalNav.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val repo = AppGraph.sessions
    val uid = AppGraph.auth.user?.uid.orEmpty()
    val access by produceState<StaffAccess?>(null, eventId, uid) { value = AppGraph.content.staffAccess(eventId, uid) }
    val event by produceState<com.munpro.app.domain.EventData?>(null, eventId) { value = AppGraph.events.getEventById(eventId) }
    // null until the first snapshot; a missing doc reads as "not started".
    var loaded by remember { mutableStateOf(false) }
    val control by remember(eventId) { repo.liveControl(eventId) }.collectAsState(initial = null)
    LaunchedEffect(control) { if (control != null) loaded = true }
    LaunchedEffect(Unit) { kotlinx.coroutines.delay(2500); loaded = true }

    var busy by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    fun run(key: String, fn: suspend () -> Unit) {
        if (busy != null) return
        busy = key; error = null
        scope.launch {
            try { fn() } catch (_: Exception) { error = "That didn't go through. Check your connection and try again." } finally { busy = null }
        }
    }

    var reloads by remember { mutableIntStateOf(0) }
    val sittings by produceState<List<Pair<String, LiveSession>>?>(null, eventId, reloads) {
        value = runCatching { repo.openSittings(eventId) }.getOrDefault(emptyList())
    }

    val a = access
    if (a == null || !loaded) return Screen(back = "Today", title = "Live Control", tabBar = false) { Loading() }
    if (!a.isOrganizerLevel) {
        return Screen(back = "Today", title = "Live Control", tabBar = false) {
            Empty("Organizers only", "Only the event owner or a co-organizer can control Live MUN.")
        }
    }

    val ctl = control
    val open = ctl?.sessionsOpen == true
    // The event's own today: a sitting from an earlier day is one nobody closed, not a live one.
    val today = remember(event?.timeZone) { sessionDateStr(event?.timeZone) }
    var note by remember(ctl?.note) { mutableStateOf(ctl?.note.orEmpty()) }

    Screen(back = "Today", title = "Live Control", overline = event?.title?.uppercase(), tabBar = false) {
        ErrorText(error)
        // The master switch leads (board 08): one card, tinted while sessions are open.
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            androidx.compose.foundation.layout.Row(
                Modifier.fillMaxWidth().clip(androidx.compose.foundation.shape.RoundedCornerShape(com.munpro.app.ui.kit.Radius.cell))
                    .background(if (open) c.tintSoft else c.cell).padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                com.munpro.app.ui.kit.IconTile(if (open) c.tint else com.munpro.app.ui.kit.SystemColors.gray, com.munpro.app.ui.kit.Icons.live)
                Column(Modifier.weight(1f)) {
                    Text(if (open) "Sessions are open" else "Sessions are closed", style = Type.headline, color = if (open) c.tint else c.label)
                    Text(if (open) "Chairs can gavel in; delegates can enter" else "No chair can start a sitting yet", style = Type.footnote, color = c.label2)
                }
                Toggle(open, { v -> run("gate") { repo.setSessionsOpen(eventId, v, uid) } }, "Committee sessions")
            }
            com.munpro.app.ui.kit.SectionFooter("Turned on once for the whole conference.")
        }

        Section(header = "Note for participants", footer = "Shown on the waiting screen while sessions are closed, e.g. \"Opens at 9:00 after registration\".") {
            item {
                PlainInput(note, { note = it.take(240) }, "Optional", modifier = Modifier.fillMaxWidth().padding(16.dp),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
            }
            if (note != ctl?.note.orEmpty()) cell("Save note", tinted = true, chevron = false, onClick = { run("note") { repo.setLiveControlNote(eventId, note.trim()) } })
        }

        Section(header = "Open sittings", footer = "A sitting from an earlier day was never closed; closing it keeps its record and marks.") {
            val rows = sittings
            when {
                rows == null -> cell("Loading…", chevron = false)
                rows.isEmpty() -> cell("No committee is sitting", chevron = false)
                else -> rows.forEach { (id, s) ->
                    val stale = s.dateStr.isNotEmpty() && s.dateStr < today
                    val present = s.attendance.values.count { isSeated(it.status) }
                    cell(
                        s.committeeId.ifEmpty { "—" },
                        inset = 34.dp,
                        leading = { com.munpro.app.ui.kit.Dot(if (stale) c.orange else c.tint, 7.dp) },
                        subtitle = listOfNotNull(
                            if (stale) "Not closed · ${s.dateStr}" else PHASE[s.phase] ?: s.phase,
                            "$present present",
                            s.live?.stage?.size?.takeIf { it > 0 }?.let { "$it on air" },
                        ).joinToString(" · "),
                        chevron = !stale,
                        trailing = if (stale) ({ TrailingAction("Close") }) else null,
                        onClick = if (stale) ({
                            scope.launch {
                                if (alerts.confirm("Close this sitting?", "The ${s.committeeId} sitting from ${s.dateStr} was never closed. Its record and marks stay as they are.", "Close")) {
                                    run("close:$id") { repo.closeStaleSitting(eventId, id); reloads++ }
                                }
                            }
                        }) else ({ nav.go(ChairRoute(eventId, s.committeeId)) }),
                    )
                }
            }
            cell("Refresh", tinted = true, chevron = false, inset = 50.dp,
                leading = { com.munpro.app.ui.kit.SfIcon(com.munpro.app.ui.kit.Icons.refresh, c.tint, size = 20.dp) },
                onClick = { reloads++ })
        }

        // Committees not sitting yet: the organizer can enter any of them to gavel in (7.3).
        val sittingNames = sittings.orEmpty().map { it.second.committeeId }.toSet()
        val idle = event?.committees.orEmpty().map { it.name }.filter { it.isNotEmpty() && it !in sittingNames }
        if (idle.isNotEmpty()) {
            Section(header = "Other committees", footer = "Enter to start or run a committee's sitting as its chair would.") {
                idle.forEach { name -> cell(name, subtitle = "Not started", onClick = { nav.go(ChairRoute(eventId, name)) }) }
            }
        }

        // Ceremonies as rows with one action each (board 88); the title and End live in a sheet.
        val ceremonies = listOf("opening", "closing").map { kind ->
            kind to ((if (kind == "opening") ctl?.opening else ctl?.closing) ?: CeremonyState("idle", ceremonyLabel(kind)))
        }
        var editing by remember { mutableStateOf<String?>(null) }
        fun start(kind: String, title: String) = run("start:$kind") { repo.startCeremony(eventId, kind, uid, title) }
        Section(header = "Ceremonies", footer = "Starting one again opens a fresh room. Only the organizer can host.") {
            ceremonies.forEach { (kind, st) ->
                val label = ceremonyLabel(kind)
                val title = st.title.ifEmpty { label }
                cell(
                    title,
                    subtitle = when (st.status) { "live" -> "Live now"; "ended" -> "Ended"; else -> "Not started" },
                    inset = 58.dp, chevron = false,
                    leading = { com.munpro.app.ui.kit.IconTile(if (kind == "opening") com.munpro.app.ui.kit.SystemColors.purple else com.munpro.app.ui.kit.SystemColors.indigo, if (kind == "opening") com.munpro.app.ui.kit.Icons.mega else com.munpro.app.ui.kit.Icons.trophy) },
                    trailing = {
                        when (st.status) {
                            "live" -> Pill("Enter", { nav.go(CeremonyRoute(eventId, kind)) }, filled = true, enabled = busy == null)
                            "ended" -> Pill("Start again", { start(kind, title) }, enabled = busy == null)
                            else -> Pill("Start", { start(kind, title) }, enabled = busy == null)
                        }
                    },
                    onClick = { editing = kind },
                )
            }
        }
        val open = ceremonies.firstOrNull { it.first == editing }
        CeremonySheet(open?.first, open?.second, busy != null, onDismiss = { editing = null },
            onRename = { kind, t -> run("title:$kind") { repo.setCeremonyTitle(eventId, kind, t) } },
            onStart = { kind, t -> editing = null; start(kind, t) },
            onEnter = { kind -> editing = null; nav.go(CeremonyRoute(eventId, kind)) },
            onEnd = { kind, st ->
                scope.launch {
                    if (alerts.confirm("End ${st.title.ifEmpty { ceremonyLabel(kind) }}?", "Video stops for everyone in the room.", "End")) {
                        editing = null
                        run("end:$kind") { repo.endCeremony(eventId, kind) }
                    }
                }
            })
    }
}

/** One ceremony's title and its whole lifecycle: start, enter, end. */
@Composable
private fun CeremonySheet(
    kind: String?, st: CeremonyState?, busy: Boolean, onDismiss: () -> Unit,
    onRename: (String, String) -> Unit, onStart: (String, String) -> Unit, onEnter: (String) -> Unit, onEnd: (String, CeremonyState) -> Unit,
) {
    // Keep the last ceremony while the sheet animates away.
    var last by remember { mutableStateOf<Pair<String, CeremonyState>?>(null) }
    if (kind != null && st != null) last = kind to st
    val (k, state) = last ?: return
    val label = ceremonyLabel(k)
    var title by remember(k, state.title) { mutableStateOf(state.title.ifEmpty { label }) }
    val live = state.status == "live"
    com.munpro.app.ui.kit.PageSheet(kind != null, onDismiss) {
        com.munpro.app.ui.kit.SheetHeader(label, leading = "Close", onLeading = onDismiss)
        Column(
            Modifier.fillMaxWidth().padding(start = com.munpro.app.ui.kit.Space.gutter, end = com.munpro.app.ui.kit.Space.gutter, top = 8.dp, bottom = 48.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Section(
                header = "Title",
                footer = when (state.status) {
                    "live" -> "Live now. Everyone in the conference can join and watch; you hand the floor to speakers inside the room."
                    "ended" -> "Ended. Starting it again opens a fresh room."
                    else -> "Committee sessions don't need to be open for a ceremony."
                },
            ) {
                item {
                    PlainInput(title, { title = it.take(120) }, label, modifier = Modifier.fillMaxWidth().padding(16.dp),
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words))
                }
                if (title.trim() != state.title && title.isNotBlank() && state.status != "idle") cell("Save title", tinted = true, chevron = false, onClick = { onRename(k, title.trim()) })
            }
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (live) {
                    com.munpro.app.ui.kit.MunButton("Enter Room", { onEnter(k) }, enabled = !busy)
                    com.munpro.app.ui.kit.MunButton("End Ceremony", { onEnd(k, state) }, variant = com.munpro.app.ui.kit.ButtonVariant.Tinted, destructive = true, enabled = !busy)
                } else {
                    com.munpro.app.ui.kit.MunButton(if (state.status == "ended") "Start Again" else "Start Ceremony", { onStart(k, title.trim().ifEmpty { label }) }, enabled = !busy)
                }
            }
        }
    }
}
