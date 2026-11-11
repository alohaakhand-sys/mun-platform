package com.munpro.app.ui.chair

// The Executive Board and read-only staff (board B5.8–B5.10; web dashboard/eb and
// dashboard/observer). EB: every committee in scope with its grading, guide and chairs, a chair
// moved to another committee in scope or removed. Observer / faculty staff: the conference, its
// committees to watch live, the recent announcements, and the roster only when the organizer
// granted View applications. Data: OversightRepo.

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.unit.dp
import com.munpro.app.AppGraph
import com.munpro.app.data.ChairSeat
import com.munpro.app.data.EventOversight
import com.munpro.app.data.Fresh
import com.munpro.app.data.ObservedEvent
import com.munpro.app.data.Refresh
import com.munpro.app.data.StaffSeat
import com.munpro.app.data.rememberCached
import com.munpro.app.domain.countryName
import com.munpro.app.domain.dayMonth
import com.munpro.app.domain.getEventStartMs
import com.munpro.app.domain.roleLabel
import com.munpro.app.domain.sentAt
import com.munpro.app.domain.shortWhen
import com.munpro.app.nav.ChairRoute
import com.munpro.app.nav.CommitteeHubRoute
import com.munpro.app.nav.ReaderRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.kit.ActionSheet
import com.munpro.app.ui.kit.Chip
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.PersonAvatar
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SheetRow
import com.munpro.app.ui.kit.Spinner
import com.munpro.app.ui.kit.Tone
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import kotlin.math.roundToInt

/** My accepted staff seats, cached: Profile decides from them whether to show the EB / observer rows. */
@Composable
fun rememberStaffSeats() = AppGraph.auth.user?.uid.let { uid ->
    rememberCached(uid?.let { "staffSeats:$it" }, ListSerializer(StaffSeat.serializer()), Fresh.LONG) { AppGraph.oversight.mySeats(uid!!) }
}

// ---------------------------------------------------------------------------------------------
// B5.8 · Executive Board
// ---------------------------------------------------------------------------------------------

@Composable
fun ExecBoardScreen() {
    val c = palette
    val nav = LocalNav.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val uid = AppGraph.auth.user?.uid.orEmpty()
    val data = rememberCached("ebOverview:$uid", ListSerializer(EventOversight.serializer()), Fresh.MEDIUM) {
        AppGraph.oversight.execBoard(AppGraph.oversight.mySeats(uid))
    }
    var manage by remember { mutableStateOf<Pair<EventOversight, ChairSeat>?>(null) }
    var busy by remember { mutableStateOf(false) }

    Screen(back = "Profile", tabBar = false, title = "Executive Board", savedAt = data.savedAt, onRefresh = {}) {
        val list = data.data
        when {
            list == null -> Spinner()
            list.isEmpty() -> Empty("No Executive Board seats", "Conferences where you're a Director or Under-Secretary-General appear here.", icon = Icons.gavel)
            else -> list.forEach { ev ->
                val delegates = ev.committees.sumOf { it.delegates }
                val graded = ev.committees.sumOf { it.graded }
                Text(
                    listOf(ev.event.title, roleLabel(ev.role), if (ev.scopeAll) "all committees" else ev.scope.firstOrNull().orEmpty()).joinToString(" · "),
                    style = Type.subhead, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Stat("${ev.committees.size}", "Committees", Modifier.weight(1f))
                    Stat("$delegates", "Delegates", Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Stat("${ev.committees.sumOf { it.chairs.size }}", "Chairs", Modifier.weight(1f))
                    Stat(if (delegates > 0) "${(graded * 100.0 / delegates).roundToInt()}%" else "N/A", "Graded", Modifier.weight(1f))
                }
                ev.committees.forEach { cm ->
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(cm.name, style = Type.headline, color = c.label, modifier = Modifier.weight(1f))
                            if (cm.delegates > 0) Chip("${(cm.graded * 100.0 / cm.delegates).roundToInt()}%", Tone.Tint)
                            if (!cm.hasGuide) Chip("No guide", Tone.Warning)
                        }
                        Text(
                            listOfNotNull("${cm.delegates} delegates", "${cm.chairs.size} ${if (cm.chairs.size == 1) "chair" else "chairs"}", if (cm.hasGuide) "guide ✓" else null).joinToString(" · "),
                            style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 16.dp),
                        )
                        Section {
                            cm.chairs.forEach { ch ->
                                cell(ch.name.ifEmpty { "Chair" }, subtitle = roleLabel(ch.role), leading = { PersonAvatar(ch.name, size = 32.dp, seed = ch.uid) }, inset = 60.dp,
                                    onClick = { manage = ev to ch })
                            }
                            if (cm.chairs.isEmpty()) cell("No chair yet", subtitle = "The organizer invites chairs from the website.", dim = true)
                        }
                        MunButton("Open Committee", { nav.go(CommitteeHubRoute(ev.event.id, cm.name)) }, height = 42.dp, modifier = Modifier.padding(horizontal = 16.dp))
                    }
                }
            }
        }
    }

    // B5.9 · Manage a chair: move within my scope, or remove.
    manage?.let { (ev, ch) ->
        ActionSheet(true, { manage = null }, title = "${ch.name.ifEmpty { "Chair" }} · ${roleLabel(ch.role)}", message = "Currently ${ch.committeeId.ifEmpty { "no committee" }}") {
            ev.scope.filter { !com.munpro.app.domain.sameCommittee(it, ch.committeeId) }.forEach { target ->
                SheetRow("Move to $target", {
                    if (busy) return@SheetRow
                    busy = true
                    scope.launch {
                        runCatching { AppGraph.oversight.moveChair(ev.event.id, ch, target) }.fold(onSuccess = { manage = null; Refresh.bump() }, onFailure = { alerts.show("Couldn't move the chair", "Check your connection and try again.") })
                        busy = false
                    }
                })
            }
            SheetRow("Remove ${roleLabel(ch.role)}", {
                scope.launch {
                    if (!alerts.confirm("Remove ${ch.name.ifEmpty { "this chair" }}?", "They lose access to ${ch.committeeId.ifEmpty { "the committee" }} right away.", "Remove", destructive = true)) return@launch
                    busy = true
                    runCatching { AppGraph.oversight.removeChair(ev.event.id, ch) }.fold(onSuccess = { manage = null; Refresh.bump() }, onFailure = { alerts.show("Couldn't remove the chair", "Check your connection and try again.") })
                    busy = false
                }
            }, destructive = true)
        }
    }
}

// ---------------------------------------------------------------------------------------------
// B5.10 · Observer dashboard
// ---------------------------------------------------------------------------------------------

@Composable
fun ObserverScreen() {
    val c = palette
    val nav = LocalNav.current
    val uid = AppGraph.auth.user?.uid.orEmpty()
    val data = rememberCached("observed:$uid", ListSerializer(ObservedEvent.serializer()), Fresh.MEDIUM) {
        AppGraph.oversight.observed(AppGraph.oversight.mySeats(uid))
    }
    Screen(back = "Profile", tabBar = false, title = "Read-only", savedAt = data.savedAt, onRefresh = {}) {
        val list = data.data
        when {
            list == null -> Spinner()
            list.isEmpty() -> Empty("No observer access yet", "Once an organizer adds you as an observer or faculty advisor, the conference appears here.", icon = Icons.eye)
            else -> list.forEach { o ->
                val ev = o.event
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(ev.title, style = Type.headline, color = c.label)
                    Text(
                        listOfNotNull(roleLabel(o.role), getEventStartMs(ev)?.let { dayMonth(it) }, ev.locationName?.ifEmpty { null } ?: ev.location.ifEmpty { null }).joinToString(" · "),
                        style = Type.footnote, color = c.label2,
                    )
                }
                val committees = (if (o.committeeId.isNotEmpty()) listOf(o.committeeId) else ev.committees.map { it.name }).filter { it.isNotEmpty() }
                if (committees.isNotEmpty()) Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    com.munpro.app.ui.kit.SectionHeader("Watch live")
                    Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        committees.forEach { cm -> Pill(cm, { nav.go(ChairRoute(ev.id, cm)) }) }
                    }
                }
                Section(header = "Recent announcements") {
                    if (o.announcements.isEmpty()) cell("No announcements yet", dim = true)
                    o.announcements.forEach { a ->
                        cell(a.subject.ifEmpty { "Announcement" }, subtitle = listOfNotNull("Everyone".takeIf { a.audience == null }, shortWhen(sentAt(a)).ifEmpty { null }).joinToString(" · ").ifEmpty { null },
                            onClick = { nav.go(ReaderRoute("announcement", ev.id, id = a.id)) })
                    }
                }
                Section(header = "Delegates", footer = if (o.roster == null) "Ask the organizer for \"View applications\"." else null) {
                    val roster = o.roster
                    when {
                        roster == null -> cell("Roster hidden", leading = { com.munpro.app.ui.kit.SfIcon(Icons.lock, c.label2, size = 18.dp) }, dim = true)
                        roster.isEmpty() -> cell("No approved delegates yet", dim = true)
                        else -> roster.sortedBy { it.committee + it.name }.forEach { r ->
                            cell(r.name, subtitle = listOfNotNull(r.committee.ifEmpty { null }, countryName(r.country).ifEmpty { null }).joinToString(" · ").ifEmpty { null })
                        }
                    }
                }
            }
        }
    }
}
