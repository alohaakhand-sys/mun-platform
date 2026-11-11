package com.munpro.app.ui.event

// The public conference page and a committee page (RN app/event/[id].tsx, app/committee.tsx; the
// mockup's "Conference" and "Committee"). The cover runs under the status bar; Apply sits next
// to the one fact that decides it.

import com.munpro.app.ui.kit.Flag
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.shape.RoundedCornerShape
import com.munpro.app.ui.kit.Radius
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.domain.Committee
import com.munpro.app.domain.EventData
import com.munpro.app.domain.countryName
import com.munpro.app.domain.flagEmoji
import com.munpro.app.domain.formatLabel
import com.munpro.app.domain.fromPrice
import com.munpro.app.domain.getApplicationTimeline
import com.munpro.app.domain.getCommitteeAgendas
import com.munpro.app.domain.getCommitteeDifficulties
import com.munpro.app.domain.getEventCapacity
import com.munpro.app.domain.getEventStartMs
import com.munpro.app.domain.place
import com.munpro.app.domain.whenText
import com.munpro.app.nav.ApplyRoute
import com.munpro.app.nav.CommitteeRoute
import com.munpro.app.nav.ConferenceRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.kit.Capsule
import com.munpro.app.ui.kit.Card
import com.munpro.app.ui.kit.Emoji
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.LocalBack
import com.munpro.app.ui.kit.Markdown
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SectionHeader
import com.munpro.app.ui.kit.SfIcon
import com.munpro.app.ui.kit.Space
import com.munpro.app.ui.kit.Spinner
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.kit.rememberPress
import com.munpro.app.ui.kit.tap
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** undefined = loading, null = not found (the RN screens' three states). */
private sealed interface Loaded<out T> {
    data object Loading : Loaded<Nothing>
    data class Done<T>(val value: T?) : Loaded<T>
}

@Composable
private fun rememberEvent(id: String): Loaded<EventData> {
    var e by remember(id) { mutableStateOf<Loaded<EventData>>(Loaded.Loading) }
    LaunchedEffect(id) { e = Loaded.Done(AppGraph.events.getEventById(id)) }
    return e
}

private fun seatsOf(cm: Committee) = cm.capacity?.takeIf { it > 0 } ?: cm.countries.size

@Composable
fun EventScreen(id: String) {
    val c = palette
    val nav = LocalNav.current
    val back = LocalBack.current
    val loaded = rememberEvent(id)
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()
    val top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val event = (loaded as? Loaded.Done)?.value
    val mine = confs.conferences?.firstOrNull { it.app.eventId == id }
    com.munpro.app.ui.kit.LightStatusBarIcons()

    Column(
        Modifier
            .fillMaxSize()
            .background(c.bg)
            .verticalScroll(rememberScrollState())
            .padding(bottom = 48.dp + bottom),
    ) {
        // The organizer's theme colour (Tools › Theme), with readable text on it.
        val themeHex = com.munpro.app.domain.themeHex(event?.theme)
        val headerInk = if (themeHex != null && com.munpro.app.domain.inkIsDark(themeHex)) Color(0xFF1B1F2A) else Color.White
        Box(
            Modifier
                .fillMaxWidth()
                .height(176.dp + top)
                .background(themeHex?.let { Color(com.munpro.app.domain.hexToArgb(it)) } ?: c.pass)
                .padding(Space.gutter),
            contentAlignment = Alignment.BottomStart,
        ) {
            if (event != null) {
                Column {
                    Text(event.title, style = Type.title2.copy(fontSize = 26.sp, lineHeight = 30.sp), color = headerInk)
                    Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        SfIcon(Icons.cal, headerInk.copy(alpha = 0.72f), size = 14.dp)
                        Text(whenText(getEventStartMs(event), event.date), style = Type.footnote, color = headerInk.copy(alpha = 0.72f))
                    }
                }
            }
        }

        Column(Modifier.padding(Space.gutter), verticalArrangement = Arrangement.spacedBy(Space.section)) {
            when {
                loaded is Loaded.Loading -> Spinner()
                event == null -> Empty("This conference isn't available", "It may have been unpublished, or the link is wrong.")
                else -> {
                    val timeline = getApplicationTimeline(event)
                    val fee = fromPrice(event)
                    val closes = timeline.closeAt?.let { Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("d MMMM", Locale.UK)) }
                    if (mine != null) {
                        Section {
                            cell(
                                when (mine.app.status) {
                                    "approved" -> "You're in this conference"
                                    "rejected" -> "Your application wasn't accepted"
                                    else -> "You've applied"
                                },
                                subtitle = if (mine.app.status == "pending") "The organiser is reviewing it" else null,
                                tinted = true,
                                onClick = { nav.go(ConferenceRoute(mine.app.id)) },
                            )
                        }
                    } else if (timeline.isOpen) {
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(start = 16.dp, end = 12.dp, top = 12.dp, bottom = 12.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(fee?.let { "$it for delegates" } ?: "Applications open", style = Type.bodyMedium, color = c.label)
                                closes?.let { Text("Applications close $it", style = Type.footnote, color = c.label2) }
                            }
                            Capsule("Apply", { nav.go(ApplyRoute(event.id)) })
                        }
                    } else {
                        Empty("Applications are closed", "The organiser isn't taking new applications.")
                    }

                    com.munpro.app.ui.organizer.StaffApplySection(event)

                    Section {
                        cell("Format", value = formatLabel(event))
                        cell("Where", value = place(event))
                        if (fee != null) cell("Delegate fee", value = fee)
                        getEventCapacity(event).takeIf { it > 0 }?.let { cell("Seats", value = "$it") }
                        event.expectedDelegates?.takeIf { it > 0 }?.let { cell("Delegates", value = "$it") }
                        event.organizerName?.takeIf { it.isNotBlank() }?.let { cell("Organiser", value = it) }
                    }

                    if (event.committees.isNotEmpty()) {
                        Section(header = "Committees") {
                            event.committees.forEach { cm ->
                                cell(
                                    cm.name,
                                    subtitle = "${seatsOf(cm)} seats · ${(getCommitteeDifficulties(cm).firstOrNull() ?: "Beginner").lowercase()}",
                                    onClick = { nav.go(CommitteeRoute(event.id, cm.name)) },
                                )
                            }
                        }
                    }

                    if (event.description.isNotBlank()) {
                        Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                            SectionHeader("About")
                            Card { Markdown(event.description) }
                        }
                    }
                }
            }
        }
    }

    // Back and Share float over the cover as glass circles.
    val context = androidx.compose.ui.platform.LocalContext.current
    Row(Modifier.fillMaxWidth().padding(top = top + 8.dp, start = 12.dp, end = 12.dp)) {
        HeroButton(Icons.back, "Back", back)
        Spacer(Modifier.weight(1f))
        val url = com.munpro.app.data.Api.site("/events/$id")
        if (event != null && url != null) HeroButton(Icons.share, "Share") {
            val send = android.content.Intent(android.content.Intent.ACTION_SEND).setType("text/plain")
                .putExtra(android.content.Intent.EXTRA_SUBJECT, event.title).putExtra(android.content.Intent.EXTRA_TEXT, "${event.title}\n$url")
            context.startActivity(android.content.Intent.createChooser(send, "Share conference"))
        }
    }
}

@Composable
private fun HeroButton(icon: com.munpro.app.ui.kit.SfIconSpec, label: String, onClick: () -> Unit) {
    val press = rememberPress()
    Box(
        Modifier
            .size(36.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.18f))
            .tap(press, label = label, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { SfIcon(icon, Color.White, size = 19.dp) }
}

// Agendas first, then every seat with its flag, so a delegate can plan preferences.
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CommitteeScreen(eventId: String, name: String) {
    val c = palette
    val loaded = rememberEvent(eventId)
    val event = (loaded as? Loaded.Done)?.value
    val cm = event?.committees?.firstOrNull { it.name == name }

    @Composable
    fun chip(label: String, tone: String) {
        val bg = when (tone) { "red" -> c.red.copy(alpha = 0.12f); "tint" -> c.tintSoft; else -> c.fill }
        val fg = when (tone) { "red" -> c.red; "tint" -> c.tint; else -> c.label2 }
        Box(Modifier.clip(CircleShape).background(bg).padding(horizontal = 10.dp, vertical = 5.dp)) {
            Text(label, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp), color = fg)
        }
    }

    Screen(title = name, overline = event?.title, back = event?.title ?: "Back", tabBar = false) {
        when {
            loaded is Loaded.Loading -> Unit
            cm == null -> Empty("Committee not found", "The organiser may have renamed or removed it.")
            else -> {
                FlowRow(Modifier.offset(y = (-12).dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    getCommitteeDifficulties(cm).forEach { d -> com.munpro.app.ui.kit.Chip(d, if (d == "Advanced") com.munpro.app.ui.kit.Tone.Destructive else if (d == "Beginner") com.munpro.app.ui.kit.Tone.Tint else com.munpro.app.ui.kit.Tone.Neutral) }
                    com.munpro.app.ui.kit.Chip("${seatsOf(cm)} seats")
                    if (getApplicationTimeline(event).isOpen) com.munpro.app.ui.kit.Chip("Open", com.munpro.app.ui.kit.Tone.Tint)
                }
                val agendas = getCommitteeAgendas(cm)
                if (agendas.isNotEmpty()) {
                    Section(header = if (agendas.size > 1) "Agendas" else "Agenda") {
                        agendas.forEach { a ->
                            // "Maritime security: escalation threats…" reads as a title and a line.
                            val (t, sub) = a.split(Regex("\\s*[:–—]\\s+"), limit = 2).let { it[0] to it.getOrNull(1) }
                            cell(t, subtitle = sub?.replaceFirstChar { it.uppercase() })
                        }
                    }
                }
                if (!cm.description.isNullOrBlank()) {
                    Section(header = "About") {
                        item { Text(cm.description, style = Type.body.copy(lineHeight = 22.sp), color = c.label, modifier = Modifier.padding(16.dp)) }
                    }
                }
                val council = cm.name.contains("Security Council", ignoreCase = true)
                Section(header = "Seats · ${cm.countries.size}") {
                    cm.countries.forEach { code ->
                        cell(
                            countryName(code), leading = { Flag(code) }, inset = 56.dp,
                            trailing = if (council && code.lowercase() in com.munpro.app.domain.P5_CODES) ({ com.munpro.app.ui.kit.Chip("P5") }) else null,
                        )
                    }
                }
            }
        }
    }
}
