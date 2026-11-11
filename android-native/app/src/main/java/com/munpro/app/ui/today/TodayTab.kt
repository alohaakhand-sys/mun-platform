package com.munpro.app.ui.today

// Today (RN app/(tabs)/index.tsx and the mockup's three Today screens), now the conference's
// portal home opened from Home's "Continue" card and the Conferences tab (board A1): before allocation it
// tracks the application step by step; after, the delegation pass (press and hold to raise),
// the next session, the position paper, the latest announcement and the committee. Committees
// this account chairs get a door to the chair console in every state. Offline, the saved things
// say they are saved.

import androidx.compose.foundation.layout.offset
import com.munpro.app.ui.kit.tap
import com.munpro.app.ui.kit.Tone
import com.munpro.app.ui.kit.Chip
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.data.AuthState
import com.munpro.app.data.rememberAnnouncements
import com.munpro.app.data.rememberCached
import com.munpro.app.data.rememberReaderDoc
import com.munpro.app.domain.SessionSeat
import com.munpro.app.domain.Conference
import com.munpro.app.domain.clock
import com.munpro.app.domain.committeeOf
import com.munpro.app.domain.dayMonth
import com.munpro.app.domain.isAllocated
import com.munpro.app.domain.nextSession
import com.munpro.app.domain.relativeAgo
import com.munpro.app.domain.sentAt
import com.munpro.app.domain.todayOverline
import com.munpro.app.domain.untilLabel
import com.munpro.app.nav.ChairRoute
import com.munpro.app.nav.ConferenceRoute
import com.munpro.app.nav.EventRoute
import com.munpro.app.nav.NotificationsRoute
import com.munpro.app.nav.PositionPaperRoute
import com.munpro.app.nav.ReaderRoute
import com.munpro.app.nav.CONF_BROWSE
import com.munpro.app.nav.ScheduleRoute
import com.munpro.app.nav.TAB_CONFERENCES
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.Inter
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.Ring
import com.munpro.app.ui.kit.RoundButton
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SectionHeader
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.pass.Pass
import kotlinx.serialization.builtins.ListSerializer

@Composable
fun TodayScreen() {
    val c = palette
    val nav = LocalNav.current
    val auth by AppGraph.auth.state.collectAsStateWithLifecycle()
    val user = (auth as? AuthState.SignedIn)?.user
    val profile = (auth as? AuthState.SignedIn)?.profile
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()
    val online by AppGraph.network.online.collectAsStateWithLifecycle()

    val seats = rememberSessionSeats()
    val chairing: com.munpro.app.ui.kit.SectionScope.() -> Unit = { sessionRows(seats, nav) }

    val current = confs.current
    Screen(title = "Today", overline = todayOverline(), back = "Home", tabBar = false, savedAt = confs.savedAt, onRefresh = { AppGraph.conferences.reload() }) {
        // The conference's ceremony, when the organizer is hosting one right now.
        com.munpro.app.ui.live.CeremonyBanner(listOfNotNull(current?.event?.id?.takeIf { current != null && isAllocated(current) }) + seats.map { it.eventId })
        if (seats.isNotEmpty()) Section(header = "Sessions", rows = chairing)
        when {
            current == null -> Empty(
                if (confs.conferences == null) "Loading…" else "No conference yet",
                "Your delegation pass appears here once an organiser allocates you a country.",
                action = if (confs.conferences == null) null else ({
                    // Staff already have somewhere to be today; for them finding a conference is secondary.
                    MunButton("Find a Conference", { nav.tab(TAB_CONFERENCES, CONF_BROWSE) }, variant = if (seats.isEmpty()) ButtonVariant.Filled else ButtonVariant.Tinted)
                }),
                icon = Icons.card,
            )
            com.munpro.app.domain.watchesOnly(current) -> Watching(current)
            !isAllocated(current) -> Tracking(current)
            else -> Allocated(current, profile?.fullName, online)
        }
    }
}

/**
 * Committees this account has a place in other than as a delegate (chair, EB, organizer,
 * observer): a door to the committee console. Watch-only seats open the same console, which hides
 * every control the role can't use. Cached; Today and the Conferences tab share the copy.
 */
@Composable
fun rememberSessionSeats(): List<SessionSeat> {
    val uid = AppGraph.auth.user?.uid
    return rememberCached(uid?.let { "sessionSeats:$it" }, ListSerializer(SessionSeat.serializer()), maxAgeMs = com.munpro.app.data.Fresh.MEDIUM) { AppGraph.content.sessionSeats(uid!!) }.data.orEmpty()
}

/** The organizer's Live Control for each event they run, then each committee console. */
fun com.munpro.app.ui.kit.SectionScope.sessionRows(seats: List<SessionSeat>, nav: com.munpro.app.ui.Navigator) {
    seats.filter { it.organizerLevel }.distinctBy { it.eventId }.forEach { st ->
        cell("Live Control", subtitle = st.event.title, onClick = { nav.go(com.munpro.app.nav.LiveControlRoute(st.eventId)) })
    }
    seats.forEach { st ->
        cell(st.committee, subtitle = "${st.roleLabel}${if (st.run) "" else ", watching"}, ${st.event.title}", tinted = st.run, onClick = { nav.go(ChairRoute(st.eventId, st.committee)) })
    }
}

/** Approved as an observer, press or faculty advisor: a seat in the room, no placard. */
@Composable
private fun Watching(conf: Conference) {
    val nav = LocalNav.current
    val (app, event) = conf
    val committee = committeeOf(app)
    Section(header = event.title, footer = "You can follow the floor and the video. Points, motions and votes are for delegates.") {
        cell(committee, subtitle = "${app.role.ifEmpty { "Observer" }}, watching", tinted = true, onClick = { nav.go(com.munpro.app.nav.LiveRoute(app.id)) })
        cell("Conference", onClick = { nav.go(com.munpro.app.nav.ConferenceRoute(app.id)) })
    }
}

@Composable
private fun Tracking(conf: Conference) {
    val c = palette
    val nav = LocalNav.current
    val (app, event) = conf
    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        SectionHeader(event.title)
        Column(
            Modifier
                .fillMaxWidth()
                .clip(androidx.compose.foundation.shape.RoundedCornerShape(Radius.cell))
                .background(c.cell)
                .padding(16.dp),
        ) {
            Step("done", "Application sent", listOfNotNull(app.role.ifEmpty { null }, app.createdAt?.let(::dayMonth)).joinToString(", "), last = false)
            Step("now", "Under review", "The organiser reviews it and allocates a country", last = false)
            Step("todo", "Country allocated", "Your delegation pass appears here", last = true)
        }
    }
    Section {
        cell("View conference", tinted = true, onClick = { nav.go(EventRoute(event.id)) })
        cell("Browse more conferences", tinted = true, onClick = { nav.tab(TAB_CONFERENCES, CONF_BROWSE) })
    }
}

@Composable
private fun Allocated(conf: Conference, name: String?, online: Boolean) {
    val c = palette
    val nav = LocalNav.current
    val (app, event) = conf
    val committee = committeeOf(app)
    var raised by remember { mutableStateOf(false) }
    val cm = event.committees.firstOrNull { it.name == committee }
    val seatIndex = cm?.countries?.indexOfFirst { it.equals(app.assignedCountry, ignoreCase = true) } ?: -1
    val seat = if (cm != null && seatIndex >= 0) "${seatIndex + 1} of ${cm.capacity?.takeIf { it > 0 } ?: cm.countries.size}" else null

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Pass(
            country = app.assignedCountry!!, committee = committee, conference = event.title,
            delegate = name?.ifEmpty { null }, seat = seat, raisable = true, onRaisedChange = { raised = it },
        )
        Text(
            if (raised) "Placard raised. Tap the pass to lower it." else "Press and hold the pass to raise your placard",
            style = Type.footnote.copy(fontWeight = if (raised) FontWeight.SemiBold else FontWeight.Normal),
            color = if (raised) c.tint else c.label2, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
        )
    }

    // Offline: say what is saved on the phone (the mockup's offline Today).
    if (!online) {
        val guide = rememberReaderDoc("guide", event.id, committee = committee)
        val rules = rememberReaderDoc("rules", event.id)
        Section(footer = "Saved on this phone. They refresh when you're back online.") {
            cell("Schedule", value = if (event.schedule.isNotEmpty()) "Saved" else "Not saved", onClick = { nav.go(ScheduleRoute) })
            cell("Study guide", value = if (guide.data != null) "Saved" else "Not saved", onClick = if (guide.data != null) ({ nav.go(ReaderRoute("guide", event.id, committee = committee)) }) else null)
            cell("Rules of procedure", value = if (rules.data != null) "Saved" else "Not saved", onClick = if (rules.data != null) ({ nav.go(ReaderRoute("rules", event.id, committee = committee)) }) else null)
        }
        return
    }

    val next = nextSession(event)
    val now = System.currentTimeMillis()
    UpNext(next, now) { nav.go(ScheduleRoute) }

    // The four doors (board 03): the live session, papers, the dais thread, the programme.
    val uid = AppGraph.auth.user?.uid.orEmpty()
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        QuickAction("Session", Icons.live, com.munpro.app.ui.kit.SystemColors.green, Modifier.weight(1f)) { nav.go(com.munpro.app.nav.LiveRoute(app.id)) }
        QuickAction("Documents", Icons.folder, com.munpro.app.ui.kit.SystemColors.orange, Modifier.weight(1f)) { nav.go(com.munpro.app.nav.DocumentsRoute(app.id)) }
        QuickAction("Messages", Icons.messages, com.munpro.app.ui.kit.SystemColors.blue, Modifier.weight(1f)) {
            nav.go(com.munpro.app.nav.DaisThreadRoute("${event.id}|$committee|${com.munpro.app.data.SIDE_DELEGATE}", uid))
        }
        QuickAction("Schedule", Icons.cal, com.munpro.app.ui.kit.SystemColors.red, Modifier.weight(1f)) { nav.go(ScheduleRoute) }
    }

    var paperStatus by remember(app.id) { mutableStateOf<String?>(null) }
    val handedIn = !app.positionPaperContent.isNullOrBlank()
    androidx.compose.runtime.LaunchedEffect(app.id, handedIn) {
        if (handedIn) paperStatus = runCatching { AppGraph.papers.paperMarking(app.id, app.userId)?.paperStatus }.getOrNull() ?: "review"
    }
    Section {
        cell(
            "Position paper",
            subtitle = app.positionPaperUpdatedAt?.let { "Handed in ${dayMonth(it)}" } ?: "Not handed in yet",
            leading = { DocBadge("DOC") },
            inset = 62.dp,
            chevron = false,
            trailing = {
                when (paperStatus) {
                    "approved" -> Chip("Approved", Tone.Tint)
                    "revision" -> Chip("Revise", Tone.Warning)
                    "flagged" -> Chip("Flagged", Tone.Destructive)
                    null -> if (!handedIn) Chip("To do", Tone.Neutral)
                    else -> Chip("In review", Tone.Info)
                }
            },
            onClick = { nav.go(PositionPaperRoute(app.id)) },
        )
    }
}

/** "Up next · in 18 days": the next sitting with a ring that fills as it nears. */
@Composable
private fun UpNext(next: com.munpro.app.domain.Sitting?, now: Long, onClick: () -> Unit) {
    val c = palette
    val press = com.munpro.app.ui.kit.rememberPress()
    val live = next != null && next.start <= now
    val days = next?.let { ((it.start - now) / 86_400_000L).toInt() }
    Row(
        Modifier
            .fillMaxWidth()
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(com.munpro.app.ui.kit.Radius.cell))
            .background(c.cell)
            .tap(press, enabled = next != null, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Ring(if (next != null) maxOf(0.06f, 1f - minOf(1f, (next.start - now) / (30 * 86_400_000f))) else 0f, size = 44.dp)
            Text(
                when { next == null -> "–"; live -> "Now"; days!! >= 1 -> "$days"; else -> "0" },
                fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = if (live) 10.sp else 13.sp, color = c.label,
            )
        }
        Column(Modifier.weight(1f)) {
            if (next != null) Text(
                (if (live) "Happening now" else "Up next · " + untilLabel(next.start, now)).uppercase(),
                style = Type.caption.copy(fontSize = 10.sp), color = if (live) c.red else c.label2,
            )
            Text(if (next == null) "No sessions scheduled yet" else next.item.title.ifEmpty { "Session" }, style = Type.bodyMedium, color = c.label)
            Text(
                if (next == null) "The schedule appears once the organiser publishes it"
                else listOfNotNull(next.item.location.ifEmpty { null } ?: next.item.description?.ifEmpty { null }, clock(next.start)).joinToString(", "),
                style = Type.footnote, color = c.label2,
            )
        }
        if (next != null) com.munpro.app.ui.kit.Chevron(c.label3)
    }
}

@Composable
private fun QuickAction(label: String, icon: com.munpro.app.ui.kit.SfIconSpec, color: androidx.compose.ui.graphics.Color, modifier: Modifier, onClick: () -> Unit) {
    val c = palette
    val press = com.munpro.app.ui.kit.rememberPress()
    Column(
        modifier
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(20.dp))
            .background(c.cell)
            .tap(press, label = label, onClick = onClick)
            .padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Box(Modifier.size(38.dp).clip(androidx.compose.foundation.shape.RoundedCornerShape(11.dp)).background(color), contentAlignment = Alignment.Center) {
            com.munpro.app.ui.kit.SfIcon(icon, androidx.compose.ui.graphics.Color.White, size = 20.dp)
        }
        Text(label, style = Type.caption.copy(fontSize = 11.sp), color = c.label, maxLines = 1)
    }
}

/** A paper's file badge (DOC, WP, DR): the board's small square. */
@Composable
fun DocBadge(text: String) {
    val c = palette
    Box(Modifier.size(34.dp).clip(androidx.compose.foundation.shape.RoundedCornerShape(9.dp)).background(c.infoSoft), contentAlignment = Alignment.Center) {
        Text(text, fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 10.sp, color = c.info)
    }
}

// A real sequence, so it earns its numbered-looking markers.
@Composable
private fun Step(state: String, title: String, detail: String, last: Boolean) {
    val c = palette
    Row(Modifier.fillMaxWidth().height(androidx.compose.foundation.layout.IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxHeight()) {
            Box(
                Modifier
                    .size(24.dp)
                    .clip(CircleShape)
                    .background(if (state == "done") c.tint else c.cell)
                    .border(2.dp, if (state == "todo") c.label3 else c.tint, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                when (state) {
                    "done" -> Text("✓", color = c.onTint, fontSize = 13.sp, fontFamily = Inter, fontWeight = FontWeight.Bold)
                    "now" -> Box(Modifier.size(8.dp).clip(CircleShape).background(c.tint))
                }
            }
            if (!last) Box(Modifier.width(2.dp).weight(1f).padding(top = 2.dp).background(if (state == "done") c.tint else c.fill))
        }
        Column(Modifier.weight(1f).padding(top = 1.dp, bottom = if (last) 0.dp else 16.dp)) {
            Text(title, style = Type.bodyMedium.copy(fontWeight = if (state == "todo") FontWeight.Medium else FontWeight.SemiBold), color = if (state == "todo") c.label2 else c.label)
            if (detail.isNotEmpty()) Text(detail, style = Type.subhead, color = c.label2)
        }
    }
}

