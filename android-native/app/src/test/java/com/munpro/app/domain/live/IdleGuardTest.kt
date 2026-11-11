package com.munpro.app.domain.live

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// ChairSessionConsole.IdleGuard: only an empty, running floor counts as idle.
class IdleGuardTest {
    private val T = 1_800_000_000_000L

    @Test fun `an empty running floor is idle since the later of the last write and keep-alive`() {
        val s = LiveSession(phase = Phase.GSL, updatedAt = T, live = LiveStageState(keepAliveAt = T + 5_000))
        assertEquals(T + 5_000, idleSince(s))
    }

    @Test fun `a speaker, a queue, a caucus or a vote keeps the sitting awake`() {
        val slot = SpeakerSlot(delegateId = "d", country = "fr")
        assertNull(idleSince(LiveSession(phase = Phase.GSL, gsl = GslState(activeSpeaker = slot))))
        assertNull(idleSince(LiveSession(phase = Phase.GSL, gsl = GslState(queue = listOf(slot)))))
        assertNull(idleSince(LiveSession(phase = Phase.MOD_CAUCUS, caucus = CaucusState(kind = "moderated"))))
        assertNull(idleSince(LiveSession(phase = Phase.VOTING, activeVote = ActiveVote(voteId = "v"))))
    }

    @Test fun `closed, suspended and finalized sittings are not watched`() {
        assertNull(idleSince(LiveSession(phase = Phase.CLOSED)))
        assertNull(idleSince(LiveSession(phase = Phase.SUSPENDED)))
        assertNull(idleSince(LiveSession(phase = Phase.GSL, finalized = true)))
    }
}
