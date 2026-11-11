package com.munpro.app.ui.organizer

// Financials and Pro (board C6; web organizer/events/[id]/financials, organizer/financials,
// organizer/pro). Each role is a ticket with regular, early-bird and late prices; one shared
// application schedule decides which price is live. The owner sees the money (less the plan's
// platform fee) and the wallet with payout requests; a co-organizer gets roles and the schedule
// with prices locked. Pro belongs to the event (Plan.kt): pay for it, or ask the App Admin.
// Data: FinanceRepo.

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.munpro.app.AppGraph
import com.munpro.app.data.EventMoney
import com.munpro.app.data.Fresh
import com.munpro.app.data.OrganizedEvent
import com.munpro.app.data.Wallet
import com.munpro.app.data.rememberCached
import com.munpro.app.data.writingAssist
import com.munpro.app.domain.ApplicationSchedule
import com.munpro.app.domain.EventData
import com.munpro.app.domain.PLAN_FEATURES
import com.munpro.app.domain.PlanSettings
import com.munpro.app.domain.RoleTier
import com.munpro.app.domain.TEAM_ROLE
import com.munpro.app.domain.UpgradeRequest
import com.munpro.app.domain.Window
import com.munpro.app.domain.formatFee
import com.munpro.app.domain.getApplicationTimeline
import com.munpro.app.domain.getEventStartMs
import com.munpro.app.domain.jsDateMs
import com.munpro.app.domain.resolvePlan
import com.munpro.app.nav.EventPlanRoute
import com.munpro.app.nav.WalletRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.kit.Chip
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.IconTile
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.LocalBack
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.PlainInput
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SectionFooter
import com.munpro.app.ui.kit.SectionHeader
import com.munpro.app.ui.kit.Segmented
import com.munpro.app.ui.kit.SfIcon
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
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private const val RETRY = "Check your connection and try again."

@Composable
private fun rememberFinEvent(eventId: String) =
    rememberCached("orgEventDoc:$eventId", EventData.serializer(), Fresh.SHORT) { AppGraph.events.getEventById(eventId) ?: error("Event not found") }

@Composable
internal fun rememberPlanSettings() =
    rememberCached("planSettings", PlanSettings.serializer(), Fresh.MEDIUM) { AppGraph.finance.settings() }

private suspend fun refreshFinEvent(eventId: String) {
    AppGraph.events.getEventById(eventId)?.let { AppGraph.saved.write("orgEventDoc:$eventId", EventData.serializer(), it) }
    com.munpro.app.data.Refresh.bump()
}

/** eventService.APPLICATION_ROLES, in the order the web lists them. */
private val APPLICATION_ROLES = listOf("Delegate", "Head Delegate", "Observer", "Faculty Advisor", TEAM_ROLE)

private val ROLE_HELP = mapOf(
    "Delegate" to "Standard country representative.",
    "Head Delegate" to "Leads a delegation from one institution.",
    "Observer" to "Attends without voting rights.",
    "Faculty Advisor" to "Supervises a delegation. No committee or country choices.",
    TEAM_ROLE to "One application for a group of 3–15 delegates. Priced per member.",
)

/** getDefaultRoleTiers: the stored tiers, or a seed with Delegate on (carrying a legacy price). */
private fun defaultRoleTiers(e: EventData): List<RoleTier> {
    if (e.roleTiers.isNotEmpty()) return e.roleTiers
    val legacy = e.ticketingTiers.firstOrNull { (it.price ?: 0.0) > 0 } ?: e.ticketingTiers.firstOrNull()
    return APPLICATION_ROLES.map { r -> RoleTier(role = r, enabled = r == "Delegate", price = if (r == "Delegate") legacy?.price ?: 0.0 else 0.0) }
}

private val DT = DateTimeFormatter.ofPattern("EEE d MMM · h:mm a", Locale.UK)
private val SHORT_DAY = DateTimeFormatter.ofPattern("d MMM", Locale.UK)

/** "Mon 10 Nov · 11:59 PM" for a naive-local "YYYY-MM-DDTHH:mm". */
private fun fmtDT(v: String?): String? = v?.ifEmpty { null }?.let { s -> runCatching { LocalDateTime.parse(s).format(DT) }.getOrNull() ?: s }
private fun fmtMs(ms: Long?): String? = ms?.let { Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()).format(DT) }
private fun shortMs(ms: Long?): String? = ms?.let { Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()).format(SHORT_DAY) }

/** validateApplicationSchedule: non-blocking warnings, as the web shows under the timeline. */
private fun scheduleWarnings(s: ApplicationSchedule, eventStart: Long?, now: Long = System.currentTimeMillis()): List<String> {
    val w = mutableListOf<String>()
    val earlyOn = s.earlyBird?.enabled == true
    val lateOn = s.lateComer?.enabled == true
    val earlyEnd = jsDateMs(s.earlyBird?.endAt)
    val lateStart = jsDateMs(s.lateComer?.startAt)
    val lateEnd = jsDateMs(s.lateComer?.endAt)
    val close = jsDateMs(s.regularCloseAt)
    if (earlyOn) {
        if (earlyEnd == null) w += "Early bird needs an end date & time."
        else {
            if (earlyEnd <= now) w += "Early bird ends in the past."
            if (eventStart != null && earlyEnd >= eventStart) w += "Early bird must end before the event starts."
        }
    }
    if (lateOn) {
        if (!earlyOn) w += "Late comer requires early bird to be enabled."
        if (lateStart == null || lateEnd == null) w += "Late comer needs a start and end date & time."
        else {
            if (lateStart >= lateEnd) w += "Late comer start must be before its end."
            if (earlyEnd != null && lateStart < earlyEnd) w += "Late comer should start after early bird ends."
            if (eventStart != null && lateEnd > eventStart) w += "Late comer must end on or before the event starts."
        }
    }
    if (!earlyOn && !lateOn && close != null) {
        if (close <= now) w += "Applications close in the past."
        if (eventStart != null && close > eventStart) w += "Applications must close on or before the event starts."
    }
    return w
}

private fun price(v: Double?) = if ((v ?: 0.0) <= 0.0) "Free" else formatFee(v!!)

// ---------------------------------------------------------------------------------------------
// C6.1–C6.5 · Financials: tickets, schedule, money (co-organizer: prices locked, no money)
// ---------------------------------------------------------------------------------------------

@Composable
fun FinancialsScreen(eventId: String) {
    val c = palette
    val nav = LocalNav.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val ev = rememberFinEvent(eventId)
    val e = ev.data
    val owner = e?.organizerId == AppGraph.auth.user?.uid
    val startTiers = remember(e) { e?.let(::defaultRoleTiers).orEmpty() }
    val startSched = remember(e) { e?.applicationSchedule ?: ApplicationSchedule() }
    var tiers by remember(e?.id) { mutableStateOf<List<RoleTier>?>(null) }
    var sched by remember(e?.id) { mutableStateOf<ApplicationSchedule?>(null) }
    val t = tiers ?: startTiers
    val s = sched ?: startSched
    var tab by remember { mutableStateOf("tickets") }
    var editing by remember { mutableStateOf<RoleTier?>(null) }
    var saving by remember { mutableStateOf(false) }
    val dirty = (tiers != null && tiers != startTiers) || (sched != null && sched != startSched)

    Screen(back = "Event", tabBar = false, title = if (owner || e == null) "Financials" else "Roles & schedule", overline = if (e == null) null else if (owner) "Owner" else "Co-organizer",
        savedAt = ev.savedAt, onRefresh = {},
        navRight = { if (e != null) Pill(if (saving) "…" else "Save", {
            saving = true
            scope.launch {
                runCatching { AppGraph.finance.saveRoles(e, t, s); refreshFinEvent(eventId) }.fold(
                    onSuccess = { tiers = null; sched = null; alerts.show("Saved", "Roles and the schedule are live on the application form.") },
                    onFailure = { alerts.show("Couldn't save", RETRY) },
                )
                saving = false
            }
        }, filled = true, enabled = dirty && !saving) }) {
        if (e == null) { if (ev.failed) Empty("Couldn't load the event", "Pull down to try again.", icon = Icons.card) else Spinner(); return@Screen }
        Segmented(buildList { add("tickets" to "Tickets"); add("schedule" to "Schedule"); if (owner) add("money" to "Money") }, tab, { tab = it })
        if (!owner) SectionFooter("Only the event owner can change prices or see revenue and payouts.")
        val preview = e.copy(applicationSchedule = AppGraph.finance.normalized(s))
        when (tab) {
            "tickets" -> TicketsTab(preview, t) { editing = it }
            "schedule" -> ScheduleTab(e, s) { sched = it }
            else -> MoneyTab(e, onPlan = { nav.go(EventPlanRoute(eventId)) }, onWallet = { nav.go(WalletRoute) })
        }
    }
    editing?.let { tier ->
        TicketSheet(tier, s, priceLocked = !owner, onDismiss = { editing = null }) { next ->
            tiers = t.map { if (it.role == next.role) next else it }; editing = null
        }
    }
}

@Composable
private fun TicketsTab(preview: EventData, tiers: List<RoleTier>, onEdit: (RoleTier) -> Unit) {
    val tl = getApplicationTimeline(preview)
    val earlyOn = preview.applicationSchedule?.earlyBird != null
    val lateOn = preview.applicationSchedule?.lateComer != null
    Section(header = "Roles", footer = "Each accepted role is a ticket. Prices are in USD; 0 is free. Seat limits are per committee.") {
        tiers.forEach { tier ->
            val parts = buildList {
                if (earlyOn) add("Early ${price(tier.earlyBirdPrice ?: tier.price)}")
                add(if (earlyOn) "Regular ${price(tier.price)}" else price(tier.price))
                if (lateOn) add("Late ${price(tier.latePrice ?: tier.price)}")
            }
            val now = when (tl.phase) {
                "early" -> "Early · now" to (tier.earlyBirdPrice ?: tier.price)
                "late" -> "Late · now" to (tier.latePrice ?: tier.price)
                "closed" -> "Closed" to null
                else -> "Now" to tier.price
            }
            cell(
                tier.label?.ifBlank { null } ?: tier.role,
                subtitle = if (!tier.enabled) "Not accepted" else parts.joinToString(" · ") + if (tier.role == TEAM_ROLE) " per member · teams of 3–15" else "",
                trailing = if (tier.enabled) ({ Chip(if (now.second == null) now.first else "${now.first} ${price(now.second)}", if (tl.phase == "closed") Tone.Neutral else Tone.Tint) }) else null,
                dim = !tier.enabled,
                onClick = { onEdit(tier) },
            )
        }
    }
}

@Composable
private fun TicketSheet(tier: RoleTier, sched: ApplicationSchedule, priceLocked: Boolean, onDismiss: () -> Unit, onDone: (RoleTier) -> Unit) {
    val c = palette
    val navPad = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    var t by remember { mutableStateOf(tier) }
    var regular by remember { mutableStateOf(numText(tier.price)) }
    var early by remember { mutableStateOf(numText(tier.earlyBirdPrice)) }
    var late by remember { mutableStateOf(numText(tier.latePrice)) }
    val earlyOn = sched.earlyBird?.enabled == true
    val lateOn = earlyOn && sched.lateComer?.enabled == true
    val per = if (tier.role == TEAM_ROLE) " / member" else ""
    PageSheet(true, onDismiss) {
        SheetHeader(tier.role, leading = "Cancel", onLeading = onDismiss, trailing = "Done", divider = true, onTrailing = {
            onDone(t.copy(
                price = regular.toDoubleOrNull()?.coerceAtLeast(0.0) ?: 0.0,
                earlyBirdPrice = early.toDoubleOrNull()?.coerceAtLeast(0.0),
                latePrice = late.toDoubleOrNull()?.coerceAtLeast(0.0),
                label = t.label?.ifBlank { null },
            ))
        })
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 14.dp, bottom = navPad + 32.dp),
            verticalArrangement = Arrangement.spacedBy(Space.section)) {
            Section(footer = ROLE_HELP[tier.role]) {
                item { ToggleRow("Accept applications", t.enabled) { t = t.copy(enabled = it) } }
                item { FinField("Public label", t.label.orEmpty(), { t = t.copy(label = it) }, tier.role) }
            }
            Section(header = "Price (USD)$per", footer = if (priceLocked) "Only the event owner can change prices." else "Early and late appear only when those phases are on in Schedule.") {
                item { FinField("Regular", regular, { regular = it.filter { ch -> ch.isDigit() || ch == '.' } }, "0 = free", KeyboardType.Decimal, enabled = !priceLocked) }
                if (earlyOn) item { FinField("Early bird", early, { early = it.filter { ch -> ch.isDigit() || ch == '.' } }, "Same as regular", KeyboardType.Decimal, enabled = !priceLocked) }
                if (lateOn) item { FinField("Late", late, { late = it.filter { ch -> ch.isDigit() || ch == '.' } }, "Same as regular", KeyboardType.Decimal, enabled = !priceLocked) }
            }
        }
    }
}

private fun numText(v: Double?) = v?.let { if (it % 1.0 == 0.0) it.toLong().toString() else it.toString() }.orEmpty()

@Composable
private fun ToggleRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    val c = palette
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = Type.body, color = c.label, modifier = Modifier.weight(1f))
        Toggle(checked, onChange, label)
    }
}

@Composable
private fun FinField(label: String, value: String, onChange: (String) -> Unit, placeholder: String, type: KeyboardType = KeyboardType.Text, enabled: Boolean = true) {
    val c = palette
    Row(Modifier.padding(horizontal = 16.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = Type.body, color = c.label, modifier = Modifier.width(112.dp))
        if (enabled) PlainInput(value, onChange, placeholder, maxLength = 120, modifier = Modifier.weight(1f),
            keyboardOptions = KeyboardOptions(keyboardType = type, capitalization = if (type == KeyboardType.Text) KeyboardCapitalization.Words else KeyboardCapitalization.None))
        else Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(value.ifEmpty { placeholder }, style = Type.body, color = c.label3)
            SfIcon(Icons.lock, c.label3, size = 14.dp)
        }
    }
}

@Composable
private fun ScheduleTab(e: EventData, s: ApplicationSchedule, onChange: (ApplicationSchedule) -> Unit) {
    val c = palette
    var picking by remember { mutableStateOf<String?>(null) }
    val earlyOn = s.earlyBird?.enabled == true
    val lateOn = earlyOn && s.lateComer?.enabled == true
    val start = getEventStartMs(e)
    val preview = e.copy(applicationSchedule = AppGraph.finance.normalized(s))
    val tl = getApplicationTimeline(preview)

    // The live timeline: Opens → Early → Regular → Late → Closes, the current phase filled.
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SectionHeader("Phases · shared by every role")
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Chip("Opens", Tone.Neutral)
                if (earlyOn) Chip("Early", if (tl.phase == "early") Tone.Tint else Tone.Neutral, dot = tl.phase == "early")
                Chip("Regular", if (tl.phase == "regular") Tone.Tint else Tone.Neutral, dot = tl.phase == "regular")
                if (lateOn) Chip("Late", if (tl.phase == "late") Tone.Warning else Tone.Neutral, dot = tl.phase == "late")
                Chip("Closes", if (tl.phase == "closed") Tone.Destructive else Tone.Neutral, dot = tl.phase == "closed")
            }
            val now = when (tl.phase) {
                "early" -> "Now: Early bird · until ${shortMs(tl.earlyEndAt) ?: "—"}"
                "late" -> "Now: Late comer · until ${shortMs(tl.lateEndAt) ?: "—"}"
                "closed" -> "Applications are closed."
                else -> "Now: Regular · closes ${shortMs(tl.closeAt) ?: "—"}"
            }
            Text(now, style = Type.subhead.copy(fontWeight = FontWeight.SemiBold), color = c.label)
        }
    }
    Section(footer = "From when applications open until the date you pick.") {
        item { ToggleRow("Early bird", earlyOn) { on -> onChange(if (on) s.copy(earlyBird = (s.earlyBird ?: Window()).copy(enabled = true)) else s.copy(earlyBird = s.earlyBird?.copy(enabled = false), lateComer = s.lateComer?.copy(enabled = false))) } }
        if (earlyOn) cell("Ends", value = fmtDT(s.earlyBird?.endAt) ?: "Choose", onClick = { picking = "early" })
    }
    Section(footer = if (!earlyOn) "Late comer needs early bird." else "Its end closes applications. It must end before the event starts${fmtMs(start)?.let { " ($it)" }.orEmpty()}.") {
        if (earlyOn) item { ToggleRow("Late comer", lateOn) { on -> onChange(s.copy(lateComer = (s.lateComer ?: Window()).copy(enabled = on))) } }
        else cell("Late comer", subtitle = "Turn on early bird first", dim = true)
        if (lateOn) {
            cell("From", value = fmtDT(s.lateComer?.startAt) ?: "Choose", onClick = { picking = "lateStart" })
            cell("Until · closes", value = fmtDT(s.lateComer?.endAt) ?: "Choose", onClick = { picking = "lateEnd" })
        }
    }
    if (!earlyOn) {
        val auto = start?.let { fmtMs(it - 24L * 60 * 60 * 1000) } ?: "the day before the event"
        Section(footer = "Leave it empty to close automatically one day before the event ($auto).") {
            cell("Applications close", value = fmtDT(s.regularCloseAt) ?: "Automatic", onClick = { picking = "close" })
            if (!s.regularCloseAt.isNullOrEmpty()) cell("Use the automatic close", tinted = true, chevron = false, onClick = { onChange(s.copy(regularCloseAt = null)) })
        }
    }
    scheduleWarnings(s.copy(earlyBird = s.earlyBird?.takeIf { it.enabled }, lateComer = s.lateComer?.takeIf { it.enabled && earlyOn }), start)
        .forEach { w -> Text(w, style = Type.footnote, color = SystemColors.orange, modifier = Modifier.padding(horizontal = 16.dp)) }

    picking?.let { which ->
        val current = when (which) { "early" -> s.earlyBird?.endAt; "lateStart" -> s.lateComer?.startAt; "lateEnd" -> s.lateComer?.endAt; else -> s.regularCloseAt }
        DateTimeDialog(current?.take(10).orEmpty(), current?.drop(11)?.take(5)?.ifEmpty { null } ?: "23:59", { picking = null }) { d, tm ->
            val v = "${d}T$tm"
            onChange(when (which) {
                "early" -> s.copy(earlyBird = (s.earlyBird ?: Window(enabled = true)).copy(endAt = v))
                "lateStart" -> s.copy(lateComer = (s.lateComer ?: Window(enabled = true)).copy(startAt = v))
                "lateEnd" -> s.copy(lateComer = (s.lateComer ?: Window(enabled = true)).copy(endAt = v))
                else -> s.copy(regularCloseAt = v)
            })
            picking = null
        }
    }
}

@Composable
private fun MoneyTab(e: EventData, onPlan: () -> Unit, onWallet: () -> Unit) {
    val c = palette
    val settings = rememberPlanSettings().data
    val money = rememberCached("orgMoney:${e.id}", EventMoney.serializer(), Fresh.SHORT) { AppGraph.finance.eventMoney(e) }
    val m = money.data ?: run { if (money.failed) Empty("Couldn't load payments", "Pull down to try again.", icon = Icons.card) else Spinner(); return }
    val plan = resolvePlan(e, settings)
    val paid = m.rows.filter { it.status == "paid" }
    // Free roles have no payment: their approved applicants are the tickets.
    val freeTaken = m.rows.filter { it.amount <= 0.0 && it.app.status == "approved" && it.status != "paid" }
    val sold = paid.size + freeTaken.size
    val cap = com.munpro.app.domain.getEventCapacity(e)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Event revenue", style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = c.label2)
        Text(formatFee(m.revenue), style = Type.largeTitle, color = c.label)
        Text("$sold of ${if (cap > 0) cap else "∞"} tickets sold${if (m.pending > 0) " · ${formatFee(m.pending)} pending" else ""}", style = Type.subhead, color = c.label2)
        Text("Platform fee ${numText(m.feePercent)}% · −${formatFee(m.fee)} · You get ${formatFee(m.net)}", style = Type.footnote, color = c.label2)
    }
    val byRole = (paid + freeTaken).groupBy { it.app.tierName ?: it.app.role }
    if (byRole.isNotEmpty()) Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        byRole.forEach { (role, list) -> Chip("${list.size} $role${if (list.all { it.amount <= 0.0 }) " · free" else ""}", Tone.Neutral) }
    }
    Section {
        cell("Plan", value = plan.label, subtitle = if (plan.isPro) null else "Upgrade for video, no caps and a ${numText(settings?.proFee ?: 3.0)}% fee",
            leading = { IconTile(SystemColors.gold, Icons.star) }, inset = 58.dp, onClick = onPlan)
        cell("Wallet & payouts", subtitle = "Balance across your events", leading = { IconTile(SystemColors.green, Icons.card) }, inset = 58.dp, onClick = onWallet)
    }
    if (m.rows.isEmpty()) { Empty("No payments yet", "Applications and their payments show here.", icon = Icons.card); return }
    Section(header = "Payments") {
        m.rows.sortedByDescending { it.app.paidAt ?: it.app.createdAt ?: 0 }.forEach { r ->
            val day = shortMs(r.app.paidAt ?: r.app.createdAt)
            cell(r.app.applicantName?.ifBlank { null } ?: "Applicant", subtitle = listOfNotNull(r.app.tierName ?: r.app.role.ifEmpty { null }, day).joinToString(" · "),
                chevron = false, trailing = {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (r.amount > 0.0) Text(formatFee(r.amount), style = Type.body, color = c.label)
                        when (r.status) {
                            "paid" -> Chip("Paid", Tone.Tint)
                            "refunded" -> Chip("Refunded", Tone.Neutral)
                            else -> if (r.amount <= 0.0) Chip("Free", Tone.Neutral) else Chip("Pending", Tone.Warning)
                        }
                    }
                })
        }
    }
}

// ---------------------------------------------------------------------------------------------
// C6.6 / C6.7 · Wallet and payouts
// ---------------------------------------------------------------------------------------------

@Composable
fun WalletScreen() {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val uid = AppGraph.auth.user?.uid.orEmpty()
    var tick by remember { mutableStateOf(0) }
    val wallet = rememberCached("wallet:$uid:$tick", Wallet.serializer(), Fresh.SHORT) { AppGraph.finance.wallet(uid) }
    var requesting by remember { mutableStateOf(false) }
    Screen(back = "Back", tabBar = false, title = "Wallet", savedAt = wallet.savedAt, onRefresh = {}) {
        val w = wallet.data ?: run { if (wallet.failed) Empty("Couldn't load your wallet", "Pull down to try again.", icon = Icons.card) else Spinner(); return@Screen }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Available balance", style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = c.label2)
            Text(formatFee(w.available), style = Type.largeTitle, color = c.label)
            Text("Lifetime paid ${formatFee(w.gross)} · fees ${formatFee(w.fees)}${if (w.reserved > 0) " · ${formatFee(w.reserved)} already requested" else ""}", style = Type.footnote, color = c.label2)
            MunButton("Request Payout", { requesting = true }, Modifier.fillMaxWidth().padding(top = 8.dp), enabled = w.available > 0)
        }
        if (w.events.isNotEmpty()) Section(header = "By event") {
            w.events.forEach { m -> cell(m.event.title, subtitle = "${formatFee(m.revenue)} paid · ${numText(m.feePercent)}% fee", value = formatFee(m.net), chevron = false) }
        }
        Section(header = "Payouts", footer = "The platform collects all fees; an admin sends payouts.") {
            if (w.payouts.isEmpty()) cell("No payouts yet", chevron = false, dim = true)
            w.payouts.forEach { p ->
                val sub = when (p.status) {
                    "paid" -> "Paid ${shortMs(p.processedAt ?: p.requestedAt) ?: ""}"
                    "rejected" -> shortMs(p.processedAt ?: p.requestedAt) ?: ""
                    else -> "Requested ${shortMs(p.requestedAt) ?: "just now"}"
                }
                cell(formatFee(p.amount ?: 0.0), subtitle = sub.trim().ifEmpty { null }, chevron = false, trailing = {
                    when (p.status) { "paid" -> Chip("Paid", Tone.Tint); "rejected" -> Chip("Rejected", Tone.Neutral); else -> Chip("Pending", Tone.Warning) }
                })
            }
        }
    }
    val w = wallet.data
    if (requesting && w != null) PayoutSheet(w.available, onDismiss = { requesting = false }) { amount ->
        runCatching { AppGraph.finance.requestPayout(amount) }.fold(
            onSuccess = { requesting = false; tick++; true },
            onFailure = { false },
        )
    }
}

@Composable
private fun PayoutSheet(available: Double, onDismiss: () -> Unit, onRequest: suspend (Double) -> Boolean) {
    val c = palette
    val scope = rememberCoroutineScope()
    val navPad = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    var text by remember { mutableStateOf(numText(available)) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val amount = text.toDoubleOrNull() ?: 0.0
    val ok = amount > 0 && amount <= available + 1e-9
    PageSheet(true, onDismiss) {
        SheetHeader("Request Payout", leading = "Cancel", onLeading = onDismiss, divider = true)
        Column(Modifier.fillMaxWidth().padding(start = Space.gutter, end = Space.gutter, top = 14.dp, bottom = navPad + 32.dp), verticalArrangement = Arrangement.spacedBy(Space.section)) {
            Section(header = "Amount (USD)", footer = "Up to ${formatFee(available)} available") {
                item { FinField("Amount", text, { text = it.filter { ch -> ch.isDigit() || ch == '.' } }, "0", KeyboardType.Decimal) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(500.0, 1000.0).filter { it < available }.forEach { v -> Pill(formatFee(v), { text = numText(v) }) }
                Pill("All", { text = numText(available) })
            }
            ErrorText(error ?: if (amount > available) "That's more than your available balance." else null)
            MunButton(if (busy) "…" else "Request ${if (ok) formatFee(amount) else "payout"}", {
                busy = true; error = null
                scope.launch { if (!onRequest(amount)) error = "Couldn't send the request. $RETRY"; busy = false }
            }, Modifier.fillMaxWidth(), enabled = ok && !busy)
        }
    }
}

// ---------------------------------------------------------------------------------------------
// C6.8–C6.10 · Pro: the event's plan, upgrading it, and asking the App Admin
// ---------------------------------------------------------------------------------------------

@Composable
fun EventPlanScreen(eventId: String, confirm: Boolean = false) {
    val c = palette
    val alerts = LocalAlerts.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val ev = rememberFinEvent(eventId)
    val e = ev.data
    val settings = rememberPlanSettings().data
    val uid = AppGraph.auth.user?.uid.orEmpty()
    var tick by remember { mutableStateOf(0) }
    val requests = rememberCached("upgradeReqs:$eventId:$tick", ListSerializer(UpgradeRequest.serializer()), Fresh.SHORT) { AppGraph.finance.upgradeRequests(eventId, uid) }
    var asking by remember { mutableStateOf<String?>(null) }
    var paying by remember { mutableStateOf(false) }
    val owner = e?.organizerId == uid
    // Back from the gateway: ask the server whether the payment landed, then reload the event.
    androidx.compose.runtime.LaunchedEffect(confirm) {
        if (!confirm) return@LaunchedEffect
        for (attempt in 0 until 6) {
            val status = runCatching { AppGraph.finance.verifyPro(eventId) }.getOrNull()
            if (status == "paid") { refreshFinEvent(eventId); alerts.show("This event is Pro", "Everything is unlocked."); return@LaunchedEffect }
            if (status == "failed") { alerts.show("The payment didn't go through", "Nothing was charged. You can try again."); return@LaunchedEffect }
            kotlinx.coroutines.delay(3000)
        }
        alerts.show("Still confirming", "The payment hasn't reached us yet. Pull down in a minute to check.")
    }
    Screen(back = "Event", tabBar = false, title = "Plan", overline = e?.title, savedAt = ev.savedAt, onRefresh = {}) {
        if (e == null) { if (ev.failed) Empty("Couldn't load the event", "Pull down to try again.", icon = Icons.star) else Spinner(); return@Screen }
        val plan = resolvePlan(e, settings)
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(plan.label, style = Type.title2, color = c.label)
                if (plan.isPro && plan.label != "Pro") Chip("Pro", Tone.Tint)
            }
            Text("Participants ${e.approvedCount ?: 0} of ${plan.participants ?: "∞"} · Committees ${e.committees.size} of ${plan.committees ?: "∞"}", style = Type.subhead, color = c.label2)
            Text("Platform fee ${numText(plan.feePercent)}% of ticket revenue", style = Type.footnote, color = c.label2)
        }
        Section(header = "This event has") {
            PLAN_FEATURES.forEach { (k, label) ->
                cell(label, chevron = false, trailing = { SfIcon(if (plan.has(k)) Icons.check else Icons.lock, if (plan.has(k)) c.tint else c.label3, size = 18.dp) }, dim = !plan.has(k))
            }
        }
        val reqs = requests.data.orEmpty()
        val pending = reqs.firstOrNull { it.status == "pending" }
        if (pending != null) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (pending.kind == "pro") "Pro request under review" else "Request for more room under review", style = Type.headline, color = c.label, modifier = Modifier.weight(1f))
                    Chip("Pending", Tone.Warning)
                }
                Text("We'll notify you when the MUN Pilot team decides. Everything in your current plan keeps working.", style = Type.footnote, color = c.label2)
                Text(listOfNotNull(pending.orgName, shortMs(pending.createdAt)?.let { "Submitted $it" }).joinToString(" · "), style = Type.footnote, color = c.label3)
            }
        }
        if (owner && plan.tier != "pro") {
            Section(header = "Upgrade", footer = "Pro is for this event only: no caps, live video, AI without the daily limit, big email sends, Ornate Gold and a custom colour, at a ${numText(settings?.proFee ?: 3.0)}% fee.") {
                cell("Go Pro now", subtitle = "${formatFee(settings?.proPrice ?: 49.0)} once, unlocked right away", leading = { IconTile(SystemColors.gold, Icons.star) }, inset = 58.dp, onClick = {
                    if (paying) return@cell
                    paying = true
                    scope.launch {
                        runCatching { AppGraph.finance.proCheckout(eventId) }.fold(
                            onSuccess = { url -> context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) },
                            onFailure = { alerts.show("Couldn't start the payment", it.message ?: RETRY) },
                        )
                        paying = false
                    }
                })
                if (pending == null) {
                    cell("Request Pro", subtitle = "The team reviews it and sets this event's limits", leading = { IconTile(SystemColors.blue, Icons.doc) }, inset = 58.dp, onClick = { asking = "pro" })
                    if (plan.tier == "free") cell("Ask for more room", subtitle = "More participants, committees or Free events", leading = { IconTile(SystemColors.green, Icons.plus) }, inset = 58.dp, onClick = { asking = "quota" })
                }
            }
        }
        val decided = reqs.filter { it.status != "pending" }
        if (decided.isNotEmpty()) Section(header = "Past requests") {
            decided.forEach { r ->
                cell(if (r.kind == "pro") "Pro" else "More room", subtitle = listOfNotNull(shortMs(r.createdAt), r.adminNote?.ifBlank { null }).joinToString(" · ").ifEmpty { null },
                    chevron = false, trailing = { Chip(if (r.status == "approved") "Approved" else "Rejected", if (r.status == "approved") Tone.Tint else Tone.Neutral) })
            }
        }
    }
    val kind = asking
    if (kind != null && e != null) UpgradeRequestSheet(kind, settings ?: PlanSettings(), onDismiss = { asking = null }) { msg, org, site, wanted ->
        runCatching { AppGraph.finance.requestUpgrade(e, kind, msg, org, site, wanted) }.fold(onSuccess = { asking = null; tick++; true }, onFailure = { false })
    }
}

@Composable
private fun UpgradeRequestSheet(kind: String, settings: PlanSettings, onDismiss: () -> Unit, onSend: suspend (String, String, String, Map<String, Int>) -> Boolean) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val navPad = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    var org by remember { mutableStateOf("") }
    var site by remember { mutableStateOf("") }
    var why by remember { mutableStateOf("") }
    var participants by remember { mutableStateOf("") }
    var committees by remember { mutableStateOf("") }
    var events by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var helping by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val wanted = buildMap {
        participants.toIntOrNull()?.let { put("participants", it) }
        committees.toIntOrNull()?.let { put("committees", it) }
        events.toIntOrNull()?.let { put("events", it) }
    }
    val ready = why.isNotBlank() && (if (kind == "pro") org.isNotBlank() else wanted.isNotEmpty())
    PageSheet(true, onDismiss) {
        SheetHeader(if (kind == "pro") "Request Pro" else "More room", leading = "Cancel", onLeading = onDismiss, trailing = if (busy) "…" else "Submit", trailingEnabled = ready && !busy, divider = true, onTrailing = {
            busy = true; error = null
            scope.launch { if (!onSend(why, org, site, wanted)) error = "Couldn't send. $RETRY"; busy = false }
        })
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 14.dp, bottom = navPad + 32.dp),
            verticalArrangement = Arrangement.spacedBy(Space.section)) {
            if (kind == "pro") Section {
                item { FinField("Organization", org, { org = it }, "Society or institution") }
                item { FinField("Website", site, { site = it }, "https://…", KeyboardType.Uri) }
            } else Section(header = "What you need", footer = "Free allows ${settings.participantCap} participants and ${settings.committeeCap} committees per event, and ${settings.eventCap} published events at once. Leave a box empty to keep it.") {
                item { FinField("Participants", participants, { participants = it.filter(Char::isDigit) }, "${settings.participantCap}", KeyboardType.Number) }
                item { FinField("Committees", committees, { committees = it.filter(Char::isDigit) }, "${settings.committeeCap}", KeyboardType.Number) }
                item { FinField("Free events", events, { events = it.filter(Char::isDigit) }, "${settings.eventCap}", KeyboardType.Number) }
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionHeader(if (kind == "pro") "Why Pro" else "Why")
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(14.dp)) {
                    PlainInput(why, { why = it.take(2000) }, "Your conference, its size and what you need…", singleLine = false, minLines = 4,
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
                }
                Pill(if (helping) "…" else "Help me write", {
                    if (helping) return@Pill
                    helping = true
                    scope.launch {
                        writingAssist(if (why.isBlank()) "suggest" else "improve", "pro-apply-motivation", why)?.let { why = it.take(2000) }
                            ?: alerts.show("AI couldn't help this time", "Try again in a moment.")
                        helping = false
                    }
                })
            }
            ErrorText(error)
        }
    }
}

/** C6.8 · Pro membership: what Free and Pro really are, then your events and their plans. */
@Composable
fun ProScreen() {
    val c = palette
    val nav = LocalNav.current
    val s = rememberPlanSettings().data ?: PlanSettings()
    val uid = AppGraph.auth.user?.uid
    val organized = rememberCached(uid?.let { "organize:$it" }, ListSerializer(OrganizedEvent.serializer()), Fresh.MEDIUM) { AppGraph.gate.organized(uid!!) }.data
    Screen(back = "Back", tabBar = false, title = "MUN Pilot Pro") {
        Text("Pro is per conference: upgrade the event that needs it.", style = Type.subhead, color = c.label2)
        Section(header = "Free") {
            listOf(
                "${s.participantCap} participants and ${s.committeeCap} committees per event",
                "${s.eventCap} published events at once",
                "Live MUN: roll call, speakers, motions, voting (no video)",
                "Announcements up to 50 people",
                "${s.aiQuota} AI uses a day",
                "2 certificate designs, 4 themes",
                "${numText(s.fee)}% platform fee",
            ).forEach { cell(it, chevron = false, leading = { SfIcon(Icons.check, c.label3, size = 16.dp) }) }
        }
        Section(header = "Pro · ${formatFee(s.proPrice)} per event") {
            listOf(
                "No participant or committee caps",
                "Live video in sessions and ceremonies",
                "AI inside the event without the daily limit",
                "Announcements and committee emails to any size",
                "Ornate Gold certificate",
                "Custom theme colour",
                "Verified organizer badge",
                "${numText(s.proFee)}% platform fee",
            ).forEach { cell(it, chevron = false, leading = { SfIcon(Icons.check, c.tint, size = 16.dp) }) }
        }
        val mine = organized.orEmpty().filter { !it.coOrganizer }
        Section(header = "Your events", footer = "Pay to unlock right away, or send a request: the MUN Pilot team reviews it.") {
            if (organized == null) cell("Loading…", chevron = false, dim = true)
            else if (mine.isEmpty()) cell("You don't own an event yet", chevron = false, dim = true)
            mine.forEach { o -> cell(o.event.title, value = resolvePlan(o.event, s).label, onClick = { nav.go(EventPlanRoute(o.event.id)) }) }
        }
    }
}

