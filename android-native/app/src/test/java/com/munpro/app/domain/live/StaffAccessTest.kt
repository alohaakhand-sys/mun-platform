package com.munpro.app.domain.live

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// Mirrors the chair console's canControl / canDais and the rules' canRunSession / canWriteMarking
// (scripts/rules/rules-check.mjs has the same cases against the emulator).
class StaffAccessTest {
    private val UN = "United Nations Security Council"
    private val GA = "General Assembly"

    @Test fun `a chair runs and answers only their own committee`() {
        val a = StaffAccess(role = "chair", committeeId = UN)
        assertTrue(a.canControl(UN)); assertTrue(a.canDais(UN))
        assertFalse(a.canControl(GA)); assertFalse(a.canDais(GA))
    }

    @Test fun `a vice-chair is chair tier, and acts as a delegate only with delegate power`() {
        assertTrue(StaffAccess(role = "vice-chair", committeeId = UN).canControl(UN))
        assertFalse(StaffAccess(role = "vice-chair", committeeId = UN).canActAsDelegate)
        assertTrue(StaffAccess(role = "vice-chair", committeeId = UN, delegatePower = true).canActAsDelegate)
    }

    @Test fun `co-organizer is not chair tier even though the word contains chair`() {
        val a = StaffAccess(role = "co-organizer")
        assertFalse(a.isChairTier)
        assertTrue(a.canControl(UN)); assertTrue(a.canDais(GA))
    }

    @Test fun `the owner runs every committee`() {
        assertTrue(StaffAccess(isOwner = true).canControl(GA))
    }

    @Test fun `a scoped USG runs their committee but never reads the dais notes`() {
        val a = StaffAccess(role = "usg", committeeId = UN)
        assertTrue(a.canControl(UN)); assertFalse(a.canDais(UN))
        assertFalse(a.canControl(GA)); assertTrue(a.canWatch(GA))
    }

    @Test fun `an event-wide USG runs every committee`() {
        assertTrue(StaffAccess(role = "usg", committeeId = "").canControl(GA))
    }

    @Test fun `canMarkDelegates runs the sitting and answers the dais`() {
        val a = StaffAccess(role = "observer", permissions = mapOf("canMarkDelegates" to true))
        assertTrue(a.canControl(GA)); assertTrue(a.canDais(GA))
    }

    @Test fun `observers and faculty advisors watch`() {
        listOf("observer", "faculty-advisor").forEach { role ->
            val a = StaffAccess(role = role)
            assertFalse(a.canControl(UN)); assertTrue(a.canWatch(UN))
        }
    }

    @Test fun `no staff doc means no seat at all`() {
        val a = StaffAccess()
        assertFalse(a.canControl(UN)); assertFalse(a.canWatch(UN))
    }
}
