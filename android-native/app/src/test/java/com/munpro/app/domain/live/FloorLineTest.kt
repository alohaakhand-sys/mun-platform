package com.munpro.app.domain.live

import org.junit.Assert.assertEquals
import org.junit.Test

// The floor line the chair console and the watch board share.
class FloorLineTest {
    private val NOW = 1_800_000_000_000L

    @Test fun `an open motions window reads as open`() {
        val s = LiveSession(phase = Phase.GSL, floorGate = FloorGate(kind = "motions", endsAt = NOW + 30_000))
        assertEquals("motions" to "The floor is open for motions", floorLine(s, NOW))
    }

    @Test fun `a lapsed window is a closed floor`() {
        val s = LiveSession(phase = Phase.GSL, floorGate = FloorGate(kind = "motions", endsAt = NOW - 1))
        assertEquals("locked" to "The floor is closed", floorLine(s, NOW))
    }

    @Test fun `a running vote outranks the window and drops the chair's label`() {
        val s = LiveSession(phase = Phase.VOTING, floorGate = FloorGate(kind = "motions", label = "Motions please"),
            activeVote = ActiveVote(voteId = "v", motion = "Mod caucus"))
        assertEquals("A vote is running", floorLine(s, NOW).second)
    }

    @Test fun `no gate at all is a closed floor`() {
        assertEquals("locked" to "The floor is closed", floorLine(LiveSession(phase = Phase.GSL), NOW))
    }
}
