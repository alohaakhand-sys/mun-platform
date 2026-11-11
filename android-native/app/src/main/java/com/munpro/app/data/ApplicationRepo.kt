package com.munpro.app.data

// Port of the reads/writes in src/lib/services/applicationService.ts and activityService.ts the
// app makes. Same collections, same fields, so an application sent from the phone is identical to
// one sent from the website.

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.munpro.app.domain.ApplicationData
import com.munpro.app.domain.CommitteePreference
import com.munpro.app.domain.buildLegacyChoices
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class ApplicationRepo {
    private val db = FirebaseFirestore.getInstance()

    /**
     * The user's applications, plus a virtual approved application for every accepted staff seat
     * (the web's getUserApplications). Unlike the web, this never MIGRATES staff docs: a phone has
     * no business rewriting staff records (mobile/src/lib/chair.ts made the same call).
     * Throws when the read fails, so the caller can keep its saved copy.
     */
    suspend fun getUserApplications(userId: String): List<ApplicationData> {
        if (userId.isEmpty()) return emptyList()
        val snap = db.collection("applications")
            .whereEqualTo("userId", userId)
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .get().await()
        val apps = snap.documents.mapNotNull { it.decode<ApplicationData>() }.toMutableList()

        val staff = db.collectionGroup("staff")
            .whereEqualTo("uid", userId)
            .whereEqualTo("inviteStatus", "accepted")
            .get().await()
        for (d in staff.documents) {
            val eventId = d.reference.path.split("/")[1]
            val role = d.getString("role").orEmpty()
            val committee = d.getString("committeeId").orEmpty()
            val mapped = when (role) {
                "faculty-advisor" -> "Faculty Advisor"
                "co-organizer" -> "Co-Organizer"
                "usg" -> "Under-Secretary-General"
                else -> role.split("-").joinToString(" ") { w -> w.replaceFirstChar { it.uppercase() } }
            }
            val i = apps.indexOfFirst { it.eventId == eventId }
            if (i != -1) {
                // An accepted staff seat overrides the role (the web's rule).
                apps[i] = apps[i].copy(role = mapped, status = "approved", assignedCommittee = committee.ifEmpty { apps[i].assignedCommittee }, fromStaffSeat = true)
            } else {
                apps += ApplicationData(
                    id = d.id, eventId = eventId, userId = userId, role = mapped, status = "approved",
                    assignedCommittee = committee.ifEmpty { null }, preferredCommittee = committee,
                    countryPreferences = emptyList(), choices = buildLegacyChoices(committee, emptyList()),
                    fromStaffSeat = true,
                )
            }
        }
        return apps
    }

    suspend fun hasUserAppliedToEvent(userId: String, eventId: String): Boolean {
        if (userId.isEmpty() || eventId.isEmpty()) return false
        return runCatching {
            !db.collection("applications").whereEqualTo("userId", userId).whereEqualTo("eventId", eventId).limit(1).get().await().isEmpty
        }.getOrDefault(false)
    }

    /** Every application to an event (the chair's roster; rules decide who may read). */
    suspend fun getApplicationsByEvent(eventId: String): List<ApplicationData> {
        if (eventId.isEmpty()) return emptyList()
        return runCatching {
            db.collection("applications").whereEqualTo("eventId", eventId)
                .orderBy("createdAt", Query.Direction.DESCENDING).get().await()
                .documents.mapNotNull { it.decode<ApplicationData>() }
        }.getOrDefault(emptyList())
    }

    data class Submission(
        val eventId: String,
        val userId: String,
        val applicantName: String,
        val applicantEmail: String,
        val applicantPhone: String = "",
        val role: String,
        val committeePreferences: List<CommitteePreference>,
        val experience: String,
        val motivation: String,
        /** The role's fee right now; > 0 marks the application unpaid with its tier. */
        val fee: Double,
    )

    sealed interface SubmitResult {
        data class Ok(val id: String) : SubmitResult
        data object AlreadyApplied : SubmitResult
        data class Failed(val error: Throwable?) : SubmitResult
    }

    /** submitApplication + the payload the web wizard builds (ApplicationWizard.tsx / RN apply). */
    suspend fun submitApplication(s: Submission): SubmitResult {
        return try {
            // Guard against duplicate applications (e.g. two devices).
            if (hasUserAppliedToEvent(s.userId, s.eventId)) return SubmitResult.AlreadyApplied
            val first = s.committeePreferences.firstOrNull()
            val legacy = buildLegacyChoices(first?.committee.orEmpty(), first?.countries.orEmpty())
            fun choice(c: com.munpro.app.domain.ApplicationChoice) = mapOf("committee" to c.committee, "country" to c.country)
            val payload = buildMap<String, Any?> {
                put("eventId", s.eventId)
                put("userId", s.userId)
                put("applicantName", s.applicantName)
                put("applicantEmail", s.applicantEmail)
                if (s.applicantPhone.isNotBlank()) put("applicantPhone", s.applicantPhone.trim())
                put("role", s.role)
                put("committeePreferences", s.committeePreferences.map { mapOf("committee" to it.committee, "countries" to it.countries) })
                put("preferredCommittee", first?.committee.orEmpty())
                put("countryPreferences", first?.countries.orEmpty())
                put("choices", mapOf("primary" to choice(legacy.primary), "secondary" to choice(legacy.secondary), "tertiary" to choice(legacy.tertiary)))
                put("experience", s.experience)
                put("motivation", s.motivation)
                put("status", "pending")
                if (s.fee > 0) {
                    put("paymentStatus", "unpaid")
                    put("tierName", s.role)
                }
                put("createdAt", FieldValue.serverTimestamp())
            }
            val ref = db.collection("applications").add(payload).await()
            // Fire-and-forget, like the web: the applicant + organiser email (needs the site URL).
            com.munpro.app.AppGraph.scope.launchCatching {
                Api.call(
                    "/api/notify/application", "POST",
                    buildJsonObject {
                        put("eventId", s.eventId); put("applicantName", s.applicantName)
                        put("applicantEmail", s.applicantEmail); put("role", s.role)
                    }.toString(),
                )
            }
            SubmitResult.Ok(ref.id)
        } catch (e: Exception) {
            SubmitResult.Failed(e)
        }
    }

    /** activityService.logActivity — never throws. */
    suspend fun logActivity(userId: String, actorName: String, actorRole: String, type: String, action: String, targetId: String, targetTitle: String, isPublic: Boolean) {
        runCatching {
            db.collection("activities").add(
                mapOf(
                    "userId" to userId, "actorName" to actorName, "actorRole" to actorRole, "type" to type,
                    "action" to action, "targetId" to targetId, "targetTitle" to targetTitle, "isPublic" to isPublic,
                    "createdAt" to FieldValue.serverTimestamp(),
                ),
            ).await()
        }
    }
}

/** launch, swallowing failures (fire-and-forget calls). */
fun CoroutineScope.launchCatching(block: suspend () -> Unit) = launch { runCatching { block() } }
