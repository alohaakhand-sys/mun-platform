package com.munpro.app.ui.schedule

// Schedule (RN app/(tabs)/schedule.tsx + the mockup's Schedule and Session): a day switcher and
// one list; the session happening now is red, like the live clock. A session opens its own page:
// where, when and what's on the agenda, with one way in.

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.domain.Sitting
import com.munpro.app.domain.clock
import com.munpro.app.domain.committeeOf
import com.munpro.app.domain.dayKey
import com.munpro.app.domain.dayLabel
import com.munpro.app.domain.isAllocated
import com.munpro.app.domain.place
import com.munpro.app.domain.sessions
import com.munpro.app.domain.timeRange
import com.munpro.app.nav.LiveRoute
import com.munpro.app.nav.SessionDetailRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.Inter
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.Segmented
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.kit.rememberPress
import com.munpro.app.ui.kit.tap
import java.time.LocalDate

private fun stateOf(s: Sitting, now: Long) = when {
    now >= s.endOrHour -> "done"
    now >= s.start -> "now"
    else -> "next"
}

@Composable
fun ScheduleScreen() {
    val c = palette
    val nav = LocalNav.current
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()
    val current = confs.current
    val list = current?.let { sessions(it.event) }.orEmpty()
    val days = list.map { dayKey(it.start) }.distinct()
    val today = LocalDate.now()
    var day by rememberSaveable { mutableStateOf<String?>(null) }
    val active = day?.let(LocalDate::parse) ?: if (today in days) today else days.firstOrNull()
    val now = System.currentTimeMillis()

    if (current == null || list.isEmpty()) {
        return Screen(title = "Schedule", back = "Back", tabBar = false) {
            Empty(
                "Nothing scheduled",
                if (current != null) "The organiser hasn't published the schedule yet." else "Sessions from your conference appear here day by day, with the one happening now marked.",
                icon = com.munpro.app.ui.kit.Icons.cal,
            )
        }
    }

    Screen(title = "Schedule", overline = current.event.title, back = "Back", tabBar = false) {
        if (days.size > 1) Segmented(days.map { it to dayLabel(it).substringBeforeLast(" ") }, active, { day = it.toString() })
        Section {
            list.withIndex().filter { dayKey(it.value.start) == active }.forEach { (index, s) ->
                item {
                    val state = stateOf(s, now)
                    val press = rememberPress()
                    val pressed by press.pressed
                    // The delegate's own sittings stand out on the timeline (board 11).
                    val mine = isAllocated(current) && (s.item.type.equals("committee", true) || s.item.type.equals("session", true) || s.item.title.contains("Committee", true))
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .height(IntrinsicSize.Min)
                            .background(if (pressed) c.fill else if (mine) c.tintSoft else androidx.compose.ui.graphics.Color.Transparent)
                            .tap(press) { nav.go(SessionDetailRoute(current.event.id, index)) }
                            .padding(horizontal = 16.dp, vertical = 11.dp)
                            .semantics(mergeDescendants = true) { contentDescription = "${clock(s.start)}, ${s.item.title}${if (state == "now") ", happening now" else ""}" },
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(
                            clock(s.start), maxLines = 1,
                            fontFamily = Inter, fontWeight = if (state == "now") FontWeight.SemiBold else FontWeight.Medium, fontSize = 13.5.sp,
                            color = if (state == "now") c.red else if (mine) c.tint else c.label2, modifier = Modifier.width(76.dp).padding(top = 1.dp),
                        )
                        if (state == "now") Box(Modifier.width(3.dp).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(c.red))
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                            Text(s.item.title.ifEmpty { "Session" }, style = Type.bodyMedium, color = if (state == "done") c.label2 else c.label)
                            Text(
                                listOfNotNull(if (state == "now") "Happening now" else null, s.item.location.ifEmpty { null }, s.item.description?.ifEmpty { null }).joinToString(", ").ifEmpty { " " },
                                style = Type.footnote, color = c.label2,
                            )
                        }
                        if (mine) Text("Your committee", style = Type.caption.copy(fontSize = 11.sp), color = c.tint, modifier = Modifier.align(Alignment.CenterVertically))
                    }
                }
            }
        }
    }
}

@Composable
fun SessionDetailScreen(eventId: String, index: Int) {
    val c = palette
    val nav = LocalNav.current
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()
    val conf = confs.conferences?.firstOrNull { it.event.id == eventId }
    val s = conf?.let { sessions(it.event).getOrNull(index) }
    if (conf == null || s == null) return Screen(back = "Schedule", tabBar = false) { Empty("Session not found", "The organiser may have changed the schedule.") }
    val now = System.currentTimeMillis()
    val state = stateOf(s, now)
    val committee = committeeOf(conf.app)

    val joinable = isAllocated(conf) && state != "done"
    Screen(
        back = "Schedule", tabBar = false, title = s.item.title.ifEmpty { "Session" }, overline = if (state == "now") "Happening now" else dayLabel(dayKey(s.start)),
        bottomBar = if (joinable) ({ MunButton("Join Session", { nav.go(LiveRoute(conf.app.id)) }) }) else null,
    ) {
        Section {
            cell(timeRange(s.start, s.end), subtitle = "Time", chevron = false, inset = 58.dp, leading = { com.munpro.app.ui.kit.IconTile(com.munpro.app.ui.kit.SystemColors.blue, com.munpro.app.ui.kit.Icons.clock) })
            if (committee.isNotEmpty()) cell(committee, subtitle = "Committee", chevron = false, inset = 58.dp, leading = { com.munpro.app.ui.kit.IconTile(com.munpro.app.ui.kit.SystemColors.green, com.munpro.app.ui.kit.Icons.people) })
            cell(s.item.location.ifEmpty { if (conf.event.format == "online") "Online" else place(conf.event) }, subtitle = "Where", chevron = false, inset = 58.dp,
                leading = { com.munpro.app.ui.kit.IconTile(com.munpro.app.ui.kit.SystemColors.orange, com.munpro.app.ui.kit.Icons.pin) })
            if (s.item.type.isNotEmpty()) cell(s.item.type.replaceFirstChar { it.uppercase() }, subtitle = "Kind", chevron = false, inset = 58.dp,
                leading = { com.munpro.app.ui.kit.IconTile(com.munpro.app.ui.kit.SystemColors.gray, com.munpro.app.ui.kit.Icons.list) })
        }
        val agenda = s.item.description?.split("\n")?.map { it.trim().removePrefix("-").trim() }?.filter { it.isNotEmpty() }.orEmpty()
        if (agenda.isNotEmpty()) {
            Section(header = "Agenda") {
                agenda.forEach { line ->
                    val (t, sub) = line.split(Regex("\\s*[:–—]\\s+"), limit = 2).let { it[0] to it.getOrNull(1) }
                    cell(t, subtitle = sub)
                }
            }
        }
        if (state == "done") Text("This session has finished.", style = Type.footnote, color = c.label2, modifier = Modifier.offset(y = (-8).dp).padding(horizontal = 16.dp))
    }
}
