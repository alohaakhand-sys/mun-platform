package com.munpro.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// Port of src/lib/services/markingScore.test.ts, the daily half (criterionPct, isScored,
// computeDailyScore, isAttended). Same inputs, same expected outputs.
class MarkingScoreTest {
    private val TEMPLATES = listOf(MarkingTemplate("speech", "Speeches", 100.0), MarkingTemplate("diplo", "Diplomacy", 100.0))

    private fun mark(dateStr: String, scores: Map<String, Double>, attendance: String? = null) = DailyMarking(
        id = "C_u1_$dateStr", eventId = "e1", committeeId = "C", delegateId = "u1", applicationId = "a1",
        dateStr = dateStr, scores = scores, gradedBy = "chair", attendanceStatus = attendance,
    )

    @Test fun `criterionPct passes a decimal value through, clamped to ±100`() {
        assertEquals(60.0, criterionPct(60.0, "decimal"), 0.0)
        assertEquals(-40.0, criterionPct(-40.0, "decimal"), 0.0)
        assertEquals(100.0, criterionPct(500.0, "decimal"), 0.0)
        assertEquals(-100.0, criterionPct(-500.0, "decimal"), 0.0)
    }

    @Test fun `criterionPct min-max maps binary −1, 0, +1 onto 0 to 100`() {
        assertEquals(0.0, criterionPct(-1.0, "binary"), 0.0)
        assertEquals(50.0, criterionPct(0.0, "binary"), 0.0)
        assertEquals(100.0, criterionPct(1.0, "binary"), 0.0)
        assertEquals(70.0, criterionPct(0.4, "binary"), 1e-9)
    }

    @Test fun `isScored treats a scored 0 as scored and a blank as not`() {
        assertTrue(isScored(0.0)); assertTrue(isScored(-100.0))
        assertFalse(isScored(null)); assertFalse(isScored(Double.NaN))
    }

    @Test fun `averages only the criteria that were scored`() {
        val d = computeDailyScore(mark("2026-03-01", mapOf("speech" to 80.0)), TEMPLATES)
        assertEquals(1, d.scoredCount); assertEquals(80.0, d.pct!!, 0.0); assertTrue(d.present)
    }

    @Test fun `floors a negative average at 0 without discarding the penalty`() {
        val d = computeDailyScore(mark("2026-03-01", mapOf("speech" to -100.0, "diplo" to -60.0)), TEMPLATES)
        assertEquals(0.0, d.pct!!, 0.0); assertEquals(-160.0, d.sum, 0.0)
    }

    @Test fun `returns null when nothing was scored`() {
        assertNull(computeDailyScore(mark("2026-03-01", emptyMap()), TEMPLATES).pct)
        assertFalse(computeDailyScore(null, TEMPLATES).present)
    }

    @Test fun `lets the doc's own markMode outrank the event fallback`() {
        val binaryDoc = mark("2026-03-01", mapOf("speech" to 1.0)).copy(markMode = "binary")
        assertEquals(100.0, computeDailyScore(binaryDoc, TEMPLATES, "decimal").pct!!, 0.0)
    }

    @Test fun `carries attendance through so the final can act on it`() {
        assertEquals("absent", computeDailyScore(mark("2026-03-01", emptyMap(), "absent"), TEMPLATES).attendanceStatus)
    }

    @Test fun `isAttended counts present, present_and_voting and late as in the room`() {
        assertTrue(isAttended("present")); assertTrue(isAttended("present_and_voting")); assertTrue(isAttended("late"))
        assertFalse(isAttended("absent")); assertFalse(isAttended(null))
    }

    // ── computeFinalScore — which days count ─────────────────────────────────────
    private val days = listOf("2026-03-01", "2026-03-02", "2026-03-03")

    @Test fun `averages scored days across the whole day set`() {
        val f = computeFinalScore(listOf(mark(days[0], mapOf("speech" to 90.0)), mark(days[1], mapOf("speech" to 60.0)), mark(days[2], mapOf("speech" to 30.0))), TEMPLATES, days, null)
        assertEquals(3, f.dayCount); assertEquals(3, f.presentDays); assertEquals(60.0, f.computedPct, 0.0); assertEquals(60, f.finalScore)
    }

    @Test fun `scores an ABSENT day as 0 and keeps it in the denominator`() {
        val f = computeFinalScore(listOf(mark(days[0], mapOf("speech" to 90.0)), mark(days[1], emptyMap(), "absent"), mark(days[2], mapOf("speech" to 90.0))), TEMPLATES, days, null)
        assertEquals(3, f.dayCount); assertEquals(0, f.excludedDays); assertEquals(60.0, f.computedPct, 0.0)
    }

    @Test fun `EXCLUDES an attended-but-unscored day instead of zeroing it`() {
        val f = computeFinalScore(listOf(mark(days[0], mapOf("speech" to 90.0)), mark(days[1], emptyMap(), "present"), mark(days[2], mapOf("speech" to 90.0))), TEMPLATES, days, null)
        assertEquals(2, f.dayCount); assertEquals(3, f.totalDays); assertEquals(1, f.excludedDays); assertEquals(90.0, f.computedPct, 0.0)
        assertFalse(f.counted.first { it.first == days[1] }.second)
    }

    @Test fun `keeps the legacy zero when a day has no marking doc and no attendance record`() {
        val f = computeFinalScore(listOf(mark(days[0], mapOf("speech" to 90.0))), TEMPLATES, days, null)
        assertEquals(3, f.dayCount); assertEquals(0, f.excludedDays); assertEquals(30.0, f.computedPct, 0.0)
    }

    @Test fun `treats a doc with no marks and no attendance as an absence, unchanged`() {
        val f = computeFinalScore(listOf(mark(days[0], mapOf("speech" to 90.0)), mark(days[1], emptyMap())), TEMPLATES, listOf("2026-03-01", "2026-03-02"), null)
        assertEquals(2, f.dayCount); assertEquals(45.0, f.computedPct, 0.0)
    }

    @Test fun `scores 0 rather than dividing by zero when every day is excluded`() {
        val f = computeFinalScore(listOf(mark(days[0], emptyMap(), "present")), TEMPLATES, listOf(days[0]), null)
        assertEquals(0, f.dayCount); assertEquals(0.0, f.computedPct, 0.0); assertEquals(0, f.finalScore)
    }

    // ── computeFinalScore — the blend ────────────────────────────────────────────
    private val two = listOf("2026-03-01", "2026-03-02")
    private val blendDaily = listOf(mark(two[0], mapOf("speech" to 80.0)), mark(two[1], mapOf("speech" to 60.0)))

    @Test fun `ignores the weight entirely when no overall was entered`() {
        val f = computeFinalScore(blendDaily, TEMPLATES, two, null, 0.3)
        assertEquals(0.0, f.overallWeight, 0.0); assertNull(f.chairOverall); assertEquals(70, f.finalScore)
    }

    @Test fun `blends 70-30 by default when an overall IS entered`() {
        val f = computeFinalScore(blendDaily, TEMPLATES, two, 100.0, DEFAULT_OVERALL_WEIGHT)
        assertEquals(0.3, f.overallWeight, 0.0); assertEquals(79, f.finalScore)
    }

    @Test fun `normalises a binary overall onto 0 to 100 before blending`() {
        val binaryDaily = listOf(mark(two[0], mapOf("speech" to 1.0)).copy(markMode = "binary"), mark(two[1], mapOf("speech" to 1.0)).copy(markMode = "binary"))
        assertEquals(70, computeFinalScore(binaryDaily, TEMPLATES, two, -1.0, 0.3, "binary").finalScore)
    }

    @Test fun `treats a scored 0 overall as a real value, not a blank`() {
        val f = computeFinalScore(blendDaily, TEMPLATES, two, 0.0, 0.3)
        assertEquals(0.3, f.overallWeight, 0.0); assertEquals(49, f.finalScore)
    }

    // ── deriveDays / splitMarkings ───────────────────────────────────────────────
    @Test fun `deriveDays prefers the explicit override and de-duplicates`() {
        assertEquals(listOf("2026-03-01", "2026-03-02"), deriveDays(listOf(mark("2026-03-05", emptyMap())), listOf("2026-03-02", "2026-03-01", "2026-03-01")))
    }

    @Test fun `deriveDays derives sorted distinct days from the marks when there is no override`() {
        assertEquals(listOf("2026-03-01", "2026-03-03"), deriveDays(listOf(mark("2026-03-03", emptyMap()), mark("2026-03-01", emptyMap()), mark("2026-03-03", emptyMap()))))
    }

    @Test fun `splitMarkings separates the final rollup by kind AND by the id suffix`() {
        val byKind = mark("2026-03-01", emptyMap()).copy(id = "C_u1_x", kind = "final")
        val bySuffix = mark("2026-03-02", emptyMap()).copy(id = "C_u1__final")
        assertTrue(splitMarkings(listOf(mark("2026-03-01", emptyMap()), byKind)).second === byKind)
        assertEquals(1, splitMarkings(listOf(mark("2026-03-01", emptyMap()), bySuffix)).first.size)
    }

    // ── rankEntries (Leaderboard) ────────────────────────────────────────────────
    @Test fun `equal finals share a rank and the next rank skips`() {
        fun row(id: String, country: String, fin: Int, pct: Double) = StandingRow(id, "", country, "", FinalScore(fin, pct, null, 0.0, 1, 1, 1, 0, emptyList()))
        val ranked = rankEntries(listOf(row("a", "fr", 80, 80.0), row("b", "us", 90, 90.0), row("c", "gb", 80, 80.0)))
        assertEquals(listOf("b" to 1, "a" to 2, "c" to 2), ranked.map { it.row.delegateId to it.rank })
    }
}
