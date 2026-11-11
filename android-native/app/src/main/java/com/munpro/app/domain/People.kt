package com.munpro.app.domain

// Someone else's profile and the reputation around it (board A2; web userService UserProfile,
// PublicProfileView, reputationService). Field names are the web's.

import com.munpro.app.data.LenientInt
import com.munpro.app.data.LenientMillis
import kotlinx.serialization.Serializable

@Serializable
data class ExperienceEntry(
    val id: String = "",
    val org: String = "",
    val orgShort: String? = null,
    val roleTitle: String = "",
    val location: String? = null,
    val startDate: String = "",
    val endDate: String? = null,
    val current: Boolean = false,
    val description: String? = null,
)

@Serializable
data class EducationEntry(
    val id: String = "",
    val school: String = "",
    val degree: String? = null,
    val field: String? = null,
    val startYear: String? = null,
    val endYear: String? = null,
    val activities: String? = null,
)

@Serializable
data class AwardEntry(val id: String = "", val title: String = "", val issuer: String? = null, val date: String? = null)

@Serializable
data class PrivacySettings(
    val showProfile: Boolean? = null,
    val showApplicationHistory: Boolean? = null,
    val showStats: Boolean? = null,
    /** "connections" = only active connections may read your email and phone; else everyone. */
    val contactVisibility: String? = null,
)

@Serializable
data class PublicStats(
    @Serializable(with = LenientInt::class) val conferences: Int? = 0,
    @Serializable(with = LenientInt::class) val blogs: Int? = 0,
    @Serializable(with = LenientInt::class) val awards: Int? = 0,
)

/** users/{uid} as another member sees it. */
@Serializable
data class PublicProfile(
    val id: String = "",
    val displayName: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val email: String? = null,
    val role: String? = null,
    val photoURL: String? = null,
    val institution: String? = null,
    val headline: String? = null,
    val bio: String? = null,
    val city: String? = null,
    val country: String? = null,
    val nationality: String? = null,
    val phoneNumber: String? = null,
    val instagram: String? = null,
    val linkedin: String? = null,
    val tiktok: String? = null,
    val openToWork: Boolean = false,
    val openToRoles: String? = null,
    val skills: List<String> = emptyList(),
    val experience: List<ExperienceEntry> = emptyList(),
    val education: List<EducationEntry> = emptyList(),
    val awards: List<AwardEntry> = emptyList(),
    val ratingSum: Double? = null,
    @Serializable(with = LenientInt::class) val ratingCount: Int? = null,
    val endorsementCounts: Map<String, Double> = emptyMap(),
    val privacySettings: PrivacySettings? = null,
    val publicStats: PublicStats? = null,
    val proStatus: String? = null,
    /** Server-set once they own a Pro event (Plan.kt). */
    val verifiedOrganizer: Boolean? = null,
    val isAdmin: Boolean? = null,
    val coverURL: String? = null,
    // The owner's own fields (Settings → Profile on the web); other members never see an editor for them.
    val interests: List<String> = emptyList(),
    val dob: String? = null,
    val diet: String? = null,
    val occupation: String? = null,
    val fieldOfStudy: String? = null,
    val invoiceType: String? = null,
    val street: String? = null,
    val postalCode: String? = null,
    val state: String? = null,
) {
    /** deriveName (web network page): never a raw email as a name. */
    val name: String
        get() {
            val dn = displayName.orEmpty().trim()
            if (dn.isNotEmpty() && "@" !in dn) return dn
            val fl = "${firstName.orEmpty()} ${lastName.orEmpty()}".trim()
            if (fl.isNotEmpty()) return fl
            if (dn.isNotEmpty()) return dn
            return email?.substringBefore("@")?.ifEmpty { null } ?: "Member"
        }

    val roleLabel: String get() = memberRole(role)

    val ratingAvg: Double get() = if ((ratingCount ?: 0) > 0) (ratingSum ?: 0.0) / ratingCount!! else 0.0

    val isAdminAccount: Boolean get() = isAdmin == true || role.equals("admin", true) || role.equals("app admin", true)
}

/**
 * users/{uid}/private/contact: a member's email and phone, kept off the profile doc so the rules
 * can enforce their privacySettings.contactVisibility ("everyone" by default, or "connections").
 */
@Serializable
data class UserContact(val email: String? = null, val phoneNumber: String? = null)

/** users/{uid}/blocks/{blockedUid}, with the name the app could find for it. */
data class BlockedPerson(val uid: String, val name: String, val blockedAt: Long?)

@Serializable
data class Recommendation(
    val id: String = "",
    val authorUid: String = "",
    val authorName: String = "",
    val authorPhotoURL: String? = null,
    val authorHeadline: String? = null,
    val toUid: String = "",
    val relationship: String? = null,
    val body: String = "",
    val status: String = "",
    @Serializable(with = LenientMillis::class) val createdAt: Long? = null,
)

/** One listed skill: how many endorsed it, the first few who did, and whether I have. */
data class SkillState(val skill: String, val slug: String, val count: Int, val endorsers: List<String>, val mine: Boolean)

/** Mirror of the server slug (reputationService.slugifySkill). */
fun slugifySkill(s: String): String = s.trim().lowercase().replace(Regex("[^a-z0-9]+"), "-").trim('-')

/** resultService AWARD_LABEL. */
fun awardLabel(type: String): String = when (type) {
    "best_delegate" -> "Best Delegate"
    "outstanding" -> "Outstanding Delegate"
    "honorable" -> "Honorable Mention"
    "verbal_mention" -> "Verbal Mention"
    else -> "Participant"
}

/** "user" is the role every account starts with; the web shows it, and no role, as Delegate. */
fun memberRole(role: String?): String =
    role?.takeIf { it.isNotBlank() && !it.equals("user", true) }?.replaceFirstChar { it.uppercase() } ?: "Delegate"
