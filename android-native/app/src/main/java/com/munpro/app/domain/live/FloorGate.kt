package com.munpro.app.domain.live

// PORTED FROM src/lib/services/floorGate.ts — what the chair has opened, and therefore what each
// delegate may do RIGHT NOW. The single source of truth for delegate permission; the chair
// console reads it as a preview and firestore.rules mirror the critical subset.
// Also yieldClock.ts (the yield clock math) and sessionDate.ts (the session-day key).

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

object GateKind {
    const val LOCKED = "locked"
    const val ROLL_CALL = "roll_call"
    const val MOTIONS = "motions"
    const val SIGNUP = "signup"
    const val DEBATE = "debate"
    const val VOTING = "voting"
}

data class DelegateCapabilities(
    val canDeclareAttendance: Boolean,
    val canProposeMotion: Boolean,
    val proposableMotionTypes: List<String>,
    val canSecondMotion: Boolean,
    val canRaisePoint: Boolean,
    /** null = false; else "gsl" | "caucus" */
    val canJoinSignup: String?,
    val canCastBallot: Boolean,
    val canRequestFloor: Boolean,
    val expiresAt: Long?,
    val effectiveKind: String,
    val gateOverridden: Boolean,
    val legacy: Boolean,
    /** Keys: canDeclareAttendance, canProposeMotion, canSecondMotion, canRaisePoint, canJoinSignup, canCastBallot, canRequestFloor */
    val lockReason: Map<String, String>,
)

private val CAPABILITY_KEYS = listOf(
    "canDeclareAttendance", "canProposeMotion", "canSecondMotion",
    "canRaisePoint", "canJoinSignup", "canCastBallot", "canRequestFloor",
)

/** Every type a delegate may ever propose — the default set when a chair opens motions broadly. */
val ALL_DELEGATE_MOTION_TYPES: List<String> = MOTION_META.filter { it.value.delegateProposable }.keys.toList()

/** Why the speaker's own point tiles are shut. */
const val HOLDS_FLOOR_NO_POINT = "You have the floor — yield your time instead of raising a point."

/** Present enough to act on the floor. */
fun isSeated(status: String?): Boolean = status == "present" || status == "present_and_voting"

/** What the floor is ACTUALLY doing, or null when it is free. Outranks the authored gate. */
fun floorOccupancy(s: LiveSession): String? {
    if (s.activeVote != null) return GateKind.VOTING
    if (s.caucus?.currentSpeaker != null) return GateKind.DEBATE
    if (s.gsl?.activeSpeaker != null && !s.live?.stage?.firstOrNull().isNullOrEmpty()) return GateKind.DEBATE
    return null
}

/** WHO holds the floor right now — the slot. THE only answer to "who is speaking". */
fun floorHolder(s: LiveSession): SpeakerSlot? {
    if (s.activeVote != null) return null
    val c = s.caucus
    if (c != null) return if (c.kind == "moderated") c.currentSpeaker else null
    return s.gsl?.activeSpeaker
}

data class SpeechClock(val timer: TimerState?, val baseSecs: Int?, val path: TimerPath)

/** The clock the CURRENT speech runs on, whichever list it came from. */
fun floorSpeechClock(s: LiveSession): SpeechClock =
    if (s.caucus?.kind == "moderated") SpeechClock(s.caucus.speakerTimer, s.caucus.perSpeakerSecs, "caucus.speakerTimer")
    else SpeechClock(s.gsl?.timer, s.gsl?.defaultSpeakerSecs, "gsl.timer")

private fun noneAllowed(reason: String, effectiveKind: String, legacy: Boolean) = DelegateCapabilities(
    canDeclareAttendance = false, canProposeMotion = false, proposableMotionTypes = emptyList(),
    canSecondMotion = false, canRaisePoint = false, canJoinSignup = null, canCastBallot = false,
    canRequestFloor = false, expiresAt = null, effectiveKind = effectiveKind, gateOverridden = false,
    legacy = legacy, lockReason = CAPABILITY_KEYS.associateWith { reason },
)

private data class BallotCheck(val ok: Boolean, val reason: String? = null)

/** Mirrors the delegate self-ballot carve-out in firestore.rules line for line. */
private fun ballotOpen(vote: ActiveVote?, delegateId: String, status: String?, now: Long): BallotCheck {
    if (vote == null) return BallotCheck(false, "No vote is open.")
    if (vote.mode != "roll_call") return BallotCheck(false, "The chair is taking this vote by a show of hands.")
    if (!isSeated(status)) return BallotCheck(false, "Only delegates marked present may vote.")
    // JS truthiness: an empty-string ballot is not a cast ballot.
    if (!vote.ballots?.get(delegateId).isNullOrEmpty()) return BallotCheck(false, "You have already cast your ballot.")
    val t = vote.timer
    if (t != null && t.running && t.endsAt != null && now >= t.endsAt) return BallotCheck(false, "Voting has closed.")
    return BallotCheck(true)
}

/** What may `delegateId` do right now? */
fun capabilitiesFor(session: LiveSession, delegateId: String, now: Long = System.currentTimeMillis()): DelegateCapabilities {
    // 1. A closed or suspended committee outranks any gate left standing on the document.
    if (session.finalized || session.phase == Phase.CLOSED) return noneAllowed("This committee has adjourned.", GateKind.LOCKED, session.floorGate == null)
    if (session.phase == Phase.SUSPENDED) {
        return noneAllowed("The session is suspended. Everything reopens when the chair resumes.", GateKind.LOCKED, session.floorGate == null)
    }
    val status = session.attendance[delegateId]?.status

    // 2. Sessions predating floorGate keep today's behaviour exactly.
    val gate = session.floorGate ?: return legacyCapabilities(session, delegateId, status, now)

    val expired = gate.endsAt != null && now >= gate.endsAt
    val occupancy = floorOccupancy(session)
    val kind = occupancy ?: if (expired) GateKind.LOCKED else gate.kind
    val seated = isSeated(status)

    val lockReason = mutableMapOf<String, String>()
    val notSeated = "You are not marked present. Ask the chair to seat you."
    val closedCopy = if (expired) "That window has closed." else "The chair has not opened the floor for this."

    // 3. Roll call — one delegate, one answer.
    val declared = status == "present" || status == "present_and_voting"
    val canDeclareAttendance = kind == GateKind.ROLL_CALL && !declared
    if (!canDeclareAttendance && !declared) lockReason["canDeclareAttendance"] = if (expired) "Roll call has closed." else "Roll call is not open."

    // 4. Motions — restricted to the exact set the chair ticked.
    val gateTypes = if (kind == GateKind.MOTIONS) gate.motionTypes.orEmpty() else emptyList()
    val canProposeMotion = kind == GateKind.MOTIONS && seated && gateTypes.isNotEmpty()
    if (!canProposeMotion) {
        lockReason["canProposeMotion"] = when {
            kind != GateKind.MOTIONS -> when (kind) {
                GateKind.DEBATE -> "Motions are out of order while a delegate holds the floor."
                GateKind.VOTING -> "Motions reopen once the chair records the result."
                else -> closedCopy
            }
            !seated -> notSeated
            else -> "The chair has opened the floor for no motion types."
        }
    }

    // 5. Seconding rides the motions gate.
    val canSecondMotion = kind == GateKind.MOTIONS && seated
    if (!canSecondMotion) lockReason["canSecondMotion"] = if (kind != GateKind.MOTIONS) closedCopy else notSeated

    // 6. Points — a speech always keeps them open, except for the speaker themselves.
    val pointsAllowed = if (occupancy == GateKind.DEBATE) true else gate.allowsPoints
    val iHoldTheFloor = holdsTheFloor(session, delegateId)
    val canRaisePoint = pointsAllowed && seated && kind != GateKind.LOCKED && !iHoldTheFloor
    if (!canRaisePoint) {
        lockReason["canRaisePoint"] = when {
            iHoldTheFloor -> HOLDS_FLOOR_NO_POINT
            !pointsAllowed || kind == GateKind.LOCKED -> "The chair has closed the floor to points."
            else -> notSeated
        }
    }

    // 7. Signup.
    val canJoinSignup = if (kind == GateKind.SIGNUP && seated) gate.signupFor ?: "gsl" else null
    if (canJoinSignup == null) lockReason["canJoinSignup"] = if (kind != GateKind.SIGNUP) closedCopy else notSeated

    // 8. Ballots — gate-independent.
    val ballot = ballotOpen(session.activeVote, delegateId, status, now)
    if (!ballot.ok) lockReason["canCastBallot"] = ballot.reason.orEmpty()

    // 9. Asking for the camera.
    val canRequestFloor = seated && kind != GateKind.LOCKED && kind != GateKind.VOTING
    if (!canRequestFloor) lockReason["canRequestFloor"] = if (!seated) notSeated else if (kind == GateKind.VOTING) "A vote is running." else closedCopy

    return DelegateCapabilities(
        canDeclareAttendance = canDeclareAttendance,
        canProposeMotion = canProposeMotion,
        proposableMotionTypes = if (canProposeMotion) gateTypes else emptyList(),
        canSecondMotion = canSecondMotion,
        canRaisePoint = canRaisePoint,
        canJoinSignup = canJoinSignup,
        canCastBallot = ballot.ok,
        canRequestFloor = canRequestFloor,
        expiresAt = if (occupancy != null || expired) null else gate.endsAt,
        effectiveKind = kind,
        gateOverridden = occupancy != null,
        legacy = false,
        lockReason = lockReason,
    )
}

/** Pre-floorGate sessions: today's behaviour, motions gated by motionsInOrder. */
private fun legacyCapabilities(session: LiveSession, delegateId: String, status: String?, now: Long): DelegateCapabilities {
    val seated = isSeated(status)
    val floor = motionsInOrder(session, now)
    val lockReason = mutableMapOf<String, String>()
    val notSeated = "You are not marked present. Ask the chair to seat you."
    lockReason["canDeclareAttendance"] = "The chair takes the roll for this session."

    val canProposeMotion = floor.inOrder && seated
    if (!canProposeMotion) lockReason["canProposeMotion"] = if (floor.inOrder) notSeated else floor.detail

    val iHoldTheFloor = holdsTheFloor(session, delegateId)
    val canRaisePoint = seated && !iHoldTheFloor
    if (!canRaisePoint) lockReason["canRaisePoint"] = if (iHoldTheFloor) HOLDS_FLOOR_NO_POINT else notSeated

    val signupOpen = legacyCaucusSignupOpen(session.caucus, now)
    val canJoinSignup = if (signupOpen && seated) "caucus" else null
    if (canJoinSignup == null) lockReason["canJoinSignup"] = if (signupOpen) notSeated else "No speakers list is open for signup."

    val ballot = ballotOpen(session.activeVote, delegateId, status, now)
    if (!ballot.ok) lockReason["canCastBallot"] = ballot.reason.orEmpty()

    val canRequestFloor = seated
    if (!canRequestFloor) lockReason["canRequestFloor"] = notSeated

    val canSecondMotion = canProposeMotion
    if (!canSecondMotion) lockReason["canSecondMotion"] = lockReason["canProposeMotion"].orEmpty()

    return DelegateCapabilities(
        canDeclareAttendance = false,
        canProposeMotion = canProposeMotion,
        proposableMotionTypes = if (canProposeMotion) ALL_DELEGATE_MOTION_TYPES else emptyList(),
        canSecondMotion = canSecondMotion,
        canRaisePoint = canRaisePoint,
        canJoinSignup = canJoinSignup,
        canCastBallot = ballot.ok,
        canRequestFloor = canRequestFloor,
        expiresAt = if (signupOpen) session.caucus?.signupEndsAt else null,
        effectiveKind = legacyKind(session, floor.inOrder),
        gateOverridden = false,
        legacy = true,
        lockReason = lockReason,
    )
}

private fun legacyCaucusSignupOpen(caucus: CaucusState?, now: Long): Boolean {
    if (caucus == null || caucus.kind != "moderated") return false
    val ends = caucus.signupEndsAt ?: return false
    return now < ends
}

private fun legacyKind(session: LiveSession, motionsOpen: Boolean): String = when {
    session.activeVote != null -> GateKind.VOTING
    legacyCaucusSignupOpen(session.caucus, System.currentTimeMillis()) -> GateKind.SIGNUP
    session.caucus?.currentSpeaker != null || session.gsl?.activeSpeaker != null -> GateKind.DEBATE
    motionsOpen -> GateKind.MOTIONS
    else -> GateKind.LOCKED
}

/** Default copy for a gate with no chair-authored `label`. */
/**
 * The floor line the dais and watchers read: what is happening on the floor outranks the window
 * the chair opened (a chair's label is dropped then), and a lapsed window is a closed floor.
 * Returns the effective kind and its headline.
 */
fun floorLine(s: LiveSession, now: Long): Pair<String, String> {
    val gate = s.floorGate
    val occupied = floorOccupancy(s)
    val kind = occupied ?: if (gate?.endsAt != null && now >= gate.endsAt) "locked" else gate?.kind ?: "locked"
    return kind to gateHeadline(if (occupied != null && gate != null) gate.copy(label = null) else gate, kind)
}

fun gateHeadline(gate: FloorGate?, kind: String): String {
    if (!gate?.label.isNullOrEmpty()) return gate!!.label!!
    return when (kind) {
        GateKind.ROLL_CALL -> "Roll call is open"
        GateKind.MOTIONS -> "The floor is open for motions"
        GateKind.SIGNUP -> if (gate?.signupFor == "caucus") "Caucus speakers list is open" else "Speakers list is open"
        GateKind.DEBATE -> "A delegate has the floor"
        GateKind.VOTING -> "A vote is running"
        else -> "The floor is closed"
    }
}

/** Does this delegate hold the floor RIGHT NOW? The gate on every yield surface. */
fun holdsTheFloor(s: LiveSession, delegateId: String): Boolean = delegateId.isNotEmpty() && floorHolder(s)?.delegateId == delegateId

/** Phases that mean the committee is not sitting. */
fun isSittingPhase(phase: String): Boolean = phase != Phase.CLOSED && phase != Phase.SUSPENDED && phase != Phase.LOBBY

// ── yieldClock.ts ───────────────────────────────────────────────────────────────

/** The fallback every GSL reader uses when a session predates gsl.defaultSpeakerSecs. */
const val DEFAULT_SPEAKER_SECS = 90

/** The recipient's full clock: base allotment + carried remainder. Garbage carry → no carry. */
fun yieldGrantMs(defaultSpeakerSecs: Int?, carriedMs: Long): Long {
    val secs = if (defaultSpeakerSecs != null && defaultSpeakerSecs > 0) defaultSpeakerSecs else DEFAULT_SPEAKER_SECS
    val carried = if (carriedMs > 0) carriedMs else 0
    return secs * 1000L + carried
}

// ── sessionDate.ts ──────────────────────────────────────────────────────────────

/**
 * `YYYY-MM-DD` for `now` as seen in the EVENT's timezone (an IANA name). Every participant must
 * agree on the day or they resolve different session documents. Falls back to the device's date.
 */
fun sessionDateStr(timeZone: String?, now: Long = System.currentTimeMillis()): String {
    val zone = timeZone?.takeIf { it.isNotBlank() }?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: ZoneId.systemDefault()
    return LocalDate.ofInstant(Instant.ofEpochMilli(now), zone).toString()
}
