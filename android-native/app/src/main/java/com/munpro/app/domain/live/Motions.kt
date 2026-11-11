package com.munpro.app.domain.live

// PORTED FROM src/lib/services/motionMootness.ts and src/lib/services/motionFloor.ts.
// Pure: is a motion in order right now, which motions an execution makes pointless, and the
// "one live motion of a type per delegation" rule. See the web files for the long reasoning;
// the precedence chains here are line-for-line the same and the ORDER is load-bearing.

import com.munpro.app.domain.getCountryName

// ── motionMootness.ts ───────────────────────────────────────────────────────────

val AUTO_FALLABLE: Set<String> = setOf("pending", "recognized")
val LIVE_MOTION_STATUSES: Set<String> = setOf("pending", "recognized", "voting", "passed")

data class MootRuling(val code: String, val reason: String)
data class MootFall(val motion: Motion, val ruling: MootRuling)

private fun quoted(s: String) = "“$s”"
private fun norm(s: String?): String = s.orEmpty().trim().lowercase()

private val SUPERSEDES: Map<String, List<String>> = mapOf(
    "set_agenda" to listOf("set_agenda"),
    "open_gsl" to listOf("open_gsl"),
    "mod_caucus" to listOf("mod_caucus", "unmod_caucus", "extend_caucus"),
    "unmod_caucus" to listOf("mod_caucus", "unmod_caucus", "extend_caucus"),
    "extend_caucus" to listOf("extend_caucus"),
    "move_to_voting" to listOf("move_to_voting"),
    "suspend" to listOf("suspend"),
    "introduce_document" to listOf("introduce_document"),
)

private fun supersessionReason(executed: Motion, victim: Motion): MootRuling {
    val p = executed.params
    return when (executed.type) {
        "set_agenda" -> MootRuling("agenda_superseded", if (!p.topic.isNullOrEmpty()) "Overtaken — the agenda was set to ${quoted(p.topic)}." else "Overtaken — the agenda was set.")
        "open_gsl" -> MootRuling("gsl_superseded", "Overtaken — the Speakers List was opened.")
        "mod_caucus", "unmod_caucus" -> {
            val kind = if (executed.type == "mod_caucus") "moderated" else "unmoderated"
            val on = if (!p.topic.isNullOrEmpty()) " on ${quoted(p.topic)}" else ""
            if (victim.type == "extend_caucus") MootRuling("caucus_superseded", "Overtaken — a new $kind caucus$on replaced the one this would have extended.")
            else MootRuling("caucus_superseded", "Overtaken — a $kind caucus$on was adopted.")
        }
        "extend_caucus" -> MootRuling("extension_superseded", "Overtaken — the caucus was already extended.")
        "move_to_voting" -> MootRuling("voting_superseded", "Overtaken — the committee moved into voting procedure.")
        "suspend" -> MootRuling("suspend_superseded", "Overtaken — the session was suspended.")
        "introduce_document" -> MootRuling("introduce_superseded", "Overtaken — that paper has already been introduced.")
        else -> MootRuling("agenda_superseded", "Overtaken by a motion the committee adopted.")
    }
}

/** The motions an execution just answered for the room — fallen in the same batch. */
fun supersededByExecution(executed: Motion, queue: List<Motion>): List<MootFall> {
    val live = queue.filter { it.id.isNotEmpty() && it.id != executed.id && it.status in AUTO_FALLABLE }
    if (live.isEmpty()) return emptyList()
    if (executed.type == "adjourn") {
        return live.map { MootFall(it, MootRuling("adjourned_first", "The session adjourned before this was taken up.")) }
    }
    val kills = SUPERSEDES[executed.type] ?: return emptyList()
    if (executed.type == "introduce_document") {
        val docId = executed.params.documentId?.ifEmpty { null } ?: return emptyList() // TS `if (!docId)`: "" too
        return live.filter { it.type == "introduce_document" && it.params.documentId == docId }.map { MootFall(it, supersessionReason(executed, it)) }
    }
    return live.filter { it.type in kills }.map { MootFall(it, supersessionReason(executed, it)) }
}

fun gslIsOpen(gsl: GslState?, queue: List<Motion>): Boolean {
    if (queue.any { it.type == "open_gsl" && it.status == "executed" }) return true
    return (gsl?.queue.orEmpty()).isNotEmpty() || gsl?.activeSpeaker != null
}

fun gslSpokenThrough(gsl: GslState?): Boolean = (gsl?.spoken ?: 0) > 0 && gsl?.queue.orEmpty().isEmpty() && gsl?.activeSpeaker == null

const val OUT_OF_ORDER_WORD = "out of order"

fun isAutoResolved(m: Motion): Boolean = m.autoResolved == true

fun motionOutcomeWord(m: Motion): String = when {
    isAutoResolved(m) && m.status == "dropped" -> OUT_OF_ORDER_WORD
    m.status == "dropped" -> "dismissed"
    else -> m.status
}

// ── motionFloor.ts ──────────────────────────────────────────────────────────────

/** Said once, in one place, so every out-of-order surface uses the same words. */
const val POINTS_STILL_OPEN = "Points of order and personal privilege can still be raised at any time."

data class MotionInviteState(val active: Boolean, val inviteId: String?, val endsInMs: Long, val windowSecs: Int?)

fun motionInviteState(s: LiveSession, now: Long = System.currentTimeMillis()): MotionInviteState {
    val inv = s.motionInvite
    if (inv?.endsAt == null) return MotionInviteState(false, null, 0, null)
    val endsInMs = inv.endsAt - now
    return MotionInviteState(endsInMs > 0, inv.inviteId.ifEmpty { null }, maxOf(0, endsInMs), inv.windowSecs)
}

/**
 * inOrder + code ("open" | "invited" | "gsl_speaker" | "floor_granted" | "caucus_speaker" |
 * "vote_open" | "session_suspended" | "session_closed"), plus copy for the blocked cases.
 */
data class MotionFloorStatus(
    val inOrder: Boolean,
    val code: String,
    val title: String = "",
    val detail: String = "",
    val inviteId: String? = null,
    val endsInMs: Long = 0,
    val note: String = "",
)

private fun blocked(code: String, title: String, detail: String) = MotionFloorStatus(false, code, title, detail)

private fun speakerName(country: String?): String = if (country.isNullOrEmpty()) "A delegate" else getCountryName(country).ifEmpty { country }

/** Precedence chain — FIRST MATCH WINS. */
fun motionsInOrder(s: LiveSession, now: Long = System.currentTimeMillis()): MotionFloorStatus {
    if (s.finalized || s.phase == Phase.CLOSED) return blocked("session_closed", "The session is closed", "This committee has adjourned.")
    if (s.phase == Phase.SUSPENDED) {
        return blocked("session_suspended", "The session is suspended", "Motions reopen when the chair resumes the session. $POINTS_STILL_OPEN")
    }
    if (s.activeVote != null) {
        return blocked("vote_open", "Motions are closed during a vote", "A vote is open — cast your ballot. Motions reopen once the chair records the result. $POINTS_STILL_OPEN")
    }
    val caucus = s.caucus
    val stageHolder = s.live?.stage?.firstOrNull()
    if (caucus != null) {
        if (caucus.kind == "unmoderated") return inviteOrOpen(s, now)
        val cs = caucus.currentSpeaker
        if (cs != null) {
            return blocked("caucus_speaker", "Motions are closed while a delegate is speaking",
                "${speakerName(cs.country)} has the floor in the caucus. Motions are out of order until the speech ends. $POINTS_STILL_OPEN")
        }
        return inviteOrOpen(s, now)
    }
    // Outside a caucus, THE MIC IS THE FLOOR.
    if (!stageHolder.isNullOrEmpty()) {
        val active = s.gsl?.activeSpeaker
        if (active != null) {
            return blocked("gsl_speaker", "Motions are closed while a delegate is speaking",
                "${speakerName(active.country)} has the floor. Motions are out of order until the speech ends. $POINTS_STILL_OPEN")
        }
        val country = s.attendance[stageHolder]?.country
        return blocked("floor_granted", "Motions are closed while a delegate is speaking",
            "${speakerName(country)} has the floor. Motions are out of order until they finish. $POINTS_STILL_OPEN")
    }
    return inviteOrOpen(s, now)
}

private fun inviteOrOpen(s: LiveSession, now: Long): MotionFloorStatus {
    val inv = motionInviteState(s, now)
    if (inv.active && inv.inviteId != null) {
        return MotionFloorStatus(true, "invited", inviteId = inv.inviteId, endsInMs = inv.endsInMs, note = s.motionInvite?.note.orEmpty())
    }
    return MotionFloorStatus(true, "open")
}

fun isLiveMotion(m: Motion): Boolean = m.status in LIVE_MOTION_STATUSES

/** The delegation's own live motion of this type, or null. `mine` is subscribeMyMotions' list. */
fun myLiveMotion(mine: List<Motion>, type: String): Motion? = mine.firstOrNull { it.type == type && isLiveMotion(it) }

/** Said once, so the form, the button and the service rejection all use the same words. */
fun duplicateMotionNote(m: Motion): String {
    val label = MOTION_META[m.type]?.label ?: m.type
    val where = when (m.status) {
        "voting" -> "The committee is voting on it."
        "passed" -> "It carried — the chair is about to execute it."
        "recognized" -> "The chair has recognized it."
        else -> "It is with the chair."
    }
    return "You have already moved to ${label.lowercase()}. $where"
}

// ── proposableMotions.ts ────────────────────────────────────────────────────────

/** Display order (mirrors MOTION_META ranks). This array is the SOURCE. */
val PROPOSABLE_MOTIONS: List<String> = listOf(
    "mod_caucus", "unmod_caucus", "extend_caucus", "move_to_voting",
    "introduce_document", "set_agenda", "open_gsl", "suspend", "adjourn", "custom",
).filter { MOTION_META[it]?.delegateProposable == true }

fun motionNeedsTotal(t: String) = t in listOf("mod_caucus", "unmod_caucus", "extend_caucus")

/** open_gsl included: executeMotion feeds params.perSpeakerSecs → setGslDefaultSecs. */
fun motionNeedsPerSpeaker(t: String) = t == "mod_caucus" || t == "open_gsl"

fun motionNeedsTopic(t: String) = t in listOf("mod_caucus", "set_agenda", "introduce_document", "move_to_voting", "custom")

/** A delegation may have at most this many motions pending at once (soft anti-spam). */
const val MOTION_PENDING_LIMIT = 3
