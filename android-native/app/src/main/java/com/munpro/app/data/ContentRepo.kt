package com.munpro.app.data

// Reads for what a delegate looks at outside a sitting: announcements, rules, study guide,
// notifications, awards, and the committees this account chairs. Ports of the matching calls in
// announcementService, optionalModulesService, notificationService, resultService and
// mobile/src/lib/chair.ts (useChairSeats).

import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.munpro.app.domain.Announcement
import com.munpro.app.domain.AppNotification
import com.munpro.app.domain.DelegateResult
import com.munpro.app.domain.RulesGuide
import com.munpro.app.domain.SessionSeat
import com.munpro.app.domain.StudyGuide
import com.munpro.app.domain.getEventStartMs
import com.munpro.app.domain.live.StaffAccess
import com.munpro.app.domain.roleLabel
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.json.JsonPrimitive

class ContentRepo(private val events: EventRepo) {
    private val db = FirebaseFirestore.getInstance()

    /** Throws on failure (the caller keeps its saved copy); the web swallows to []. */
    suspend fun getAnnouncements(eventId: String): List<Announcement> =
        db.collection("events").document(eventId).collection("announcements")
            .orderBy("createdAt", Query.Direction.DESCENDING).get().await()
            .documents.mapNotNull { it.decode<Announcement>() }

    suspend fun getRulesGuide(eventId: String): RulesGuide? =
        db.collection("events").document(eventId).collection("settings").document("rulesRegulations").get().await()
            .takeIf { it.exists() }?.decode<RulesGuide>()

    suspend fun getStudyGuide(eventId: String, committee: String): StudyGuide? =
        db.collection("events").document(eventId).collection("studyGuides").document(committee).get().await()
            .takeIf { it.exists() }?.decode<StudyGuide>()

    /** The user's latest notifications, newest first, capped at 30 (single-field filter, sorted here). */
    fun myNotifications(uid: String): Flow<List<AppNotification>> = callbackFlow {
        val reg = db.collection("notifications").whereEqualTo("uid", uid).addSnapshotListener { snap, err ->
            if (err != null || snap == null) { trySend(emptyList()); return@addSnapshotListener }
            trySend(
                snap.documents.mapNotNull { it.decode<AppNotification>() }
                    .sortedByDescending { it.createdAt ?: 0L }
                    .take(30),
            )
        }
        awaitClose { reg.remove() }
    }

    /**
     * A notice to the whole conference from the phone (Messages -> New announcement), shaped like
     * the web composer's doc so the dashboard lists it. No email: the announcements/send route
     * does that, and builds this same doc itself.
     */
    suspend fun postAnnouncement(eventId: String, subject: String, body: String, uid: String, name: String) {
        db.collection("events").document(eventId).collection("announcements").add(
            mapOf(
                "subject" to subject, "body" to body,
                "audience" to mapOf("roles" to emptyList<String>(), "committees" to emptyList<String>(), "paymentStatus" to "all"),
                "status" to "sent", "sentBy" to uid, "sentByName" to name, "recipientCount" to 0,
                "createdAt" to com.google.firebase.firestore.FieldValue.serverTimestamp(),
                "sentAt" to com.google.firebase.firestore.FieldValue.serverTimestamp(),
            ),
        ).await()
    }

    suspend fun markAllNotificationsRead(uid: String) {
        runCatching {
            val snap = db.collection("notifications").whereEqualTo("uid", uid).get().await()
            val batch = db.batch()
            snap.documents.forEach { if (it.getBoolean("read") != true) batch.update(it.reference, "read", true) }
            batch.commit().await()
        }
    }

    suspend fun markNotificationRead(id: String) {
        runCatching { db.collection("notifications").document(id).update("read", true).await() }
    }

    suspend fun getUserAchievements(uid: String): List<DelegateResult> = runCatching {
        db.collectionGroup("results").whereEqualTo("delegateUid", uid).whereEqualTo("status", "approved").get().await()
            .documents.mapNotNull { d ->
                val json = d.toJson() ?: return@mapNotNull null
                decodeOrNull<DelegateResult>(kotlinx.serialization.json.JsonObject(json + ("eventId" to JsonPrimitive(d.reference.parent.parent?.id.orEmpty()))))
            }
            .filter { it.awardType.isNotEmpty() && it.awardType != "none" }
    }.getOrDefault(emptyList())

    /**
     * Every committee this account has a seat in during a live sitting, other than as a delegate:
     * accepted staff docs (chair tier, Executive Board, co-organizer, observer, faculty advisor)
     * plus the events it owns. Who runs and who watches comes from [StaffAccess], the same rules
     * the web console and firestore.rules use. One collection-group query and one owner query,
     * then the events themselves; Today caches the result.
     */
    suspend fun sessionSeats(uid: String): List<SessionSeat> {
        val staff = db.collectionGroup("staff").whereEqualTo("uid", uid).whereEqualTo("inviteStatus", "accepted").get().await().documents
        val owned = runCatching { db.collection("events").whereEqualTo("organizerId", uid).get().await().documents.map { it.id } }.getOrDefault(emptyList())
        val access = linkedMapOf<String, StaffAccess>()
        for (d in staff) {
            val eventId = d.reference.path.split("/")[1]
            @Suppress("UNCHECKED_CAST")
            val perms = (d.get("permissions") as? Map<String, Any?>).orEmpty().mapValues { it.value == true }
            access[eventId] = StaffAccess(
                role = d.getString("role").orEmpty(), committeeId = d.getString("committeeId").orEmpty(),
                permissions = perms, delegatePower = d.getBoolean("delegatePower") == true,
            )
        }
        for (eventId in owned) access[eventId] = (access[eventId] ?: StaffAccess()).copy(isOwner = true)

        val recent = System.currentTimeMillis() - 14 * 86_400_000L
        return access.flatMap { (eventId, a) ->
            val event = events.getEventById(eventId) ?: return@flatMap emptyList()
            // A conference long over has no sittings left to open.
            val start = getEventStartMs(event)
            if (start != null && start < recent) return@flatMap emptyList()
            val label = when { a.isOwner -> "Organizer"; else -> roleLabel(a.role) }
            // Committee-bound staff see their committee; organizer level and event-wide staff see all.
            // A scoped Executive Board member sees every committee too: theirs to run, the rest
            // read-only (canWatch), as on the web EB dashboard.
            val committees = if (a.committeeId.isNotEmpty() && !a.isOrganizerLevel && !a.isExecBoard) listOf(a.committeeId)
                else event.committees.map { it.name }.filter { it.isNotEmpty() }
            committees.mapNotNull { c ->
                when {
                    a.canControl(c) -> SessionSeat(eventId, c, label, run = true, organizerLevel = a.isOrganizerLevel, event = event, dais = a.canDais(c))
                    a.canWatch(c) -> SessionSeat(eventId, c, label, run = false, organizerLevel = false, event = event)
                    else -> null
                }
            }
        }
    }

    /** This account's [StaffAccess] on one event: its accepted staff doc (UID-keyed) and ownership. */
    /** getEventStaff, accepted members only: (uid, name, role, committee). Organizer / staff readable. */
    suspend fun eventStaff(eventId: String): List<EventStaffMember> =
        db.collection("events").document(eventId).collection("staff").get().await().documents.mapNotNull { d ->
            if (d.getString("inviteStatus") != "accepted") return@mapNotNull null
            val uid = d.getString("uid")?.ifEmpty { null } ?: return@mapNotNull null
            EventStaffMember(uid, d.getString("name").orEmpty(), d.getString("role").orEmpty(), d.getString("committeeId").orEmpty())
        }

    suspend fun staffAccess(eventId: String, uid: String): StaffAccess {
        val event = events.getEventById(eventId)
        val d = runCatching { db.collection("events").document(eventId).collection("staff").document(uid).get().await() }.getOrNull()
        val accepted = d != null && d.exists() && d.getString("inviteStatus") == "accepted"
        @Suppress("UNCHECKED_CAST")
        val perms = if (accepted) (d!!.get("permissions") as? Map<String, Any?>).orEmpty().mapValues { it.value == true } else emptyMap()
        return StaffAccess(
            role = if (accepted) d!!.getString("role").orEmpty() else "",
            committeeId = if (accepted) d!!.getString("committeeId").orEmpty() else "",
            permissions = perms,
            isOwner = event?.organizerId == uid,
            delegatePower = accepted && d!!.getBoolean("delegatePower") == true,
        )
    }
}

data class EventStaffMember(val uid: String, val name: String, val role: String, val committeeId: String)
