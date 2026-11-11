package com.munpro.app.domain.live

// The day's participation report (port of sessionService buildCommitteeReport / toReportRow /
// summarizePoints / yieldsFor and SessionReport.tsx). Pure: the repo hands in the four reads
// (participation, points, finished votes, motion log) and this builds the rows.

import com.munpro.app.data.LenientMillis
import kotlinx.serialization.Serializable

/** sessions/{id}/participation/{delegateId}: the counters every floor action bumps. */
@Serializable
data class ParticipationSummary(
    val delegateId: String = "",
    val country: String = "",
    val applicationId: String = "",
    val attendanceStatus: String? = null,
    val speeches: Long = 0,
    /** Can be fractional: the web adds elapsed ms / 1000. */
    val speakingSeconds: Double = 0.0,
    val caucusSpeeches: Long = 0,
    /** Points the chair RECOGNISED. */
    val points: Long = 0,
    val pointsRaised: Long? = null,
    val motionsProposed: Long? = null,
    /** Motions that reached execution. */
    val motions: Long = 0,
    val votesCast: Long = 0,
)

/** sessions/{id}/motions: the day's log. Only yields are read here. */
@Serializable
data class MotionLogEntry(
    val id: String = "",
    val kind: String = "",
    val label: String = "",
    val byDelegateId: String = "",
    val byCountry: String = "",
    val targetCountry: String? = null,
    val targetDelegateId: String? = null,
    /** raised | ruled | passed | failed */
    val outcome: String? = null,
    @Serializable(with = LenientMillis::class) val at: Long? = null,
)

/** sessions/{id}/votes: a closed vote. */
@Serializable
data class FinishedVoteRecord(
    val voteId: String = "",
    val motion: String = "",
    val result: String = "",
    val affirmative: Long = 0,
    val negative: Long = 0,
    val abstentions: Long = 0,
    /** "tally" | "roll_call" */
    val mode: String? = null,
    @Serializable(with = LenientMillis::class) val closedAt: Long? = null,
    @Serializable(with = LenientMillis::class) val startedAt: Long? = null,
)

data class YieldGiven(val targetCountry: String, val targetDelegateId: String?)

data class DelegateReportRow(
    val delegateId: String,
    val country: String,
    val attendanceStatus: String?,
    val speeches: Long,
    val speakingSeconds: Double,
    val caucusSpeeches: Long,
    val motions: Long,
    val motionsProposed: Long,
    val votesCast: Long,
    val pointsByType: Map<String, Int>,
    val pointsTotal: Int,
    val yieldsGiven: List<YieldGiven>,
)

data class CommitteeReport(
    val present: Int,
    val quorum: Int,
    val totalSpeeches: Long,
    val totalSpeakingSeconds: Double,
    val rows: List<DelegateReportRow>,
    val votes: List<FinishedVoteRecord>,
)

/** The four point types, in the web's report column order (O / I / PP / PI). */
val REPORT_POINT_TYPES = listOf("order", "information", "personal_privilege", "parliamentary_inquiry")

/** A delegate's points by type, pending and recognised; dismissed points don't count. */
fun summarizePoints(points: List<RaisedPoint>, delegateId: String? = null): Map<String, Int> {
    val out = REPORT_POINT_TYPES.associateWith { 0 }.toMutableMap()
    for (p in points) {
        if (delegateId != null && p.delegateId != delegateId) continue
        if (p.status == "dismissed") continue
        out[p.type] = (out[p.type] ?: 0) + 1
    }
    return out
}

/** Yields a delegate gave, from the motion log's `kind: "yield"` entries. */
fun yieldsFor(motions: List<MotionLogEntry>, delegateId: String): List<YieldGiven> =
    motions.filter { it.kind == "yield" && it.byDelegateId == delegateId }
        .map { YieldGiven(it.targetCountry.orEmpty(), it.targetDelegateId) }

fun toReportRow(p: ParticipationSummary, points: List<RaisedPoint>, motions: List<MotionLogEntry>): DelegateReportRow {
    val byType = summarizePoints(points, p.delegateId)
    return DelegateReportRow(
        delegateId = p.delegateId, country = p.country, attendanceStatus = p.attendanceStatus,
        speeches = p.speeches, speakingSeconds = p.speakingSeconds, caucusSpeeches = p.caucusSpeeches,
        motions = p.motions, motionsProposed = p.motionsProposed ?: p.motions, votesCast = p.votesCast,
        pointsByType = byType, pointsTotal = byType.values.sum(), yieldsGiven = yieldsFor(motions, p.delegateId),
    )
}

/**
 * reportAttendance.ts withRollAttendance: the sitting's roll is the attendance authority, and
 * everyone on it gets a row. Answering roll call yourself writes only the roll, never
 * participation, and a delegate who never acts has no participation doc at all.
 */
fun withRollAttendance(participation: List<ParticipationSummary>, roll: Map<String, AttendanceEntry>): List<ParticipationSummary> {
    val out = participation.map { p -> roll[p.delegateId]?.status?.let { p.copy(attendanceStatus = it) } ?: p }
    val seen = out.map { it.delegateId }.toSet()
    return out + roll.filterKeys { it !in seen }.map { (id, a) ->
        ParticipationSummary(delegateId = id, country = a.country, applicationId = a.applicationId, attendanceStatus = a.status)
    }
}

/** buildCommitteeReport, minus the reads. Rows sorted by country code, as on the web. */
fun buildCommitteeReport(
    participation: List<ParticipationSummary>, points: List<RaisedPoint>,
    votes: List<FinishedVoteRecord>, motions: List<MotionLogEntry>, quorum: Int,
    roll: Map<String, AttendanceEntry> = emptyMap(),
): CommitteeReport {
    val merged = withRollAttendance(participation, roll)
    val rows = merged.map { toReportRow(it, points, motions) }.sortedBy { it.country }
    return CommitteeReport(
        present = merged.count { isSeated(it.attendanceStatus) },
        quorum = quorum,
        totalSpeeches = rows.sumOf { it.speeches },
        totalSpeakingSeconds = rows.sumOf { it.speakingSeconds },
        rows = rows,
        votes = votes.sortedBy { it.closedAt ?: 0L },
    )
}

/** The web's attLabel. */
fun attendanceShort(a: String?): String = when (a) {
    "present_and_voting" -> "P&V"; "present" -> "Present"; "late" -> "Late"; "absent" -> "Absent"; else -> "—"
}

/** m:ss, as the report prints speaking time. */
fun fmtSpeaking(seconds: Double): String { val s = maxOf(0L, Math.round(seconds)); return "${s / 60}:${(s % 60).toString().padStart(2, '0')}" }
