package com.munpro.app.ui.organizer

// The organizer's events (board C1; web dashboard/organizer, organizer/events, CreateEventDialog
// and organizer/events/[id]): the home's totals and applications by role, the event list, one
// form to create or edit an event (cover, dates, time zone, format, venue search with a map pin,
// visibility, description), the publish checklist of a draft, a published event's overview, and
// the event menu (the web's event sidebar; screens not in the app yet open the website's).
// Data: OrganizerRepo, GateRepo.organized.

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.munpro.app.AppGraph
import com.munpro.app.data.Api
import com.munpro.app.data.EventForm
import com.munpro.app.data.EventOverview
import com.munpro.app.data.Fresh
import com.munpro.app.data.OrganizedEvent
import com.munpro.app.data.OrganizerHome
import com.munpro.app.data.Place
import com.munpro.app.data.Refresh
import com.munpro.app.data.prepareImage
import com.munpro.app.data.rememberCached
import com.munpro.app.data.writingAssist
import com.munpro.app.domain.EventData
import com.munpro.app.domain.calTile
import com.munpro.app.domain.computeApplicationCloseAt
import com.munpro.app.domain.getEnabledRoleTiers
import com.munpro.app.domain.getEventStartMs
import com.munpro.app.nav.AllocationRoute
import com.munpro.app.nav.EventEditorRoute
import com.munpro.app.nav.EventMenuRoute
import com.munpro.app.nav.LiveControlRoute
import com.munpro.app.nav.OrgEventRoute
import com.munpro.app.nav.OrgEventsRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.discover.DateTile
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.Chip
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Hairline
import com.munpro.app.ui.kit.IconTile
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.LocalBack
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.PersonAvatar
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.PlainInput
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.RemoteImage
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
import com.munpro.app.ui.kit.SystemColors
import com.munpro.app.ui.kit.TextLink
import com.munpro.app.ui.kit.Toggle
import com.munpro.app.ui.kit.Tone
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.kit.rememberPress
import com.munpro.app.ui.kit.tap
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

private val FORMATS = listOf("offline" to "In person", "online" to "Virtual", "hybrid" to "Hybrid")
private fun formatLabel(f: String) = FORMATS.firstOrNull { it.first == f }?.second ?: "In person"

@Composable
private fun rememberOrganized(): List<OrganizedEvent>? {
    val uid = AppGraph.auth.user?.uid
    return rememberCached(uid?.let { "organize:$it" }, ListSerializer(OrganizedEvent.serializer()), Fresh.MEDIUM) { AppGraph.gate.organized(uid!!) }.data
}

/** Opens a page of the website (screens the app doesn't have yet). */
@Composable
private fun rememberSite(): (String) -> Unit {
    val context = LocalContext.current
    return { path -> Api.site(path)?.let { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(it))) } }
}

private fun dayRange(e: EventData): String {
    val fmt = DateTimeFormatter.ofPattern("d MMM", Locale.UK)
    val start = runCatching { LocalDate.parse(e.startDate?.ifEmpty { null } ?: e.date.take(10)) }.getOrNull() ?: return "Date TBA"
    val end = e.endDate?.ifEmpty { null }?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
    return when {
        end == null || end == start -> start.format(fmt)
        end.month == start.month -> "${start.dayOfMonth}–${end.format(fmt)}"
        else -> "${start.format(fmt)}–${end.format(fmt)}"
    }
}

private fun placeLine(e: EventData) = if (e.format == "online") "Online" else e.locationName?.ifEmpty { null } ?: e.location.ifEmpty { "Place TBA" }

// ---------------------------------------------------------------------------------------------
// C1.1 · Organizer home
// ---------------------------------------------------------------------------------------------

@Composable
fun OrganizerHomeScreen() {
    val c = palette
    val nav = LocalNav.current
    val uid = AppGraph.auth.user?.uid
    val home = rememberCached(uid?.let { "orgHome:$it" }, OrganizerHome.serializer(), Fresh.MEDIUM) { AppGraph.organizer.home(uid!!) }
    val organized = rememberOrganized()
    val profile = AppGraph.auth.profile
    val name = AppGraph.chats.me()?.name.orEmpty()

    Screen(back = "Back", tabBar = false, title = "Organize", overline = name.ifEmpty { null },
        navRight = { Pill("New Event", { nav.go(EventEditorRoute()) }, filled = true) }, savedAt = home.savedAt, onRefresh = {}) {
        val h = home.data
        if (h == null) { Spinner(); return@Screen }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            com.munpro.app.ui.chair.Stat("${h.events}", "Events", Modifier.weight(1f))
            com.munpro.app.ui.chair.Stat("${h.published}", "Published", Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            com.munpro.app.ui.chair.Stat("${h.applications}", "Applications", Modifier.weight(1f))
            com.munpro.app.ui.chair.Stat("${h.approved}", "Approved" + (if (h.applications > 0) " · ${(h.approved * 100.0 / h.applications).roundToInt()}%" else ""), Modifier.weight(1f))
        }
        Section(header = "Applications by role", footer = if (h.byRole.isEmpty()) "No applications yet." else null) {
            if (h.byRole.isNotEmpty()) item { RoleRow("Role", "Total", "OK", "Wait", header = true) }
            h.byRole.forEach { r -> item { RoleRow(r.role, "${r.total}", "${r.approved}", "${r.total - r.approved}") } }
        }
        val list = organized.orEmpty()
        Row(Modifier.fillMaxWidth().padding(end = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { SectionHeader("Your events") }
            if (list.isNotEmpty()) TextLink("See all", { nav.go(OrgEventsRoute) }, style = Type.subhead.copy(fontWeight = FontWeight.SemiBold, fontSize = 14.sp))
        }
        if (organized == null) Spinner()
        else if (list.isEmpty()) Empty("No events yet", "Create your first conference. It starts as a draft only you can see.", icon = Icons.calPlus,
            action = { MunButton("Create Event", { nav.go(EventEditorRoute()) }, icon = Icons.plus) })
        else Section { list.take(3).forEach { o -> eventCell(o) { nav.go(OrgEventRoute(o.event.id)) } } }
    }
}

@Composable
private fun RoleRow(role: String, total: String, ok: String, wait: String, header: Boolean = false) {
    val c = palette
    val style = if (header) Type.footnote.copy(fontWeight = FontWeight.SemiBold) else Type.subhead
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = if (header) 8.dp else 11.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(role, style = style, color = if (header) c.label2 else c.label, modifier = Modifier.weight(1f))
        Text(total, style = style, color = if (header) c.label2 else c.label, textAlign = TextAlign.End, modifier = Modifier.width(52.dp))
        Text(ok, style = style, color = if (header) c.label2 else c.tint, textAlign = TextAlign.End, modifier = Modifier.width(52.dp))
        Text(wait, style = style, color = if (header) c.label2 else c.orange, textAlign = TextAlign.End, modifier = Modifier.width(52.dp))
    }
}

private fun com.munpro.app.ui.kit.SectionScope.eventCell(o: OrganizedEvent, onClick: () -> Unit) {
    val e = o.event
    val ms = getEventStartMs(e)
    cell(
        e.title.ifEmpty { "Untitled event" },
        subtitle = "${dayRange(e)} · ${placeLine(e)}",
        leading = { calTile(ms).let { t -> DateTile(t.month, t.day) } }, inset = 70.dp,
        trailing = { Chip(if (o.published) "Live" else "Draft", if (o.published) Tone.Tint else Tone.Neutral) },
        onClick = onClick,
    )
}

// ---------------------------------------------------------------------------------------------
// C1.2 · Your events
// ---------------------------------------------------------------------------------------------

@Composable
fun OrgEventsScreen() {
    val c = palette
    val nav = LocalNav.current
    val list = rememberOrganized()
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf("all") }
    val all = list.orEmpty()
    Screen(back = "Organize", tabBar = false, title = "Events", navRight = { Pill("New", { nav.go(EventEditorRoute()) }, filled = true) }, onRefresh = {}) {
        SearchField(query, { query = it }, placeholder = "Search your events")
        Segmented(listOf(
            "all" to "All · ${all.size}", "published" to "Published · ${all.count { it.published }}", "drafts" to "Drafts · ${all.count { !it.published }}",
        ), filter, { filter = it })
        val shown = all.filter { o -> when (filter) { "published" -> o.published; "drafts" -> !o.published; else -> true } }
            .filter { query.isBlank() || it.event.title.contains(query.trim(), true) || placeLine(it.event).contains(query.trim(), true) }
        when {
            list == null -> Spinner()
            shown.isEmpty() -> Empty(if (all.isEmpty()) "No events yet" else "Nothing matches", if (all.isEmpty()) "Create your first conference." else "Try another search or filter.", icon = Icons.calPlus)
            else -> shown.forEach { o -> EventCard(o) { nav.go(OrgEventRoute(o.event.id)) } }
        }
    }
}

@Composable
private fun EventCard(o: OrganizedEvent, onClick: () -> Unit) {
    val c = palette
    val e = o.event
    val seats = e.committees.sumOf { it.capacity ?: 0 }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).tap(rememberPress(), label = e.title, onClick = onClick).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Chip(if (o.published) "Published" else "Draft", if (o.published) Tone.Tint else Tone.Neutral)
            Chip(formatLabel(e.format))
            if (o.coOrganizer) Chip("Co-organizer", Tone.Info)
        }
        Text(e.title.ifEmpty { "Untitled event" }, style = Type.headline, color = c.label)
        Text("${dayRange(e)} · ${placeLine(e)}", style = Type.footnote, color = c.label2)
        Text(
            listOfNotNull(
                "${e.committees.size} ${if (e.committees.size == 1) "committee" else "committees"}",
                seats.takeIf { it > 0 }?.let { "$it seats" },
                o.applicants?.takeIf { o.published }?.let { "$it applicant${if (it == 1) "" else "s"}" },
            ).joinToString(" · "),
            style = Type.footnote, color = c.label2,
        )
    }
}

// ---------------------------------------------------------------------------------------------
// C1.3–C1.6 · Create / edit an event, venue search, map pin
// ---------------------------------------------------------------------------------------------

private val DAY = DateTimeFormatter.ofPattern("EEE d MMM", Locale.UK)
private val CLOCK = DateTimeFormatter.ofPattern("h:mm a", Locale.UK)
private fun dayText(d: String) = runCatching { LocalDate.parse(d).format(DAY) }.getOrDefault("Choose a date")
private fun timeText(t: String) = runCatching { LocalTime.parse(t).format(CLOCK) }.getOrDefault("time")

@Composable
fun EventEditorScreen(eventId: String) {
    val c = palette
    val nav = LocalNav.current
    val goBack = LocalBack.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val status = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val editing = eventId.isNotEmpty()

    var original by remember { mutableStateOf<EventData?>(null) }
    var form by remember { mutableStateOf<EventForm?>(if (editing) null else EventForm()) }
    var showEnd by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    var uploading by remember { mutableStateOf(false) }
    var searching by remember { mutableStateOf(false) }
    var pinning by remember { mutableStateOf(false) }
    var zones by remember { mutableStateOf(false) }
    var aiBusy by remember { mutableStateOf(false) }

    LaunchedEffect(eventId) {
        if (!editing) return@LaunchedEffect
        val e = AppGraph.events.getEventById(eventId) ?: run { error = "Couldn't open this event."; return@LaunchedEffect }
        original = e
        form = EventForm.of(e)
        showEnd = !e.endDate.isNullOrEmpty() || !e.endTime.isNullOrEmpty()
    }
    val f = form
    fun set(fn: (EventForm) -> EventForm) { form = form?.let(fn) }

    val pickCover = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        uploading = true
        scope.launch {
            runCatching { Api.uploadImage(prepareImage(context, uri, 1600)) }
                .onSuccess { url -> set { it.copy(coverUrl = url) } }
                .onFailure { alerts.show("Couldn't upload the cover", "Check your connection and try again.") }
            uploading = false
        }
    }

    val startMs = f?.let { runCatching { java.time.LocalDateTime.parse(it.date).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli() }.getOrNull() }
    val inPast = startMs != null && startMs < System.currentTimeMillis()
    val canSubmit = f != null && f.title.isNotBlank() && f.startDate.isNotEmpty() && f.startTime.isNotEmpty() && f.description.isNotBlank() &&
        (f.format == "online" || f.location.isNotBlank()) && !inPast && !saving

    fun submit() {
        val ff = form ?: return
        if (!canSubmit) { error = if (inPast) "An event must not have a start time in the past." else "Please fill all required fields."; return }
        saving = true; error = null
        val final = if (showEnd) ff else ff.copy(endDate = "", endTime = "")
        scope.launch {
            runCatching {
                if (editing) { AppGraph.organizer.update(original!!, final); eventId }
                else AppGraph.organizer.create(final, AppGraph.auth.profile?.firstName?.ifBlank { null } ?: AppGraph.chats.me()?.name ?: "Host")
            }.fold(
                onSuccess = { id -> Refresh.bump(); goBack(); if (!editing) nav.go(OrgEventRoute(id)) },
                onFailure = { error = it.message ?: "Failed to save event. Please try again." },
            )
            saving = false
        }
    }

    var picking by remember { mutableStateOf<String?>(null) }

    Column(Modifier.fillMaxSize().background(c.bg)) {
        Spacer(Modifier.height(status))
        Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = Space.gutter), verticalAlignment = Alignment.CenterVertically) {
            TextLink("Cancel", { goBack() })
            Text(if (editing) "Edit Event" else "New Event", style = Type.headline, color = c.label, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
            Pill(if (saving) "…" else if (editing) "Save" else "Create", ::submit, filled = true, enabled = canSubmit)
        }
        Box(Modifier.fillMaxWidth().height(Hairline).background(c.separator))
        if (f == null) { if (error != null) ErrorText(error, Modifier.padding(Space.gutter)) else Spinner(); return@Column }

        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 14.dp, bottom = navBottom + 32.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            // Cover
            Box(
                Modifier.fillMaxWidth().height(170.dp).clip(RoundedCornerShape(Radius.cell)).background(c.fillSoft)
                    .tap(rememberPress(), label = "Cover") { pickCover.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                contentAlignment = Alignment.Center,
            ) {
                if (f.coverUrl.isNotEmpty()) RemoteImage(f.coverUrl, Modifier.fillMaxSize(), "Cover")
                if (uploading) Spinner()
                else if (f.coverUrl.isEmpty()) Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    SfIcon(Icons.plus, c.label2, size = 26.dp)
                    Text("Add a cover", style = Type.bodyMedium, color = c.label)
                    Text("Shown on the event page and cards", style = Type.footnote, color = c.label2)
                }
            }
            PlainInput(f.title, { v -> set { it.copy(title = v) } }, "Event name", style = Type.title2, singleLine = false, maxLength = 140, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words))
            val me = AppGraph.chats.me()
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                PersonAvatar(me?.name.orEmpty(), size = 38.dp, seed = me?.uid.orEmpty(), photo = AppGraph.auth.profile?.photoURL)
                Column {
                    Text("Hosted by", style = Type.footnote, color = c.label2)
                    Text(me?.name.orEmpty(), style = Type.bodyMedium, color = c.label)
                }
            }

            Section(footer = if (inPast) "The start can't be in the past." else null) {
                cell("Starts", value = if (f.startDate.isEmpty()) "Choose" else "${dayText(f.startDate)} · ${timeText(f.startTime)}", onClick = { picking = "start" })
                item {
                    Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("End date and time", style = Type.body, color = c.label, modifier = Modifier.weight(1f))
                        Toggle(showEnd, { showEnd = it }, "End date and time")
                    }
                }
                if (showEnd) cell("Ends", value = if (f.endDate.isEmpty()) "Choose" else "${dayText(f.endDate)} · ${timeText(f.endTime)}", onClick = { picking = "end" })
                cell("Time zone", value = f.timeZone, onClick = { zones = true })
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionHeader("Format")
                Segmented(FORMATS, f.format, { v -> set { it.copy(format = v) } })
            }
            if (f.format == "online") Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(14.dp)) {
                PlainInput(f.location, { v -> set { it.copy(location = v, place = null) } }, "Meeting link (optional)", modifier = Modifier.fillMaxWidth())
            } else Section {
                val p = f.place
                cell(
                    f.location.ifEmpty { "Search venue or address" },
                    subtitle = p?.let { listOfNotNull(it.address.ifEmpty { null }, if (it.latitude != null) "pinned" else null).joinToString(" · ") },
                    leading = { IconTile(SystemColors.red, Icons.pin) }, inset = 58.dp, dim = f.location.isEmpty(),
                    onClick = { searching = true },
                )
                if (f.location.isNotEmpty()) cell(if (p?.latitude != null) "Fine-tune the pin" else "Pin on the map", leading = { IconTile(SystemColors.green, Icons.pin) }, inset = 58.dp,
                    onClick = { pinning = true })
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionHeader("Visibility")
                Segmented(listOf("public" to "Public", "unlisted" to "Unlisted"), f.visibility, { v -> set { it.copy(visibility = v) } })
                SectionFooter("Public events are listed in Browse; unlisted ones only by link.")
            }

            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                PlainInput(f.description, { v -> set { it.copy(description = v) } }, "What are the details?", singleLine = false, minLines = 4, maxLength = 4000,
                    modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
                if (Api.available) TextLink(if (aiBusy) "Writing…" else if (f.description.isBlank()) "Suggest with AI" else "Improve", {
                    if (aiBusy) return@TextLink
                    aiBusy = true
                    scope.launch {
                        writingAssist(if (f.description.isBlank()) "suggest" else "improve", "event-description", f.description, mapOf("eventName" to f.title))
                            ?.let { out -> set { it.copy(description = out) } }
                            ?: alerts.show("AI couldn't help this time", "Try again in a moment.")
                        aiBusy = false
                    }
                }, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold))
            }
            ErrorText(error)
            if (!editing) SectionFooter("Saved as a draft. Add committees, tickets and schedule from the event before publishing.")
        }
    }

    LocationSearchSheet(searching, { searching = false }, f?.location.orEmpty()) { text, place ->
        searching = false
        set { it.copy(location = text, place = place) }
        if (place != null && place.latitude == null) pinning = true
    }
    if (pinning && f != null) PinMapSheet(f.place ?: Place(name = f.location), { pinning = false }) { p ->
        pinning = false
        set { it.copy(place = p) }
    }
    TimeZoneSheet(zones, { zones = false }, f?.timeZone.orEmpty()) { z -> zones = false; set { it.copy(timeZone = z) } }
    if (f != null) when (picking) {
        "start" -> DateTimeDialog(f.startDate, f.startTime.ifEmpty { "09:00" }, { picking = null }) { d, tm -> picking = null; set { it.copy(startDate = d, startTime = tm) } }
        "end" -> DateTimeDialog(f.endDate.ifEmpty { f.startDate }, f.endTime.ifEmpty { "17:00" }, { picking = null }) { d, tm -> picking = null; set { it.copy(endDate = d, endTime = tm) } }
    }
}

/** A date (today or later), then a time: the app's own pickers (as Sign Up's date of birth). */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
internal fun DateTimeDialog(date: String, time: String, onDismiss: () -> Unit, allowPast: Boolean = false, onPick: (String, String) -> Unit) {
    val c = palette
    val utc = java.time.ZoneOffset.UTC
    var day by remember { mutableStateOf<LocalDate?>(null) }
    val todayUtc = LocalDate.now().atStartOfDay(utc).toInstant().toEpochMilli()
    if (day == null) {
        val state = androidx.compose.material3.rememberDatePickerState(
            initialSelectedDateMillis = runCatching { LocalDate.parse(date) }.getOrDefault(LocalDate.now()).atStartOfDay(utc).toInstant().toEpochMilli(),
            selectableDates = object : androidx.compose.material3.SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long) = allowPast || utcTimeMillis >= todayUtc
            },
        )
        val colors = androidx.compose.material3.DatePickerDefaults.colors(
            containerColor = c.cell, selectedDayContainerColor = c.tint, selectedDayContentColor = c.onTint,
            todayDateBorderColor = c.tint, todayContentColor = c.tint, selectedYearContainerColor = c.tint, selectedYearContentColor = c.onTint,
        )
        androidx.compose.material3.DatePickerDialog(
            onDismissRequest = onDismiss,
            confirmButton = {
                androidx.compose.material3.TextButton({ state.selectedDateMillis?.let { day = Instant.ofEpochMilli(it).atZone(utc).toLocalDate() } }) {
                    Text("Next", color = c.tint, style = Type.headline)
                }
            },
            dismissButton = { androidx.compose.material3.TextButton(onDismiss) { Text("Cancel", color = c.tint, style = Type.body) } },
            colors = colors,
        ) { androidx.compose.material3.DatePicker(state, colors = colors, showModeToggle = true) }
    } else {
        val t = runCatching { LocalTime.parse(time) }.getOrDefault(LocalTime.of(9, 0))
        val state = androidx.compose.material3.rememberTimePickerState(t.hour, t.minute, is24Hour = false)
        androidx.compose.material3.AlertDialog(
            onDismissRequest = onDismiss,
            containerColor = c.cell,
            confirmButton = {
                androidx.compose.material3.TextButton({ onPick(day.toString(), "%02d:%02d".format(state.hour, state.minute)) }) {
                    Text("Done", color = c.tint, style = Type.headline)
                }
            },
            dismissButton = { androidx.compose.material3.TextButton({ day = null }) { Text("Back", color = c.tint, style = Type.body) } },
            title = { Text(day!!.format(DAY), style = Type.headline, color = c.label) },
            text = {
                androidx.compose.material3.TimePicker(state, colors = androidx.compose.material3.TimePickerDefaults.colors(
                    selectorColor = c.tint, timeSelectorSelectedContainerColor = c.tintSoft, timeSelectorSelectedContentColor = c.tint,
                    periodSelectorSelectedContainerColor = c.tintSoft, periodSelectorSelectedContentColor = c.tint,
                ))
            },
        )
    }
}

/** C1.5: Google Maps places through the site; or keep what was typed, or pin it by hand. */
@Composable
private fun LocationSearchSheet(visible: Boolean, onDismiss: () -> Unit, initial: String, onPick: (String, Place?) -> Unit) {
    val c = palette
    val scope = rememberCoroutineScope()
    var query by remember(visible) { mutableStateOf(initial) }
    var results by remember(visible) { mutableStateOf<List<Place>?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember(visible) { mutableStateOf<String?>(null) }
    fun search() {
        if (query.trim().length < 2) { error = "Type at least 2 characters to search."; return }
        busy = true; error = null
        scope.launch {
            AppGraph.organizer.searchPlaces(query).fold(onSuccess = { results = it }, onFailure = { error = it.message })
            busy = false
        }
    }
    PageSheet(visible, onDismiss) {
        SheetHeader("Location", leading = "Cancel", onLeading = onDismiss, divider = true)
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(Space.gutter), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            SearchField(query, { query = it }, placeholder = "Search venue or address", onSubmit = ::search)
            MunButton(if (busy) "Searching Google Maps…" else "Search", ::search, loading = busy, variant = ButtonVariant.Tinted, height = 44.dp)
            ErrorText(error)
            results?.let { list ->
                if (list.isEmpty()) Text("No places found. Keep what you typed, or pin it on the map.", style = Type.footnote, color = c.label2)
                else Section {
                    list.forEach { p ->
                        cell(
                            p.name, subtitle = listOfNotNull(
                                p.address.ifEmpty { null },
                                listOfNotNull(p.category, p.rating?.let { r -> "$r ★" + (p.ratingCount?.let { " (${"%,d".format(it)})" } ?: "") }).joinToString(" · ").ifEmpty { null },
                            ).joinToString("\n"),
                            leading = { IconTile(SystemColors.red, Icons.pin) }, inset = 58.dp,
                            onClick = { onPick(p.name, p) },
                        )
                    }
                }
            }
            if (query.isNotBlank()) Section {
                cell("Use “${query.trim()}” as typed", subtitle = "No map coordinates", onClick = { onPick(query.trim(), null) })
                cell("Pin on the map instead", leading = { IconTile(SystemColors.green, Icons.pin) }, inset = 58.dp,
                    onClick = { onPick(query.trim(), Place(name = query.trim())) })
            }
        }
    }
}

/** C1.6: drag the OpenStreetMap map under a fixed pin; the centre is the place. */
@Composable
private fun PinMapSheet(start: Place, onDismiss: () -> Unit, onUse: (Place) -> Unit) {
    val c = palette
    val context = LocalContext.current
    val nav = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val startAt = start.latitude?.let { la -> start.longitude?.let { lo -> la to lo } }
    var center by remember { mutableStateOf(startAt) }
    // Without a pin to start from, nothing is captured until the map is actually moved.
    var touched by remember { mutableStateOf(startAt != null) }
    remember {
        org.osmdroid.config.Configuration.getInstance().apply {
            userAgentValue = context.packageName
            osmdroidBasePath = java.io.File(context.cacheDir, "osmdroid")
            osmdroidTileCache = java.io.File(context.cacheDir, "osmdroid/tiles")
        }
    }
    PageSheet(true, onDismiss) {
        SheetHeader(if (startAt != null) "Fine-tune the pin" else "Pin the location", leading = "Cancel", onLeading = onDismiss, divider = true)
        Box(Modifier.fillMaxWidth().weight(1f).clipToBounds()) {
            AndroidView(
                factory = { ctx ->
                    org.osmdroid.views.MapView(ctx).apply {
                        setTileSource(org.osmdroid.tileprovider.tilesource.TileSourceFactory.MAPNIK)
                        setMultiTouchControls(true)
                        zoomController.setVisibility(org.osmdroid.views.CustomZoomButtonsController.Visibility.NEVER)
                        val s = center
                        controller.setZoom(if (s != null) 17.0 else 3.0)
                        controller.setCenter(org.osmdroid.util.GeoPoint(s?.first ?: 20.0, s?.second ?: 0.0))
                        setOnTouchListener { v, ev -> touched = true; if (ev.action == android.view.MotionEvent.ACTION_UP) v.performClick(); false }
                        addMapListener(object : org.osmdroid.events.MapListener {
                            override fun onScroll(event: org.osmdroid.events.ScrollEvent?): Boolean { if (touched) center = mapCenter.latitude to mapCenter.longitude; return false }
                            override fun onZoom(event: org.osmdroid.events.ZoomEvent?): Boolean { if (touched) center = mapCenter.latitude to mapCenter.longitude; return false }
                        })
                    }
                },
                onRelease = { it.onDetach() },
                modifier = Modifier.fillMaxSize(),
            )
            // The pin sits on the centre; its point is at the bottom of the icon.
            Box(Modifier.align(Alignment.Center).padding(bottom = 36.dp)) { SfIcon(Icons.pin, c.red, size = 40.dp) }
            Text("Drag the map to move the pin", style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = Color.White,
                modifier = Modifier.align(Alignment.TopCenter).padding(top = 12.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.6f)).padding(horizontal = 12.dp, vertical = 6.dp))
            Text("© OpenStreetMap contributors", style = Type.caption.copy(fontWeight = FontWeight.Normal), color = Color.Black,
                modifier = Modifier.align(Alignment.BottomEnd).background(Color.White.copy(alpha = 0.75f)).padding(horizontal = 6.dp, vertical = 2.dp))
        }
        Column(Modifier.fillMaxWidth().background(c.bg).padding(start = Space.gutter, end = Space.gutter, top = 14.dp, bottom = nav + 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(start.name.ifEmpty { "Location" }, style = Type.headline, color = c.label)
            Text(center?.let { (la, lo) -> "%.4f, %.4f · captured".format(Locale.US, la, lo) } ?: "Move the map to place the pin", style = Type.footnote, color = c.label2)
            MunButton("Use This Location", { center?.let { (la, lo) -> onUse(start.copy(latitude = la, longitude = lo)) } }, enabled = center != null)
        }
    }
}

@Composable
private fun TimeZoneSheet(visible: Boolean, onDismiss: () -> Unit, current: String, onPick: (String) -> Unit) {
    var q by remember(visible) { mutableStateOf("") }
    val all = remember { ZoneId.getAvailableZoneIds().filter { '/' in it && !it.startsWith("Etc/") && !it.startsWith("SystemV/") }.sorted() }
    PageSheet(visible, onDismiss) {
        SheetHeader("Time zone", leading = "Cancel", onLeading = onDismiss, divider = true)
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(Space.gutter), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SearchField(q, { q = it }, placeholder = "Search city or region")
            Section {
                all.filter { q.isBlank() || it.contains(q.trim().replace(' ', '_'), true) }.take(60).forEach { z ->
                    cell(z.replace('_', ' '), trailing = if (z == current) ({ SfIcon(Icons.check, palette.tint, size = 18.dp) }) else null, chevron = false, onClick = { onPick(z) })
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// C1.7 / C1.8 / C1.10 · The event: publish checklist, live overview, unpublish
// ---------------------------------------------------------------------------------------------

@Composable
private fun rememberOverview(eventId: String) =
    rememberCached("orgEvent:$eventId", EventOverview.serializer(), Fresh.SHORT) { AppGraph.organizer.overview(eventId) ?: error("Event not found") }

private fun ago(iso: String?): String? = iso?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }?.let { com.munpro.app.domain.ago(it) }

@Composable
fun OrgEventScreen(eventId: String) {
    val c = palette
    val nav = LocalNav.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val site = rememberSite()
    val data = rememberOverview(eventId)
    var busy by remember { mutableStateOf(false) }
    val base = "/dashboard/organizer/events/$eventId"

    val o = data.data
    val e = o?.event
    val published = e?.status == "published"
    val start = getEventStartMs(e)
    val days = start?.let { maxOf(0L, Math.ceil((it - System.currentTimeMillis()) / 86_400_000.0).toLong()) }

    fun setPublished(p: Boolean) = scope.launch {
        busy = true
        // A Free event counts against the owner's Free events at once (Plan.kt); rules can't count.
        if (p && e != null && !com.munpro.app.domain.resolvePlan(e, null).isPro) {
            val slots = runCatching { AppGraph.finance.freeEventsInUse(e.organizerId.orEmpty(), eventId) }.getOrNull()
            if (slots != null && slots.first >= slots.second) {
                alerts.show("Free events limit reached", "You already have ${slots.first} published Free event${if (slots.first == 1) "" else "s"} (the limit is ${slots.second}). Make this event Pro, or ask for more room, under Event › Plan.")
                busy = false
                return@launch
            }
        }
        runCatching { AppGraph.organizer.setStatus(eventId, p) }.fold(onSuccess = { Refresh.bump() }, onFailure = { alerts.show("Couldn't save", "Check your connection and try again.") })
        busy = false
    }

    Screen(
        back = "Events", tabBar = false, title = e?.title?.ifEmpty { "Untitled event" } ?: "Event",
        overline = e?.let { if (published) "Published · ${days?.let { d -> if (d == 0L) "today" else "$d days away" } ?: "date TBA"}" else listOfNotNull("Draft", ago(it.lastEditedAt)?.let { a -> if (a == "now") "edited just now" else if (a.any(Char::isLetter) && a.length > 3) "edited $a" else "edited $a ago" }).joinToString(" · ") },
        navRight = { Pill("Menu", { nav.go(EventMenuRoute(eventId)) }) },
        savedAt = data.savedAt, onRefresh = {},
    ) {
        if (o == null || e == null) { if (data.failed) Empty("Couldn't open this event", "It may have been deleted, or you're offline.", icon = Icons.calPlus) else Spinner(); return@Screen }
        Text("${dayRange(e)} · ${placeLine(e)}", style = Type.subhead, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp))

        if (!published) {
            // C1.7 · Ready to publish?
            val seats = e.committees.sumOf { it.capacity ?: 0 }
            val checks = listOf(
                Triple("Basics", "Title, date, location, description", e.title.isNotBlank() && e.date.isNotBlank() && e.location.isNotBlank() && e.description.isNotBlank()),
                Triple("Committees", if (e.committees.isNotEmpty()) "${e.committees.size} ${if (e.committees.size == 1) "committee" else "committees"} · $seats seats" else "Add at least one with seats",
                    e.committees.any { it.name.isNotBlank() && (it.capacity ?: 0) > 0 }),
                Triple("Roles & pricing", "Accept at least one role", getEnabledRoleTiers(e).isNotEmpty()),
                Triple("Details", "Audience and deadlines", (e.expectedDelegates ?: 0) > 0 || !e.targetAudience.isNullOrBlank() || e.applicationDeadlines != null),
            )
            val links = listOf<() -> Unit>(
                { nav.go(EventEditorRoute(eventId)) }, { nav.go(com.munpro.app.nav.CommitteesRoute(eventId)) }, { site("$base/financials") }, { nav.go(com.munpro.app.nav.EventDetailsRoute(eventId)) },
            )
            val ready = checks.all { it.third }
            Section(header = "Ready to publish? · ${checks.count { it.third }} of ${checks.size}", footer = if (ready) "Everything required is set. Publishing lists it in Browse and opens applications." else "Publish unlocks when the four required steps are done.") {
                checks.forEachIndexed { i, (title, sub, done) ->
                    cell(title, subtitle = sub, leading = { CheckDot(done) }, inset = 52.dp,
                        trailing = if (!done) ({ Pill("Set up", links[i], filled = true) }) else null, chevron = done, onClick = links[i])
                }
                cell("Schedule", subtitle = if (e.schedule.isNotEmpty()) "${e.schedule.size} items" else "Optional", leading = { CheckDot(e.schedule.isNotEmpty(), optional = true) }, inset = 52.dp,
                    onClick = { nav.go(com.munpro.app.nav.ScheduleBuilderRoute(eventId)) })
            }
            MunButton("Publish", { setPublished(true) }, loading = busy, enabled = ready)
            MunButton("Preview public page", { site("/events/$eventId") }, variant = ButtonVariant.Plain)
            return@Screen
        }

        // C1.8 · Live overview
        val cap = e.committees.sumOf { it.capacity ?: 0 }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            com.munpro.app.ui.chair.Stat("${o.applicants}", "Applicants", Modifier.weight(1f))
            com.munpro.app.ui.chair.Stat("${o.approved}", "Approved", Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            com.munpro.app.ui.chair.Stat(if (cap > 0) "${(o.approved * 100.0 / cap).roundToInt()}%" else "N/A", "Capacity", Modifier.weight(1f))
            com.munpro.app.ui.chair.Stat(days?.toString() ?: "–", "Days away", Modifier.weight(1f))
        }
        val closeAt = computeApplicationCloseAt(e)
        val closeIn = closeAt?.let { it - System.currentTimeMillis() }?.takeIf { it in 1..7 * 86_400_000L }
        val needs = listOfNotNull<Triple<String, String?, () -> Unit>>(
            o.toReview.takeIf { it > 0 }?.let { Triple("$it application${if (it == 1) "" else "s"} to review", null, { nav.go(AllocationRoute(eventId, "applications")) }) },
            o.needCountry.takeIf { it > 0 }?.let { Triple("$it delegate${if (it == 1) "" else "s"} need${if (it == 1) "s" else ""} a country", "Assign", { nav.go(AllocationRoute(eventId, "countries")) }) },
            closeIn?.let { ms -> Triple("Applications close in ${if (ms < 86_400_000L) "${ms / 3_600_000L}h" else "${ms / 86_400_000L} days"}", null, { site("$base/details") }) },
            o.moves?.takeIf { it > 0 }?.let { Triple("$it move request${if (it == 1) "" else "s"}", null, { nav.go(AllocationRoute(eventId, "moves")) }) },
        )
        Section(header = "Needs you", footer = if (needs.isEmpty()) "Nothing waiting on you." else null) {
            needs.forEach { (t, action, go) ->
                cell(t, trailing = action?.let { a -> { Pill(a, go, filled = true) } }, onClick = go)
            }
        }
        if (o.committees.isNotEmpty()) Section(header = "Committees") {
            o.committees.forEach { (name, n, capacity) ->
                item {
                    Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row {
                            Text(name, style = Type.bodyMedium, color = c.label, modifier = Modifier.weight(1f))
                            Text("$n/$capacity", style = Type.subhead.copy(fontWeight = FontWeight.SemiBold), color = c.label2)
                        }
                        Box(Modifier.fillMaxWidth().height(6.dp).clip(CircleShape).background(c.fillSoft)) {
                            Box(Modifier.fillMaxWidth((n.toFloat() / capacity.coerceAtLeast(1)).coerceIn(0f, 1f)).height(6.dp).clip(CircleShape).background(c.tint))
                        }
                    }
                }
            }
        }
        MunButton("Edit Event", { nav.go(EventEditorRoute(eventId)) }, variant = ButtonVariant.Tinted)
        MunButton("Unpublish", {
            scope.launch {
                // C1.10
                if (alerts.confirm("Unpublish ${e.title}?", "It disappears from Browse and new applications stop. Approved delegates keep their seats.", "Unpublish", destructive = true)) setPublished(false)
            }
        }, variant = ButtonVariant.Plain, destructive = true, loading = busy)
    }
}

@Composable
private fun CheckDot(done: Boolean, optional: Boolean = false) {
    val c = palette
    Box(
        Modifier.size(24.dp).clip(CircleShape).background(if (done) c.tint else if (optional) c.fillSoft else c.orangeSoft),
        contentAlignment = Alignment.Center,
    ) { if (done) SfIcon(Icons.check, Color.White, size = 14.dp) }
}

// ---------------------------------------------------------------------------------------------
// C1.9 · Event menu
// ---------------------------------------------------------------------------------------------

@Composable
fun EventMenuScreen(eventId: String) {
    val nav = LocalNav.current
    val site = rememberSite()
    val data = rememberOverview(eventId)
    val e = data.data?.event
    val owner = e?.organizerId == AppGraph.auth.user?.uid
    val planSettings = rememberPlanSettings().data
    val base = "/dashboard/organizer/events/$eventId"
    Screen(back = "Event", tabBar = false, title = e?.title?.ifEmpty { "Event" } ?: "Event", overline = if (e == null) null else if (owner) "Owner" else "Co-organizer") {
        Section(header = "Setup") {
            cell("Overview", leading = { IconTile(SystemColors.green, Icons.chart) }, inset = 58.dp, onClick = { nav.go(OrgEventRoute(eventId)) })
            cell("Edit event", subtitle = "Name, dates, place, description", leading = { IconTile(SystemColors.blue, Icons.pen) }, inset = 58.dp, onClick = { nav.go(EventEditorRoute(eventId)) })
            cell("Details", leading = { IconTile(SystemColors.blue, Icons.doc) }, inset = 58.dp, onClick = { nav.go(com.munpro.app.nav.EventDetailsRoute(eventId)) })
            cell("Allocation", leading = { IconTile(SystemColors.indigo, Icons.list) }, inset = 58.dp,
                trailing = data.data?.toReview?.takeIf { it > 0 }?.let { n -> { Chip("$n", Tone.Warning) } }, onClick = { nav.go(AllocationRoute(eventId)) })
            cell("Committees", leading = { IconTile(SystemColors.teal, Icons.gavel) }, inset = 58.dp, onClick = { nav.go(com.munpro.app.nav.CommitteesRoute(eventId)) })
            cell("Staff", leading = { IconTile(SystemColors.purple, Icons.people) }, inset = 58.dp, onClick = { nav.go(com.munpro.app.nav.StaffRoute(eventId)) })
            cell("Partners", leading = { IconTile(SystemColors.gold, Icons.star) }, inset = 58.dp, onClick = { nav.go(com.munpro.app.nav.PartnersRoute(eventId)) })
        }
        Section(header = "Content") {
            cell("Schedule", leading = { IconTile(SystemColors.orange, Icons.cal) }, inset = 58.dp, onClick = { nav.go(com.munpro.app.nav.ScheduleBuilderRoute(eventId)) })
            cell("Announcements", leading = { IconTile(SystemColors.red, Icons.mega) }, inset = 58.dp, onClick = { nav.go(com.munpro.app.nav.OrgAnnouncementsRoute(eventId)) })
            cell("Rules & regulations", leading = { IconTile(SystemColors.navy, Icons.book) }, inset = 58.dp, onClick = { nav.go(com.munpro.app.nav.RulesEditorRoute(eventId)) })
        }
        Section(header = "Live MUN · Tools · Finances") {
            cell("Live Control", leading = { IconTile(SystemColors.green, Icons.live) }, inset = 58.dp, onClick = { nav.go(LiveControlRoute(eventId)) })
            cell("Modules & tools", leading = { IconTile(SystemColors.blue, Icons.folder) }, inset = 58.dp, onClick = { nav.go(com.munpro.app.nav.ToolsRoute(eventId)) })
            cell("Complaints", leading = { IconTile(SystemColors.orange, Icons.alert) }, inset = 58.dp, onClick = { nav.go(com.munpro.app.nav.OrgComplaintsRoute(eventId)) })
            cell("ID cards", leading = { IconTile(SystemColors.gray, Icons.card) }, inset = 58.dp, onClick = { nav.go(com.munpro.app.nav.IdCardsRoute(eventId)) })
            cell("Certificates", leading = { IconTile(SystemColors.gold, Icons.trophy) }, inset = 58.dp, onClick = { nav.go(com.munpro.app.nav.CertificatesSetupRoute(eventId)) })
            cell("Results", leading = { IconTile(SystemColors.green, Icons.check) }, inset = 58.dp, onClick = { nav.go(com.munpro.app.nav.ResultsApprovalRoute(eventId)) })
            cell("Theme", leading = { IconTile(SystemColors.purple, Icons.sparkle) }, inset = 58.dp, onClick = { nav.go(com.munpro.app.nav.ThemeSetupRoute(eventId)) })
            cell(if (owner) "Financials" else "Roles & schedule", subtitle = if (owner) "Tickets, schedule and money" else "Prices are the owner's",
                leading = { IconTile(SystemColors.navy, Icons.card) }, inset = 58.dp, onClick = { nav.go(com.munpro.app.nav.FinancialsRoute(eventId)) })
            if (e != null) cell("Plan", value = com.munpro.app.domain.resolvePlan(e, planSettings).label,
                leading = { IconTile(SystemColors.gold, Icons.star) }, inset = 58.dp, onClick = { nav.go(com.munpro.app.nav.EventPlanRoute(eventId)) })
        }
    }
}
