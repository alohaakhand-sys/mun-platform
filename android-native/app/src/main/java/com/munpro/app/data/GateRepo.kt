package com.munpro.app.data

// The conference gate (board B1; web dashboard/conferences, conferences/[id] Overview,
// waitlistService.ts, TeamDelegationPanel.tsx, organizer/events). Same documents and writes as the
// web, under the same rules:
// - Withdraw: the applicant may set only status → "withdrawn" (isApplicantSelfEdit), then the
//   membership marker is recomputed and the applicant notified, as updateApplication does.
// - A waitlist seat offer is events/{e}/waitlist/{id} with status "offered" and notifiedAt; the
//   applicant answers "accepted" or "expired" within 48 hours (the organizer then finalizes).
// - Organize: the events I own or co-organize, with applicant and approved counts (aggregate
//   queries, one read each) and the five publish checks of the event overview.

import com.google.firebase.firestore.AggregateSource
import com.google.firebase.firestore.FirebaseFirestore
import com.munpro.app.AppGraph
import com.munpro.app.domain.ApplicationData
import com.munpro.app.domain.EventData
import com.munpro.app.domain.getEnabledRoleTiers
import com.munpro.app.domain.getEventCapacity
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** events/{e}/waitlist/{id}: "waiting" | "offered" | "accepted" | "expired". */
@Serializable
data class WaitlistEntry(
    val id: String = "",
    val eventId: String = "",
    val committeeId: String = "",
    val status: String = "",
    @Serializable(with = LenientMillis::class) val notifiedAt: Long? = null,
)

/** The offer window the web shows (and its email promises). */
const val WAITLIST_OFFER_HOURS = 48

fun WaitlistEntry.hoursLeft(now: Long = System.currentTimeMillis()): Long =
    notifiedAt?.let { maxOf(0L, WAITLIST_OFFER_HOURS - (now - it) / 3_600_000L) } ?: WAITLIST_OFFER_HOURS.toLong()

/** An event I organize, with what the Organize segment shows. */
@Serializable
data class OrganizedEvent(
    val event: EventData,
    val coOrganizer: Boolean = false,
    val applicants: Int? = null,
    val approved: Int? = null,
    /** Publish checks done: basics, committees, role tiers, details (required), schedule (optional). */
    val stepsDone: Int = 0,
) {
    val published: Boolean get() = event.status == "published"
    /** approved / sum of committee capacities, as the event overview computes "Capacity %". */
    val fullPct: Int? get() = getEventCapacity(event).takeIf { it > 0 }?.let { cap -> approved?.let { Math.round(it * 100f / cap) } }
}

/** The event overview's readiness rows (organizer/events/[id] page). */
fun publishSteps(e: EventData): Int = listOf(
    e.title.isNotBlank() && e.date.isNotBlank() && e.location.isNotBlank() && e.description.isNotBlank(),
    e.committees.any { it.name.isNotBlank() && (it.capacity ?: 0) > 0 },
    getEnabledRoleTiers(e).isNotEmpty(),
    (e.expectedDelegates ?: 0) > 0 || !e.targetAudience.isNullOrBlank() || e.applicationDeadlines != null,
    e.schedule.isNotEmpty(),
).count { it }

const val PUBLISH_STEPS = 5

class GateRepo {
    private val db = FirebaseFirestore.getInstance()

    /** handleWithdraw: pending and unpaid only (the caller checks; the rule enforces status). */
    suspend fun withdraw(app: ApplicationData) {
        db.collection("applications").document(app.id).update("status", "withdrawn").await()
        val uid = AppGraph.auth.user?.uid
        if (uid != null) runCatching { Membership.refresh(uid, app.eventId) }
        Api.call("/api/notify/application-update", "POST", buildJsonObject {
            put("eventId", app.eventId)
            put("applicantName", app.applicantName.orEmpty())
            put("applicantEmail", app.applicantEmail.orEmpty())
            put("status", "withdrawn")
            put("role", app.role)
        }.toString())
    }

    /** getMyWaitlistEntries: my entries on these events (one small query each). */
    suspend fun waitlist(eventIds: List<String>, uid: String): List<WaitlistEntry> = coroutineScope {
        eventIds.distinct().map { e ->
            async {
                runCatching {
                    db.collection("events").document(e).collection("waitlist").whereEqualTo("applicantUid", uid).get().await()
                        .documents.mapNotNull { it.decode<WaitlistEntry>()?.copy(eventId = e) }
                }.getOrDefault(emptyList())
            }
        }.awaitAll().flatten()
    }

    /** acceptWaitlistOffer / declineWaitlistOffer: the only two answers the rule allows. */
    suspend fun answerOffer(entry: WaitlistEntry, accept: Boolean) {
        db.collection("events").document(entry.eventId).collection("waitlist").document(entry.id)
            .update("status", if (accept) "accepted" else "expired").await()
    }

    /** Events I own, then those I co-organize (accepted co-organizer staff docs). */
    suspend fun organized(uid: String): List<OrganizedEvent> = coroutineScope {
        val owned = db.collection("events").whereEqualTo("organizerId", uid).get().await().documents.mapNotNull { it.decode<EventData>() }
        val coIds = runCatching {
            db.collectionGroup("staff").whereEqualTo("uid", uid).whereEqualTo("inviteStatus", "accepted").whereEqualTo("role", "co-organizer")
                .get().await().documents.map { it.reference.path.split("/")[1] }
        }.getOrDefault(emptyList()).filter { id -> owned.none { it.id == id } }.distinct()
        val co = coIds.map { id -> async { AppGraph.events.getEventById(id) } }.awaitAll().filterNotNull()
        (owned.map { it to false } + co.map { it to true }).map { (e, isCo) ->
            async {
                val apps = db.collection("applications").whereEqualTo("eventId", e.id)
                val total = runCatching { apps.count().get(AggregateSource.SERVER).await().count.toInt() }.getOrNull()
                val ok = runCatching { apps.whereEqualTo("status", "approved").count().get(AggregateSource.SERVER).await().count.toInt() }.getOrNull()
                OrganizedEvent(e, isCo, total, ok, publishSteps(e))
            }
        }.awaitAll().sortedWith(compareByDescending<OrganizedEvent> { it.published }.thenBy { com.munpro.app.domain.getEventStartMs(it.event) ?: Long.MAX_VALUE })
    }

    /** A faculty advisor's delegates: applications naming the same institution (FacultyAdvisorPanel's query). */
    suspend fun institutionDelegates(eventId: String, institution: String): List<ApplicationData> =
        db.collection("applications").whereEqualTo("eventId", eventId).whereEqualTo("institutionName", institution).get().await()
            .documents.mapNotNull { it.decode<ApplicationData>() }

    /** My team: every application in my delegation on this event (TeamDelegationPanel's query). */
    suspend fun team(eventId: String, delegationId: String): List<ApplicationData> =
        db.collection("applications").whereEqualTo("delegationId", delegationId).whereEqualTo("eventId", eventId).get().await()
            .documents.mapNotNull { it.decode<ApplicationData>() }
}
