package com.munpro.app.domain.live

// PORTED FROM src/lib/services/sessionService.ts (types + pure helpers) and motionMeta.ts.
// Same names, same order. Firestore timestamps arrive as epoch millis (data/Json.kt), so every
// `createdAt?.seconds` comparison in the TypeScript reads `createdAt / 1000` here.
//
// Identity rules (from the web file's header): committeeId is the committee NAME; attendance,
// ballots and participation are keyed by delegateId (a Firebase uid), never by country.
//
// String-typed enums (phase, status, kind…) on purpose: the documents are written by the web, and
// a value the app doesn't know must survive a read instead of failing the whole session.

import com.munpro.app.data.LenientInt
import com.munpro.app.data.LenientMillis
import kotlinx.serialization.Serializable

object Phase {
    const val LOBBY = "lobby"
    const val ROLL_CALL = "roll_call"
    const val GSL = "gsl"
    const val MOD_CAUCUS = "mod_caucus"
    const val UNMOD_CAUCUS = "unmod_caucus"
    const val VOTING = "voting"
    const val SUSPENDED = "suspended"
    const val CLOSED = "closed"
}

/** "present" | "present_and_voting" | "absent" | "late" */
typealias AttendanceStatus = String

@Serializable
data class TimerState(
    val running: Boolean = false,
    /** epoch ms deadline while running */
    @Serializable(with = LenientMillis::class) val endsAt: Long? = null,
    /** ms left while paused / before first start */
    @Serializable(with = LenientMillis::class) val pausedRemainingMs: Long? = null,
    @Serializable(with = LenientMillis::class) val durationMs: Long? = 0,
)

@Serializable
data class AttendanceEntry(
    val status: AttendanceStatus = "absent",
    val country: String = "",
    val delegateId: String = "",
    val applicationId: String = "",
)

/** "none" | "delegate" | "questions" | "comments" */
typealias YieldKind = String

@Serializable
data class SpeakerSlot(
    val delegateId: String = "",
    val country: String = "",
    val applicationId: String = "",
    val yieldTo: YieldKind? = null,
    val yieldTargetCountry: String? = null,
    /** received the floor by a yield — may not yield again */
    val viaYield: Boolean? = null,
    val proxyBy: String? = null,
    val proxyByName: String? = null,
    val yieldProxyBy: String? = null,
    val yieldProxyByName: String? = null,
)

@Serializable
data class GslState(
    @Serializable(with = LenientInt::class) val defaultSpeakerSecs: Int? = null,
    val queue: List<SpeakerSlot> = emptyList(),
    val activeSpeaker: SpeakerSlot? = null,
    val timer: TimerState? = null,
    @Serializable(with = LenientInt::class) val spoken: Int? = null,
)

@Serializable
data class CaucusState(
    val caucusId: String = "",
    /** "moderated" | "unmoderated" */
    val kind: String = "",
    val topic: String = "",
    @Serializable(with = LenientInt::class) val totalDurationSecs: Int? = 0,
    @Serializable(with = LenientInt::class) val perSpeakerSecs: Int? = 0,
    @Serializable(with = LenientInt::class) val signupWindowSecs: Int? = null,
    @Serializable(with = LenientMillis::class) val signupEndsAt: Long? = null,
    val totalTimer: TimerState? = null,
    val speakerTimer: TimerState? = null,
    val currentCountry: String? = null,
    val currentSpeaker: SpeakerSlot? = null,
    val queue: List<SpeakerSlot>? = null,
    /** "collecting" | "seated" — read through caucusListState() */
    val listState: String? = null,
)

/** "yes" | "no" | "abstain" */
typealias Ballot = String

@Serializable
data class Tally(
    @Serializable(with = LenientInt::class) val yes: Int? = 0,
    @Serializable(with = LenientInt::class) val no: Int? = 0,
    @Serializable(with = LenientInt::class) val abstain: Int? = 0,
)

@Serializable
data class BallotProxy(val by: String = "", val byName: String = "")

@Serializable
data class BallotChange(
    val delegateId: String = "",
    val from: Ballot = "",
    @Serializable(with = LenientMillis::class) val at: Long? = null,
    val by: String = "",
    val wasProxy: Boolean? = null,
    val requestId: String? = null,
)

@Serializable
data class ActiveVote(
    val voteId: String = "",
    val motion: String = "",
    val motionId: String? = null,
    /** "procedural" | "substantive" */
    val voteType: String = "procedural",
    /** "simple_majority" | "two_thirds" | "consensus" */
    val threshold: String = "simple_majority",
    @Serializable(with = LenientInt::class) val minAffirmative: Int? = null,
    val scMode: Boolean = false,
    val p5: List<String> = emptyList(),
    val allowAbstain: Boolean = true,
    @Serializable(with = LenientInt::class) val round: Int? = 1,
    val divisionOfQuestion: Boolean = false,
    /** "tally" | "roll_call" */
    val mode: String = "roll_call",
    val tally: Tally? = null,
    val ballots: Map<String, Ballot>? = null,
    val ballotProxies: Map<String, BallotProxy>? = null,
    val ballotChanges: List<BallotChange>? = null,
    val timer: TimerState? = null,
    @Serializable(with = LenientInt::class) val eligibleCount: Int? = 0,
    val startedBy: String = "",
)

@Serializable
data class PublishedVoteResult(
    val voteId: String = "",
    val motion: String = "",
    /** "passed" | "failed" | "tied" | "vetoed" */
    val result: String = "",
    @Serializable(with = LenientInt::class) val affirmative: Int? = 0,
    @Serializable(with = LenientInt::class) val negative: Int? = 0,
    @Serializable(with = LenientInt::class) val abstentions: Int? = 0,
    val vetoedBy: List<String>? = null,
    val vetoedByCountries: List<String>? = null,
    @Serializable(with = LenientInt::class) val eligibleCount: Int? = 0,
    val voteType: String = "",
    val threshold: String = "",
    val scMode: Boolean = false,
    val mode: String = "",
)

@Serializable
data class LiveStageState(
    val stage: List<String> = emptyList(),
    @Serializable(with = LenientMillis::class) val keepAliveAt: Long? = null,
    val callEnded: Boolean? = null,
)

@Serializable
data class MotionInvite(
    val inviteId: String = "",
    @Serializable(with = LenientMillis::class) val endsAt: Long? = null,
    @Serializable(with = LenientInt::class) val windowSecs: Int? = null,
    val openedBy: String = "",
    val note: String? = null,
)

@Serializable
data class FloorGate(
    /** "locked" | "roll_call" | "motions" | "signup" | "debate" | "voting" */
    val kind: String = "locked",
    val motionTypes: List<String>? = null,
    /** "gsl" | "caucus" */
    val signupFor: String? = null,
    val signupId: String? = null,
    val allowsPoints: Boolean = false,
    @Serializable(with = LenientMillis::class) val endsAt: Long? = null,
    @Serializable(with = LenientInt::class) val windowSecs: Int? = null,
    val label: String? = null,
    val openedBy: String = "",
)

@Serializable
data class AgendaItem(
    val id: String = "",
    val title: String = "",
    val status: String = "pending",
    @Serializable(with = LenientMillis::class) val startedAt: Long? = null,
    @Serializable(with = LenientMillis::class) val completedAt: Long? = null,
)

@Serializable
data class SessionAgenda(
    val items: List<AgendaItem> = emptyList(),
    @Serializable(with = LenientInt::class) val activeIndex: Int? = -1,
    val source: String? = null,
)

@Serializable
data class SessionClock(
    @Serializable(with = LenientMillis::class) val startedAt: Long? = null,
    @Serializable(with = LenientMillis::class) val accumulatedMs: Long? = 0,
    @Serializable(with = LenientMillis::class) val suspendedAt: Long? = null,
)

@Serializable
data class RollCallState(
    @Serializable(with = LenientMillis::class) val startedAt: Long? = null,
    @Serializable(with = LenientMillis::class) val endsAt: Long? = null,
    @Serializable(with = LenientInt::class) val windowSecs: Int? = null,
    @Serializable(with = LenientMillis::class) val closedAt: Long? = null,
    @Serializable(with = LenientMillis::class) val completedAt: Long? = null,
    val openedBy: String? = null,
    val completedBy: String? = null,
    @Serializable(with = LenientInt::class) val present: Int? = null,
    @Serializable(with = LenientInt::class) val presentAndVoting: Int? = null,
    @Serializable(with = LenientInt::class) val late: Int? = null,
    @Serializable(with = LenientInt::class) val absent: Int? = null,
    @Serializable(with = LenientInt::class) val answered: Int? = null,
    @Serializable(with = LenientInt::class) val seated: Int? = null,
    @Serializable(with = LenientInt::class) val total: Int? = null,
    @Serializable(with = LenientInt::class) val quorumThreshold: Int? = null,
    val quorumMet: Boolean? = null,
)

@Serializable
data class SessionStaffEntry(val uid: String = "", val name: String = "", val role: String = "")

@Serializable
data class PublishedDocRef(
    val docId: String = "",
    val title: String = "",
    val docType: String = "",
    val submittedCountry: String? = null,
    val sponsors: List<String> = emptyList(),
    val signatories: List<String> = emptyList(),
)

@Serializable
data class LiveSession(
    val id: String = "",
    val eventId: String = "",
    val committeeId: String = "",
    val dateStr: String = "",
    val phase: String = Phase.LOBBY,
    @Serializable(with = LenientInt::class) val quorumThreshold: Int? = 0,
    val attendance: Map<String, AttendanceEntry> = emptyMap(),
    val gsl: GslState? = null,
    val caucus: CaucusState? = null,
    val activeVote: ActiveVote? = null,
    val motionInvite: MotionInvite? = null,
    val floorGate: FloorGate? = null,
    val agenda: SessionAgenda? = null,
    val rollCall: RollCallState? = null,
    val clock: SessionClock? = null,
    val live: LiveStageState? = null,
    val staff: Map<String, SessionStaffEntry>? = null,
    val pendingPublish: PublishedVoteResult? = null,
    val publishedResult: PublishedVoteResult? = null,
    val publishedDoc: PublishedDocRef? = null,
    val finalized: Boolean = false,
    @Serializable(with = LenientMillis::class) val finalizedAt: Long? = null,
    val createdBy: String = "",
    @Serializable(with = LenientMillis::class) val createdAt: Long? = null,
    /** Every write stamps it; the chair console's idle guard reads it. */
    @Serializable(with = LenientMillis::class) val updatedAt: Long? = null,
)

/** The chair console's idle guard (ChairSessionConsole.IdleGuard): warn after 2 min, close 15 s later. */
const val IDLE_LIMIT_MS = 2 * 60 * 1000L
const val IDLE_GRACE_SEC = 15

/**
 * When the sitting last showed life, or null if the guard shouldn't run at all: a closed or
 * suspended sitting, or a floor with something on it (a speaker, a caucus, a vote, a queue).
 */
fun idleSince(s: LiveSession): Long? {
    if (s.phase == Phase.CLOSED || s.phase == Phase.SUSPENDED || s.finalized) return null
    val floorActive = s.gsl?.activeSpeaker != null || s.caucus != null || s.activeVote != null || s.gsl?.queue.orEmpty().isNotEmpty()
    if (floorActive) return null
    return maxOf(s.updatedAt ?: 0L, s.live?.keepAliveAt ?: 0L)
}

// ── Live points ─────────────────────────────────────────────────────────────────

/** "order" | "information" | "personal_privilege" | "parliamentary_inquiry" */
typealias PointType = String

@Serializable
data class RaisedPoint(
    val id: String = "",
    val delegateId: String = "",
    val country: String = "",
    val applicationId: String = "",
    val type: PointType = "",
    val note: String? = null,
    val targetCountry: String? = null,
    /** "pending" | "recognized" | "dismissed" */
    val status: String = "",
    val chairNote: String? = null,
    val proxyBy: String? = null,
    val proxyByName: String? = null,
    @Serializable(with = LenientMillis::class) val createdAt: Long? = null,
    @Serializable(with = LenientMillis::class) val resolvedAt: Long? = null,
    val resolvedBy: String? = null,
)

data class PointMeta(val label: String, val short: String, val canInterrupt: Boolean, val priority: Int)

val POINT_META: Map<String, PointMeta> = mapOf(
    "order" to PointMeta("Point of Order", "Order", true, 0),
    "personal_privilege" to PointMeta("Point of Personal Privilege", "Privilege", true, 1),
    "information" to PointMeta("Point of Information", "Information", false, 2),
    "parliamentary_inquiry" to PointMeta("Point of Parliamentary Inquiry", "Inquiry", false, 3),
)

fun pointLabel(type: String): String = POINT_META[type]?.label ?: type

// ── Floor requests ──────────────────────────────────────────────────────────────

/** "floor" | "speak" | "vote_change" | "caucus_signup" | "yield" */
typealias FloorRequestKind = String

@Serializable
data class FloorRequest(
    val id: String = "",
    val delegateId: String = "",
    val country: String = "",
    val applicationId: String = "",
    val kind: FloorRequestKind = "",
    val voteId: String? = null,
    val caucusId: String? = null,
    val signupId: String? = null,
    val yieldTargetCountry: String? = null,
    val yieldTargetDelegateId: String? = null,
    val yieldTargetApplicationId: String? = null,
    @Serializable(with = LenientMillis::class) val yieldRemainingMs: Long? = null,
    /** caucus_signup only: "yes" | "no" */
    val answer: String? = null,
    val note: String? = null,
    /** "pending" | "granted" | "dismissed" */
    val status: String = "",
    val proxyBy: String? = null,
    val proxyByName: String? = null,
    @Serializable(with = LenientMillis::class) val createdAt: Long? = null,
    @Serializable(with = LenientMillis::class) val resolvedAt: Long? = null,
    val resolvedBy: String? = null,
)

data class RequestMeta(val label: String, val short: String, val hint: String)

val FLOOR_REQUEST_META: Map<String, RequestMeta> = mapOf(
    "floor" to RequestMeta("Raise hand for the floor", "Floor", "Ask the chair for the camera & mic"),
    "speak" to RequestMeta("Request to speak", "Speak", "Ask to be added to the Speakers List"),
    "vote_change" to RequestMeta("Request to change my vote", "Re-vote", "Ask the chair to reopen your ballot"),
    "caucus_signup" to RequestMeta("Speak in this caucus", "Caucus", "Answer the moderated-caucus speakers prompt"),
    "yield" to RequestMeta("Yield my remaining time", "Yield", "Hand the rest of your speech to another delegation"),
)

// ── Motions ─────────────────────────────────────────────────────────────────────

/** open_gsl | set_agenda | mod_caucus | unmod_caucus | extend_caucus | introduce_document | move_to_voting | adjourn | suspend | custom */
typealias MotionType = String

@Serializable
data class MotionParams(
    val topic: String? = null,
    @Serializable(with = LenientInt::class) val totalDurationSecs: Int? = null,
    @Serializable(with = LenientInt::class) val perSpeakerSecs: Int? = null,
    val documentId: String? = null,
    val targetPhase: String? = null,
)

@Serializable
data class Motion(
    val id: String = "",
    val type: MotionType = "",
    val params: MotionParams = MotionParams(),
    val byDelegateId: String = "",
    val byCountry: String = "",
    val applicationId: String = "",
    /** pending → recognized → voting → passed/failed → executed | dropped */
    val status: String = "",
    val secondedBy: String? = null,
    val voteId: String? = null,
    val note: String? = null,
    val chairNote: String? = null,
    val autoResolved: Boolean? = null,
    val proxyBy: String? = null,
    val proxyByName: String? = null,
    @Serializable(with = LenientMillis::class) val createdAt: Long? = null,
    @Serializable(with = LenientMillis::class) val recognizedAt: Long? = null,
    @Serializable(with = LenientMillis::class) val resolvedAt: Long? = null,
    val resolvedBy: String? = null,
)

data class MotionMetaEntry(val label: String, val short: String, val rank: Int, val needsVote: Boolean, val delegateProposable: Boolean)

/** PORTED FROM motionMeta.ts. `rank` orders the chair queue by MUN precedence (lower first). */
val MOTION_META: Map<String, MotionMetaEntry> = linkedMapOf(
    "adjourn" to MotionMetaEntry("Adjourn the session", "Adjourn", 0, true, true),
    "suspend" to MotionMetaEntry("Suspend the session", "Suspend", 1, true, true),
    "extend_caucus" to MotionMetaEntry("Extend the caucus", "Extend", 2, true, true),
    "unmod_caucus" to MotionMetaEntry("Unmoderated caucus", "Unmod", 3, true, true),
    "mod_caucus" to MotionMetaEntry("Moderated caucus", "Mod", 4, true, true),
    "introduce_document" to MotionMetaEntry("Introduce draft resolution / working paper", "Introduce", 5, false, true),
    "move_to_voting" to MotionMetaEntry("Move to voting procedure", "Vote", 6, true, true),
    "set_agenda" to MotionMetaEntry("Set the agenda", "Agenda", 7, true, true),
    "open_gsl" to MotionMetaEntry("Open the Speakers List", "GSL", 8, true, true),
    "custom" to MotionMetaEntry("Custom motion", "Custom", 9, false, true),
)

fun motionMeta(type: String): MotionMetaEntry = MOTION_META[type] ?: MotionMetaEntry(type, type, 99, false, false)

// ── Identities ──────────────────────────────────────────────────────────────────

@Serializable
data class DelegateRosterEntry(val delegateId: String, val country: String, val applicationId: String, val name: String = "")

data class ParticipationIdentity(
    val delegateId: String,
    val country: String,
    val applicationId: String,
    val eventId: String,
    val committeeId: String,
    val dateStr: String,
)

// ── Helpers ─────────────────────────────────────────────────────────────────────

/** Deterministic session id. Sanitizes "/" (illegal in Firestore ids). */
fun makeSessionId(committeeId: String, dateStr: String): String = "${committeeId.replace("/", "_")}__$dateStr"

fun newTimer(durationMs: Long): TimerState = TimerState(running = false, endsAt = null, pausedRemainingMs = durationMs, durationMs = durationMs)

/** Remaining ms for a timer, given the local clock. Clamped to [0, durationMs]. */
fun timerRemainingMs(t: TimerState?, now: Long = System.currentTimeMillis()): Long {
    if (t == null) return 0
    val raw = if (t.running && t.endsAt != null) t.endsAt - now else (t.pausedRemainingMs ?: 0)
    return maxOf(0L, minOf(t.durationMs ?: 0L, raw))
}

/** Deadline for a window of `secs`, or null for a gate that stays open until the chair moves. */
fun gateEndsAt(secs: Int?, now: Long = System.currentTimeMillis()): Long? = if (secs != null && secs > 0) now + secs * 1000L else null

/** "gsl.timer" | "caucus.totalTimer" | "caucus.speakerTimer" | "activeVote.timer" */
typealias TimerPath = String

const val SIGNUP_WINDOW_DEFAULT_SECS = 120
const val MOTION_INVITE_DEFAULT_SECS = 120
const val VOTE_DEFAULT_SECS = 120

/** Count delegates eligible to vote (present or present-and-voting). */
fun eligibleVoterCount(attendance: Map<String, AttendanceEntry>?): Int =
    attendance.orEmpty().values.count { it.status == "present" || it.status == "present_and_voting" }

data class BallotCount(val yes: Int, val no: Int, val abstain: Int)

/** Pure tally/ballot reducer. */
private fun countBallots(v: ActiveVote): BallotCount {
    if (v.mode == "tally") return BallotCount(v.tally?.yes ?: 0, v.tally?.no ?: 0, v.tally?.abstain ?: 0)
    var y = 0; var n = 0; var a = 0
    for (b in v.ballots.orEmpty().values) when (b) { "yes" -> y++; "no" -> n++; "abstain" -> a++ }
    return BallotCount(y, n, a)
}

/** How many ballots are in, WITHOUT revealing which way they went. */
fun castCount(v: ActiveVote): Int = countBallots(v).let { it.yes + it.no + it.abstain }

data class VoteOutcome(val result: String, val affirmative: Int, val negative: Int, val abstentions: Int, val vetoedBy: List<String>)

/** Compute a vote outcome. Abstentions excluded from the pass ratio. */
fun computeVoteResult(v: ActiveVote): VoteOutcome {
    val (aff, neg, abst) = countBallots(v)
    val base = aff + neg
    // SC veto only meaningful on substantive roll-call votes (need per-delegate ballots).
    val vetoedBy = if (v.scMode && v.voteType == "substantive" && v.mode == "roll_call") v.p5.filter { v.ballots?.get(it) == "no" } else emptyList()
    if (vetoedBy.isNotEmpty()) return VoteOutcome("vetoed", aff, neg, abst, vetoedBy)
    // Consensus = nobody OBJECTS. Abstaining is not objecting.
    val pass = when (v.threshold) {
        "consensus" -> neg == 0 && aff > 0
        "two_thirds" -> aff >= (v.minAffirmative ?: kotlin.math.ceil((2.0 / 3.0) * base).toInt())
        else -> aff > neg && aff >= (v.minAffirmative ?: (base / 2 + 1))
    }
    val result = if (pass) "passed" else if (aff == neg && base > 0) "tied" else "failed"
    return VoteOutcome(result, aff, neg, abst, emptyList())
}

/** Speakers a moderated caucus affords = floor(total / perSpeaker). */
private fun modSpeakers(p: MotionParams): Int = p.perSpeakerSecs?.takeIf { it > 0 }?.let { (p.totalDurationSecs ?: 0) / it } ?: 0

private fun secs(ms: Long?): Long = (ms ?: 0L) / 1000

/** Most-disruptive first: by rank, then longest-duration-wins in the caucus families, else first-proposed-first. */
fun compareMotionPrecedence(a: Motion, b: Motion): Int {
    val ra = motionMeta(a.type).rank
    val rb = motionMeta(b.type).rank
    if (ra != rb) return ra - rb
    val byTime = secs(a.createdAt).compareTo(secs(b.createdAt))
    if (a.type == "unmod_caucus" || a.type == "extend_caucus") {
        return ((b.params.totalDurationSecs ?: 0) - (a.params.totalDurationSecs ?: 0)).takeIf { it != 0 } ?: byTime
    }
    if (a.type == "mod_caucus") {
        return ((b.params.totalDurationSecs ?: 0) - (a.params.totalDurationSecs ?: 0)).takeIf { it != 0 }
            ?: (modSpeakers(b.params) - modSpeakers(a.params)).takeIf { it != 0 }
            ?: byTime
    }
    return byTime
}

/** Human summary of a motion's params, e.g. "10 min · 45s/speaker · Topic X". */
fun motionSummary(params: MotionParams?): String {
    val p = params ?: MotionParams()
    val parts = mutableListOf<String>()
    p.totalDurationSecs?.takeIf { it != 0 }?.let { parts += "${Math.round(it / 60.0)} min" }
    p.perSpeakerSecs?.takeIf { it != 0 }?.let { parts += "${it}s/speaker" }
    p.topic?.takeIf { it.isNotEmpty() }?.let { parts += it }
    return parts.joinToString(" · ")
}

fun motionLabel(m: Motion): String {
    val sum = motionSummary(m.params)
    return motionMeta(m.type).label + if (sum.isNotEmpty()) " — $sum" else ""
}

/** Thrown by proposeMotion when the delegation already has this motion alive on the floor. */
class DuplicateMotionError(val existing: Motion) : Exception(duplicateMotionNote(existing))
