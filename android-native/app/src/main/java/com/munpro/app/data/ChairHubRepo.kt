package com.munpro.app.data

// The chair's committee hub between sittings (board B4; web dashboard/chair and
// dashboard/chair/committee/[id]). Same documents and writes as the web:
// - the roster is the committee's approved delegates from applications (chairs may read them);
// - marks are markings docs (MarkingRepo does every write as field paths);
// - floor activity is the sitting's participation docs, and the motion log its queue, history,
//   votes and points;
// - a position paper's grade lives on its OWN markings doc (no day, not the final), created on
//   the first save, so grading never touches a day's marks or feedback; the dais's private notes
//   are that doc's comments (rules: only those who run the committee read them).

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.munpro.app.AppGraph
import com.munpro.app.domain.ApplicationData
import com.munpro.app.domain.Complaint
import com.munpro.app.domain.DailyMarking
import com.munpro.app.domain.isPaperDoc
import com.munpro.app.domain.live.FinishedVoteRecord
import com.munpro.app.domain.live.Motion
import com.munpro.app.domain.live.MotionLogEntry
import com.munpro.app.domain.live.ParticipationSummary
import com.munpro.app.domain.live.RaisedPoint
import com.munpro.app.domain.belongsToCommittee
import com.munpro.app.domain.live.makeSessionId
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/** markings/{id}/comments: a dais member's private note on a paper. */
@Serializable
data class PaperNote(
    val id: String = "",
    val text: String = "",
    val authorId: String = "",
    val authorName: String = "",
    @Serializable(with = LenientMillis::class) val createdAt: Long? = null,
)

/** One line of the day's motion log (DailyMotionLog.buildItems). */
data class LogItem(val at: Long, val kind: String, val title: String, val detail: String, val outcome: String)

class ChairHubRepo {
    private val db = FirebaseFirestore.getInstance()
    private fun sub(e: String, s: String, name: String) = db.collection("events").document(e).collection("sessions").document(s).collection(name)

    /** The committee's approved delegates (the hub's roster: delegate roles only, staff never). */
    suspend fun roster(eventId: String, committee: String): List<ApplicationData> =
        AppGraph.applications.getApplicationsByEvent(eventId)
            .filter { Regex("delegate", RegexOption.IGNORE_CASE).containsMatchIn(it.role) && it.status == "approved" && belongsToCommittee(it, committee) && it.userId.isNotEmpty() }

    suspend fun participation(eventId: String, committee: String, dateStr: String): List<ParticipationSummary> = runCatching {
        sub(eventId, makeSessionId(committee, dateStr), "participation").get().await().documents.mapNotNull { it.decode<ParticipationSummary>() }
    }.getOrDefault(emptyList())

    /** getDailyMotionLog + buildItems: motions, points, votes and yields, in time order. */
    suspend fun motionLog(eventId: String, committee: String, dateStr: String): List<LogItem> {
        val s = makeSessionId(committee, dateStr)
        val queue = runCatching { sub(eventId, s, "motionQueue").get().await().documents.mapNotNull { it.decode<Motion>() } }.getOrDefault(emptyList())
        val history = runCatching { sub(eventId, s, "motions").get().await().documents.mapNotNull { it.decode<MotionLogEntry>() } }.getOrDefault(emptyList())
        val votes = runCatching { sub(eventId, s, "votes").get().await().documents.mapNotNull { it.decode<FinishedVoteRecord>() } }.getOrDefault(emptyList())
        val points = runCatching { sub(eventId, s, "points").get().await().documents.mapNotNull { it.decode<RaisedPoint>() } }.getOrDefault(emptyList())
        val out = mutableListOf<LogItem>()
        queue.forEach { m ->
            val outcome = when { m.autoResolved == true -> "out of order"; m.status == "executed" -> "carried"; m.status == "dropped" -> "dismissed"; else -> m.status }
            val bits = listOfNotNull(
                com.munpro.app.domain.countryName(m.byCountry).ifEmpty { null },
                m.params.topic?.ifBlank { null }?.let { "“$it”" },
                m.params.totalDurationSecs?.let { secs -> "${secs / 60} min" + (m.params.perSpeakerSecs?.let { ", ${it} s" } ?: "") },
                m.secondedBy?.ifBlank { null }?.let { "seconded by ${com.munpro.app.domain.countryName(it)}" },
            )
            out += LogItem(m.createdAt ?: 0L, "motion", "Motion · ${motionName(m.type)}", bits.joinToString(" · "), outcome)
        }
        points.forEach { p ->
            out += LogItem(p.createdAt ?: 0L, "point", "${pointName(p.type)} · ${com.munpro.app.domain.countryName(p.country)}",
                listOfNotNull(p.note?.ifBlank { null }?.let { "“$it”" }, p.chairNote?.ifBlank { null }?.let { "Chair: $it" }).joinToString(" · "), p.status)
        }
        votes.forEach { v ->
            out += LogItem(v.closedAt ?: v.startedAt ?: 0L, "vote", "Vote · ${v.motion}",
                "${v.affirmative}–${v.negative}–${v.abstentions} · ${if (v.mode == "roll_call") "roll call" else "show of hands"}", v.result)
        }
        history.filter { it.kind == "yield" || it.outcome == "raised" }.forEach { h ->
            if (h.kind == "yield") out += LogItem(h.at ?: 0L, "yield", "Yield · ${com.munpro.app.domain.countryName(h.byCountry)}", h.targetCountry?.let { "to ${com.munpro.app.domain.countryName(it)}" } ?: h.label, "yielded")
            else out += LogItem(h.at ?: 0L, if (h.kind == "point") "point" else "motion", h.label, com.munpro.app.domain.countryName(h.byCountry), "logged by chair")
        }
        return out.sortedBy { it.at }
    }

    private fun motionName(type: String) = type.replace('_', ' ').replaceFirstChar { it.uppercase() }
    private fun pointName(type: String) = when (type) {
        "order" -> "Point of Order"
        "information" -> "Point of Information"
        "personal_privilege" -> "Point of Personal Privilege"
        "parliamentary_inquiry" -> "Point of Parliamentary Inquiry"
        else -> "Point"
    }

    /** Requests assigned to me on this event that aren't closed (the hub's "Open complaints"). */
    suspend fun openRequests(eventId: String, uid: String): List<Complaint> = runCatching {
        db.collection("complaints").whereEqualTo("eventId", eventId).whereEqualTo("assignedTo", uid).get().await()
            .documents.mapNotNull { it.decode<Complaint>() }.filter { it.status != "resolved" && it.status != "rejected" }
    }.getOrDefault(emptyList())

    suspend fun hasStudyGuide(eventId: String, committee: String): Boolean = runCatching {
        db.collection("events").document(eventId).collection("studyGuides").document(committee).get().await().exists()
    }.getOrDefault(false)

    /** savePositionPaperGrade, always on the paper's own doc. Returns that doc's id. */
    suspend fun savePaperGrade(app: ApplicationData, committee: String, existing: DailyMarking?, score: Double?, feedback: String, status: String): String {
        val uid = AppGraph.auth.user?.uid.orEmpty()
        val fields = mapOf(
            "positionPaperScore" to score, "feedback" to feedback, "paperStatus" to status,
            "paperGradedAt" to FieldValue.serverTimestamp(), "updatedAt" to FieldValue.serverTimestamp(),
        )
        if (existing != null && existing.isPaperDoc) {
            db.collection("markings").document(existing.id).update(fields).await()
            return existing.id
        }
        val ref = db.collection("markings").add(fields + mapOf(
            "eventId" to app.eventId, "committeeId" to committee, "delegateId" to app.userId, "applicationId" to app.id,
            "scores" to emptyMap<String, Any>(), "gradedBy" to uid, "createdAt" to FieldValue.serverTimestamp(),
        )).await()
        return ref.id
    }

    fun notes(markingId: String): Flow<List<PaperNote>> = callbackFlow {
        val reg = db.collection("markings").document(markingId).collection("comments").orderBy("createdAt", Query.Direction.ASCENDING)
            .addSnapshotListener { snap, _ -> trySend(snap?.documents.orEmpty().mapNotNull { it.decode<PaperNote>() }) }
        awaitClose { reg.remove() }
    }

    suspend fun addNote(markingId: String, text: String) {
        val me = AppGraph.chats.me() ?: return
        db.collection("markings").document(markingId).collection("comments").add(mapOf(
            "text" to text.trim(), "authorId" to me.uid, "authorName" to me.name, "createdAt" to FieldValue.serverTimestamp(),
        )).await()
    }

    /** /api/notify/paper-reminder: the server finds who's missing and checks I run the committee. */
    suspend fun remindMissingPapers(eventId: String, committee: String, eventTitle: String): Result<Int> {
        val r = Api.send("/api/notify/paper-reminder", "POST", buildJsonObject {
            put("eventId", eventId); put("committee", committee); put("eventTitle", eventTitle)
        }.toString())
        return if (r.ok) Result.success(runCatching { (r.body as kotlinx.serialization.json.JsonObject)["sent"]!!.jsonPrimitive.content.toInt() }.getOrDefault(0))
        else Result.failure(IllegalStateException(r.error))
    }

    // ── Board B5: requests, study guide, room alerts, awards ─────────────────────────────────

    /** Requests assigned to me on this event, live (the web hub's complaint inbox query). */
    fun inbox(eventId: String, uid: String): Flow<List<Complaint>?> = callbackFlow {
        val reg = db.collection("complaints").whereEqualTo("eventId", eventId).whereEqualTo("assignedTo", uid).addSnapshotListener { snap, err ->
            if (err != null) { trySend(emptyList()); return@addSnapshotListener }
            trySend(snap?.documents.orEmpty().mapNotNull { it.decode<Complaint>() }.sortedByDescending { it.createdAt ?: 0L })
        }
        awaitClose { reg.remove() }
    }

    private fun entry(action: String, uid: String, role: String, message: String) = mapOf(
        "action" to action, "actorUid" to uid, "actorRole" to role, "message" to message, "timestamp" to java.time.Instant.now().toString(),
    )

    /** complaintService.resolveComplaint. */
    suspend fun resolveRequest(id: String, resolution: String, role: String = "chair") {
        val uid = AppGraph.auth.user?.uid ?: return
        db.collection("complaints").document(id).update(mapOf(
            "status" to "resolved", "resolution" to resolution.trim(),
            "history" to FieldValue.arrayUnion(entry("resolved", uid, role, resolution.trim().ifEmpty { "Resolved by $role." })),
            "actorUids" to FieldValue.arrayUnion(uid),
        )).await()
    }

    /**
     * complaintService.escalateComplaint: one level up the ladder (organizer, then the main
     * organizer, then the App Admin), then the server emails the new handler.
     */
    suspend fun escalateRequest(c: Complaint, reason: String = "Escalated to organizer.", role: String = "chair") {
        val uid = AppGraph.auth.user?.uid ?: return
        val ev = db.collection("events").document(c.eventId).get().await()
        var level = c.escalationLevel + 1
        val (assignedRole, assignedTo) = when {
            level == 1 -> "organizer" to ev.getString("organizerId")
            level == 2 && !ev.getString("mainOrganizerId").isNullOrEmpty() -> "mainOrganizer" to ev.getString("mainOrganizerId")
            else -> { level = 3; "appAdmin" to adminUid() }
        }
        db.collection("complaints").document(c.id).update(mapOf(
            "status" to "escalated", "escalationLevel" to level, "assignedRole" to assignedRole, "assignedTo" to assignedTo,
            "escalatedAt" to FieldValue.serverTimestamp(),
            "history" to FieldValue.arrayUnion(entry("escalated", uid, role, reason)),
            "actorUids" to FieldValue.arrayUnion(*listOfNotNull(uid, assignedTo).toTypedArray()),
        )).await()
        if (assignedTo != null) Api.send("/api/notify/complaint-escalated", "POST", buildJsonObject { put("complaintId", c.id) }.toString())
    }

    private suspend fun adminUid(): String? = runCatching {
        db.collection("users").whereIn("role", listOf("App Admin", "admin")).limit(1).get().await().documents.firstOrNull()?.id
    }.getOrNull()

    suspend fun studyGuide(eventId: String, committee: String): GuideDoc? =
        db.collection("events").document(eventId).collection("studyGuides").document(committee).get().await()
            .takeIf { it.exists() }?.decode<GuideDoc>()

    /**
     * studyGuidePublish.publishStudyGuide: save the guide, then (only once it has landed) the
     * server emails the committee's delegates and a room alert stays up for a week.
     */
    suspend fun publishStudyGuide(eventId: String, committee: String, content: String, isUpdate: Boolean, eventTitle: String?) {
        val me = AppGraph.chats.me() ?: error("Signed out")
        val ref = db.collection("events").document(eventId).collection("studyGuides").document(committee)
        val data = mapOf(
            "content" to content, "fileName" to "$committee-study-guide.md", "format" to "markdown",
            "uploadedAt" to FieldValue.serverTimestamp(), "uploadedBy" to me.uid,
        )
        // The web updates first so a legacy guide keeps its other fields.
        runCatching { ref.update(data).await() }.getOrElse { ref.set(data).await() }
        runCatching {
            Api.send("/api/notify/study-guide", "POST", buildJsonObject {
                put("eventId", eventId); put("committee", committee); put("eventTitle", eventTitle.orEmpty())
                put("chairName", me.name.ifEmpty { "Your chair" }); put("isUpdate", isUpdate)
            }.toString())
        }
        runCatching {
            sendRoomAlert(eventId, committee, "📚 Study guide ${if (isUpdate) "updated" else "published"} for $committee — open Documents → Study Guide.", "info", 7 * 24 * 60)
        }
    }

    suspend fun deleteStudyGuide(eventId: String, committee: String) {
        db.collection("events").document(eventId).collection("studyGuides").document(committee).delete().await()
    }

    /** roomNotificationService.sendRoomNotification: the banner every room member sees. */
    suspend fun sendRoomAlert(eventId: String, committee: String, message: String, type: String, minutes: Int) {
        val uid = AppGraph.auth.user?.uid ?: return
        db.collection("events").document(eventId).collection("committees").document(committee).collection("notifications").add(mapOf(
            "message" to message.trim(), "type" to type, "createdBy" to uid, "createdAt" to FieldValue.serverTimestamp(),
            "expiresAt" to com.google.firebase.Timestamp(java.util.Date(System.currentTimeMillis() + minutes * 60_000L)),
        )).await()
    }

    /** resultService.getResultsByCommittee: the awards already sent for this committee. */
    suspend fun results(eventId: String, committee: String): List<AwardResult> =
        db.collection("events").document(eventId).collection("results").whereEqualTo("committeeId", committee).get().await()
            .documents.mapNotNull { it.decode<AwardResult>() }

    /** resultService.submitResult, as the hub's Submit Awards writes it: pending until the organizer approves. */
    suspend fun submitAward(eventId: String, committee: String, awardType: String, app: ApplicationData, f: com.munpro.app.domain.FinalScore) {
        val uid = AppGraph.auth.user?.uid ?: return
        db.collection("events").document(eventId).collection("results").add(mapOf(
            "delegateUid" to app.userId, "delegateName" to app.applicantName.orEmpty().ifEmpty { "Delegate" },
            "committeeId" to committee, "committeeName" to committee, "awardType" to awardType,
            "score" to f.finalScore, "computedPct" to f.computedPct, "chairOverall" to f.chairOverall, "scoreKind" to "percent",
            "notes" to "", "status" to "pending", "approvedBy" to null, "approvedAt" to null, "submittedBy" to uid,
            "createdAt" to FieldValue.serverTimestamp(),
        )).await()
    }
}

/** events/{e}/studyGuides/{committee} as the editor needs it. */
@Serializable
data class GuideDoc(
    val content: String? = null,
    val fileName: String? = null,
    val uploadedBy: String? = null,
    @Serializable(with = LenientMillis::class) val uploadedAt: Long? = null,
)
