package com.munpro.app.domain.live

import org.junit.Assert.assertEquals
import org.junit.Test

// The day's participation report (sessionService buildCommitteeReport and helpers).
class ReportTest {
    private fun pt(d: String, type: String, status: String = "pending") = RaisedPoint(delegateId = d, type = type, status = status)

    @Test fun `points count pending and recognised, never dismissed`() {
        val pts = listOf(pt("fr", "order"), pt("fr", "order", "recognized"), pt("fr", "information", "dismissed"), pt("us", "order"))
        assertEquals(mapOf("order" to 2, "information" to 0, "personal_privilege" to 0, "parliamentary_inquiry" to 0), summarizePoints(pts, "fr"))
    }

    @Test fun `yields come from the log's yield entries only`() {
        val log = listOf(
            MotionLogEntry(kind = "yield", byDelegateId = "fr", targetCountry = "us", targetDelegateId = "u1"),
            MotionLogEntry(kind = "point", byDelegateId = "fr", targetCountry = "us"),
            MotionLogEntry(kind = "yield", byDelegateId = "us", targetCountry = "fr"),
        )
        assertEquals(listOf(YieldGiven("us", "u1")), yieldsFor(log, "fr"))
    }

    @Test fun `motionsProposed falls back to executed motions on old docs`() {
        val row = toReportRow(ParticipationSummary(delegateId = "fr", motions = 2), emptyList(), emptyList())
        assertEquals(2L, row.motionsProposed)
        assertEquals(5L, toReportRow(ParticipationSummary(delegateId = "fr", motions = 2, motionsProposed = 5), emptyList(), emptyList()).motionsProposed)
    }

    @Test fun `committee totals, seated count, country order and vote order`() {
        val r = buildCommitteeReport(
            participation = listOf(
                ParticipationSummary(delegateId = "u", country = "us", attendanceStatus = "present_and_voting", speeches = 2, speakingSeconds = 80.4),
                ParticipationSummary(delegateId = "f", country = "fr", attendanceStatus = "present", speeches = 1, speakingSeconds = 45.0),
                ParticipationSummary(delegateId = "c", country = "cn", attendanceStatus = "absent"),
            ),
            points = listOf(pt("f", "order")),
            votes = listOf(FinishedVoteRecord(motion = "B", closedAt = 2), FinishedVoteRecord(motion = "A", closedAt = 1)),
            motions = emptyList(), quorum = 2,
        )
        assertEquals(listOf("cn", "fr", "us"), r.rows.map { it.country })
        assertEquals(2, r.present)
        assertEquals(3L, r.totalSpeeches)
        assertEquals("2:05", fmtSpeaking(r.totalSpeakingSeconds))
        assertEquals(1, r.rows.first { it.country == "fr" }.pointsTotal)
        assertEquals(listOf("A", "B"), r.votes.map { it.motion })
    }

    @Test fun `the roll decides attendance and adds delegations that never acted`() {
        val r = buildCommitteeReport(
            participation = listOf(ParticipationSummary(delegateId = "f", country = "fr", speeches = 3)),
            points = emptyList(), votes = emptyList(), motions = emptyList(), quorum = 1,
            roll = mapOf(
                "f" to AttendanceEntry(status = "present", country = "fr"),
                "b" to AttendanceEntry(status = "present_and_voting", country = "br", applicationId = "a1"),
            ),
        )
        assertEquals(listOf("br" to "present_and_voting", "fr" to "present"), r.rows.map { it.country to it.attendanceStatus })
        assertEquals(2, r.present)
        assertEquals(3L, r.rows.first { it.country == "fr" }.speeches)
    }

    @Test fun `a doc's status stands when the roll has no entry`() {
        assertEquals("late", withRollAttendance(listOf(ParticipationSummary(delegateId = "c", attendanceStatus = "late")), emptyMap()).single().attendanceStatus)
    }
}
