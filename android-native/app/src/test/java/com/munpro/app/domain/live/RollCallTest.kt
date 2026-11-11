package com.munpro.app.domain.live

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// PORTED FROM src/lib/services/rollCall.test.ts — case for case.

class RollCallTest {
    private val NOW = 1_700_000_000_000L

    /** A 4-delegation committee. Pass statuses in order; the rest stay absent. */
    private fun attendance(vararg statuses: String): Map<String, AttendanceEntry> =
        listOf("in", "fr", "br", "ke").withIndex().associate { (i, c) ->
            "u_$c" to AttendanceEntry(status = statuses.getOrNull(i) ?: "absent", country = c, delegateId = "u_$c", applicationId = "app$i")
        }

    private fun base(phase: String = "lobby", attendance: Map<String, AttendanceEntry> = attendance(), rollCall: RollCallState? = null) =
        LiveSession(phase = phase, quorumThreshold = 2, attendance = attendance, rollCall = rollCall)

    private fun record(
        endsAt: Long? = NOW + 60_000, closedAt: Long? = null, completedAt: Long? = null,
        present: Int? = null, presentAndVoting: Int? = null, late: Int? = null, absent: Int? = null,
        answered: Int? = null, seated: Int? = null, total: Int? = null, quorumThreshold: Int? = null, quorumMet: Boolean? = null,
    ) = RollCallState(
        startedAt = NOW - 30_000, endsAt = endsAt, windowSecs = 90, closedAt = closedAt, completedAt = completedAt,
        present = present, presentAndVoting = presentAndVoting, late = late, absent = absent, answered = answered,
        seated = seated, total = total, quorumThreshold = quorumThreshold, quorumMet = quorumMet,
    )

    // ── tallyRollCall ───────────────────────────────────────────────────────────

    @Test fun `counts every bucket and derives answered and seated`() {
        val t = tallyRollCall(attendance("present", "present_and_voting", "late"), 2)
        assertEquals(
            RollCallTally(present = 1, presentAndVoting = 1, late = 1, absent = 1, answered = 3, seated = 2, total = 4, quorumThreshold = 2, quorumMet = true),
            t,
        )
    }

    @Test fun `an empty roster is never quorate, even against a threshold of 0`() {
        val t = tallyRollCall(emptyMap(), 0)
        assertEquals(0, t.total)
        assertEquals(0, t.seated)
        assertFalse(t.quorumMet)
    }

    @Test fun `late does not count toward quorum but does count as answered`() {
        val t = tallyRollCall(attendance("late", "late"), 2)
        assertEquals(2, t.answered)
        assertEquals(0, t.seated)
        assertFalse(t.quorumMet)
    }

    // ── readRollCall — the four stages ──────────────────────────────────────────

    @Test fun `no record, lobby ⇒ not_started`() {
        val r = readRollCall(base(), NOW)
        assertEquals("not_started", r.stage)
        assertTrue(r.legacy)
        assertFalse(r.done)
    }

    @Test fun `a live window ⇒ running, and reports the deadline still ahead`() {
        val r = readRollCall(base(rollCall = record(), phase = "roll_call"), NOW)
        assertEquals("running", r.stage)
        assertEquals(NOW + 60_000, r.windowEndsAt)
        assertEquals(60_000L, r.remainingMs)
        assertFalse(r.legacy)
    }

    @Test fun `a lapsed window ⇒ ended, with no deadline left to tick`() {
        val r = readRollCall(base(rollCall = record(endsAt = NOW - 1)), NOW)
        assertEquals("ended", r.stage)
        assertNull(r.windowEndsAt)
        assertNull(r.remainingMs)
    }

    @Test fun `stopped early ⇒ ended, even with the window still ahead`() {
        assertEquals("ended", readRollCall(base(rollCall = record(closedAt = NOW - 5_000)), NOW).stage)
    }

    @Test fun `a window with no deadline stays running until the chair stops it`() {
        assertEquals("running", readRollCall(base(rollCall = record(endsAt = null)), NOW).stage)
    }

    @Test fun `completedAt ⇒ done, and it outranks a still-open window`() {
        val r = readRollCall(base(rollCall = record(completedAt = NOW - 1_000)), NOW)
        assertEquals("done", r.stage)
        assertTrue(r.done)
    }

    @Test fun `done BELOW quorum — the whole point of the ruling`() {
        val r = readRollCall(base(attendance = attendance("present"), rollCall = record(closedAt = NOW - 2_000, completedAt = NOW - 1_000)), NOW)
        assertTrue(r.done)
        assertFalse(r.tally.quorumMet)
    }

    // ── readRollCall — the snapshot ─────────────────────────────────────────────

    @Test fun `is null before completion`() {
        assertNull(readRollCall(base(rollCall = record()), NOW).snapshot)
    }

    @Test fun `is the frozen tally, not the live one`() {
        val r = readRollCall(base(
            attendance = attendance("present"),
            rollCall = record(
                completedAt = NOW - 1_000,
                present = 2, presentAndVoting = 1, late = 0, absent = 1,
                answered = 3, seated = 3, total = 4, quorumThreshold = 2, quorumMet = true,
            ),
        ), NOW)
        assertEquals(3, r.snapshot?.seated)
        assertEquals(true, r.snapshot?.quorumMet)
        assertEquals(1, r.tally.seated)
    }

    // ── readRollCall — legacy fallback ──────────────────────────────────────────

    @Test fun `quorum met away from the lobby ⇒ done`() {
        val r = readRollCall(base(phase = "gsl", attendance = attendance("present", "present")), NOW)
        assertTrue(r.done)
        assertTrue(r.legacy)
    }

    @Test fun `quorum met at phase roll_call ⇒ done — nothing moves the phase when the roll finishes`() {
        assertTrue(readRollCall(base(phase = "roll_call", attendance = attendance("present", "present")), NOW).done)
    }

    @Test fun `quorum met but still in the lobby ⇒ not_started`() {
        assertFalse(readRollCall(base(phase = "lobby", attendance = attendance("present", "present")), NOW).done)
    }

    @Test fun `a half-written record with no startedAt falls back to legacy`() {
        val r = readRollCall(base(phase = "gsl", attendance = attendance("present", "present"), rollCall = RollCallState(closedAt = NOW)), NOW)
        assertTrue(r.legacy)
        assertNull(r.record)
        assertTrue(r.done)
    }

    // ── Kotlin-only drift guards ────────────────────────────────────────────────

    @Test fun `DRIFT - completedAt and closedAt are JS-truthy tests, so any non-zero stamp counts`() {
        // TS: `record.completedAt ? "done" : record.closedAt || lapsed ? "ended" : "running"`.
        assertEquals("done", readRollCall(base(rollCall = record(completedAt = -1)), NOW).stage)
        assertEquals("ended", readRollCall(base(rollCall = record(closedAt = -1)), NOW).stage)
        assertEquals("running", readRollCall(base(rollCall = record(completedAt = 0, closedAt = 0)), NOW).stage)
    }
}
