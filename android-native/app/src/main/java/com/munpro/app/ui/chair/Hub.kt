package com.munpro.app.ui.chair

// The chair hub, between sittings (board B4; web dashboard/chair and chair/committee/[id]).
// Committees you sit on the dais of; a committee's hub with its numbers and tabs; the day's
// marking as one row per delegation (daily %, attendance, floor activity, suggestions from the
// live floor); one delegation's marks with Add / remove, the floor record, feedback and how the
// final is computed; the motion log; and position papers to grade, with the dais's private notes.
// Requests, the study guide, awards and room alerts (board B5) live in HubTools.kt. Data:
// ChairHubRepo, MarkingRepo.

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.data.Fresh
import com.munpro.app.data.LogItem
import com.munpro.app.data.live.MarkingBase
import com.munpro.app.data.rememberCached
import com.munpro.app.domain.ApplicationData
import com.munpro.app.domain.DEFAULT_OVERALL_WEIGHT
import com.munpro.app.domain.DailyMarking
import com.munpro.app.domain.EventData
import com.munpro.app.domain.SessionSeat
import com.munpro.app.domain.StandingRow
import com.munpro.app.domain.autoFillSuggestion
import com.munpro.app.domain.clampMark
import com.munpro.app.domain.computeDailyScore
import com.munpro.app.domain.computeFinalScore
import com.munpro.app.domain.countryName
import com.munpro.app.domain.dayLabel
import com.munpro.app.domain.dayMonth
import com.munpro.app.domain.deriveDays
import com.munpro.app.domain.getEventStartMs
import com.munpro.app.domain.isAttended
import com.munpro.app.domain.isPaperDoc
import com.munpro.app.domain.live.ParticipationSummary
import com.munpro.app.domain.markingMode
import com.munpro.app.domain.rankEntries
import com.munpro.app.domain.sameCommittee
import com.munpro.app.domain.splitMarkings
import com.munpro.app.domain.wordCount
import com.munpro.app.nav.ChairRoute
import com.munpro.app.nav.ChatRoute
import com.munpro.app.nav.CommitteeHubRoute
import com.munpro.app.nav.GradePaperRoute
import com.munpro.app.nav.HubMarkingRoute
import com.munpro.app.nav.MotionLogRoute
import com.munpro.app.nav.AwardsRoute
import com.munpro.app.nav.PapersRoute
import com.munpro.app.nav.RequestInboxRoute
import com.munpro.app.nav.StudyGuideEditRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.conference.PortalMenu
import com.munpro.app.ui.conference.PortalTile
import com.munpro.app.ui.home.FilterChips
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.Chip
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Flag
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.Inter
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.Markdown
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.PlainInput
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.RoundButton
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SectionFooter
import com.munpro.app.ui.kit.SectionHeader
import com.munpro.app.ui.kit.Segmented
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.Space
import com.munpro.app.ui.kit.Spinner
import com.munpro.app.ui.kit.SystemColors
import com.munpro.app.ui.kit.Toggle
import com.munpro.app.ui.kit.Tone
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import kotlin.math.roundToInt

private fun fmt(v: Double) = v.roundToInt().let { if (it > 0) "+$it" else "$it" }
private fun dayName(d: String) = runCatching { dayLabel(java.time.LocalDate.parse(d)) }.getOrDefault(d)
private fun today() = java.time.LocalDate.now().toString()

/** Committees I sit on the dais of (chair tier, or the Executive Board over them). */
@Composable
private fun rememberDaisSeats(): List<SessionSeat>? {
    val seats by AppGraph.messages.seats.collectAsStateWithLifecycle()
    return seats?.filter { it.dais }?.distinctBy { it.eventId + "|" + it.committee }
}

@Composable
internal fun rememberRoster(eventId: String, committee: String) =
    rememberCached("hubRoster:$eventId:$committee", ListSerializer(ApplicationData.serializer()), Fresh.MEDIUM) { AppGraph.chairHub.roster(eventId, committee) }

@Composable
private fun rememberCommitteeMarks(eventId: String, committee: String) =
    rememberCached("hubMarks:$eventId:$committee", ListSerializer(DailyMarking.serializer()), Fresh.SHORT) { AppGraph.markings.committee(eventId, committee) }

@Composable
internal fun rememberEvent(eventId: String): EventData? {
    val seats by AppGraph.messages.seats.collectAsStateWithLifecycle()
    return seats?.firstOrNull { it.eventId == eventId }?.event
}

// ---------------------------------------------------------------------------------------------
// B4.1 · Chair hub
// ---------------------------------------------------------------------------------------------

@Composable
fun ChairHubScreen() {
    val c = palette
    val nav = LocalNav.current
    val seats = rememberDaisSeats()
    Screen(back = "Profile", tabBar = false, title = "Chair hub", onRefresh = { AppGraph.messages.refresh() }) {
        when {
            seats == null -> Spinner()
            seats.isEmpty() -> Empty("No committees yet", "Committees you chair or vice-chair appear here once you accept the invitation.", icon = Icons.gavel)
            else -> seats.sortedBy { getEventStartMs(it.event) ?: Long.MAX_VALUE }.forEach { s ->
                val roster = rememberRoster(s.eventId, s.committee).data
                val guide by produceState<Boolean?>(null, s.eventId, s.committee) { value = AppGraph.chairHub.hasStudyGuide(s.eventId, s.committee) }
                val day = getEventStartMs(s.event)?.let { dayMonth(it) }
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Chip(s.roleLabel, Tone.Tint)
                        day?.let { Text(it, style = Type.footnote, color = c.label2) }
                    }
                    Text(s.committee, style = Type.headline, color = c.label)
                    Text(listOfNotNull(s.event.title, roster?.let { "${it.size} delegates" }).joinToString(" · "), style = Type.footnote, color = c.label2)
                    Text(
                        listOfNotNull(
                            guide?.let { if (it) "Study guide uploaded" else "Study guide pending" },
                            roster?.let { r -> "${r.count { !it.positionPaperContent.isNullOrBlank() || !it.positionPaperUrl.isNullOrBlank() }}/${r.size} papers" },
                        ).joinToString(" · "),
                        style = Type.footnote, color = c.label2,
                    )
                    MunButton("Manage Committee", { nav.go(CommitteeHubRoute(s.eventId, s.committee)) }, height = 42.dp, modifier = Modifier.padding(top = 6.dp))
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// B4.2 · Committee hub
// ---------------------------------------------------------------------------------------------

@Composable
fun CommitteeHubScreen(eventId: String, committee: String) {
    val c = palette
    val nav = LocalNav.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    // Any seat that runs the committee: its dais, or the Executive Board / organizer over it.
    val seats by AppGraph.messages.seats.collectAsStateWithLifecycle()
    val seat = seats?.filter { it.eventId == eventId && sameCommittee(it.committee, committee) && it.run }?.let { l -> l.firstOrNull { it.dais } ?: l.firstOrNull() }
    val event = seat?.event
    val roster = rememberRoster(eventId, committee)
    val marks = rememberCommitteeMarks(eventId, committee)
    val uid = AppGraph.auth.user?.uid.orEmpty()
    val inbox by remember(eventId, uid) { AppGraph.chairHub.inbox(eventId, uid) }.collectAsStateWithLifecycle(null)
    val requests = inbox?.count { it.status != "resolved" && it.status != "rejected" }
    val access by produceState<com.munpro.app.domain.live.StaffAccess?>(null, eventId, uid) { value = runCatching { AppGraph.content.staffAccess(eventId, uid) }.getOrNull() }
    // The web hub's gates: the guide and room alerts for whoever runs the committee, awards for who marks it.
    val canManage = access?.let { it.isOrganizerLevel || it.isChairOf(committee) || it.isExecBoardOf(committee) } ?: seat?.dais ?: false
    val canMark = access?.let { it.isOrganizerLevel || it.isChairOf(committee) || it.can("canMarkDelegates") } ?: seat?.dais ?: false
    val chats by AppGraph.chats.list.collectAsStateWithLifecycle()
    var messaging by remember { mutableStateOf(false) }
    var alerting by remember { mutableStateOf(false) }
    var passOpen by remember { mutableStateOf(false) }

    Screen(back = "Chair hub", tabBar = false, title = committee, overline = listOfNotNull(event?.title, event?.let { e -> getEventStartMs(e)?.let { dayMonth(it) } }).joinToString(" · ").ifEmpty { null },
        savedAt = marks.savedAt, onRefresh = {}) {
        val r = roster.data
        val all = marks.data.orEmpty()
        val (daily, finals) = splitMarkings(all).let { (d, _) -> d.filter { !it.dateStr.isNullOrEmpty() } to all.filter { it.kind == "final" || it.id.endsWith("__final") } }
        val templates = event?.markingTemplates.orEmpty()
        val mode = markingMode(event)
        val graded = daily.filter { computeDailyScore(it, templates, mode).present }.map { it.delegateId }.distinct().size
        val top = finals.mapNotNull { it.finalScore }.maxOrNull()?.roundToInt()
            ?: daily.mapNotNull { computeDailyScore(it, templates, mode).pct }.maxOrNull()?.roundToInt()
        val papers = r?.count { !it.positionPaperContent.isNullOrBlank() || !it.positionPaperUrl.isNullOrBlank() }
        Text("${seat?.roleLabel ?: "Dais"} · ${r?.size ?: "–"} approved delegates", style = Type.subhead, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Stat("${graded}/${r?.size ?: "–"}", "Graded", Modifier.weight(1f))
            Stat(top?.let { "$it%" } ?: "N/A", "Top score", Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Stat(requests?.toString() ?: "–", "Open requests", Modifier.weight(1f))
            Stat("${papers ?: "–"}/${r?.size ?: "–"}", "Papers in", Modifier.weight(1f))
        }
        MunButton("Launch Live MUN", { nav.go(ChairRoute(eventId, committee)) }, icon = Icons.live)
        val toGrade = r?.count { a -> (!a.positionPaperContent.isNullOrBlank() || !a.positionPaperUrl.isNullOrBlank()) && all.none { m -> m.delegateId == a.userId && m.paperStatus != null } } ?: 0
        PortalMenu(listOf(
            PortalTile("Marking", Icons.chart, SystemColors.green) { nav.go(HubMarkingRoute(eventId, committee)) },
            PortalTile("Motion log", Icons.list, SystemColors.indigo) { nav.go(MotionLogRoute(eventId, committee)) },
            PortalTile("Papers", Icons.doc, SystemColors.blue, badge = toGrade) { nav.go(PapersRoute(eventId, committee)) },
            PortalTile("Requests", Icons.alert, SystemColors.orange, badge = requests ?: 0) { nav.go(RequestInboxRoute(eventId, committee)) },
        ) + listOfNotNull(
            if (canManage) PortalTile("Study guide", Icons.book, SystemColors.purple) { nav.go(StudyGuideEditRoute(eventId, committee)) } else null,
            if (canMark) PortalTile("Awards", Icons.trophy, SystemColors.gold) { nav.go(AwardsRoute(eventId, committee)) } else null,
            if (canManage) PortalTile("Room alert", Icons.bell, SystemColors.red) { alerting = true } else null,
            // The staff member's own QR pass, when the organizer runs meals or transport.
            if (com.munpro.app.domain.passesInUse(event)) PortalTile("My pass", Icons.qr, SystemColors.green) { passOpen = true } else null,
            if (com.munpro.app.domain.passesInUse(event) && access?.can("canScanPasses") == true) PortalTile("Scan passes", Icons.qr, SystemColors.teal) { nav.go(com.munpro.app.nav.ScanRoute(eventId)) } else null,
        ) + listOf(
            PortalTile("Message", Icons.bubble, c.tint) {
                val me = AppGraph.chats.me() ?: return@PortalTile
                val name = "$committee Committee"
                // One committee group per chair and conference (the web made a new one every time).
                chats.orEmpty().firstOrNull { it.isGroup && it.eventId == eventId && it.createdBy == me.uid && it.groupName == name }?.let { nav.go(ChatRoute(it.id)); return@PortalTile }
                if (messaging || r.isNullOrEmpty()) return@PortalTile
                messaging = true
                scope.launch {
                    runCatching { AppGraph.chats.createGroup(name, r.map { com.munpro.app.data.ChatPerson(it.userId, it.applicantName.orEmpty().ifEmpty { "Delegate" }, "") }, eventId = eventId) }
                        .onSuccess { nav.go(ChatRoute(it)) }
                        .onFailure { alerts.show("Couldn't start the group", "Check your connection and try again.") }
                    messaging = false
                }
            },
        ))
    }
    RoomAlertSheet(alerting, { alerting = false }, eventId, committee)
    if (passOpen) com.munpro.app.ui.conference.PassSheet(eventId, event?.title) { passOpen = false }
}

@Composable
internal fun Stat(value: String, label: String, modifier: Modifier) {
    val c = palette
    Column(modifier.clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(14.dp)) {
        Text(value, fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 24.sp, color = c.label)
        Text(label, style = Type.footnote, color = c.label2)
    }
}

// ---------------------------------------------------------------------------------------------
// B4.3 · Marking, the day
// ---------------------------------------------------------------------------------------------

private enum class Sort(val label: String) { Unscored("Unscored first"), Daily("Daily %"), Country("Country") }

/** The conference days: the organizer's marking days, the days with marks, and today. */
private fun hubDays(event: EventData?, marks: List<DailyMarking>): List<String> =
    (event?.scoringConfig?.markingDays.orEmpty() + marks.mapNotNull { it.dateStr?.ifEmpty { null } } + today()).toSortedSet().toList()

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HubMarkingScreen(eventId: String, committee: String) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val event = rememberEvent(eventId)
    val roster = rememberRoster(eventId, committee).data
    val committeeMarks = rememberCommitteeMarks(eventId, committee).data.orEmpty()
    val days = hubDays(event, committeeMarks)
    var day by rememberSaveable { mutableStateOf(today()) }
    val live by remember(eventId, committee, day) { AppGraph.markings.daily(eventId, committee, day) }.collectAsState(null)
    val dayMarks = live ?: committeeMarks.filter { it.dateStr == day }
    val floor by produceState<List<ParticipationSummary>>(emptyList(), eventId, committee, day) { value = AppGraph.chairHub.participation(eventId, committee, day) }
    var sort by rememberSaveable { mutableStateOf(Sort.Unscored) }
    var unscoredOnly by rememberSaveable { mutableStateOf(false) }
    var open by remember { mutableStateOf<String?>(null) }
    var applying by remember { mutableStateOf(false) }
    val templates = event?.markingTemplates.orEmpty()
    val mode = markingMode(event)
    val uid = AppGraph.auth.user?.uid.orEmpty()

    val rows = roster.orEmpty().map { a ->
        val m = dayMarks.firstOrNull { it.delegateId == a.userId }
        val p = floor.firstOrNull { it.delegateId == a.userId }
        Triple(a, computeDailyScore(m, templates, mode), m?.attendanceStatus ?: p?.attendanceStatus)
    }.filter { !unscoredOnly || !it.second.present }.let { l ->
        when (sort) {
            Sort.Daily -> l.sortedWith(compareByDescending<Triple<ApplicationData, com.munpro.app.domain.DailyScore, String?>> { it.second.pct ?: -1.0 }.thenBy { countryName(it.first.assignedCountry.orEmpty()) })
            Sort.Unscored -> l.sortedWith(compareBy<Triple<ApplicationData, com.munpro.app.domain.DailyScore, String?>> { it.second.present }.thenBy { countryName(it.first.assignedCountry.orEmpty()) })
            Sort.Country -> l.sortedBy { countryName(it.first.assignedCountry.orEmpty()) }
        }
    }
    val scored = rows.count { it.second.present }
    val present = rows.count { isAttended(it.third) }
    val mean = rows.mapNotNull { it.second.pct }.takeIf { it.isNotEmpty() }?.average()

    // Suggestions from the day's live floor (criteria tied to a floor metric).
    val suggestions = roster.orEmpty().flatMap { a ->
        val p = floor.firstOrNull { it.delegateId == a.userId }
        templates.mapNotNull { t -> autoFillSuggestion(t, p)?.let { Triple(a, t, it) } }
    }

    fun base(a: ApplicationData) = MarkingBase(eventId, committee, a.userId, a.id, day, uid, mode)

    Screen(back = committee, tabBar = false, title = "Marking", overline = mean?.let { "Committee mean ${it.roundToInt()}%" } ?: committee) {
        DayStepper(days, day) { day = it }
        Text("$scored of ${roster?.size ?: 0} scored · ${if (floor.isEmpty() && dayMarks.all { it.attendanceStatus == null }) "no roll call recorded" else "$present present"}",
            style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp))
        FilterChips(Sort.entries.map { it to it.label }, sort) { sort = it }
        Row(Modifier.padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Unscored only", style = Type.subhead, color = c.label, modifier = Modifier.weight(1f))
            Toggle(unscoredOnly, { unscoredOnly = it }, "Unscored only")
        }
        if (templates.isEmpty()) { Empty("No marking criteria yet", "The organizer sets the committee's rubric on the website.", icon = Icons.chart); return@Screen }
        if (suggestions.isNotEmpty()) Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.tintSoft).padding(14.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text("${suggestions.size} mark${if (suggestions.size == 1) "" else "s"} suggested from ${dayName(day)}'s floor activity", style = Type.subhead, color = c.label, modifier = Modifier.weight(1f))
            Pill(if (applying) "…" else "Apply", {
                scope.launch {
                    if (!alerts.confirm("Apply ${suggestions.size} suggestions?", "Each suggested mark is added to that criterion's marks for the day.", "Apply")) return@launch
                    applying = true
                    runCatching {
                        suggestions.forEach { (a, t, sug) ->
                            val v = if (mode == "binary") (if (sug > 0) 1.0 else 0.0) else clampMark(sug, -100.0, 100.0)
                            AppGraph.markings.appendEntry(base(a), t.id, v)
                        }
                    }.onFailure { alerts.show("Some marks didn't save", "Check your connection and try again.") }
                    applying = false
                }
            }, filled = true, enabled = !applying)
        }
        when {
            roster == null -> Spinner()
            rows.isEmpty() -> Text(if (unscoredOnly) "Everyone has a mark today." else "No approved delegates yet.", style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp))
            else -> Section(footer = if (mode == "binary") "Each criterion is −1, 0 or +1." else "Each criterion is −100 to +100. The day's % averages the criteria scored.") {
                rows.forEach { (a, d, att) ->
                    val p = floor.firstOrNull { it.delegateId == a.userId }
                    cell(
                        countryName(a.assignedCountry.orEmpty()).ifEmpty { a.applicantName.orEmpty() },
                        subtitle = listOfNotNull(attendanceLabel(att), p?.let { floorLine(it) }).joinToString(" · ").ifEmpty { null },
                        leading = { Flag(a.assignedCountry, 22f) }, inset = 52.dp,
                        value = d.pct?.let { "${it.roundToInt()}%" } ?: "—",
                        onClick = { open = a.id },
                    )
                }
            }
        }
    }

    val order = rows.map { it.first }
    open?.let { id ->
        val a = order.firstOrNull { it.id == id } ?: roster.orEmpty().firstOrNull { it.id == id }
        if (a != null && event != null) DelegateSheet(
            a, event, committee, day, days, committeeMarks.filter { it.delegateId == a.userId }, dayMarks.firstOrNull { it.delegateId == a.userId },
            floor.firstOrNull { it.delegateId == a.userId }, roster.orEmpty(), committeeMarks,
            onPrev = order.getOrNull(order.indexOfFirst { it.id == id } - 1)?.let { p -> { open = p.id } },
            onNext = order.getOrNull(order.indexOfFirst { it.id == id } + 1)?.let { n -> { open = n.id } },
        ) { open = null }
    }
}

private fun attendanceLabel(s: String?) = when (s) {
    "present" -> "Present"
    "present_and_voting" -> "P&V"
    "late" -> "Late"
    "absent" -> "Absent"
    else -> null
}

private fun floorLine(p: ParticipationSummary): String? = listOfNotNull(
    p.speeches.takeIf { it > 0 }?.let { "GSL $it" },
    p.caucusSpeeches.takeIf { it > 0 }?.let { "Caucus $it" },
    (p.pointsRaised ?: p.points).takeIf { it > 0 }?.let { "Pts $it" },
    (p.motionsProposed ?: p.motions).takeIf { it > 0 }?.let { "Mot $it" },
).joinToString(" ").ifEmpty { null }

@Composable
private fun DayStepper(days: List<String>, day: String, onDay: (String) -> Unit) {
    val c = palette
    val i = days.indexOf(day)
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        RoundButton(Icons.back, "Previous day", { days.getOrNull(i - 1)?.let(onDay) })
        Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(dayName(day), style = Type.headline, color = c.label)
            Text(if (day == today()) "Today" else "Day ${i + 1} of ${days.size}", style = Type.caption.copy(fontWeight = FontWeight.Normal), color = c.label2)
        }
        Box(Modifier.scale(-1f, 1f)) { RoundButton(Icons.back, "Next day", { days.getOrNull(i + 1)?.let(onDay) }) }
    }
}

// ---------------------------------------------------------------------------------------------
// B4.4 · One delegation, B4.5 · Add a mark, B4.6 · How the final was computed
// ---------------------------------------------------------------------------------------------

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DelegateSheet(
    a: ApplicationData, event: EventData, committee: String, startDay: String, days: List<String>,
    mine: List<DailyMarking>, liveToday: DailyMarking?, floor: ParticipationSummary?,
    roster: List<ApplicationData>, all: List<DailyMarking>,
    onPrev: (() -> Unit)?, onNext: (() -> Unit)?, onClose: () -> Unit,
) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val templates = event.markingTemplates
    val mode = markingMode(event)
    val uid = AppGraph.auth.user?.uid.orEmpty()
    var tab by remember(a.id) { mutableStateOf(startDay) }
    var adding by remember { mutableStateOf<com.munpro.app.domain.MarkingTemplate?>(null) }
    var feedback by remember(a.id, tab) { mutableStateOf<String?>(null) }
    val daySel = if (tab == "final") startDay else tab
    val m = (if (daySel == startDay) liveToday else null) ?: mine.firstOrNull { it.dateStr == daySel }
    val base = MarkingBase(event.id, committee, a.userId, a.id, daySel, uid, mode)
    val dailyMine = mine.filter { !it.dateStr.isNullOrEmpty() }.let { l -> if (liveToday != null) l.filter { it.dateStr != startDay } + liveToday else l }
    val final = all.firstOrNull { it.delegateId == a.userId && (it.kind == "final" || it.id.endsWith("__final")) }
    val weight = final?.overallWeight ?: event.scoringConfig?.overallWeight ?: DEFAULT_OVERALL_WEIGHT
    val markDays = deriveDays(all.filter { !it.dateStr.isNullOrEmpty() }, event.scoringConfig?.markingDays.orEmpty())
    val fs = computeFinalScore(dailyMine, templates, markDays, final?.chairOverall, weight, mode)
    val ranked = rankEntries(roster.map { r ->
        StandingRow(r.userId, r.id, r.assignedCountry.orEmpty(), "", computeFinalScore(all.filter { it.delegateId == r.userId && !it.dateStr.isNullOrEmpty() }, templates, markDays,
            all.firstOrNull { it.delegateId == r.userId && it.kind == "final" }?.chairOverall, weight, mode))
    })
    val rank = ranked.firstOrNull { it.row.delegateId == a.userId }?.rank
    val ds = computeDailyScore(m, templates, mode)

    fun commit(tid: String, entries: List<Double>) = scope.launch {
        runCatching { AppGraph.markings.setEntries(base, tid, entries) }.onFailure { alerts.show("Didn't save", "Check your connection and try again.") }
    }

    PageSheet(true, onClose) {
        SheetHeader(countryName(a.assignedCountry.orEmpty()), subtitle = listOfNotNull(dayName(daySel), ds.pct?.let { "${it.roundToInt()}%" }, rank?.let { "rank $it of ${roster.size}" }).joinToString(" · "),
            leading = "Done", onLeading = onClose)
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 8.dp, bottom = navBottom + 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Pill("‹ Previous", { onPrev?.invoke() }, tone = Tone.Neutral, enabled = onPrev != null, modifier = Modifier.weight(1f))
                Pill("Next ›", { onNext?.invoke() }, tone = Tone.Neutral, enabled = onNext != null, modifier = Modifier.weight(1f))
            }
            FilterChips(days.map { it to dayName(it) } + ("final" to "Final"), tab) { tab = it }
            if (tab == "final") {
                // B4.6 · the arithmetic, in plain steps.
                Section(header = "Final ${fs.finalScore}%", footer = "Absent days count as 0%. A day attended but never scored is left out.") {
                    markDays.forEach { d ->
                        val dd = computeDailyScore(dailyMine.firstOrNull { it.dateStr == d }, templates, mode)
                        val counted = fs.counted.firstOrNull { it.first == d }?.second != false
                        cell(dayName(d), subtitle = when { dd.present -> "${attendanceLabel(dd.attendanceStatus) ?: "Scored"} · average of ${dd.scoredCount} criteria"; !counted -> "Present, not scored: left out"; else -> "No marks: counts as 0%" },
                            value = dd.pct?.let { "${it.roundToInt()}%" } ?: "—", chevron = false)
                    }
                    cell("Computed", subtitle = "Consistency across ${fs.dayCount} counted day${if (fs.dayCount == 1) "" else "s"}", value = "${fs.computedPct.roundToInt()}%", chevron = false)
                    if (fs.chairOverall != null) {
                        cell("Chair overall", subtitle = "Your overall mark", value = fmt(fs.chairOverall), chevron = false)
                        cell("Blend", subtitle = "${((1 - weight) * 100).roundToInt()}% computed + ${(weight * 100).roundToInt()}% chair overall", value = "${fs.finalScore}%", chevron = false)
                    } else cell("No chair overall yet", subtitle = "Final = computed %. The overall is set with Final scoring.", value = "${fs.finalScore}%", chevron = false)
                }
                return@Column
            }
            Section(header = "Marks · ${attendanceLabel(ds.attendanceStatus) ?: "no roll call"}") {
                templates.forEach { t ->
                    val entries = m?.scoreEntries?.get(t.id) ?: m?.scores?.get(t.id)?.let { listOf(it) } ?: emptyList()
                    val sug = if (daySel == startDay) autoFillSuggestion(t, floor) else null
                    item {
                        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(t.name, style = Type.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = c.label, modifier = Modifier.weight(1f))
                                Text(if (entries.isEmpty()) "—" else "avg ${fmt(entries.average())}", style = Type.subhead, color = if (entries.isEmpty()) c.label3 else c.tint)
                            }
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                entries.forEachIndexed { i, v ->
                                    Pill("${fmt(v)}  ×", { commit(t.id, entries.filterIndexed { j, _ -> j != i }) }, tone = Tone.Neutral)
                                }
                                if (sug != null) Pill("${fmt(if (mode == "binary") (if (sug > 0) 1.0 else 0.0) else sug)} suggested", {
                                    commit(t.id, entries + (if (mode == "binary") (if (sug > 0) 1.0 else 0.0) else clampMark(sug, -100.0, 100.0)))
                                }, tone = Tone.Info)
                                Pill("+ Add", { adding = t }, filled = true)
                            }
                        }
                    }
                }
            }
            if (daySel == startDay && floor != null) {
                SectionHeader("On the floor · ${dayName(daySel)}")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Metric("${floor.speeches}", "GSL", Modifier.weight(1f))
                    Metric("${floor.caucusSpeeches}", "Caucus", Modifier.weight(1f))
                    Metric("${(floor.speakingSeconds / 60).roundToInt()}", "Minutes", Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Metric("${floor.pointsRaised ?: floor.points}", "Points", Modifier.weight(1f))
                    Metric("${floor.motionsProposed ?: floor.motions}", "Motions", Modifier.weight(1f))
                    Metric("${floor.votesCast}", "Votes", Modifier.weight(1f))
                }
            }
            val text = feedback ?: m?.feedback.orEmpty()
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionHeader("Feedback · the delegate sees it")
                Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(14.dp)) {
                    PlainInput(text, { feedback = it }, "What they did well, and what to work on", singleLine = false, minLines = 3, modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
                }
                if (feedback != null && feedback != m?.feedback.orEmpty()) MunButton("Save feedback", {
                    scope.launch {
                        runCatching { AppGraph.markings.setFeedback(base, feedback!!) }.onSuccess { feedback = null }
                            .onFailure { alerts.show("Didn't save", "Check your connection and try again.") }
                    }
                }, height = 44.dp)
            }
        }
    }
    adding?.let { t ->
        AddMarkSheet(t.name, countryName(a.assignedCountry.orEmpty()) + " · " + dayName(daySel), mode,
            if (daySel == startDay) autoFillSuggestion(t, floor) else null) { v ->
            adding = null
            if (v != null) {
                val entries = m?.scoreEntries?.get(t.id) ?: m?.scores?.get(t.id)?.let { listOf(it) } ?: emptyList()
                commit(t.id, entries + v)
            }
        }
    }
}

@Composable
private fun Metric(value: String, label: String, modifier: Modifier) {
    val c = palette
    Column(modifier.clip(RoundedCornerShape(14.dp)).background(c.cell).padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = Type.headline, color = c.label)
        Text(label, style = Type.caption.copy(fontWeight = FontWeight.Normal), color = c.label2)
    }
}

/** B4.5: one mark, −100…+100 (snaps to 5) or −1 / 0 / +1 in binary mode. Null = cancelled. */
@Composable
private fun AddMarkSheet(criterion: String, who: String, mode: String, suggestion: Double?, onDone: (Double?) -> Unit) {
    val c = palette
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    var v by remember { mutableFloatStateOf(suggestion?.toFloat()?.coerceIn(-100f, 100f) ?: 0f) }
    var binary by remember { mutableIntStateOf(if ((suggestion ?: 0.0) > 0) 1 else 0) }
    PageSheet(true, { onDone(null) }) {
        SheetHeader(criterion, subtitle = who, leading = "Cancel", onLeading = { onDone(null) }, trailing = "Add",
            onTrailing = { onDone(if (mode == "binary") binary.toDouble() else ((v / 5).roundToInt() * 5).toDouble()) })
        Column(Modifier.fillMaxWidth().padding(start = Space.gutter, end = Space.gutter, top = 12.dp, bottom = navBottom + 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            if (mode == "binary") {
                Segmented(listOf(-1 to "−1", 0 to "0", 1 to "+1"), binary, { binary = it })
            } else {
                Text("Mark ${fmt(((v / 5).roundToInt() * 5).toDouble())}", fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 34.sp, color = c.tint)
                Slider(v, { v = it }, valueRange = -100f..100f, colors = SliderDefaults.colors(thumbColor = c.tint, activeTrackColor = c.tint))
                Row(Modifier.fillMaxWidth()) {
                    Text("−100", style = Type.caption, color = c.label2, modifier = Modifier.weight(1f))
                    Text("0", style = Type.caption, color = c.label2, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
                    Text("+100", style = Type.caption, color = c.label2, modifier = Modifier.weight(1f), textAlign = TextAlign.End)
                }
            }
            suggestion?.let { Text("Suggested ${fmt(it)} from today's floor activity", style = Type.footnote, color = c.label2) }
            Text("Each mark joins the day's list for this criterion; the day's score is the average.", style = Type.footnote, color = c.label2, textAlign = TextAlign.Center)
        }
    }
}

// ---------------------------------------------------------------------------------------------
// B4.7 · Motion log
// ---------------------------------------------------------------------------------------------

@Composable
fun MotionLogScreen(eventId: String, committee: String) {
    val c = palette
    val event = rememberEvent(eventId)
    val marks = rememberCommitteeMarks(eventId, committee).data.orEmpty()
    val days = hubDays(event, marks)
    var day by rememberSaveable { mutableStateOf(today()) }
    var kind by rememberSaveable { mutableStateOf("all") }
    val items by produceState<List<LogItem>?>(null, eventId, committee, day) { value = null; value = AppGraph.chairHub.motionLog(eventId, committee, day) }
    val zone = java.time.ZoneId.systemDefault()
    Screen(back = committee, tabBar = false, title = "Motion log", overline = committee) {
        DayStepper(days, day) { day = it }
        val list = items
        if (list == null) { Spinner(); return@Screen }
        val counts = listOf("motion", "point", "vote", "yield").associateWith { k -> list.count { it.kind == k } }
        FilterChips(listOf("all" to "All ${list.size}", "motion" to "Motions ${counts["motion"]}", "point" to "Points ${counts["point"]}", "vote" to "Votes ${counts["vote"]}", "yield" to "Yields ${counts["yield"]}"), kind) { kind = it }
        val shown = list.filter { kind == "all" || it.kind == kind }
        if (shown.isEmpty()) Empty("Nothing recorded on this day", "Motions, points, votes and yields from the live session appear here.", icon = Icons.list)
        else Section {
            shown.forEach { i ->
                val time = if (i.at > 0) java.time.Instant.ofEpochMilli(i.at).atZone(zone).format(java.time.format.DateTimeFormatter.ofPattern("HH:mm")) else ""
                cell(i.title, subtitle = listOf(time, i.detail).filter { it.isNotBlank() }.joinToString(" · "), chevron = false,
                    trailing = { Chip(i.outcome.replace('_', ' ').replaceFirstChar { it.uppercase() }, when (i.outcome) { "carried", "passed", "recognized" -> Tone.Tint; "failed", "dismissed", "out of order", "vetoed" -> Tone.Destructive; else -> Tone.Neutral }) })
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// B4.8 · Position papers
// ---------------------------------------------------------------------------------------------

private fun hasPaper(a: ApplicationData) = !a.positionPaperContent.isNullOrBlank() || !a.positionPaperUrl.isNullOrBlank()

@Composable
fun PapersScreen(eventId: String, committee: String) {
    val c = palette
    val nav = LocalNav.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val event = rememberEvent(eventId)
    val roster = rememberRoster(eventId, committee).data
    val marks = rememberCommitteeMarks(eventId, committee).data.orEmpty()
    var tab by rememberSaveable { mutableStateOf("grade") }
    var reminding by remember { mutableStateOf(false) }
    Screen(back = committee, tabBar = false, title = "Position papers", overline = committee, onRefresh = {}) {
        val r = roster ?: run { Spinner(); return@Screen }
        val gradeOf = { a: ApplicationData -> marks.filter { it.delegateId == a.userId }.let { l -> l.firstOrNull { it.isPaperDoc } ?: l.firstOrNull { it.paperStatus != null } } }
        val missing = r.filter { !hasPaper(it) }
        val graded = r.filter { hasPaper(it) && gradeOf(it)?.paperStatus != null }
        val toGrade = r.filter { hasPaper(it) && gradeOf(it)?.paperStatus == null }
        Text("${r.size - missing.size} of ${r.size} submitted · ${missing.size} missing", style = Type.subhead, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp))
        if (missing.isNotEmpty()) MunButton(if (reminding) "Sending…" else "Remind the ${missing.size} by email", {
            scope.launch {
                if (!alerts.confirm("Email ${missing.size} delegate${if (missing.size == 1) "" else "s"}?", "Everyone in $committee without a paper gets a reminder.", "Send")) return@launch
                reminding = true
                AppGraph.chairHub.remindMissingPapers(eventId, committee, event?.title.orEmpty())
                    .onSuccess { alerts.show("Reminder sent", "Emailed $it delegate${if (it == 1) "" else "s"}.") }
                    .onFailure { alerts.show("Couldn't send", it.message ?: "Try again.") }
                reminding = false
            }
        }, variant = ButtonVariant.Tinted, enabled = !reminding, icon = Icons.mail)
        Segmented(listOf("grade" to "To grade · ${toGrade.size}", "graded" to "Graded · ${graded.size}", "missing" to "Missing · ${missing.size}"), tab, { tab = it })
        val list = when (tab) { "graded" -> graded; "missing" -> missing; else -> toGrade }
        if (list.isEmpty()) Text(when (tab) { "graded" -> "Nothing graded yet."; "missing" -> "Everyone has handed in a paper."; else -> "No papers waiting." },
            style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp))
        else Section {
            list.sortedByDescending { it.positionPaperUpdatedAt ?: 0L }.forEach { a ->
                val g = gradeOf(a)
                cell(
                    countryName(a.assignedCountry.orEmpty()).ifEmpty { a.applicantName.orEmpty() },
                    subtitle = if (!hasPaper(a)) a.applicantName else listOfNotNull(a.positionPaperUpdatedAt?.let { "Handed in ${dayMonth(it)}" },
                        a.positionPaperContent?.let { "${wordCount(it)} words" }, g?.positionPaperScore?.let { "${it.roundToInt()}/100" }).joinToString(" · "),
                    leading = { Flag(a.assignedCountry, 22f) }, inset = 52.dp, chevron = false,
                    trailing = if (hasPaper(a)) ({ Pill(if (tab == "graded") "Review" else "Grade", { nav.go(GradePaperRoute(eventId, committee, a.id)) }, filled = tab != "graded") }) else null,
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// B4.9 · Grade a paper, B4.10 · Chair notes
// ---------------------------------------------------------------------------------------------

private val PAPER_STATUS = listOf("review" to "Review", "approved" to "Approve", "revision" to "Revise", "flagged" to "Plagiarism")

@Composable
fun GradePaperScreen(eventId: String, committee: String, appId: String) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val roster = rememberRoster(eventId, committee).data
    val a = roster?.firstOrNull { it.id == appId }
    var marks by remember { mutableStateOf<List<DailyMarking>?>(null) }
    LaunchedEffect(eventId, committee) { marks = runCatching { AppGraph.markings.committee(eventId, committee) }.getOrDefault(emptyList()) }
    val existing = a?.let { app -> marks?.filter { it.delegateId == app.userId }?.let { l -> l.firstOrNull { it.isPaperDoc } ?: l.firstOrNull { it.paperStatus != null } } }
    var status by remember(existing?.id) { mutableStateOf(existing?.paperStatus ?: "review") }
    var score by remember(existing?.id) { mutableStateOf(existing?.positionPaperScore?.roundToInt()?.toString().orEmpty()) }
    var feedback by remember(existing?.id) { mutableStateOf(if (existing?.isPaperDoc == true) existing.feedback else "") }
    var paperDoc by remember(existing?.id) { mutableStateOf(existing?.takeIf { it.isPaperDoc }?.id) }
    var busy by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf(false) }

    Screen(back = "Papers", tabBar = false, navTitle = a?.let { countryName(it.assignedCountry.orEmpty()) } ?: "Paper", gap = 18.dp) {
        if (a == null || marks == null) { Spinner(); return@Screen }
        val content = a.positionPaperContent.orEmpty()
        Text("${countryName(a.assignedCountry.orEmpty())} · ${wordCount(content)} words" + (a.positionPaperUpdatedAt?.let { " · handed in ${dayMonth(it)}" } ?: ""), style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp))
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp)) {
            if (content.isNotBlank()) Markdown(content, serif = true)
            else Text("This paper was uploaded as a file link; open it on the website to read it.", style = Type.subhead, color = c.label2)
        }
        SectionHeader("Grade")
        Segmented(PAPER_STATUS, status, { status = it })
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Score", style = Type.body, color = c.label, modifier = Modifier.weight(1f))
            PlainInput(score, { s -> score = s.filter { it.isDigit() }.take(3) }, "0", modifier = Modifier.width(60.dp), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
            Text("/100", style = Type.body, color = c.label2)
        }
        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(14.dp)) {
            PlainInput(feedback, { feedback = it }, "Feedback to the delegate", singleLine = false, minLines = 4, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
        }
        MunButton(if (saved) "Saved" else "Save Grade", {
            busy = true
            scope.launch {
                runCatching { AppGraph.chairHub.savePaperGrade(a, committee, existing, score.toDoubleOrNull()?.coerceIn(0.0, 100.0), feedback, status) }
                    .onSuccess { paperDoc = it; saved = true; AppGraph.saved.remove("hubMarks:$eventId:$committee") }
                    .onFailure { alerts.show("Didn't save", "Check your connection and try again.") }
                busy = false
            }
        }, loading = busy)
        val notesOn = paperDoc
        SectionHeader("Chair notes · only the dais sees these")
        if (notesOn == null) Text("Save a grade first to start notes.", style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp))
        else ChairNotes(notesOn)
    }
}

@Composable
private fun ChairNotes(markingId: String) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val notes by remember(markingId) { AppGraph.chairHub.notes(markingId) }.collectAsStateWithLifecycle(emptyList())
    var draft by remember { mutableStateOf("") }
    val me = AppGraph.auth.user?.uid
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (notes.isEmpty()) Text("No notes yet.", style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp))
        notes.forEach { n ->
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(if (n.authorId == me) c.tintSoft else c.cell).padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(if (n.authorId == me) "You" else n.authorName.ifEmpty { "Dais" }, style = Type.caption, color = c.label2)
                Text(n.text, style = Type.subhead, color = c.label)
            }
        }
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            PlainInput(draft, { draft = it }, "Add a private note", singleLine = false, modifier = Modifier.weight(1f),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
            Pill("Add", {
                val t = draft.trim()
                if (t.isEmpty()) return@Pill
                draft = ""
                scope.launch { runCatching { AppGraph.chairHub.addNote(markingId, t) }.onFailure { draft = t; alerts.show("Didn't save", "Check your connection and try again.") } }
            }, filled = true, enabled = draft.isNotBlank())
        }
    }
}

