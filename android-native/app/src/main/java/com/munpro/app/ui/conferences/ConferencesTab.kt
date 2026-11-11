package com.munpro.app.ui.conferences

// The Conferences tab, the gate (board B1.1–B1.5; web dashboard/conferences + ConferenceCard).
// Mine: every application as a card with its state (tracker, payment lock, waitlist seat offer),
// filtered by role and sorted, Active & pending above Past; the committee consoles this account
// runs or watches stay on top until the chair hub (B4). Browse: published conferences, with
// filters and what you've applied to. Organize: the events you own or co-organize; managing them
// opens the website until the organizer boards (C).

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.data.Api
import com.munpro.app.data.Fresh
import com.munpro.app.data.OrganizedEvent
import com.munpro.app.data.PUBLISH_STEPS
import com.munpro.app.data.WAITLIST_OFFER_HOURS
import com.munpro.app.data.WaitlistEntry
import com.munpro.app.data.hoursLeft
import com.munpro.app.data.rememberCached
import com.munpro.app.domain.Conference
import com.munpro.app.domain.calTile
import com.munpro.app.domain.committeeOf
import com.munpro.app.domain.countryName
import com.munpro.app.domain.formatDueLabel
import com.munpro.app.domain.formatFee
import com.munpro.app.domain.formatLabel
import com.munpro.app.domain.getEventStartMs
import com.munpro.app.domain.getPaymentGate
import com.munpro.app.domain.place
import com.munpro.app.nav.CONF_BROWSE
import com.munpro.app.nav.CONF_MINE
import com.munpro.app.nav.ConferenceRoute
import com.munpro.app.nav.EventRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.discover.DateTile
import com.munpro.app.ui.discover.DiscoverScreen
import com.munpro.app.ui.home.FilterChips
import com.munpro.app.ui.kit.ActionSheet
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.Chip
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.Flag
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.Loading
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.RoundButton
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SectionFooter
import com.munpro.app.ui.kit.SectionHeader
import com.munpro.app.ui.kit.Segmented
import com.munpro.app.ui.kit.SheetRow
import com.munpro.app.ui.kit.Tone
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.tabs.TabHost
import com.munpro.app.ui.today.rememberSessionSeats
import com.munpro.app.ui.today.sessionRows
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer

private const val CONF_ORGANIZE = "organize"

/** The web's sections: by status, not by date. */
private val ACTIVE = setOf("pending", "approved", "waitlisted", "active")

@Composable
private fun rememberOrganized(): List<OrganizedEvent>? {
    val uid = AppGraph.auth.user?.uid
    return rememberCached(uid?.let { "organize:$it" }, ListSerializer(OrganizedEvent.serializer()), Fresh.MEDIUM) { AppGraph.gate.organized(uid!!) }.data
}

@Composable
fun ConferencesTab() {
    val segment by TabHost.conferences.collectAsStateWithLifecycle()
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()
    val organized = rememberOrganized()
    val mine = confs.conferences?.size
    val options = listOfNotNull(
        CONF_MINE to (mine?.let { "Mine · $it" } ?: "Mine"),
        CONF_BROWSE to "Browse",
        if (!organized.isNullOrEmpty()) CONF_ORGANIZE to "Organize · ${organized.size}" else null,
    )
    val current = if (options.any { it.first == segment }) segment else CONF_MINE
    val picker: @Composable () -> Unit = { Segmented(options, current, { TabHost.conferences.value = it }) }
    when (current) {
        CONF_BROWSE -> DiscoverScreen(title = "Conferences", header = picker)
        CONF_ORGANIZE -> Organize(organized.orEmpty(), picker)
        else -> Mine(picker)
    }
}

// ---------------------------------------------------------------------------------------------
// B1.1 / B1.2 · Mine
// ---------------------------------------------------------------------------------------------

private enum class Sort(val label: String) { Newest("Newest first"), Oldest("Oldest first"), Status("Status") }

@Composable
private fun Mine(picker: @Composable () -> Unit) {
    val nav = LocalNav.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()
    val seats = rememberSessionSeats()
    val list = confs.conferences
    val uid = AppGraph.auth.user?.uid
    var role by rememberSaveable { mutableStateOf("All") }
    var sort by rememberSaveable { mutableStateOf(Sort.Newest) }
    var sorting by remember { mutableStateOf(false) }
    var paying by remember { mutableStateOf<Conference?>(null) }
    val gone = remember { mutableStateListOf<String>() }

    // Seat offers wait on applications that aren't approved yet (one small query per conference).
    val waitingOn = list.orEmpty().filter { it.app.status in ACTIVE && it.app.status != "approved" }.map { it.event.id }.distinct().sorted()
    val offers = rememberCached(
        if (uid != null && waitingOn.isNotEmpty()) "waitlist:$uid:${waitingOn.joinToString(",")}" else null,
        ListSerializer(WaitlistEntry.serializer()), Fresh.SHORT,
    ) { AppGraph.gate.waitlist(waitingOn, uid!!) }.data.orEmpty()
    val answered = remember { mutableStateListOf<String>() }

    val roles = list.orEmpty().map { it.app.role }.filter { it.isNotEmpty() }.distinct()
    val shown = list.orEmpty()
        .filter { it.app.id !in gone && (role == "All" || it.app.role == role) }
        .let { l ->
            when (sort) {
                Sort.Newest -> l.sortedByDescending { getEventStartMs(it.event) ?: 0L }
                Sort.Oldest -> l.sortedBy { getEventStartMs(it.event) ?: Long.MAX_VALUE }
                Sort.Status -> l.sortedBy { it.app.status }
            }
        }
    val active = shown.filter { it.app.status in ACTIVE }
    val past = shown.filter { it.app.status !in ACTIVE }

    Screen(
        title = "Conferences", savedAt = confs.savedAt, onRefresh = { AppGraph.conferences.reload() },
        trailing = { RoundButton(Icons.sliders, "Sort", { sorting = true }) },
    ) {
        picker()
        if (seats.isNotEmpty()) Section(header = "Sessions") { sessionRows(seats, nav) }
        when {
            list == null -> Loading()
            list.isEmpty() -> Empty(
                "No conferences yet", "Conferences you apply to appear here, with where each application stands.",
                action = { MunButton("Find a Conference", { TabHost.conferences.value = CONF_BROWSE }, variant = if (seats.isEmpty()) ButtonVariant.Filled else ButtonVariant.Tinted) },
                icon = Icons.card,
            )
            else -> {
                if (roles.size > 1) FilterChips((listOf("All") + roles).map { it to if (it == "All") "All roles" else it }, role) { role = it }
                SectionHeader("Active & pending · ${active.size}")
                if (active.isEmpty()) Text("Nothing active. Browse to apply to a conference.", style = Type.footnote, color = palette.label2, modifier = Modifier.padding(horizontal = 16.dp))
                active.forEach { conf ->
                    val offer = offers.firstOrNull { it.eventId == conf.event.id && it.status == "offered" && it.id !in answered }
                    ConferenceCard(
                        conf, offer,
                        onPay = { paying = conf },
                        onWithdraw = {
                            scope.launch {
                                if (!alerts.confirm("Withdraw from ${conf.event.title}?", "Your application is removed. You can apply again while applications are open.", "Withdraw Application", destructive = true)) return@launch
                                runCatching { AppGraph.gate.withdraw(conf.app) }
                                    .onSuccess { gone += conf.app.id; AppGraph.conferences.reload() }
                                    .onFailure { alerts.show("Couldn't withdraw", "Check your connection and try again.") }
                            }
                        },
                        onAnswer = { entry, accept ->
                            scope.launch {
                                if (!accept && !alerts.confirm("Decline the seat?", "It passes to the next person on the waitlist.", "Decline", destructive = true)) return@launch
                                runCatching { AppGraph.gate.answerOffer(entry, accept) }
                                    .onSuccess {
                                        answered += entry.id
                                        if (accept) alerts.show("Seat accepted", "The organizer confirms your place and allocation next.")
                                    }
                                    .onFailure { alerts.show("That didn't go through", "Check your connection and try again.") }
                            }
                        },
                    )
                }
                if (past.isNotEmpty()) Section(header = "Past · ${past.size}") {
                    past.forEach { x ->
                        cell(
                            x.event.title,
                            subtitle = listOfNotNull(x.app.role.ifEmpty { null }, x.app.assignedCountry?.ifEmpty { null }?.let(::countryName), committeeOf(x.app).ifEmpty { null }).joinToString(" · "),
                            value = statusLabel(x.app.status),
                            leading = { calTile(getEventStartMs(x.event)).let { t -> DateTile(t.month, t.day) } }, inset = 70.dp,
                            onClick = { nav.go(EventRoute(x.event.id)) },
                        )
                    }
                }
            }
        }
    }

    ActionSheet(sorting, { sorting = false }, title = "Sort") {
        Sort.entries.forEach { s -> SheetRow(s.label, { sort = s; sorting = false }, selected = s == sort) }
    }
    paying?.let { com.munpro.app.ui.payments.PayFeeSheet(it) { paying = null } }
}

private fun statusLabel(status: String): String = when (status) {
    "approved" -> "Approved"
    "pending" -> "Under review"
    "waitlisted" -> "Waitlisted"
    "active" -> "Active"
    "rejected" -> "Not accepted"
    "withdrawn" -> "Withdrawn"
    "completed", "past" -> "Completed"
    else -> status.replaceFirstChar { it.uppercase() }
}

private fun statusTone(status: String): Tone = when (status) {
    "approved", "active" -> Tone.Tint
    "pending" -> Tone.Warning
    "waitlisted" -> Tone.Info
    "rejected" -> Tone.Destructive
    else -> Tone.Neutral
}

/** One application as the web's ConferenceCard: state, tracker, payment lock, seat offer. */
@Composable
private fun ConferenceCard(
    conf: Conference, offer: WaitlistEntry?,
    onPay: () -> Unit, onWithdraw: () -> Unit, onAnswer: (WaitlistEntry, Boolean) -> Unit,
) {
    val c = palette
    val nav = LocalNav.current
    val (app, event) = conf
    val gate = getPaymentGate(app, event)
    val locked = gate.blocksPortal
    val t = calTile(getEventStartMs(event))
    val committee = committeeOf(app)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
            DateTile(t.month, t.day)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(event.title, style = Type.headline, color = c.label, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(listOfNotNull(place(event).ifEmpty { formatLabel(event) }, app.role.ifEmpty { null }, committee.ifEmpty { null }).joinToString(" · "),
                    style = Type.footnote, color = c.label2, maxLines = 2, overflow = TextOverflow.Ellipsis)
                app.assignedCountry?.ifEmpty { null }?.let { country ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Flag(country, 16f)
                        Text(countryName(country), style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = c.label)
                    }
                }
            }
            when {
                locked -> Chip(if (gate.overdue) "Payment overdue" else "Payment required", if (gate.overdue) Tone.Destructive else Tone.Warning)
                offer != null -> Chip("Seat offered", Tone.Info)
                else -> Chip(statusLabel(app.status), statusTone(app.status))
            }
        }

        when {
            locked -> Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.fillSoft).padding(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("${gate.tierLabel} · ${formatFee(gate.amount)}", style = Type.subhead.copy(fontWeight = FontWeight.SemiBold), color = c.label)
                Text(listOfNotNull(gate.dueAt?.let { "Pay by ${java.time.Instant.ofEpochMilli(it).atZone(java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("d MMM", java.util.Locale.UK))}" }, formatDueLabel(gate)).joinToString(" · "),
                    style = Type.footnote, color = if (gate.overdue) c.red else c.label2)
                Text(if (gate.overdue) "The deadline has passed. Pay now or contact the organizer before your seat is released." else "Your committee, country and portal unlock as soon as payment clears.",
                    style = Type.footnote, color = c.label2, modifier = Modifier.padding(top = 4.dp))
            }
            offer != null -> Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.infoSoft).padding(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("A seat opened" + (offer.committeeId.ifEmpty { null }?.let { " in $it" } ?: ""), style = Type.subhead.copy(fontWeight = FontWeight.SemiBold), color = c.label)
                Text("~${offer.hoursLeft()}h left of $WAITLIST_OFFER_HOURS h to answer, or it passes to the next person.", style = Type.footnote, color = c.label2)
            }
            app.status == "pending" || app.status == "waitlisted" -> Tracker(app.status)
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            when {
                locked -> {
                    Pill("Portal locked", {}, enabled = false, tone = Tone.Neutral, modifier = Modifier.weight(1f))
                    Pill("Pay ${formatFee(gate.amount)}", onPay, filled = true, modifier = Modifier.weight(1f))
                }
                offer != null -> {
                    Pill("Decline", { onAnswer(offer, false) }, tone = Tone.Neutral, modifier = Modifier.weight(1f))
                    Pill("Accept Seat", { onAnswer(offer, true) }, filled = true, modifier = Modifier.weight(1f))
                }
                app.status == "approved" || app.status == "active" -> {
                    Pill("Details", { nav.go(EventRoute(event.id)) }, tone = Tone.Neutral, modifier = Modifier.weight(1f))
                    Pill("Open Portal", { nav.go(ConferenceRoute(app.id)) }, filled = true, modifier = Modifier.weight(1f))
                }
                else -> {
                    Pill("Details", { nav.go(EventRoute(event.id)) }, tone = Tone.Neutral, modifier = Modifier.weight(1f))
                    // Only while pending and unpaid, as on the web.
                    if (app.status == "pending" && app.paymentStatus != "paid") Pill("Withdraw", onWithdraw, tone = Tone.Destructive, modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

/** Applied → Under review → Decision (the web card's tracker). */
@Composable
private fun Tracker(status: String) {
    val c = palette
    val reached = if (status == "pending") 2 else 3
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            repeat(3) { i -> Box(Modifier.weight(1f).height(4.dp).clip(CircleShape).background(if (i < reached) (if (status == "pending") c.orange else c.info) else c.fill)) }
        }
        Row {
            listOf("Applied", "Under review", "Decision").forEachIndexed { i, l ->
                Text(l, style = Type.caption.copy(fontWeight = if (i < reached) FontWeight.SemiBold else FontWeight.Normal), color = if (i < reached) c.label else c.label3, modifier = Modifier.weight(1f))
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// B1.4 · Organize
// ---------------------------------------------------------------------------------------------

@Composable
private fun Organize(list: List<OrganizedEvent>, picker: @Composable () -> Unit) {
    val c = palette
    val nav = com.munpro.app.ui.LocalNav.current
    Screen(title = "Conferences") {
        picker()
        Section(header = "Your events · ${list.size}") {
            list.forEach { o ->
                val e = o.event
                val ms = getEventStartMs(e)
                val day = ms?.let { java.time.Instant.ofEpochMilli(it).atZone(java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("d MMM", java.util.Locale.UK)) } ?: "Date TBA"
                cell(
                    e.title.ifEmpty { "Untitled event" },
                    subtitle = if (o.published) listOfNotNull(day, o.applicants?.let { "$it applicant${if (it == 1) "" else "s"}" }, o.fullPct?.let { "$it% full" }).joinToString(" · ")
                        else "$day · ${o.stepsDone} of $PUBLISH_STEPS steps to publish",
                    leading = { calTile(ms).let { t -> DateTile(t.month, t.day) } }, inset = 70.dp,
                    trailing = {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                            if (o.coOrganizer) Chip("Co-organizer")
                            Chip(if (o.published) "Live" else "Draft", if (o.published) Tone.Tint else Tone.Neutral)
                        }
                    },
                    chevron = false,
                    onClick = { nav.go(com.munpro.app.nav.OrgEventRoute(e.id)) },
                )
            }
        }
        MunButton("Create Event", { nav.go(com.munpro.app.nav.EventEditorRoute()) }, icon = Icons.plus)
        Section {
            cell("Organizer home", subtitle = "Totals and applications by role", leading = { com.munpro.app.ui.kit.IconTile(c.tint, Icons.chart) }, inset = 58.dp,
                onClick = { nav.go(com.munpro.app.nav.OrganizerHomeRoute) })
        }
    }
}
