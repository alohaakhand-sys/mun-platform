package com.munpro.app.domain

// Port of the model and pure helpers of src/lib/services/applicationService.ts, plus the
// delegate-side readings mobile/src/lib/conferences.tsx makes (committeeOf, isAllocated).

import com.munpro.app.data.LenientDouble
import com.munpro.app.data.LenientInt
import com.munpro.app.data.LenientMillis
import kotlinx.serialization.Serializable

@Serializable
data class ApplicationChoice(val committee: String = "", val country: String = "")

@Serializable
data class Choices(
    val primary: ApplicationChoice = ApplicationChoice(),
    val secondary: ApplicationChoice = ApplicationChoice(),
    val tertiary: ApplicationChoice = ApplicationChoice(),
)

@Serializable
data class CommitteePreference(val committee: String = "", val countries: List<String> = emptyList())

@Serializable
data class ApplicationData(
    val id: String = "",
    val eventId: String = "",
    val userId: String = "",
    val applicantName: String? = null,
    val applicantEmail: String? = null,
    val role: String = "",
    val committeePreferences: List<CommitteePreference> = emptyList(),
    val preferredCommittee: String? = null,
    val countryPreferences: List<String>? = null,
    val choices: Choices? = null,
    val experience: String = "",
    val motivation: String = "",
    val status: String = "",
    val paymentStatus: String? = null,
    @Serializable(with = LenientDouble::class) val paidAmount: Double? = null,
    @Serializable(with = LenientMillis::class) val paidAt: Long? = null,
    /** "stripe" | "zinipay" | "dev", and the wallet ZiniPay reports (settle.ts). */
    val paymentProvider: String? = null,
    val paymentMethod: String? = null,
    val tierName: String? = null,
    val assignedCommittee: String? = null,
    val assignedCountry: String? = null,
    @Serializable(with = LenientMillis::class) val createdAt: Long? = null,
    @Serializable(with = LenientMillis::class) val updatedAt: Long? = null,
    @Serializable(with = LenientInt::class) val teamSize: Int? = null,
    /** A team delegation (submitTeamApplication): every member's delegationId is the head's application id. */
    /** The institution the applicant named: a faculty advisor's delegates share it. */
    val institutionName: String? = null,
    val institution: String? = null,
    val delegationId: String? = null,
    val delegationName: String? = null,
    val teamApplicationParentId: String? = null,
    // Position paper (written by the web's PositionPaperUpload.tsx).
    val positionPaperContent: String? = null,
    val positionPaperUrl: String? = null,
    val positionPaperFormat: String? = null,
    @Serializable(with = LenientMillis::class) val positionPaperUpdatedAt: Long? = null,
    /**
     * Not a Firestore field: set by ApplicationRepo when an accepted staff seat made (or took
     * over) this entry. A staff seat is reached through Today's "Sessions", never as a
     * watch-only applicant.
     */
    val fromStaffSeat: Boolean = false,
)

/** The legacy 3-choice `choices` object from one committee + ranked countries. */
fun buildLegacyChoices(committee: String, countries: List<String>): Choices {
    fun slot(i: Int) = ApplicationChoice(committee, countries.getOrNull(i).orEmpty())
    return Choices(slot(0), slot(1), slot(2))
}

data class AppPreferences(val committee: String, val countries: List<String>)

fun getAppPreferences(app: ApplicationData): AppPreferences {
    if (app.preferredCommittee != null || app.countryPreferences != null) {
        return AppPreferences(app.preferredCommittee.orEmpty(), app.countryPreferences.orEmpty().filter { it.isNotEmpty() })
    }
    val c = app.choices ?: return AppPreferences("", emptyList())
    val committee = c.primary.committee
    val countries = listOf(c.primary, c.secondary, c.tertiary)
        .filter { it.country.isNotEmpty() && (committee.isEmpty() || it.committee == committee) }
        .map { it.country }
    return AppPreferences(committee, countries)
}

fun getAppCommitteePreferences(app: ApplicationData): List<CommitteePreference> {
    if (app.committeePreferences.isNotEmpty()) {
        return app.committeePreferences
            .filter { it.committee.isNotEmpty() }
            .map { CommitteePreference(it.committee, it.countries.filter { c -> c.isNotEmpty() }) }
    }
    val single = getAppPreferences(app)
    return if (single.committee.isNotEmpty()) listOf(CommitteePreference(single.committee, single.countries)) else emptyList()
}

/**
 * A delegate's committee, read the way the web portal reads it. Allocation writes only
 * `assignedCountry`; the committee is the one they applied to (`choices.primary`), unless staff
 * were assigned one directly (`assignedCommittee`).
 */
fun committeeOf(app: ApplicationData): String =
    app.assignedCommittee?.ifEmpty { null }
        ?: app.choices?.primary?.committee?.ifEmpty { null }
        ?: app.preferredCommittee.orEmpty()

/** An application joined with its event: one of the delegate's conferences. */
@Serializable
data class Conference(val app: ApplicationData, val event: EventData)

fun isAllocated(c: Conference): Boolean =
    c.app.status == "approved" && !c.app.assignedCountry.isNullOrEmpty() && committeeOf(c.app).isNotEmpty()

/** A delegate application debates; any other approved role (observer, press, faculty advisor) watches. */
fun isDelegateApp(app: ApplicationData): Boolean = Regex("delegate", RegexOption.IGNORE_CASE).containsMatchIn(app.role)

/**
 * Approved, placed in a committee, but not as a delegate: the web's watch-only console (every
 * floor action is a write the rules accept from a seated delegate alone).
 */
fun watchesOnly(c: Conference): Boolean =
    c.app.status == "approved" && !c.app.fromStaffSeat && !isDelegateApp(c.app) && committeeOf(c.app).isNotEmpty()

/** By application id (the app's own links) or event id (links from the website). */
fun findConference(list: List<Conference>?, id: String): Conference? =
    list?.firstOrNull { it.app.id == id } ?: list?.firstOrNull { it.event.id == id }
