package com.munpro.app.ui.live

// The room board: a phone or tablet propped up in the chamber (the web's `?view=projector` stays
// the main projector). Landscape, full screen, kept awake, no controls. Light-locked like the
// projector's .mun-projector tokens: a screen across a room has to read the same whatever theme
// the device is in.
//
// What it shows comes from the shared focal ladder (domain/live/Focal.kt), so the board, the
// delegates' phones and the projector agree on what the room is looking at. Vote tallies are
// never shown here: ballots are blind until the chair publishes the result.

import com.munpro.app.domain.live.GateKind
import androidx.compose.ui.unit.em
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import com.munpro.app.ui.kit.Flag
import android.app.Activity
import android.content.pm.ActivityInfo
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import kotlinx.coroutines.flow.map
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.munpro.app.AppGraph
import com.munpro.app.domain.committeeDocTypeLabel
import com.munpro.app.domain.countryName
import com.munpro.app.domain.flagEmoji
import com.munpro.app.domain.fmtClock
import com.munpro.app.domain.live.Focal
import com.munpro.app.domain.live.LiveSession
import com.munpro.app.domain.live.PHASE
import com.munpro.app.domain.live.floorHolder
import com.munpro.app.domain.live.floorLine
import com.munpro.app.domain.live.floorSpeechClock
import com.munpro.app.domain.live.focalQueue
import com.munpro.app.domain.live.isSeated
import com.munpro.app.domain.live.makeSessionId
import com.munpro.app.domain.live.resolveFocal
import com.munpro.app.domain.live.sessionDateStr
import com.munpro.app.domain.live.timerRemainingMs
import com.munpro.app.ui.kit.Dot
import com.munpro.app.ui.kit.Emoji
import com.munpro.app.ui.kit.Inter
import com.munpro.app.ui.kit.LightPalette
import com.munpro.app.ui.kit.LocalPalette
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette

private val RESULT_WORD = mapOf("passed" to "Passes", "failed" to "Fails", "tied" to "Tied", "vetoed" to "Vetoed")

@Composable
fun RoomBoardScreen(eventId: String, committee: String) {
    val event by produceState<com.munpro.app.domain.EventData?>(null, eventId) { value = AppGraph.events.getEventById(eventId) }
    val dateStr = remember(event?.timeZone) { sessionDateStr(event?.timeZone) }
    val sessionId = makeSessionId(committee, dateStr)
    // Loading vs "no sitting today" are different screens on a board across the room.
    val state by remember(eventId, sessionId) {
        AppGraph.sessions.session(eventId, sessionId).map<LiveSession?, com.munpro.app.domain.live.Loadable<LiveSession>> { com.munpro.app.domain.live.Loadable.Ready(it) }
    }.collectAsState(com.munpro.app.domain.live.Loadable.Loading)
    val session = (state as? com.munpro.app.domain.live.Loadable.Ready)?.value
    val now = rememberNow()

    // Landscape, awake, edge to edge — for as long as the board is on screen.
    val activity = LocalContext.current as? Activity
    val view = LocalView.current
    DisposableEffect(activity) {
        val before = activity?.requestedOrientation
        activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        view.keepScreenOn = true
        val bars = activity?.window?.let { WindowCompat.getInsetsController(it, view) }
        bars?.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        bars?.hide(WindowInsetsCompat.Type.systemBars())
        onDispose {
            view.keepScreenOn = false
            bars?.show(WindowInsetsCompat.Type.systemBars())
            if (before != null) activity.requestedOrientation = before
        }
    }

    CompositionLocalProvider(LocalPalette provides LightPalette) {
        val c = palette
        Box(Modifier.fillMaxSize().background(c.bg).padding(horizontal = 24.dp, vertical = 16.dp)) {
            val s = session
            if (s == null) {
                Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(committee, fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 40.sp, color = c.label, textAlign = TextAlign.Center)
                    Text(if (state is com.munpro.app.domain.live.Loadable.Ready && event != null) "Not in session yet" else "Connecting…", style = Type.title2, color = c.label2)
                }
            } else Board(s, committee, event?.title.orEmpty(), now)
        }
    }
}

/** Board 07: a status bar over one huge message on the left, the speakers list down the right. */
@Composable
private fun Board(s: LiveSession, committee: String, eventTitle: String, now: Long) {
    val c = palette
    val focal = resolveFocal(s)
    val (source, queue) = focalQueue(s, focal)
    val (gateKind, gateLine) = floorLine(s, now)
    Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        Column(Modifier.weight(2f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            // ---- status bar ----
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Text(committee, fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 18.sp, lineHeight = 21.sp, color = c.label, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false).widthIn(max = 260.dp))
                if (eventTitle.isNotEmpty()) Text(eventTitle, style = Type.caption.copy(fontWeight = FontWeight.Normal), color = c.label2, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 120.dp))
                val suspended = s.phase == "suspended"
                val motions = gateKind == GateKind.MOTIONS && !suspended
                StatusChip(
                    if (motions) "Open for motions" else PHASE[s.phase] ?: s.phase,
                    if (motions) c.tint else if (suspended) c.orange else c.red,
                    if (motions) c.tintSoft else if (suspended) c.orangeSoft else c.redSoft,
                )
                Column {
                    Text("${s.attendance.values.count { isSeated(it.status) }}", style = Type.subhead.copy(fontWeight = FontWeight.SemiBold, fontFeatureSettings = "tnum"), color = c.label)
                    Text("present", style = Type.caption.copy(fontWeight = FontWeight.Normal), color = c.label2)
                }
            }
            // ---- the focal message ----
            Column(
                Modifier.fillMaxWidth().weight(1f).clip(RoundedCornerShape(24.dp)).background(c.cell).padding(horizontal = 32.dp, vertical = 24.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterVertically),
            ) { FocalBlock(s, focal, gateKind, gateLine, now) }
        }

        // ---- the list the floor is taking speakers from ----
        Column(
            Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(24.dp)).background(c.cell).padding(22.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Overline(if (source == "caucus") "Caucus speakers" else "Speakers list")
            if (queue.isEmpty()) Text("Nobody waiting", style = Type.body, color = c.label2)
            queue.take(8).forEachIndexed { i, q ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.size(24.dp).clip(CircleShape).background(if (i == 0) c.tint else c.fillSoft), contentAlignment = Alignment.Center) {
                        Text("${i + 1}", fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = if (i == 0) c.onTint else c.label2)
                    }
                    Flag(q.country, 18f)
                    Text(countryName(q.country), fontFamily = Inter, fontWeight = if (i == 0) FontWeight.SemiBold else FontWeight.Medium, fontSize = 17.sp, color = c.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            if (queue.size > 8) Text("+${queue.size - 8} more", style = Type.subhead, color = c.label2)
            Spacer(Modifier.weight(1f))
            // The floor line, unless the focal message already says it.
            if (focal != Focal.Calm) Text(gateLine, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = c.tint)
        }
    }
}

@Composable
private fun StatusChip(text: String, fg: androidx.compose.ui.graphics.Color, bg: androidx.compose.ui.graphics.Color) {
    Row(
        Modifier.clip(CircleShape).background(bg).padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Dot(fg, 7.dp)
        Text(text, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = fg, maxLines = 1)
    }
}

@Composable
private fun Overline(t: String) = Text(t.uppercase(), style = Type.sectionLabel, color = palette.label2, maxLines = 1, overflow = TextOverflow.Ellipsis)

@Composable
private fun FocalBlock(s: LiveSession, focal: Focal, gateKind: String, gateLine: String, now: Long) {
    val c = palette
    @Composable fun Huge(t: String, size: Int = 60, color: androidx.compose.ui.graphics.Color = c.label, modifier: Modifier = Modifier) = Text(
        t, fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = size.sp, lineHeight = (size * 1.05).sp,
        letterSpacing = (-0.025).em, color = color, maxLines = 3, overflow = TextOverflow.Ellipsis, modifier = modifier,
    )
    @Composable fun Clock(ms: Long, size: Int = 64) = Text(
        fmtClock(ms), fontFamily = Inter, fontWeight = FontWeight.SemiBold, fontSize = size.sp, color = c.tint,
        style = Type.body.copy(fontFeatureSettings = "tnum"), maxLines = 1,
    )
    @Composable fun Sub(t: String, color: androidx.compose.ui.graphics.Color = c.label2) = Text(t, style = Type.title2.copy(fontWeight = FontWeight.Normal, fontSize = 18.sp), color = color)
    @Composable fun SpeakerLine(country: String, ms: Long, size: Int) = Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        Flag(country, size * 0.62f)
        Huge(countryName(country).ifEmpty { "Speaker" }, size, modifier = Modifier.weight(1f, fill = false))
        Clock(ms, size)
    }

    when (focal) {
        is Focal.Vote -> {
            val v = focal.vote
            Overline(if (v.voteType == "substantive") "Substantive vote" else "Procedural vote")
            Huge(v.motion.ifEmpty { "Vote" }, 44)
            v.timer?.let { Clock(timerRemainingMs(it, now), 56) }
            Sub(if (v.mode == "tally") "Raise your placards" else "Delegations are voting", c.tint)
        }
        is Focal.Result -> {
            val r = focal.published
            val passed = r.result == "passed"
            Overline(listOf("Result", r.motion).filter(String::isNotEmpty).joinToString(" · "))
            Huge(RESULT_WORD[r.result] ?: r.result.replaceFirstChar { it.uppercase() }, 76, if (passed) c.tint else if (r.result == "tied") c.label else c.red)
            Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                @Composable fun count(n: Int?, what: String, color: androidx.compose.ui.graphics.Color) = Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("${n ?: 0}", style = Type.title2.copy(fontSize = 18.sp, fontFeatureSettings = "tnum"), color = color)
                    Text(what, style = Type.title2.copy(fontSize = 18.sp), color = c.label)
                }
                count(r.affirmative, "for", c.tint)
                count(r.negative, "against", c.red)
                count(r.abstentions, "abstaining", c.info)
            }
            r.vetoedByCountries?.takeIf { it.isNotEmpty() }?.let { v -> Sub("Vetoed by ${v.joinToString(", ") { countryName(it) }}", c.red) }
        }
        is Focal.Doc -> {
            val d = focal.published
            Overline(committeeDocTypeLabel(d.docType))
            Huge(d.title.ifEmpty { "Document" }, 48)
            if (d.sponsors.isNotEmpty()) Sub("Sponsors: ${d.sponsors.joinToString(", ") { countryName(it) }}")
        }
        is Focal.Caucus -> {
            val cau = focal.caucus
            Overline(if (cau.kind == "moderated") "Moderated caucus" else "Unmoderated caucus")
            // A moderated caucus speaker comes from the one floor derivation, never gsl.activeSpeaker.
            val h = floorHolder(s)
            if (h != null) {
                SpeakerLine(h.country, timerRemainingMs(floorSpeechClock(s).timer, now), 52)
                Sub(listOf(cau.topic, "${fmtClock(timerRemainingMs(cau.totalTimer, now))} left in the caucus").filter(String::isNotEmpty).joinToString(" · "))
            } else {
                if (cau.topic.isNotEmpty()) Huge(cau.topic, 44)
                Clock(timerRemainingMs(cau.totalTimer, now))
            }
        }
        is Focal.Speaker -> {
            val h = floorHolder(s) ?: focal.speaker
            Overline("Has the floor")
            SpeakerLine(h.country, timerRemainingMs(floorSpeechClock(s).timer, now), 60)
        }
        Focal.RollCall -> {
            Overline("Roll call")
            Huge("${s.attendance.values.count { isSeated(it.status) }} of ${s.attendance.size}", 76)
            Sub("delegations present")
        }
        Focal.Calm -> {
            Overline(PHASE[s.phase] ?: s.phase)
            Huge(gateLine, 56)
            if (gateKind == GateKind.LOCKED) Sub(if (s.phase == "suspended") "The session is suspended." else "The chair will open the floor shortly.")
        }
    }
}
