package com.munpro.app.domain

// Committee papers (port of the model in committeeDocService.ts), the chair's verdict on a
// position paper (markingService.ts Marking.paperStatus/feedback), the member roster the web's
// /api/events/{id}/members route returns, and committee-name matching (utils/committee.ts).

import com.munpro.app.data.LenientMillis
import kotlinx.serialization.Serializable

@Serializable
data class CommitteeDoc(
    val id: String = "",
    /** "working-paper" | "draft-resolution" | "amendment" */
    val type: String = "",
    val committee: String = "",
    val title: String = "",
    val content: String = "",
    val sponsors: List<String> = emptyList(),
    val signatories: List<String> = emptyList(),
    val submittedBy: String = "",
    val submittedByName: String = "",
    val submittedCountry: String? = null,
    /** The dais member who wrote it for the delegation (vice-chair delegate power). */
    val proxyBy: String? = null,
    /** "collecting-endorsements" | "submitted" | "approved" | "rejected" */
    val status: String = "",
    val chairNote: String? = null,
    /** Close of the sponsor/signatory consent window, while collecting. */
    @Serializable(with = LenientMillis::class) val endorsementEndsAt: Long? = null,
    @Serializable(with = LenientMillis::class) val createdAt: Long? = null,
    @Serializable(with = LenientMillis::class) val updatedAt: Long? = null,
)

fun committeeDocTypeLabel(t: String): String = when (t) {
    "working-paper" -> "Working Paper"
    "draft-resolution" -> "Draft Resolution"
    "amendment" -> "Amendment"
    else -> t
}

/** The mockup's file badge for a paper type. */
fun committeeDocBadge(t: String): String = when (t) {
    "working-paper" -> "WP"
    "draft-resolution" -> "DR"
    "amendment" -> "AM"
    else -> "DOC"
}

@Serializable
data class PaperMarking(
    val id: String = "",
    /** "review" | "approved" | "revision" | "flagged" */
    val paperStatus: String? = null,
    val feedback: String? = null,
)

@Serializable
data class Member(
    val uid: String = "",
    val name: String = "",
    val role: String = "",
    val committee: String = "",
    val country: String = "",
    val isStaff: Boolean = false,
    val photoURL: String = "",
)

fun normCommittee(name: String?): String = name.orEmpty().trim().lowercase()

fun sameCommittee(a: String?, b: String?): Boolean = normCommittee(a) == normCommittee(b) && normCommittee(a).isNotEmpty()

/** The committee a delegate ACTUALLY sits in (assigned wins; never OR the two). */
fun effectiveCommittee(app: ApplicationData): String =
    app.assignedCommittee?.ifEmpty { null } ?: app.preferredCommittee?.ifEmpty { null } ?: app.choices?.primary?.committee.orEmpty()

fun belongsToCommittee(app: ApplicationData, committeeName: String?): Boolean = sameCommittee(effectiveCommittee(app), committeeName)

fun wordCount(s: String): Int = s.split(Regex("\\s+")).count { it.isNotEmpty() }
