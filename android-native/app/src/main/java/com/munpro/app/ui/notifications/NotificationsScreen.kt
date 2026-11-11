package com.munpro.app.ui.notifications

// Notifications (board A1.5–A1.9; web NotificationBell + NotificationsContext): three kinds in one
// place. Updates open the screen they're about; Invitations are answered here (Accept / Decline,
// or the details sheet first); Room alerts are the committee's Info / Warning / Urgent notices,
// read by opening the list. A new room alert also drops in over any screen ([RoomAlertBanner]).

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.domain.AppNotification
import com.munpro.app.domain.RoomAlert
import com.munpro.app.domain.StaffInvite
import com.munpro.app.domain.ago
import com.munpro.app.domain.staffRoleLabel
import com.munpro.app.nav.ConferenceRoute
import com.munpro.app.nav.NotificationsRoute
import com.munpro.app.nav.routeForLink
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.Capsule
import com.munpro.app.ui.kit.Chip
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.IconTile
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.Loading
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SectionScope
import com.munpro.app.ui.kit.Segmented
import com.munpro.app.ui.kit.SfIcon
import com.munpro.app.ui.kit.SfIconSpec
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.SystemColors
import com.munpro.app.ui.kit.TextLink
import com.munpro.app.ui.kit.Tone
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.kit.rememberPress
import com.munpro.app.ui.kit.tap
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private enum class Tab { Updates, Invites, Alerts }

@Composable
fun NotificationsScreen() {
    val inbox = AppGraph.inbox
    val updates by inbox.updates.collectAsStateWithLifecycle()
    val invites by inbox.invites.collectAsStateWithLifecycle()
    val alerts by inbox.alerts.collectAsStateWithLifecycle()
    val read by inbox.alertsRead.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableStateOf(Tab.Updates) }
    val scope = rememberCoroutineScope()
    val context = androidx.compose.ui.platform.LocalContext.current
    val uid = AppGraph.auth.user?.uid

    // Reading them here: their phone notifications have done their job.
    LaunchedEffect(Unit) { com.munpro.app.notify.Notifier.clearAlerts(context) }
    // An invitation or an unread alert is what brought the user here: open on it.
    LaunchedEffect(invites != null) {
        if (tab == Tab.Updates && updates.orEmpty().none { !it.read }) {
            if (invites.orEmpty().isNotEmpty()) tab = Tab.Invites else if (alerts.any { it.id !in read }) tab = Tab.Alerts
        }
    }
    LaunchedEffect(tab, alerts) { if (tab == Tab.Alerts) inbox.markAlertsRead() }

    val nInv = invites.orEmpty().size
    val nAlerts = alerts.count { it.id !in read }
    val anyUnread = updates.orEmpty().any { !it.read }
    Screen(
        back = "Back", tabBar = false, title = "Notifications", gap = 16.dp,
        navRight = if (tab == Tab.Updates) ({
            Capsule("Mark all read", { if (uid != null) scope.launch { AppGraph.content.markAllNotificationsRead(uid) } }, surface = true, enabled = anyUnread)
        }) else null,
    ) {
        Segmented(
            listOf(Tab.Updates to "Updates", Tab.Invites to if (nInv > 0) "Invites · $nInv" else "Invites", Tab.Alerts to if (nAlerts > 0) "Alerts · $nAlerts" else "Alerts"),
            tab, { tab = it },
        )
        when (tab) {
            Tab.Updates -> Updates(updates)
            Tab.Invites -> Invites(invites)
            Tab.Alerts -> Alerts(alerts)
        }
    }
}

// ---- updates -----------------------------------------------------------------------------------

@Composable
private fun Updates(items: List<AppNotification>?) {
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()

    fun open(n: AppNotification) {
        if (!n.read) scope.launch { AppGraph.content.markNotificationRead(n.id) }
        val href = n.href?.ifEmpty { null }
        when {
            href != null -> nav.go(routeForLink(href))
            n.eventId != null -> confs.conferences?.firstOrNull { it.event.id == n.eventId }?.let { nav.go(ConferenceRoute(it.app.id)) }
        }
    }

    val row: SectionScope.(AppNotification) -> Unit = { n ->
        val (color, icon) = updateLook(n.type)
        cell(
            n.title, subtitle = n.body, value = n.createdAt?.let(::ago), inset = 58.dp,
            leading = { IconTile(color, icon) },
            onClick = if (n.href != null || n.eventId != null) ({ open(n) }) else null,
        )
    }
    val fresh = items.orEmpty().filter { !it.read }
    val older = items.orEmpty().filter { it.read }
    when {
        items == null -> Loading()
        items.isEmpty() -> Empty("Nothing yet", "Application updates, allocations and messages from organisers appear here.", icon = Icons.bell)
        else -> {
            if (fresh.isNotEmpty()) Section(header = "New") { fresh.forEach { row(it) } }
            if (older.isNotEmpty()) Section(header = "Earlier") { older.forEach { row(it) } }
        }
    }
}

/** An icon for each kind the server writes (migrations, staff, reputation, paper endorsements). */
private fun updateLook(type: String): Pair<Color, SfIconSpec> = when {
    type.startsWith("migration") || type == "swap" -> SystemColors.indigo to Icons.refresh
    type == "staff_accepted" -> SystemColors.green to Icons.check
    type.startsWith("recommendation") || type == "rating" || type == "endorsement" -> SystemColors.blue to Icons.people
    type.startsWith("doc_endorsement") -> SystemColors.purple to Icons.doc
    else -> SystemColors.gray to Icons.bell
}

// ---- invitations -------------------------------------------------------------------------------

@Composable
private fun Invites(items: List<StaffInvite>?) {
    var details by remember { mutableStateOf<StaffInvite?>(null) }
    when {
        items == null -> Loading()
        items.isEmpty() -> Empty("No invitations", "When an organiser invites you to their staff, or changes your role, you answer it here.", icon = Icons.gavel)
        else -> items.forEach { inv -> InviteCard(inv) { details = inv } }
    }
    InviteSheet(details) { details = null }
}

private fun inviteTitle(inv: StaffInvite): String =
    if (inv.isRoleUpdate && !inv.previousRole.isNullOrEmpty()) "${staffRoleLabel(inv.previousRole)} → ${staffRoleLabel(inv.role)}"
    else listOf(staffRoleLabel(inv.role), inv.committeeId).filter { it.isNotEmpty() }.joinToString(" · ")

/** Accept / Decline with the busy state and the error the web shows in the bell. */
private class Answer {
    var busy by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
}

@Composable
private fun rememberAnswer(inv: StaffInvite, onDone: () -> Unit = {}): Pair<Answer, (Boolean) -> Unit> {
    val scope = rememberCoroutineScope()
    val a = remember(inv.path) { Answer() }
    return a to { accept ->
        if (!a.busy) {
            a.busy = true
            a.error = null
            scope.launch {
                try {
                    if (accept) AppGraph.inbox.accept(inv) else AppGraph.inbox.decline(inv)
                    onDone()
                } catch (_: Exception) {
                    a.error = "That didn't go through. Check your connection and try again."
                } finally {
                    a.busy = false
                }
            }
        }
    }
}

@Composable
private fun InviteCard(inv: StaffInvite, onDetails: () -> Unit) {
    val c = palette
    val (a, answer) = rememberAnswer(inv)
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            BigTile(if (inv.isRoleUpdate) SystemColors.indigo else SystemColors.navy, if (inv.isRoleUpdate) Icons.refresh else Icons.gavel, 44)
            Column(Modifier.weight(1f)) {
                Text((if (inv.isRoleUpdate) "Role change" else "Staff invitation").uppercase(), style = Type.caption.copy(fontSize = 11.sp, letterSpacing = 0.6.sp), color = c.label2)
                Text(inviteTitle(inv), style = Type.bodyMedium.copy(fontWeight = FontWeight.Bold), color = c.label)
                Text(listOf(inv.eventTitle, if (inv.isRoleUpdate) inv.committeeId else "").filter { it.isNotEmpty() }.joinToString(" · "), style = Type.footnote, color = c.label2)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Pill(if (inv.isRoleUpdate) "Decline" else "Reject", { answer(false) }, tone = Tone.Neutral, enabled = !a.busy, modifier = Modifier.weight(1f))
            Pill(if (a.busy) "Saving…" else "Accept", { answer(true) }, filled = true, enabled = !a.busy, modifier = Modifier.weight(1f))
        }
        ErrorText(a.error, center = true)
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            TextLink("View details", onDetails, style = Type.subhead.copy(fontWeight = FontWeight.Medium, fontSize = 14.sp))
        }
    }
}

/** What the invitation is, from the invite itself (board A1.7): role, event, committee, the access granted. */
@Composable
private fun InviteSheet(inv: StaffInvite?, onClose: () -> Unit) {
    val c = palette
    var shown by remember { mutableStateOf(inv) }
    if (inv != null) shown = inv
    val s = shown
    PageSheet(inv != null, onClose) {
        if (s == null) return@PageSheet
        val (a, answer) = rememberAnswer(s, onClose)
        SheetHeader("Invitation", leading = "Close", onLeading = onClose)
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                BigTile(if (s.isRoleUpdate) SystemColors.indigo else SystemColors.navy, if (s.isRoleUpdate) Icons.refresh else Icons.gavel, 64)
                Text(inviteTitle(s), style = Type.title2, color = c.label, textAlign = TextAlign.Center)
                Text(s.eventTitle, style = Type.subhead, color = c.label2, textAlign = TextAlign.Center)
            }
            Section {
                cell("Role", value = staffRoleLabel(s.role))
                if (s.isRoleUpdate && !s.previousRole.isNullOrEmpty()) cell("Was", value = staffRoleLabel(s.previousRole))
                cell("Committee", value = s.committeeId.ifEmpty { "Whole event" })
                cell("Conference", value = s.eventTitle)
            }
            val grants = s.grants
            if (grants.isNotEmpty()) Section(header = "Access the organiser gave you") {
                grants.forEach { g -> cell(g, leading = { IconTile(SystemColors.green, Icons.check) }, inset = 58.dp) }
            }
            if (s.isRoleUpdate) com.munpro.app.ui.kit.SectionFooter("Declining keeps your current role and access.")
            ErrorText(a.error, center = true)
            MunButton(if (s.isRoleUpdate) "Accept Change" else "Accept Invitation", { answer(true) }, loading = a.busy)
            MunButton(if (s.isRoleUpdate) "Decline" else "Reject", { answer(false) }, variant = ButtonVariant.Plain, destructive = true, enabled = !a.busy, height = 44.dp)
        }
    }
}

@Composable
private fun BigTile(color: Color, icon: SfIconSpec, size: Int) {
    Box(Modifier.size(size.dp).clip(RoundedCornerShape((size * 0.3f).dp)).background(color), contentAlignment = Alignment.Center) {
        SfIcon(icon, Color.White, size = (size * 0.45f).dp)
    }
}

// ---- room alerts -------------------------------------------------------------------------------

/** The web typeConfig: Info / Warning / Urgent. */
private data class AlertLook(val label: String, val color: Color, val tone: Tone, val icon: SfIconSpec)

private fun alertLook(type: String) = when (type) {
    "urgent" -> AlertLook("Urgent", SystemColors.red, Tone.Destructive, Icons.warning)
    "warning" -> AlertLook("Warning", SystemColors.orange, Tone.Warning, Icons.alert)
    else -> AlertLook("Info", SystemColors.blue, Tone.Info, Icons.info)
}

@Composable
private fun Alerts(items: List<RoomAlert>) {
    val now = System.currentTimeMillis()
    val live = items.filter { (it.expiresAt ?: Long.MAX_VALUE) > now }
    if (live.isEmpty()) {
        Empty("No room alerts", "Alerts from your committee's chair appear here while they're current.", icon = Icons.warning)
        return
    }
    Section(footer = "Alerts expire after the time the chair sets.") {
        live.forEach { a ->
            val look = alertLook(a.type)
            item(inset = 58.dp) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    IconTile(look.color, look.icon)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Chip(look.label, look.tone)
                        Text(a.message, style = Type.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = palette.label)
                        Text(listOfNotNull(a.committeeId, a.eventTitle, a.createdAt?.let(::ago)).joinToString(" · "), style = Type.footnote, color = palette.label2)
                    }
                }
            }
        }
    }
}

/** A new room alert over whatever is showing, for five seconds (web toast; board A1.9). Tap to open the list. */
@Composable
fun BoxScope.RoomAlertBanner() {
    val c = palette
    val nav = LocalNav.current
    var shown by remember { mutableStateOf<RoomAlert?>(null) }
    LaunchedEffect(Unit) { AppGraph.inbox.banner.collect { shown = it } }
    LaunchedEffect(shown) { if (shown != null) { delay(5000); shown = null } }
    val status = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    AnimatedVisibility(
        shown != null,
        modifier = Modifier.align(Alignment.TopCenter),
        enter = slideInVertically(tween(260)) { -it } + fadeIn(tween(200)),
        exit = slideOutVertically(tween(220)) { -it } + fadeOut(tween(180)),
    ) {
        val a = shown ?: return@AnimatedVisibility
        val look = alertLook(a.type)
        val press = rememberPress()
        val shape = RoundedCornerShape(26.dp)
        Row(
            Modifier
                .padding(top = status + 6.dp, start = 10.dp, end = 10.dp)
                .fillMaxWidth()
                .shadow(10.dp, shape, ambientColor = Color.Black.copy(alpha = 0.14f), spotColor = Color.Black.copy(alpha = 0.18f))
                .clip(shape)
                .background(c.cell)
                .then(if (a.type == "urgent") Modifier.border(2.dp, c.red, shape) else Modifier)
                .tap(press, label = "${look.label} alert, ${a.message}") { shown = null; nav.go(NotificationsRoute) }
                .padding(horizontal = 14.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.size(38.dp).clip(RoundedCornerShape(11.dp)).background(look.color), contentAlignment = Alignment.Center) {
                SfIcon(look.icon, Color.White, size = 20.dp)
            }
            Column(Modifier.weight(1f)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "${look.label} · ${a.committeeId}", style = Type.subhead.copy(fontWeight = FontWeight.Bold),
                        color = if (a.type == "urgent") c.red else c.label, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
                    )
                    Text("now", style = Type.caption.copy(fontWeight = FontWeight.Normal), color = c.label2)
                }
                Text(a.message, style = Type.subhead, color = c.label, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}
