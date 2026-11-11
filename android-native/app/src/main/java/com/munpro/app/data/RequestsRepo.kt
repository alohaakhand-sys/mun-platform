package com.munpro.app.data

// Requests (board B2; web MigrationPanel + migrationService.ts, ComplaintSystem +
// complaintService.ts). Seat moves only go through the site's /api/migrations routes (the rules
// let no client write migrationRequests); a help-desk request is created by the delegate as on the
// web, but routed to the committee's chair from the member list (staff with their committee): the
// web's lookup read other applications, which the rules refuse, so its requests had no handler.
// Both are listeners: the organizer's decision, a swap offer or an escalation shows as it happens.

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.munpro.app.AppGraph
import com.munpro.app.domain.ApplicationData
import com.munpro.app.domain.Complaint
import com.munpro.app.domain.MigrationRequest
import com.munpro.app.domain.committeeOf
import com.munpro.app.domain.isChairTierRole
import com.munpro.app.domain.sameCommittee
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class RequestsRepo {
    private val db = FirebaseFirestore.getInstance()

    /** getMyMigrationRequest, every one of them: mine on this event, newest first. */
    fun myMoves(eventId: String, uid: String): Flow<List<MigrationRequest>?> = callbackFlow {
        val reg = db.collection("migrationRequests").whereEqualTo("requesterUid", uid).addSnapshotListener { snap, err ->
            if (err != null) { trySend(emptyList()); return@addSnapshotListener }
            trySend(snap?.documents.orEmpty().mapNotNull { it.decode<MigrationRequest>() }.filter { it.eventId == eventId }.sortedByDescending { it.createdAt ?: 0L })
        }
        awaitClose { reg.remove() }
    }

    /** getSwapOffersForOccupant: someone approved to swap into my seat. */
    fun swapOffers(eventId: String, uid: String): Flow<List<MigrationRequest>> = callbackFlow {
        val reg = db.collection("migrationRequests").whereEqualTo("occupantUid", uid).addSnapshotListener { snap, _ ->
            trySend(snap?.documents.orEmpty().mapNotNull { it.decode<MigrationRequest>() }.filter { it.eventId == eventId && it.status == "awaiting_swap" })
        }
        awaitClose { reg.remove() }
    }

    /** POST /api/migrations/request. Returns the server's refusal, or null when sent. */
    suspend fun requestMove(eventId: String, toCommittee: String, toCountry: String, reason: String): String? {
        val r = Api.send("/api/migrations/request", "POST", buildJsonObject {
            put("eventId", eventId); put("toCommittee", toCommittee); put("toCountry", toCountry); put("reason", reason.trim().take(500))
        }.toString())
        return if (r.ok) null else r.error
    }

    suspend fun cancelMove(id: String): String? = Api.send("/api/migrations/$id/cancel", "POST", "{}").let { if (it.ok) null else it.error }

    suspend fun answerSwap(id: String, accept: Boolean): String? =
        Api.send("/api/migrations/$id/respond", "POST", buildJsonObject { put("action", if (accept) "accept" else "decline") }.toString())
            .let { if (it.ok) null else it.error }

    /** The delegate's requests on this application (the web list's query). */
    fun complaints(applicationId: String, uid: String): Flow<List<Complaint>?> = callbackFlow {
        val reg = db.collection("complaints").whereEqualTo("applicationId", applicationId).whereEqualTo("userId", uid).addSnapshotListener { snap, err ->
            if (err != null) { trySend(emptyList()); return@addSnapshotListener }
            trySend(snap?.documents.orEmpty().mapNotNull { it.decode<Complaint>() }.sortedByDescending { it.createdAt ?: 0L })
        }
        awaitClose { reg.remove() }
    }

    fun complaint(id: String): Flow<Complaint?> = callbackFlow {
        val reg = db.collection("complaints").document(id).addSnapshotListener { snap, _ -> trySend(snap?.takeIf { it.exists() }?.decode<Complaint>()) }
        awaitClose { reg.remove() }
    }

    /** submitComplaint, with the chair found from the member list. */
    suspend fun submitComplaint(app: ApplicationData, type: String, subject: String, description: String): String {
        val committee = committeeOf(app)
        val chairUid = if (committee.isEmpty()) null else runCatching {
            AppGraph.papers.members(app.eventId)?.firstOrNull { it.isStaff && isChairTierRole(it.role) && sameCommittee(it.committee, committee) }?.uid
        }.getOrNull()
        val me = app.userId
        val ref = db.collection("complaints").add(mapOf(
            "eventId" to app.eventId,
            "applicationId" to app.id,
            "userId" to me,
            "type" to type,
            "subject" to subject.trim(),
            "description" to description.trim(),
            "status" to "open",
            "escalationLevel" to 0,
            "assignedTo" to chairUid,
            "assignedRole" to "chair",
            "actorUids" to listOfNotNull(me, chairUid),
            "history" to listOf(mapOf(
                "action" to "submitted", "actorUid" to me, "actorRole" to "delegate",
                "message" to "Complaint submitted.", "timestamp" to java.time.Instant.now().toString(),
            )),
            "resolution" to "",
            "createdAt" to FieldValue.serverTimestamp(),
        )).await()
        return ref.id
    }
}
