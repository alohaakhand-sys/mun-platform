package com.munpro.app.data

// The organizer's events (board C1; web dashboard/organizer, organizer/events/[id] and
// CreateEventDialog). Same documents and writes as the web:
// - the home's totals and applications-by-role come from my own events' applications (the web's
//   getOrganizerStats reads them the same way), cached on the phone;
// - an event is created as a draft with organizerId = me (the rule's create check), edited with
//   lastEditedAt/By, published and unpublished by its `status`;
// - venue search goes through the site's /api/locations/search (the DataForSEO key stays there);
// - "your event is on the platform" is mailed by the server to my own address.

import com.google.firebase.firestore.AggregateSource
import com.google.firebase.firestore.FirebaseFirestore
import com.munpro.app.AppGraph
import com.munpro.app.domain.ApplicationData
import com.munpro.app.domain.EventData
import com.munpro.app.domain.belongsToCommittee
import com.munpro.app.domain.computeApplicationCloseAt
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Serializable
data class RoleCount(val role: String, val total: Int, val approved: Int)

/** C1.1: totals across the events I own (the web home counts owned events only). */
@Serializable
data class OrganizerHome(val events: Int, val published: Int, val applications: Int, val approved: Int, val byRole: List<RoleCount>)

/** C1.8: what the event overview shows. */
@Serializable
data class EventOverview(
    val event: EventData,
    val applicants: Int,
    val approved: Int,
    val toReview: Int,
    val needCountry: Int,
    val moves: Int?,
    /** (committee, applications in it, capacity) */
    val committees: List<Triple<String, Int, Int>>,
)

/** A venue from /api/locations/search (PlaceResult). */
@Serializable
data class Place(
    val name: String = "",
    val address: String = "",
    val latitude: Double? = null,
    val longitude: Double? = null,
    val rating: Double? = null,
    val ratingCount: Int? = null,
    val placeId: String? = null,
    val category: String? = null,
)

/** What the create / edit form writes (CreateEventDialog's payload). */
data class EventForm(
    val title: String = "",
    val startDate: String = "",
    val startTime: String = "",
    val endDate: String = "",
    val endTime: String = "",
    val timeZone: String = java.util.TimeZone.getDefault().id,
    /** offline | online | hybrid */
    val format: String = "offline",
    val location: String = "",
    val place: Place? = null,
    /** public | unlisted */
    val visibility: String = "public",
    val description: String = "",
    val coverUrl: String = "",
) {
    val date: String get() = "${startDate}T$startTime"

    companion object {
        fun of(e: EventData): EventForm {
            var d = e.startDate.orEmpty()
            var t = e.startTime.orEmpty()
            if ((d.isEmpty() || t.isEmpty()) && e.date.length >= 10) {
                d = d.ifEmpty { e.date.take(10) }
                if (e.date.length >= 16 && e.date[10] == 'T') t = t.ifEmpty { e.date.substring(11, 16) }
            }
            return EventForm(
                e.title, d, t, e.endDate.orEmpty(), e.endTime.orEmpty(), e.timeZone ?: java.util.TimeZone.getDefault().id,
                e.format.ifEmpty { "offline" }, e.location,
                if (e.locationPlaceId != null || e.locationLat != null) Place(e.locationName ?: e.location, e.locationAddress.orEmpty(), e.locationLat, e.locationLng, placeId = e.locationPlaceId) else null,
                e.visibility ?: "public", e.description, e.coverUrl.orEmpty(),
            )
        }
    }
}

class OrganizerRepo {
    private val db = FirebaseFirestore.getInstance()
    private fun apps(eventId: String) = db.collection("applications").whereEqualTo("eventId", eventId)

    suspend fun home(uid: String): OrganizerHome {
        val events = db.collection("events").whereEqualTo("organizerId", uid).get().await().documents.mapNotNull { it.decode<EventData>() }
        val all = events.flatMap { e -> apps(e.id).get().await().documents.mapNotNull { it.decode<ApplicationData>() } }
        val byRole = all.groupBy { it.role.ifEmpty { "Delegate" } }
            .map { (role, l) -> RoleCount(role, l.size, l.count { it.status == "approved" }) }
            .sortedByDescending { it.total }
        return OrganizerHome(events.size, events.count { it.status == "published" }, all.size, all.count { it.status == "approved" }, byRole)
    }

    suspend fun overview(eventId: String): EventOverview? {
        val e = AppGraph.events.getEventById(eventId) ?: return null
        val list = apps(eventId).get().await().documents.mapNotNull { it.decode<ApplicationData>() }
        val moves = runCatching {
            db.collection("migrationRequests").whereEqualTo("eventId", eventId).whereEqualTo("status", "pending")
                .count().get(AggregateSource.SERVER).await().count.toInt()
        }.getOrNull()
        return EventOverview(
            e, list.size, list.count { it.status == "approved" }, list.count { it.status == "pending" },
            list.count { it.status == "approved" && it.assignedCountry.isNullOrEmpty() }, moves,
            e.committees.filter { it.name.isNotBlank() }.map { c -> Triple(c.name, list.count { belongsToCommittee(it, c.name) }, c.capacity ?: 100) },
        )
    }

    private fun fields(f: EventForm, editing: Boolean): Map<String, Any?> {
        val physical = f.format != "online"
        val place = if (physical) f.place else null
        val placeFields: Map<String, Any?> = when {
            place != null -> mapOf(
                "locationName" to place.name, "locationAddress" to place.address.ifEmpty { null },
                "locationLat" to place.latitude, "locationLng" to place.longitude, "locationPlaceId" to place.placeId,
            )
            editing -> mapOf("locationName" to null, "locationAddress" to null, "locationLat" to null, "locationLng" to null, "locationPlaceId" to null)
            else -> emptyMap()
        }
        return mapOf(
            "title" to f.title.trim(), "date" to f.date,
            "location" to if (physical) f.location.trim() else f.location.trim().ifEmpty { "Online" },
            "format" to f.format, "description" to f.description.trim(), "coverUrl" to f.coverUrl,
            "startDate" to f.startDate, "startTime" to f.startTime, "endDate" to f.endDate, "endTime" to f.endTime,
            "timeZone" to f.timeZone, "visibility" to f.visibility,
        ) + placeFields
    }

    /** CreateEventDialog, create: a draft owned by me, then the welcome email to my own address. */
    suspend fun create(f: EventForm, organizerName: String): String {
        val uid = AppGraph.auth.user?.uid ?: error("Signed out")
        val closeAt = computeApplicationCloseAt(EventData(date = f.date))
        val ref = db.collection("events").add(fields(f, false) + mapOf(
            "committees" to emptyList<Any>(), "organizerId" to uid, "status" to "draft",
            "createdAt" to java.time.Instant.now().toString(),
        ) + (closeAt?.let { mapOf("applicationCloseAt" to it) } ?: emptyMap())).await()
        runCatching {
            Api.send("/api/notify/event-created", "POST", buildJsonObject { put("eventId", ref.id); put("organizerName", organizerName) }.toString())
        }
        return ref.id
    }

    /** CreateEventDialog, edit: keeps the application close in step with a moved start. */
    suspend fun update(e: EventData, f: EventForm) {
        val uid = AppGraph.auth.user?.uid ?: error("Signed out")
        val closeAt = computeApplicationCloseAt(e.copy(date = f.date))
        db.collection("events").document(e.id).update(fields(f, true) + mapOf(
            "lastEditedAt" to java.time.Instant.now().toString(), "lastEditedBy" to uid,
        ) + (closeAt?.let { mapOf("applicationCloseAt" to it) } ?: emptyMap())).await()
    }

    /** Publish (only once the required checks pass; the caller checks) or back to draft. */
    suspend fun setStatus(eventId: String, published: Boolean) {
        db.collection("events").document(eventId).update("status", if (published) "published" else "draft").await()
    }

    /** /api/locations/search: venues for [query], scoped to the phone's country. */
    suspend fun searchPlaces(query: String): Result<List<Place>> {
        val country = runCatching { java.util.Locale.getDefault().getDisplayCountry(java.util.Locale.ENGLISH).ifEmpty { null } }.getOrNull()
        val r = Api.send("/api/locations/search", "POST", buildJsonObject {
            put("query", query.trim()); country?.let { put("locationName", it) }
        }.toString())
        if (!r.ok) return Result.failure(IllegalStateException(r.error ?: "Search failed."))
        val places = ((r.body as? JsonObject)?.get("places") as? JsonArray).orEmpty().mapNotNull { decodeOrNull<Place>(it) }
        return Result.success(places)
    }
}
