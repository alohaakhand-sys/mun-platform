package com.munpro.app.ui.live

// Pieces of the committee floor shared by the delegate screen and the chair console: words for
// phases and statuses, the big clock block, the stepper, the vote and result cards.

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.munpro.app.domain.countryName
import com.munpro.app.domain.fmtClock
import com.munpro.app.domain.live.PHASE
import com.munpro.app.domain.live.LiveSession
import com.munpro.app.domain.live.PublishedVoteResult
import com.munpro.app.domain.live.timerRemainingMs
import com.munpro.app.ui.kit.Dot
import com.munpro.app.ui.kit.Hairline
import com.munpro.app.ui.kit.Inter
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.SystemColors
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.kit.rememberPress
import com.munpro.app.ui.kit.tap

/** The phase line in red, the big clock, and whatever describes it. */
@Composable
fun ClockBlock(session: LiveSession, bigClock: Long?, now: Long, fontSize: Float = 76f, content: @Composable () -> Unit = {}) {
    val c = palette
    Column(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Dot(c.red, 6.dp)
            Text(PHASE[session.phase] ?: session.phase, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = c.red)
        }
        if (bigClock != null) {
            Text(fmtClock(bigClock), style = Type.timer.copy(fontSize = fontSize.sp, lineHeight = (fontSize * 1.05f).sp), color = c.label)
        }
        // The mockup's caucus line: "6:48 of 10:00, 60 seconds per speaker".
        session.caucus?.let { cau ->
            val total = (cau.totalDurationSecs ?: 0) * 1000L
            val parts = listOfNotNull(
                if (total > 0) "${fmtClock(timerRemainingMs(cau.totalTimer, now))} of ${fmtClock(total)}" else null,
                if (cau.kind == "moderated" && (cau.perSpeakerSecs ?: 0) > 0) "${cau.perSpeakerSecs} seconds per speaker" else null,
            )
            if (parts.isNotEmpty()) Text(parts.joinToString(", "), style = Type.subhead, color = c.label2, textAlign = TextAlign.Center)
            if (cau.topic.isNotEmpty()) Text(cau.topic, style = Type.subhead, color = c.label2, textAlign = TextAlign.Center)
        }
        content()
    }
}

/** A thin progress bar for a speech. */
@Composable
fun SpeechBar(fraction: Float) {
    val c = palette
    Box(Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)).background(c.fillSoft)) {
        Box(Modifier.fillMaxWidth(fraction.coerceIn(0f, 1f)).fillMaxHeight().background(c.tint))
    }
}

@Composable
fun Stepper(label: String, value: Int, unit: String, step: Int, min: Int, onChange: (Int) -> Unit) {
    val c = palette
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(label, style = Type.bodyMedium, color = c.label, modifier = Modifier.weight(1f))
        Text("$value $unit", style = Type.bodyMedium, color = c.label)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            StepButton("−", "Less $label") { onChange(maxOf(min, value - step)) }
            StepButton("+", "More $label") { onChange(value + step) }
        }
    }
}

@Composable
private fun StepButton(text: String, label: String, onClick: () -> Unit) {
    val press = rememberPress()
    val pressed by press.pressed
    Box(
        Modifier.size(32.dp).alpha(if (pressed) 0.5f else 1f).clip(RoundedCornerShape(10.dp)).background(palette.fillSoft).tap(press, label = label, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(text, fontSize = 18.sp, fontWeight = FontWeight.Medium, color = palette.label) }
}

/** The published result: the outcome in words first, then the count (mockup "Result"). */
@Composable
fun ResultCard(r: PublishedVoteResult, myBallot: String? = null, myCountry: String? = null) {
    val c = palette
    val word = when (r.result) { "passed" -> "Passes"; "failed" -> "Fails"; "tied" -> "Tied"; "vetoed" -> "Vetoed"; else -> r.result }
    val noun = if (r.voteType == "substantive") "Resolution" else "Motion"
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(vertical = 18.dp, horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text("RESULT · PUBLISHED BY THE CHAIR", style = Type.caption.copy(fontSize = 11.sp, letterSpacing = 0.06.em), color = c.tint)
            Text("$noun ${word.lowercase()}", style = Type.title, color = if (r.result == "passed") c.tint else c.red, textAlign = TextAlign.Center)
            Text(r.motion, style = Type.footnote, color = c.label2, textAlign = TextAlign.Center)
        }
        Row(Modifier.fillMaxWidth().height(androidx.compose.foundation.layout.IntrinsicSize.Min), verticalAlignment = Alignment.CenterVertically) {
            listOf(Triple("For", r.affirmative ?: 0, c.tint), Triple("Against", r.negative ?: 0, c.red), Triple("Abstain", r.abstentions ?: 0, c.label)).forEachIndexed { i, (label, n, color) ->
                if (i > 0) Box(Modifier.width(Hairline).fillMaxHeight().background(c.separator))
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("$n", style = Type.title.copy(fontFeatureSettings = "tnum"), color = color)
                    Text(label, style = Type.footnote, color = c.label2)
                }
            }
        }
        if (r.result == "vetoed" && !r.vetoedByCountries.isNullOrEmpty()) {
            Text("Vetoed by ${r.vetoedByCountries.joinToString(", ") { countryName(it) }}.", style = Type.footnote, color = c.label2, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        }
        if (myBallot != null && myCountry != null) {
            val how = when (myBallot) { "yes" -> "voted for"; "no" -> "voted against"; else -> "abstained" }
            Text("${countryName(myCountry)} $how.", style = Type.footnote, color = c.label2, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        }
    }
}

