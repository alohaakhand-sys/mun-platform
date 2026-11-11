package com.munpro.app.ui.organizer

// Allocation (board C2; web organizer/events/[id]/allocation): Applications (search, status,
// payment; swipe a pending one to approve with its first free choice or to reject), one
// application, the approve sheet that seats a delegate (full committees and taken countries
// can't be picked), Countries one committee at a time (with past-event conflicts and the
// delegate's conference count when their profile has it), Moves (review requests, swaps waiting,
// move a delegate now) and Capacity with the waitlist. Data: AllocationRepo.

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.munpro.app.AppGraph
import com.munpro.app.data.CountryConflict
import com.munpro.app.data.Fresh
import com.munpro.app.data.OrgMove
import com.munpro.app.data.Refresh
import com.munpro.app.data.WAITLIST_OFFER_HOURS
import com.munpro.app.data.WaitlistSeat
import com.munpro.app.data.rememberCached
import com.munpro.app.domain.ApplicationData
import com.munpro.app.domain.Committee
import com.munpro.app.domain.EventData
import com.munpro.app.domain.belongsToCommittee
import com.munpro.app.domain.countryName
import com.munpro.app.domain.firstAvailableSeat
import com.munpro.app.domain.getAppCommitteePreferences
import com.munpro.app.domain.isAwaitingPayment
import com.munpro.app.domain.isCommitteeFull
import com.munpro.app.domain.paymentLabel
import com.munpro.app.domain.sameCommittee
import com.munpro.app.domain.seated
import com.munpro.app.domain.takenCountries
import com.munpro.app.nav.OrgApplicationRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.home.FilterChips
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.Chip
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Flag
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.PersonAvatar
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.PlainInput
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.RoundButton
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.SearchField
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SectionFooter
import com.munpro.app.ui.kit.SectionHeader
import com.munpro.app.ui.kit.Segmented
import com.munpro.app.ui.kit.SfIcon
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.Space
import com.munpro.app.ui.kit.Spinner
import com.munpro.app.ui.kit.Tone
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.kit.rememberPress
import com.munpro.app.ui.kit.tap
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import kotlin.math.roundToInt

private const val FAIL = "Check your connection and try again."

@Composable
private fun rememberApps(eventId: String) =
    rememberCached("orgApps:$eventId", ListSerializer(ApplicationData.serializer()), Fresh.SHORT) { AppGraph.allocation.applications(eventId) }

@Composable
private fun rememberEventDoc(eventId: String) =
    rememberCached("orgEventDoc:$eventId", EventData.serializer(), Fresh.SHORT) { AppGraph.events.getEventById(eventId) ?: error("Event not found") }

private fun ordinal(n: Int) = when (n) { 1 -> "1st"; 2 -> "2nd"; 3 -> "3rd"; else -> "${n}th" }
/** "Committee · Country" of an approved delegate (assigned committee, else the one they're placed in by preference). */
private fun seatOf(a: ApplicationData) = listOfNotNull(
    a.assignedCommittee?.ifEmpty { null } ?: if (a.status == "approved") com.munpro.app.domain.committeeOf(a).ifEmpty { null } else null,
    a.assignedCountry?.ifEmpty { null }?.let(::countryName),
).joinToString(" · ")

// ---------------------------------------------------------------------------------------------
// C2 · Allocation tabs
// ---------------------------------------------------------------------------------------------

@Composable
fun AllocationScreen(eventId: String, tab: String) {
    var current by rememberSaveable { mutableStateOf(tab.ifEmpty { "applications" }) }
    val ev = rememberEventDoc(eventId)
    val apps = rememberApps(eventId)
    val moves = rememberCached("orgMoves:$eventId", ListSerializer(OrgMove.serializer()), Fresh.SHORT) { AppGraph.allocation.moves(eventId) }
    val pendingMoves = moves.data.orEmpty().count { it.source != "admin" && it.request.status == "pending" }
    Screen(back = "Event", tabBar = false, title = "Allocation", overline = ev.data?.title, savedAt = apps.savedAt, onRefresh = {}) {
        Segmented(listOf(
            "applications" to "Applications", "countries" to "Countries",
            "moves" to if (pendingMoves > 0) "Moves · $pendingMoves" else "Moves", "capacity" to "Capacity",
        ), current, { current = it })
        val e = ev.data
        val list = apps.data
        if (e == null || list == null) { if (ev.failed || apps.failed) Empty("Couldn't load allocation", "Pull down to try again.", icon = Icons.list) else Spinner(); return@Screen }
        when (current) {
            "applications" -> ApplicationsTab(e, list)
            "countries" -> CountriesTab(e, list)
            "moves" -> MovesTab(e, list, moves.data)
            else -> CapacityTab(e, list)
        }
    }
}

// ---------------------------------------------------------------------------------------------
// C2.1 / C2.2 · Applications, swipe to decide
// ---------------------------------------------------------------------------------------------

@Composable
private fun ApplicationsTab(e: EventData, apps: List<ApplicationData>) {
    val c = palette
    val nav = LocalNav.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    var query by rememberSaveable { mutableStateOf("") }
    var status by rememberSaveable { mutableStateOf("all") }
    var approving by remember { mutableStateOf<ApplicationData?>(null) }
    val counts = listOf("all", "pending", "approved", "rejected").associateWith { s -> if (s == "all") apps.size else apps.count { it.status == s } }
    SearchField(query, { query = it }, placeholder = "Search name or email")
    FilterChips(listOf(
        "all" to "All ${counts["all"]}", "pending" to "Pending ${counts["pending"]}", "approved" to "Approved ${counts["approved"]}", "rejected" to "Rejected ${counts["rejected"]}",
    ), status) { status = it }
    val shown = apps.filter { status == "all" || it.status == status }
        .filter { q -> query.isBlank() || "${q.applicantName.orEmpty()} ${q.applicantEmail.orEmpty()}".contains(query.trim(), true) }
    if (status == "pending" && shown.isNotEmpty()) Text("Swipe right to approve with their first free choice, left to reject. Tap to pick a different seat.",
        style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp))
    if (shown.isEmpty()) { Empty(if (apps.isEmpty()) "No applications yet" else "Nothing here", if (apps.isEmpty()) "Applications appear as people apply." else "Try another filter or search.", icon = Icons.people); return }

    fun reject(a: ApplicationData) = scope.launch {
        if (!alerts.confirm("Reject ${a.applicantName.orEmpty().ifEmpty { "this" }}'s application?", "${a.applicantName.orEmpty().ifEmpty { "They" }} gets an email. This can't be undone from the app.", "Reject Application", destructive = true)) return@launch
        runCatching { AppGraph.allocation.reject(a) }.fold(onSuccess = { Refresh.bump() }, onFailure = { alerts.show("Couldn't reject", FAIL) })
    }
    fun quickApprove(a: ApplicationData) = scope.launch {
        if (isAwaitingPayment(a, e)) { alerts.show("Can't approve until paid", "${a.applicantName.orEmpty().ifEmpty { "They" }} hasn't paid the registration fee yet."); return@launch }
        val seat = firstAvailableSeat(a, e, apps)
        if (seat == null) { approving = a; return@launch }
        runCatching { AppGraph.allocation.approve(a, seat.first, seat.second, e.title) }
            .fold(onSuccess = { Refresh.bump() }, onFailure = { alerts.show("Couldn't approve", FAIL) })
    }

    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell)) {
        shown.forEachIndexed { i, a ->
            if (i > 0) Box(Modifier.padding(start = 64.dp).fillMaxWidth().height(0.5.dp).background(c.separator))
            val row = @Composable { AppRow(a, e) { nav.go(OrgApplicationRoute(e.id, a.id)) } }
            if (a.status == "pending") SwipeRow(onRight = { quickApprove(a) }, onLeft = { reject(a) }) { row() } else row()
        }
    }
    approving?.let { a -> ApproveSheet(a, e, apps, { approving = null }) { approving = null; Refresh.bump() } }
}

@Composable
private fun AppRow(a: ApplicationData, e: EventData, onClick: () -> Unit) {
    val c = palette
    val prefs = getAppCommitteePreferences(a)
    val pay = paymentLabel(a, e)
    Row(
        Modifier.fillMaxWidth().background(c.cell).tap(rememberPress(), label = a.applicantName.orEmpty(), onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        PersonAvatar(a.applicantName.orEmpty().ifEmpty { a.role }, size = 36.dp, seed = a.userId)
        Column(Modifier.weight(1f)) {
            Text(a.applicantName.orEmpty().ifEmpty { "Unknown Delegate" }, style = Type.bodyMedium, color = c.label)
            Text(
                listOfNotNull(a.role.ifEmpty { "Delegate" }, if (a.status == "approved" && seatOf(a).isNotEmpty()) seatOf(a)
                    else prefs.firstOrNull()?.committee?.let { it + if (prefs.size > 1) " +${prefs.size - 1}" else "" }).joinToString(" · "),
                style = Type.footnote, color = c.label2, maxLines = 1,
            )
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (a.status != "pending") Chip(a.status.replaceFirstChar { it.uppercase() }, when (a.status) { "approved" -> Tone.Tint; "rejected" -> Tone.Destructive; else -> Tone.Neutral })
            Chip(pay, when (pay) { "Paid" -> Tone.Tint; "Unpaid" -> Tone.Warning; else -> Tone.Neutral })
        }
    }
}

/** A row that reveals Approve (swipe right) and Reject (swipe left), then springs back. */
@Composable
private fun SwipeRow(onRight: () -> Unit, onLeft: () -> Unit, content: @Composable () -> Unit) {
    val c = palette
    val scope = rememberCoroutineScope()
    val offset = remember { Animatable(0f) }
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val width = with(LocalDensity.current) { maxWidth.toPx() }
        val threshold = width * 0.3f
        Row(Modifier.matchParentSize().background(if (offset.value >= 0) c.tint else c.red).padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically) {
            if (offset.value >= 0) Text("Approve", style = Type.headline, color = Color.White)
            Spacer(Modifier.weight(1f))
            if (offset.value < 0) Text("Reject", style = Type.headline, color = Color.White)
        }
        Box(
            Modifier.offset { IntOffset(offset.value.roundToInt(), 0) }.draggable(
                rememberDraggableState { d -> scope.launch { offset.snapTo((offset.value + d).coerceIn(-width, width)) } },
                Orientation.Horizontal,
                onDragStopped = {
                    val v = offset.value
                    scope.launch { offset.animateTo(0f) }
                    when { v > threshold -> onRight(); v < -threshold -> onLeft() }
                },
            ),
        ) { content() }
    }
}

// ---------------------------------------------------------------------------------------------
// C2.3 / C2.5 · One application
// ---------------------------------------------------------------------------------------------

@Composable
fun OrgApplicationScreen(eventId: String, appId: String) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val ev = rememberEventDoc(eventId)
    val apps = rememberApps(eventId)
    val e = ev.data
    val a = apps.data?.firstOrNull { it.id == appId }
    var approving by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    Screen(back = "Allocation", tabBar = false, title = a?.applicantName?.ifEmpty { null } ?: "Application",
        overline = a?.let { listOfNotNull(it.role.ifEmpty { "Delegate" }, it.createdAt?.let { t -> "applied ${com.munpro.app.domain.shortWhen(t)}" }).joinToString(" · ") }, onRefresh = {}) {
        if (e == null || a == null) { if (apps.data != null) Empty("Application not found", "It may have been withdrawn.", icon = Icons.people) else Spinner(); return@Screen }
        val pay = paymentLabel(a, e)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(horizontal = 4.dp)) {
            Chip(a.status.replaceFirstChar { it.uppercase() }, when (a.status) { "approved" -> Tone.Tint; "rejected" -> Tone.Destructive; "pending" -> Tone.Warning; else -> Tone.Neutral })
            Chip(if (pay == "Paid") listOfNotNull("Paid", a.paidAmount?.let { com.munpro.app.domain.formatFee(it) }).joinToString(" · ") else pay,
                when (pay) { "Paid" -> Tone.Tint; "Unpaid" -> Tone.Warning; else -> Tone.Neutral })
        }
        Section {
            (a.institutionName ?: a.institution)?.ifEmpty { null }?.let { cell(it, subtitle = "Institution") }
            a.applicantEmail?.ifEmpty { null }?.let { cell(it, subtitle = "Email") }
            if (a.status == "approved" && seatOf(a).isNotEmpty()) cell(seatOf(a), subtitle = "Seat")
        }
        val prefs = getAppCommitteePreferences(a)
        if (prefs.isNotEmpty()) Section(header = "Ranked choices") {
            prefs.forEachIndexed { i, p ->
                item {
                    Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Box(Modifier.size(26.dp).clip(CircleShape).background(c.tintSoft), contentAlignment = Alignment.Center) { Text("${i + 1}", style = Type.footnote.copy(fontWeight = FontWeight.Bold), color = c.tint) }
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(p.committee, style = Type.bodyMedium, color = c.label)
                            val cs = p.countries.filter { it.isNotEmpty() }
                            if (cs.isNotEmpty()) Text(cs.joinToString(" · ") { if (it.equals("any", true)) "Any country" else countryName(it) }, style = Type.footnote, color = c.label2)
                        }
                    }
                }
            }
        }
        if (a.experience.isNotBlank()) Section(header = "Experience") { item { Text(a.experience, style = Type.subhead, color = c.label, modifier = Modifier.padding(16.dp)) } }
        if (a.motivation.isNotBlank()) Section(header = "Motivation") { item { Text(a.motivation, style = Type.subhead, color = c.label, modifier = Modifier.padding(16.dp)) } }
        if (a.status == "pending") {
            val unpaid = isAwaitingPayment(a, e)
            if (unpaid) Text("Can't approve until paid: the registration fee hasn't been paid yet.", style = Type.footnote, color = c.orange, modifier = Modifier.padding(horizontal = 4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                MunButton("Reject", {
                    scope.launch {
                        if (!alerts.confirm("Reject ${a.applicantName.orEmpty().ifEmpty { "this" }}'s application?", "${a.applicantName.orEmpty().ifEmpty { "They" }} gets an email. This can't be undone from the app.", "Reject Application", destructive = true)) return@launch
                        busy = true
                        runCatching { AppGraph.allocation.reject(a) }.fold(onSuccess = { Refresh.bump() }, onFailure = { alerts.show("Couldn't reject", FAIL) })
                        busy = false
                    }
                }, variant = ButtonVariant.Tinted, destructive = true, enabled = !busy, modifier = Modifier.weight(1f))
                MunButton("Approve…", { approving = true }, enabled = !unpaid && !busy, modifier = Modifier.weight(1f))
            }
        }
    }
    if (approving && e != null && a != null) ApproveSheet(a, e, apps.data.orEmpty(), { approving = false }) { approving = false; Refresh.bump() }
}

// ---------------------------------------------------------------------------------------------
// C2.4 · Approve: assign a seat
// ---------------------------------------------------------------------------------------------

@Composable
private fun ApproveSheet(a: ApplicationData, e: EventData, apps: List<ApplicationData>, onDismiss: () -> Unit, onDone: () -> Unit) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val navPad = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val prefs = getAppCommitteePreferences(a)
    val first = firstAvailableSeat(a, e, apps)
    var committee by remember { mutableStateOf(first?.first ?: e.committees.firstOrNull { cm -> prefs.any { sameCommittee(it.committee, cm.name) } && !isCommitteeFull(cm, apps, a.id) }?.name.orEmpty()) }
    var country by remember { mutableStateOf(first?.second.orEmpty()) }
    var others by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    val name = a.applicantName.orEmpty().ifEmpty { "applicant" }.substringBefore(' ')
    val cm = e.committees.firstOrNull { it.name == committee }
    val pref = prefs.firstOrNull { sameCommittee(it.committee, committee) }
    val taken = takenCountries(apps, committee, a.id)

    PageSheet(true, onDismiss) {
        SheetHeader("Approve $name", leading = "Cancel", onLeading = onDismiss, trailing = if (busy) "…" else "Approve", trailingEnabled = !busy && (committee.isNotEmpty() || e.committees.isEmpty()), divider = true, onTrailing = {
            busy = true
            scope.launch {
                runCatching { AppGraph.allocation.approve(a, committee, country, e.title) }.fold(onSuccess = { onDone() }, onFailure = { alerts.show("Couldn't approve", FAIL) })
                busy = false
            }
        })
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 12.dp, bottom = navPad + 32.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            Section(header = "Committee") {
                e.committees.filter { it.name.isNotBlank() }.forEach { k ->
                    val full = isCommitteeFull(k, apps, a.id)
                    val rank = prefs.indexOfFirst { sameCommittee(it.committee, k.name) }.takeIf { it >= 0 }?.plus(1)
                    val filled = seated(apps, k.name).count { it.id != a.id }
                    cell(
                        k.name, subtitle = if ((k.capacity ?: 0) > 0) "$filled of ${k.capacity} filled" + (if (full) " · full" else "") else "$filled seated · no limit",
                        trailing = {
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                                rank?.let { Chip(if (it == 1) "★ 1st" else ordinal(it), if (it == 1) Tone.Tint else Tone.Neutral) }
                                if (k.name == committee) SfIcon(Icons.check, c.tint, size = 18.dp)
                            }
                        },
                        chevron = false, dim = full,
                        onClick = if (full) null else ({ if (committee != k.name) { committee = k.name; country = "" } }),
                    )
                }
            }
            if (cm != null && cm.countries.isNotEmpty()) {
                val ranked = pref?.countries.orEmpty().filter { it.isNotEmpty() && !it.equals("any", true) }
                val preferred = ranked.mapNotNull { r -> cm.countries.firstOrNull { it.equals(r, true) } }
                val list = if (others || preferred.isEmpty()) preferred + cm.countries.filter { k -> preferred.none { it.equals(k, true) } } else preferred
                Section(header = "Country in ${cm.name}") {
                    list.forEach { k ->
                        val holder = taken[k.lowercase()]
                        val rank = ranked.indexOfFirst { it.equals(k, true) }.takeIf { it >= 0 }?.plus(1)
                        cell(
                            countryName(k), subtitle = holder?.let { "Taken by $it" },
                            leading = { Flag(k, 22f) }, inset = 52.dp,
                            trailing = {
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                                    rank?.let { Chip(if (it == 1) "★ 1st" else ordinal(it), if (it == 1) Tone.Tint else Tone.Neutral) }
                                    if (k == country) SfIcon(Icons.check, c.tint, size = 18.dp)
                                }
                            },
                            chevron = false, dim = holder != null,
                            onClick = if (holder != null) null else ({ country = if (country == k) "" else k }),
                        )
                    }
                    if (!others && preferred.isNotEmpty() && preferred.size < cm.countries.size) cell("Another country…", onClick = { others = true })
                }
            }
            SectionFooter("${a.applicantName.orEmpty().ifEmpty { "They" }.substringBefore(' ')} gets an email with ${if (country.isNotEmpty() || committee.isNotEmpty()) "their seat" else "the news"}. You can change it later under Countries.")
        }
    }
}

// ---------------------------------------------------------------------------------------------
// C2.6 / C2.7 · Countries
// ---------------------------------------------------------------------------------------------

@Composable
private fun CountriesTab(e: EventData, apps: List<ApplicationData>) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val committees = e.committees.filter { it.name.isNotBlank() }
    if (committees.isEmpty()) { Empty("No committees yet", "Add committees before assigning countries.", icon = Icons.gavel); return }
    var active by rememberSaveable { mutableStateOf(committees.first().name) }
    val edits = remember { mutableStateMapOf<String, String?>() }
    var picking by remember { mutableStateOf<ApplicationData?>(null) }
    var saving by remember { mutableStateOf(false) }
    val cm = committees.firstOrNull { it.name == active } ?: committees.first()
    val rows = seated(apps, cm.name)
    fun countryOf(a: ApplicationData) = if (edits.containsKey(a.id)) edits[a.id] else a.assignedCountry?.ifEmpty { null }
    val uids = rows.map { it.userId }.filter { it.isNotEmpty() }
    val conflicts by produceState<Map<String, CountryConflict>>(emptyMap(), e.id, cm.name, uids.size) { value = runCatching { AppGraph.allocation.conflicts(e.id, uids) }.getOrDefault(emptyMap()) }
    val counts by produceState<Map<String, Int>>(emptyMap(), cm.name, uids.size) { value = runCatching { AppGraph.allocation.conferenceCounts(uids) }.getOrDefault(emptyMap()) }

    val need = apps.count { it.status == "approved" && it.assignedCountry.isNullOrEmpty() && committees.any { k -> belongsToCommittee(it, k.name) } }
    e.assignmentDeadline?.takeIf { it > System.currentTimeMillis() }?.let { d ->
        val h = (d - System.currentTimeMillis()) / 3_600_000L
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.orangeSoft).padding(14.dp)) {
            Text("Assignment deadline in ${if (h < 48) "${h}h" else "${h / 24} days"}", style = Type.subhead.copy(fontWeight = FontWeight.SemiBold), color = c.orange)
        }
    }
    Text(if (need > 0) "$need delegate${if (need == 1) "" else "s"} still need${if (need == 1) "s" else ""} a country" else "Everyone approved has a country.",
        style = Type.subhead, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp))
    FilterChips(committees.map { k -> k.name to (k.name + seated(apps, k.name).count { it.assignedCountry.isNullOrEmpty() }.takeIf { it > 0 }?.let { " · $it" }.orEmpty()) }, active) { active = it }

    if (rows.isEmpty()) Text("No approved delegates in this committee yet.", style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp))
    else Section(footer = if (conflicts.isNotEmpty()) "Gold outline: they held this country at a past event." else null) {
        rows.sortedBy { it.applicantName.orEmpty() }.forEach { a ->
            val k = countryOf(a)
            val clash = k?.let { conflicts["${a.userId}_$it"] }
            val n = counts[a.userId]
            cell(
                a.applicantName.orEmpty().ifEmpty { "Delegate" },
                subtitle = n?.let { if (it <= 1) "First conference" else "$it conferences" },
                leading = { PersonAvatar(a.applicantName.orEmpty(), size = 34.dp, seed = a.userId) }, inset = 62.dp,
                trailing = {
                    if (k == null) Pill("Choose", { picking = a })
                    else Row(
                        Modifier.clip(CircleShape).then(if (clash != null) Modifier.border(1.5.dp, com.munpro.app.ui.kit.SystemColors.gold, CircleShape) else Modifier).padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) { Flag(k, 18f); Text(countryName(k), style = Type.subhead, color = c.label) }
                },
                onClick = { picking = a },
            )
        }
    }
    val changed = rows.filter { edits.containsKey(it.id) && edits[it.id] != it.assignedCountry?.ifEmpty { null } }
    MunButton("Save & Email New Assignments", {
        saving = true
        scope.launch {
            runCatching { AppGraph.allocation.saveCountries(e.id, e.title, cm.name, changed.map { it to edits[it.id] }) }.fold(
                onSuccess = { edits.clear(); Refresh.bump() },
                onFailure = { alerts.show("Couldn't save", FAIL) },
            )
            saving = false
        }
    }, loading = saving, enabled = changed.isNotEmpty())

    picking?.let { a ->
        val takenNow = rows.filter { it.id != a.id }.mapNotNull { o -> countryOf(o)?.let { it.lowercase() to o.applicantName.orEmpty().ifEmpty { "another delegate" } } }.toMap()
        CountryPickSheet(a, cm, countryOf(a), takenNow, conflicts, { picking = null }) { k -> edits[a.id] = k; picking = null }
    }
}

@Composable
private fun CountryPickSheet(a: ApplicationData, cm: Committee, current: String?, taken: Map<String, String>, conflicts: Map<String, CountryConflict>, onDismiss: () -> Unit, onPick: (String?) -> Unit) {
    val c = palette
    val navPad = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    var q by remember { mutableStateOf("") }
    PageSheet(true, onDismiss) {
        SheetHeader(a.applicantName.orEmpty().ifEmpty { "Delegate" }, subtitle = cm.name, leading = "Cancel", onLeading = onDismiss, divider = true)
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 12.dp, bottom = navPad + 32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (cm.countries.size > 10) SearchField(q, { q = it }, placeholder = "Search countries")
            Section {
                cell("Unassigned", trailing = if (current == null) ({ SfIcon(Icons.check, c.tint, size = 18.dp) }) else null, chevron = false, onClick = { onPick(null) })
                cm.countries.filter { q.isBlank() || countryName(it).contains(q.trim(), true) }.forEach { k ->
                    val holder = taken[k.lowercase()]
                    val clash = conflicts["${a.userId}_$k"]
                    cell(
                        countryName(k),
                        subtitle = holder ?: clash?.let { "Held by ${a.applicantName.orEmpty().substringBefore(' ').ifEmpty { "them" }} at ${it.eventName}${if (it.date.isNotEmpty()) " (${it.date})" else ""}" },
                        leading = { Flag(k, 22f) }, inset = 52.dp,
                        trailing = when {
                            k == current -> ({ SfIcon(Icons.check, c.tint, size = 18.dp) })
                            clash != null -> ({ Chip("Held before", Tone.Warning) })
                            else -> null
                        },
                        chevron = false, dim = holder != null,
                        onClick = if (holder != null) null else ({ onPick(k) }),
                    )
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// C2.8 / C2.9 · Moves
// ---------------------------------------------------------------------------------------------

private fun hoursLeft(deadline: Long?) = deadline?.let { maxOf(0L, Math.ceil((it - System.currentTimeMillis()) / 3_600_000.0).toLong()) }

@Composable
private fun MovesTab(e: EventData, apps: List<ApplicationData>, moves: List<OrgMove>?) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    var moving by remember { mutableStateOf(false) }
    val hours = remember { mutableStateMapOf<String, Int>() }
    var busy by remember { mutableStateOf<String?>(null) }
    MunButton("Move a Delegate", { moving = true }, variant = ButtonVariant.Tinted, icon = Icons.people)
    if (moves == null) { Spinner(); return }
    val requests = moves.filter { it.source != "admin" }.map { it.request }
    val review = requests.filter { it.status == "pending" }
    val waiting = requests.filter { it.status == "awaiting_swap" }
    val history = moves.map { it.request }.filter { !it.active }
    if (review.isEmpty() && waiting.isEmpty()) Text("No move requests waiting on you.", style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp))
    if (review.isNotEmpty()) SectionHeader("Needs review")
    review.forEach { r ->
        val holder = takenCountries(apps, r.toCommittee)[r.toCountry.lowercase()]
        val h = hours[r.id] ?: 48
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(r.requesterName.orEmpty().ifEmpty { "Delegate" }, style = Type.headline, color = c.label, modifier = Modifier.weight(1f))
                Chip("Needs review", Tone.Warning)
            }
            Text("${r.fromCommittee} · ${countryName(r.fromCountry)}", style = Type.footnote, color = c.label2)
            Text("→ ${r.toCommittee} · ${countryName(r.toCountry)}${if (holder != null) " · taken" else ""}", style = Type.subhead.copy(fontWeight = FontWeight.SemiBold), color = c.label)
            r.reason?.ifBlank { null }?.let { Text("“$it”", style = Type.subhead, color = c.label) }
            if (holder != null) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Swap deadline", style = Type.subhead, color = c.label, modifier = Modifier.weight(1f))
                RoundButton(Icons.minus, "Shorter", { hours[r.id] = (h - 12).coerceAtLeast(12) })
                Text("${h}h", style = Type.bodyMedium, color = c.label)
                RoundButton(Icons.plus, "Longer", { hours[r.id] = (h + 12).coerceAtMost(720) })
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                listOf(false, true).forEach { approve ->
                    MunButton(if (approve) "Approve" else "Reject", {
                        busy = r.id
                        scope.launch {
                            AppGraph.allocation.decide(r.id, approve, h)?.let { alerts.show("Couldn't save", it) } ?: Refresh.bump()
                            busy = null
                        }
                    }, variant = if (approve) ButtonVariant.Filled else ButtonVariant.Tinted, destructive = !approve, enabled = busy == null, loading = busy == r.id && approve, height = 42.dp, modifier = Modifier.weight(1f))
                }
            }
            if (holder != null) Text("$holder holds this seat. Approving asks them to swap; they have ${h}h to answer.", style = Type.footnote, color = c.label2)
        }
    }
    if (waiting.isNotEmpty()) Section(header = "Waiting for swap") {
        waiting.forEach { r ->
            cell("${r.requesterName.orEmpty().ifEmpty { "Delegate" }} → ${r.toCommittee} · ${countryName(r.toCountry)}",
                subtitle = r.occupantName?.let { "Swap with $it" }, trailing = { Chip("${hoursLeft(r.swapDeadline) ?: 0}h left", Tone.Info) })
        }
    }
    if (history.isNotEmpty()) Section(header = "History") {
        history.take(20).forEach { r ->
            cell("${r.requesterName.orEmpty().ifEmpty { "Delegate" }} → ${r.toCommittee} · ${countryName(r.toCountry)}",
                subtitle = listOfNotNull(r.type?.let { if (it == "swap") "Swap" else "Direct move" }, r.resolvedAt?.let { com.munpro.app.domain.shortWhen(it) }).joinToString(" · ").ifEmpty { null },
                trailing = { Chip(r.status.replaceFirstChar { it.uppercase() }, when (r.status) { "completed" -> Tone.Tint; "rejected", "failed" -> Tone.Destructive; else -> Tone.Neutral }) })
        }
    }
    if (moving) MoveSheet(e, apps, { moving = false }) { moving = false; Refresh.bump() }
}

/** C2.9: move an approved delegate now; a taken seat becomes a direct swap. */
@Composable
private fun MoveSheet(e: EventData, apps: List<ApplicationData>, onDismiss: () -> Unit, onDone: () -> Unit) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val navPad = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    var who by remember { mutableStateOf<ApplicationData?>(null) }
    var q by remember { mutableStateOf("") }
    var committee by remember { mutableStateOf("") }
    var country by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val approved = apps.filter { it.status == "approved" }
    val cm = e.committees.firstOrNull { it.name == committee }
    val holder = who?.let { w -> seated(apps, committee).firstOrNull { it.id != w.id && it.assignedCountry.equals(country, true) } }
    val from = who?.let { w -> listOfNotNull(com.munpro.app.data.seatCommittee(w, e.committees.map { it.name }), w.assignedCountry?.ifEmpty { null }?.let(::countryName)).joinToString(" · ") }.orEmpty()
    val canMove = who != null && committee.isNotEmpty() && country.isNotEmpty() && !busy && (holder == null || !who?.assignedCountry.isNullOrEmpty())
    PageSheet(true, onDismiss) {
        SheetHeader("Move Delegate", leading = "Cancel", onLeading = onDismiss, trailing = if (busy) "…" else if (holder != null) "Swap" else "Move", trailingEnabled = canMove, divider = true, onTrailing = {
            val w = who ?: return@SheetHeader
            busy = true; error = null
            scope.launch {
                AppGraph.allocation.moveNow(e.id, w.id, committee, country, reason).fold(onSuccess = { onDone() }, onFailure = { error = it.message })
                busy = false
            }
        })
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 12.dp, bottom = navPad + 32.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            val w = who
            if (w == null) {
                SearchField(q, { q = it }, placeholder = "Search delegates")
                Section {
                    approved.filter { q.isBlank() || "${it.applicantName.orEmpty()} ${it.applicantEmail.orEmpty()} ${seatOf(it)}".contains(q.trim(), true) }.take(50).forEach { a ->
                        cell(a.applicantName.orEmpty().ifEmpty { "Delegate" }, subtitle = seatOf(a).ifEmpty { "No seat yet" },
                            leading = { PersonAvatar(a.applicantName.orEmpty(), size = 34.dp, seed = a.userId) }, inset = 62.dp, onClick = { who = a })
                    }
                }
                return@Column
            }
            Section {
                cell(w.applicantName.orEmpty().ifEmpty { "Delegate" }, subtitle = "Now: ${from.ifEmpty { "no seat" }}",
                    leading = { PersonAvatar(w.applicantName.orEmpty(), size = 34.dp, seed = w.userId) }, inset = 62.dp,
                    trailing = { Pill("Change", { who = null; committee = ""; country = "" }) })
            }
            Section(header = "Committee") {
                e.committees.filter { it.name.isNotBlank() }.forEach { k ->
                    cell(k.name, trailing = if (k.name == committee) ({ SfIcon(Icons.check, c.tint, size = 18.dp) }) else null, chevron = false,
                        onClick = { if (committee != k.name) { committee = k.name; country = "" } })
                }
            }
            if (cm != null) {
                val taken = takenCountries(apps, cm.name, w.id)
                if (cm.countries.isEmpty()) Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(14.dp)) {
                    PlainInput(country, { country = it.uppercase().take(3) }, "Country code (e.g. JP)", modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters))
                } else Section(header = "Country") {
                    cm.countries.forEach { k ->
                        val held = taken[k.lowercase()]
                        cell(countryName(k), subtitle = held?.let { "Held by $it" }, leading = { Flag(k, 22f) }, inset = 52.dp,
                            trailing = if (k == country) ({ SfIcon(Icons.check, c.tint, size = 18.dp) }) else null, chevron = false, onClick = { country = k })
                    }
                }
            }
            if (holder != null) Text(
                if (w.assignedCountry.isNullOrEmpty()) "${countryName(country)} is held by ${holder.applicantName.orEmpty().ifEmpty { "another delegate" }}, and ${w.applicantName.orEmpty().substringBefore(' ')} has no seat to swap. Pick a free country."
                else "${countryName(country)} is held by ${holder.applicantName.orEmpty().ifEmpty { "another delegate" }}. ${holder.applicantName.orEmpty().substringBefore(' ').ifEmpty { "They" }} moves to $from — a direct swap, no waiting.",
                style = Type.footnote, color = if (w.assignedCountry.isNullOrEmpty()) c.orange else c.label2, modifier = Modifier.padding(horizontal = 4.dp),
            )
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(14.dp)) {
                PlainInput(reason, { reason = it }, "Reason (optional, shown to them)", singleLine = false, maxLength = 300, modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
            }
            ErrorText(error)
        }
    }
}

// ---------------------------------------------------------------------------------------------
// C2.10 · Capacity & waitlist
// ---------------------------------------------------------------------------------------------

@Composable
private fun CapacityTab(e: EventData, apps: List<ApplicationData>) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val wl = rememberCached("orgWaitlist:${e.id}", ListSerializer(WaitlistSeat.serializer()), Fresh.SHORT) { AppGraph.allocation.waitlist(e.id) }
    var busy by remember { mutableStateOf<String?>(null) }
    val committees = e.committees.filter { it.name.isNotBlank() }
    if (committees.isEmpty()) { Empty("No committees yet", "Capacity is set per committee.", icon = Icons.gavel); return }
    val entries = wl.data.orEmpty()
    Section {
        committees.forEach { k ->
            val filled = seated(apps, k.name).size
            val cap = k.capacity ?: 0
            val waiting = entries.count { sameCommittee(it.committeeId, k.name) && it.status == "waiting" }
            cell(
                k.name,
                subtitle = (if (cap > 0) "$filled of $cap" else "$filled seated · no limit set") + if (waiting > 0) " · $waiting waiting" else "",
                trailing = {
                    when {
                        cap <= 0 -> Chip("No limit")
                        filled >= cap -> Chip("Full", Tone.Destructive)
                        else -> Chip("${cap - filled} left", Tone.Tint)
                    }
                },
            )
        }
    }
    committees.forEach { k ->
        val list = entries.filter { sameCommittee(it.committeeId, k.name) }
        if (list.isEmpty()) return@forEach
        Section(header = "Waitlist · ${k.name}") {
            list.forEach { w ->
                cell(
                    w.applicantName.ifEmpty { "Applicant" },
                    subtitle = w.createdAt?.let { "Applied ${com.munpro.app.domain.shortWhen(it)}" },
                    trailing = {
                        when (w.status) {
                            "waiting" -> Pill(if (busy == w.id) "…" else "Offer Seat", {
                                busy = w.id
                                scope.launch {
                                    runCatching { AppGraph.allocation.offerSeat(e.id, e.title, w) }.fold(onSuccess = { Refresh.bump() }, onFailure = { alerts.show("Couldn't offer the seat", FAIL) })
                                    busy = null
                                }
                            }, filled = true, enabled = busy == null)
                            "offered" -> Chip("Offered · ${w.notifiedAt?.let { maxOf(0L, WAITLIST_OFFER_HOURS - (System.currentTimeMillis() - it) / 3_600_000L) } ?: WAITLIST_OFFER_HOURS}h", Tone.Info)
                            "accepted" -> Chip("Accepted", Tone.Tint)
                            else -> Chip(w.status.replaceFirstChar { it.uppercase() })
                        }
                    },
                )
            }
        }
    }
    if (entries.isEmpty()) Text("No one is on a waitlist.", style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp))
    else SectionFooter("An offer emails them and lasts $WAITLIST_OFFER_HOURS hours.")
}
