package com.munpro.app.data.live

// The chair's daily marks on a phone (ports of markingService.subscribeDailyMarkings,
// setCriterionScore / setScoreEntries via writeCriterion, appendScoreEntry, setDailyFeedback,
// and sessionService.finalizeSession). Same doc id, markings/{committeeId}_{delegateId}_{dateStr},
// and the same write discipline: an existing doc is only ever UPDATED by field path, so a mark
// never clobbers the rest of the scores map or the chair's feedback; only a brand-new doc is
// SET, with nested maps. (A dotted key in a set is a literal field name, the web bug fixed on
// 2026-10-25.)

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import com.munpro.app.data.decode
import com.munpro.app.domain.DailyMarking
import com.munpro.app.domain.clampMark
import com.munpro.app.domain.markScale
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/** markingService.DailyMarkingBase */
data class MarkingBase(
    val eventId: String, val committeeId: String, val delegateId: String, val applicationId: String,
    val dateStr: String, val gradedBy: String, val markMode: String?,
) {
    val docId: String get() = "${committeeId}_${delegateId}_$dateStr"
    fun fields(): Map<String, Any?> = buildMap {
        put("eventId", eventId); put("committeeId", committeeId); put("delegateId", delegateId)
        put("applicationId", applicationId); put("dateStr", dateStr); put("gradedBy", gradedBy)
        markMode?.let { put("markMode", it) }
    }
}

/** sessionService.FinalizeRow */
data class FinalizeRow(val delegateId: String, val applicationId: String, val scores: Map<String, Double>, val feedback: String, val attendanceStatus: String?)

class MarkingRepo {
    private val db = FirebaseFirestore.getInstance()
    private val ts get() = FieldValue.serverTimestamp()
    private fun ref(id: String) = db.collection("markings").document(id)

    fun daily(eventId: String, committeeId: String, dateStr: String): Flow<List<DailyMarking>> = callbackFlow {
        val reg = db.collection("markings").whereEqualTo("eventId", eventId).whereEqualTo("committeeId", committeeId).whereEqualTo("dateStr", dateStr)
            .addSnapshotListener { snap, err ->
                if (err != null || snap == null) { trySend(emptyList()); return@addSnapshotListener }
                trySend(snap.documents.mapNotNull { d -> d.decode<DailyMarking>()?.copy(id = d.id) })
            }
        awaitClose { reg.remove() }
    }

    /** setCriterionScore: one value, or null to clear the criterion. */
    suspend fun setCriterion(base: MarkingBase, templateId: String, value: Double?) {
        val r = markScale(base.markMode)
        writeCriterion(base, templateId, value?.let { clampMark(it, r.start, r.endInclusive) }, null)
    }

    /** setScoreEntries: the per-speech list, mirrored as its mean; empty clears. */
    suspend fun setEntries(base: MarkingBase, templateId: String, entries: List<Double>) {
        val r = markScale(base.markMode)
        val c = entries.map { clampMark(it, r.start, r.endInclusive) }
        writeCriterion(base, templateId, if (c.isEmpty()) null else c.average(), c.ifEmpty { null })
    }

    private suspend fun writeCriterion(base: MarkingBase, templateId: String, score: Double?, entries: List<Double>?) {
        val doc = ref(base.docId)
        db.runTransaction { tx ->
            val snap = tx.get(doc)
            if (snap.exists()) {
                val u = mutableMapOf<String, Any?>(
                    "scores.$templateId" to (score ?: FieldValue.delete()),
                    "scoreEntries.$templateId" to (entries ?: FieldValue.delete()),
                    "updatedAt" to ts,
                )
                // Stamp the scale on a doc that has none; never overwrite one already there.
                if (snap.getString("markMode") == null && base.markMode != null) u["markMode"] = base.markMode
                tx.update(doc, u)
            } else if (score != null) {
                tx.set(doc, base.fields() + mapOf(
                    "feedback" to "",
                    "scores" to mapOf(templateId to score),
                    "updatedAt" to ts,
                ) + (entries?.let { mapOf("scoreEntries" to mapOf(templateId to it)) } ?: emptyMap()))
            }
        }.await()
    }

    /** appendScoreEntry: one more mark for this criterion today (a speech); returns the list. */
    suspend fun appendEntry(base: MarkingBase, templateId: String, value: Double): List<Double> {
        val r = markScale(base.markMode)
        val v = clampMark(value, r.start, r.endInclusive)
        val doc = ref(base.docId)
        return db.runTransaction { tx ->
            val snap = tx.get(doc)
            val data = if (snap.exists()) snap.decode<DailyMarking>() else null
            val prev = data?.scoreEntries?.get(templateId) ?: data?.scores?.get(templateId)?.let { listOf(it) } ?: emptyList()
            val next = prev + v
            if (snap.exists()) {
                val u = mutableMapOf<String, Any?>("scores.$templateId" to next.average(), "scoreEntries.$templateId" to next, "updatedAt" to ts)
                if (data?.markMode == null && base.markMode != null) u["markMode"] = base.markMode
                tx.update(doc, u)
            } else {
                tx.set(doc, base.fields() + mapOf("feedback" to "", "scores" to mapOf(templateId to next.average()), "scoreEntries" to mapOf(templateId to next), "updatedAt" to ts))
            }
            next
        }.await()
    }

    /** setDailyFeedback: never touches scores. */
    suspend fun setFeedback(base: MarkingBase, feedback: String) {
        val doc = ref(base.docId)
        db.runTransaction { tx ->
            val snap = tx.get(doc)
            if (snap.exists()) tx.update(doc, mapOf("feedback" to feedback, "updatedAt" to ts))
            else tx.set(doc, base.fields() + mapOf("feedback" to feedback, "scores" to emptyMap<String, Double>(), "updatedAt" to ts))
        }.await()
    }

    /**
     * sessionService.finalizeSession: a marking doc for every delegate (so attendance is kept
     * even with no scores), the carried scores and feedback, the day's roll call, and the
     * session marked finalized; then out of the live registry. Merge writes of WHOLE maps are
     * correct here: the caller passes the doc's own current scores back.
     */
    suspend fun finalizeSession(eventId: String, committeeId: String, dateStr: String, sessionId: String, gradedBy: String, rows: List<FinalizeRow>, markMode: String?) {
        val batch = db.batch()
        for (r in rows) {
            batch.set(ref("${committeeId}_${r.delegateId}_$dateStr"), buildMap<String, Any?> {
                put("eventId", eventId); put("committeeId", committeeId); put("delegateId", r.delegateId)
                put("applicationId", r.applicationId); put("dateStr", dateStr)
                put("scores", r.scores); put("feedback", r.feedback); put("gradedBy", gradedBy)
                markMode?.let { put("markMode", it) }
                r.attendanceStatus?.let { put("attendanceStatus", it); put("attendanceSource", "rollcall") }
                put("updatedAt", ts)
            }, SetOptions.merge())
        }
        batch.update(db.collection("events").document(eventId).collection("sessions").document(sessionId), mapOf("finalized" to true, "finalizedAt" to ts))
        batch.commit().await()
        runCatching { db.collection("liveSessions").document("${eventId}__$sessionId").delete() }
    }

    // ── Results and standings (committee hub) ─────────────────────────────────────────────

    /** markingService.getMarkingsByCommittee: every day plus the final rollups. One read each. */
    suspend fun committee(eventId: String, committeeId: String): List<DailyMarking> =
        db.collection("markings").whereEqualTo("eventId", eventId).whereEqualTo("committeeId", committeeId).get().await()
            .documents.mapNotNull { d -> d.decode<DailyMarking>()?.copy(id = d.id) }

    /** markingService.saveFinalScore: the committee-level rollup doc, `{committee}_{uid}__final`. */
    suspend fun saveFinal(
        eventId: String, committeeId: String, delegateId: String, applicationId: String, gradedBy: String,
        f: com.munpro.app.domain.FinalScore, days: List<String>, markMode: String?,
    ) {
        ref("${committeeId}_${delegateId}__final").set(mapOf(
            "eventId" to eventId, "committeeId" to committeeId, "delegateId" to delegateId, "applicationId" to applicationId,
            "gradedBy" to gradedBy, "kind" to "final", "markMode" to (markMode ?: "decimal"), "scores" to emptyMap<String, Double>(), "feedback" to "",
            "finalScore" to f.finalScore, "computedPct" to f.computedPct, "chairOverall" to f.chairOverall, "overallWeight" to f.overallWeight,
            "dayCount" to f.dayCount, "presentDays" to f.presentDays, "excludedDays" to f.excludedDays, "days" to days, "updatedAt" to ts,
        ), SetOptions.merge()).await()
    }

    /** standingsService.standingsDocId: "/" is illegal in a doc id. */
    private fun standingsRef(eventId: String, committeeId: String) =
        db.collection("events").document(eventId).collection("standings").document(committeeId.replace("/", "_"))

    /** Is a board published, and with which visibility ("full" | "rank_only")? null = none. */
    suspend fun standingsVisibility(eventId: String, committeeId: String): String? = runCatching {
        val d = standingsRef(eventId, committeeId).get().await()
        if (d.exists()) d.getString("visibility") ?: "full" else null
    }.getOrNull()

    /** standingsService.publishStandings — deliberate, never automatic: it shows scores to the room. */
    suspend fun publishStandings(eventId: String, committeeId: String, ranked: List<com.munpro.app.domain.RankedRow>, publishedBy: String, visibility: String, dayCount: Int, markMode: String?) {
        standingsRef(eventId, committeeId).set(mapOf(
            "eventId" to eventId, "committeeId" to committeeId, "visibility" to visibility, "markMode" to (markMode ?: "decimal"), "dayCount" to dayCount,
            "entries" to ranked.map { r ->
                mapOf("delegateId" to r.row.delegateId, "applicationId" to r.row.applicationId, "country" to r.row.country, "name" to r.row.name,
                    "rank" to r.rank, "finalScore" to r.row.final.finalScore, "computedPct" to r.row.final.computedPct, "chairOverall" to r.row.final.chairOverall,
                    "presentDays" to r.row.final.presentDays, "dayCount" to r.row.final.totalDays)
            },
            "publishedBy" to publishedBy, "publishedAt" to ts, "updatedAt" to ts,
        ), SetOptions.merge()).await()
    }

    suspend fun unpublishStandings(eventId: String, committeeId: String) { standingsRef(eventId, committeeId).delete().await() }
}
