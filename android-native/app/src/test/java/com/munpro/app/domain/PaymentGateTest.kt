package com.munpro.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

// PORTED FROM src/lib/services/paymentGate.test.ts — case for case. Dates are parsed with
// jsDateMs (JS `new Date(string)` semantics: offset-less date-times are LOCAL), so the expected
// values come out of the same parser the code under test uses, exactly as the TS test does.

class PaymentGateTest {
    // Mirrors the live DMUNC '26 config: $25 Delegate, $15 Head Delegate, early-bird window
    // open with no separate early price (so the base price applies), free Observer.
    private val EVENT = EventData(
        id = "evt1",
        date = "2026-08-15T09:00",
        applicationSchedule = ApplicationSchedule(earlyBird = Window(enabled = true, endAt = "2026-08-01T11:55")),
        roleTiers = listOf(
            RoleTier(role = "Delegate", enabled = true, price = 25.0, label = "Delegate"),
            RoleTier(role = "Head Delegate", enabled = true, price = 15.0),
            RoleTier(role = "Observer", enabled = false, price = 0.0),
            RoleTier(role = "Team Delegation Lead", enabled = true, price = 40.0),
        ),
    )

    private val FREE_EVENT = EventData(
        id = "evt2",
        date = "2026-08-15T09:00",
        roleTiers = listOf(RoleTier(role = "Delegate", enabled = true, price = 0.0)),
    )

    private val NOW = Instant.parse("2026-07-28T10:00:00Z").toEpochMilli()

    private fun app(role: String = "Delegate", status: String = "pending", paymentStatus: String? = null, teamSize: Int? = null) =
        ApplicationData(role = role, status = status, paymentStatus = paymentStatus, teamSize = teamSize)

    // ── getPaymentGate ──────────────────────────────────────────────────────────

    @Test fun `blocks the portal for an unpaid delegate on a paid event`() {
        val g = getPaymentGate(app(), EVENT, NOW)
        assertTrue(g.required)
        assertEquals(25.0, g.amount, 0.0)
        assertEquals("due", g.status)
        assertTrue(g.blocksPortal)
        assertFalse(g.overdue)
    }

    @Test fun `lets a paid delegate through`() {
        val g = getPaymentGate(app(paymentStatus = "paid"), EVENT, NOW)
        assertEquals("paid", g.status)
        assertFalse(g.blocksPortal)
    }

    @Test fun `never gates a free event`() {
        val g = getPaymentGate(app(), FREE_EVENT, NOW)
        assertFalse(g.required)
        assertFalse(g.blocksPortal)
    }

    @Test fun `never gates a free ROLE on a paid event`() {
        val g = getPaymentGate(app(role = "Observer"), EVENT, NOW)
        assertFalse(g.required)
        assertFalse(g.blocksPortal)
    }

    @Test fun `prices each role from its own tier`() {
        assertEquals(15.0, getPaymentGate(app(role = "Head Delegate"), EVENT, NOW).amount, 0.0)
    }

    @Test fun `multiplies a team role by member count`() {
        assertEquals(160.0, getPaymentGate(app(role = "Team Delegation Lead", teamSize = 4), EVENT, NOW).amount, 0.0)
    }

    @Test fun `uses the active pricing window's deadline as the due date`() {
        val g = getPaymentGate(app(), EVENT, NOW)
        assertEquals(jsDateMs("2026-08-01T11:55"), g.dueAt)
        assertTrue((g.daysLeft ?: 0) > 0)
    }

    @Test fun `flags overdue once the window has passed`() {
        val late = Instant.parse("2026-08-14T10:00:00Z").toEpochMilli() // past early-bird end, before event
        val g = getPaymentGate(app(), EVENT, late)
        assertTrue(g.overdue)
        assertTrue(g.blocksPortal)
        assertMatches("overdue", formatDueLabel(g))
    }

    @Test fun `says 'Overdue', never 'Due today', in the hours just past the deadline`() {
        // Regular-phase deadline is event start - 1 day = 2026-08-14T09:00 local.
        val justPast = jsDateMs("2026-08-14T09:00")!! + 60 * 60 * 1000
        val g = getPaymentGate(app(), EVENT, justPast)
        assertTrue(g.overdue)
        assertEquals("Overdue", formatDueLabel(g))
    }

    @Test fun `stops demanding money from a rejected or withdrawn application`() {
        assertFalse(getPaymentGate(app(status = "rejected"), EVENT, NOW).blocksPortal)
        assertFalse(getPaymentGate(app(status = "withdrawn"), EVENT, NOW).blocksPortal)
    }

    @Test fun `is inert without an application or event`() {
        assertFalse(getPaymentGate(null, EVENT, NOW).blocksPortal)
        assertFalse(getPaymentGate(app(), null, NOW).blocksPortal)
    }

    // ── formatting ──────────────────────────────────────────────────────────────

    @Test fun `drops cents on whole amounts`() {
        assertEquals("$25", formatFee(25.0))
        assertEquals("$1,250", formatFee(1250.0))
        assertEquals("$12.50", formatFee(12.5))
    }

    private fun bare(dueAt: Long?, daysLeft: Long?, overdue: Boolean = false) = PaymentGate(
        required = false, amount = 0.0, tierLabel = "", status = "", dueAt = dueAt, daysLeft = daysLeft,
        overdue = overdue, blocksPortal = false,
    )

    @Test fun `labels the countdown`() {
        assertEquals("Due today", formatDueLabel(bare(dueAt = 1, daysLeft = 0)))
        assertEquals("1 day left", formatDueLabel(bare(dueAt = 1, daysLeft = 1)))
        assertEquals("5 days left", formatDueLabel(bare(dueAt = 1, daysLeft = 5)))
        assertEquals("2 days overdue", formatDueLabel(bare(dueAt = 1, daysLeft = -2, overdue = true)))
        assertEquals("Overdue", formatDueLabel(bare(dueAt = 1, daysLeft = 0, overdue = true)))
    }
}
