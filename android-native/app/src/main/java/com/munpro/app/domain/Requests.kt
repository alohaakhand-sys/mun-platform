package com.munpro.app.domain

// Requests in the conference portal (board B2; web MigrationPanel, migrationService.ts,
// ComplaintSystem, complaintService.ts). A seat move is migrationRequests/{id}, written only by
// the site's /api/migrations routes; a help-desk request is complaints/{id}, created by the
// delegate and escalated by its handlers (chair → organizer → main organizer → App Admin).

import com.munpro.app.data.LenientMillis
import kotlinx.serialization.Serializable

@Serializable
data class MigrationRequest(
    val id: String = "",
    val eventId: String = "",
    val requesterUid: String = "",
    val requesterName: String? = null,
    val fromCommittee: String = "",
    val fromCountry: String = "",
    val toCommittee: String = "",
    val toCountry: String = "",
    /** "direct" | "swap" | null until decided. */
    val type: String? = null,
    /** pending | awaiting_swap | completed | rejected | failed | cancelled */
    val status: String = "",
    val occupantUid: String? = null,
    val occupantName: String? = null,
    @Serializable(with = LenientMillis::class) val swapDeadline: Long? = null,
    val swapResponse: String? = null,
    val reason: String? = null,
    @Serializable(with = LenientMillis::class) val createdAt: Long? = null,
    @Serializable(with = LenientMillis::class) val resolvedAt: Long? = null,
) {
    val active: Boolean get() = status == "pending" || status == "awaiting_swap"
}

fun migrationStatusLabel(status: String): String = when (status) {
    "pending" -> "Pending review"
    "awaiting_swap" -> "Approved, awaiting swap"
    "completed" -> "Completed"
    "rejected" -> "Rejected"
    "failed" -> "Swap failed"
    "cancelled" -> "Cancelled"
    else -> status.replaceFirstChar { it.uppercase() }
}

/** "30h 12m" (≥ 1 hour) or "12m 05s", as the web's countdown. */
fun countdown(ms: Long): String {
    if (ms <= 0) return "expired"
    val s = ms / 1000
    val h = s / 3600
    val m = (s % 3600) / 60
    return if (h >= 1) "${h}h ${m}m" else "${m}m ${"%02d".format(s % 60)}s"
}

@Serializable
data class ComplaintEntry(
    val action: String = "",
    val actorUid: String = "",
    val actorRole: String = "",
    val message: String = "",
    @Serializable(with = LenientMillis::class) val timestamp: Long? = null,
)

@Serializable
data class Complaint(
    val id: String = "",
    val eventId: String = "",
    val applicationId: String = "",
    val userId: String = "",
    val type: String = "general",
    val subject: String = "",
    val description: String = "",
    /** open | under_review | escalated | resolved | rejected | pending */
    val status: String = "open",
    val escalationLevel: Int = 0,
    val assignedRole: String? = null,
    val assignedTo: String? = null,
    val history: List<ComplaintEntry> = emptyList(),
    val resolution: String? = null,
    @Serializable(with = LenientMillis::class) val createdAt: Long? = null,
)

/** The web's request types: (stored value, label, hint). */
val COMPLAINT_TYPES = listOf(
    Triple("general", "General inquiry", null),
    Triple("academic", "Academic / chair", "Study guide, marking, procedure"),
    Triple("logistics", "Logistics", "Rooms, food, transport, Wi-Fi"),
    Triple("complaint", "Code of conduct", null),
)

fun complaintTypeLabel(type: String) = COMPLAINT_TYPES.firstOrNull { it.first == type }?.second ?: type.replaceFirstChar { it.uppercase() }

fun complaintStatusLabel(status: String): String = when (status) {
    "open" -> "Open"
    "under_review" -> "Under review"
    "escalated" -> "Escalated"
    "resolved" -> "Resolved"
    "rejected" -> "Rejected"
    else -> "Pending"
}

/** ESCALATION_STEPS: the chain a request climbs. */
val ESCALATION_STEPS = listOf("Chair", "Organizer", "Main org", "App admin")
