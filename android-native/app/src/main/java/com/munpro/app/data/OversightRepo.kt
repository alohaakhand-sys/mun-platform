package com.munpro.app.data

// The Executive Board and read-only staff (board B5; web dashboard/eb and dashboard/observer).
// Same reads as the web: this account's accepted staff seats (one collection-group query), and
// per event the staff list, the applications and each committee's markings and study guide.
// Chair moves and removals are staff-doc writes the rules allow an EB member in scope, followed
// by /api/members/sync so the chair's access follows at once.

import com.google.firebase.firestore.FirebaseFirestore
import com.munpro.app.AppGraph
import com.munpro.app.domain.Announcement
import com.munpro.app.domain.EventData
import com.munpro.app.domain.belongsToCommittee
import com.munpro.app.domain.computeDailyScore
import com.munpro.app.domain.markingMode
import com.munpro.app.domain.isChairTierRole
import com.munpro.app.domain.isExecBoardRole
import com.munpro.app.domain.isUserInAudience
import com.munpro.app.domain.sameCommittee
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

/** One accepted staff doc of mine: the event, my role and scope (empty committee = event-wide). */
@Serializable
data class StaffSeat(val eventId: String, val role: String, val committeeId: String = "", val permissions: Map<String, Boolean> = emptyMap())

/** A chair-tier staff doc, with its doc id for moves and removals. */
@Serializable
data class ChairSeat(val docId: String, val uid: String, val name: String, val role: String, val committeeId: String)

@Serializable
data class CommitteeOversight(val name: String, val delegates: Int, val graded: Int, val chairs: List<ChairSeat>, val hasGuide: Boolean)

@Serializable
data class EventOversight(val event: EventData, val role: String, val scopeAll: Boolean, val committees: List<CommitteeOversight>) {
    val scope: List<String> get() = committees.map { it.name }
}

@Serializable
data class RosterLine(val name: String, val committee: String, val country: String)

@Serializable
data class ObservedEvent(
    val event: EventData, val role: String, val committeeId: String,
    val announcements: List<Announcement>,
    /** null = the organizer hasn't granted View applications. */
    val roster: List<RosterLine>?,
)

fun isObserverSeatRole(role: String) = role.lowercase().let { it == "observer" || it == "faculty-advisor" || it == "faculty_advisor" }

class OversightRepo {
    private val db = FirebaseFirestore.getInstance()

    suspend fun mySeats(uid: String): List<StaffSeat> =
        db.collectionGroup("staff").whereEqualTo("uid", uid).whereEqualTo("inviteStatus", "accepted").get().await().documents.map { d ->
            @Suppress("UNCHECKED_CAST")
            StaffSeat(
                d.reference.path.split("/")[1], d.getString("role").orEmpty(), d.getString("committeeId").orEmpty(),
                (d.get("permissions") as? Map<String, Any?>).orEmpty().mapValues { it.value == true },
            )
        }

    private suspend fun chairs(eventId: String): List<ChairSeat> =
        db.collection("events").document(eventId).collection("staff").get().await().documents.mapNotNull { d ->
            val role = d.getString("role").orEmpty()
            if (d.getString("inviteStatus") != "accepted" || !isChairTierRole(role)) return@mapNotNull null
            ChairSeat(d.id, d.getString("uid") ?: d.id, d.getString("name").orEmpty().ifEmpty { d.getString("email").orEmpty() }, role, d.getString("committeeId").orEmpty())
        }

    private suspend fun profileName(uid: String): String? = runCatching {
        // deriveName: display name, else first + last, never a raw email.
        val u = db.collection("users").document(uid).get().await()
        u.getString("displayName")?.trim()?.takeIf { it.isNotEmpty() && "@" !in it }
            ?: listOfNotNull(u.getString("firstName"), u.getString("lastName")).joinToString(" ").trim().ifEmpty { null }
    }.getOrNull()

    /** dashboard/eb: every committee in each EB seat's scope, with its grading, guide and chairs. */
    suspend fun execBoard(seats: List<StaffSeat>): List<EventOversight> = seats.filter { isExecBoardRole(it.role) }.mapNotNull { s ->
        val event = AppGraph.events.getEventById(s.eventId) ?: return@mapNotNull null
        // A staff doc keeps the name from its invite ("Pending User"); the chair's profile has the real one.
        val staff = runCatching { chairs(s.eventId) }.getOrDefault(emptyList()).map { ch -> profileName(ch.uid)?.let { ch.copy(name = it) } ?: ch }
        val templates = event.markingTemplates
        val mode = markingMode(event)
        val apps = runCatching { AppGraph.applications.getApplicationsByEvent(s.eventId) }.getOrDefault(emptyList())
        val scope = if (s.committeeId.isNotEmpty()) listOf(s.committeeId) else event.committees.map { it.name }.filter { it.isNotEmpty() }
        val committees = scope.map { name ->
            val delegates = apps.filter { Regex("delegate", RegexOption.IGNORE_CASE).containsMatchIn(it.role) && it.status == "approved" && belongsToCommittee(it, name) }
            val marks = runCatching { AppGraph.markings.committee(s.eventId, name) }.getOrDefault(emptyList())
            // Graded = has a scored day, as the committee hub counts it.
            val graded = marks.filter { !it.dateStr.isNullOrEmpty() && computeDailyScore(it, templates, mode).present }.map { it.delegateId }.toSet().count { id -> delegates.any { it.userId == id } }
            val guide = runCatching { AppGraph.chairHub.hasStudyGuide(s.eventId, name) }.getOrDefault(false)
            CommitteeOversight(name, delegates.size, graded, staff.filter { sameCommittee(it.committeeId, name) }, guide)
        }
        EventOversight(event, s.role, s.committeeId.isEmpty(), committees)
    }

    /** staffService.updateStaffMember({ committeeId }) for a chair, then their access follows. */
    suspend fun moveChair(eventId: String, chair: ChairSeat, committee: String) {
        db.collection("events").document(eventId).collection("staff").document(chair.docId).update("committeeId", committee).await()
        sync(eventId, chair.uid)
    }

    /** staffService.removeStaffMember: the seat goes, and so does the access it gave. */
    suspend fun removeChair(eventId: String, chair: ChairSeat) {
        db.collection("events").document(eventId).collection("staff").document(chair.docId).delete().await()
        sync(eventId, chair.uid)
    }

    private suspend fun sync(eventId: String, uid: String) {
        runCatching {
            Api.send("/api/members/sync", "POST", buildJsonObject { put("eventId", eventId); putJsonArray("userIds") { add(uid) } }.toString())
        }
    }

    /** dashboard/observer: each observer / faculty seat's event, its recent news and (if granted) the roster. */
    suspend fun observed(seats: List<StaffSeat>): List<ObservedEvent> = seats.filter { isObserverSeatRole(it.role) }.distinctBy { it.eventId }.mapNotNull { s ->
        val event = AppGraph.events.getEventById(s.eventId) ?: return@mapNotNull null
        val news = runCatching { AppGraph.content.getAnnouncements(s.eventId) }.getOrDefault(emptyList())
            .filter { isUserInAudience(s.role, it.audience) }.take(5)
        val roster = if (s.permissions["canViewApplications"] == true) runCatching {
            AppGraph.applications.getApplicationsByEvent(s.eventId)
                .filter { s.committeeId.isEmpty() || belongsToCommittee(it, s.committeeId) }
                .filter { Regex("delegate", RegexOption.IGNORE_CASE).containsMatchIn(it.role) && it.status == "approved" }
                .map { RosterLine(it.applicantName.orEmpty().ifEmpty { "Delegate" }, it.assignedCommittee ?: it.preferredCommittee.orEmpty(), it.assignedCountry.orEmpty()) }
        }.getOrDefault(emptyList()) else null
        ObservedEvent(event, s.role, s.committeeId, news, roster)
    }
}
