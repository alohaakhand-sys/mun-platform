package com.munpro.app.ui.chair

// The committee console for someone who belongs in the room without running it: a staff
// observer, a faculty advisor, an Executive Board member outside their scope. The web's
// WatchConsole (components/session/WatchConsole.tsx) shows them the board and the video with no
// controls; this is the board half. Read-only by construction: nothing here writes.

import com.munpro.app.ui.kit.Flag
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.munpro.app.domain.countryName
import com.munpro.app.domain.flagEmoji
import com.munpro.app.domain.fmtClock
import com.munpro.app.domain.live.LiveSession
import com.munpro.app.domain.live.eligibleVoterCount
import com.munpro.app.domain.live.floorHolder
import com.munpro.app.domain.live.floorLine
import com.munpro.app.domain.live.floorQueue
import com.munpro.app.domain.live.floorSpeechClock
import com.munpro.app.domain.live.stageFocus
import com.munpro.app.domain.live.stageLabel
import com.munpro.app.domain.live.timerRemainingMs
import com.munpro.app.ui.kit.Emoji
import com.munpro.app.ui.kit.Inter
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.live.ClockBlock
import com.munpro.app.ui.live.ResultCard
import com.munpro.app.ui.live.SpeechBar
import com.munpro.app.ui.live.video.LiveVideo
import com.munpro.app.ui.live.video.VideoStage

@Composable
fun WatchBoard(
    session: LiveSession, now: Long, roleLabel: String,
    video: LiveVideo? = null, me: String = "", presence: List<com.munpro.app.ui.live.PresenceEvent> = emptyList(),
) {
    val c = palette
    val holder = floorHolder(session)
    val speech = floorSpeechClock(session)
    val speechLeft = timerRemainingMs(speech.timer, now)
    val caucus = session.caucus
    val bigClock = if (caucus != null) timerRemainingMs(caucus.totalTimer, now) else if (holder != null) speechLeft else null
    val queue = floorQueue(session)

    val gateLine = floorLine(session, now).second

    ClockBlock(session, bigClock, now, fontSize = 60f) {
        Text(gateLine, style = Type.headline, color = c.label, textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = if (bigClock != null) 4.dp else 18.dp))
    }
    video?.let { v -> VideoStage(v, stageFocus(session), me, label = { u -> stageLabel(session, u) }, presence = presence) }

    if (holder != null) {
        Section(header = "Speaking") {
            item {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Flag(holder.country, 24f)
                        Text(countryName(holder.country), style = Type.headline, color = c.label, modifier = Modifier.weight(1f))
                        Text(fmtClock(speechLeft), fontFamily = Inter, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, color = c.label, style = Type.body.copy(fontFeatureSettings = "tnum"))
                    }
                    SpeechBar(speech.timer?.durationMs?.takeIf { it > 0 }?.let { speechLeft.toFloat() / it } ?: 0f)
                }
            }
        }
    }

    if (queue.isNotEmpty()) {
        Section(header = if (caucus != null) "Caucus speakers" else "Speakers list") {
            queue.forEachIndexed { i, q ->
                cell(countryName(q.country), inset = 52.dp, chevron = false, value = if (i == 0) "Next" else null, leading = { Flag(q.country, 20f) })
            }
        }
    }

    val vote = session.activeVote
    if (vote != null) {
        // Tallies stay with the dais until the chair publishes (voting privacy): progress only.
        Section(header = "Vote open") {
            cell(vote.motion.ifEmpty { "Vote" }, subtitle = "${vote.ballots.orEmpty().size} of ${eligibleVoterCount(session.attendance)} voting", chevron = false)
        }
    } else {
        session.publishedResult?.let { ResultCard(it) }
    }

}

/** The watch-only dock (board 10): in place of Raise Placard, a standing "Watching" banner. */
@Composable
fun WatchingBanner(session: LiveSession, roleLabel: String) {
    val present = session.attendance.values.count { it.status == "present" || it.status == "present_and_voting" }
    com.munpro.app.ui.kit.Notice(
        "Watching as $roleLabel", "You follow the sitting without taking part · $present present",
        tone = com.munpro.app.ui.kit.Tone.Info, icon = com.munpro.app.ui.kit.Icons.eye,
    )
}
