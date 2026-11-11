package com.munpro.app.domain.live

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// PORTED FROM src/lib/services/motionFloor.test.ts — case for case. `it.each` tables are one
// @Test each, looping the same rows.

class MotionFloorTest {
    private val NOW = 1_700_000_000_000L

    private fun timer(durationMs: Long = 90_000, pausedRemainingMs: Long = 90_000) =
        TimerState(running = false, endsAt = null, pausedRemainingMs = pausedRemainingMs, durationMs = durationMs)

    private fun slot(country: String) = SpeakerSlot(delegateId = "u_$country", country = country, applicationId = "app_$country")

    private fun gslOf(activeSpeaker: SpeakerSlot? = null, queue: List<SpeakerSlot> = emptyList()) =
        GslState(defaultSpeakerSecs = 90, queue = queue, activeSpeaker = activeSpeaker, timer = timer())

    private val ROSTER = mapOf(
        "u_fr" to AttendanceEntry(status = "present", country = "fr", delegateId = "u_fr", applicationId = "a1"),
        "u_br" to AttendanceEntry(status = "present", country = "br", delegateId = "u_br", applicationId = "a2"),
        "u_ke" to AttendanceEntry(status = "present", country = "ke", delegateId = "u_ke", applicationId = "a3"),
    )

    /** Everything clear: no speaker, no caucus, no vote, nobody on the mic. */
    private fun base(
        phase: String = "gsl", finalized: Boolean = false, gsl: GslState? = gslOf(), caucus: CaucusState? = null,
        activeVote: ActiveVote? = null, stage: List<String> = emptyList(),
        attendance: Map<String, AttendanceEntry> = ROSTER, motionInvite: MotionInvite? = null,
    ) = LiveSession(
        phase = phase, finalized = finalized, gsl = gsl, caucus = caucus, activeVote = activeVote,
        live = LiveStageState(stage = stage), attendance = attendance, motionInvite = motionInvite,
    )

    private fun modCaucus(currentSpeaker: SpeakerSlot? = null) = CaucusState(
        caucusId = "c1", kind = "moderated", topic = "Sanctions", totalDurationSecs = 600, perSpeakerSecs = 45,
        totalTimer = timer(durationMs = 600_000, pausedRemainingMs = 600_000), speakerTimer = timer(),
        currentSpeaker = currentSpeaker, queue = emptyList(),
    )

    private fun unmodCaucus() = CaucusState(
        caucusId = "c2", kind = "unmoderated", topic = "", totalDurationSecs = 600, perSpeakerSecs = 0,
        totalTimer = timer(durationMs = 600_000, pausedRemainingMs = 600_000), speakerTimer = timer(),
    )

    private fun openVote() = ActiveVote(
        voteId = "v1", motion = "DR 1.1", voteType = "substantive", threshold = "two_thirds",
        scMode = false, p5 = emptyList(), allowAbstain = true, round = 1, divisionOfQuestion = false,
        mode = "roll_call", ballots = emptyMap(), eligibleCount = 3, startedBy = "chair",
    )

    private fun invite(endsAt: Long, windowSecs: Int = 120, openedBy: String = "chair", note: String? = null) =
        MotionInvite(inviteId = "i1", endsAt = endsAt, windowSecs = windowSecs, openedBy = openedBy, note = note)

    private fun run(s: LiveSession) = motionsInOrder(s, NOW)

    // ── the floor is clear ──────────────────────────────────────────────────────

    @Test fun `plain GSL with nobody speaking → open`() {
        assertEquals("open", run(base()).code)
    }

    @Test fun `lobby → open (before quorum is NOT a block)`() {
        assertEquals("open", run(base(phase = "lobby")).code)
    }

    @Test fun `roll call with an empty roster → open (roll call is NOT a block)`() {
        assertEquals("open", run(base(phase = "roll_call", attendance = emptyMap())).code)
    }

    @Test fun `between speeches with a queue waiting → open (the classic motion moment)`() {
        assertEquals("open", run(base(gsl = gslOf(queue = listOf(slot("fr"))))).code)
    }

    // ── someone holds the floor ─────────────────────────────────────────────────

    @Test fun `GSL speaker with the mic → gsl_speaker, names the country`() {
        val r = run(base(gsl = gslOf(slot("fr")), stage = listOf("u_fr")))
        assertFalse(r.inOrder)
        assertEquals("gsl_speaker", r.code)
        assertTrue(r.detail, r.detail.contains("France"))
    }

    @Test fun `granted floor request — mic held with no GSL slot → floor_granted`() {
        val r = run(base(stage = listOf("u_ke")))
        assertEquals("floor_granted", r.code)
        assertTrue(r.detail, r.detail.contains("Kenya"))
    }

    @Test fun `moderated caucus with a recognized speaker → caucus_speaker`() {
        assertEquals("caucus_speaker", run(base(phase = "mod_caucus", caucus = modCaucus(slot("br")), stage = listOf("u_br"))).code)
    }

    @Test fun `the caucus speaker wins the label over a stale GSL speaker`() {
        val r = run(base(phase = "mod_caucus", gsl = gslOf(slot("fr")), caucus = modCaucus(slot("br")), stage = listOf("u_br")))
        assertEquals("caucus_speaker", r.code)
        assertTrue(r.detail.contains("Brazil"))
        assertFalse(r.detail.contains("France"))
    }

    @Test fun `a point-of-order interrupt (chair spotlights someone else) stays closed`() {
        assertEquals("gsl_speaker", run(base(gsl = gslOf(slot("fr")), stage = listOf("u_ke"))).code)
    }

    // ── the staleness traps ─────────────────────────────────────────────────────

    @Test fun `TRAP - unmoderated caucus + stale gsl activeSpeaker → open`() {
        assertEquals("open", run(base(phase = "unmod_caucus", gsl = gslOf(slot("fr")), caucus = unmodCaucus(), stage = emptyList())).code)
    }

    @Test fun `TRAP - unmoderated caucus stays open even if someone is on the mic`() {
        assertEquals("open", run(base(phase = "unmod_caucus", caucus = unmodCaucus(), stage = listOf("u_ke"))).code)
    }

    @Test fun `TRAP - moderated caucus, nobody recognized yet, stale gsl activeSpeaker → open`() {
        assertEquals("open", run(base(phase = "mod_caucus", gsl = gslOf(slot("fr")), caucus = modCaucus(null), stage = emptyList())).code)
    }

    @Test fun `TRAP - post-endCaucus phantom speaker → open`() {
        assertEquals("open", run(base(phase = "gsl", gsl = gslOf(slot("fr")), caucus = null, stage = emptyList())).code)
    }

    @Test fun `TRAP - post-closeVoteAtomic — vote gone, stage empty, speaker still named → open`() {
        assertEquals("open", run(base(activeVote = null, gsl = gslOf(slot("fr")), stage = emptyList())).code)
    }

    // ── precedence ──────────────────────────────────────────────────────────────

    @Test fun `an open vote outranks a live speaker`() {
        assertEquals("vote_open", run(base(phase = "voting", activeVote = openVote(), gsl = gslOf(slot("fr")), stage = listOf("u_fr"))).code)
    }

    @Test fun `an open vote outranks a live invite (the stale-invite case)`() {
        assertEquals("vote_open", run(base(phase = "voting", activeVote = openVote(), motionInvite = invite(NOW + 60_000))).code)
    }

    @Test fun `a live speaker outranks a live invite`() {
        assertEquals("gsl_speaker", run(base(gsl = gslOf(slot("fr")), stage = listOf("u_fr"), motionInvite = invite(NOW + 60_000))).code)
    }

    @Test fun `finalized outranks a leftover caucus and vote`() {
        assertEquals("session_closed", run(base(finalized = true, caucus = modCaucus(slot("br")), activeVote = openVote())).code)
    }

    @Test fun `phase closed without finalized → session_closed`() {
        assertEquals("session_closed", run(base(phase = "closed")).code)
    }

    @Test fun `suspended → session_suspended`() {
        assertEquals("session_suspended", run(base(phase = "suspended")).code)
    }

    // ── the invite window ───────────────────────────────────────────────────────

    @Test fun `an unexpired invite → invited, with the remaining ms and the note`() {
        val r = run(base(motionInvite = invite(NOW + 30_000, note = "funding topic only")))
        assertEquals("invited", r.code)
        assertEquals(30_000L, r.endsInMs)
        assertEquals("i1", r.inviteId)
        assertEquals("funding topic only", r.note)
    }

    @Test fun `an expired invite → open, with no write needed to expire it`() {
        assertEquals("open", run(base(motionInvite = invite(NOW - 1))).code)
    }

    @Test fun `absent motionInvite (pre-ship session) → open, NOT closed`() {
        assertEquals("open", run(base()).code)
    }

    @Test fun `null motionInvite (post closeMotionFloor) reads identically to absent`() {
        assertEquals("open", run(base(motionInvite = null)).code)
    }

    @Test fun `an invite survives an unmoderated caucus (motions stay in order there)`() {
        assertEquals("invited", run(base(phase = "unmod_caucus", caucus = unmodCaucus(), motionInvite = invite(NOW + 30_000))).code)
    }

    // ── motionInviteState ───────────────────────────────────────────────────────

    @Test fun `reports active, remaining and windowSecs`() {
        val st = motionInviteState(LiveSession(motionInvite = invite(NOW + 45_000, windowSecs = 90, openedBy = "c")), NOW)
        assertEquals(MotionInviteState(active = true, inviteId = "i1", endsInMs = 45_000, windowSecs = 90), st)
    }

    @Test fun `clamps a lapsed window to zero and reports inactive`() {
        val st = motionInviteState(LiveSession(motionInvite = invite(NOW - 5_000, windowSecs = 90, openedBy = "c")), NOW)
        assertFalse(st.active)
        assertEquals(0L, st.endsInMs)
    }

    @Test fun `handles absent and null alike`() {
        assertFalse(motionInviteState(LiveSession(), NOW).active)
        assertFalse(motionInviteState(LiveSession(motionInvite = null), NOW).active)
    }

    // ── copy completeness ───────────────────────────────────────────────────────

    private val blockedCases: List<Pair<String, LiveSession>> = listOf(
        "gsl_speaker" to base(gsl = gslOf(slot("fr")), stage = listOf("u_fr")),
        "floor_granted" to base(stage = listOf("u_ke")),
        "caucus_speaker" to base(caucus = modCaucus(slot("br"))),
        "vote_open" to base(activeVote = openVote()),
        "session_suspended" to base(phase = "suspended"),
        "session_closed" to base(phase = "closed"),
    )

    @Test fun `each blocked code carries a non-empty title and detail`() {
        for ((code, s) in blockedCases) {
            val r = run(s)
            assertFalse(code, r.inOrder)
            assertEquals(code, r.code)
            assertTrue(code, r.title.isNotEmpty())
            assertTrue("$code title <= 48: ${r.title}", r.title.length <= 48)
            assertTrue(code, r.detail.isNotEmpty())
        }
    }

    @Test fun `every actionable block reassures the delegate that points still work`() {
        for ((code, s) in blockedCases) {
            val r = run(s)
            if (!r.inOrder && code != "session_closed") assertTrue("$code should mention points", r.detail.contains(POINTS_STILL_OPEN))
        }
    }

    @Test fun `session_closed does NOT promise points — nothing is actionable`() {
        val r = run(base(phase = "closed"))
        if (!r.inOrder) assertFalse(r.detail.contains(POINTS_STILL_OPEN))
    }

    // ── myLiveMotion — the duplicate block ──────────────────────────────────────

    private fun mot(id: String = "m1", status: String = "pending") = Motion(
        id = id, type = "open_gsl", params = MotionParams(), byDelegateId = "u_fr", byCountry = "fr",
        applicationId = "app1", status = status,
    )

    @Test fun `finds the delegation's own live motion of that type`() {
        assertEquals("m1", myLiveMotion(listOf(mot()), "open_gsl")?.id)
    }

    @Test fun `does not match a different type`() {
        assertNull(myLiveMotion(listOf(mot()), "mod_caucus"))
    }

    @Test fun `each status counts as live or not, as the TS table says`() {
        val table = listOf(
            "pending" to true, "recognized" to true, "voting" to true,
            // Carried but not yet executed — moving it again is the same duplicate, one step later.
            "passed" to true, "executed" to false, "failed" to false, "dropped" to false,
        )
        for ((status, live) in table) {
            assertEquals(status, live, isLiveMotion(mot(status = status)))
            assertEquals(status, live, myLiveMotion(listOf(mot(status = status)), "open_gsl") != null)
        }
    }

    @Test fun `a resolved motion frees the type again`() {
        assertNull(myLiveMotion(listOf(mot(id = "old", status = "executed"), mot(id = "older", status = "dropped")), "open_gsl"))
    }

    @Test fun `names the motion and where it got to`() {
        com.munpro.app.domain.assertMatches("already moved", duplicateMotionNote(mot()))
        com.munpro.app.domain.assertMatches("voting on it", duplicateMotionNote(mot(status = "voting")))
        com.munpro.app.domain.assertMatches("carried", duplicateMotionNote(mot(status = "passed")))
        com.munpro.app.domain.assertMatches("recognized", duplicateMotionNote(mot(status = "recognized")))
    }
}
