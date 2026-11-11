package com.munpro.app.domain

// Models and rules for what a delegate reads: announcements (port of announcementService.ts'
// model + isUserInAudience, and mobile/src/lib/announcements.ts), in-app notifications
// (notificationService.ts), awards (resultService.ts), rules / study guide
// (optionalModulesService.ts), and the staff role helpers (staffService.ts).

import com.munpro.app.data.LenientInt
import com.munpro.app.data.LenientMillis
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

@Serializable
data class Announcement(
    val id: String = "",
    val subject: String = "",
    val body: String = "",
    /** An AudienceFilter object, or a legacy string ("all", "delegates"). */
    val audience: JsonElement? = null,
    val status: String? = null,
    val sentBy: String? = null,
    val sentByName: String? = null,
    @Serializable(with = LenientInt::class) val recipientCount: Int? = null,
    @Serializable(with = LenientMillis::class) val createdAt: Long? = null,
    @Serializable(with = LenientMillis::class) val sentAt: Long? = null,
)

private val ROLE_KEYWORDS = mapOf(
    "delegate" to listOf("delegate", "lead"),
    "chair" to listOf("chair", "director", "vice-chair"),
    "observer" to listOf("observer"),
    "faculty-advisor" to listOf("faculty advisor", "faculty-advisor", "advisor"),
    "staff" to listOf("staff", "co-organizer", "usg"),
)

fun roleMatches(appRole: String, filterRoles: List<String>): Boolean {
    if (filterRoles.isEmpty()) return true
    if ("all" in filterRoles) return true
    val lc = appRole.lowercase()
    return filterRoles.any { rid -> ROLE_KEYWORDS[rid]?.any { lc.contains(it) } ?: false }
}

fun isUserInAudience(appRole: String, audience: JsonElement?): Boolean {
    if (audience == null || audience is kotlinx.serialization.json.JsonNull) return true
    if (audience is JsonPrimitive && audience.isString) {
        if (audience.content == "all") return true
        if (audience.content == "delegates") return roleMatches(appRole, listOf("delegate"))
        return true
    }
    if (audience is JsonObject) {
        val roles = (audience["roles"] as? JsonArray)?.mapNotNull { it.jsonPrimitive.contentOrNull }.orEmpty()
        if (roles.isEmpty()) return true
        return roleMatches(appRole, roles)
    }
    return true
}

private val VISIBLE = setOf("queued", "sending", "sent", "partial")

/**
 * Which announcements a delegate sees — exactly the web portal's rule (AnnouncementViewer.tsx):
 * no status or a delivered-ish status, and addressed to their role. The web applies NO committee
 * filter here, so neither does the app.
 */
fun visibleTo(list: List<Announcement>, role: String): List<Announcement> =
    list.filter { (it.status == null || it.status in VISIBLE) && isUserInAudience(role.ifEmpty { "Delegate" }, it.audience) }

fun sentAt(a: Announcement): Long = a.sentAt ?: a.createdAt ?: 0L

@Serializable
data class AppNotification(
    val id: String = "",
    val uid: String = "",
    val type: String = "",
    val title: String = "",
    val body: String = "",
    val href: String? = null,
    val eventId: String? = null,
    val read: Boolean = false,
    @Serializable(with = LenientMillis::class) val createdAt: Long? = null,
)

@Serializable
data class DelegateResult(
    val id: String = "",
    val eventId: String = "",
    val delegateUid: String = "",
    val committeeName: String = "",
    val country: String? = null,
    val awardType: String = "",
    val status: String = "",
)

@Serializable
data class RulesGuide(val content: String = "", @Serializable(with = LenientMillis::class) val updatedAt: Long? = null, val updatedBy: String? = null)

@Serializable
data class StudyGuide(val content: String? = null, val title: String? = null)

/** What the Reader shows: an announcement, the rules or the study guide. */
@Serializable
data class ReaderDoc(val title: String, val meta: String? = null, val body: String, val by: String? = null)

// ---- staff roles (staffService.ts) ----

fun isExecBoardRole(role: String?): Boolean {
    val r = role.orEmpty().lowercase()
    return r == "director" || r == "usg" || r == "eb"
}

fun isChairTierRole(role: String?): Boolean {
    val r = role.orEmpty().lowercase()
    return r != "co-organizer" && r.contains("chair")
}

private val STAFF_ROLE_LABELS = mapOf(
    "co-organizer" to "Co-Organizer", "usg" to "Under-Secretary-General", "director" to "Director",
    "chair" to "Chair", "vice-chair" to "Vice Chair", "observer" to "Observer", "faculty-advisor" to "Faculty Advisor",
)

fun roleLabel(role: String): String =
    STAFF_ROLE_LABELS[role] ?: role.replace("-", " ").split(" ").joinToString(" ") { w -> w.replaceFirstChar { it.uppercase() } }

/**
 * A committee this account has a place in during a live sitting, other than as a delegate:
 * [run] = may run it (chair tier, EB in scope, organizer level, canMarkDelegates), else it
 * watches (observer, faculty advisor). [roleLabel] is what Today prints ("Chair", "Organizer").
 */
@Serializable
data class SessionSeat(
    val eventId: String,
    val committee: String,
    val roleLabel: String,
    val run: Boolean,
    /** Owner or co-organizer: also gets Live Control for the event. */
    val organizerLevel: Boolean = false,
    val event: EventData,
    /** Reads and answers the committee's private dais line (the /chat rule's isDais, narrower than [run]). */
    val dais: Boolean = false,
)
