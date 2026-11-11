package com.munpro.app.domain.live

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// PORTED FROM src/lib/services/yieldClock.test.ts — case for case.
// The Kotlin signature is yieldGrantMs(Int?, Long): a fractional, NaN, ±Infinity or undefined carry
// cannot be expressed, so those individual assertions are not ported (noted inline). Every
// representable input in each case is.

class YieldClockTest {
    @Test fun `adds the remainder to the recipient's own allotment`() {
        assertEquals(60_000L, yieldGrantMs(50, 10_000))
    }

    @Test fun `gives a full speech when nothing is left to carry`() {
        assertEquals(50_000L, yieldGrantMs(50, 0))
    }

    @Test fun `rounds a fractional carry — endsAt is an integer epoch`() {
        assertEquals(60_499L, yieldGrantMs(50, 10_499))
        // not portable: yieldGrantMs(50, 10_500.7) == 60_501 — a Long carry has no fraction to round.
    }

    @Test fun `falls back to the 90s default when defaultSpeakerSecs is missing`() {
        assertEquals(DEFAULT_SPEAKER_SECS * 1000L + 10_000, yieldGrantMs(null, 10_000))
    }

    @Test fun `treats a zero or negative allotment as unset rather than as a zero-length speech`() {
        assertEquals(DEFAULT_SPEAKER_SECS * 1000L + 10_000, yieldGrantMs(0, 10_000))
        assertEquals(DEFAULT_SPEAKER_SECS * 1000L + 10_000, yieldGrantMs(-30, 10_000))
    }

    @Test fun `degrades garbage carry to no carry, never to a short speech`() {
        assertEquals(50_000L, yieldGrantMs(50, -5_000))
        // not portable: NaN, Infinity and undefined carries (no Long encoding).
    }

    @Test fun `never returns less than the base allotment`() {
        // TS rows: -1, 0, NaN, Infinity, -Infinity, 1, 999_999 — the Long-representable ones.
        for (carried in listOf(-1L, 0L, 1L, 999_999L, Long.MIN_VALUE)) {
            assertTrue("carried=$carried", yieldGrantMs(50, carried) >= 50_000)
        }
    }
}
