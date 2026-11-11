package com.munpro.app.ui.conference

// The delegate's committee in one grouped list (RN app/conference/[id].tsx + the mockup's
// "Conference home"), its Announcements (unread ones carry a blue dot, as in Mail), and one
// Reader for the long texts: an announcement, the rules of procedure, the study guide.

import kotlinx.coroutines.launch
import com.munpro.app.ui.kit.RoundButton
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.data.markAnnouncementRead
import com.munpro.app.data.rememberAnnouncements
import com.munpro.app.data.rememberReadAnnouncements
import com.munpro.app.data.rememberReaderDoc
import com.munpro.app.domain.clock
import com.munpro.app.domain.committeeOf
import com.munpro.app.domain.findConference
import com.munpro.app.domain.isAllocated
import com.munpro.app.domain.nextSession
import com.munpro.app.domain.sentAt
import com.munpro.app.domain.shortWhen
import com.munpro.app.domain.untilLabel
import com.munpro.app.nav.AnnouncementsRoute
import com.munpro.app.nav.DocumentsRoute
import com.munpro.app.nav.EventRoute
import com.munpro.app.nav.LiveRoute
import com.munpro.app.nav.MembersRoute
import com.munpro.app.nav.ReaderRoute
import com.munpro.app.nav.ScheduleRoute
import com.munpro.app.nav.Tabs
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.kit.Capsule
import com.munpro.app.ui.kit.CountBadge
import com.munpro.app.ui.kit.Dot
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.IconTile
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.Inter
import com.munpro.app.ui.kit.Loading
import com.munpro.app.ui.kit.Markdown
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SystemColors
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.markdownPreview
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.pass.Pass
import com.munpro.app.ui.pass.PassSize

@Composable
fun ConferenceHome(id: String) {
    val c = palette
    val nav = LocalNav.current
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()
    val conf = findConference(confs.conferences, id)
    // The same saved copies the Reader and Announcements use, so these rows work offline too.
    val news = rememberAnnouncements(conf?.event?.id, conf?.app?.role).data
    val read = rememberReadAnnouncements(conf?.event?.id)
    val hasGuide = rememberReaderDoc("guide", conf?.event?.id, committee = conf?.let { committeeOf(it.app) }).data != null
    val hasRules = rememberReaderDoc("rules", conf?.event?.id).data != null

    if (conf == null) {
        return Screen(back = "Back", tabBar = false) { Empty("Conference not found", "Pull down on Today to refresh your conferences.") }
    }
    val (app, event) = conf
    // A faculty advisor gets their institution's delegates instead of the portal, as on the web.
    if (isFacultyAdvisor(app)) return FacultyPanel(conf)
    // Until the fee clears, the payment lock replaces the portal (web PaymentRequiredGate).
    if (com.munpro.app.domain.getPaymentGate(app, event).blocksPortal) return PaymentRequired(conf)
    // An observer given a country is still an observer: no pass, no floor.
    val watching = com.munpro.app.domain.watchesOnly(conf)
    val allocated = isAllocated(conf) && !watching
    val committee = committeeOf(app)
    val next = nextSession(event)
    val unread = news?.count { it.id !in read } ?: 0

    var reportOpen by remember { mutableStateOf(false) }
    var passOpen by remember { mutableStateOf(false) }
    if (passOpen) PassSheet(event.id, event.title) { passOpen = false }
    val uid = AppGraph.auth.user?.uid.orEmpty()
    if (allocated && uid.isNotEmpty()) {
        val today = remember(event.timeZone) { com.munpro.app.domain.live.sessionDateStr(event.timeZone) }
        com.munpro.app.ui.live.OwnReportSheet(reportOpen, { reportOpen = false }, event.id, event.title, committee,
            com.munpro.app.domain.live.ParticipationIdentity(uid, app.assignedCountry.orEmpty(), app.id, event.id, committee, today), today)
    }
    // A sitting running now, from the same listeners Messages keeps (no extra reads).
    val feeds by AppGraph.messages.feeds.collectAsStateWithLifecycle()
    val sitting = feeds.firstOrNull { it.line.eventId == event.id && com.munpro.app.domain.sameCommittee(it.line.committee, committee) }?.live == true
    val threadKey = "${event.id}|$committee|${com.munpro.app.data.SIDE_DELEGATE}"
    // Room alerts for this committee (the Inbox listener; the web's bell in the portal).
    val allAlerts by AppGraph.inbox.alerts.collectAsStateWithLifecycle()
    val alerts = allAlerts.filter { it.eventId == event.id && com.munpro.app.domain.sameCommittee(it.committeeId, committee) }
    var alertsOpen by remember { mutableStateOf(false) }
    Screen(
        back = "Conferences", tabBar = false,
        overline = if (allocated || watching) event.title else null,
        title = if (allocated || watching) committee else event.title,
        navRight = if (allocated || watching) ({
            androidx.compose.foundation.layout.Row(horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
                RoundButton(Icons.bell, if (alerts.isEmpty()) "Room alerts" else "Room alerts, ${alerts.size}", { alertsOpen = true }, badge = alerts.size)
                if (allocated) RoundButton(Icons.chat, "Message the dais", { nav.go(com.munpro.app.nav.DaisThreadRoute(threadKey, uid)) })
            }
        }) else null,
    ) {
        if (allocated) Pass(app.assignedCountry!!, committee, size = PassSize.Compact)
        else if (!watching) Empty("Waiting for allocation", "Your committee and country appear here once the organiser allocates you.")

        if (allocated || watching) com.munpro.app.ui.live.CeremonyBanner(listOf(event.id))
        if (watching) {
            Section(footer = "Watch-only: you follow the floor and the video. Points, motions and votes are for delegates.") {
                cell(
                    "Committee session", subtitle = "${app.role.ifEmpty { "Observer" }}, watching", tinted = true,
                    leading = { IconTile(c.tint, Icons.live) }, inset = 58.dp, onClick = { nav.go(LiveRoute(app.id)) },
                )
            }
        }
        if (allocated) {
            Section(footer = "Opens when the organiser starts Live MUN and your chair calls the committee to order.") {
                cell(
                    "Committee session", subtitle = "Points, motions, votes and the speakers list",
                    leading = { IconTile(c.tint, Icons.live) }, inset = 58.dp, onClick = { nav.go(LiveRoute(app.id)) },
                    trailing = { if (sitting) com.munpro.app.ui.kit.Chip("Live", com.munpro.app.ui.kit.Tone.Destructive, dot = true) else com.munpro.app.ui.kit.Chip("Not open") },
                )
            }
        }

        if (next != null) {
            val now = System.currentTimeMillis()
            // "Join" only once the session is about to start (30 min) or under way.
            val joinable = allocated && now >= next.start - 30 * 60_000 && now < next.endOrHour
            Section {
                cell(
                    if (next.start <= now) "${next.item.title} is happening now" else "${next.item.title} starts at ${clock(next.start)}",
                    subtitle = listOfNotNull(next.item.description?.ifEmpty { null }, untilLabel(next.start), next.item.location.ifEmpty { null }).joinToString(", "),
                    leading = { Dot(c.red) }, inset = 36.dp,
                    chevron = !joinable,
                    trailing = if (joinable) ({ Capsule("Join", { nav.go(LiveRoute(app.id)) }) }) else null,
                    onClick = { nav.go(ScheduleRoute) },
                )
            }
        }

        // Every tab as a tile (B1.7), the optional modules among them (B3).
        val tiles = buildList {
            add(PortalTile("Documents", Icons.folder, SystemColors.orange) { nav.go(DocumentsRoute(app.id)) })
            add(PortalTile("News", Icons.mega, SystemColors.blue, badge = unread) { nav.go(AnnouncementsRoute(event.id, app.role, committee)) })
            add(PortalTile("Schedule", Icons.cal, SystemColors.red) { nav.go(ScheduleRoute) })
            add(PortalTile("Requests", Icons.bubble, SystemColors.teal) { nav.go(com.munpro.app.nav.RequestsRoute(app.id)) })
            // The optional modules, only when the organizer turned them on.
            val on = event.optionalModules
            // One personal QR pass for meals and rides (setup/qr-passes-plan.md).
            if (com.munpro.app.domain.passesInUse(event)) add(PortalTile("My pass", Icons.qr, SystemColors.green) { passOpen = true })
            if (Modules.FOOD in on) add(PortalTile("Food", Icons.clock, SystemColors.orange) { nav.go(com.munpro.app.nav.ModuleRoute(app.id, Modules.FOOD)) })
            if (Modules.TRANSPORT in on) add(PortalTile("Transport", Icons.pin, SystemColors.blue) { nav.go(com.munpro.app.nav.ModuleRoute(app.id, Modules.TRANSPORT)) })
            if (Modules.ACCOMMODATION in on) add(PortalTile("Stay", Icons.home, SystemColors.purple) { nav.go(com.munpro.app.nav.ModuleRoute(app.id, Modules.ACCOMMODATION)) })
            if (Modules.DRESS in on) add(PortalTile("Dress", Icons.profile, SystemColors.gray) { nav.go(com.munpro.app.nav.ModuleRoute(app.id, Modules.DRESS)) })
            if (allocated) add(PortalTile("People", Icons.people, SystemColors.purple) { nav.go(MembersRoute(app.id)) })
            if (allocated) add(PortalTile("Report", Icons.list, SystemColors.indigo) { reportOpen = true })
            if (allocated) add(PortalTile("Dais", Icons.bubble, c.tint) { nav.go(com.munpro.app.nav.DaisThreadRoute(threadKey, uid)) })
            if (hasGuide) add(PortalTile("Study guide", Icons.doc, SystemColors.green) { nav.go(ReaderRoute("guide", event.id, committee = committee)) })
            if (hasRules) add(PortalTile("Rules", Icons.book, SystemColors.indigo) { nav.go(ReaderRoute("rules", event.id, committee = committee)) })
            if (allocated) add(PortalTile("Certificate", Icons.trophy, SystemColors.gold) { nav.go(com.munpro.app.nav.CertificateRoute(app.id)) })
            if (allocated) add(PortalTile("Results", Icons.chart, SystemColors.green) { nav.go(com.munpro.app.nav.ResultsRoute(app.id)) })
            add(PortalTile("Details", Icons.info, SystemColors.gray) { nav.go(EventRoute(event.id)) })
        }
        PortalMenu(tiles)
        TeamPanel(conf)
    }
    RoomAlertsSheet(alertsOpen, { alertsOpen = false }, alerts)
}

@Composable
fun AnnouncementsScreen(eventId: String, role: String, committee: String) {
    val c = palette
    val nav = LocalNav.current
    val cached = rememberAnnouncements(eventId, role)
    val read = rememberReadAnnouncements(eventId)
    val list = cached.data ?: if (cached.failed) emptyList() else null

    Screen(back = committee.ifEmpty { "Back" }, tabBar = false, title = "Announcements") {
        when {
            list == null -> Loading()
            list.isEmpty() -> Empty("No announcements yet", "Messages from the secretariat to your committee appear here.")
            else -> Section {
                list.forEach { a ->
                    val unread = a.id !in read
                    cell(
                        a.subject,
                        subtitle = markdownPreview(a.body).take(90),
                        value = shortWhen(sentAt(a)),
                        inset = 34.dp,
                        leading = { Box(Modifier.size(9.dp).clip(CircleShape).background(if (unread) SystemColors.blue else androidx.compose.ui.graphics.Color.Transparent)) },
                        onClick = { nav.go(ReaderRoute("announcement", eventId, a.id)) },
                    )
                }
            }
        }
    }
}

/** kind: "announcement" | "rules" | "guide" */
@Composable
fun ReaderScreen(kind: String, eventId: String, id: String?, committee: String?) {
    val c = palette
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()
    val event = confs.conferences?.firstOrNull { it.event.id == eventId }?.event
    val by = event?.organizerName?.ifEmpty { null } ?: "Secretariat"
    // Saved on the device after the first read, so the rules and study guide open offline.
    val cached = rememberReaderDoc(kind, eventId, id, committee, by)
    LaunchedEffect(kind, id) { if (kind == "announcement" && id != null) markAnnouncementRead(eventId, id) }

    val back = when (kind) { "announcement" -> "Announcements"; "doc" -> "Documents"; else -> committee?.ifEmpty { null } ?: "Back" }
    val doc = cached.data
    // Aa: the reading size, remembered on the phone (board 03, Rules of procedure).
    var scale by remember { mutableStateOf(1f) }
    LaunchedEffect(Unit) { scale = AppGraph.saved.getString(READER_SCALE)?.toFloatOrNull() ?: 1f }
    val aa: @Composable () -> Unit = {
        RoundButton(Icons.text, "Text size", {
            scale = READER_STEPS[(READER_STEPS.indexOf(scale).takeIf { it >= 0 } ?: 0).plus(1) % READER_STEPS.size]
            AppGraph.scope.launch { AppGraph.saved.putString(READER_SCALE, scale.toString()) }
        })
    }
    val overline = when (kind) {
        "rules" -> listOfNotNull(committee?.ifEmpty { null }, "Rulebook").joinToString(" · ")
        "guide" -> listOfNotNull(committee?.ifEmpty { null }, "Study guide").joinToString(" · ")
        else -> null
    }
    Screen(back = back, tabBar = false, title = doc?.title, overline = overline, navRight = if (doc != null && kind != "announcement") aa else null) {
        when {
            !cached.has -> if (cached.failed) Empty("You're offline", "This hasn't been saved on your phone yet. Open it once with a connection and it will be here next time.") else Loading()
            doc == null -> Empty("Nothing to read yet", "The organiser hasn't published this.")
            else -> {
                if (kind == "announcement") {
                    // Who sent it and when, then nothing but the text (the mockup's announcement page).
                    Row(Modifier.offset(y = (-12).dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(Modifier.size(32.dp).clip(CircleShape).background(c.tint), contentAlignment = Alignment.Center) {
                            Text(initials(doc.by ?: by), color = c.onTint, fontFamily = Inter, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                        }
                        Text(listOfNotNull(doc.by ?: by, doc.meta, if (cached.saved) "Saved copy" else null).joinToString(" · "), style = Type.subhead, color = c.label2)
                    }
                } else if (doc.meta != null || cached.saved) {
                    Text(listOfNotNull(doc.meta, if (cached.saved) "Saved copy" else null).joinToString(" · "), style = Type.subhead, color = c.label2, modifier = Modifier.offset(y = (-14).dp))
                }
                val d = androidx.compose.ui.platform.LocalDensity.current
                androidx.compose.runtime.CompositionLocalProvider(androidx.compose.ui.platform.LocalDensity provides androidx.compose.ui.unit.Density(d.density, d.fontScale * scale)) {
                    Markdown(doc.body)
                }
            }
        }
    }
}

private const val READER_SCALE = "munpro.readerScale"
private val READER_STEPS = listOf(1f, 1.15f, 1.3f, 0.9f)

fun initials(name: String): String =
    name.trim().split(Regex("\\s+")).mapNotNull { it.firstOrNull()?.uppercaseChar() }.take(2).joinToString("")

