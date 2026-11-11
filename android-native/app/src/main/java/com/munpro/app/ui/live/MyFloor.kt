package com.munpro.app.ui.live

// What the delegate holding the floor can do and needs to know (port of
// mobile/src/components/MyFloor.tsx — the web's YieldMenu and RecognizedPointCard for a phone):
// yield the rest of their time, and the points the chair has recognised against them.
//
// Mounted only while THIS delegate holds the floor, and keyed to the speech, so a new speech
// starts fresh: the recognised-points listener (a cost nobody else needs) and the "since" stamp
// that keeps rulings made against the previous speaker off this screen.

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.munpro.app.AppGraph
import com.munpro.app.domain.countryName
import com.munpro.app.domain.flagEmoji
import com.munpro.app.domain.fmtClock
import com.munpro.app.domain.live.FloorRequest
import com.munpro.app.domain.live.LiveSession
import com.munpro.app.domain.live.ParticipationIdentity
import com.munpro.app.domain.live.floorHolder
import com.munpro.app.domain.live.floorSpeechClock
import com.munpro.app.domain.live.holdsTheFloor
import com.munpro.app.domain.live.pointLabel
import com.munpro.app.domain.live.timerRemainingMs
import com.munpro.app.domain.live.yieldGrantMs
import com.munpro.app.ui.kit.ActionSheet
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.SheetRow
import com.munpro.app.ui.kit.TextLink
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import kotlinx.coroutines.launch

private const val SHOW_WINDOW_MS = 90_000L // the web's window for a recognised point
private const val EPOCH_GRACE_MS = 5_000L //  client clock vs server timestamp, erring toward showing

private val YIELD_LABEL = mapOf("none" to "Back to the chair", "questions" to "To questions", "comments" to "To comments")

@Composable
fun MyFloor(
    eventId: String, sessionId: String, session: LiveSession, identity: ParticipationIdentity, hands: List<FloorRequest>, now: Long,
    /** A vice-chair acting for this delegation: every yield is stamped with them. */
    proxy: com.munpro.app.data.live.ProxyAttribution? = null,
) {
    val holder = floorHolder(session) ?: return
    if (!holdsTheFloor(session, identity.delegateId)) return
    // One subtree per speech: a new holder slot remounts it and resets its state.
    key("${holder.delegateId}:${session.phase}:${if (session.caucus != null) "c" else "g"}") {
        DuringMySpeech(eventId, sessionId, session, identity, hands, now, proxy)
    }
}

@Composable
private fun DuringMySpeech(eventId: String, sessionId: String, session: LiveSession, identity: ParticipationIdentity, hands: List<FloorRequest>, now: Long, proxy: com.munpro.app.data.live.ProxyAttribution?) {
    val c = palette
    val scope = rememberCoroutineScope()
    val repo = AppGraph.sessions
    val holder = floorHolder(session)!!
    val clock = floorSpeechClock(session)
    var sheet by remember { mutableStateOf("closed") } // closed | menu | pick
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val dismissed = remember { mutableStateListOf<String>() }
    val floorSince = remember { System.currentTimeMillis() }
    val points by remember(eventId, sessionId) { repo.recognizedPoints(eventId, sessionId) }.collectAsState(emptyList())

    val against = points.filter { p ->
        if (p.id.isEmpty() || p.id in dismissed || p.delegateId == identity.delegateId) return@filter false
        val at = p.resolvedAt ?: return@filter true // just landed, server hasn't stamped it yet
        at >= floorSince - EPOCH_GRACE_MS && now - at < SHOW_WINDOW_MS
    }

    val pendingYield = hands.firstOrNull { it.kind == "yield" && it.status == "pending" }
    // Keyed by uid, so the key IS the delegate id; an entry with no country can't be named.
    val targets = session.attendance.entries
        .map { (uid, a) -> a.copy(delegateId = uid) }
        .filter { it.delegateId != identity.delegateId && it.country.isNotEmpty() && (it.status == "present" || it.status == "present_and_voting") }
        .sortedBy { countryName(it.country) }

    fun run(fn: suspend () -> Unit) {
        if (busy) return
        busy = true
        error = null
        scope.launch {
            try { fn(); sheet = "closed" }
            catch (_: Exception) { error = "That didn't go through. The chair may have already moved the committee on." }
            finally { busy = false }
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        // A yield recipient may not yield again (it would compound time).
        when {
            holder.viaYield == true -> Text(if (proxy != null) "They received the floor by yield, so they can't yield again." else "You received the floor by yield, so you can't yield again.", style = Type.footnote, color = c.label2, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
            pendingYield != null -> Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Yield to ${countryName(pendingYield.yieldTargetCountry)} sent", style = Type.bodyMedium, color = c.label)
                Text("Waiting for the chair to accept. They'd get ${fmtClock(yieldGrantMs(clock.baseSecs, timerRemainingMs(clock.timer, now)))}.", style = Type.subhead, color = c.label2)
            }
            else -> MunButton(
                if (!holder.yieldTo.isNullOrEmpty() && holder.yieldTo != "none") "Change Yield" else if (proxy != null) "Yield Their Time" else "Yield My Time",
                { error = null; sheet = "menu" }, variant = ButtonVariant.Tinted,
            )
        }
        if (error != null && sheet == "closed") Text(error!!, style = Type.footnote, color = c.red, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())

        // Points the chair recognised against this speech.
        against.forEach { p ->
            val left = p.resolvedAt?.let { SHOW_WINDOW_MS - (now - it) } ?: SHOW_WINDOW_MS
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.orangeSoft).padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("THE CHAIR RECOGNISES ${countryName(p.country).ifEmpty { "a delegate" }.uppercase()}", style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = c.orange, modifier = Modifier.weight(1f))
                    Text("${maxOf(0, Math.ceil(left / 1000.0).toLong())}s", style = Type.footnote.copy(fontWeight = FontWeight.SemiBold, fontFeatureSettings = "tnum"), color = c.orange)
                }
                com.munpro.app.ui.kit.FlagText(p.country, pointLabel(p.type), style = Type.headline, color = c.label)
                Text(if (!p.targetCountry.isNullOrEmpty()) if (proxy != null) "Directed at this delegation." else "Directed at you. Answer it before you go on." else "Raised to the chamber.", style = Type.subhead, color = c.label2)
                if (!p.note.isNullOrEmpty()) Text("“${p.note}”", style = Type.body.copy(fontStyle = FontStyle.Italic), color = c.label)
                TextLink("Dismiss", { dismissed += p.id }, style = Type.bodyMedium.copy(color = c.orange), modifier = Modifier.padding(top = 2.dp))
            }
        }
    }

    ActionSheet(
        visible = sheet != "closed", onDismiss = { sheet = "closed" },
        title = if (sheet == "pick") "Yield to a delegation" else if (proxy != null) "Yield the rest of their time" else "Yield the rest of your time",
        message = if (sheet == "pick") "The chair has to accept before the time transfers. The recipient keeps their own speaking time on top of what's left on the clock."
        else "${fmtClock(timerRemainingMs(clock.timer, now))} left on the clock.",
        error = error,
    ) {
        if (sheet == "pick") {
            if (targets.isEmpty()) Text("Nobody else is marked present.", style = Type.subhead, color = c.label2, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(16.dp))
            targets.forEach { t ->
                SheetRow(countryName(t.country), flag = t.country, onClick = {
                    run { repo.requestYield(eventId, sessionId, identity, t.country, t.delegateId, t.applicationId, timerRemainingMs(clock.timer, System.currentTimeMillis()), proxy) }
                }, enabled = !busy)
            }
        } else {
            SheetRow("To another delegation…", { sheet = "pick" }, enabled = !busy)
            listOf("questions", "comments", "none").forEach { k ->
                // declareOwnYield picks the field path (GSL speaker or caucus speaker); both have a rules branch.
                SheetRow(YIELD_LABEL.getValue(k), { run { repo.declareOwnYield(eventId, sessionId, session, k, proxy) } }, enabled = !busy, selected = k != "none" && holder.yieldTo == k)
            }
        }
    }
}
