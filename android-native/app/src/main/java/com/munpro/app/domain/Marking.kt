package com.munpro.app.domain

// The daily marking model (port of src/lib/services/markingScore.ts, the daily half, and the
// Marking shape of markingService.ts). Every criterion is scored on −100…+100 ("decimal"), or
// −1/0/+1 in binary mode; the daily % is the average of the criteria the chair actually scored,
// floored at 0. Pure, so the JUnit port of markingScore.test.ts guards it.

import com.munpro.app.data.LenientDouble
import com.munpro.app.data.LenientMillis
import kotlinx.serialization.Serializable

@Serializable
data class MarkingTemplate(
    val id: String = "",
    val name: String = "",
    @Serializable(with = LenientDouble::class) val maxScore: Double? = null,
    /** Live-floor metric that suggests this criterion's mark (sessionService.autoFillSuggestion). */
    val autoFillFrom: String? = null,
    @Serializable(with = LenientDouble::class) val autoFillCap: Double? = null,
)

@Serializable
data class ScoringConfig(
    /** "decimal" | "binary" */
    val markingMode: String? = null,
    /** Blend weight of the chair's holistic overall in the final (0..1); default 0.30. */
    @Serializable(with = LenientDouble::class) val overallWeight: Double? = null,
    /** Explicit conference-day set (YYYY-MM-DD); unset ⇒ derived from the marks. */
    val markingDays: List<String> = emptyList(),
)

/** eventService.getMarkingMode */
fun markingMode(event: EventData?): String = if (event?.scoringConfig?.markingMode == "binary") "binary" else "decimal"

/** One delegate's marking doc for one day: markings/{committeeId}_{delegateId}_{dateStr}. */
@Serializable
data class DailyMarking(
    val id: String = "",
    val eventId: String = "",
    val committeeId: String = "",
    val delegateId: String = "",
    val applicationId: String = "",
    val dateStr: String? = null,
    /** "present" | "present_and_voting" | "absent" | "late" */
    val attendanceStatus: String? = null,
    val attendanceSource: String? = null,
    /** "decimal" | "binary"; absent ⇒ decimal. */
    val markMode: String? = null,
    val scores: Map<String, Double> = emptyMap(),
    val scoreEntries: Map<String, List<Double>> = emptyMap(),
    val feedback: String = "",
    val gradedBy: String = "",
    @Serializable(with = LenientMillis::class) val updatedAt: Long? = null,
    /** "daily" (default) | "final" — the committee-level rollup doc, id `{committee}_{uid}__final`. */
    val kind: String? = null,
    @Serializable(with = LenientDouble::class) val chairOverall: Double? = null,
    // The final rollup (kind "final"), as saveFinalScore writes it.
    @Serializable(with = LenientDouble::class) val finalScore: Double? = null,
    @Serializable(with = LenientDouble::class) val computedPct: Double? = null,
    @Serializable(with = LenientDouble::class) val overallWeight: Double? = null,
    val days: List<String> = emptyList(),
    // A position paper's grade (savePositionPaperGrade), on the paper's own doc.
    @Serializable(with = LenientDouble::class) val positionPaperScore: Double? = null,
    /** review | approved | revision | flagged */
    val paperStatus: String? = null,
)

/** The paper's own marking doc: no day, not the final rollup. */
val DailyMarking.isPaperDoc: Boolean get() = dateStr.isNullOrEmpty() && kind != "final" && !id.endsWith("__final")

const val MARK_MIN = -100.0
const val MARK_MAX = 100.0
const val BINARY_MIN = -1.0
const val BINARY_MAX = 1.0

fun clampMark(n: Double, lo: Double, hi: Double): Double = minOf(hi, maxOf(lo, n))

/** The stored scale for a mode. */
fun markScale(mode: String?): ClosedFloatingPointRange<Double> = if (mode == "binary") BINARY_MIN..BINARY_MAX else MARK_MIN..MARK_MAX

/** Roll-call states that mean the delegate was in the room. */
fun isAttended(s: String?): Boolean = s == "present" || s == "present_and_voting" || s == "late"

/** One criterion's raw value as its 0..100 contribution: decimal passes through (±100), binary maps −1..+1 onto 0..100. */
fun criterionPct(raw: Double, mode: String): Double =
    if (mode == "binary") 50 * (clampMark(raw, BINARY_MIN, BINARY_MAX) + 1) else clampMark(raw, MARK_MIN, MARK_MAX)

/** A criterion is scored only when a finite number is present (0 counts, blank/NaN does not). */
fun isScored(v: Double?): Boolean = v != null && v.isFinite()

data class DailyRow(val id: String, val name: String, val value: Double?)

data class DailyScore(
    val dateStr: String?,
    /** null when nothing was scored that day. */
    val pct: Double?,
    val scoredCount: Int,
    val sum: Double,
    val rows: List<DailyRow>,
    val present: Boolean,
    val attendanceStatus: String?,
)

/** Daily % = clamp(sum of scored contributions / scoredCount, 0, 100); the doc's own markMode outranks [fallbackMode]. */
fun computeDailyScore(marking: DailyMarking?, templates: List<MarkingTemplate>, fallbackMode: String = "decimal"): DailyScore {
    val scores = marking?.scores.orEmpty()
    val mode = marking?.markMode ?: fallbackMode
    var sum = 0.0
    var count = 0
    val rows = templates.map { t ->
        val raw = scores[t.id]
        if (isScored(raw)) {
            val v = criterionPct(raw!!, mode)
            sum += v; count++
            DailyRow(t.id, t.name, v)
        } else DailyRow(t.id, t.name, null)
    }
    return DailyScore(marking?.dateStr, if (count > 0) clampMark(sum / count, 0.0, 100.0) else null, count, sum, rows, count > 0, marking?.attendanceStatus)
}

const val DEFAULT_OVERALL_WEIGHT = 0.30

/** Sorted, distinct conference-day set. An explicit override wins; else derived from the daily marks. */
fun deriveDays(daily: List<DailyMarking>, override: List<String> = emptyList()): List<String> =
    if (override.isNotEmpty()) override.toSortedSet().toList() else daily.mapNotNull { it.dateStr }.toSortedSet().toList()

/** A delegate's mixed marks → (daily docs, the single final rollup). */
fun splitMarkings(all: List<DailyMarking>): Pair<List<DailyMarking>, DailyMarking?> {
    val final = all.firstOrNull { it.kind == "final" || it.id.endsWith("__final") }
    return all.filter { it !== final && it.kind != "final" && !it.id.endsWith("__final") } to final
}

data class FinalScore(
    val finalScore: Int,
    val computedPct: Double,
    val chairOverall: Double?,
    val overallWeight: Double,
    /** Days in the denominator (attended-but-unscored days excluded). */
    val dayCount: Int,
    val totalDays: Int,
    val presentDays: Int,
    val excludedDays: Int,
    val counted: List<Pair<String, Boolean>>,
)

/**
 * markingScore.computeFinalScore — consistency-first: average of the COUNTED days' % (an absent
 * day counts as 0; a day attended but never scored is dropped), blended with the chair's overall
 * when one was given: round((1−w)·computed + w·overall).
 */
fun computeFinalScore(
    daily: List<DailyMarking>, templates: List<MarkingTemplate>, days: List<String>,
    chairOverall: Double?, overallWeight: Double = DEFAULT_OVERALL_WEIGHT, fallbackMode: String = "decimal",
): FinalScore {
    val dayset = if (days.isNotEmpty()) days.toSortedSet().toList() else deriveDays(daily)
    val byDay = LinkedHashMap<String, DailyMarking>()
    for (m in daily) { val d = m.dateStr ?: continue; if (d !in byDay) byDay[d] = m }
    val perDay = dayset.map { d ->
        val ds = computeDailyScore(byDay[d], templates, fallbackMode)
        Triple(d, ds, !(isAttended(ds.attendanceStatus) && !ds.present))
    }
    val presentDays = perDay.count { it.second.present }
    val countedDays = perDay.filter { it.third }
    val n = countedDays.size
    val numerator = countedDays.sumOf { (_, ds, _) -> if (ds.present && ds.pct != null) ds.pct else 0.0 }
    val rawComputed = if (n > 0) numerator / n else 0.0
    val hasOverall = isScored(chairOverall)
    val overallPct = if (hasOverall) criterionPct(chairOverall!!, fallbackMode) else 0.0
    val w = if (hasOverall) clampMark(overallWeight, 0.0, 1.0) else 0.0
    val rawFinal = (1 - w) * rawComputed + w * overallPct
    return FinalScore(
        finalScore = Math.round(clampMark(rawFinal, 0.0, 100.0)).toInt(),
        computedPct = Math.round(rawComputed * 10) / 10.0,
        chairOverall = if (hasOverall) chairOverall else null,
        overallWeight = w,
        dayCount = n, totalDays = dayset.size, presentDays = presentDays, excludedDays = dayset.size - n,
        counted = perDay.map { it.first to it.third },
    )
}

data class StandingRow(val delegateId: String, val applicationId: String, val country: String, val name: String, val final: FinalScore)
data class RankedRow(val row: StandingRow, val rank: Int)

/** Leaderboard.rankEntries: by final, then computed %, then country; equal finals share a rank. */
fun rankEntries(rows: List<StandingRow>): List<RankedRow> {
    val sorted = rows.sortedWith(
        compareByDescending<StandingRow> { it.final.finalScore }.thenByDescending { it.final.computedPct }.thenBy { it.country },
    )
    var lastScore: Int? = null
    var lastRank = 0
    return sorted.mapIndexed { i, r ->
        val rank = if (lastScore != null && r.final.finalScore == lastScore) lastRank else i + 1
        lastScore = r.final.finalScore; lastRank = rank
        RankedRow(r, rank)
    }
}

/**
 * sessionService.autoFillSuggestion: the live-floor metric a criterion is tied to, capped at the
 * criterion's autoFillCap (or maxScore). Null when the criterion has no metric or there is no
 * participation record for the day.
 */
fun autoFillSuggestion(t: MarkingTemplate, p: com.munpro.app.domain.live.ParticipationSummary?): Double? {
    val from = t.autoFillFrom ?: return null
    if (p == null) return null
    val metric: Double = when (from) {
        "speeches" -> p.speeches.toDouble()
        "caucusSpeeches" -> p.caucusSpeeches.toDouble()
        "allSpeeches" -> (p.speeches + p.caucusSpeeches).toDouble()
        "speakingMinutes" -> Math.round(p.speakingSeconds / 60).toDouble()
        "points" -> p.points.toDouble()
        "pointsRaised" -> (p.pointsRaised ?: p.points).toDouble()
        "motions" -> p.motions.toDouble()
        "motionsProposed" -> (p.motionsProposed ?: p.motions).toDouble()
        "votesCast" -> p.votesCast.toDouble()
        else -> return null
    }
    val cap = t.autoFillCap ?: t.maxScore ?: Double.MAX_VALUE
    return maxOf(0.0, minOf(cap, metric))
}
