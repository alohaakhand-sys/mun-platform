package com.munpro.app.domain.live

// What the lock screen says during a sitting (mockup "Lock screen": "Security Council · Live /
// Algeria 0:42 / You speak 3rd, in about 2 minutes"). Pure, so the words are tested; the
// notification that shows them is ui/live/FloorService.kt.

import com.munpro.app.domain.countryName
import com.munpro.app.domain.fmtClock

/** The phase line the live screens print in red. */
val PHASE = mapOf(
    "lobby" to "Before the sitting", "roll_call" to "Roll call", "gsl" to "General speakers list",
    "mod_caucus" to "Moderated caucus", "unmod_caucus" to "Unmoderated caucus", "voting" to "Voting procedure",
    "suspended" to "Suspended", "closed" to "Adjourned",
)

/** The list the floor is taking speakers from: the moderated caucus's while one runs, else the GSL. */
fun floorQueue(s: LiveSession): List<SpeakerSlot> =
    (if (s.caucus?.kind == "moderated") s.caucus.queue else s.gsl?.queue).orEmpty()

/**
 * The mockup's turn estimate for the speaker at [index] in [floorQueue]: the speech now running,
 * then one allotment per speaker ahead.
 */
fun turnEtaMs(s: LiveSession, index: Int, now: Long): Long {
    val perSpeaker = ((if (s.caucus?.kind == "moderated") s.caucus.perSpeakerSecs else s.gsl?.defaultSpeakerSecs) ?: 90) * 1000L
    val running = if (floorHolder(s) != null) timerRemainingMs(floorSpeechClock(s).timer, now) else 0
    return running + index * perSpeaker
}

data class FloorNotice(
    val title: String,
    val text: String,
    /** When the running speech ends. The notification counts down to it by itself; null while paused. */
    val countdownTo: Long?,
)

/** null once the sitting is over, so the notice goes away with it. */
fun floorNotice(s: LiveSession, me: String, now: Long): FloorNotice? {
    if (s.finalized || s.phase == Phase.CLOSED) return null
    val phase = PHASE[s.phase] ?: s.phase
    val holder = floorHolder(s)
    val timer = floorSpeechClock(s).timer
    val left = timerRemainingMs(timer, now)
    val endsAt = timer?.endsAt
    val countdown = if (holder != null && timer?.running == true && endsAt != null && left > 0) endsAt else null
    val mine = holder != null && holder.delegateId == me
    val who = when {
        holder == null -> null
        mine -> "You have the floor"
        else -> countryName(holder.country)
    }
    // Running: the system clock counts down beside the title. Paused: the time left is in it.
    val title = when {
        who == null -> phase
        countdown != null -> who
        else -> "$who ${fmtClock(left)}"
    }

    val vote = s.activeVote
    val index = floorQueue(s).indexOfFirst { it.delegateId == me }
    val text = when {
        vote != null -> if (vote.ballots?.get(me) != null) "You voted on ${vote.motion}" else "Vote open on ${vote.motion}"
        mine -> if (countdown != null) "Your time is running" else "Waiting for the chair to start your time"
        index >= 0 -> {
            val mins = maxOf(1L, Math.round(turnEtaMs(s, index, now) / 60_000.0))
            val turn = if (index == 0) "You speak next" else "You speak ${ordinal(index + 1)}"
            "$turn, in about $mins ${if (mins == 1L) "minute" else "minutes"}"
        }
        who != null -> phase
        else -> ""
    }
    return FloorNotice(title, text, countdown)
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
fun ordinal(n: Int): String {
    val suffix = if (n % 100 in 11..13) "th" else when (n % 10) { 1 -> "st"; 2 -> "nd"; 3 -> "rd"; else -> "th" }
    return "$n$suffix"
}

/**
 * Who a video tile is: a delegation by its country (from the roll), a dais member by role, else
 * "Participant". [uid] is the Agora user account, which is the Firebase uid.
 */
fun stageLabel(s: LiveSession, uid: String): String {
    s.attendance[uid]?.country?.takeIf { it.isNotEmpty() }?.let { return countryName(it) }
    s.staff?.get(uid)?.let { st -> return st.role.ifEmpty { "Dais" }.replaceFirstChar { it.uppercase() }.replace("-", " ") }
    return "Participant"
}

/** Whose video the stage should feature: the floor holder, else whoever the chair put on air. */
fun stageFocus(s: LiveSession): String? = floorHolder(s)?.delegateId ?: s.live?.stage?.firstOrNull()

/** The video is off for everyone: the sitting closed or was finalized, or the chair ended the call. */
fun videoEnded(s: LiveSession?): Boolean = s == null || s.phase == Phase.CLOSED || s.finalized || s.live?.callEnded == true
