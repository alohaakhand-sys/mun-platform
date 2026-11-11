package com.munpro.app.data

// Staff, schedule, announcements and rules writes (board C4), the same documents and routes the
// web's staff, schedule, announcements and rules pages use: events/{e}/staff (+ /api/members/sync
// and /api/send-email), the event's schedule array, events/{e}/announcements (+ the send route)
// and events/{e}/settings/rulesRegulations. Also a delegate's own public staff application.

import com.google.firebase.Timestamp
import com.munpro.app.AppGraph
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.munpro.app.domain.AudienceFilter
import com.munpro.app.domain.OrgAnnouncement
import com.munpro.app.domain.ScheduleItem
import com.munpro.app.domain.StaffDoc
import com.munpro.app.domain.roleLabel
import com.munpro.app.domain.rolePermissions
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

class CommsRepo {
    private val db = FirebaseFirestore.getInstance()
    private fun event(id: String) = db.collection("events").document(id)
    private fun staffOf(eventId: String) = event(eventId).collection("staff")
    private fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

    // ── Staff ───────────────────────────────────────────────────────────────────────────

    /** The live roster: an accepted invite re-keys its doc (auto-id → uid), so a one-shot list goes stale. */
    fun staff(eventId: String): Flow<List<StaffDoc>> = callbackFlow {
        val reg = staffOf(eventId).addSnapshotListener { snap, err ->
            if (err != null || snap == null) return@addSnapshotListener
            trySend(snap.documents.mapNotNull { it.decode<StaffDoc>() })
        }
        awaitClose { reg.remove() }
    }

    private suspend fun sync(eventId: String, uid: String) {
        if (uid.isEmpty()) return
        runCatching { Api.send("/api/members/sync", "POST", buildJsonObject { put("eventId", eventId); putJsonArray("userIds") { add(uid) } }.toString()) }
    }

    private suspend fun email(eventId: String, to: String, subject: String, html: String) {
        if (to.isBlank()) return
        runCatching { Api.send("/api/send-email", "POST", buildJsonObject { put("eventId", eventId); put("to", to); put("subject", subject); put("html", html) }.toString()) }
    }

    private fun card(title: String, body: String) =
        "<div style=\"font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;\">" +
            "<h2 style=\"color: #0B6E4F; margin-top: 0;\">$title</h2><p>Hello,</p>$body</div>"

    /** handleSendInvite: a pending doc found by email, the role's preset permissions, and the invite email. */
    suspend fun invite(eventId: String, eventTitle: String, rawEmail: String, role: String) {
        val email = rawEmail.trim().lowercase()
        staffOf(eventId).add(mapOf(
            "uid" to "", "name" to "Pending User", "email" to email, "role" to role, "committeeId" to null,
            "permissions" to rolePermissions(role), "inviteStatus" to "invited", "addedAt" to FieldValue.serverTimestamp(),
        )).await()
        email(eventId, email, "Staff Invitation: Join $eventTitle", card("Staff Invitation",
            "<p>You have been invited to join the staff team for <strong>${esc(eventTitle)}</strong> as a <strong>${esc(roleLabel(role))}</strong>.</p>" +
                "<p>To accept, open MUN Pilot and check your notifications.</p>"))
    }

    suspend fun update(eventId: String, s: StaffDoc, fields: Map<String, Any?>) {
        staffOf(eventId).document(s.id).update(fields).await()
        sync(eventId, s.uid)
    }

    /** handleConfirmRoleChange: an accepted member re-accepts (access paused until then); a pending invite just changes. */
    suspend fun changeRole(eventId: String, eventTitle: String, s: StaffDoc, role: String) {
        val perms = rolePermissions(role)
        val fields: Map<String, Any?> = if (s.inviteStatus == "accepted") mapOf(
            "role" to role, "permissions" to perms, "inviteStatus" to "invited", "isRoleUpdate" to true,
            "previousRole" to s.role, "previousPermissions" to s.permissions,
        ) else mapOf("role" to role, "permissions" to perms)
        update(eventId, s, fields)
        email(eventId, s.email, "Role Updated: $eventTitle", card("Your Role Has Been Updated",
            "<p>Your role for <strong>${esc(eventTitle)}</strong> has been changed to <strong>${esc(roleLabel(role))}</strong>.</p>" +
                "<p>To apply this change, open MUN Pilot and accept the update from your notifications.</p>"))
    }

    suspend fun remove(eventId: String, s: StaffDoc) {
        staffOf(eventId).document(s.id).delete().await()
        sync(eventId, s.uid.ifEmpty { s.id })
    }

    /** Accept a public staff application: they're staff now, and told so. */
    suspend fun acceptApplication(eventId: String, eventTitle: String, s: StaffDoc) {
        update(eventId, s, mapOf("inviteStatus" to "accepted"))
        email(eventId, s.email, "You're on the team: $eventTitle", card("Application accepted",
            "<p>Your application to join the staff of <strong>${esc(eventTitle)}</strong> as a <strong>${esc(roleLabel(s.role))}</strong> has been accepted.</p>" +
                "<p>The organizer will assign your committee. Your staff tools are now in MUN Pilot.</p>"))
    }

    suspend fun rejectApplication(eventId: String, s: StaffDoc) { staffOf(eventId).document(s.id).delete().await() }

    suspend fun setPublicStaff(eventId: String, on: Boolean) {
        event(eventId).update(mapOf("allowPublicStaff" to on, "updatedAt" to java.time.Instant.now().toString())).await()
    }

    /** deriveName: display name, else first + last; never an email. */
    suspend fun profileName(uid: String): String? = runCatching {
        val u = db.collection("users").document(uid).get().await()
        u.getString("displayName")?.trim()?.takeIf { it.isNotEmpty() && "@" !in it }
            ?: listOfNotNull(u.getString("firstName"), u.getString("lastName")).joinToString(" ").trim().ifEmpty { null }
    }.getOrNull()

    /** users/{uid}.publicStats.conferences, when the profile has it. */
    suspend fun conferenceCount(uid: String): Int? = runCatching {
        (db.collection("users").document(uid).get().await().get("publicStats.conferences") as? Number)?.toInt()
    }.getOrNull()

    // ── My staff application (the public event page) ──────────────────────────────────

    suspend fun myStaffDoc(eventId: String, uid: String): StaffDoc? =
        runCatching { staffOf(eventId).document(uid).get().await() }.getOrNull()?.takeIf { it.exists() }?.decode<StaffDoc>()

    /** applyForStaff: my own doc, status "applied", nothing granted (the rules allow exactly this). */
    suspend fun applyForStaff(eventId: String, uid: String, name: String, email: String, role: String) {
        staffOf(eventId).document(uid).set(mapOf(
            "uid" to uid, "name" to name.ifBlank { "Applicant" }, "email" to email, "role" to role, "committeeId" to null,
            "permissions" to rolePermissions(""), "inviteStatus" to "applied", "addedAt" to FieldValue.serverTimestamp(),
        )).await()
    }

    suspend fun withdrawStaffApplication(eventId: String, uid: String) { staffOf(eventId).document(uid).delete().await() }

    // ── Schedule ────────────────────────────────────────────────────────────────────────

    suspend fun saveSchedule(eventId: String, items: List<ScheduleItem>) {
        event(eventId).update(mapOf(
            "schedule" to items.map { s ->
                mapOf("title" to s.title, "startTime" to s.startTime, "endTime" to s.endTime, "location" to s.location, "type" to s.type.ifEmpty { "session" }) +
                    (s.description?.let { mapOf("description" to it) } ?: emptyMap())
            },
            "updatedAt" to java.time.Instant.now().toString(),
        )).await()
    }

    // ── Announcements ───────────────────────────────────────────────────────────────────

    fun announcements(eventId: String): Flow<List<OrgAnnouncement>> = callbackFlow {
        val reg = event(eventId).collection("announcements").orderBy("createdAt", Query.Direction.DESCENDING).addSnapshotListener { snap, err ->
            if (err != null || snap == null) return@addSnapshotListener
            trySend(snap.documents.mapNotNull { it.decode<OrgAnnouncement>() })
        }
        awaitClose { reg.remove() }
    }

    suspend fun announcement(eventId: String, id: String): OrgAnnouncement? =
        event(eventId).collection("announcements").document(id).get().await().takeIf { it.exists() }?.decode<OrgAnnouncement>()

    private fun audienceMap(a: AudienceFilter) = mapOf("roles" to a.roles, "committees" to a.committees, "userIds" to a.userIds, "paymentStatus" to a.paymentStatus)

    /** A draft: a new doc, or [id]'s doc updated in place. */
    suspend fun saveDraft(eventId: String, id: String?, subject: String, body: String, a: AudienceFilter, count: Int) {
        val fields = mapOf("subject" to subject, "body" to body, "audience" to audienceMap(a), "recipientCount" to count)
        if (id != null) event(eventId).collection("announcements").document(id).update(fields).await()
        else event(eventId).collection("announcements").add(fields + mapOf(
            "status" to "draft", "sentBy" to (AppGraph.auth.user?.uid ?: ""), "createdAt" to FieldValue.serverTimestamp(),
        )).await()
    }

    suspend fun deleteAnnouncement(eventId: String, id: String) { event(eventId).collection("announcements").document(id).delete().await() }

    /** The send route mails it and records it (status, recipients). A sent draft is then removed. */
    suspend fun send(eventId: String, draftId: String?, subject: String, body: String, a: AudienceFilter, count: Int): Api.Result {
        val res = Api.send("/api/announcements/send", "POST", buildJsonObject {
            put("eventId", eventId); put("subject", subject); put("body", body); put("recipientCount", count)
            putJsonObject("audience") {
                putJsonArray("roles") { a.roles.forEach { add(it) } }
                putJsonArray("committees") { a.committees.forEach { add(it) } }
                putJsonArray("userIds") { a.userIds.forEach { add(it) } }
                put("paymentStatus", a.paymentStatus)
            }
        }.toString())
        if (res.ok && draftId != null) runCatching { deleteAnnouncement(eventId, draftId) }
        return res
    }

    // ── Rules & regulations ─────────────────────────────────────────────────────────────

    suspend fun saveRules(eventId: String, content: String) {
        event(eventId).collection("settings").document("rulesRegulations").set(mapOf(
            "content" to content, "updatedAt" to Timestamp.now(), "updatedBy" to (AppGraph.auth.user?.uid ?: ""),
        )).await()
    }
}
