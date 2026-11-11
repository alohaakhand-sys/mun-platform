package com.munpro.app.domain.live

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// PORTED FROM src/lib/services/motionMootness.test.ts — ONLY the cases that exercise what Motions.kt
// ports (supersededByExecution, gslIsOpen, gslSpokenThrough, motionOutcomeWord). The Kotlin side
// deliberately has no readFloorFacts / mootByState / sweepMootMotions / motionTypeIsMoot /
// relevantMotionTypes / orphanedVoteMotions, so their describe blocks are not ported.

class MotionMootnessTest {
    private var seq = 0

    private fun motion(
        type: String, status: String = "pending", params: MotionParams = MotionParams(),
        byCountry: String = "fr", id: String? = null,
    ): Motion {
        seq += 1
        return Motion(
            id = id ?: "m$seq", type = type, params = params, byDelegateId = "u$seq", byCountry = byCountry,
            applicationId = "a$seq", status = status,
        )
    }

    private fun timer() = TimerState(running = false, endsAt = null, pausedRemainingMs = 600_000, durationMs = 600_000)

    private fun gslState(spoken: Int? = null, queue: List<SpeakerSlot> = emptyList(), activeSpeaker: SpeakerSlot? = null) =
        GslState(defaultSpeakerSecs = 90, queue = queue, activeSpeaker = activeSpeaker, timer = timer(), spoken = spoken)

    private fun codes(falls: List<MootFall>) = falls.map { it.ruling.code }
    private fun ids(falls: List<MootFall>) = falls.map { it.motion.id }

    // ── supersededByExecution — one motion answers the question for everybody ───

    @Test fun `a set_agenda that executes drops every other live set_agenda`() {
        val executed = motion("set_agenda", params = MotionParams(topic = "Maritime Security"), status = "executed", byCountry = "fr")
        val us = motion("set_agenda", params = MotionParams(topic = "Maritime Security"), status = "recognized", byCountry = "us")
        val other = motion("set_agenda", params = MotionParams(topic = "Something else"), status = "pending")

        val falls = supersededByExecution(executed, listOf(executed, us, other))

        assertEquals(listOf(other.id, us.id).sorted(), ids(falls).sorted())
        assertTrue(codes(falls).all { it == "agenda_superseded" })
    }

    @Test fun `names the adopted topic in the reason`() {
        val executed = motion("set_agenda", params = MotionParams(topic = "Maritime Security"), status = "executed")
        val falls = supersededByExecution(executed, listOf(executed, motion("set_agenda")))
        assertTrue(falls[0].ruling.reason.contains("Maritime Security"))
    }

    @Test fun `TRAP - never returns the motion that executed`() {
        val executed = motion("set_agenda", status = "recognized") // still AUTO_FALLABLE!
        assertEquals(emptyList<MootFall>(), supersededByExecution(executed, listOf(executed)))
    }

    @Test fun `leaves a decided motion alone — the committee already decided it`() {
        for (status in listOf("passed", "voting", "executed", "failed", "dropped")) {
            val executed = motion("set_agenda", status = "executed")
            val victim = motion("set_agenda", status = status)
            assertEquals(status, emptyList<MootFall>(), supersededByExecution(executed, listOf(executed, victim)))
        }
    }

    @Test fun `a mod_caucus that executes drops competing mod, unmod AND extend motions`() {
        val executed = motion("mod_caucus", params = MotionParams(topic = "Piracy"), status = "executed")
        val rivals = listOf(motion("mod_caucus"), motion("unmod_caucus"), motion("extend_caucus"))
        val bystander = motion("open_gsl")

        val falls = supersededByExecution(executed, listOf(executed) + rivals + bystander)

        assertEquals(rivals.map { it.id }.sorted(), ids(falls).sorted())
        assertTrue(codes(falls).all { it == "caucus_superseded" })
    }

    @Test fun `tells a superseded extension why, in its own words`() {
        val executed = motion("unmod_caucus", status = "executed")
        val falls = supersededByExecution(executed, listOf(executed, motion("extend_caucus")))
        assertTrue(falls[0].ruling.reason.contains("would have extended"))
    }

    @Test fun `TRAP - an extend_caucus that executes does NOT drop a motion for a new caucus`() {
        val executed = motion("extend_caucus", status = "executed")
        val newCaucus = motion("mod_caucus")
        val rivalExtension = motion("extend_caucus")

        val falls = supersededByExecution(executed, listOf(executed, newCaucus, rivalExtension))

        assertEquals(listOf(rivalExtension.id), ids(falls))
    }

    @Test fun `introduce_document drops only motions naming the same documentId`() {
        val executed = motion("introduce_document", params = MotionParams(documentId = "doc_a"), status = "executed")
        val same = motion("introduce_document", params = MotionParams(documentId = "doc_a"))
        val different = motion("introduce_document", params = MotionParams(documentId = "doc_b"))

        val falls = supersededByExecution(executed, listOf(executed, same, different))

        assertEquals(listOf(same.id), ids(falls))
    }

    @Test fun `an introduce_document carrying no documentId supersedes nothing`() {
        val executed = motion("introduce_document", status = "executed")
        assertEquals(emptyList<MootFall>(), supersededByExecution(executed, listOf(executed, motion("introduce_document"))))
    }

    @Test fun `adjourn drops every live motion, custom included`() {
        val executed = motion("adjourn", status = "executed")
        val rest = listOf(motion("custom"), motion("mod_caucus"), motion("introduce_document"), motion("open_gsl"))

        val falls = supersededByExecution(executed, listOf(executed) + rest)

        assertEquals(rest.map { it.id }.sorted(), ids(falls).sorted())
        assertTrue(codes(falls).all { it == "adjourned_first" })
    }

    @Test fun `suspend drops only other suspend motions`() {
        val executed = motion("suspend", status = "executed")
        val falls = supersededByExecution(executed, listOf(executed, motion("suspend"), motion("mod_caucus")))
        assertEquals(listOf("suspend_superseded"), codes(falls))
    }

    @Test fun `custom supersedes nothing — its intent is unknowable`() {
        val executed = motion("custom", status = "executed")
        assertEquals(emptyList<MootFall>(), supersededByExecution(executed, listOf(executed, motion("custom"), motion("open_gsl"))))
    }

    @Test fun `returns empty on an empty queue`() {
        assertEquals(emptyList<MootFall>(), supersededByExecution(motion("set_agenda", status = "executed"), emptyList()))
    }

    // ── gslIsOpen — the definition gateAdvice shares ────────────────────────────

    @Test fun `an executed open_gsl motion opens it`() {
        assertTrue(gslIsOpen(gslState(), listOf(motion("open_gsl", status = "executed"))))
    }

    @Test fun `a non-empty queue opens it`() {
        val g = gslState(queue = listOf(SpeakerSlot(delegateId = "u1", country = "fr", applicationId = "a1")))
        assertTrue(gslIsOpen(g, emptyList()))
    }

    @Test fun `an active speaker opens it`() {
        val g = gslState(activeSpeaker = SpeakerSlot(delegateId = "u1", country = "fr", applicationId = "a1"))
        assertTrue(gslIsOpen(g, emptyList()))
    }

    @Test fun `a merely pending open_gsl motion does not`() {
        assertFalse(gslIsOpen(gslState(), listOf(motion("open_gsl"))))
    }

    @Test fun `gslIsOpen handles an absent gsl object`() {
        assertFalse(gslIsOpen(null, emptyList()))
    }

    // ── gslSpokenThrough — finished vs nobody joined ────────────────────────────

    private val slot = SpeakerSlot(delegateId = "u1", country = "fr", applicationId = "a1")

    @Test fun `a drained list with speeches behind it is spoken through`() {
        assertTrue(gslSpokenThrough(gslState(spoken = 3)))
    }

    @Test fun `one speech is enough`() {
        assertTrue(gslSpokenThrough(gslState(spoken = 1)))
    }

    @Test fun `an empty list nobody has joined is NOT — this is the whole distinction`() {
        assertFalse(gslSpokenThrough(gslState(spoken = 0)))
    }

    @Test fun `absent spoken reads as zero, so pre-existing sessions keep asking for signups`() {
        assertFalse(gslSpokenThrough(gslState()))
    }

    @Test fun `a re-seeded queue is not spoken through, however many spoke before`() {
        assertFalse(gslSpokenThrough(gslState(spoken = 4, queue = listOf(slot))))
    }

    @Test fun `nor is a list with somebody still on the floor`() {
        assertFalse(gslSpokenThrough(gslState(spoken = 4, activeSpeaker = slot)))
    }

    @Test fun `gslSpokenThrough handles an absent gsl object`() {
        assertFalse(gslSpokenThrough(null))
    }

    // ── coverage and copy (the supersession half only) ──────────────────────────

    @Test fun `every supersession MootCode is produced by at least one fixture`() {
        val produced = sortedSetOf<String>()
        val pairs = listOf(
            "set_agenda" to "set_agenda", "open_gsl" to "open_gsl",
            "mod_caucus" to "unmod_caucus", "extend_caucus" to "extend_caucus",
            "move_to_voting" to "move_to_voting", "suspend" to "suspend", "adjourn" to "custom",
        )
        for ((ran, victimType) in pairs) {
            val executed = motion(ran, status = "executed")
            for (f in supersededByExecution(executed, listOf(executed, motion(victimType)))) produced += f.ruling.code
        }
        val docExec = motion("introduce_document", params = MotionParams(documentId = "d"), status = "executed")
        for (f in supersededByExecution(docExec, listOf(docExec, motion("introduce_document", params = MotionParams(documentId = "d"))))) {
            produced += f.ruling.code
        }
        assertEquals(
            listOf(
                "adjourned_first", "agenda_superseded", "caucus_superseded", "extension_superseded",
                "gsl_superseded", "introduce_superseded", "suspend_superseded", "voting_superseded",
            ),
            produced.toList(),
        )
    }

    // ── motionOutcomeWord ───────────────────────────────────────────────────────

    @Test fun `an auto-fallen motion reads 'out of order', not 'dismissed'`() {
        assertEquals("out of order", motionOutcomeWord(Motion(status = "dropped", autoResolved = true)))
    }

    @Test fun `a chair's own dismissal still reads 'dismissed'`() {
        assertEquals("dismissed", motionOutcomeWord(Motion(status = "dropped")))
        assertEquals("dismissed", motionOutcomeWord(Motion(status = "dropped", autoResolved = false)))
    }

    @Test fun `passes every other status through unchanged`() {
        assertEquals("executed", motionOutcomeWord(Motion(status = "executed")))
        assertEquals("failed", motionOutcomeWord(Motion(status = "failed")))
    }

    // ── Kotlin-only drift guards ────────────────────────────────────────────────

    @Test fun `DRIFT - an introduce_document with an EMPTY documentId supersedes nothing, like a missing one`() {
        // TS: `if (!docId) return []` — "" is falsy.
        val executed = motion("introduce_document", params = MotionParams(documentId = ""), status = "executed")
        val blank = motion("introduce_document", params = MotionParams(documentId = ""))
        assertEquals(emptyList<MootFall>(), supersededByExecution(executed, listOf(executed, blank)))
    }
}
