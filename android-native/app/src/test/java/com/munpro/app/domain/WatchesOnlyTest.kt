package com.munpro.app.domain

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// Who gets the watch-only console from an application (6.5).
class WatchesOnlyTest {
    private fun conf(app: ApplicationData) = Conference(app, EventData(id = "e1"))

    @Test fun `an approved observer placed in a committee watches`() {
        assertTrue(watchesOnly(conf(ApplicationData(role = "Observer", status = "approved", assignedCommittee = "GA"))))
    }

    @Test fun `a delegate never watches, and a pending observer isn't in yet`() {
        assertFalse(watchesOnly(conf(ApplicationData(role = "Delegate", status = "approved", assignedCommittee = "GA"))))
        assertFalse(watchesOnly(conf(ApplicationData(role = "Observer", status = "pending", assignedCommittee = "GA"))))
    }

    @Test fun `a staff seat with a committee is not a watch-only applicant`() {
        // ApplicationRepo turns accepted staff seats into approved entries; a chair or a scoped
        // USG must not also get the observer console (the regression this guards).
        assertFalse(watchesOnly(conf(ApplicationData(role = "Under-Secretary-General", status = "approved", assignedCommittee = "GA", fromStaffSeat = true))))
        assertFalse(watchesOnly(conf(ApplicationData(role = "Chair", status = "approved", assignedCommittee = "GA", fromStaffSeat = true))))
    }
}
