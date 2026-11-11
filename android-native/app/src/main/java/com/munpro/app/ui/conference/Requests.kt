package com.munpro.app.ui.conference

// Requests (board B2.1–B2.6; web portal ?tab=complaints: MigrationPanel + ComplaintSystem). Change
// your seat (a move the organizer approves; an occupied seat becomes a swap its holder must
// accept within the organizer's window), answer a swap offer for your own seat, and the help-desk
// requests that start with your chair and can be escalated to the organizer, the main organizer
// and the App Admin. Data: RequestsRepo (listeners), the site's /api/migrations routes.

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
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
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.data.Api
import com.munpro.app.data.Fresh
import com.munpro.app.data.rememberCached
import com.munpro.app.data.writingAssist
import com.munpro.app.domain.COMPLAINT_TYPES
import com.munpro.app.domain.Complaint
import com.munpro.app.domain.Conference
import com.munpro.app.domain.ESCALATION_STEPS
import com.munpro.app.domain.Member
import com.munpro.app.domain.MigrationRequest
import com.munpro.app.domain.committeeOf
import com.munpro.app.domain.complaintStatusLabel
import com.munpro.app.domain.complaintTypeLabel
import com.munpro.app.domain.countdown
import com.munpro.app.domain.countryName
import com.munpro.app.domain.migrationStatusLabel
import com.munpro.app.domain.sameCommittee
import com.munpro.app.domain.shortWhen
import com.munpro.app.nav.RequestDetailRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.kit.Chip
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Flag
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.LocalAlerts
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
import com.munpro.app.ui.kit.SfIcon
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.Space
import com.munpro.app.ui.kit.Spinner
import com.munpro.app.ui.kit.TextLink
import com.munpro.app.ui.kit.Tone
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer

/** The web's canMigrate: not faculty, with a committee and a country. */
fun canMigrate(c: Conference): Boolean = !c.app.role.contains("faculty", true) && committeeOf(c.app).isNotEmpty() && !c.app.assignedCountry.isNullOrEmpty()

@Composable
private fun rememberNow(ticking: Boolean): Long {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(ticking) { while (ticking) { now = System.currentTimeMillis(); delay(1000) } }
    return now
}

private fun complaintTone(status: String) = when (status) {
    "resolved" -> Tone.Tint
    "escalated" -> Tone.Warning
    "rejected" -> Tone.Destructive
    else -> Tone.Info
}

private fun withLabel(c: Complaint) = when (c.assignedRole) {
    "organizer" -> "with the Organizer"
    "mainOrganizer" -> "with the Main organizer"
    "appAdmin" -> "with the App Admin"
    else -> "with your Chair"
}

// ---------------------------------------------------------------------------------------------
// B2.1 · Requests
// ---------------------------------------------------------------------------------------------

@Composable
fun RequestsScreen(conf: Conference) {
    val c = palette
    val nav = LocalNav.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val (app, event) = conf
    val uid = AppGraph.auth.user?.uid.orEmpty()
    val moves by remember(event.id, uid) { AppGraph.requests.myMoves(event.id, uid) }.collectAsStateWithLifecycle(null)
    val offers by remember(event.id, uid) { AppGraph.requests.swapOffers(event.id, uid) }.collectAsStateWithLifecycle(emptyList())
    val requests by remember(app.id, uid) { AppGraph.requests.complaints(app.id, uid) }.collectAsStateWithLifecycle(null)
    val active = moves?.firstOrNull { it.active }
    val earlier = moves.orEmpty().filter { !it.active && it.status != "cancelled" }
    val now = rememberNow(active?.status == "awaiting_swap" || offers.isNotEmpty())
    var moving by remember { mutableStateOf(false) }
    var composing by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }

    fun act(block: suspend () -> String?) {
        busy = true
        scope.launch { block()?.let { alerts.show("That didn't go through", it) }; busy = false }
    }

    Screen(back = committeeOf(app).ifEmpty { "Portal" }, tabBar = false, title = "Requests",
        trailing = { RoundButton(Icons.compose, "New request", { composing = true }) }) {

        // B2.4 · someone was approved to swap into my seat.
        offers.forEach { o ->
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Swap offer", style = Type.headline, color = c.label, modifier = Modifier.weight(1f))
                    Chip("~${countdown((o.swapDeadline ?: 0L) - now)} left", Tone.Warning)
                }
                Text("${o.requesterName?.ifEmpty { null } ?: "A delegate"} wants your seat", style = Type.subhead, color = c.label)
                SeatLine("You give", o.toCommittee, o.toCountry)
                SeatLine("You get", o.fromCommittee, o.fromCountry)
                Text("Approved by the organizer. If you decline or don't answer, nothing changes.", style = Type.footnote, color = c.label2)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Pill("Decline", { act { AppGraph.requests.answerSwap(o.id, false) } }, tone = Tone.Neutral, enabled = !busy, modifier = Modifier.weight(1f))
                    Pill("Accept Swap", {
                        scope.launch {
                            if (alerts.confirm("Swap seats?", "You move to ${o.fromCommittee} as ${countryName(o.fromCountry)}, and they take your seat.", "Accept Swap")) act { AppGraph.requests.answerSwap(o.id, true) }
                        }
                    }, filled = true, enabled = !busy, modifier = Modifier.weight(1f))
                }
            }
        }

        if (canMigrate(conf)) {
            if (active == null) Section(footer = "The organizer reviews each move. A taken seat can be offered to its holder as a swap.") {
                cell(
                    "Change committee or country",
                    subtitle = "Now: ${committeeOf(app)} · ${countryName(app.assignedCountry.orEmpty())}",
                    leading = { Flag(app.assignedCountry, 22f) }, inset = 52.dp, chevron = false,
                    trailing = { Pill("Request a Move", { moving = true }) },
                )
            } else {
                // B2.3 · my move, waiting.
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Your move", style = Type.headline, color = c.label, modifier = Modifier.weight(1f))
                        Chip(if (active.status == "pending") "Pending review" else "Approved", if (active.status == "pending") Tone.Info else Tone.Tint)
                    }
                    SeatLine("From", active.fromCommittee, active.fromCountry)
                    SeatLine("To", active.toCommittee, active.toCountry)
                    if (active.status == "awaiting_swap") {
                        Text("Waiting for ${countryName(active.toCountry)}'s delegate to accept the swap.", style = Type.subhead, color = c.label)
                        Text("~${countdown((active.swapDeadline ?: 0L) - now)} left · otherwise it fails and you keep your seat", style = Type.footnote, color = c.label2)
                    } else {
                        Text("The organizer reviews it. You'll get a notification when they decide.", style = Type.footnote, color = c.label2)
                        Pill("Cancel request", {
                            scope.launch { if (alerts.confirm("Cancel this move?", "You keep your current seat.", "Cancel request", destructive = true)) act { AppGraph.requests.cancelMove(active.id) } }
                        }, tone = Tone.Neutral, enabled = !busy)
                    }
                }
            }
            if (earlier.isNotEmpty()) Section(header = "Earlier moves") {
                earlier.forEach { m ->
                    cell("${m.toCommittee} · ${countryName(m.toCountry)}", subtitle = m.createdAt?.let { "Requested ${shortWhen(it)}" },
                        leading = { Flag(m.toCountry, 22f) }, inset = 52.dp, chevron = false,
                        trailing = { Chip(migrationStatusLabel(m.status), if (m.status == "completed") Tone.Tint else if (m.status == "rejected" || m.status == "failed") Tone.Destructive else Tone.Neutral) })
                }
            }
        }

        val list = requests
        when {
            list == null -> Spinner()
            list.isEmpty() -> Empty("No requests yet", "Ask about procedure, the study guide, logistics, or report a problem. Requests go to your committee chair first.",
                action = { MunButton("New Request", { composing = true }, height = 44.dp) }, icon = Icons.bubble)
            else -> Section(header = "Your requests · ${list.size}", footer = "Requests go to your committee chair first, then up to the organizer if needed.") {
                list.forEach { r ->
                    cell(
                        r.subject.ifEmpty { "Request" },
                        subtitle = listOfNotNull(complaintTypeLabel(r.type), r.createdAt?.let(::shortWhen), withLabel(r).takeIf { r.status != "resolved" && r.status != "rejected" }).joinToString(" · "),
                        trailing = { Chip(complaintStatusLabel(r.status), complaintTone(r.status)) },
                        onClick = { nav.go(RequestDetailRoute(r.id)) },
                    )
                }
            }
        }
    }

    if (moving) MoveSheet(conf, { moving = false })
    NewRequestSheet(composing, { composing = false }, conf)
}

@Composable
private fun SeatLine(label: String, committee: String, country: String) {
    val c = palette
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(label, style = Type.footnote, color = c.label2, modifier = Modifier.width(64.dp))
        Flag(country, 20f)
        Column {
            Text(countryName(country), style = Type.subhead.copy(fontWeight = FontWeight.SemiBold), color = c.label)
            Text(committee, style = Type.footnote, color = c.label2)
        }
    }
}

// ---------------------------------------------------------------------------------------------
// B2.2 · Request a move
// ---------------------------------------------------------------------------------------------

@Composable
private fun MoveSheet(conf: Conference, onClose: () -> Unit) {
    val c = palette
    val scope = rememberCoroutineScope()
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val (app, event) = conf
    var committee by remember { mutableStateOf<String?>(null) }
    var country by remember { mutableStateOf<String?>(null) }
    var reason by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    // Who holds each seat (the portal's member list): a taken target becomes a swap.
    val members = rememberCached("members:${event.id}", ListSerializer(Member.serializer()), Fresh.LONG) {
        AppGraph.papers.members(event.id) ?: throw IllegalStateException("no api")
    }.data.orEmpty()
    val holder = if (committee != null && country != null) members.firstOrNull { !it.isStaff && it.uid != app.userId && sameCommittee(it.committee, committee) && it.country.equals(country, true) } else null
    val same = committee != null && sameCommittee(committee, committeeOf(app)) && country.equals(app.assignedCountry, true)

    PageSheet(true, onClose) {
        SheetHeader("Request a Move", leading = "Cancel", onLeading = onClose, trailing = if (busy) "Sending…" else "Send",
            trailingEnabled = committee != null && country != null && !same && !busy,
            onTrailing = {
                busy = true
                error = null
                scope.launch {
                    val err = AppGraph.requests.requestMove(event.id, committee!!, country!!, reason)
                    if (err == null) onClose() else error = err
                    busy = false
                }
            })
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 8.dp, bottom = navBottom + 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SeatLine("From", committeeOf(app), app.assignedCountry.orEmpty())
                if (committee != null && country != null) SeatLine("To", committee!!, country!!)
            }
            Section(header = "Committee") {
                event.committees.filter { it.name.isNotBlank() }.forEach { cm ->
                    val on = committee == cm.name
                    cell(cm.name, subtitle = "${cm.countries.size} seats", chevron = false,
                        trailing = if (on) ({ SfIcon(Icons.check, c.tint, size = 18.dp) }) else null,
                        onClick = { committee = cm.name; country = null })
                }
            }
            val countries = event.committees.firstOrNull { it.name == committee }?.countries.orEmpty()
            if (committee != null) Section(header = "Country") {
                countries.forEach { code ->
                    val taken = members.any { !it.isStaff && it.uid != app.userId && sameCommittee(it.committee, committee) && it.country.equals(code, true) }
                    val mine = sameCommittee(committee, committeeOf(app)) && code.equals(app.assignedCountry, true)
                    cell(countryName(code), leading = { Flag(code, 20f) }, inset = 52.dp, chevron = false, dim = mine,
                        value = when { mine -> "Your seat"; taken -> "Taken"; else -> null },
                        trailing = if (country == code) ({ SfIcon(Icons.check, c.tint, size = 18.dp) }) else null,
                        onClick = if (mine) null else ({ country = code }))
                }
            }
            if (holder != null) Text("${countryName(country!!)} is taken. If the organizer approves, its delegate is asked to swap with you.", style = Type.footnote, color = c.orange, modifier = Modifier.padding(horizontal = 4.dp))
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionHeader("Reason · optional")
                Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(14.dp)) {
                    PlainInput(reason, { reason = it }, "Why do you want to move?", singleLine = false, minLines = 3, maxLength = 500, modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
                }
            }
            ErrorText(error)
        }
    }
}

// ---------------------------------------------------------------------------------------------
// B2.5 · New request
// ---------------------------------------------------------------------------------------------

@Composable
private fun NewRequestSheet(visible: Boolean, onClose: () -> Unit, conf: Conference) {
    val c = palette
    val scope = rememberCoroutineScope()
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    var type by remember(visible) { mutableStateOf("general") }
    var subject by remember(visible) { mutableStateOf("") }
    var details by remember(visible) { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var helping by remember { mutableStateOf(false) }
    var error by remember(visible) { mutableStateOf<String?>(null) }
    PageSheet(visible, onClose) {
        SheetHeader("New Request", leading = "Cancel", onLeading = onClose, trailing = if (busy) "Sending…" else "Send",
            trailingEnabled = subject.isNotBlank() && details.isNotBlank() && !busy,
            onTrailing = {
                busy = true
                error = null
                scope.launch {
                    runCatching { AppGraph.requests.submitComplaint(conf.app, type, subject, details) }
                        .onSuccess { onClose() }
                        .onFailure { error = "That didn't send. Check your connection and try again." }
                    busy = false
                }
            })
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 8.dp, bottom = navBottom + 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Section(header = "Type") {
                COMPLAINT_TYPES.forEach { (k, label, hint) ->
                    cell(label, subtitle = hint, chevron = false, trailing = if (type == k) ({ SfIcon(Icons.check, c.tint, size = 18.dp) }) else null, onClick = { type = k })
                }
            }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                PlainInput(subject, { subject = it }, "Subject", maxLength = 120, modifier = Modifier.fillMaxWidth(), style = Type.bodyMedium,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
                Box(Modifier.fillMaxWidth().height(com.munpro.app.ui.kit.Hairline).background(c.separator))
                PlainInput(details, { details = it }, "What happened, and what do you need?", singleLine = false, minLines = 5, maxLength = 2000,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 120.dp), keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
                if (Api.available) TextLink(if (helping) "Writing…" else if (details.isBlank()) "Help me write" else "Improve with AI", {
                    if (helping) return@TextLink
                    helping = true
                    scope.launch {
                        writingAssist(if (details.isBlank()) "suggest" else "improve", "complaint", details, instruction = subject.ifBlank { null })?.let { details = it.take(2000) }
                        helping = false
                    }
                }, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold))
            }
            Text("It goes to your committee chair first. They can escalate it to the organizer.", style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp))
            ErrorText(error)
        }
    }
}

// ---------------------------------------------------------------------------------------------
// B2.6 · Request detail
// ---------------------------------------------------------------------------------------------

@Composable
fun RequestDetailScreen(id: String) {
    val c = palette
    val r by remember(id) { AppGraph.requests.complaint(id) }.collectAsStateWithLifecycle(null)
    Screen(back = "Requests", tabBar = false, navTitle = "Request", gap = 18.dp) {
        val x = r ?: run { Spinner(); return@Screen }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Chip(complaintTypeLabel(x.type))
                Chip(complaintStatusLabel(x.status), complaintTone(x.status))
            }
            Text(x.subject, style = Type.title2, color = c.label)
            Text(x.description, style = Type.body, color = c.label)
        }
        if (x.status != "resolved" && x.status != "rejected") Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SectionHeader("With")
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(14.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                ESCALATION_STEPS.forEachIndexed { i, step ->
                    val done = i < x.escalationLevel
                    val now = i == x.escalationLevel
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Box(Modifier.size(26.dp).clip(CircleShape).background(when { now -> c.tint; done -> c.tintSoft; else -> c.fill }), contentAlignment = Alignment.Center) {
                            Text("${i + 1}", style = Type.caption, color = if (now) c.onTint else if (done) c.tint else c.label3)
                        }
                        Text(step, style = Type.caption.copy(fontWeight = if (now) FontWeight.SemiBold else FontWeight.Normal), color = if (now) c.label else c.label2)
                    }
                }
            }
        }
        x.resolution?.ifBlank { null }?.let {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.tintSoft).padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Resolution", style = Type.caption, color = c.tint)
                Text(it, style = Type.body, color = c.label)
            }
        }
        if (x.history.isNotEmpty()) Section(header = "Activity") {
            x.history.sortedByDescending { it.timestamp ?: 0L }.forEach { h ->
                val who = h.actorRole.replaceFirstChar { it.uppercase() }
                val what = when (h.action) {
                    "submitted" -> if (h.actorUid == x.userId) "You opened this request" else "$who opened this request"
                    "escalated" -> "Escalated by the $who"
                    "resolved" -> "Resolved by the $who"
                    "rejected" -> "Closed by the $who"
                    else -> "$who · ${h.action}"
                }
                cell(what, subtitle = h.message.takeIf { it.isNotBlank() && it != "Complaint submitted." }?.let { "“$it”" },
                    value = h.timestamp?.let(::shortWhen), chevron = false)
            }
        }
        SectionFooter("Your chair, the organizer, the main organizer or the App Admin can escalate or resolve it.")
    }
}
