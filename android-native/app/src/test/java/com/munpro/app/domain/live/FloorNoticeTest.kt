package com.munpro.app.domain.live

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// The lock-screen words (mockup "Lock screen": "Algeria 0:42 / You speak 3rd, in about 2 minutes").
class FloorNoticeTest {
    private val NOW = 1_800_000_000_000L
    private val ME = "u_fr"

    private fun slot(id: String, country: String) = SpeakerSlot(delegateId = id, country = country)
    private fun paused(ms: Long) = TimerState(running = false, endsAt = null, pausedRemainingMs = ms, durationMs = 90_000)
    private fun running(ms: Long) = TimerState(running = true, endsAt = NOW + ms, pausedRemainingMs = null, durationMs = 90_000)

    private fun gsl(holder: SpeakerSlot?, timer: TimerState, queue: List<SpeakerSlot> = emptyList(), secs: Int = 60) =
        LiveSession(phase = Phase.GSL, gsl = GslState(defaultSpeakerSecs = secs, queue = queue, activeSpeaker = holder, timer = timer))

    @Test fun `a paused speech puts the time left in the title`() {
        val n = floorNotice(gsl(slot("u_dz", "dz"), paused(42_000)), ME, NOW)!!
        assertEquals("Algeria 0:42", n.title)
        assertNull(n.countdownTo)
    }

    @Test fun `a running speech hands the countdown to the system clock`() {
        val n = floorNotice(gsl(slot("u_dz", "dz"), running(42_000)), ME, NOW)!!
        assertEquals("Algeria", n.title)
        assertEquals(NOW + 42_000, n.countdownTo)
    }

    @Test fun `your place on the list, with the mockup's estimate`() {
        // 42 s left, then two 60 s speakers ahead: 162 s, about 3 minutes.
        val q = listOf(slot("a", "us"), slot("b", "gb"), slot(ME, "fr"))
        assertEquals("You speak 3rd, in about 3 minutes", floorNotice(gsl(slot("u_dz", "dz"), running(42_000), q), ME, NOW)!!.text)
    }

    @Test fun `first on the list is next, and never less than a minute away`() {
        val q = listOf(slot(ME, "fr"))
        assertEquals("You speak next, in about 1 minute", floorNotice(gsl(slot("u_dz", "dz"), running(5_000), q), ME, NOW)!!.text)
    }

    @Test fun `your own speech`() {
        assertEquals("You have the floor", floorNotice(gsl(slot(ME, "fr"), running(30_000)), ME, NOW)!!.title)
        assertEquals("Waiting for the chair to start your time", floorNotice(gsl(slot(ME, "fr"), paused(30_000)), ME, NOW)!!.text)
    }

    @Test fun `nobody speaking shows the phase`() {
        val n = floorNotice(gsl(null, paused(60_000)), ME, NOW)!!
        assertEquals("General speakers list", n.title)
        assertEquals("", n.text)
    }

    @Test fun `a moderated caucus reads its own speaker, clock and list`() {
        val s = LiveSession(
            phase = Phase.MOD_CAUCUS,
            gsl = GslState(defaultSpeakerSecs = 90, queue = listOf(slot(ME, "fr")), timer = paused(90_000)),
            caucus = CaucusState(kind = "moderated", perSpeakerSecs = 45, currentSpeaker = slot("u_dz", "dz"),
                speakerTimer = paused(20_000), queue = listOf(slot("a", "us"), slot(ME, "fr"))),
        )
        val n = floorNotice(s, ME, NOW)!!
        assertEquals("Algeria 0:20", n.title)
        assertEquals("You speak 2nd, in about 1 minute", n.text)
    }

    @Test fun `an open vote says whether you have voted`() {
        val vote = ActiveVote(voteId = "v", motion = "Moderated caucus")
        assertEquals("Vote open on Moderated caucus", floorNotice(LiveSession(phase = Phase.VOTING, activeVote = vote), ME, NOW)!!.text)
        val cast = vote.copy(ballots = mapOf(ME to "yes"))
        assertEquals("You voted on Moderated caucus", floorNotice(LiveSession(phase = Phase.VOTING, activeVote = cast), ME, NOW)!!.text)
    }

    @Test fun `the notice goes away when the sitting ends`() {
        assertNull(floorNotice(LiveSession(phase = Phase.CLOSED), ME, NOW))
        assertNull(floorNotice(LiveSession(phase = Phase.GSL, finalized = true), ME, NOW))
    }

    @Test fun ordinals() {
        assertEquals(listOf("1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st", "111th"),
            listOf(1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111).map(::ordinal))
    }
}
