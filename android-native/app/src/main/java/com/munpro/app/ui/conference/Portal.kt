package com.munpro.app.ui.conference

// Conference portal pieces (board B1.6–B1.9; web conferences/[id]): the payment lock that replaces
// the portal until the fee clears (PaymentRequiredGate), the portal's menu of tabs, the team
// delegation panel (TeamDelegationPanel, real data only), and the room alerts sheet behind the bell.

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.data.Fresh
import com.munpro.app.data.rememberCached
import com.munpro.app.domain.ApplicationData
import com.munpro.app.domain.Conference
import com.munpro.app.domain.RoomAlert
import com.munpro.app.domain.committeeOf
import com.munpro.app.domain.countryName
import com.munpro.app.domain.formatDueLabel
import com.munpro.app.domain.formatFee
import com.munpro.app.domain.getPaymentGate
import com.munpro.app.domain.shortWhen
import com.munpro.app.ui.kit.Chip
import com.munpro.app.ui.kit.Inter
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SectionFooter
import com.munpro.app.ui.kit.SfIcon
import com.munpro.app.ui.kit.SfIconSpec
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.Space
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.SystemColors
import com.munpro.app.ui.kit.Tone
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.kit.rememberPress
import com.munpro.app.ui.kit.tap
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer

// ---------------------------------------------------------------------------------------------
// B1.6 · Payment required
// ---------------------------------------------------------------------------------------------

/** The web's "Unlocks the moment payment clears" list. */
private val UNLOCKS = listOf(
    "Committee and country confirmation",
    "Study guides, position papers and documents",
    "Live committee sessions",
    "Modules, results and certificates",
)

@Composable
fun PaymentRequired(conf: Conference) {
    val c = palette
    val gate = getPaymentGate(conf.app, conf.event)
    var paying by remember { mutableStateOf(false) }
    var refreshing by remember { mutableStateOf(false) }
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val day = gate.dueAt?.let { java.time.Instant.ofEpochMilli(it).atZone(java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("d MMM", java.util.Locale.UK)) }
    Screen(back = "Conferences", tabBar = false, gap = 18.dp, onRefresh = { AppGraph.conferences.reload() }) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(if (gate.overdue) "Your registration payment is overdue" else "Complete your registration payment", style = Type.title2, color = c.label)
            Text(
                if (day != null) "${conf.event.title} holds your seat until $day." else "${conf.event.title} · ${conf.app.role}",
                style = Type.subhead, color = c.label2,
            )
        }
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("${gate.tierLabel} · ${conf.app.role}", style = Type.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = c.label)
                Text(listOfNotNull(day?.let { "Pay by $it" }, formatDueLabel(gate)).joinToString(" · "), style = Type.footnote, color = if (gate.overdue) c.red else c.label2)
            }
            Text(formatFee(gate.amount), fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 26.sp, color = c.label)
        }
        Text(
            if (gate.overdue) "The payment window has closed. Pay now to keep your place: unpaid seats are released to waitlisted delegates, and the fee may have moved to a later pricing tier."
            else "Your seat is held but not confirmed. The fee is fixed by the pricing window your payment lands in, so paying earlier keeps the current rate.",
            style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp),
        )
        Section(header = "Unlocks when it clears") {
            UNLOCKS.forEach { cell(it, leading = { SfIcon(Icons.lock, c.label2, size = 18.dp) }, inset = 48.dp, chevron = false) }
        }
        MunButton("Pay ${formatFee(gate.amount)}", { paying = true })
        MunButton(if (refreshing) "Checking…" else "Already paid? Refresh", {
            refreshing = true
            scope.launch { AppGraph.conferences.reload(); refreshing = false }
        }, variant = ButtonVariant.Tinted, enabled = !refreshing)
        SectionFooter(
            "Payments confirm within a minute of checkout. Need a fee waiver or financial aid, or paid another way? Contact the organizer" +
                (conf.event.contactEmail?.ifBlank { null }?.let { " ($it)" } ?: "") + ": they can mark your registration as paid.",
        )
    }
    if (paying) com.munpro.app.ui.payments.PayFeeSheet(conf) { paying = false }
}

// ---------------------------------------------------------------------------------------------
// B1.7 · The portal's menu
// ---------------------------------------------------------------------------------------------

data class PortalTile(val label: String, val icon: SfIconSpec, val color: Color, val badge: Int = 0, val onClick: () -> Unit)

/** Every tab as a tile, three to a row. */
@Composable
fun PortalMenu(tiles: List<PortalTile>) {
    val c = palette
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        tiles.chunked(3).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { t ->
                    Box(Modifier.weight(1f)) {
                        Column(
                            Modifier.fillMaxWidth().aspectRatio(1.15f).clip(RoundedCornerShape(Radius.cell)).background(c.cell)
                                .tap(rememberPress(), label = t.label, onClick = t.onClick).padding(12.dp),
                            verticalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(t.color.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) {
                                SfIcon(t.icon, t.color, size = 19.dp)
                            }
                            Text(t.label, style = Type.subhead.copy(fontWeight = FontWeight.SemiBold), color = c.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        if (t.badge > 0) Box(
                            Modifier.align(Alignment.TopEnd).padding(8.dp).size(22.dp).clip(CircleShape).background(c.red),
                            contentAlignment = Alignment.Center,
                        ) { Text(if (t.badge > 9) "9+" else "${t.badge}", style = Type.caption, color = Color.White) }
                    }
                }
                repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// B1.8 · Team delegation
// ---------------------------------------------------------------------------------------------

/** isTeamLeadRole: "team" and ("lead" or "head") in the role. */
fun isTeamLead(role: String): Boolean = role.contains("team", true) && (role.contains("lead", true) || role.contains("head", true))

/** The delegation this application belongs to (members carry the head's application id). */
fun delegationOf(app: ApplicationData): String? =
    app.delegationId?.ifEmpty { null } ?: app.teamApplicationParentId?.ifEmpty { null } ?: app.id.takeIf { isTeamLead(app.role) }

@Composable
fun TeamPanel(conf: Conference) {
    val c = palette
    val app = conf.app
    val delegation = delegationOf(app) ?: return
    val head = isTeamLead(app.role)
    val team = rememberCached("team:${conf.event.id}:$delegation", ListSerializer(ApplicationData.serializer()), Fresh.SHORT) {
        AppGraph.gate.team(conf.event.id, delegation)
    }
    val members = team.data.orEmpty().filter { it.id != app.id || !head }
    if (team.has && members.isEmpty()) return
    val papers = members.count { !it.positionPaperContent.isNullOrBlank() || !it.positionPaperUrl.isNullOrBlank() }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(app.delegationName?.ifEmpty { null } ?: members.firstOrNull { !it.delegationName.isNullOrEmpty() }?.delegationName ?: "My team", style = Type.headline, color = c.label, modifier = Modifier.weight(1f))
            Text("${members.size} member${if (members.size == 1) "" else "s"}", style = Type.footnote, color = c.label2)
            if (head) Chip("Team head", Tone.Tint)
        }
        if (members.isNotEmpty()) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row { Text("Position papers handed in", style = Type.subhead, color = c.label, modifier = Modifier.weight(1f)); Text("$papers/${members.size}", style = Type.subhead.copy(fontWeight = FontWeight.SemiBold), color = c.label) }
            Box(Modifier.fillMaxWidth().height(6.dp).clip(CircleShape).background(c.fillSoft)) {
                Box(Modifier.fillMaxWidth(papers.toFloat() / members.size).height(6.dp).clip(CircleShape).background(c.tint))
            }
        }
        Section(header = "Members") {
            members.forEach { m ->
                val me = m.userId == AppGraph.auth.user?.uid
                val unpaid = getPaymentGate(m, conf.event).status == "due"
                cell(
                    (m.applicantName?.ifEmpty { null } ?: "Member") + if (me) " · you" else "",
                    subtitle = listOf(committeeOf(m).ifEmpty { "No committee yet" }, m.assignedCountry?.ifEmpty { null }?.let(::countryName) ?: "Country pending").joinToString(" · "),
                    leading = { com.munpro.app.ui.kit.PersonAvatar(m.applicantName.orEmpty(), size = 38.dp, seed = m.id) }, inset = 66.dp, chevron = false,
                    trailing = when {
                        unpaid -> ({ Chip("Unpaid", Tone.Warning) })
                        m.status != "approved" -> ({ Chip(m.status.replaceFirstChar { it.uppercase() }) })
                        else -> null
                    },
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// B1.9 · Room alerts
// ---------------------------------------------------------------------------------------------

@Composable
fun RoomAlertsSheet(visible: Boolean, onClose: () -> Unit, alerts: List<RoomAlert>) {
    val c = palette
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    PageSheet(visible, onClose) {
        SheetHeader("Room alerts", trailing = "Done", onTrailing = onClose)
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 8.dp, bottom = navBottom + 24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (alerts.isEmpty()) Text("No active alerts. The dais posts them here during the conference.", style = Type.subhead, color = c.label2, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 24.dp))
            alerts.sortedByDescending { it.createdAt ?: 0L }.forEach { a ->
                val (col, label) = when (a.type) { "urgent" -> c.red to "Urgent"; "warning" -> c.orange to "Warning"; else -> SystemColors.blue to "Info" }
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(14.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(Modifier.size(10.dp).clip(CircleShape).background(col).align(Alignment.Top).padding(top = 4.dp))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(a.message, style = Type.bodyMedium, color = c.label)
                        Text(
                            listOfNotNull(label, a.createdAt?.let(::shortWhen), a.expiresAt?.let { e -> ((e - System.currentTimeMillis()) / 60_000).takeIf { it in 1..180 }?.let { "expires in ${it}m" } }).joinToString(" · "),
                            style = Type.footnote, color = col,
                        )
                    }
                }
            }
        }
    }
}

/** Finds the conference for [appId] (the saved list), or says it isn't there. */
@Composable
fun PortalScreen(appId: String, content: @Composable (Conference) -> Unit) {
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()
    val conf = confs.conferences?.firstOrNull { it.app.id == appId }
    when {
        conf != null -> content(conf)
        confs.conferences == null -> Screen(back = "Back", tabBar = false) { com.munpro.app.ui.kit.Spinner() }
        else -> Screen(back = "Back", tabBar = false) { com.munpro.app.ui.kit.Empty("Conference not found", "Pull down on Conferences to refresh your list.") }
    }
}
