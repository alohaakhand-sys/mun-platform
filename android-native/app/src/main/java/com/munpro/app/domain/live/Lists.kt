package com.munpro.app.domain.live

// PORTED FROM src/lib/services/caucusList.ts, rollCall.ts and sessionChatModel.ts.

// ── caucusList.ts ───────────────────────────────────────────────────────────────

/** "collecting" | "seated". Absent reads as "seated" (today's behaviour, no backfill). */
fun caucusListState(caucus: CaucusState?): String {
    if (caucus == null || caucus.kind != "moderated") return "seated"
    return if (caucus.listState == "collecting") "collecting" else "seated"
}

fun isCollecting(caucus: CaucusState?): Boolean = caucusListState(caucus) == "collecting"

/** Pending "yes" caucus signups for THIS caucus, in the order they arrived (server timestamps). */
fun orderSignups(requests: List<FloorRequest>, caucusId: String?): List<FloorRequest> {
    if (caucusId.isNullOrEmpty()) return emptyList()
    return requests
        .filter { it.kind == "caucus_signup" && it.caucusId == caucusId && it.status == "pending" && it.answer == "yes" && it.createdAt != null }
        .sortedBy { it.createdAt }
}

/** Pending GSL signups (`speak`) for this round, in arrival order. */
fun orderGslSignups(requests: List<FloorRequest>, signupId: String?): List<FloorRequest> =
    requests
        .filter { it.kind == "speak" && it.status == "pending" && (if (!signupId.isNullOrEmpty()) it.signupId.isNullOrEmpty() || it.signupId == signupId else true) && it.createdAt != null }
        .sortedBy { it.createdAt }

fun allAnswers(requests: List<FloorRequest>, caucusId: String?): List<FloorRequest> =
    if (caucusId.isNullOrEmpty()) emptyList() else requests.filter { it.kind == "caucus_signup" && it.caucusId == caucusId }

fun slotOfSignup(r: FloorRequest): SpeakerSlot = SpeakerSlot(
    delegateId = r.delegateId, country = r.country, applicationId = r.applicationId,
    proxyBy = r.proxyBy?.ifEmpty { null }, proxyByName = if (!r.proxyBy.isNullOrEmpty()) r.proxyByName.orEmpty() else null,
)

fun caucusSlots(caucus: CaucusState?): Int {
    val per = caucus?.perSpeakerSecs ?: 0
    if (caucus == null || per <= 0) return 0
    return Math.floorDiv(caucus.totalDurationSecs ?: 0, per) // Math.floor, not truncation
}

fun signupIdFor(caucusId: String): String = "sg_$caucusId"

/** The existing queue, then every signup not already on it, in signup order. */
fun mergeSignupOrder(queue: List<SpeakerSlot>, signups: List<FloorRequest>): List<SpeakerSlot> {
    val out = queue.toMutableList()
    val seen = out.map { it.delegateId }.toMutableSet()
    for (r in signups) {
        if (!seen.add(r.delegateId)) continue
        out += slotOfSignup(r)
    }
    return out
}

// ── rollCall.ts ─────────────────────────────────────────────────────────────────

/** Default window for a roll call, seconds. Matches DEFAULT_WINDOW.roll_call in GateBar. */
const val ROLL_CALL_DEFAULT_SECS = 90

data class RollCallTally(
    val present: Int, val presentAndVoting: Int, val late: Int, val absent: Int,
    val answered: Int, val seated: Int, val total: Int, val quorumThreshold: Int, val quorumMet: Boolean,
)

data class RollCallReading(
    /** "not_started" | "running" | "ended" | "done" */
    val stage: String,
    val done: Boolean,
    val windowEndsAt: Long?,
    val remainingMs: Long?,
    val tally: RollCallTally,
    val snapshot: RollCallTally?,
    val legacy: Boolean,
    val record: RollCallState?,
)

fun tallyRollCall(attendance: Map<String, AttendanceEntry>?, quorumThreshold: Int): RollCallTally {
    val rows = attendance.orEmpty().values
    var present = 0; var pv = 0; var late = 0; var absent = 0
    for (r in rows) when (r.status) {
        "present" -> present++
        "present_and_voting" -> pv++
        "late" -> late++
        else -> absent++
    }
    val seated = present + pv
    return RollCallTally(present, pv, late, absent, rows.size - absent, seated, rows.size, quorumThreshold, seated >= quorumThreshold && seated > 0)
}

private fun usable(r: RollCallState?): Boolean = r?.startedAt != null && r.startedAt > 0

private fun readSnapshot(r: RollCallState): RollCallTally? {
    val total = r.total ?: return null
    return RollCallTally(
        r.present ?: 0, r.presentAndVoting ?: 0, r.late ?: 0, r.absent ?: 0,
        r.answered ?: (total - (r.absent ?: 0)), r.seated ?: 0, total, r.quorumThreshold ?: 0, r.quorumMet ?: false,
    )
}

/** Where today's roll call stands. THE only reader of `session.rollCall`. */
fun readRollCall(s: LiveSession, now: Long = System.currentTimeMillis()): RollCallReading {
    val tally = tallyRollCall(s.attendance, s.quorumThreshold ?: 0)
    val record = s.rollCall?.takeIf { usable(it) }
    if (record == null) {
        val done = tally.quorumMet && s.phase != Phase.LOBBY
        return RollCallReading(if (done) "done" else "not_started", done, null, null, tally, null, true, null)
    }
    val lapsed = record.endsAt != null && now >= record.endsAt
    val stage = when {
        // JS truthiness on a number: any non-zero stamp counts.
        (record.completedAt ?: 0L) != 0L -> "done"
        (record.closedAt ?: 0L) != 0L || lapsed -> "ended"
        else -> "running"
    }
    val windowEndsAt = if (stage == "running") record.endsAt else null
    return RollCallReading(stage, stage == "done", windowEndsAt, windowEndsAt?.let { maxOf(0, it - now) }, tally, readSnapshot(record), false, record)
}

// ── sessionChatModel.ts ─────────────────────────────────────────────────────────

const val BROADCAST_THREAD = "@all"
const val CHAT_MAX_CHARS = 1000
const val CHAT_MIN_SEND_GAP_MS = 1500L
const val CHAT_BURST_LIMIT = 20
const val CHAT_BURST_WINDOW_MS = 5 * 60_000L
const val CHAT_INBOX_LIMIT = 300L

@kotlinx.serialization.Serializable
data class SessionChatMessage(
    val id: String = "",
    val threadKey: String = "",
    /** "delegate" | "dais" */
    val fromRole: String = "",
    val fromUid: String = "",
    val fromName: String = "",
    val country: String = "",
    val text: String = "",
    @kotlinx.serialization.Serializable(with = com.munpro.app.data.LenientMillis::class) val sentAt: Long? = 0,
)

data class ChatThread(
    val key: String,
    val isBroadcast: Boolean,
    val messages: List<SessionChatMessage>,
    val lastAt: Long,
    val lastText: String,
    val lastFromRole: String,
    val country: String,
    val name: String,
    val unread: Int,
)

/** `String.prototype.trim`'s set (WhiteSpace + LineTerminator). Kotlin's trim() also strips U+001C..U+001F and keeps U+FEFF. */
private fun isJsTrimSpace(c: Char): Boolean = c == '﻿' || (c.isWhitespace() && c !in '\u001C'..'\u001F')

fun normalizeChatText(raw: String): String = raw.trim(::isJsTrimSpace).take(CHAT_MAX_CHARS)

/** Group messages into threads, broadcast first, then newest activity. */
fun foldThreads(msgs: List<SessionChatMessage>, seen: Map<String, Long>, forRole: String): List<ChatThread> {
    val byKey = LinkedHashMap<String, MutableList<SessionChatMessage>>()
    for (m in msgs) {
        if (m.threadKey.isEmpty()) continue
        byKey.getOrPut(m.threadKey) { mutableListOf() } += m
    }
    val threads = byKey.map { (key, raw) ->
        val list = raw.sortedBy { it.sentAt ?: 0L }
        val last = list.last()
        val since = seen[key] ?: 0
        val lastDelegate = list.lastOrNull { it.fromRole == "delegate" }
        ChatThread(
            key = key, isBroadcast = key == BROADCAST_THREAD, messages = list,
            lastAt = last.sentAt ?: 0, lastText = last.text, lastFromRole = last.fromRole.ifEmpty { "delegate" },
            country = lastDelegate?.country.orEmpty(), name = lastDelegate?.fromName.orEmpty(),
            unread = list.count { it.fromRole != forRole && (it.sentAt ?: 0) > since },
        )
    }
    return threads.sortedWith(compareBy<ChatThread> { !it.isBroadcast }.thenByDescending { it.lastAt })
}

fun totalUnread(threads: List<ChatThread>): Int = threads.sumOf { it.unread }
