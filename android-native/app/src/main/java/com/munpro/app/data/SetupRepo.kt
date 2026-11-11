package com.munpro.app.data

// Event setup writes (board C3), the same documents the web's committees, details and partners
// pages write: the committees array and committee-choice count on the event, the rename cascade
// (eventService.cascadeCommitteeRename, plus the committee chat and applicants' ranked choices),
// the details/modules/marking fields, and events/{e}/partners (partnerService).

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.munpro.app.domain.Committee
import com.munpro.app.domain.MarkingTemplate
import com.munpro.app.domain.SocialMedia
import com.munpro.app.domain.sameCommittee
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.Serializable

/** events/{e}/partners/{id} (partnerService.Partner). */
@Serializable
data class Partner(
    val id: String = "",
    val name: String = "",
    val logoUrl: String = "",
    val description: String = "",
    val websiteUrl: String = "",
    /** gold | silver | bronze | media; the web always writes bronze. */
    val tier: String = "bronze",
    @Serializable(with = LenientInt::class) val order: Int? = null,
)

class SetupRepo {
    private val db = FirebaseFirestore.getInstance()
    private fun event(id: String) = db.collection("events").document(id)
    private fun now() = java.time.Instant.now().toString()

    /** Blank removes the field (the web used to drop blanks and keep the old value). */
    private fun orDelete(v: String): Any = v.trim().ifEmpty { FieldValue.delete() }

    private fun committeeMap(c: Committee): Map<String, Any> = buildMap {
        put("name", c.name)
        put("capacity", c.capacity ?: 0)
        put("countries", c.countries)
        put("difficulties", c.difficulties)
        c.difficulties.firstOrNull()?.let { put("difficulty", it) } // legacy mirror
        if (c.agendas.isNotEmpty()) { put("agendas", c.agendas); put("topic", c.agendas[0]) }
        c.description?.takeIf { it.isNotEmpty() }?.let { put("description", it) }
        if (c.chairs.isNotEmpty()) put("chairs", c.chairs)
    }

    suspend fun saveCommittees(eventId: String, list: List<Committee>) {
        event(eventId).update(mapOf("committees" to list.map(::committeeMap), "updatedAt" to now())).await()
    }

    suspend fun setChoices(eventId: String, n: Int) {
        event(eventId).update(mapOf("committeeChoicesAllowed" to n, "updatedAt" to now())).await()
    }

    /**
     * eventService.cascadeCommitteeRename: every doc keyed by the committee's name follows it, in
     * ONE batch. Also the committee group chat and applicants' ranked choices.
     */
    suspend fun renameCommittee(eventId: String, old: String, new: String) {
        if (old.isBlank() || new.isBlank() || old == new) return
        val batch = db.batch()

        db.collection("applications").whereEqualTo("eventId", eventId).get().await().documents.forEach { d ->
            val patch = mutableMapOf<String, Any>()
            if (d.getString("assignedCommittee") == old) patch["assignedCommittee"] = new
            if (sameCommittee(d.getString("preferredCommittee"), old)) patch["preferredCommittee"] = new
            val prefs = d.get("committeePreferences") as? List<*>
            if (prefs != null && prefs.any { sameCommittee((it as? Map<*, *>)?.get("committee") as? String, old) }) {
                patch["committeePreferences"] = prefs.map { p ->
                    val m = p as? Map<*, *>
                    if (m != null && sameCommittee(m["committee"] as? String, old)) m.entries.associate { (k, v) -> k.toString() to v } + ("committee" to new) else p
                }
            }
            val choices = d.get("choices") as? Map<*, *>
            for (slot in listOf("primary", "secondary", "tertiary")) {
                if (sameCommittee((choices?.get(slot) as? Map<*, *>)?.get("committee") as? String, old)) patch["choices.$slot.committee"] = new
            }
            if (patch.isNotEmpty()) batch.update(d.reference, patch)
        }
        val ev = event(eventId)
        ev.collection("staff").whereEqualTo("committeeId", old).get().await().documents
            .forEach { batch.update(it.reference, "committeeId", new) }
        db.collection("markings").whereEqualTo("eventId", eventId).whereEqualTo("committeeId", old).get().await().documents
            .forEach { batch.update(it.reference, "committeeId", new) }
        ev.collection("results").whereEqualTo("committeeId", old).get().await().documents
            .forEach { batch.update(it.reference, mapOf("committeeId" to new, "committeeName" to new)) }
        ev.collection("committeeDocs").whereEqualTo("committee", old).get().await().documents.forEach { d ->
            batch.update(d.reference, "committee", new)
            d.reference.collection("docEndorsements").get().await().documents.forEach { batch.update(it.reference, "committee", new) }
        }
        val sg = ev.collection("studyGuides").document(old).get().await()
        if (sg.exists()) {
            batch.set(ev.collection("studyGuides").document(new), sg.data!!)
            batch.delete(sg.reference)
        }
        db.collection("conversations").whereEqualTo("type", "group").whereEqualTo("eventId", eventId).whereEqualTo("committeeId", old)
            .get().await().documents.forEach { d ->
                val patch = mutableMapOf<String, Any>("committeeId" to new)
                val name = d.getString("groupName")
                if (name != null && name.endsWith(" - $old")) patch["groupName"] = name.dropLast(old.length) + new
                batch.update(d.reference, patch)
            }
        batch.commit().await()
    }

    /** details/page.tsx handleSave, the delegate + web & social half. */
    suspend fun saveDetails(eventId: String, expected: Int, audience: String, website: String, email: String, social: SocialMedia) {
        val sm = buildMap {
            social.instagram?.trim()?.takeIf { it.isNotEmpty() }?.let { put("instagram", it.removePrefix("@")) }
            social.twitter?.trim()?.takeIf { it.isNotEmpty() }?.let { put("twitter", it.removePrefix("@")) }
            social.facebook?.trim()?.takeIf { it.isNotEmpty() }?.let { put("facebook", it) }
            social.linkedin?.trim()?.takeIf { it.isNotEmpty() }?.let { put("linkedin", it) }
        }
        event(eventId).update(mapOf(
            "expectedDelegates" to expected,
            "targetAudience" to orDelete(audience), "website" to orDelete(website), "contactEmail" to orDelete(email),
            "socialMedia" to sm, "updatedAt" to now(),
        )).await()
    }

    suspend fun saveModules(eventId: String, modules: List<String>) {
        event(eventId).update(mapOf("optionalModules" to modules, "updatedAt" to now())).await()
    }

    /** The criteria (fixed −100…+100, maxScore pinned to 100) and the pattern chairs score on. */
    suspend fun saveMarking(eventId: String, templates: List<MarkingTemplate>, mode: String) {
        val list = templates.filter { it.name.isNotBlank() }.map { t ->
            buildMap {
                put("id", t.id); put("name", t.name.trim()); put("maxScore", 100)
                t.autoFillFrom?.let { put("autoFillFrom", it) }
                if (t.autoFillFrom != null) t.autoFillCap?.let { put("autoFillCap", it.toInt()) }
            }
        }
        event(eventId).update(mapOf("markingTemplates" to list, "scoringConfig.markingMode" to mode, "updatedAt" to now())).await()
    }

    /** Final scoring: the chair-overall blend weight and the explicit conference days (empty = derived). */
    suspend fun saveScoring(eventId: String, weight: Double, days: List<String>) {
        event(eventId).update(mapOf(
            "scoringConfig.overallWeight" to weight.coerceIn(0.0, 1.0),
            "scoringConfig.markingDays" to (days.distinct().sorted().ifEmpty { null } ?: FieldValue.delete()),
            "updatedAt" to now(),
        )).await()
    }

    // ── Partners ────────────────────────────────────────────────────────────────────────────

    private fun partnersOf(eventId: String) = event(eventId).collection("partners")

    suspend fun partners(eventId: String): List<Partner> =
        partnersOf(eventId).orderBy("order", Query.Direction.ASCENDING).get().await().documents.mapNotNull { it.decode<Partner>() }

    suspend fun addPartner(eventId: String, p: Partner, order: Int): String =
        partnersOf(eventId).add(mapOf(
            "name" to p.name, "description" to p.description, "websiteUrl" to p.websiteUrl, "logoUrl" to p.logoUrl,
            "tier" to "bronze", "order" to order, "createdAt" to FieldValue.serverTimestamp(),
        )).await().id

    suspend fun updatePartner(eventId: String, p: Partner) {
        partnersOf(eventId).document(p.id).update(mapOf(
            "name" to p.name, "description" to p.description, "websiteUrl" to p.websiteUrl, "logoUrl" to p.logoUrl,
        )).await()
    }

    suspend fun deletePartner(eventId: String, id: String) { partnersOf(eventId).document(id).delete().await() }

    suspend fun reorderPartners(eventId: String, ids: List<String>) {
        val batch = db.batch()
        ids.forEachIndexed { i, id -> batch.update(partnersOf(eventId).document(id), "order", i) }
        batch.commit().await()
    }
}
