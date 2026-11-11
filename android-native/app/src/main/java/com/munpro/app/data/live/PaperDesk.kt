package com.munpro.app.data.live

// A delegate's papers in a sitting (ports of committeeDocService: createCommitteeDoc,
// subscribeMyCommitteeDocs, the endorsement handshake, and DelegateDocsTool's submit).
//
// Submitting with sponsors or signatories starts a 90-second consent window: the paper is created
// as "collecting-endorsements" with `endorsementEndsAt`, the site's /api/docs/endorsements fans the
// requests out (only the server can resolve a country to its delegate and notify them), and when
// the window closes or everyone has answered the author calls /finalize, which writes the
// confirmed lists and moves the paper to "submitted".

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.munpro.app.data.Api
import com.munpro.app.data.decode
import com.munpro.app.domain.CommitteeDoc
import com.munpro.app.domain.sameCommittee
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** committeeDocService.ENDORSEMENT_WINDOW_SECS */
const val ENDORSEMENT_WINDOW_SECS = 90

@Serializable
data class DocEndorsement(
    val id: String = "",
    /** "sponsor" | "signatory" */
    val role: String = "",
    val country: String = "",
    val targetUid: String = "",
    /** "pending" | "accepted" | "rejected" | "expired" */
    val status: String = "",
    val requestedByName: String = "",
    val requestedByCountry: String = "",
    val eventId: String = "",
    val docId: String = "",
    val docTitle: String = "",
    val docType: String = "",
    @Serializable(with = com.munpro.app.data.LenientMillis::class) val endsAt: Long? = null,
)

class PaperDesk {
    private val db = FirebaseFirestore.getInstance()
    private val ts get() = FieldValue.serverTimestamp()
    private fun docs(eventId: String) = db.collection("events").document(eventId).collection("committeeDocs")

    /** subscribeMyCommitteeDocs: my own papers, any status (matches the rule's submittedBy branch). */
    fun mine(eventId: String, uid: String, committee: String): Flow<List<CommitteeDoc>> = callbackFlow {
        val reg = docs(eventId).whereEqualTo("submittedBy", uid).addSnapshotListener { snap, err ->
            if (err != null || snap == null) { trySend(emptyList()); return@addSnapshotListener }
            trySend(snap.documents.mapNotNull { it.decode<CommitteeDoc>() }.filter { sameCommittee(it.committee, committee) }.sortedByDescending { it.createdAt ?: 0L })
        }
        awaitClose { reg.remove() }
    }

    /** subscribeMyPendingEndorsements: every consent request waiting on me. */
    fun myPendingEndorsements(uid: String): Flow<List<DocEndorsement>> = callbackFlow {
        val reg = db.collectionGroup("docEndorsements").whereEqualTo("targetUid", uid).whereEqualTo("status", "pending")
            .addSnapshotListener { snap, err ->
                if (err != null || snap == null) { trySend(emptyList()); return@addSnapshotListener }
                trySend(snap.documents.mapNotNull { it.decode<DocEndorsement>() }.sortedBy { it.endsAt ?: 0L })
            }
        awaitClose { reg.remove() }
    }

    /**
     * subscribeEndorsementsForDocs: the requests waiting on [targetUid] across these papers, read by
     * path. A proxy can't use [myPendingEndorsements]: the collection-group rule only lets a
     * delegate list rows addressed to themselves.
     */
    fun endorsementsForDocs(eventId: String, docIds: List<String>, targetUid: String): Flow<List<DocEndorsement>> = callbackFlow {
        val byDoc = mutableMapOf<String, List<DocEndorsement>>()
        fun emit() { trySend(byDoc.values.flatten().filter { it.targetUid == targetUid && it.status == "pending" }.sortedBy { it.endsAt ?: 0L }) }
        if (docIds.isEmpty() || targetUid.isEmpty()) emit()
        val regs = docIds.map { id ->
            docs(eventId).document(id).collection("docEndorsements").addSnapshotListener { snap, err ->
                byDoc[id] = if (err != null || snap == null) emptyList() else snap.documents.mapNotNull { it.decode<DocEndorsement>() }
                emit()
            }
        }
        awaitClose { regs.forEach { it.remove() } }
    }

    /** subscribeDocEndorsements: the author's view of the answers coming in. */
    fun endorsements(eventId: String, docId: String): Flow<List<DocEndorsement>> = callbackFlow {
        val reg = docs(eventId).document(docId).collection("docEndorsements").addSnapshotListener { snap, err ->
            if (err != null || snap == null) { trySend(emptyList()); return@addSnapshotListener }
            trySend(snap.documents.mapNotNull { it.decode<DocEndorsement>() })
        }
        awaitClose { reg.remove() }
    }

    /**
     * respondEndorsement: exactly the keys the rule allows (status, respondedAt), plus the proxy
     * stamp when a vice-chair answers for the delegation (the rule's dais branch needs it in the
     * SAME write).
     */
    suspend fun respond(e: DocEndorsement, accept: Boolean, proxy: ProxyAttribution? = null) {
        docs(e.eventId).document(e.docId).collection("docEndorsements").document(e.id)
            .update(mapOf("status" to if (accept) "accepted" else "rejected", "respondedAt" to ts) +
                (if (proxy != null) mapOf("proxyBy" to proxy.by, "proxyByName" to proxy.byName) else emptyMap())).await()
    }

    /**
     * DelegateDocsTool.submit, the delegate path. Returns the new paper's id. The confirmed
     * sponsors start as our own delegation only; accepters are added on finalize.
     */
    suspend fun submit(
        eventId: String, committee: String, sessionId: String, dateStr: String,
        uid: String, name: String, myCountry: String,
        type: String, title: String, content: String,
        sponsors: List<String>, signatories: List<String>,
        /** A vice-chair writing for the delegation: `uid` stays the delegation, the stamp names the writer. */
        proxy: ProxyAttribution? = null,
    ): String {
        val rows = sponsors.map { "sponsor" to it } + signatories.map { "signatory" to it }
        val collecting = rows.isNotEmpty()
        val endsAt = System.currentTimeMillis() + ENDORSEMENT_WINDOW_SECS * 1000L
        val data = buildMap<String, Any?> {
            put("type", type); put("committee", committee); put("title", title.trim()); put("content", content)
            put("format", "markdown")
            put("sponsors", if (myCountry.isNotEmpty()) listOf(myCountry) else emptyList<String>()); put("signatories", emptyList<String>())
            // Outside a sitting (the Documents hub) there is no session, as on the web's hub.
            if (sessionId.isNotEmpty()) { put("sessionId", sessionId); put("dateStr", dateStr) }
            put("submittedBy", uid); put("submittedByName", name)
            if (proxy != null) { put("proxyBy", proxy.by); put("proxyByName", proxy.byName) }
            if (myCountry.isNotEmpty()) put("submittedCountry", myCountry)
            put("status", if (collecting) "collecting-endorsements" else "submitted")
            if (collecting) put("endorsementEndsAt", endsAt)
            put("createdAt", ts); put("updatedAt", ts)
        }
        val id = docs(eventId).add(data).await().id
        // Best-effort chair email (notifyChairsCommitteeDoc).
        Api.call("/api/notify/committee-doc", "POST", buildJsonObject {
            put("eventId", eventId); put("committee", committee); put("docType", com.munpro.app.domain.committeeDocTypeLabel(type))
            put("title", title.trim()); put("delegateName", if (myCountry.isNotEmpty()) "$name (${com.munpro.app.domain.countryName(myCountry)})" else name)
        }.toString())
        if (collecting) {
            val body = buildJsonObject {
                put("eventId", eventId); put("docId", id); if (sessionId.isNotEmpty()) put("sessionId", sessionId); put("endsAt", endsAt)
                put("rows", JsonArray(rows.map { (role, country) -> buildJsonObject { put("role", role); put("country", country) } }))
            }
            val fan = Api.call("/api/docs/endorsements", "POST", body.toString())
            // Nobody resolvable: don't leave the paper hanging the whole window.
            val created = (fan as? kotlinx.serialization.json.JsonObject)?.get("created")?.toString()?.toIntOrNull()
            if (created == 0) finalize(eventId, id)
        }
        return id
    }

    /** finalizeDocEndorsements (server, idempotent): confirmed lists, leftovers expired, status → submitted. */
    suspend fun finalize(eventId: String, docId: String): Boolean =
        Api.call("/api/docs/endorsements/finalize", "POST", buildJsonObject { put("eventId", eventId); put("docId", docId) }.toString()) != null
}
