package com.munpro.app.data.live

// PORTED FROM src/lib/services/sessionService.ts (the Firestore half), plus
// markingService.mirrorAttendanceToMarkings, committeeDocService.updateCommitteeDoc,
// liveControlService.subscribeLiveControl, sessionChatService.ts and floorRequests.ts.
//
// Every function writes the same document paths and field names, in the same order, with the
// same transactions and batches as the TypeScript, so the phone and the web console are two views
// of one session. Read the web file for the reasoning behind each write; the comments here only
// flag what matters for a port. Location: events/{eventId}/sessions/{sessionId}.

import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.SetOptions
import com.munpro.app.data.decode
import com.munpro.app.domain.live.ActiveVote
import com.munpro.app.domain.live.DelegateRosterEntry
import com.munpro.app.domain.live.DuplicateMotionError
import com.munpro.app.domain.live.EventLiveControl
import com.munpro.app.domain.live.FloorGate
import com.munpro.app.domain.live.FloorRequest
import com.munpro.app.domain.live.LiveSession
import com.munpro.app.domain.live.Motion
import com.munpro.app.domain.live.MotionParams
import com.munpro.app.domain.live.POINT_META
import com.munpro.app.domain.live.ParticipationIdentity
import com.munpro.app.domain.live.Phase
import com.munpro.app.domain.live.RaisedPoint
import com.munpro.app.domain.live.ROLL_CALL_DEFAULT_SECS
import com.munpro.app.domain.live.RollCallTally
import com.munpro.app.domain.live.SIGNUP_WINDOW_DEFAULT_SECS
import com.munpro.app.domain.live.SessionChatMessage
import com.munpro.app.domain.live.SpeakerSlot
import com.munpro.app.domain.live.TimerState
import com.munpro.app.domain.live.VOTE_DEFAULT_SECS
import com.munpro.app.domain.live.BROADCAST_THREAD
import com.munpro.app.domain.live.CHAT_INBOX_LIMIT
import com.munpro.app.domain.live.caucusListState
import com.munpro.app.domain.live.computeVoteResult
import com.munpro.app.domain.live.eligibleVoterCount
import com.munpro.app.domain.live.floorHolder
import com.munpro.app.domain.live.floorSpeechClock
import com.munpro.app.domain.live.gateEndsAt
import com.munpro.app.domain.live.holdsTheFloor
import com.munpro.app.domain.live.makeSessionId
import com.munpro.app.domain.live.motionLabel
import com.munpro.app.domain.live.motionMeta
import com.munpro.app.domain.live.myLiveMotion
import com.munpro.app.domain.live.newTimer
import com.munpro.app.domain.live.normalizeChatText
import com.munpro.app.domain.live.normalizeLiveControl
import com.munpro.app.domain.live.signupIdFor
import com.munpro.app.domain.live.slotOfSignup
import com.munpro.app.domain.live.supersededByExecution
import com.munpro.app.domain.live.tallyRollCall
import com.munpro.app.domain.live.timerRemainingMs
import com.munpro.app.domain.live.yieldGrantMs
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import java.util.UUID
import kotlin.math.roundToLong

private val ts get() = FieldValue.serverTimestamp()

// ── map writers (the TS writes plain object literals; undefined fields are omitted) ─────────────

fun TimerState.toMap(): Map<String, Any?> = mapOf(
    "running" to running, "endsAt" to endsAt, "pausedRemainingMs" to pausedRemainingMs, "durationMs" to (durationMs ?: 0L),
)

fun SpeakerSlot.toMap(): Map<String, Any?> = buildMap {
    put("delegateId", delegateId)
    put("country", country)
    put("applicationId", applicationId)
    yieldTo?.let { put("yieldTo", it) }
    yieldTargetCountry?.let { put("yieldTargetCountry", it) }
    viaYield?.let { put("viaYield", it) }
    proxyBy?.let { put("proxyBy", it) }
    proxyByName?.let { put("proxyByName", it) }
    yieldProxyBy?.let { put("yieldProxyBy", it) }
    yieldProxyByName?.let { put("yieldProxyByName", it) }
}

private fun FloorGate.toMap(): Map<String, Any?> = buildMap {
    put("kind", kind)
    motionTypes?.let { put("motionTypes", it) }
    signupFor?.let { put("signupFor", it) }
    signupId?.let { put("signupId", it) }
    put("allowsPoints", allowsPoints)
    put("endsAt", endsAt)
    windowSecs?.let { put("windowSecs", it) }
    label?.let { put("label", it) }
    put("openedBy", openedBy)
    put("openedAt", ts)
}

/** Proxy attribution (a vice-chair acting for a delegation). Omitted when absent — never undefined. */
data class ProxyAttribution(val by: String, val byName: String)

private fun proxyFields(proxy: ProxyAttribution?): Map<String, Any> =
    if (proxy != null && proxy.by.isNotEmpty()) mapOf("proxyBy" to proxy.by, "proxyByName" to proxy.byName) else emptyMap()

private fun newCaucusId(): String {
    val rand = (1..6).map { "0123456789abcdefghijklmnopqrstuvwxyz".random() }.joinToString("")
    return "${java.lang.Long.toString(System.currentTimeMillis(), 36)}-$rand"
}

class SessionRepo {
    private val db = FirebaseFirestore.getInstance()

    private fun sessionRef(eventId: String, sessionId: String): DocumentReference =
        db.collection("events").document(eventId).collection("sessions").document(sessionId)
    private fun sub(eventId: String, sessionId: String, name: String) = sessionRef(eventId, sessionId).collection(name)
    private fun votesCol(e: String, s: String) = sub(e, s, "votes")
    private fun motionsCol(e: String, s: String) = sub(e, s, "motions")
    private fun participationCol(e: String, s: String) = sub(e, s, "participation")
    private fun pointsCol(e: String, s: String) = sub(e, s, "points")
    private fun requestsCol(e: String, s: String) = sub(e, s, "requests")
    private fun motionQueueCol(e: String, s: String) = sub(e, s, "motionQueue")
    private fun chatCol(e: String, s: String) = sub(e, s, "chat")

    // ── Subscriptions ──────────────────────────────────────────────────────────────────────────

    /** null = no session doc (or a read error, the web's cb(null)). */
    fun session(eventId: String, sessionId: String): Flow<LiveSession?> = callbackFlow {
        val reg = sessionRef(eventId, sessionId).addSnapshotListener { snap, err ->
            if (err != null) { trySend(null); return@addSnapshotListener }
            trySend(if (snap != null && snap.exists()) snap.decode<LiveSession>() else null)
        }
        awaitClose { reg.remove() }
    }

    private inline fun <reified T> listen(q: Query, crossinline sort: (List<T>) -> List<T> = { it }): Flow<List<T>> = callbackFlow {
        val reg = q.addSnapshotListener { snap, err ->
            if (err != null || snap == null) { trySend(emptyList()); return@addSnapshotListener }
            trySend(sort(snap.documents.mapNotNull { it.decode<T>() }))
        }
        awaitClose { reg.remove() }
    }

    fun points(e: String, s: String): Flow<List<RaisedPoint>> = listen(pointsCol(e, s).orderBy("createdAt", Query.Direction.DESCENDING))
    fun myPoints(e: String, s: String, uid: String): Flow<List<RaisedPoint>> =
        listen(pointsCol(e, s).whereEqualTo("delegateId", uid)) { r -> r.sortedByDescending { (it.createdAt ?: 0) / 1000 } }
    /** Points the chair RECOGNIZED — the floor holder's feed. Single-field equality, sorted here. */
    fun recognizedPoints(e: String, s: String): Flow<List<RaisedPoint>> =
        listen(pointsCol(e, s).whereEqualTo("status", "recognized")) { r -> r.sortedByDescending { (it.resolvedAt ?: 0) / 1000 } }
    fun requests(e: String, s: String): Flow<List<FloorRequest>> = listen(requestsCol(e, s).orderBy("createdAt", Query.Direction.DESCENDING))
    fun myHands(e: String, s: String, uid: String): Flow<List<FloorRequest>> =
        listen(requestsCol(e, s).whereEqualTo("delegateId", uid)) { r -> r.sortedByDescending { (it.createdAt ?: 0) / 1000 } }
    fun motionQueue(e: String, s: String): Flow<List<Motion>> = listen(motionQueueCol(e, s).orderBy("createdAt", Query.Direction.DESCENDING))
    fun myMotions(e: String, s: String, uid: String): Flow<List<Motion>> =
        listen(motionQueueCol(e, s).whereEqualTo("byDelegateId", uid)) { r -> r.sortedByDescending { (it.createdAt ?: 0) / 1000 } }

    /** events/{id}/liveControl/state. null = the organizer never opened Live MUN (or a read error). */
    // ── Live Control (liveControlService.ts writes; organizer / co-organizer only in the rules) ──
    //
    // WRITE ONLY THE FIELDS YOU MEAN: these merge, so spreading a default ceremony map through
    // one of them would reset its siblings (the web once turned a LIVE ceremony back to idle).

    private fun controlRef(eventId: String) = db.collection("events").document(eventId).collection("liveControl").document("state")

    suspend fun setSessionsOpen(eventId: String, open: Boolean, uid: String) {
        controlRef(eventId).set(buildMap<String, Any?> {
            put("eventId", eventId); put("sessionsOpen", open)
            if (open) { put("sessionsOpenedAt", System.currentTimeMillis()); put("sessionsOpenedBy", uid) }
            put("updatedAt", ts)
        }, SetOptions.merge()).await()
    }

    suspend fun setLiveControlNote(eventId: String, note: String) {
        controlRef(eventId).set(mapOf("eventId" to eventId, "note" to note, "updatedAt" to ts), SetOptions.merge()).await()
    }

    suspend fun setCeremonyTitle(eventId: String, kind: String, title: String) {
        controlRef(eventId).update(mapOf("$kind.title" to title, "updatedAt" to ts)).await()
    }

    /** startCeremony: the room doc first, so nobody follows the "live" flag into a missing room. */
    suspend fun startCeremony(eventId: String, kind: String, uid: String, title: String) {
        ensureCeremonySession(eventId, kind, uid)
        controlRef(eventId).set(mapOf(
            "eventId" to eventId,
            // endedAt null on purpose: merge writes INTO the map, and last run's end would survive.
            kind to mapOf("status" to "live", "title" to title, "startedAt" to System.currentTimeMillis(), "endedAt" to null, "startedBy" to uid),
            "updatedAt" to ts,
        ), SetOptions.merge()).await()
    }

    /** endCeremony: closing the room doc is what takes the video down for everyone. */
    suspend fun endCeremony(eventId: String, kind: String) {
        controlRef(eventId).update(mapOf("$kind.status" to "ended", "$kind.endedAt" to System.currentTimeMillis(), "updatedAt" to ts)).await()
        runCatching { sessionRef(eventId, "__ceremony__$kind").update(mapOf("phase" to Phase.CLOSED, "live.stage" to emptyList<String>(), "updatedAt" to ts)).await() }
    }

    /**
     * ensureCeremonySession: a ceremony has no roster, roll, quorum or list, and is never in the
     * liveSessions registry. `attendance` stays EMPTY: the /chat rule needs `uid in attendance`,
     * so "no chat in a ceremony" is enforced by the rules.
     */
    private suspend fun ensureCeremonySession(eventId: String, kind: String, createdBy: String) {
        val ref = sessionRef(eventId, "__ceremony__$kind")
        if (ref.get().await().exists()) {
            // Re-open; last time's speakers are not this time's.
            ref.update(mapOf("phase" to Phase.GSL, "finalized" to false, "live.stage" to emptyList<String>(), "live.callEnded" to false, "updatedAt" to ts)).await()
            return
        }
        ref.set(mapOf(
            "eventId" to eventId, "committeeId" to "__ceremony__", "dateStr" to "",
            "phase" to Phase.GSL, "quorumThreshold" to 0, "attendance" to emptyMap<String, Any>(),
            "gsl" to mapOf("defaultSpeakerSecs" to 0, "queue" to emptyList<Any>(), "activeSpeaker" to null, "timer" to newTimer(0).toMap(), "spoken" to 0),
            "caucus" to null, "activeVote" to null, "pointsMotions" to mapOf("byDelegate" to emptyMap<String, Any>()),
            "rollCall" to null, "live" to mapOf("stage" to emptyList<String>(), "callEnded" to false, "updatedAt" to ts),
            "staff" to emptyMap<String, Any>(), "pendingPublish" to null, "publishedResult" to null, "publishedDoc" to null,
            "finalized" to false, "createdBy" to createdBy, "createdAt" to ts, "updatedAt" to ts,
            "kind" to "ceremony", "ceremony" to kind,
        )).await()
    }

    /**
     * setCeremonyStage: who holds the ceremony floor, with their names in the same write — a
     * ceremony has no roster or attendance, so without the label every speaker reads "Speaker".
     */
    suspend fun setCeremonyStage(eventId: String, kind: String, uids: List<String>, labels: Map<String, Pair<String, String>>) {
        val data = mutableMapOf<String, Any?>("live.stage" to uids, "live.updatedAt" to ts, "updatedAt" to ts)
        for (u in uids) labels[u]?.let { (name, role) -> data["staff.$u"] = mapOf("uid" to u, "name" to name, "role" to role.ifEmpty { "guest" }) }
        sessionRef(eventId, "__ceremony__$kind").update(data).await()
    }

    /** The Live Control sittings table: open sittings only (one-shot; closed days would cost a read each). */
    suspend fun openSittings(eventId: String): List<Pair<String, LiveSession>> =
        db.collection("events").document(eventId).collection("sessions").whereNotEqualTo("phase", Phase.CLOSED).get().await()
            .documents.filter { !it.id.startsWith("__ceremony__") }
            .mapNotNull { d -> d.decode<LiveSession>()?.takeIf { !it.finalized && it.phase != Phase.CLOSED }?.let { d.id to it } }
            .sortedBy { it.second.committeeId }

    /** getLiveControl: one read, for the "ceremony is live" doors. */
    suspend fun liveControlOnce(eventId: String): EventLiveControl? {
        val snap = db.collection("events").document(eventId).collection("liveControl").document("state").get().await()
        return if (snap.exists()) normalizeLiveControl(eventId, snap.data) else null
    }

    fun liveControl(eventId: String): Flow<EventLiveControl?> = callbackFlow {
        val reg = db.collection("events").document(eventId).collection("liveControl").document("state").addSnapshotListener { snap, err ->
            if (err != null) { trySend(null); return@addSnapshotListener }
            trySend(if (snap != null && snap.exists()) normalizeLiveControl(eventId, snap.data) else null)
        }
        awaitClose { reg.remove() }
    }

    // ── Chat (sessionChatService.ts) ───────────────────────────────────────────────────────────

    data class ChatFeed(val messages: List<SessionChatMessage>, val denied: Boolean)

    /**
     * The delegate's own thread plus "@all". THIS QUERY SHAPE IS THE /chat RULE'S CONTRACT;
     * widening it kills the listener with permission-denied.
     */
    fun myThread(e: String, s: String, uid: String): Flow<ChatFeed> = chatListen(chatCol(e, s).whereIn("threadKey", listOf(uid, BROADCAST_THREAD)))

    /** The dais inbox (newest CHAT_INBOX_LIMIT messages). Mount only for someone the rule accepts as dais. */
    fun chatInbox(e: String, s: String): Flow<ChatFeed> = chatListen(chatCol(e, s).orderBy("sentAt", Query.Direction.DESCENDING).limit(CHAT_INBOX_LIMIT))

    /**
     * Every sitting this committee has had, newest day first: Messages threads one dais line across
     * days. Single-field equality (no index); a member's read passes canReadLive.
     */
    fun committeeSittings(e: String, committee: String): Flow<List<LiveSession>> =
        listen<LiveSession>(db.collection("events").document(e).collection("sessions").whereEqualTo("committeeId", committee)) { r -> r.sortedByDescending { it.dateStr } }

    private fun chatListen(q: Query): Flow<ChatFeed> = callbackFlow {
        val reg = q.addSnapshotListener { snap, err ->
            if (err != null || snap == null) {
                trySend(ChatFeed(emptyList(), (err as? FirebaseFirestoreException)?.code == FirebaseFirestoreException.Code.PERMISSION_DENIED))
                return@addSnapshotListener
            }
            trySend(ChatFeed(snap.documents.mapNotNull { it.decode<SessionChatMessage>() }.sortedBy { it.sentAt ?: 0L }, false))
        }
        awaitClose { reg.remove() }
    }

    private suspend fun chatWrite(e: String, s: String, fields: Map<String, Any>, raw: String) {
        val text = normalizeChatText(raw)
        if (e.isEmpty() || s.isEmpty() || text.isEmpty()) return
        chatCol(e, s).add(fields + mapOf("text" to text, "sentAt" to System.currentTimeMillis(), "createdAt" to ts)).await()
    }

    suspend fun sendDelegateNote(e: String, s: String, uid: String, name: String, country: String, text: String) {
        if (uid.isEmpty()) return
        chatWrite(e, s, mapOf("threadKey" to uid, "fromRole" to "delegate", "fromUid" to uid, "fromName" to name, "country" to country), text)
    }

    suspend fun sendDaisReply(e: String, s: String, threadKey: String, uid: String, name: String, text: String) {
        if (uid.isEmpty() || threadKey.isEmpty() || threadKey == BROADCAST_THREAD) return
        chatWrite(e, s, mapOf("threadKey" to threadKey, "fromRole" to "dais", "fromUid" to uid, "fromName" to name, "country" to ""), text)
    }

    suspend fun sendDaisBroadcast(e: String, s: String, uid: String, name: String, text: String) {
        if (uid.isEmpty()) return
        chatWrite(e, s, mapOf("threadKey" to BROADCAST_THREAD, "fromRole" to "dais", "fromUid" to uid, "fromName" to name, "country" to ""), text)
    }

    // ── Live-session registry (fire-and-forget) ────────────────────────────────────────────────

    private fun registerLiveSession(e: String, s: String, committeeId: String, dateStr: String, startedBy: String) {
        db.collection("liveSessions").document("${e}__$s").set(
            mapOf("eventId" to e, "sessionId" to s, "committeeId" to committeeId, "dateStr" to dateStr, "startedBy" to startedBy, "startedAt" to System.currentTimeMillis()),
            SetOptions.merge(),
        )
    }

    private fun unregisterLiveSession(e: String, s: String) {
        db.collection("liveSessions").document("${e}__$s").delete()
    }

    // ── Create / lifecycle ─────────────────────────────────────────────────────────────────────

    /** Idempotently create the day's session, seeding attendance ("absent") from the roster. */
    suspend fun ensureSession(
        eventId: String, committeeId: String, dateStr: String, createdBy: String,
        roster: List<DelegateRosterEntry>, defaultSpeakerSecs: Int = 90, agendas: List<String> = emptyList(),
    ) {
        val sessionId = makeSessionId(committeeId, dateStr)
        val ref = sessionRef(eventId, sessionId)
        val existing = ref.get().await()
        if (existing.exists()) {
            val s = existing.decode<LiveSession>()
            if (s != null && s.phase != Phase.CLOSED && !s.finalized) registerLiveSession(eventId, sessionId, committeeId, dateStr, createdBy)
            return
        }
        val attendance = roster.filter { it.delegateId.isNotEmpty() }.associate {
            it.delegateId to mapOf("status" to "absent", "country" to it.country, "delegateId" to it.delegateId, "applicationId" to it.applicationId)
        }
        val session = mapOf(
            "eventId" to eventId, "committeeId" to committeeId, "dateStr" to dateStr,
            "phase" to Phase.LOBBY,
            "quorumThreshold" to maxOf(1, Math.ceil(roster.size / 2.0).toInt()),
            "attendance" to attendance,
            "gsl" to mapOf(
                "defaultSpeakerSecs" to defaultSpeakerSecs, "queue" to emptyList<Any>(), "activeSpeaker" to null,
                "timer" to newTimer(defaultSpeakerSecs * 1000L).toMap(), "spoken" to 0,
            ),
            "caucus" to null,
            "activeVote" to null,
            "pointsMotions" to mapOf("byDelegate" to emptyMap<String, Any>()),
            "agenda" to mapOf(
                "items" to agendas.map { it.trim() }.filter { it.isNotEmpty() }.mapIndexed { i, t -> mapOf("id" to "a$i", "title" to t, "status" to "pending") },
                "activeIndex" to -1,
                "source" to "committee",
            ),
            "rollCall" to null,
            // Starts shut; the chair opens roll call first.
            "floorGate" to mapOf("kind" to "locked", "allowsPoints" to false, "endsAt" to null, "openedBy" to createdBy, "openedAt" to ts),
            "live" to mapOf("stage" to emptyList<String>(), "updatedAt" to ts),
            "staff" to emptyMap<String, Any>(),
            "pendingPublish" to null,
            "publishedResult" to null,
            "publishedDoc" to null,
            "finalized" to false,
            "createdBy" to createdBy,
            "createdAt" to ts,
            "updatedAt" to ts,
        )
        ref.set(session).await()
        registerLiveSession(eventId, sessionId, committeeId, dateStr, createdBy)
    }

    /** Generic field-scoped writer — always stamps updatedAt. */
    private suspend fun patch(e: String, s: String, data: Map<String, Any?>) {
        sessionRef(e, s).update(data + ("updatedAt" to ts)).await()
    }

    suspend fun setPhase(e: String, s: String, phase: String) {
        patch(e, s, mapOf("phase" to phase))
        if (phase == Phase.CLOSED) unregisterLiveSession(e, s)
    }

    /** sessionService.closeStaleSitting: closed, nobody left on the video stage, out of the registry. */
    suspend fun closeStaleSitting(e: String, s: String) {
        patch(e, s, mapOf("phase" to Phase.CLOSED, "live.stage" to emptyList<String>(), "live.updatedAt" to ts))
        unregisterLiveSession(e, s)
    }

    /**
     * sessionService.closeEarlierSittings: close this committee's sittings from days before
     * [beforeDateStr] that nobody closed. Fire-and-forget from Start; one read per sitting the
     * committee has ever had.
     */
    suspend fun closeEarlierSittings(e: String, committeeId: String, beforeDateStr: String) {
        runCatching {
            val snap = db.collection("events").document(e).collection("sessions").whereEqualTo("committeeId", committeeId).get().await()
            for (d in snap.documents) {
                if (d.id.startsWith("__ceremony__") || d.getString("phase") == Phase.CLOSED) continue
                val day = d.getString("dateStr").orEmpty()
                if (day.isNotEmpty() && day < beforeDateStr) closeStaleSitting(e, d.id)
            }
        }
    }

    // ── Floor gate ─────────────────────────────────────────────────────────────────────────────

    suspend fun openGate(e: String, s: String, openedBy: String, spec: FloorGate) =
        patch(e, s, mapOf("floorGate" to spec.copy(openedBy = openedBy).toMap()))

    /** Shut the floor. */
    suspend fun closeGate(e: String, s: String, openedBy: String) =
        openGate(e, s, openedBy, FloorGate(kind = "locked", allowsPoints = false, endsAt = null))

    // ── Roll call ──────────────────────────────────────────────────────────────────────────────

    /** Open the roll: phase, gate and record in one patch (record written WHOLE, so a retake clears). */
    suspend fun startRollCall(e: String, s: String, openedBy: String, secs: Int? = ROLL_CALL_DEFAULT_SECS) {
        val now = System.currentTimeMillis()
        val endsAt = gateEndsAt(secs, now)
        patch(e, s, mapOf(
            "phase" to Phase.ROLL_CALL,
            "floorGate" to buildMap {
                put("kind", "roll_call"); put("allowsPoints", false); put("endsAt", endsAt)
                if (secs != null) put("windowSecs", secs)
                put("openedBy", openedBy); put("openedAt", ts)
            },
            "rollCall" to mapOf("startedAt" to now, "endsAt" to endsAt, "windowSecs" to secs, "closedAt" to null, "completedAt" to null, "openedBy" to openedBy),
        ))
    }

    /** Stop the roll early; shuts the gate in the same patch. */
    suspend fun stopRollCall(e: String, s: String, closedBy: String) {
        patch(e, s, mapOf(
            "rollCall.closedAt" to System.currentTimeMillis(),
            "floorGate" to mapOf("kind" to "locked", "allowsPoints" to false, "endsAt" to null, "openedBy" to closedBy, "openedAt" to ts),
        ))
    }

    /** The chair's ruling. Transactional and idempotent; freezes the tally; mirrors to markings. */
    suspend fun completeRollCall(e: String, s: String, completedBy: String): RollCallTally {
        val ref = sessionRef(e, s)
        var out: RollCallTally? = null
        var mirror: Triple<String, String, List<Triple<String, String, String>>>? = null
        db.runTransaction { tx ->
            val snap = tx.get(ref)
            if (!snap.exists()) return@runTransaction
            val sess = snap.decode<LiveSession>() ?: return@runTransaction
            val tally = tallyRollCall(sess.attendance, sess.quorumThreshold ?: 0)
            out = tally
            if (sess.rollCall?.completedAt != null && sess.rollCall.completedAt > 0) return@runTransaction
            mirror = Triple(sess.committeeId, sess.dateStr, sess.attendance.values.filter { it.delegateId.isNotEmpty() }.map { Triple(it.delegateId, it.applicationId, it.status) })
            val now = System.currentTimeMillis()
            @Suppress("UNCHECKED_CAST")
            val existing = (snap.get("rollCall") as? Map<String, Any?>) ?: mapOf("startedAt" to now, "endsAt" to null)
            val record = existing + mapOf(
                "closedAt" to (sess.rollCall?.closedAt ?: now),
                "completedAt" to now,
                "completedBy" to completedBy,
                "present" to tally.present, "presentAndVoting" to tally.presentAndVoting, "late" to tally.late,
                "absent" to tally.absent, "answered" to tally.answered, "seated" to tally.seated, "total" to tally.total,
                "quorumThreshold" to tally.quorumThreshold, "quorumMet" to tally.quorumMet,
            )
            val update = mutableMapOf<String, Any?>("rollCall" to record, "updatedAt" to ts)
            if (sess.floorGate?.kind == "roll_call") {
                update["floorGate"] = mapOf("kind" to "locked", "allowsPoints" to false, "endsAt" to null, "openedBy" to completedBy, "openedAt" to ts)
            }
            tx.update(ref, update)
        }.await()
        mirror?.let { (committeeId, dateStr, rows) -> mirrorAttendanceToMarkings(e, committeeId, dateStr, rows, completedBy) }
        return out ?: tallyRollCall(emptyMap(), 0)
    }

    /** suspendSession: phase + clock together. */
    suspend fun suspendSession(e: String, s: String) {
        val ref = sessionRef(e, s)
        db.runTransaction { tx ->
            val snap = tx.get(ref)
            if (!snap.exists()) return@runTransaction
            val sess = snap.decode<LiveSession>() ?: return@runTransaction
            if (sess.phase == Phase.SUSPENDED) return@runTransaction
            val c = readClock(sess)
            tx.update(ref, mapOf("phase" to Phase.SUSPENDED, "clock" to mapOf("startedAt" to c.first, "accumulatedMs" to c.second, "suspendedAt" to System.currentTimeMillis()), "updatedAt" to ts))
        }.await()
    }

    // ── Committee documents, the dais side (committeeDocService + sessionService.publishDocToProjector) ──

    /**
     * subscribeCommitteeDocs: every paper in THIS committee, any status. Scoped by the query, not
     * a client filter: the read rule judges each result by its committee, and one paper from
     * another committee still collecting endorsements would fail the whole listener.
     */
    fun reviewDocs(eventId: String, committee: String): Flow<List<com.munpro.app.domain.CommitteeDoc>> = callbackFlow {
        val reg = db.collection("events").document(eventId).collection("committeeDocs").whereEqualTo("committee", committee)
            .addSnapshotListener { snap, err ->
                if (err != null || snap == null) { trySend(emptyList()); return@addSnapshotListener }
                trySend(snap.documents.mapNotNull { it.decode<com.munpro.app.domain.CommitteeDoc>() }.sortedByDescending { it.createdAt ?: 0L })
            }
        awaitClose { reg.remove() }
    }

    /** updateCommitteeDocStatus: approve, or reject with the chair's note. */
    suspend fun setDocStatus(eventId: String, docId: String, status: String, chairNote: String, reviewedBy: String) {
        db.collection("events").document(eventId).collection("committeeDocs").document(docId)
            .update(mapOf("status" to status, "chairNote" to chairNote, "reviewedBy" to reviewedBy, "updatedAt" to ts)).await()
    }

    /** publishDocToProjector: the paper the room is looking at. */
    suspend fun publishDoc(e: String, s: String, d: com.munpro.app.domain.CommitteeDoc, chairUid: String) = patch(e, s, mapOf(
        "publishedDoc" to mapOf(
            "docId" to d.id, "title" to d.title, "docType" to d.type, "submittedCountry" to d.submittedCountry,
            "sponsors" to d.sponsors, "signatories" to d.signatories, "publishedAt" to ts, "publishedBy" to chairUid,
        ),
    ))

    suspend fun unpublishDoc(e: String, s: String) = patch(e, s, mapOf("publishedDoc" to null))

    /** resumeSession: back to [phase], banking the break into the clock, both in one write. */
    suspend fun resumeSession(e: String, s: String, phase: String = Phase.GSL) {
        val ref = sessionRef(e, s)
        db.runTransaction { tx ->
            val snap = tx.get(ref)
            if (!snap.exists()) return@runTransaction
            val sess = snap.decode<LiveSession>() ?: return@runTransaction
            val (startedAt, acc, suspendedAt) = readClock(sess)
            // No matching suspend banks nothing rather than `now - startedAt`.
            val breakMs = if (suspendedAt != null && suspendedAt > 0) maxOf(0, System.currentTimeMillis() - suspendedAt) else 0
            tx.update(ref, mapOf("phase" to phase, "clock" to mapOf("startedAt" to startedAt, "accumulatedMs" to acc + breakMs, "suspendedAt" to null), "updatedAt" to ts))
        }.await()
    }

    /** keepAlive: "Continue meeting" on the idle warning. */
    suspend fun keepAlive(e: String, s: String) = patch(e, s, mapOf("live.keepAliveAt" to System.currentTimeMillis()))

    /** Local mirror of sessionClock.ts' normalizer: (startedAt, accumulatedMs, suspendedAt). */
    private fun readClock(s: LiveSession): Triple<Long, Long, Long?> {
        val c = s.clock
        if (c?.startedAt != null && c.startedAt > 0) return Triple(c.startedAt, maxOf(0, c.accumulatedMs ?: 0), c.suspendedAt)
        return Triple(s.createdAt?.takeIf { it > 0 } ?: System.currentTimeMillis(), 0, null)
    }

    /** Un-finalize / reopen the day. Banks the stopped stretch into the clock, clears callEnded. */
    suspend fun reopenSession(e: String, s: String, phase: String = Phase.GSL) {
        val ref = sessionRef(e, s)
        var meta: Triple<String, String, String>? = null
        db.runTransaction { tx ->
            val snap = tx.get(ref)
            if (!snap.exists()) return@runTransaction
            val sess = snap.decode<LiveSession>() ?: return@runTransaction
            val (startedAt, acc, suspendedAt) = readClock(sess)
            val now = System.currentTimeMillis()
            val stoppedAt = if (sess.finalized) (sess.finalizedAt?.takeIf { it > 0 } ?: suspendedAt) else suspendedAt
            val gapMs = if (stoppedAt != null && stoppedAt > 0) maxOf(0, now - stoppedAt) else 0
            tx.update(ref, mapOf(
                "finalized" to false, "finalizedAt" to null, "phase" to phase,
                "clock" to mapOf("startedAt" to startedAt, "accumulatedMs" to acc + gapMs, "suspendedAt" to null),
                "live.callEnded" to false, "live.updatedAt" to ts, "updatedAt" to ts,
            ))
            meta = Triple(sess.committeeId, sess.dateStr, sess.createdBy)
        }.await()
        meta?.let { (c, d, by) -> registerLiveSession(e, s, c, d, by) }
    }

    // ── Agenda (only what a passed set_agenda motion needs) ────────────────────────────────────

    suspend fun adoptAgendaTopic(e: String, s: String, title: String) {
        val wanted = title.trim()
        if (wanted.isEmpty()) return
        val key = wanted.lowercase()
        val ref = sessionRef(e, s)
        db.runTransaction { tx ->
            val snap = tx.get(ref)
            if (!snap.exists()) return@runTransaction
            @Suppress("UNCHECKED_CAST") val agenda = snap.get("agenda") as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST") val items = ((agenda?.get("items") as? List<Map<String, Any?>>) ?: emptyList()).toMutableList()
            val activeIndex = (agenda?.get("activeIndex") as? Number)?.toInt() ?: -1
            var idx = items.indexOfFirst { (it["title"] as? String).orEmpty().trim().lowercase() == key }
            if (idx < 0) {
                idx = items.size
                items += mapOf("id" to "a${System.currentTimeMillis()}", "title" to wanted, "status" to "pending")
            }
            val now = System.currentTimeMillis()
            val next = items.mapIndexed { i, it ->
                when {
                    i == idx -> it + mapOf("status" to "active", "startedAt" to (it["startedAt"] ?: now))
                    it["status"] == "active" -> it + ("status" to "tabled")
                    else -> it
                }
            }
            val update = mutableMapOf<String, Any?>("agenda.items" to next, "agenda.activeIndex" to idx, "agenda.source" to "motion", "updatedAt" to ts)
            if (idx != activeIndex) update["gsl.spoken"] = 0
            tx.update(ref, update)
        }.await()
    }

    // ── Attendance + participation ─────────────────────────────────────────────────────────────

    /** The identity fields of one attendance entry, re-asserted on every chair write. */
    private fun attendanceIdentityFields(id: ParticipationIdentity): Map<String, Any> {
        val base = "attendance.${id.delegateId}"
        return buildMap {
            put("$base.delegateId", id.delegateId)
            if (id.country.isNotEmpty()) put("$base.country", id.country)
            if (id.applicationId.isNotEmpty()) put("$base.applicationId", id.applicationId)
        }
    }

    suspend fun setAttendance(e: String, s: String, identity: ParticipationIdentity, status: String) {
        patch(e, s, mapOf("attendance.${identity.delegateId}.status" to status) + attendanceIdentityFields(identity))
        bumpParticipation(e, s, identity, emptyMap(), status)
        mirrorAttendanceToMarkings(identity.eventId, identity.committeeId, identity.dateStr, listOf(Triple(identity.delegateId, identity.applicationId, status)), null)
    }

    // ── Session report (buildCommitteeReport / getMyParticipation): one-shot reads ──────────────

    /** The whole committee's day (dais only: reads every delegate's participation). */
    suspend fun committeeReport(e: String, committee: String, dateStr: String, quorum: Int): com.munpro.app.domain.live.CommitteeReport {
        val s = makeSessionId(committee, dateStr)
        val part = participationCol(e, s).get().await().documents.mapNotNull { it.decode<com.munpro.app.domain.live.ParticipationSummary>() }
        val points = pointsCol(e, s).get().await().documents.mapNotNull { it.decode<RaisedPoint>() }
        // The web tolerates these two failing (old sessions, missing index); so does this.
        val votes = runCatching { votesCol(e, s).get().await().documents.mapNotNull { it.decode<com.munpro.app.domain.live.FinishedVoteRecord>() } }.getOrDefault(emptyList())
        val log = runCatching { motionsCol(e, s).get().await().documents.mapNotNull { it.decode<com.munpro.app.domain.live.MotionLogEntry>() } }.getOrDefault(emptyList())
        val roll = runCatching { sessionRef(e, s).get().await().decode<LiveSession>()?.attendance }.getOrNull().orEmpty()
        return com.munpro.app.domain.live.buildCommitteeReport(part, points, votes, log, quorum, roll)
    }

    /** One delegation's row, from what a delegate may read: its own participation and points. */
    suspend fun myReportRow(e: String, committee: String, dateStr: String, identity: ParticipationIdentity): com.munpro.app.domain.live.DelegateReportRow {
        com.munpro.app.data.Membership.ensure(identity.delegateId, e)
        val s = makeSessionId(committee, dateStr)
        val me = identity.delegateId
        val roll = runCatching { sessionRef(e, s).get().await().decode<LiveSession>()?.attendance }.getOrNull().orEmpty()
        val doc = runCatching { participationCol(e, s).document(me).get().await().decode<com.munpro.app.domain.live.ParticipationSummary>() }.getOrNull()
        // The roll decides attendance (self-declared roll calls never write participation).
        val part = com.munpro.app.domain.live.withRollAttendance(listOfNotNull(doc), roll.filterKeys { it == me }).firstOrNull()
            ?: com.munpro.app.domain.live.ParticipationSummary(delegateId = me, country = identity.country, applicationId = identity.applicationId)
        val points = runCatching { pointsCol(e, s).whereEqualTo("delegateId", me).get().await().documents.mapNotNull { it.decode<RaisedPoint>() } }.getOrDefault(emptyList())
        val log = runCatching { motionsCol(e, s).get().await().documents.mapNotNull { it.decode<com.munpro.app.domain.live.MotionLogEntry>() } }.getOrDefault(emptyList())
        return com.munpro.app.domain.live.toReportRow(part, points, log)
    }

    /** Increment participation counters (and optionally set attendance) — identity re-asserted via merge. */
    suspend fun bumpParticipation(e: String, s: String, identity: ParticipationIdentity, deltas: Map<String, Long>, attendanceStatus: String? = null) {
        val payload = mutableMapOf<String, Any?>(
            "delegateId" to identity.delegateId, "country" to identity.country, "applicationId" to identity.applicationId,
            "eventId" to identity.eventId, "committeeId" to identity.committeeId, "dateStr" to identity.dateStr, "updatedAt" to ts,
        )
        if (attendanceStatus != null) payload["attendanceStatus"] = attendanceStatus
        for ((k, v) in deltas) if (v != 0L) payload[k] = FieldValue.increment(v)
        participationCol(e, s).document(identity.delegateId).set(payload, SetOptions.merge()).await()
    }

    /** markingService.mirrorAttendanceToMarkings — fire-and-forget, never markMode. */
    private fun mirrorAttendanceToMarkings(eventId: String, committeeId: String, dateStr: String, rows: List<Triple<String, String, String>>, gradedBy: String?) {
        if (eventId.isEmpty() || committeeId.isEmpty() || dateStr.isEmpty() || rows.isEmpty()) return
        val batch = db.batch()
        for ((delegateId, applicationId, status) in rows) {
            batch.set(db.collection("markings").document("${committeeId}_${delegateId}_$dateStr"), buildMap<String, Any?> {
                put("eventId", eventId); put("committeeId", committeeId); put("delegateId", delegateId)
                put("applicationId", applicationId); put("dateStr", dateStr)
                if (gradedBy != null) put("gradedBy", gradedBy)
                put("attendanceStatus", status); put("attendanceSource", "rollcall"); put("updatedAt", ts)
            }, SetOptions.merge())
        }
        batch.commit()
    }

    // ── Timers ─────────────────────────────────────────────────────────────────────────────────

    suspend fun timerStart(e: String, s: String, path: String, remainingMs: Long) = patch(e, s, mapOf(
        "$path.running" to true, "$path.endsAt" to System.currentTimeMillis() + maxOf(0, remainingMs),
        "$path.pausedRemainingMs" to null, "$path.updatedAt" to ts,
    ))

    suspend fun timerPause(e: String, s: String, path: String, remainingMs: Long) = patch(e, s, mapOf(
        "$path.running" to false, "$path.endsAt" to null, "$path.pausedRemainingMs" to maxOf(0, remainingMs), "$path.updatedAt" to ts,
    ))

    // ── General Speakers List ──────────────────────────────────────────────────────────────────

    private suspend fun setGslDefaultSecs(e: String, s: String, secs: Int) = patch(e, s, mapOf("gsl.defaultSpeakerSecs" to secs))

    private fun speakerSlotPath(s: LiveSession): String = if (s.caucus?.kind == "moderated") "caucus.currentSpeaker" else "gsl.activeSpeaker"

    private data class FinishedSpeech(val slot: SpeakerSlot, val elapsedMs: Long, val kind: String)

    private fun finishingSpeech(s: LiveSession, kind: String): FinishedSpeech? {
        if (kind == "caucus") {
            val slot = if (s.caucus?.kind == "moderated") s.caucus.currentSpeaker else null
            if (slot == null || slot.delegateId.isEmpty()) return null
            val t = s.caucus?.speakerTimer
            return FinishedSpeech(slot, (t?.durationMs ?: 0) - timerRemainingMs(t), kind)
        }
        val slot = s.gsl?.activeSpeaker
        if (slot == null || slot.delegateId.isEmpty()) return null
        val t = s.gsl.timer
        return FinishedSpeech(slot, (t?.durationMs ?: 0) - timerRemainingMs(t), kind)
    }

    /** Credit ONE finished speech — after the commit, never inside it (the body can re-run). */
    private suspend fun creditFinishedSpeech(e: String, sId: String, s: LiveSession, fin: FinishedSpeech?) {
        if (fin == null) return
        val seconds = maxOf(0L, (fin.elapsedMs / 1000.0).roundToLong())
        val identity = ParticipationIdentity(fin.slot.delegateId, fin.slot.country, fin.slot.applicationId, s.eventId, s.committeeId, s.dateStr)
        runCatching {
            bumpParticipation(e, sId, identity, if (fin.kind == "caucus") mapOf("caucusSpeeches" to 1L, "speakingSeconds" to seconds) else mapOf("speeches" to 1L, "speakingSeconds" to seconds))
        }
    }

    /** Advance the GSL: pop queue head → activeSpeaker, reset the speaker timer. Transactional. */
    suspend fun nextSpeaker(e: String, s: String) {
        val ref = sessionRef(e, s)
        var credit: Pair<LiveSession, FinishedSpeech?>? = null
        db.runTransaction { tx ->
            val snap = tx.get(ref)
            if (!snap.exists()) return@runTransaction
            val sess = snap.decode<LiveSession>() ?: return@runTransaction
            credit = sess to finishingSpeech(sess, "gsl")
            val queue = sess.gsl?.queue.orEmpty().toMutableList()
            val next = queue.removeFirstOrNull()
            val durationMs = (sess.gsl?.defaultSpeakerSecs ?: 90) * 1000L
            val update = mutableMapOf<String, Any?>(
                "gsl.queue" to queue.map { it.toMap() },
                "gsl.activeSpeaker" to next?.toMap(),
                "gsl.timer" to newTimer(durationMs).toMap(),
                "live.stage" to (if (next != null) listOf(next.delegateId) else emptyList()),
                "live.updatedAt" to ts,
                "phase" to Phase.GSL,
                "updatedAt" to ts,
            )
            if (next != null) update["gsl.spoken"] = (sess.gsl?.spoken ?: 0) + 1
            tx.update(ref, update)
        }.await()
        credit?.let { (sess, fin) -> creditFinishedSpeech(e, s, sess, fin) }
    }

    /** Retire the current GSL speaker without advancing. Credits their speech. */
    suspend fun clearActiveSpeaker(e: String, s: String) {
        val ref = sessionRef(e, s)
        var credit: Pair<LiveSession, FinishedSpeech?>? = null
        db.runTransaction { tx ->
            val snap = tx.get(ref)
            if (!snap.exists()) return@runTransaction
            val sess = snap.decode<LiveSession>() ?: return@runTransaction
            credit = sess to finishingSpeech(sess, "gsl")
            tx.update(ref, mapOf("gsl.activeSpeaker" to null, "live.stage" to emptyList<String>(), "live.updatedAt" to ts, "updatedAt" to ts))
        }.await()
        credit?.let { (sess, fin) -> creditFinishedSpeech(e, s, sess, fin) }
    }

    /** Explicit chair override of the video stage (single-speaker model). */
    suspend fun setStage(e: String, s: String, uids: List<String>) = patch(e, s, mapOf("live.stage" to uids, "live.updatedAt" to ts))

    /**
     * sessionService.endLiveCall: every client leaves the video as on a close, but the SESSION
     * stays open (marking, report). Clears the stage so no stale uid can mint a publisher token.
     */
    suspend fun endLiveCall(e: String, s: String) =
        patch(e, s, mapOf("live.callEnded" to true, "live.stage" to emptyList<String>(), "live.updatedAt" to ts))

    /** sessionService.startLiveCall: bring the video back after [endLiveCall]; clients rejoin. */
    suspend fun startLiveCall(e: String, s: String) =
        patch(e, s, mapOf("live.callEnded" to false, "live.updatedAt" to ts))

    // ── Yields ─────────────────────────────────────────────────────────────────────────────────

    /** Yield the GSL floor to `target`, ADDING the speaker's remaining time to their own allotment. */
    suspend fun yieldFloorToDelegate(e: String, s: String, target: SpeakerSlot, yieldedMs: Long) {
        val ref = sessionRef(e, s)
        db.runTransaction { tx ->
            val snap = tx.get(ref)
            if (!snap.exists()) return@runTransaction
            val sess = snap.decode<LiveSession>() ?: return@runTransaction
            val queue = sess.gsl?.queue.orEmpty().filter { it.delegateId != target.delegateId }
            val totalMs = yieldGrantMs(sess.gsl?.defaultSpeakerSecs, yieldedMs)
            tx.update(ref, mapOf(
                "gsl.queue" to queue.map { it.toMap() },
                "gsl.activeSpeaker" to target.copy(yieldTo = "none", yieldTargetCountry = "", viaYield = true).toMap(),
                "gsl.timer.running" to true,
                "gsl.timer.endsAt" to System.currentTimeMillis() + totalMs,
                "gsl.timer.pausedRemainingMs" to null,
                "gsl.timer.durationMs" to totalMs,
                "gsl.timer.updatedAt" to ts,
                "live.stage" to listOf(target.delegateId),
                "live.updatedAt" to ts,
                "phase" to Phase.GSL,
                "updatedAt" to ts,
            ))
        }.await()
    }

    /** The caucus twin. MUST NOT write `phase` (that would end the caucus mid-speech). */
    suspend fun yieldCaucusFloorToDelegate(e: String, s: String, target: SpeakerSlot, yieldedMs: Long) {
        val ref = sessionRef(e, s)
        db.runTransaction { tx ->
            val snap = tx.get(ref)
            if (!snap.exists()) return@runTransaction
            val sess = snap.decode<LiveSession>() ?: return@runTransaction
            val c = sess.caucus ?: return@runTransaction
            if (c.kind != "moderated") return@runTransaction
            val queue = c.queue.orEmpty().filter { it.delegateId != target.delegateId }
            val totalMs = yieldGrantMs(c.perSpeakerSecs, yieldedMs)
            tx.update(ref, mapOf(
                "caucus.queue" to queue.map { it.toMap() },
                "caucus.currentSpeaker" to target.copy(yieldTo = "none", yieldTargetCountry = "", viaYield = true).toMap(),
                "caucus.currentCountry" to target.country,
                "caucus.speakerTimer.running" to true,
                "caucus.speakerTimer.endsAt" to System.currentTimeMillis() + totalMs,
                "caucus.speakerTimer.pausedRemainingMs" to null,
                "caucus.speakerTimer.durationMs" to totalMs,
                "caucus.speakerTimer.updatedAt" to ts,
                "live.stage" to listOf(target.delegateId),
                "live.updatedAt" to ts,
                "updatedAt" to ts,
            ))
        }.await()
    }

    data class YieldResult(val ok: Boolean, val reason: String? = null)

    /** The chair accepts a delegate's `yield` request — the ONE path for it. Refusals resolve "dismissed". */
    suspend fun acceptYieldRequest(e: String, s: String, session: LiveSession, req: FloorRequest, chairUid: String): YieldResult {
        val active = floorHolder(session)
        if (active == null || !holdsTheFloor(session, req.delegateId)) {
            resolveHand(e, s, req, "dismissed", chairUid); return YieldResult(false, "stale")
        }
        if (active.viaYield == true) {
            resolveHand(e, s, req, "dismissed", chairUid); return YieldResult(false, "via-yield")
        }
        if (req.yieldTargetDelegateId.isNullOrEmpty()) {
            resolveHand(e, s, req, "dismissed", chairUid); return YieldResult(false, "no-target")
        }
        val identity = ParticipationIdentity(req.delegateId, req.country, req.applicationId, e, session.committeeId, session.dateStr)
        val inCaucus = session.caucus?.kind == "moderated"
        val timer = floorSpeechClock(session).timer
        val remaining = timerRemainingMs(timer)
        val elapsedMs = (timer?.durationMs ?: 0) - remaining
        bumpParticipation(e, s, identity, (if (inCaucus) mapOf("caucusSpeeches" to 1L) else mapOf("speeches" to 1L)) + ("speakingSeconds" to maxOf(0L, (elapsedMs / 1000.0).roundToLong())))
        logMotion(e, s, mapOf(
            "kind" to "yield",
            "label" to "${req.country.ifEmpty { "Delegate" }} yielded to ${req.yieldTargetCountry?.ifEmpty { null } ?: "a delegation"}",
            "byDelegateId" to req.delegateId, "byCountry" to req.country,
            "targetCountry" to req.yieldTargetCountry.orEmpty(), "targetDelegateId" to req.yieldTargetDelegateId,
        ), null)
        val target = SpeakerSlot(req.yieldTargetDelegateId, req.yieldTargetCountry.orEmpty(), req.yieldTargetApplicationId.orEmpty())
        // The LIVE clock, not req.yieldRemainingMs — the speech kept running while the chair decided.
        if (inCaucus) yieldCaucusFloorToDelegate(e, s, target, remaining) else yieldFloorToDelegate(e, s, target, remaining)
        resolveHand(e, s, req, "granted", chairUid)
        return YieldResult(true)
    }

    suspend fun declineYieldRequest(e: String, s: String, req: FloorRequest, chairUid: String) = resolveHand(e, s, req, "dismissed", chairUid)

    // ── Caucuses ───────────────────────────────────────────────────────────────────────────────

    private fun caucusSignupGate(caucusId: String, windowSecs: Int, chairUid: String): Pair<Long, Map<String, Any?>> {
        val signupEndsAt = System.currentTimeMillis() + windowSecs * 1000L
        return signupEndsAt to mapOf(
            "kind" to "signup", "signupFor" to "caucus", "signupId" to signupIdFor(caucusId), "endsAt" to signupEndsAt,
            "windowSecs" to windowSecs, "allowsPoints" to true, "openedBy" to chairUid, "openedAt" to ts,
        )
    }

    /** Open a moderated caucus AND its signup window (gate-era sessions only), in one write. */
    suspend fun startModCaucus(e: String, s: String, topic: String, totalSecs: Int, perSpeakerSecs: Int, signupWindowSecs: Int = SIGNUP_WINDOW_DEFAULT_SECS, chairUid: String = "") {
        val caucusId = newCaucusId()
        val (signupEndsAt, gate) = caucusSignupGate(caucusId, signupWindowSecs, chairUid)
        val caucus = mutableMapOf<String, Any?>(
            "caucusId" to caucusId, "kind" to "moderated", "topic" to topic, "totalDurationSecs" to totalSecs, "perSpeakerSecs" to perSpeakerSecs,
            "signupWindowSecs" to signupWindowSecs, "signupEndsAt" to signupEndsAt,
            "totalTimer" to newTimer(totalSecs * 1000L).toMap(), "speakerTimer" to newTimer(perSpeakerSecs * 1000L).toMap(),
            "currentSpeaker" to null, "queue" to emptyList<Any>(),
        )
        val ref = sessionRef(e, s)
        db.runTransaction { tx ->
            val snap = tx.get(ref)
            if (!snap.exists()) return@runTransaction
            val gateEra = snap.get("floorGate") != null
            val update = mutableMapOf<String, Any?>(
                "caucus" to if (gateEra) caucus + ("listState" to "collecting") else caucus,
                "phase" to Phase.MOD_CAUCUS,
                "live.stage" to emptyList<String>(), "live.updatedAt" to ts, "updatedAt" to ts,
            )
            if (gateEra) update["floorGate"] = gate
            tx.update(ref, update)
        }.await()
    }

    /** Unmoderated caucus. Nothing is credited for its duration (no speaker is ever seated). */
    suspend fun startUnmodCaucus(e: String, s: String, totalSecs: Int) {
        val caucus = mapOf(
            "caucusId" to newCaucusId(), "kind" to "unmoderated", "topic" to "", "totalDurationSecs" to totalSecs, "perSpeakerSecs" to 0,
            "totalTimer" to newTimer(totalSecs * 1000L).toMap(), "speakerTimer" to newTimer(0).toMap(),
        )
        patch(e, s, mapOf("caucus" to caucus, "phase" to Phase.UNMOD_CAUCUS, "live.stage" to emptyList<String>(), "live.updatedAt" to ts))
    }

    /** Extend the running caucus by `extraSecs`. Transactional. */
    suspend fun extendCaucus(e: String, s: String, extraSecs: Int) {
        val ref = sessionRef(e, s)
        val add = maxOf(0, extraSecs) * 1000L
        db.runTransaction { tx ->
            val snap = tx.get(ref)
            if (!snap.exists()) return@runTransaction
            val sess = snap.decode<LiveSession>() ?: return@runTransaction
            val c = sess.caucus ?: return@runTransaction
            val t = c.totalTimer
            val update = mutableMapOf<String, Any?>(
                "caucus.totalDurationSecs" to (c.totalDurationSecs ?: 0) + maxOf(0, extraSecs),
                "caucus.totalTimer.durationMs" to (t?.durationMs ?: 0) + add,
                "caucus.totalTimer.updatedAt" to ts,
                "updatedAt" to ts,
            )
            if (t != null && t.running && t.endsAt != null) update["caucus.totalTimer.endsAt"] = t.endsAt + add
            else update["caucus.totalTimer.pausedRemainingMs"] = (t?.pausedRemainingMs ?: 0) + add
            tx.update(ref, update)
        }.await()
    }

    /** The chair commits the collected caucus speakers list (THE one write that ends collecting). */
    suspend fun seatCaucusList(e: String, s: String, caucusId: String, slots: List<SpeakerSlot>, chairUid: String, signups: List<FloorRequest> = emptyList()): Boolean {
        val ref = sessionRef(e, s)
        val ok = db.runTransaction { tx ->
            val snap = tx.get(ref)
            if (!snap.exists()) return@runTransaction false
            val sess = snap.decode<LiveSession>() ?: return@runTransaction false
            val c = sess.caucus
            if (c == null || c.kind != "moderated") return@runTransaction false
            if (c.caucusId != caucusId) return@runTransaction false
            if (caucusListState(c) != "collecting") return@runTransaction false
            val holder = c.currentSpeaker?.delegateId
            val queue = slots.filter { it.delegateId != holder }
            val update = mutableMapOf<String, Any?>("caucus.queue" to queue.map { it.toMap() }, "caucus.listState" to "seated", "updatedAt" to ts)
            if (sess.floorGate != null) {
                update["floorGate"] = mapOf("kind" to if (queue.isNotEmpty()) "debate" else "locked", "allowsPoints" to true, "endsAt" to null, "openedBy" to chairUid, "openedAt" to ts)
            }
            tx.update(ref, update)
            true
        }.await()
        if (ok && signups.isNotEmpty()) {
            val seated = slots.map { it.delegateId }.toSet()
            runCatching {
                signups.filter { it.status == "pending" && it.caucusId == caucusId }
                    .forEach { resolveHand(e, s, it, if (it.delegateId in seated) "granted" else "dismissed", chairUid) }
            }
        }
        return ok
    }

    /** The chair commits the collected GSL list; closes the signup gate; optionally starts the first speaker. */
    suspend fun seatGslList(e: String, s: String, slots: List<SpeakerSlot>, chairUid: String, signups: List<FloorRequest> = emptyList(), autoStart: Boolean = true): Boolean {
        val ref = sessionRef(e, s)
        var startSlot: SpeakerSlot? = null
        val ok = db.runTransaction { tx ->
            val snap = tx.get(ref)
            if (!snap.exists()) return@runTransaction false
            val sess = snap.decode<LiveSession>() ?: return@runTransaction false
            val active = sess.gsl?.activeSpeaker
            val clean = (if (active != null) slots.filter { it.delegateId != active.delegateId } else slots).toMutableList()
            var nextActive = active
            var nextStage: List<String> = sess.live?.stage.orEmpty()
            var nextTimer = sess.gsl?.timer ?: newTimer(90_000)
            var nextSpoken = sess.gsl?.spoken ?: 0
            if (autoStart && active == null && clean.isNotEmpty()) {
                startSlot = clean.removeAt(0)
                nextActive = startSlot
                nextTimer = newTimer((sess.gsl?.defaultSpeakerSecs ?: 90) * 1000L)
                nextSpoken += 1
                nextStage = listOf(startSlot!!.delegateId)
            }
            val g = sess.floorGate
            val update = mutableMapOf<String, Any?>(
                "gsl.queue" to clean.map { it.toMap() },
                "gsl.activeSpeaker" to nextActive?.toMap(),
                "gsl.timer" to nextTimer.toMap(),
                "gsl.spoken" to nextSpoken,
                "live.stage" to nextStage,
                "live.updatedAt" to ts,
                "phase" to Phase.GSL,
                "updatedAt" to ts,
            )
            if (g != null && g.kind == "signup") {
                update["floorGate"] = mapOf("kind" to if (nextActive != null || clean.isNotEmpty()) "debate" else "locked", "allowsPoints" to true, "endsAt" to null, "openedBy" to chairUid, "openedAt" to ts)
            }
            tx.update(ref, update)
            true
        }.await()
        if (ok && signups.isNotEmpty()) {
            val seatedIds = slots.map { it.delegateId }.toMutableSet().also { set -> startSlot?.let { set += it.delegateId } }
            runCatching {
                signups.filter { it.status == "pending" && it.kind == "speak" }
                    .forEach { resolveHand(e, s, it, if (it.delegateId in seatedIds) "granted" else "dismissed", chairUid) }
            }
        }
        return ok
    }

    /** Advance the moderated caucus: pop queue head → currentSpeaker, reset the SPEAKER timer. */
    suspend fun nextCaucusSpeaker(e: String, s: String) {
        val ref = sessionRef(e, s)
        var credit: Pair<LiveSession, FinishedSpeech?>? = null
        db.runTransaction { tx ->
            val snap = tx.get(ref)
            if (!snap.exists()) return@runTransaction
            val sess = snap.decode<LiveSession>() ?: return@runTransaction
            val c = sess.caucus ?: return@runTransaction
            if (c.kind != "moderated") return@runTransaction
            credit = sess to finishingSpeech(sess, "caucus")
            val queue = c.queue.orEmpty().toMutableList()
            val next = queue.removeFirstOrNull()
            tx.update(ref, mapOf(
                "caucus.queue" to queue.map { it.toMap() },
                "caucus.currentSpeaker" to next?.toMap(),
                "caucus.currentCountry" to (next?.country ?: ""),
                "caucus.speakerTimer" to newTimer((c.perSpeakerSecs ?: 0) * 1000L).toMap(),
                "live.stage" to (if (next != null) listOf(next.delegateId) else emptyList()),
                "live.updatedAt" to ts,
                "updatedAt" to ts,
            ))
        }.await()
        credit?.let { (sess, fin) -> creditFinishedSpeech(e, s, sess, fin) }
    }

    /** End the caucus. Transactional, so whoever held the caucus floor is credited. */
    suspend fun endCaucus(e: String, s: String) {
        val ref = sessionRef(e, s)
        var credit: Pair<LiveSession, FinishedSpeech?>? = null
        db.runTransaction { tx ->
            val snap = tx.get(ref)
            if (!snap.exists()) return@runTransaction
            val sess = snap.decode<LiveSession>() ?: return@runTransaction
            credit = sess to finishingSpeech(sess, "caucus")
            tx.update(ref, mapOf("caucus" to null, "phase" to Phase.GSL, "live.stage" to emptyList<String>(), "live.updatedAt" to ts, "updatedAt" to ts))
        }.await()
        credit?.let { (sess, fin) -> creditFinishedSpeech(e, s, sess, fin) }
    }

    /** Append speaker(s) to the end of a speakers list (dedup against queue and floor holder). */
    /** setGslQueue / setCaucusQueue: the whole list, in order (remove and reorder). */
    suspend fun setQueue(e: String, s: String, list: String, queue: List<SpeakerSlot>) =
        patch(e, s, mapOf((if (list == "caucus") "caucus.queue" else "gsl.queue") to queue.map { it.toMap() }))

    suspend fun enqueueSpeaker(e: String, s: String, slots: List<SpeakerSlot>, list: String) {
        if (slots.isEmpty()) return
        val ref = sessionRef(e, s)
        db.runTransaction { tx ->
            val snap = tx.get(ref)
            if (!snap.exists()) return@runTransaction
            val sess = snap.decode<LiveSession>() ?: return@runTransaction
            if (list == "caucus" && (sess.caucus == null || sess.caucus.kind != "moderated")) return@runTransaction
            val queue = (if (list == "caucus") sess.caucus?.queue.orEmpty() else sess.gsl?.queue.orEmpty()).toMutableList()
            val holder = if (list == "caucus") sess.caucus?.currentSpeaker?.delegateId else sess.gsl?.activeSpeaker?.delegateId
            for (slot in slots) {
                val dup = queue.any { it.delegateId == slot.delegateId } || holder == slot.delegateId
                if (!dup) queue += slot
            }
            tx.update(ref, mapOf((if (list == "caucus") "caucus.queue" else "gsl.queue") to queue.map { it.toMap() }, "updatedAt" to ts))
        }.await()
    }

    // ── Voting ─────────────────────────────────────────────────────────────────────────────────

    data class OpenVoteConfig(
        val motion: String,
        val motionId: String? = null,
        val voteType: String,
        val threshold: String,
        val scMode: Boolean = false,
        val p5: List<String> = emptyList(),
        val mode: String,
        val round: Int = 1,
        val divisionOfQuestion: Boolean = false,
        val minAffirmative: Int? = null,
        val durationSecs: Int = VOTE_DEFAULT_SECS,
    )

    class VoteAlreadyOpen : Exception("A vote is already open.")

    /** Open a vote. Transactional; seeded RUNNING; eligibleCount snapshotted from attendance. */
    suspend fun openVote(e: String, s: String, cfg: OpenVoteConfig, startedBy: String) {
        val ref = sessionRef(e, s)
        db.runTransaction { tx ->
            val snap = tx.get(ref)
            if (!snap.exists()) return@runTransaction
            val sess = snap.decode<LiveSession>() ?: return@runTransaction
            if (sess.activeVote != null) throw VoteAlreadyOpen()
            val durMs = maxOf(0, cfg.durationSecs) * 1000L
            val vote = buildMap<String, Any?> {
                put("voteId", UUID.randomUUID().toString())
                put("motion", cfg.motion)
                if (cfg.motionId != null) put("motionId", cfg.motionId)
                put("voteType", cfg.voteType)
                put("threshold", cfg.threshold)
                if (cfg.minAffirmative != null) put("minAffirmative", cfg.minAffirmative)
                put("scMode", cfg.scMode)
                put("p5", cfg.p5)
                put("allowAbstain", true)
                if (durMs > 0) put("timer", mapOf("running" to true, "endsAt" to System.currentTimeMillis() + durMs, "pausedRemainingMs" to null, "durationMs" to durMs, "updatedAt" to ts))
                put("round", cfg.round)
                put("divisionOfQuestion", cfg.divisionOfQuestion)
                put("mode", cfg.mode)
                if (cfg.mode == "tally") put("tally", mapOf("yes" to 0, "no" to 0, "abstain" to 0))
                if (cfg.mode == "roll_call") put("ballots", emptyMap<String, String>())
                put("eligibleCount", eligibleVoterCount(sess.attendance))
                put("startedBy", startedBy)
                put("startedAt", ts)
            }
            tx.update(ref, mapOf(
                "activeVote" to vote, "phase" to Phase.VOTING, "publishedResult" to null, "pendingPublish" to null,
                "live.stage" to emptyList<String>(), "live.updatedAt" to ts, "updatedAt" to ts,
            ))
        }.await()
    }

    /** castBallotAsProxy: the ballot plus who cast it (a vice-chair with delegate power). */
    suspend fun castBallotAsProxy(e: String, s: String, delegateId: String, ballot: String, proxy: ProxyAttribution) = patch(e, s, mapOf(
        "activeVote.ballots.$delegateId" to ballot,
        "activeVote.ballotProxies.$delegateId" to mapOf("by" to proxy.by, "byName" to proxy.byName),
    ))

    suspend fun castBallot(e: String, s: String, delegateId: String, ballot: String) = patch(e, s, mapOf("activeVote.ballots.$delegateId" to ballot))

    suspend fun bumpTally(e: String, s: String, key: String, delta: Long) = patch(e, s, mapOf("activeVote.tally.$key" to FieldValue.increment(delta)))

    /** Close the active vote atomically (guarded on voteId; deterministic ids). null = already closed. */
    suspend fun closeVoteAtomic(e: String, s: String, expectedVoteId: String): ActiveVote? {
        val ref = sessionRef(e, s)
        return db.runTransaction { tx ->
            val snap = tx.get(ref)
            if (!snap.exists()) return@runTransaction null
            val sess = snap.decode<LiveSession>() ?: return@runTransaction null
            val vote = sess.activeVote
            if (vote == null || vote.voteId != expectedVoteId) return@runTransaction null
            val res = computeVoteResult(vote)
            @Suppress("UNCHECKED_CAST") val rawVote = (snap.get("activeVote") as? Map<String, Any?>).orEmpty()
            val finished = rawVote + mapOf(
                "result" to res.result, "affirmative" to res.affirmative, "negative" to res.negative,
                "abstentions" to res.abstentions, "vetoedBy" to res.vetoedBy, "closedAt" to ts,
            )
            tx.set(votesCol(e, s).document(vote.voteId), finished)
            tx.set(motionsCol(e, s).document("vote_${vote.voteId}"), mapOf(
                "kind" to "motion",
                "label" to "Vote — ${vote.motion}: ${res.result.uppercase()} (${res.affirmative}-${res.negative}-${res.abstentions})",
                "byDelegateId" to vote.startedBy, "byCountry" to "",
                "outcome" to if (res.result == "passed") "passed" else "failed",
                "at" to ts,
            ))
            val pending = mapOf(
                "voteId" to vote.voteId, "motion" to vote.motion, "result" to res.result,
                "affirmative" to res.affirmative, "negative" to res.negative, "abstentions" to res.abstentions,
                "vetoedBy" to res.vetoedBy, "vetoedByCountries" to res.vetoedBy.mapNotNull { sess.attendance[it]?.country?.ifEmpty { null } },
                "eligibleCount" to (vote.eligibleCount ?: 0), "voteType" to vote.voteType, "threshold" to vote.threshold,
                "scMode" to vote.scMode, "mode" to vote.mode, "closedAt" to ts,
            )
            tx.update(ref, mapOf("activeVote" to null, "phase" to Phase.GSL, "pendingPublish" to pending, "updatedAt" to ts))
            vote
        }.await()
    }

    /** THE single close path — closeVoteAtomic + participation credit + motion reconciliation. */
    suspend fun finalizeVote(e: String, s: String, voteId: String, identityFor: (String) -> ParticipationIdentity): ActiveVote? {
        val finished = closeVoteAtomic(e, s, voteId) ?: return null
        val result = computeVoteResult(finished).result
        val voters: List<String> = if (finished.mode == "roll_call") finished.ballots.orEmpty().keys.toList() else runCatching {
            sessionRef(e, s).get().await().decode<LiveSession>()?.attendance.orEmpty().values
                .filter { it.delegateId.isNotEmpty() && (it.status == "present" || it.status == "present_and_voting") }
                .map { it.delegateId }
        }.getOrDefault(emptyList())
        for (id in voters) runCatching { bumpParticipation(e, s, identityFor(id), mapOf("votesCast" to 1L)) }
        if (!finished.motionId.isNullOrEmpty()) resolveMotionAfterVote(e, s, finished.motionId, result, finished.startedBy)
        return finished
    }

    /** Reveal the closed vote's result on every screen. */
    suspend fun publishVoteResult(e: String, s: String, chairUid: String) {
        val ref = sessionRef(e, s)
        val snap = ref.get().await()
        @Suppress("UNCHECKED_CAST") val p = snap.get("pendingPublish") as? Map<String, Any?> ?: return
        ref.update(mapOf("publishedResult" to p + mapOf("publishedAt" to ts, "publishedBy" to chairUid), "pendingPublish" to null, "updatedAt" to ts)).await()
        runCatching {
            votesCol(e, s).document(p["voteId"] as String).update(mapOf("published" to true, "publishedAt" to ts, "publishedBy" to chairUid)).await()
        }
    }

    suspend fun discardPendingPublish(e: String, s: String) = patch(e, s, mapOf("pendingPublish" to null))

    /** Reopen ONE ballot (delete the key) so the delegate re-casts from their own console. */
    suspend fun reopenBallot(e: String, s: String, delegateId: String, expectedVoteId: String, chairUid: String, requestId: String?): Boolean {
        val ref = sessionRef(e, s)
        return db.runTransaction { tx ->
            val snap = tx.get(ref)
            if (!snap.exists()) return@runTransaction false
            val v = snap.decode<LiveSession>()?.activeVote ?: return@runTransaction false
            if (v.voteId != expectedVoteId || v.mode != "roll_call") return@runTransaction false
            val prev = v.ballots?.get(delegateId) ?: return@runTransaction false
            val entry = buildMap<String, Any> {
                put("delegateId", delegateId); put("from", prev); put("at", System.currentTimeMillis()); put("by", chairUid)
                if (v.ballotProxies?.get(delegateId) != null) put("wasProxy", true)
                if (requestId != null) put("requestId", requestId)
            }
            @Suppress("UNCHECKED_CAST") val changes = ((snap.get("activeVote.ballotChanges") as? List<Any?>) ?: emptyList())
            tx.update(ref, mapOf(
                "activeVote.ballots.$delegateId" to FieldValue.delete(),
                "activeVote.ballotProxies.$delegateId" to FieldValue.delete(),
                "activeVote.ballotChanges" to changes + entry,
                "updatedAt" to ts,
            ))
            true
        }.await()
    }

    /** Extend (or trim) the running vote clock, bumping durationMs with the deadline. */
    suspend fun extendVoteTimer(e: String, s: String, extraMs: Long) {
        val ref = sessionRef(e, s)
        db.runTransaction { tx ->
            val snap = tx.get(ref)
            if (!snap.exists()) return@runTransaction
            val t = snap.decode<LiveSession>()?.activeVote?.timer ?: return@runTransaction
            val update = mutableMapOf<String, Any?>(
                "activeVote.timer.durationMs" to maxOf(0, (t.durationMs ?: 0) + extraMs),
                "activeVote.timer.updatedAt" to ts, "updatedAt" to ts,
            )
            if (t.running && t.endsAt != null) update["activeVote.timer.endsAt"] = maxOf(System.currentTimeMillis(), t.endsAt + extraMs)
            else update["activeVote.timer.pausedRemainingMs"] = maxOf(0, (t.pausedRemainingMs ?: 0) + extraMs)
            tx.update(ref, update)
        }.await()
    }

    // ── Points & motion log ────────────────────────────────────────────────────────────────────

    /** Append to the motion log; with an identity, mirror onto the in-doc tally and participation. */
    suspend fun logMotion(e: String, s: String, entry: Map<String, Any?>, identity: ParticipationIdentity?) {
        motionsCol(e, s).document().set(entry + ("at" to ts)).await()
        if (identity != null && identity.delegateId.isNotEmpty()) {
            val counter = if (entry["kind"] == "point") "points" else "motions"
            patch(e, s, mapOf("pointsMotions.byDelegate.${identity.delegateId}.$counter" to FieldValue.increment(1)))
            bumpParticipation(e, s, identity, mapOf(counter to 1L))
        }
    }

    /** Delegate raises a point (pending). Credits pointsRaised, best-effort. */
    suspend fun raisePoint(e: String, s: String, identity: ParticipationIdentity, type: String, note: String = "", targetCountry: String = "", proxy: ProxyAttribution? = null) {
        pointsCol(e, s).add(mapOf(
            "delegateId" to identity.delegateId, "country" to identity.country, "applicationId" to identity.applicationId,
            "type" to type, "note" to note, "targetCountry" to targetCountry, "status" to "pending",
        ) + proxyFields(proxy) + ("createdAt" to ts)).await()
        runCatching { bumpParticipation(e, s, identity, mapOf("pointsRaised" to 1L)) }
    }

    suspend fun cancelPoint(e: String, s: String, pointId: String) {
        pointsCol(e, s).document(pointId).delete().await()
    }

    /** Chair resolves a point; on "recognized" credit `points`, mirror the tally, log it. */
    suspend fun resolvePoint(e: String, s: String, point: RaisedPoint, status: String, chairUid: String, identity: ParticipationIdentity? = null, chairNote: String = "") {
        if (point.id.isEmpty()) return
        pointsCol(e, s).document(point.id).update(mapOf("status" to status, "chairNote" to chairNote, "resolvedAt" to ts, "resolvedBy" to chairUid)).await()
        if (status == "recognized") {
            patch(e, s, mapOf("pointsMotions.byDelegate.${point.delegateId}.points" to FieldValue.increment(1)))
            if (identity != null && identity.delegateId.isNotEmpty()) bumpParticipation(e, s, identity, mapOf("points" to 1L))
            motionsCol(e, s).document().set(mapOf(
                "kind" to "point", "pointType" to point.type,
                "label" to "${POINT_META[point.type]?.label ?: point.type}${if (point.country.isNotEmpty()) " — ${point.country}" else ""}",
                "byDelegateId" to point.delegateId, "byCountry" to point.country, "targetCountry" to point.targetCountry.orEmpty(),
                "outcome" to "ruled", "at" to ts,
            )).await()
        }
    }

    // ── Floor requests ─────────────────────────────────────────────────────────────────────────

    private fun requestBase(identity: ParticipationIdentity, kind: String) = mapOf(
        "delegateId" to identity.delegateId, "country" to identity.country, "applicationId" to identity.applicationId, "kind" to kind,
    )

    /** Delegate raises a hand for recognition ("floor" | "speak" | …). */
    suspend fun raiseHand(e: String, s: String, identity: ParticipationIdentity, kind: String, note: String = "", proxy: ProxyAttribution? = null) {
        requestsCol(e, s).add(requestBase(identity, kind) + mapOf("note" to note, "status" to "pending") + proxyFields(proxy) + ("createdAt" to ts)).await()
    }

    /** Delegate asks the chair to reopen their ballot — bound to THIS vote. */
    suspend fun requestVoteChange(e: String, s: String, identity: ParticipationIdentity, voteId: String, note: String = "", proxy: ProxyAttribution? = null) {
        requestsCol(e, s).add(requestBase(identity, "vote_change") + mapOf("voteId" to voteId, "note" to note, "status" to "pending") + proxyFields(proxy) + ("createdAt" to ts)).await()
    }

    /** Delegate answers the moderated-caucus speakers prompt. A "no" is recorded too. */
    suspend fun answerCaucusSignup(e: String, s: String, identity: ParticipationIdentity, caucusId: String, answer: String, proxy: ProxyAttribution? = null, signupId: String? = null) {
        requestsCol(e, s).add(
            requestBase(identity, "caucus_signup") + buildMap<String, Any> {
                put("caucusId", caucusId)
                if (!signupId.isNullOrEmpty()) put("signupId", signupId)
                put("answer", answer); put("note", ""); put("status", "pending")
            } + proxyFields(proxy) + ("createdAt" to ts),
        ).await()
    }

    /**
     * Delegate adds themselves to whichever speakers list is open — ONE GESTURE, TWO SHAPES:
     * gsl → {kind:"speak", signupId}; caucus → {kind:"caucus_signup", caucusId, signupId, answer:"yes"}.
     */
    suspend fun joinSignup(e: String, s: String, identity: ParticipationIdentity, gate: FloorGate?, caucusId: String?, proxy: ProxyAttribution? = null) {
        val signupId = gate?.signupId.orEmpty()
        if (gate?.signupFor == "caucus" && !caucusId.isNullOrEmpty()) {
            return answerCaucusSignup(e, s, identity, caucusId, "yes", proxy, signupId)
        }
        requestsCol(e, s).add(requestBase(identity, "speak") + mapOf("signupId" to signupId, "note" to "", "status" to "pending") + proxyFields(proxy) + ("createdAt" to ts)).await()
    }

    /** The speaker asks to hand their remaining time to another delegation (chair consents). */
    suspend fun requestYield(e: String, s: String, identity: ParticipationIdentity, targetCountry: String, targetDelegateId: String, targetApplicationId: String, remainingMs: Long, proxy: ProxyAttribution? = null) {
        requestsCol(e, s).add(requestBase(identity, "yield") + mapOf(
            "yieldTargetCountry" to targetCountry, "yieldTargetDelegateId" to targetDelegateId,
            "yieldTargetApplicationId" to targetApplicationId, "yieldRemainingMs" to maxOf(0, remainingMs),
            "note" to "", "status" to "pending",
        ) + proxyFields(proxy) + ("createdAt" to ts)).await()
    }

    /** The speaker yields to questions / comments / back to the chair — two field paths, own slot only. */
    suspend fun declareOwnYield(e: String, s: String, session: LiveSession, yieldTo: String, proxy: ProxyAttribution? = null) {
        val p = speakerSlotPath(session)
        val data = mutableMapOf<String, Any?>("$p.yieldTo" to yieldTo, "$p.yieldTargetCountry" to "")
        if (proxy != null && proxy.by.isNotEmpty()) { data["$p.yieldProxyBy"] = proxy.by; data["$p.yieldProxyByName"] = proxy.byName }
        patch(e, s, data)
    }

    /** Delegate declares their OWN attendance during roll call — a single field path. */
    suspend fun declareOwnAttendance(e: String, s: String, identity: ParticipationIdentity, status: String) {
        patch(e, s, mapOf("attendance.${identity.delegateId}" to mapOf(
            "status" to status, "country" to identity.country, "delegateId" to identity.delegateId, "applicationId" to identity.applicationId,
        )))
    }

    suspend fun cancelHand(e: String, s: String, reqId: String) {
        requestsCol(e, s).document(reqId).delete().await()
    }

    /** Chair marks a request granted/dismissed. A request already withdrawn is not an error. */
    suspend fun resolveHand(e: String, s: String, req: FloorRequest, status: String, chairUid: String) {
        if (req.id.isEmpty()) return
        try {
            requestsCol(e, s).document(req.id).update(mapOf("status" to status, "resolvedAt" to ts, "resolvedBy" to chairUid)).await()
        } catch (ex: FirebaseFirestoreException) {
            if (ex.code != FirebaseFirestoreException.Code.NOT_FOUND) throw ex
        }
    }

    // ── Granting a request (floorRequests.ts) ──────────────────────────────────────────────────

    /** "granted" | "dismissed" | "unsupported" — the one dispatch web and phone both call. */
    suspend fun grantFloorRequest(e: String, s: String, session: LiveSession, r: FloorRequest, chairUid: String): String {
        when (r.kind) {
            "floor" -> setStage(e, s, listOf(r.delegateId))
            "vote_change" -> {
                val vote = session.activeVote
                if (vote == null || vote.voteId != r.voteId) { resolveHand(e, s, r, "dismissed", chairUid); return "dismissed" }
                if (!reopenBallot(e, s, r.delegateId, vote.voteId, chairUid, r.id.ifEmpty { null })) { resolveHand(e, s, r, "dismissed", chairUid); return "dismissed" }
                // A reopened ballot with no time to cast it is worthless: extend for the whole room.
                if (vote.timer?.running == true && timerRemainingMs(vote.timer) < REVOTE_GRACE_MS) extendVoteTimer(e, s, REVOTE_EXTEND_MS)
            }
            "speak" -> {
                val gate = session.floorGate
                val forCaucus = !r.signupId.isNullOrEmpty() && r.signupId == gate?.signupId && gate?.signupFor == "caucus"
                enqueueSpeaker(e, s, listOf(slotOfSignup(r)), if (forCaucus) "caucus" else "gsl")
            }
            "yield" -> return if (acceptYieldRequest(e, s, session, r, chairUid).ok) "granted" else "dismissed"
            else -> return "unsupported"
        }
        resolveHand(e, s, r, "granted", chairUid)
        return "granted"
    }

    // ── Motions ────────────────────────────────────────────────────────────────────────────────

    /** Delegate proposes a motion — one live motion of a type per delegation (DuplicateMotionError). */
    suspend fun proposeMotion(e: String, s: String, identity: ParticipationIdentity, type: String, params: MotionParams, note: String = "", proxy: ProxyAttribution? = null) {
        val mine = motionQueueCol(e, s).whereEqualTo("byDelegateId", identity.delegateId).get().await().documents.mapNotNull { it.decode<Motion>() }
        myLiveMotion(mine, type)?.let { throw DuplicateMotionError(it) }
        val p = buildMap<String, Any> {
            params.topic?.let { put("topic", it) }
            params.totalDurationSecs?.let { put("totalDurationSecs", it) }
            params.perSpeakerSecs?.let { put("perSpeakerSecs", it) }
            params.documentId?.let { put("documentId", it) }
            params.targetPhase?.let { put("targetPhase", it) }
        }
        motionQueueCol(e, s).add(mapOf(
            "type" to type, "params" to p, "byDelegateId" to identity.delegateId, "byCountry" to identity.country,
            "applicationId" to identity.applicationId, "status" to "pending", "note" to note,
        ) + proxyFields(proxy) + ("createdAt" to ts)).await()
        runCatching { bumpParticipation(e, s, identity, mapOf("motionsProposed" to 1L)) }
    }

    suspend fun cancelMotion(e: String, s: String, motionId: String) {
        motionQueueCol(e, s).document(motionId).delete().await()
    }

    suspend fun recognizeMotion(e: String, s: String, motion: Motion, chairUid: String) {
        if (motion.id.isEmpty()) return
        motionQueueCol(e, s).document(motion.id).update(mapOf("status" to "recognized", "recognizedAt" to ts, "resolvedBy" to chairUid)).await()
    }

    /** Dismiss without executing — auditable; never credits participation. */
    suspend fun dismissMotion(e: String, s: String, motion: Motion, chairUid: String, chairNote: String = "") {
        if (motion.id.isEmpty()) return
        motionQueueCol(e, s).document(motion.id).update(mapOf(
            "status" to "dropped", "chairNote" to chairNote, "autoResolved" to false, "resolvedAt" to ts, "resolvedBy" to chairUid,
        )).await()
        runCatching {
            logMotion(e, s, mapOf(
                "kind" to "motion",
                "label" to "${motionMeta(motion.type).label} — DISMISSED${if (chairNote.isNotEmpty()) " ($chairNote)" else ""}",
                "byDelegateId" to motion.byDelegateId, "byCountry" to motion.byCountry, "outcome" to "failed",
            ), null)
        }
    }

    /** Put a motion to a procedural vote: open the vote FIRST, then flip the motion to "voting". */
    suspend fun putMotionToVote(e: String, s: String, motion: Motion, chairUid: String) {
        if (motion.id.isEmpty()) return
        openVote(e, s, OpenVoteConfig(
            motion = motionLabel(motion), motionId = motion.id, voteType = "procedural",
            threshold = if (motion.type == "move_to_voting") "two_thirds" else "simple_majority",
            scMode = false, p5 = emptyList(), mode = "roll_call",
        ), chairUid)
        motionQueueCol(e, s).document(motion.id).update(mapOf("status" to "voting", "resolvedBy" to chairUid)).await()
    }

    /**
     * Execute an adopted motion — THE CORE of motion-first. Three phases, in this order:
     * 1) the effect (throws propagate); 2) one batch: this → executed + everything it superseded;
     * 3) bookkeeping, best-effort.
     */
    suspend fun executeMotion(e: String, s: String, motion: Motion, chairUid: String, identity: ParticipationIdentity?, queue: List<Motion>) {
        if (motion.id.isEmpty()) return
        val p = motion.params
        when (motion.type) {
            "mod_caucus" -> startModCaucus(e, s, p.topic.orEmpty(), p.totalDurationSecs ?: 600, p.perSpeakerSecs ?: 45, SIGNUP_WINDOW_DEFAULT_SECS, chairUid)
            "unmod_caucus" -> startUnmodCaucus(e, s, p.totalDurationSecs ?: 600)
            "extend_caucus" -> extendCaucus(e, s, p.totalDurationSecs ?: 300)
            "open_gsl" -> {
                setPhase(e, s, Phase.GSL)
                p.perSpeakerSecs?.takeIf { it > 0 }?.let { setGslDefaultSecs(e, s, it) }
                val snap = sessionRef(e, s).get().await()
                if (snap.exists() && snap.get("floorGate") != null) {
                    val windowSecs = 60
                    openGate(e, s, chairUid, FloorGate(
                        kind = "signup", signupFor = "gsl", signupId = "sg_${java.lang.Long.toString(System.currentTimeMillis(), 36)}",
                        allowsPoints = true, endsAt = gateEndsAt(windowSecs), windowSecs = windowSecs,
                    ))
                }
            }
            "set_agenda" -> {
                // Agenda BEFORE phase (the reverse leaves a frame reading "nobody set the agenda").
                p.topic?.takeIf { it.isNotEmpty() }?.let { adoptAgendaTopic(e, s, it) }
                setPhase(e, s, Phase.GSL)
            }
            "move_to_voting" -> openVote(e, s, OpenVoteConfig(motion = p.topic?.ifEmpty { null } ?: "Draft resolution", voteType = "substantive", threshold = "two_thirds", mode = "roll_call"), chairUid)
            "adjourn" -> setPhase(e, s, Phase.CLOSED)
            "suspend" -> suspendSession(e, s)
            "introduce_document" -> p.documentId?.takeIf { it.isNotEmpty() }?.let { docId ->
                runCatching {
                    db.collection("events").document(e).collection("committeeDocs").document(docId)
                        .update(mapOf("status" to "approved", "reviewedBy" to chairUid, "updatedAt" to ts)).await()
                }
            }
            "custom" -> p.targetPhase?.takeIf { it.isNotEmpty() }?.let { setPhase(e, s, it) }
        }
        val batch = db.batch()
        batch.update(motionQueueCol(e, s).document(motion.id), mapOf("status" to "executed", "resolvedAt" to ts, "resolvedBy" to chairUid))
        for (fall in supersededByExecution(motion, queue)) {
            batch.update(motionQueueCol(e, s).document(fall.motion.id), mapOf(
                "status" to "dropped", "autoResolved" to true, "chairNote" to fall.ruling.reason, "resolvedAt" to ts, "resolvedBy" to chairUid,
            ))
        }
        batch.commit().await()
        runCatching {
            logMotion(e, s, mapOf("kind" to "motion", "label" to motionLabel(motion), "byDelegateId" to motion.byDelegateId, "byCountry" to motion.byCountry, "outcome" to "passed"), identity)
        }
    }

    /** After a vote closes, reconcile the motion it decided. Does NOT auto-execute. */
    private suspend fun resolveMotionAfterVote(e: String, s: String, motionId: String, result: String, chairUid: String) {
        val ref = motionQueueCol(e, s).document(motionId)
        val snap = ref.get().await()
        if (!snap.exists()) return
        val motion = snap.decode<Motion>() ?: return
        if (result == "passed") {
            ref.update(mapOf("status" to "passed", "resolvedAt" to ts, "resolvedBy" to chairUid)).await()
        } else {
            ref.update(mapOf("status" to "failed", "resolvedAt" to ts, "resolvedBy" to chairUid)).await()
            runCatching {
                logMotion(e, s, mapOf("kind" to "motion", "label" to "${motionMeta(motion.type).label} — ${result.uppercase()}", "byDelegateId" to motion.byDelegateId, "byCountry" to motion.byCountry, "outcome" to "failed"), null)
            }
        }
    }

    companion object {
        /** Under this much time left, granting a re-vote is useless unless the clock is extended too. */
        const val REVOTE_GRACE_MS = 20_000L
        const val REVOTE_EXTEND_MS = 30_000L
    }
}
