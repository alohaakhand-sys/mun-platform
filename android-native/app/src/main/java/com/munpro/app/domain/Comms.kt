package com.munpro.app.domain

// Staff, schedule and announcements as the organizer manages them (board C4; web
// organizer/events/[id]/staff, schedule, announcements): staffService's roles, presets and
// permissions, scheduleTemplates.ts, and the announcement audience the send route resolves.

import com.munpro.app.data.LenientInt
import com.munpro.app.data.LenientMillis
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

// ── Staff ───────────────────────────────────────────────────────────────────────────────

/** events/{e}/staff/{id} (staffService.StaffMember). The id is auto until the invite is accepted, then the uid. */
@Serializable
data class StaffDoc(
    val id: String = "",
    val uid: String = "",
    val name: String = "",
    val email: String = "",
    val role: String = "",
    val committeeId: String? = null,
    val permissions: Map<String, Boolean> = emptyMap(),
    val delegatePower: Boolean = false,
    /** invited | applied | accepted | rejected */
    val inviteStatus: String = "",
    val isRoleUpdate: Boolean = false,
)

/** STAFF_ROLE_OPTIONS with the invite sheet's one-line descriptions. */
val STAFF_ROLES: List<Triple<String, String, String>> = listOf(
    Triple("co-organizer", "Co-organizer", "Runs the event with you"),
    Triple("usg", "Under-Secretary-General", "Executive Board"),
    Triple("director", "Director", "Executive Board · can mark"),
    Triple("chair", "Chair", "Runs one committee"),
    Triple("vice-chair", "Vice chair", "Helps run one committee"),
    Triple("observer", "Observer", "Read-only"),
    Triple("faculty-advisor", "Faculty advisor", "Read-only"),
)

/** Roles a person may apply for when the organizer takes public staff applications. */
val STAFF_APPLY_ROLES = listOf("chair", "vice-chair", "director")

/** PermissionsMap keys, in the editor's order, with labels. */
val STAFF_PERMISSIONS: List<Pair<String, String>> = listOf(
    "canViewApplications" to "View applications",
    "canMarkDelegates" to "Mark delegates",
    "canSendAnnouncements" to "Send announcements",
    "canManageSchedule" to "Manage schedule",
    "canViewFinancials" to "View financials",
    "canApproveResults" to "Approve results",
    "canScanPasses" to "Scan passes",
)

/** ROLE_PRESETS on top of DEFAULT_PERMISSIONS (all false). */
fun rolePermissions(role: String): Map<String, Boolean> {
    val on = when (role) {
        "co-organizer" -> setOf("canViewApplications", "canSendAnnouncements", "canManageSchedule", "canViewFinancials", "canApproveResults", "canScanPasses")
        "usg" -> setOf("canViewApplications", "canManageSchedule")
        "director" -> setOf("canViewApplications", "canMarkDelegates")
        else -> emptySet()
    }
    return STAFF_PERMISSIONS.associate { (k, _) -> k to (k in on) }
}

/** Roles scoped by a committee (EB: none = every committee). */
fun takesCommittee(role: String) = role in setOf("chair", "vice-chair", "director", "usg", "eb")

// ── Schedule ────────────────────────────────────────────────────────────────────────────

data class ScheduleTemplateSession(val title: String, val type: String, val location: String, val day: Int, val start: String, val end: String)
data class ScheduleTemplate(val id: String, val name: String, val description: String, val days: Int, val sessions: List<ScheduleTemplateSession>)

private fun s(title: String, type: String, location: String, day: Int, start: String, end: String) = ScheduleTemplateSession(title, type, location, day, start, end)

/** scheduleTemplates.ts SCHEDULE_TEMPLATES */
val SCHEDULE_TEMPLATES = listOf(
    ScheduleTemplate("standard-2day", "Standard 2-Day MUN", "Opening, four committee sessions across two days, a social night, and closing.", 2, listOf(
        s("Registration & Check-in", "main", "Lobby", 0, "08:00", "09:00"),
        s("Opening Ceremony", "main", "Main Hall", 0, "09:00", "10:00"),
        s("Committee Session I", "session", "Committee Rooms", 0, "10:15", "12:30"),
        s("Lunch Break", "break", "Dining Hall", 0, "12:30", "13:30"),
        s("Committee Session II", "session", "Committee Rooms", 0, "13:30", "16:30"),
        s("Social Night", "social", "TBD", 0, "19:00", "22:00"),
        s("Committee Session III", "session", "Committee Rooms", 1, "09:30", "12:30"),
        s("Lunch Break", "break", "Dining Hall", 1, "12:30", "13:30"),
        s("Committee Session IV", "session", "Committee Rooms", 1, "13:30", "16:00"),
        s("Closing Ceremony & Awards", "main", "Main Hall", 1, "16:30", "18:00"),
    )),
    ScheduleTemplate("single-day", "1-Day Conference", "A compact single-day itinerary: opening, two sessions, lunch, and awards.", 1, listOf(
        s("Registration & Check-in", "main", "Lobby", 0, "08:00", "09:00"),
        s("Opening Ceremony", "main", "Main Hall", 0, "09:00", "10:00"),
        s("Committee Session I", "session", "Committee Rooms", 0, "10:15", "12:30"),
        s("Lunch Break", "break", "Dining Hall", 0, "12:30", "13:30"),
        s("Committee Session II", "session", "Committee Rooms", 0, "13:30", "16:00"),
        s("Awards & Closing", "main", "Main Hall", 0, "16:15", "17:30"),
    )),
    ScheduleTemplate("opening-day", "Opening Day", "Just the day-one arrival block — registration, opening, keynote, and intros.", 1, listOf(
        s("Registration & Check-in", "main", "Lobby", 0, "08:00", "09:00"),
        s("Opening Ceremony", "main", "Main Hall", 0, "09:00", "10:00"),
        s("Keynote Address", "main", "Main Hall", 0, "10:00", "11:00"),
        s("Committee Introductions", "session", "Committee Rooms", 0, "11:15", "13:00"),
    )),
)

/** The schedule's session types (web TYPE_META), in the editor's order. */
val SCHEDULE_TYPES: List<Pair<String, String>> = listOf("main" to "Main", "session" to "Committee", "break" to "Break", "social" to "Social")

/** resolveEventStartDate: "YYYY-MM-DD" from startDate, else the event date. */
fun resolveEventStartDate(e: EventData?): String? {
    if (e == null) return null
    e.startDate?.takeIf { Regex("^\\d{4}-\\d{2}-\\d{2}").containsMatchIn(it) }?.let { return it.take(10) }
    val ms = getEventStartMs(e) ?: return e.date.takeIf { Regex("^\\d{4}-\\d{2}-\\d{2}").containsMatchIn(it) }?.take(10)
    return java.time.Instant.ofEpochMilli(ms).atZone(java.time.ZoneId.systemDefault()).toLocalDate().toString()
}

/** buildTemplateSessions: the template's rows anchored to the event's first day (blank times without one). */
fun buildTemplateSessions(t: ScheduleTemplate, e: EventData?): List<ScheduleItem> {
    val base = resolveEventStartDate(e)?.let { runCatching { java.time.LocalDate.parse(it) }.getOrNull() }
    return t.sessions.map { s ->
        if (base == null) ScheduleItem(s.title, "", "", s.type, s.location)
        else { val d = base.plusDays(s.day.toLong()); ScheduleItem(s.title, "${d}T${s.start}", "${d}T${s.end}", s.type, s.location) }
    }
}

// ── Announcements ───────────────────────────────────────────────────────────────────────

@Serializable
data class AudienceFilter(
    val roles: List<String> = listOf("delegate"),
    val committees: List<String> = emptyList(),
    /** Specific people; when set, they replace the role/committee/payment filters. */
    val userIds: List<String> = emptyList(),
    /** all | paid | unpaid */
    val paymentStatus: String = "all",
)

@Serializable
data class AnnRecipient(val uid: String = "", val name: String = "", val email: String = "", val role: String = "")

@Serializable
data class DeliveryStats(@Serializable(with = LenientInt::class) val sent: Int? = 0, @Serializable(with = LenientInt::class) val failed: Int? = 0)

/** events/{e}/announcements/{id} as the organizer sees it (announcementService.Announcement). */
@Serializable
data class OrgAnnouncement(
    val id: String = "",
    val subject: String = "",
    val body: String = "",
    val audience: JsonElement? = null,
    /** draft | scheduled | queued | sending | sent | partial | failed */
    val status: String = "",
    val sentBy: String? = null,
    @Serializable(with = LenientInt::class) val recipientCount: Int? = null,
    @Serializable(with = LenientMillis::class) val scheduledAt: Long? = null,
    @Serializable(with = LenientMillis::class) val createdAt: Long? = null,
    @Serializable(with = LenientMillis::class) val sentAt: Long? = null,
    val deliveryStats: DeliveryStats? = null,
    val recipients: List<AnnRecipient> = emptyList(),
    val errorMessage: String? = null,
)

/** The stored audience as a filter (legacy string audiences: everyone / delegates). */
fun audienceOf(a: OrgAnnouncement): AudienceFilter {
    val o = a.audience as? JsonObject ?: return AudienceFilter(roles = if (a.audience?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() } == "delegates") listOf("delegate") else emptyList())
    fun list(k: String) = (o[k] as? JsonArray)?.mapNotNull { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }.orEmpty()
    return AudienceFilter(list("roles"), list("committees"), list("userIds"), o["paymentStatus"]?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() } ?: "all")
}

/** The composer's role groups. */
val AUDIENCE_ROLES: List<Pair<String, String>> = listOf(
    "delegate" to "Delegates", "chair" to "Chairs & directors", "observer" to "Observers",
    "faculty-advisor" to "Faculty advisors", "staff" to "Staff & team",
)

// The send route's own role keywords (announcements/send ROLE_KEYWORDS), so the count shown is
// who actually gets it.
private val SEND_ROLE_KEYWORDS = mapOf(
    "delegate" to listOf("delegate"),
    "chair" to listOf("chair", "director", "vice-chair"),
    "observer" to listOf("observer"),
    "faculty-advisor" to listOf("faculty advisor", "faculty-advisor"),
    "staff" to listOf("staff", "co-organizer", "usg"),
)

private fun sendRoleMatches(role: String, roles: List<String>): Boolean {
    val lc = role.lowercase()
    return roles.any { r -> SEND_ROLE_KEYWORDS[r]?.any { lc.contains(it) } ?: false }
}

/** The approved participants an audience reaches (route: approved apps, then role → committee → payment). */
fun audienceRecipients(apps: List<ApplicationData>, a: AudienceFilter): List<ApplicationData> {
    val approved = apps.filter { it.status == "approved" && it.userId.isNotEmpty() }
    val hit = if (a.userIds.isNotEmpty()) approved.filter { it.userId in a.userIds }
    else approved
        .filter { a.roles.isEmpty() || sendRoleMatches(it.role, a.roles) }
        .filter { a.committees.isEmpty() || a.committees.any { c -> belongsToCommittee(it, c) } }
        .filter { a.paymentStatus == "all" || (it.paymentStatus == "paid") == (a.paymentStatus == "paid") }
    return hit.distinctBy { it.userId }
}

/** How many approved participants fall in one role group (the audience sheet's counts). */
fun roleCount(apps: List<ApplicationData>, role: String): Int =
    apps.filter { it.status == "approved" && it.userId.isNotEmpty() && sendRoleMatches(it.role, listOf(role)) }.distinctBy { it.userId }.size

/** "Delegates · paid only · 2 committees", or "3 people". */
fun audienceSummary(a: AudienceFilter): String {
    if (a.userIds.isNotEmpty()) return "${a.userIds.size} ${if (a.userIds.size == 1) "person" else "people"}"
    val roles = if (a.roles.isEmpty()) "Everyone" else a.roles.joinToString(", ") { r -> AUDIENCE_ROLES.firstOrNull { it.first == r }?.second ?: r }
    return listOfNotNull(
        roles,
        when (a.paymentStatus) { "paid" -> "paid only"; "unpaid" -> "unpaid only"; else -> null },
        when (a.committees.size) { 0 -> "all committees"; 1 -> a.committees[0]; else -> "${a.committees.size} committees" },
    ).joinToString(" · ")
}

/** Sends to more than this many people need Pro (composer + send route). */
const val FREE_RECIPIENT_LIMIT = 50
