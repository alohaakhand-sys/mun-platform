package com.munpro.app.data

// Allocation for an event's organizer (board C2; web allocation tabs). Same documents, routes
// and emails as the web:
// - approving places the delegate (status, assignedCommittee, assignedCountry in one write),
//   then the web's post-approval tasks (auto-connections with the committee, the committee
//   group chat), the membership sync, and one "You're in!" email naming the seat;
// - rejecting writes the status, syncs membership and sends the signed status-change email;
// - countries are written per delegate; a newly set one is emailed;
// - moves and swaps go through /api/migrations/* (the rules keep those writes server-side);
// - a waitlist offer marks the entry and, only once that landed, emails the person.

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import com.munpro.app.AppGraph
import com.munpro.app.domain.ApplicationData
import com.munpro.app.domain.MigrationRequest
import com.munpro.app.domain.countryName
import com.munpro.app.domain.sameCommittee
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

/** events/{e}/waitlist/{id} (waitlistService.WaitlistEntry), as the organizer sees it. */
@Serializable
data class WaitlistSeat(
    val id: String = "",
    val applicantUid: String = "",
    val applicantName: String = "",
    val applicantEmail: String = "",
    val committeeId: String = "",
    @Serializable(with = LenientInt::class) val position: Int? = null,
    /** waiting | offered | accepted | expired */
    val status: String = "waiting",
    @Serializable(with = LenientMillis::class) val notifiedAt: Long? = null,
    @Serializable(with = LenientMillis::class) val createdAt: Long? = null,
)

/** A country this delegate held at another event (/api/conflicts). */
@Serializable
data class CountryConflict(val eventName: String = "", val date: String = "", val country: String = "")

@Serializable
data class OrgMove(
    val request: MigrationRequest,
    val source: String? = null,
)

class AllocationRepo {
    private val db = FirebaseFirestore.getInstance()
    private fun app(id: String) = db.collection("applications").document(id)

    suspend fun applications(eventId: String): List<ApplicationData> =
        db.collection("applications").whereEqualTo("eventId", eventId).get().await()
            .documents.mapNotNull { it.decode<ApplicationData>() }.sortedByDescending { it.createdAt ?: 0L }

    private suspend fun sync(eventId: String, uid: String) {
        runCatching { Api.send("/api/members/sync", "POST", buildJsonObject { put("eventId", eventId); putJsonArray("userIds") { add(uid) } }.toString()) }
    }

    /** One email through /api/send-email (the route checks I work on the event). */
    private suspend fun email(eventId: String, to: String, subject: String, html: String) {
        if (to.isBlank()) return
        runCatching {
            Api.send("/api/send-email", "POST", buildJsonObject { put("eventId", eventId); put("to", to); put("subject", subject); put("html", html) }.toString())
        }
    }

    private fun shell(heading: String, body: String) = """
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background:#fff; color:#1e293b;">
          <h2 style="color:#6d28d9; margin-top:0;">$heading</h2>
          $body
          <div style="margin-top:24px; padding-top:16px; border-top:1px solid #e2e8f0; font-size:12px; color:#64748b;">
            This is an automated notification from MUN Platform.
          </div>
        </div>""".trimIndent()

    private fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

    /** The detail sidebar's approve: placement in one write, then everything the web does after. */
    suspend fun approve(a: ApplicationData, committee: String, country: String, eventTitle: String) {
        val fields = mutableMapOf<String, Any>("status" to "approved")
        if (committee.isNotEmpty()) fields["assignedCommittee"] = committee
        if (country.isNotEmpty()) fields["assignedCountry"] = country
        writeWithSeat(a, "approved", fields)
        // The seat is written; the rest (connections, committee chat, access, email) can finish
        // after the sheet closes, as the web's best-effort follow-ups do.
        AppGraph.scope.launch { followUps(a, committee, country, eventTitle) }
    }

    private suspend fun followUps(a: ApplicationData, committee: String, country: String, eventTitle: String) {
        if (committee.isNotEmpty() && a.status != "approved") runCatching { postApproval(a, committee) }
        sync(a.eventId, a.userId)
        val rules = Api.site("/dashboard/conferences/${a.eventId}?tab=documents&doc=rules")
        email(a.eventId, a.applicantEmail.orEmpty(), "You're in! $eventTitle", shell(
            "Application Approved 🎉",
            "<p>Great news — your application${if (a.role.isNotEmpty()) " as a <strong>${esc(a.role)}</strong>" else ""} for <strong>${esc(eventTitle)}</strong> has been <strong>approved</strong>.</p>" +
                (if (committee.isNotEmpty()) "<p>Your seat: <strong>${esc(committee)}</strong>${if (country.isNotEmpty()) " as <strong>${esc(countryName(country))}</strong>" else ""}.</p>" else "") +
                "<p>Log in to your dashboard to see your committee, complete any payment, and upload your position paper.</p>" +
                (rules?.let { "<p style=\"margin-top:16px;\">Before anything else, read the conference <strong>Rules &amp; Regulations</strong> — code of conduct, rules of procedure and disciplinary policy. They apply to every participant.</p><p style=\"margin-top:12px;\"><a href=\"$it\" style=\"display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;\">Read the Rules &amp; Regulations</a></p>" } ?: ""),
        ))
    }

    /**
     * applicationService.handlePostApprovalTasks: connect the new delegate with everyone already
     * approved in the committee, then add them to the committee's group chat (made if missing).
     */
    private suspend fun postApproval(a: ApplicationData, committee: String) {
        val others = db.collection("applications").whereEqualTo("eventId", a.eventId).whereEqualTo("assignedCommittee", committee)
            .whereEqualTo("status", "approved").get().await().documents.mapNotNull { it.decode<ApplicationData>() }.filter { it.userId != a.userId }
        val name = a.applicantName.orEmpty().ifEmpty { "Delegate" }
        val photo = runCatching { db.collection("users").document(a.userId).get().await().getString("photoURL") }.getOrNull().orEmpty()
        if (others.isNotEmpty()) {
            val batch = db.batch()
            others.forEach { o ->
                batch.set(db.collection("users").document(a.userId).collection("connections").document(o.userId), mapOf(
                    "otherUid" to o.userId, "displayName" to o.applicantName.orEmpty().ifEmpty { "Delegate" }, "photoURL" to "", "role" to o.role.ifEmpty { "Delegate" },
                    "source" to "auto", "sourceEventId" to a.eventId, "sourceCommitteeId" to committee, "connectedAt" to FieldValue.serverTimestamp(), "status" to "active",
                ), SetOptions.merge())
                batch.set(db.collection("users").document(o.userId).collection("connections").document(a.userId), mapOf(
                    "otherUid" to a.userId, "displayName" to name, "photoURL" to photo, "role" to "Delegate",
                    "source" to "auto", "sourceEventId" to a.eventId, "sourceCommitteeId" to committee, "connectedAt" to FieldValue.serverTimestamp(), "status" to "active",
                ), SetOptions.merge())
            }
            batch.commit().await()
        }
        val group = db.collection("conversations").whereEqualTo("type", "group").whereEqualTo("eventId", a.eventId).whereEqualTo("committeeId", committee)
            .get().await().documents.firstOrNull()
        if (group != null) {
            group.reference.update(mapOf(
                "participants" to FieldValue.arrayUnion(a.userId), "participantNames.${a.userId}" to name, "participantPhotos.${a.userId}" to photo,
                "unreadCount.${a.userId}" to 0, "lastMessage" to "System added $name", "lastMessageSenderId" to "system", "updatedAt" to FieldValue.serverTimestamp(),
            )).await()
            group.reference.collection("messages").add(mapOf(
                "senderId" to "system", "senderName" to "System", "text" to "System added $name", "timestamp" to FieldValue.serverTimestamp(), "readBy" to emptyList<String>(), "systemMessage" to true,
            )).await()
        } else {
            val short = runCatching { db.collection("events").document(a.eventId).get().await().getString("shortName") }.getOrNull()?.ifEmpty { null } ?: "Conference"
            val ref = db.collection("conversations").add(mapOf(
                "type" to "group", "groupName" to "$short - $committee", "participants" to listOf(a.userId),
                "participantNames" to mapOf(a.userId to name), "participantPhotos" to mapOf(a.userId to photo),
                "createdBy" to a.userId, "createdAt" to FieldValue.serverTimestamp(), "admins" to listOf(a.userId), "unreadCount" to mapOf(a.userId to 0),
                "lastMessage" to "Group created", "lastMessageSenderId" to "system", "updatedAt" to FieldValue.serverTimestamp(),
                "eventId" to a.eventId, "committeeId" to committee, "autoGenerated" to true,
            )).await()
            ref.collection("messages").add(mapOf(
                "senderId" to "system", "senderName" to "System", "text" to "Group created", "timestamp" to FieldValue.serverTimestamp(),
                "readBy" to listOf(a.userId), "readAt" to mapOf(a.userId to FieldValue.serverTimestamp()), "systemMessage" to true,
            )).await()
        }
    }

    /**
     * The application change, plus the event's seat counter when it takes or frees a participant
     * seat (Plan.kt): one batch, which the rules hold to the plan's cap.
     */
    private suspend fun writeWithSeat(a: ApplicationData, nextStatus: String, fields: Map<String, Any>) {
        val delta = com.munpro.app.domain.seatDelta(a.role, a.status, a.role, nextStatus)
        if (delta == 0) { app(a.id).update(fields).await(); return }
        val batch = db.batch()
        batch.update(app(a.id), fields)
        batch.update(db.collection("events").document(a.eventId), mapOf("approvedCount" to FieldValue.increment(delta.toLong()), "seatTx" to a.id))
        batch.commit().await()
    }

    /** Reject: the status, the membership marker, and the signed status-change email. */
    suspend fun reject(a: ApplicationData) {
        writeWithSeat(a, "rejected", mapOf("status" to "rejected"))
        sync(a.eventId, a.userId)
        runCatching { Api.send("/api/notify/application-update", "POST", buildJsonObject { put("applicationId", a.id); put("status", "rejected") }.toString()) }
    }

    /**
     * Countries tab save for one committee: each changed delegate's country (null clears it);
     * a delegate who had none and now has one gets the "Country assigned" email.
     */
    suspend fun saveCountries(eventId: String, eventTitle: String, committee: String, changes: List<Pair<ApplicationData, String?>>) {
        changes.forEach { (a, c) -> app(a.id).update("assignedCountry", c).await() }
        changes.filter { (a, c) -> a.assignedCountry.isNullOrEmpty() && !c.isNullOrEmpty() }.forEach { (a, c) ->
            email(eventId, a.applicantEmail.orEmpty(), "Country assigned — $eventTitle", shell(
                "Your Country Assignment",
                "<p>You've been assigned <strong>${esc(countryName(c!!))}</strong> in <strong>${esc(committee)}</strong> for <strong>${esc(eventTitle)}</strong>.</p>" +
                    "<p>Start your research and prepare your position paper from your conference portal.</p>",
            ))
        }
    }

    /** /api/conflicts: countries each delegate held at another event, keyed "uid_country". */
    suspend fun conflicts(eventId: String, uids: List<String>): Map<String, CountryConflict> {
        if (uids.isEmpty()) return emptyMap()
        val r = Api.send("/api/conflicts", "POST", buildJsonObject { put("eventId", eventId); putJsonArray("userIds") { uids.forEach { add(it) } } }.toString())
        val obj = (r.body as? JsonObject)?.get("conflicts") as? JsonObject ?: return emptyMap()
        return obj.mapNotNull { (k, v) -> decodeOrNull<CountryConflict>(v)?.let { k to it } }.toMap()
    }

    /** users/{uid}.publicStats.conferences, when the profile has it (written by its owner's profile view). */
    suspend fun conferenceCounts(uids: List<String>): Map<String, Int> = uids.mapNotNull { uid ->
        runCatching {
            val d = db.collection("users").document(uid).get().await()
            ((d.get("publicStats") as? Map<*, *>)?.get("conferences") as? Number)?.toInt()?.let { uid to it }
        }.getOrNull()
    }.toMap()

    /** The migration hub: overdue swaps expire first (as the web does), then every request. */
    suspend fun moves(eventId: String): List<OrgMove> {
        runCatching { Api.send("/api/migrations/expire?eventId=$eventId", "GET") }
        return db.collection("migrationRequests").whereEqualTo("eventId", eventId).get().await().documents.mapNotNull { d ->
            d.decode<MigrationRequest>()?.let { OrgMove(it, d.getString("source")) }
        }.sortedByDescending { it.request.createdAt ?: 0L }
    }

    /** /api/migrations/{id}/decide: approve (a taken seat becomes a swap with [hours] to answer) or reject. */
    suspend fun decide(id: String, approve: Boolean, hours: Int): String? {
        val r = Api.send("/api/migrations/$id/decide", "POST", buildJsonObject { put("action", if (approve) "approve" else "reject"); put("swapDeadlineHours", hours) }.toString())
        return if (r.ok) null else r.error ?: "Couldn't save."
    }

    /** /api/migrations/direct: move a delegate now; a taken seat swaps the two. Returns "direct" | "swap". */
    suspend fun moveNow(eventId: String, appId: String, committee: String, country: String, reason: String): Result<String> {
        val r = Api.send("/api/migrations/direct", "POST", buildJsonObject {
            put("eventId", eventId); put("applicationId", appId); put("toCommittee", committee); put("toCountry", country)
            if (reason.isNotBlank()) put("reason", reason.trim())
        }.toString())
        return if (r.ok) Result.success(runCatching { (r.body as JsonObject)["type"]!!.jsonPrimitive.content }.getOrDefault("direct"))
        else Result.failure(IllegalStateException(r.error ?: "Couldn't move the delegate."))
    }

    suspend fun waitlist(eventId: String): List<WaitlistSeat> =
        db.collection("events").document(eventId).collection("waitlist").get().await().documents.mapNotNull { it.decode<WaitlistSeat>() }
            .sortedBy { it.position ?: Int.MAX_VALUE }

    /** waitlistService.offerSeat, then (only if that landed) the 48-hour offer email. */
    suspend fun offerSeat(eventId: String, eventTitle: String, e: WaitlistSeat) {
        db.collection("events").document(eventId).collection("waitlist").document(e.id)
            .update(mapOf("status" to "offered", "notifiedAt" to FieldValue.serverTimestamp())).await()
        email(eventId, e.applicantEmail, "A seat opened up — $eventTitle", shell(
            "Seat Offer ⏳",
            "<p>A seat in <strong>${esc(e.committeeId)}</strong> has opened up for <strong>${esc(eventTitle)}</strong> and has been offered to you.</p>" +
                "<p>Log in and accept within <strong>$WAITLIST_OFFER_HOURS hours</strong> to claim it, or it passes to the next person on the waitlist.</p>",
        ))
    }
}

/** Effective committee name in the event's own spelling (the seat a delegate is in). */
fun seatCommittee(a: ApplicationData, committees: List<String>): String? {
    val c = com.munpro.app.domain.committeeOf(a)
    return committees.firstOrNull { sameCommittee(it, c) } ?: c.ifEmpty { null }
}
