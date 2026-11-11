package com.munpro.app.domain.live

import com.munpro.app.domain.assertMatches
import com.munpro.app.domain.assertNotMatches
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// PORTED FROM src/lib/services/floorGate.test.ts — case for case, same inputs, same expectations.
// `canJoinSignup` is String? here (null where the TS returns false).

class FloorGateTest {
    private val NOW = 1_700_000_000_000L
    private val ME = "u_fr"

    private fun timer(running: Boolean = false, endsAt: Long? = null, durationMs: Long = 90_000) =
        TimerState(running = running, endsAt = endsAt, pausedRemainingMs = 90_000, durationMs = durationMs)

    private fun slot(country: String) = SpeakerSlot(delegateId = "u_$country", country = country, applicationId = "app_$country")

    private fun gate(
        kind: String = "locked", motionTypes: List<String>? = null, signupFor: String? = null,
        signupId: String? = null, allowsPoints: Boolean = false, endsAt: Long? = null, label: String? = null,
    ) = FloorGate(
        kind = kind, motionTypes = motionTypes, signupFor = signupFor, signupId = signupId,
        allowsPoints = allowsPoints, endsAt = endsAt, label = label, openedBy = "chair",
    )

    private fun gslOf(activeSpeaker: SpeakerSlot? = null) =
        GslState(defaultSpeakerSecs = 90, queue = emptyList(), activeSpeaker = activeSpeaker, timer = timer())

    /** Seated delegate, quiet floor, gate explicitly present (i.e. NOT the legacy path). */
    private fun base(
        phase: String = "gsl", finalized: Boolean = false, gsl: GslState? = gslOf(), caucus: CaucusState? = null,
        activeVote: ActiveVote? = null, stage: List<String> = emptyList(), floorGate: FloorGate? = gate(),
    ) = LiveSession(
        phase = phase, finalized = finalized, gsl = gsl, caucus = caucus, activeVote = activeVote,
        live = LiveStageState(stage = stage), floorGate = floorGate,
        attendance = mapOf(
            "u_fr" to AttendanceEntry(status = "present", country = "fr", delegateId = "u_fr", applicationId = "a1"),
            "u_br" to AttendanceEntry(status = "present_and_voting", country = "br", delegateId = "u_br", applicationId = "a2"),
            "u_ke" to AttendanceEntry(status = "absent", country = "ke", delegateId = "u_ke", applicationId = "a3"),
        ),
    )

    private fun rollCallVote(ballots: Map<String, String> = emptyMap(), mode: String = "roll_call", timer: TimerState? = null) = ActiveVote(
        voteId = "v1", motion = "Motion to open the GSL", voteType = "procedural",
        threshold = "simple_majority", scMode = false, p5 = emptyList(), allowAbstain = true, round = 1,
        divisionOfQuestion = false, mode = mode, ballots = ballots, eligibleCount = 3,
        startedBy = "chair", timer = timer,
    )

    private fun modCaucus(
        kind: String = "moderated", currentSpeaker: SpeakerSlot? = null, listState: String? = null,
        signupEndsAt: Long? = null, perSpeakerSecs: Int = 45, speakerTimer: TimerState = timer(),
    ) = CaucusState(
        caucusId = "c1", kind = kind, topic = "Sanctions", totalDurationSecs = 600, perSpeakerSecs = perSpeakerSecs,
        totalTimer = timer(), speakerTimer = speakerTimer, currentSpeaker = currentSpeaker, queue = emptyList(),
        listState = listState, signupEndsAt = signupEndsAt,
    )

    // ── capabilitiesFor — gate kinds ────────────────────────────────────────────

    @Test fun `locked permits nothing`() {
        val c = capabilitiesFor(base(), ME, NOW)
        assertFalse(c.canProposeMotion)
        assertFalse(c.canRaisePoint)
        assertNull(c.canJoinSignup)
        assertFalse(c.canDeclareAttendance)
        assertEquals("locked", c.effectiveKind)
    }

    @Test fun `motions gate exposes ONLY the types the chair ticked`() {
        val c = capabilitiesFor(base(floorGate = gate(kind = "motions", motionTypes = listOf("set_agenda"))), ME, NOW)
        assertTrue(c.canProposeMotion)
        assertEquals(listOf("set_agenda"), c.proposableMotionTypes)
        assertTrue(c.canSecondMotion)
    }

    @Test fun `motions gate with an empty type list proposes nothing`() {
        val c = capabilitiesFor(base(floorGate = gate(kind = "motions", motionTypes = emptyList())), ME, NOW)
        assertFalse(c.canProposeMotion)
        assertEquals(emptyList<String>(), c.proposableMotionTypes)
    }

    @Test fun `debate blocks motions but keeps points when allowsPoints is set`() {
        val c = capabilitiesFor(base(floorGate = gate(kind = "debate", allowsPoints = true)), ME, NOW)
        assertFalse(c.canProposeMotion)
        assertMatches("holds the floor", c.lockReason["canProposeMotion"])
        assertTrue(c.canRaisePoint)
    }

    @Test fun `the chair can mute points independently of the gate kind`() {
        assertFalse(capabilitiesFor(base(floorGate = gate(kind = "debate", allowsPoints = false)), ME, NOW).canRaisePoint)
    }

    @Test fun `signup reports which list is being joined`() {
        assertEquals("caucus", capabilitiesFor(base(floorGate = gate(kind = "signup", signupFor = "caucus")), ME, NOW).canJoinSignup)
    }

    @Test fun `signup defaults to the GSL when signupFor is unset`() {
        assertEquals("gsl", capabilitiesFor(base(floorGate = gate(kind = "signup")), ME, NOW).canJoinSignup)
    }

    @Test fun `REGRESSION - a caucus signup window survives a stale gsl activeSpeaker`() {
        val s = base(
            phase = "mod_caucus",
            gsl = gslOf(slot("br")),
            stage = emptyList(),
            caucus = modCaucus(listState = "collecting", currentSpeaker = null),
            floorGate = gate(kind = "signup", signupFor = "caucus", signupId = "sg_c1", endsAt = NOW + 60_000, allowsPoints = true),
        )
        val c = capabilitiesFor(s, ME, NOW)
        assertEquals("caucus", c.canJoinSignup)
        assertFalse(c.gateOverridden)
        assertTrue(c.canRaisePoint)
    }

    @Test fun `voting closes motions and floor requests`() {
        val c = capabilitiesFor(base(floorGate = gate(kind = "voting")), ME, NOW)
        assertFalse(c.canProposeMotion)
        assertFalse(c.canRequestFloor)
    }

    // ── capabilitiesFor — floor occupancy beats a stale gate ────────────────────

    private fun speaking(floorGate: FloorGate? = gate(), activeVote: ActiveVote? = null) =
        base(gsl = gslOf(slot("br")), stage = listOf("u_br"), floorGate = floorGate, activeVote = activeVote)

    @Test fun `a running speech reads as debate even while the gate still says locked`() {
        val c = capabilitiesFor(speaking(floorGate = gate(kind = "locked")), ME, NOW)
        assertEquals("debate", c.effectiveKind)
        assertTrue(c.gateOverridden)
    }

    @Test fun `a running speech closes motions the chair had left open`() {
        val c = capabilitiesFor(speaking(floorGate = gate(kind = "motions", motionTypes = listOf("mod_caucus"))), ME, NOW)
        assertFalse(c.canProposeMotion)
        assertMatches("holds the floor", c.lockReason["canProposeMotion"])
    }

    @Test fun `points survive a speech even when the stale gate had muted them`() {
        assertTrue(capabilitiesFor(speaking(floorGate = gate(kind = "locked", allowsPoints = false)), ME, NOW).canRaisePoint)
    }

    @Test fun `an open vote outranks everything else on the floor`() {
        val c = capabilitiesFor(
            speaking(activeVote = rollCallVote(), floorGate = gate(kind = "motions", motionTypes = listOf("adjourn"))), ME, NOW,
        )
        assertEquals("voting", c.effectiveKind)
        assertFalse(c.canProposeMotion)
    }

    @Test fun `a moderated-caucus speaker counts as occupancy`() {
        val c = capabilitiesFor(
            base(caucus = modCaucus(currentSpeaker = slot("ke")), floorGate = gate(kind = "motions", motionTypes = listOf("adjourn"))), ME, NOW,
        )
        assertEquals("debate", c.effectiveKind)
    }

    @Test fun `TRAP - an activeSpeaker with an EMPTY stage is stale, not occupancy`() {
        val c = capabilitiesFor(
            base(gsl = gslOf(slot("br")), stage = emptyList(), floorGate = gate(kind = "motions", motionTypes = listOf("mod_caucus"))), ME, NOW,
        )
        assertEquals("motions", c.effectiveKind)
        assertTrue(c.canProposeMotion)
    }

    @Test fun `the chair's window resumes untouched once the floor clears`() {
        val g = gate(kind = "motions", motionTypes = listOf("mod_caucus"), endsAt = NOW + 60_000)
        assertNull(capabilitiesFor(speaking(floorGate = g), ME, NOW).expiresAt)

        val cleared = capabilitiesFor(base(floorGate = g), ME, NOW)
        assertEquals("motions", cleared.effectiveKind)
        assertFalse(cleared.gateOverridden)
        assertEquals(NOW + 60_000, cleared.expiresAt)
    }

    // ── capabilitiesFor — roll call ─────────────────────────────────────────────

    @Test fun `an unseated delegate may still declare attendance`() {
        assertTrue(capabilitiesFor(base(floorGate = gate(kind = "roll_call")), "u_ke", NOW).canDeclareAttendance)
    }

    @Test fun `a delegate with no attendance entry at all may still declare`() {
        assertTrue(capabilitiesFor(base(floorGate = gate(kind = "roll_call")), "u_unknown", NOW).canDeclareAttendance)
    }

    @Test fun `attendance is locked when roll call is not the open gate`() {
        val c = capabilitiesFor(base(), "u_ke", NOW)
        assertFalse(c.canDeclareAttendance)
        assertMatches("not open", c.lockReason["canDeclareAttendance"])
    }

    @Test fun `a delegate who already answered carries no lock reason`() {
        val c = capabilitiesFor(base(), ME, NOW)
        assertFalse(c.canDeclareAttendance)
        assertNull(c.lockReason["canDeclareAttendance"])
    }

    // ── capabilitiesFor — window expiry ─────────────────────────────────────────

    @Test fun `an unexpired window reports its deadline`() {
        val c = capabilitiesFor(base(floorGate = gate(kind = "motions", motionTypes = listOf("mod_caucus"), endsAt = NOW + 60_000)), ME, NOW)
        assertTrue(c.canProposeMotion)
        assertEquals(NOW + 60_000, c.expiresAt)
    }

    @Test fun `the gate locks itself once the deadline passes — no chair action required`() {
        val c = capabilitiesFor(base(floorGate = gate(kind = "motions", motionTypes = listOf("mod_caucus"), endsAt = NOW - 1)), ME, NOW)
        assertEquals("locked", c.effectiveKind)
        assertFalse(c.canProposeMotion)
        assertNull(c.expiresAt)
        assertMatches("closed", c.lockReason["canProposeMotion"])
    }

    @Test fun `expiry is inclusive at the boundary`() {
        assertNull(capabilitiesFor(base(floorGate = gate(kind = "signup", endsAt = NOW)), ME, NOW).canJoinSignup)
    }

    // ── capabilitiesFor — seating ───────────────────────────────────────────────

    @Test fun `an absent delegate cannot propose, second, point, sign up or request the floor`() {
        val c = capabilitiesFor(base(floorGate = gate(kind = "motions", motionTypes = listOf("mod_caucus"), allowsPoints = true)), "u_ke", NOW)
        assertFalse(c.canProposeMotion)
        assertFalse(c.canSecondMotion)
        assertFalse(c.canRaisePoint)
        assertFalse(c.canRequestFloor)
        assertMatches("not marked present", c.lockReason["canProposeMotion"])
    }

    @Test fun `present_and_voting is seated`() {
        assertTrue(isSeated("present_and_voting"))
        assertTrue(isSeated("present"))
        assertFalse(isSeated("absent"))
        assertFalse(isSeated("late"))
        assertFalse(isSeated(null))
    }

    // ── capabilitiesFor — ballots ───────────────────────────────────────────────

    @Test fun `a seated delegate may cast during a roll-call vote even while the gate says locked`() {
        assertTrue(capabilitiesFor(base(activeVote = rollCallVote(), floorGate = gate(kind = "locked")), ME, NOW).canCastBallot)
    }

    @Test fun `one ballot each`() {
        val c = capabilitiesFor(base(activeVote = rollCallVote(ballots = mapOf(ME to "yes"))), ME, NOW)
        assertFalse(c.canCastBallot)
        assertMatches("already cast", c.lockReason["canCastBallot"])
    }

    @Test fun `a show-of-hands vote is not delegate-castable`() {
        assertFalse(capabilitiesFor(base(activeVote = rollCallVote(mode = "tally")), ME, NOW).canCastBallot)
    }

    @Test fun `an absent delegate cannot cast`() {
        assertFalse(capabilitiesFor(base(activeVote = rollCallVote()), "u_ke", NOW).canCastBallot)
    }

    @Test fun `a running vote timer that has elapsed closes the ballot`() {
        val s = base(activeVote = rollCallVote(timer = timer(running = true, endsAt = NOW - 1)))
        assertFalse(capabilitiesFor(s, ME, NOW).canCastBallot)
    }

    // ── capabilitiesFor — session over ──────────────────────────────────────────

    @Test fun `a closed session permits nothing, whatever the gate says`() {
        val c = capabilitiesFor(base(phase = "closed", floorGate = gate(kind = "motions", motionTypes = listOf("adjourn"))), ME, NOW)
        assertFalse(c.canProposeMotion)
        assertFalse(c.canRaisePoint)
        assertMatches("adjourned", c.lockReason["canProposeMotion"])
    }

    @Test fun `finalized outranks an open gate even while the phase still reads gsl`() {
        assertFalse(capabilitiesFor(base(finalized = true, floorGate = gate(kind = "motions", motionTypes = listOf("adjourn"))), ME, NOW).canProposeMotion)
    }

    @Test fun `suspended permits nothing but says so distinctly`() {
        val c = capabilitiesFor(base(phase = "suspended", floorGate = gate(kind = "motions", motionTypes = listOf("adjourn"))), ME, NOW)
        assertMatches("suspended", c.lockReason["canProposeMotion"])
    }

    // ── capabilitiesFor — legacy sessions (no floorGate) ────────────────────────

    private fun legacy(phase: String = "gsl", gsl: GslState? = gslOf(), caucus: CaucusState? = null, stage: List<String> = emptyList()) =
        base(phase = phase, gsl = gsl, caucus = caucus, stage = stage, floorGate = null)

    @Test fun `is flagged as legacy`() {
        assertTrue(capabilitiesFor(legacy(), ME, NOW).legacy)
        assertFalse(capabilitiesFor(base(), ME, NOW).legacy)
    }

    @Test fun `keeps motions open on a quiet floor — nobody is locked out by this module landing`() {
        val c = capabilitiesFor(legacy(), ME, NOW)
        assertTrue(c.canProposeMotion)
        assertEquals(ALL_DELEGATE_MOTION_TYPES, c.proposableMotionTypes)
        // Drift guard on the constant itself: Object.keys(MOTION_META) filtered by delegateProposable, in TS key order.
        assertEquals(
            listOf("adjourn", "suspend", "extend_caucus", "unmod_caucus", "mod_caucus", "introduce_document", "move_to_voting", "set_agenda", "open_gsl", "custom"),
            ALL_DELEGATE_MOTION_TYPES,
        )
        assertTrue(c.canRaisePoint)
        assertTrue(c.canRequestFloor)
    }

    @Test fun `defers to motionsInOrder while a delegate holds the floor`() {
        val c = capabilitiesFor(legacy(gsl = gslOf(slot("br")), stage = listOf("u_br")), ME, NOW)
        assertFalse(c.canProposeMotion)
        assertEquals("debate", c.effectiveKind)
        assertTrue(c.canRaisePoint)
    }

    @Test fun `attendance stays chair-only`() {
        val c = capabilitiesFor(legacy(), ME, NOW)
        assertFalse(c.canDeclareAttendance)
        assertMatches("chair takes the roll", c.lockReason["canDeclareAttendance"])
    }

    @Test fun `caucus signup opens off the caucus object's own window`() {
        assertEquals("caucus", capabilitiesFor(legacy(caucus = modCaucus(signupEndsAt = NOW + 30_000)), ME, NOW).canJoinSignup)
        assertNull(capabilitiesFor(legacy(caucus = modCaucus(signupEndsAt = NOW - 1)), ME, NOW).canJoinSignup)
    }

    @Test fun `still honours closed sessions`() {
        assertFalse(capabilitiesFor(legacy(phase = "closed"), ME, NOW).canProposeMotion)
    }

    // ── holdsTheFloor — the gate on every yield surface ─────────────────────────

    private fun frSpeaking(caucus: CaucusState? = null, activeVote: ActiveVote? = null, stage: List<String> = emptyList()) =
        base(gsl = gslOf(slot("fr")), caucus = caucus, activeVote = activeVote, stage = stage)

    @Test fun `is true for the live GSL speaker`() {
        assertTrue(holdsTheFloor(frSpeaking(), "u_fr"))
    }

    @Test fun `is false for everyone else`() {
        assertFalse(holdsTheFloor(frSpeaking(), "u_br"))
    }

    @Test fun `is false when nobody holds the floor`() {
        assertFalse(holdsTheFloor(base(), "u_fr"))
    }

    @Test fun `is false for a STALE activeSpeaker left standing by a caucus`() {
        assertFalse(holdsTheFloor(frSpeaking(caucus = modCaucus()), "u_fr"))
    }

    @Test fun `is TRUE for the recognized speaker in a moderated caucus`() {
        val s = frSpeaking(caucus = modCaucus(currentSpeaker = slot("br")))
        assertTrue(holdsTheFloor(s, "u_br"))
        assertFalse(holdsTheFloor(s, "u_fr"))
    }

    @Test fun `is false for everyone during an UNMODERATED caucus — nobody is recognized`() {
        val s = frSpeaking(caucus = modCaucus(kind = "unmoderated", currentSpeaker = slot("br")))
        assertFalse(holdsTheFloor(s, "u_br"))
        assertFalse(holdsTheFloor(s, "u_fr"))
    }

    @Test fun `is false while a vote is running`() {
        assertFalse(holdsTheFloor(frSpeaking(activeVote = rollCallVote()), "u_fr"))
        assertFalse(holdsTheFloor(frSpeaking(caucus = modCaucus(currentSpeaker = slot("br")), activeVote = rollCallVote()), "u_br"))
    }

    @Test fun `still holds when the chair has cleared the video stage — that does not end a speech`() {
        assertTrue(holdsTheFloor(frSpeaking(stage = emptyList()), "u_fr"))
    }

    @Test fun `is false for an empty delegateId, however the doc reads`() {
        assertFalse(holdsTheFloor(base(gsl = gslOf(null)), ""))
    }

    // ── floorHolder / floorSpeechClock ──────────────────────────────────────────

    @Test fun `prefers the caucus speaker over a stale GSL slot`() {
        assertEquals("u_br", floorHolder(frSpeaking(caucus = modCaucus(currentSpeaker = slot("br"))))?.delegateId)
    }

    @Test fun `returns null in a caucus with nobody recognized yet`() {
        assertNull(floorHolder(frSpeaking(caucus = modCaucus())))
        assertNull(floorHolder(frSpeaking(caucus = modCaucus(kind = "unmoderated"))))
    }

    @Test fun `falls back to the GSL speaker when no caucus is running`() {
        assertEquals("u_fr", floorHolder(frSpeaking())?.delegateId)
        assertNull(floorHolder(base()))
    }

    @Test fun `a vote takes the floor from everyone`() {
        assertNull(floorHolder(frSpeaking(activeVote = rollCallVote())))
    }

    @Test fun `reads the caucus speaker clock, not the GSL one — a yield card must not promise the wrong time`() {
        val c = floorSpeechClock(frSpeaking(caucus = modCaucus(perSpeakerSecs = 45, speakerTimer = timer(durationMs = 45_000))))
        assertEquals("caucus.speakerTimer", c.path)
        assertEquals(45, c.baseSecs)
        assertEquals(45_000L, c.timer?.durationMs)

        val g = floorSpeechClock(frSpeaking())
        assertEquals("gsl.timer", g.path)
        assertEquals(90, g.baseSecs)
    }

    @Test fun `an UNMODERATED caucus keeps the GSL clock — it has no per-speaker one`() {
        assertEquals("gsl.timer", floorSpeechClock(frSpeaking(caucus = modCaucus(kind = "unmoderated"))).path)
    }

    // ── capabilitiesFor — the floor holder cannot raise a point ─────────────────

    @Test fun `shuts the speaker's own point tiles and names the yield menu instead`() {
        val s = base(gsl = gslOf(slot("fr")), stage = listOf("u_fr"), floorGate = gate(kind = "debate", allowsPoints = true))
        val c = capabilitiesFor(s, ME, NOW)
        assertFalse(c.canRaisePoint)
        assertMatches("yield", c.lockReason["canRaisePoint"])
        assertTrue(capabilitiesFor(s, "u_br", NOW).canRaisePoint)
    }

    @Test fun `applies to the caucus speaker too`() {
        val s = base(caucus = modCaucus(currentSpeaker = slot("fr")), floorGate = gate(kind = "debate", allowsPoints = true))
        assertFalse(capabilitiesFor(s, ME, NOW).canRaisePoint)
        assertTrue(capabilitiesFor(s, "u_br", NOW).canRaisePoint)
    }

    @Test fun `applies on legacy sessions as well`() {
        val s = base(floorGate = null, gsl = gslOf(slot("fr")), stage = listOf("u_fr"))
        assertFalse(capabilitiesFor(s, ME, NOW).canRaisePoint)
        assertTrue(capabilitiesFor(s, "u_br", NOW).canRaisePoint)
    }

    // ── gateHeadline ────────────────────────────────────────────────────────────

    @Test fun `prefers the chair's own wording`() {
        assertEquals("Agenda motions only", gateHeadline(gate(kind = "motions", label = "Agenda motions only"), "motions"))
    }

    @Test fun `distinguishes the two signup lists`() {
        assertMatches("caucus", gateHeadline(gate(kind = "signup", signupFor = "caucus"), "signup"))
        assertNotMatches("caucus", gateHeadline(gate(kind = "signup", signupFor = "gsl"), "signup"))
    }

    @Test fun `describes an expired gate as closed, not as whatever it used to be`() {
        assertMatches("closed", gateHeadline(gate(kind = "motions"), "locked"))
    }

    // ── Kotlin-only drift guards (divergences found while porting; see the report) ──

    @Test fun `DRIFT - an empty-string ballot is falsy in the TS and does not count as cast`() {
        // TS: `if (vote.ballots?.[delegateId])` — "" is falsy, so the delegate may still cast.
        assertTrue(capabilitiesFor(base(activeVote = rollCallVote(ballots = mapOf(ME to ""))), ME, NOW).canCastBallot)
    }
}
