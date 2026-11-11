package com.munpro.app.domain.live

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// PORTED FROM src/lib/services/caucusList.test.ts — case for case.
// Timestamps: the TS builds `{ seconds, nanoseconds }`; the port carries epoch millis
// (seconds * 1000 + nanos / 1e6, exactly what data/Json.kt's millisOf does).

class CaucusListTest {
    private fun timer() = TimerState(running = false, endsAt = null, pausedRemainingMs = 90_000, durationMs = 90_000)

    private fun modCaucus(kind: String = "moderated", listState: String? = null, totalDurationSecs: Int = 600, perSpeakerSecs: Int = 45) = CaucusState(
        caucusId = "c1", kind = kind, topic = "Sanctions", totalDurationSecs = totalDurationSecs, perSpeakerSecs = perSpeakerSecs,
        totalTimer = timer(), speakerTimer = timer(), currentSpeaker = null, queue = emptyList(), listState = listState,
    )

    private fun slot(country: String) = SpeakerSlot(delegateId = "u_$country", country = country, applicationId = "app_$country")

    /** A signup answer. `seconds`/`nanos` stand in for the serverTimestamp; null = not yet acked. */
    private fun signup(
        country: String, seconds: Long? = 100, nanos: Long = 0,
        answer: String = "yes", status: String = "pending", caucusId: String = "c1", kind: String = "caucus_signup",
    ) = FloorRequest(
        id = "r_$country", delegateId = "u_$country", country = country, applicationId = "app_$country",
        kind = kind, caucusId = caucusId, answer = answer, status = status,
        createdAt = seconds?.let { it * 1000 + nanos / 1_000_000 },
    )

    // ── caucusListState ─────────────────────────────────────────────────────────

    @Test fun `ABSENT reads as seated — this is what keeps every pre-existing caucus working`() {
        assertEquals("seated", caucusListState(modCaucus()))
    }

    @Test fun `null caucus reads as seated`() {
        assertEquals("seated", caucusListState(null))
    }

    @Test fun `an unmoderated caucus is never collecting — it has no speakers list`() {
        assertEquals("seated", caucusListState(modCaucus(kind = "unmoderated", listState = "collecting")))
    }

    @Test fun `reads the field when it is present`() {
        assertEquals("collecting", caucusListState(modCaucus(listState = "collecting")))
        assertEquals("seated", caucusListState(modCaucus(listState = "seated")))
        assertTrue(isCollecting(modCaucus(listState = "collecting")))
        assertFalse(isCollecting(modCaucus()))
    }

    // ── orderSignups ────────────────────────────────────────────────────────────

    @Test fun `orders by the SERVER timestamp, not by array position`() {
        val reqs = listOf(signup("ke", seconds = 300), signup("in", seconds = 100), signup("br", seconds = 200))
        assertEquals(listOf("in", "br", "ke"), orderSignups(reqs, "c1").map { it.country })
    }

    @Test fun `breaks a same-second tie on the sub-second part`() {
        // ADAPTED FIXTURE. The TS uses nanos 900 vs 100 — both collapse to the same epoch millisecond
        // in the port (Firestore Timestamp → Long millis is a documented port convention), so the
        // sub-second tiebreak is exercised at millisecond resolution instead: .9s vs .1s.
        val reqs = listOf(
            signup("ke", seconds = 100, nanos = 900_000_000),
            signup("in", seconds = 100, nanos = 100_000_000),
        )
        assertEquals(listOf("in", "ke"), orderSignups(reqs, "c1").map { it.country })
    }

    @Test fun `EXCLUDES an answer the server has not stamped yet`() {
        val reqs = listOf(signup("in", seconds = 100), signup("ke", seconds = null))
        assertEquals(listOf("in"), orderSignups(reqs, "c1").map { it.country })
    }

    @Test fun `keeps only pending yes-answers for THIS caucus`() {
        val reqs = listOf(
            signup("in"),
            signup("fr", answer = "no"),          // declined
            signup("br", status = "granted"),     // already placed
            signup("ke", caucusId = "c2"),        // a previous caucus
            signup("us", kind = "speak"),         // a GSL ask
        )
        assertEquals(listOf("in"), orderSignups(reqs, "c1").map { it.country })
    }

    @Test fun `returns nothing without a caucus id`() {
        assertEquals(emptyList<FloorRequest>(), orderSignups(listOf(signup("in")), null))
    }

    // ── allAnswers ──────────────────────────────────────────────────────────────

    @Test fun `counts declines and granted answers too — it is the 'who has responded' denominator`() {
        val reqs = listOf(signup("in"), signup("fr", answer = "no"), signup("br", status = "granted"))
        assertEquals(3, allAnswers(reqs, "c1").size)
    }

    // ── caucusSlots ─────────────────────────────────────────────────────────────

    @Test fun `floors total ÷ per-speaker`() {
        assertEquals(13, caucusSlots(modCaucus(totalDurationSecs = 600, perSpeakerSecs = 45)))
    }

    @Test fun `is 0 when there is no speaking time to divide by`() {
        assertEquals(0, caucusSlots(modCaucus(perSpeakerSecs = 0)))
        assertEquals(0, caucusSlots(null))
    }

    // ── signupIdFor ─────────────────────────────────────────────────────────────

    @Test fun `is derived from the caucus id, so a re-ask rotates it for free`() {
        assertEquals("sg_c1", signupIdFor("c1"))
        assertNotEquals(signupIdFor("c1"), signupIdFor("c2"))
    }

    // ── mergeSignupOrder ────────────────────────────────────────────────────────

    @Test fun `keeps the existing queue in front and appends new answers behind it`() {
        assertEquals(listOf("in", "br", "ke"), mergeSignupOrder(listOf(slot("in")), listOf(signup("br"), signup("ke"))).map { it.country })
    }

    @Test fun `never duplicates a delegation already in the queue`() {
        assertEquals(listOf("in", "br"), mergeSignupOrder(listOf(slot("in")), listOf(signup("in"), signup("br"))).map { it.country })
    }

    @Test fun `carries the application id through — marking credit reads it off the slot`() {
        assertEquals(SpeakerSlot(delegateId = "u_in", country = "in", applicationId = "app_in"), slotOfSignup(signup("in")))
    }

    // ── Kotlin-only drift guards ────────────────────────────────────────────────

    @Test fun `DRIFT - caucusSlots floors a negative quotient like Math floor`() {
        // TS: Math.floor(totalDurationSecs / perSpeakerSecs). Integer division truncates toward zero instead.
        assertEquals(-14, caucusSlots(modCaucus(totalDurationSecs = -600, perSpeakerSecs = 45)))
    }
}
