package com.munpro.app.data

// The organizer's modules and tools (board C5), the same documents the web's modules, complaints
// and tools pages write: events/{e}/foodSlots, transportRoutes, accommodationBlocks,
// accommodationRequests, settings/dressCode; complaints assigned to me; events/{e}/results
// (+ the certificate-ready email) and standings; event.certificateTemplate / event.theme; and the
// people an ID card is printed for.

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.munpro.app.AppGraph
import com.munpro.app.domain.ApplicationData
import com.munpro.app.domain.Complaint
import com.munpro.app.domain.DEFAULT_MEAL_AUDIENCE
import com.munpro.app.domain.IdCardPerson
import com.munpro.app.domain.countryName
import com.munpro.app.domain.effectiveCommittee
import com.munpro.app.domain.roleLabel
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class ToolsRepo {
    private val db = FirebaseFirestore.getInstance()
    private fun event(id: String) = db.collection("events").document(id)
    private fun now() = java.time.Instant.now().toString()

    // ── Food, transport, accommodation, dress code ─────────────────────────────────────

    suspend fun addFoodSlot(eventId: String, s: FoodSlot) {
        event(eventId).collection("foodSlots").add(mapOf(
            "mealName" to s.mealName, "timeWindow" to s.timeWindow, "venue" to s.venue, "day" to s.day,
            "audience" to mapOf("groups" to (s.audience?.groups ?: DEFAULT_MEAL_AUDIENCE)), "usesPerPerson" to (s.usesPerPerson ?: 1),
        )).await()
    }
    /** Create or update a custom coupon (rules: owner / co-organizer, Pro plan feature `passes`). */
    suspend fun saveCoupon(eventId: String, c: com.munpro.app.data.Coupon, uid: String) {
        val optional = listOf("note" to c.note, "day" to c.day, "timeWindow" to c.timeWindow, "venue" to c.venue)
        val data = buildMap<String, Any> {
            put("title", c.title); put("kind", c.kind); put("active", c.active); put("usesPerPerson", c.usesPerPerson ?: 1)
            put("audience", buildMap<String, Any> { put("groups", c.audience.groups); if (c.audience.uids.isNotEmpty()) put("uids", c.audience.uids) })
            optional.forEach { (k, v) -> if (v.isNotBlank()) put(k, v) }
        }
        val col = event(eventId).collection("coupons")
        if (c.id.isEmpty()) col.add(data + mapOf("createdBy" to uid, "createdAt" to FieldValue.serverTimestamp())).await()
        // An emptied optional field is removed, not left behind.
        else col.document(c.id).update(data + optional.filter { it.second.isBlank() }.associate { it.first to FieldValue.delete() } + mapOf("updatedAt" to FieldValue.serverTimestamp())).await()
    }
    suspend fun deleteCoupon(eventId: String, id: String) { event(eventId).collection("coupons").document(id).delete().await() }
    suspend fun deleteFoodSlot(eventId: String, id: String) { event(eventId).collection("foodSlots").document(id).delete().await() }

    suspend fun addRoute(eventId: String, r: TransportRoute) {
        event(eventId).collection("transportRoutes").add(mapOf(
            "routeName" to r.routeName, "pickupPoint" to r.pickupPoint, "dropoffPoint" to r.dropoffPoint,
            "departureTime" to r.departureTime, "returnTime" to r.returnTime, "capacity" to (r.capacity ?: 0), "registeredDelegates" to emptyList<String>(),
        )).await()
    }
    suspend fun deleteRoute(eventId: String, id: String) { event(eventId).collection("transportRoutes").document(id).delete().await() }

    suspend fun addBlock(eventId: String, b: AccommodationBlock) {
        event(eventId).collection("accommodationBlocks").add(mapOf(
            "blockName" to b.blockName, "roomType" to b.roomType, "pricePerNight" to (b.pricePerNight ?: 0.0), "availableRooms" to (b.availableRooms ?: 0),
        )).await()
    }
    suspend fun deleteBlock(eventId: String, id: String) { event(eventId).collection("accommodationBlocks").document(id).delete().await() }

    suspend fun roomRequests(eventId: String): List<AccommodationRequest> =
        event(eventId).collection("accommodationRequests").get().await().documents.mapNotNull { it.decode<AccommodationRequest>() }

    /** approveAccommodationRequest */
    suspend fun decideRoom(eventId: String, id: String, status: String) {
        event(eventId).collection("accommodationRequests").document(id).update("status", status).await()
    }

    suspend fun saveDressCode(eventId: String, d: DressCode) {
        event(eventId).collection("settings").document("dressCode").set(mapOf("text" to d.text, "images" to d.images)).await()
    }

    // ── Complaints (assigned to me) ─────────────────────────────────────────────────────

    fun complaints(eventId: String, uid: String): Flow<List<Complaint>?> = AppGraph.chairHub.inbox(eventId, uid)

    /** complaintService.rejectComplaint */
    suspend fun rejectComplaint(id: String, reason: String, role: String) {
        val uid = AppGraph.auth.user?.uid ?: return
        db.collection("complaints").document(id).update(mapOf(
            "status" to "rejected",
            "history" to FieldValue.arrayUnion(mapOf("action" to "rejected", "actorUid" to uid, "actorRole" to role,
                "message" to reason.trim().ifEmpty { "Rejected by $role." }, "timestamp" to now())),
            "actorUids" to FieldValue.arrayUnion(uid),
        )).await()
    }

    // ── Results & standings ─────────────────────────────────────────────────────────────

    fun results(eventId: String): Flow<List<AwardResult>> = callbackFlow {
        val reg = event(eventId).collection("results").addSnapshotListener { snap, err ->
            if (err != null || snap == null) return@addSnapshotListener
            trySend(snap.documents.mapNotNull { it.decode<AwardResult>() })
        }
        awaitClose { reg.remove() }
    }

    suspend fun standings(eventId: String): List<Standings> =
        event(eventId).collection("standings").get().await().documents.mapNotNull { it.decode<Standings>() }

    /** approveResult / bulkApprove in one batch, then each delegate's certificate-ready email. */
    suspend fun approve(eventId: String, eventTitle: String, list: List<AwardResult>, emailOf: (String) -> String?) {
        val uid = AppGraph.auth.user?.uid ?: return
        val batch = db.batch()
        list.forEach { r -> batch.update(event(eventId).collection("results").document(r.id), mapOf("status" to "approved", "approvedBy" to uid, "approvedAt" to FieldValue.serverTimestamp())) }
        batch.commit().await()
        val esc = { s: String -> s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;") }
        list.mapNotNull { emailOf(it.delegateUid) }.distinct().forEach { to ->
            runCatching {
                Api.send("/api/send-email", "POST", buildJsonObject {
                    put("eventId", eventId); put("to", to); put("subject", "Your certificate is ready — $eventTitle")
                    put("html", "<div style=\"font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:12px;color:#1e293b\">" +
                        "<h2 style=\"color:#0B6E4F;margin-top:0\">Certificate Available</h2><p>Results for <strong>${esc(eventTitle)}</strong> have been approved. " +
                        "Your certificate is now available in your conference portal.</p></div>")
                }.toString())
            }
        }
    }

    /** requestRevision */
    suspend fun askRevision(eventId: String, id: String, notes: String) {
        event(eventId).collection("results").document(id).update(mapOf("status" to "revision_requested", "notes" to notes.trim().ifEmpty { "Revision requested" })).await()
    }

    // ── Certificates, theme ─────────────────────────────────────────────────────────────

    suspend fun setCertificateTemplate(eventId: String, id: String) { event(eventId).update(mapOf("certificateTemplate" to id, "updatedAt" to now())).await() }
    suspend fun setTheme(eventId: String, theme: String) { event(eventId).update(mapOf("theme" to theme, "updatedAt" to now())).await() }

    // ── ID cards ────────────────────────────────────────────────────────────────────────

    /**
     * Delegates from approved applications; staff from accepted staff docs (named from their
     * profiles) plus approved chair applications without one (the web's ID-card page).
     */
    suspend fun idCardPeople(eventId: String, apps: List<ApplicationData>): List<IdCardPerson> {
        val staffRoles = listOf("staff", "co-organizer", "usg", "chair", "director", "vice-chair")
        fun staffApp(role: String) = staffRoles.any { role.lowercase().contains(it) }
        val approved = apps.filter { it.status == "approved" }
        val delegates = approved.filter { !staffApp(it.role) }.map { a ->
            IdCardPerson(a.userId, a.applicantName.orEmpty().ifEmpty { "Participant" },
                a.assignedCountry?.ifEmpty { null }?.let { "${a.role.ifEmpty { "Delegate" }} of ${countryName(it)}" } ?: a.role.ifEmpty { "Delegate" },
                effectiveCommittee(a))
        }
        val docs = event(eventId).collection("staff").get().await().documents.filter { it.getString("inviteStatus") == "accepted" }
        // Profile names in parallel: one read each, not one after another.
        val names = coroutineScope { docs.map { d -> async { d.getString("uid")?.ifEmpty { null }?.let { AppGraph.comms.profileName(it) } } }.awaitAll() }
        val staff = docs
            .mapIndexed { i, d ->
                val uid = d.getString("uid").orEmpty()
                val name = names[i]
                IdCardPerson(uid.ifEmpty { d.id }, name ?: d.getString("name")?.takeIf { it.isNotBlank() && it != "Pending User" } ?: d.getString("email").orEmpty(),
                    roleLabel(d.getString("role").orEmpty()), d.getString("committeeId").orEmpty(), staff = true)
            }
        val have = staff.map { it.uid }.toSet()
        val chairApps = approved.filter { staffApp(it.role) && it.userId !in have }.map { a ->
            IdCardPerson(a.userId, a.applicantName.orEmpty().ifEmpty { "Staff" }, a.role.ifEmpty { "Staff" }, effectiveCommittee(a), staff = true)
        }
        return staff + chairApps + delegates
    }
}
