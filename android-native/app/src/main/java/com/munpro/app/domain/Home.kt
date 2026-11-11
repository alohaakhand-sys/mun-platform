package com.munpro.app.domain

// What the Home tab and the bell show (board A1): the platform's activity stream
// (web lib/services/activityService.ts), the user's connections (connectionService.ts), staff
// invitations (NotificationsContext.fetchNotifications) and committee room alerts
// (roomNotificationService.ts). Field names are the web's, so the same documents decode here.

import com.munpro.app.data.LenientMillis
import kotlinx.serialization.Serializable

/** activities/{id}: a system event such as "X submitted an application for Y". Nobody posts these. */
@Serializable
data class Activity(
    val id: String = "",
    val userId: String = "",
    val actorName: String = "",
    val actorRole: String = "",
    val actorPhotoURL: String? = null,
    val type: String = "",
    val action: String = "",
    val targetId: String = "",
    val targetTitle: String = "",
    @Serializable(with = LenientMillis::class) val createdAt: Long? = null,
    val isPublic: Boolean = false,
)

/** The three scopes of the web ActivityFeed. */
enum class ActivityScope(val label: String) { All("All"), Following("Following"), Mine("Mine") }

/** users/{uid}/connections/{otherUid}. */
@Serializable
data class Connection(
    val id: String = "",
    val otherUid: String = "",
    val displayName: String = "",
    val photoURL: String? = null,
    val role: String = "",
    /** "auto" (met at a conference) or "manual". */
    val source: String = "",
    val sourceEventId: String? = null,
    @Serializable(with = LenientMillis::class) val connectedAt: Long? = null,
    val status: String = "active",
)

/**
 * A staff doc waiting for this user's answer: an invitation, or a role change the organizer made
 * (`isRoleUpdate`). [raw] is the document as Firestore returned it: accepting copies it into the
 * user's own staff doc, and the rules compare role, permissions and committee value for value.
 */
data class StaffInvite(
    val id: String,
    val path: String,
    val eventId: String,
    val eventTitle: String,
    val role: String,
    val committeeId: String,
    val isRoleUpdate: Boolean,
    val previousRole: String?,
    val raw: Map<String, Any?>,
) {
    /** The organizer's six switches, the ones that are on. */
    val grants: List<String>
        get() {
            @Suppress("UNCHECKED_CAST")
            val p = (raw["permissions"] as? Map<String, Any?>).orEmpty()
            return PERMISSION_LABELS.filter { (k, _) -> p[k] == true }.map { it.second }
        }
}

/** PermissionsEditor.tsx's labels, in its order. */
val PERMISSION_LABELS = listOf(
    "canViewApplications" to "View applications",
    "canMarkDelegates" to "Mark delegates",
    "canSendAnnouncements" to "Send announcements",
    "canManageSchedule" to "Manage the schedule",
    "canViewFinancials" to "View financials",
    "canApproveResults" to "Approve results",
    "canScanPasses" to "Scan passes",
)

/** "chair" → "Chair", "co-organizer" → "Co-organizer", "usg" → "Under-Secretary-General". */
fun staffRoleLabel(role: String): String = when (role.lowercase()) {
    "usg" -> "Under-Secretary-General"
    "co-organizer" -> "Co-organizer"
    "faculty-advisor" -> "Faculty Advisor"
    "vice-chair" -> "Vice Chair"
    else -> role.split("-").joinToString(" ") { w -> w.replaceFirstChar { it.uppercase() } }
}

/** events/{e}/committees/{c}/notifications/{id}, with the committee it came from. */
data class RoomAlert(
    val id: String,
    val message: String,
    /** "info" | "warning" | "urgent" */
    val type: String,
    val createdAt: Long?,
    val expiresAt: Long?,
    val eventId: String,
    val eventTitle: String,
    val committeeId: String,
)

/** Profile strength (web ProfileView computeStrength): ten checks, the first missing one is the hint. */
data class Strength(val pct: Int, val label: String, val next: String?)

fun profileStrength(p: com.munpro.app.data.Profile?): Strength {
    val checks = listOf(
        !p?.photoURL.isNullOrEmpty() to "Add a profile photo",
        !p?.coverURL.isNullOrEmpty() to "Add a cover image",
        !p?.headline.isNullOrEmpty() to "Add a headline",
        !p?.bio.isNullOrEmpty() to "Write a bio",
        (!p?.city.isNullOrEmpty() && !p?.country.isNullOrEmpty()) to "Add your location",
        !p?.nationality.isNullOrEmpty() to "Add your nationality",
        !p?.skills.isNullOrEmpty() to "Add a few skills",
        !p?.experience.isNullOrEmpty() to "Add MUN experience",
        !p?.education.isNullOrEmpty() to "Add your education",
        (!p?.instagram.isNullOrEmpty() || !p?.linkedin.isNullOrEmpty() || !p?.tiktok.isNullOrEmpty()) to "Link a social profile",
    )
    val pct = Math.round(checks.count { it.first } * 100f / checks.size)
    val label = when { pct >= 100 -> "All-Star"; pct >= 70 -> "Advanced"; pct >= 40 -> "Intermediate"; else -> "Beginner" }
    return Strength(pct, label, checks.firstOrNull { !it.first }?.second)
}

/** The same ten checks on a profile read as a [PublicProfile] (the editor's live copy). */
fun profileStrength(p: PublicProfile): Strength = profileStrength(
    com.munpro.app.data.Profile(
        photoURL = p.photoURL, coverURL = p.coverURL, headline = p.headline, bio = p.bio, city = p.city, country = p.country,
        nationality = p.nationality, instagram = p.instagram, linkedin = p.linkedin, tiktok = p.tiktok,
        skills = p.skills.map { kotlinx.serialization.json.JsonPrimitive(it) },
        experience = p.experience.map { kotlinx.serialization.json.JsonPrimitive(it.id) },
        education = p.education.map { kotlinx.serialization.json.JsonPrimitive(it.id) },
    ),
)
