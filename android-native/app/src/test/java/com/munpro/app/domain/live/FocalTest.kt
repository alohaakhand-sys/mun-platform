package com.munpro.app.domain.live

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// The room's precedence ladder (focalState.ts): one order for the projector and the delegate.
class FocalTest {
    private val speaker = SpeakerSlot(delegateId = "fr", country = "fr")
    private val gsl = GslState(queue = listOf(SpeakerSlot(delegateId = "us", country = "us")), activeSpeaker = speaker)

    @Test fun `an open vote outranks a published result and everything else`() {
        val s = LiveSession(phase = Phase.VOTING, gsl = gsl, activeVote = ActiveVote(voteId = "v", motion = "M"), publishedResult = PublishedVoteResult(voteId = "old"))
        assertTrue(resolveFocal(s) is Focal.Vote)
    }

    @Test fun `a result holds the room over a paper on screen`() {
        val s = LiveSession(phase = Phase.GSL, publishedResult = PublishedVoteResult(voteId = "r"), publishedDoc = PublishedDocRef(docId = "d"))
        assertTrue(resolveFocal(s) is Focal.Result)
    }

    @Test fun `a caucus outranks the suspended GSL's stale speaker`() {
        val s = LiveSession(phase = Phase.MOD_CAUCUS, gsl = gsl, caucus = CaucusState(kind = "moderated", queue = listOf(speaker)))
        val f = resolveFocal(s)
        assertTrue(f is Focal.Caucus)
        assertEquals("caucus", focalQueue(s, f).first)
    }

    @Test fun `an unmoderated caucus has no speaking order`() {
        val s = LiveSession(phase = Phase.UNMOD_CAUCUS, gsl = gsl, caucus = CaucusState(kind = "unmoderated"))
        assertEquals("none" to emptyList<SpeakerSlot>(), focalQueue(s, resolveFocal(s)))
    }

    @Test fun `the GSL speaker, then roll call, then calm`() {
        val s = LiveSession(phase = Phase.GSL, gsl = gsl)
        assertEquals(Focal.Speaker(speaker), resolveFocal(s))
        assertEquals("gsl" to gsl.queue, focalQueue(s, resolveFocal(s)))
        assertEquals(Focal.RollCall, resolveFocal(LiveSession(phase = Phase.ROLL_CALL)))
        assertEquals(Focal.Calm, resolveFocal(LiveSession(phase = Phase.LOBBY)))
    }
}
