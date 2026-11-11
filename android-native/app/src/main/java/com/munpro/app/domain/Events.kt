package com.munpro.app.domain

// Port of the pure half of src/lib/services/eventService.ts: the event model, the shared
// application timeline (getApplicationTimeline is the single source of truth for "is it open"),
// role pricing, committee helpers. Same names, same order as the TypeScript.

import com.munpro.app.data.LenientDouble
import com.munpro.app.data.LenientInt
import com.munpro.app.data.LenientMillis
import com.munpro.app.data.LenientString
import kotlinx.serialization.Serializable

@Serializable
data class Committee(
    val name: String = "",
    val countries: List<String> = emptyList(),
    @Serializable(with = LenientInt::class) val capacity: Int? = null,
    val chairs: List<String> = emptyList(),
    /** Legacy single value; use [difficulties]. */
    val difficulty: String? = null,
    val difficulties: List<String> = emptyList(),
    val description: String? = null,
    /** Legacy single value; use [agendas]. */
    val topic: String? = null,
    val agendas: List<String> = emptyList(),
)

@Serializable
data class TicketingTier(
    val name: String = "",
    @Serializable(with = LenientDouble::class) val price: Double? = 0.0,
    @Serializable(with = LenientInt::class) val capacity: Int? = 0,
)

@Serializable
data class RoleTier(
    val role: String = "",
    val enabled: Boolean = false,
    @Serializable(with = LenientDouble::class) val price: Double? = 0.0,
    val label: String? = null,
    @Serializable(with = LenientDouble::class) val earlyBirdPrice: Double? = null,
    @Serializable(with = LenientDouble::class) val latePrice: Double? = null,
)

@Serializable
data class Window(val enabled: Boolean = false, val startAt: String? = null, val endAt: String? = null)

@Serializable
data class ApplicationSchedule(
    val earlyBird: Window? = null,
    val lateComer: Window? = null,
    val regularCloseAt: String? = null,
)

@Serializable
data class ScheduleItem(
    val title: String = "",
    val startTime: String = "",
    val endTime: String = "",
    val type: String = "",
    val location: String = "",
    val description: String? = null,
)

/** Handles (instagram, twitter) and page URLs (facebook, linkedin), as the Details page saves them. */
@Serializable
data class SocialMedia(
    val instagram: String? = null,
    val twitter: String? = null,
    val facebook: String? = null,
    val linkedin: String? = null,
)

@Serializable
data class EventData(
    val id: String = "",
    val title: String = "",
    @Serializable(with = LenientString::class) val date: String = "",
    val location: String = "",
    val locationName: String? = null,
    val locationAddress: String? = null,
    /** Coordinates of the place picked from search (CreateEventDialog), absent when typed by hand. */
    @Serializable(with = com.munpro.app.data.LenientDouble::class) val locationLat: Double? = null,
    @Serializable(with = com.munpro.app.data.LenientDouble::class) val locationLng: Double? = null,
    val locationPlaceId: String? = null,
    val format: String = "",
    val description: String = "",
    val committees: List<Committee> = emptyList(),
    val coverUrl: String? = null,
    val schedule: List<ScheduleItem> = emptyList(),
    val organizerId: String? = null,
    val organizerName: String? = null,
    val status: String? = null,
    val ticketingTiers: List<TicketingTier> = emptyList(),
    val roleTiers: List<RoleTier> = emptyList(),
    @Serializable(with = LenientInt::class) val expectedDelegates: Int? = null,
    val targetAudience: String? = null,
    /** Present (any shape) when the organizer set application deadlines: one of the "details" publish checks. */
    val applicationDeadlines: kotlinx.serialization.json.JsonElement? = null,
    val website: String? = null,
    val contactEmail: String? = null,
    val socialMedia: SocialMedia? = null,
    /** The organizer takes public staff applications (Staff page toggle). */
    val allowPublicStaff: Boolean? = null,
    /** Tools › Certificates: diploma | modern | ornate. */
    val certificateTemplate: String? = null,
    /** Tools › Theme: a preset id or a custom "#rrggbb". */
    val theme: String? = null,
    val startDate: String? = null,
    val startTime: String? = null,
    val endDate: String? = null,
    val endTime: String? = null,
    val timeZone: String? = null,
    /** When country assignment closes (Timestamp or string); nothing on the web writes it yet. */
    @Serializable(with = com.munpro.app.data.LenientMillis::class) val assignmentDeadline: Long? = null,
    /** "public" (listed in Browse) | "unlisted" (link only); absent = public. */
    val visibility: String? = null,
    val lastEditedAt: String? = null,
    val applicationSchedule: ApplicationSchedule? = null,
    @Serializable(with = LenientMillis::class) val applicationCloseAt: Long? = null,
    val optionalModules: List<String> = emptyList(),
    @Serializable(with = LenientInt::class) val committeeChoicesAllowed: Int? = null,
    /** The chair's daily rubric (eventService.MarkingTemplate). */
    val markingTemplates: List<MarkingTemplate> = emptyList(),
    val scoringConfig: ScoringConfig? = null,
    /** Plan.kt: written only by the App Admin / server; null = Free. */
    val plan: EventPlan? = null,
    /** Approved participant seats, moved with each approval (seatTx names the application). */
    @Serializable(with = LenientInt::class) val approvedCount: Int? = null,
)

const val TEAM_ROLE = "Team Delegation Lead"

/**
 * The accepted (enabled) role tiers. When an event predates `roleTiers` (legacy `ticketingTiers`
 * only), a single "Delegate" tier is synthesised from the first paid tier.
 */
fun getEnabledRoleTiers(event: EventData?): List<RoleTier> {
    val tiers = event?.roleTiers.orEmpty()
    if (tiers.isNotEmpty()) return tiers.filter { it.enabled }
    val legacy = event?.ticketingTiers.orEmpty()
    if (legacy.isEmpty()) return emptyList()
    val paid = legacy.firstOrNull { (it.price ?: 0.0) > 0 } ?: legacy[0]
    return listOf(RoleTier(role = "Delegate", enabled = true, price = paid.price ?: 0.0))
}

fun getRoleTier(event: EventData?, role: String): RoleTier? = getEnabledRoleTiers(event).firstOrNull { it.role == role }

private const val ONE_DAY_MS = 24L * 60 * 60 * 1000

private fun tsOf(v: String?): Long? = jsDateMs(v)

/** Event start (epoch ms): canonical `date`, falling back to startDate+startTime. null if unknown (NaN on the web). */
fun getEventStartMs(event: EventData?): Long? {
    val fromDate = tsOf(event?.date)
    if (fromDate != null) return fromDate
    if (!event?.startDate.isNullOrEmpty()) {
        return jsDateMs("${event!!.startDate}T${event.startTime?.ifEmpty { null } ?: "00:00"}")
    }
    return null
}

/**
 * Effective hard application close. Late-comer end wins when late is on; else one day before the
 * event when early-bird is on (manual close ignored); else the manual close if set, otherwise one
 * day before the event. null when undeterminable.
 */
fun computeApplicationCloseAt(event: EventData?): Long? {
    val sched = event?.applicationSchedule
    val startMs = getEventStartMs(event)
    val defaultClose = startMs?.minus(ONE_DAY_MS)
    if (sched?.lateComer?.enabled == true) return tsOf(sched.lateComer.endAt) ?: defaultClose
    if (sched?.earlyBird?.enabled == true) return defaultClose
    return tsOf(sched?.regularCloseAt) ?: defaultClose
}

data class ApplicationTimeline(
    val earlyEndAt: Long?,
    val lateStartAt: Long?,
    val lateEndAt: Long?,
    /** null when the event start is unknown and there's no manual close (NaN on the web). */
    val closeAt: Long?,
    val phase: String, // "early" | "regular" | "late" | "closed"
    val isOpen: Boolean,
)

fun getApplicationTimeline(event: EventData?, now: Long = System.currentTimeMillis()): ApplicationTimeline {
    val sched = event?.applicationSchedule
    val earlyOn = sched?.earlyBird?.enabled == true
    val lateOn = earlyOn && sched?.lateComer?.enabled == true // late-comer requires early-bird
    val earlyEndAt = if (earlyOn) tsOf(sched!!.earlyBird!!.endAt) else null
    val lateStartAt = if (lateOn) tsOf(sched!!.lateComer!!.startAt) else null
    val lateEndAt = if (lateOn) tsOf(sched!!.lateComer!!.endAt) else null
    val closeAt = computeApplicationCloseAt(event)

    val phase = when {
        closeAt != null && now > closeAt -> "closed"
        earlyOn && earlyEndAt != null && now <= earlyEndAt -> "early"
        lateOn && lateStartAt != null && lateEndAt != null && now in lateStartAt..lateEndAt -> "late"
        else -> "regular"
    }
    return ApplicationTimeline(earlyEndAt, lateStartAt, lateEndAt, closeAt, phase, phase != "closed")
}

fun isApplicationOpen(event: EventData?, now: Long = System.currentTimeMillis()): Boolean = getApplicationTimeline(event, now).isOpen

private fun rolePriceForPhase(tier: RoleTier, phase: String): Double = when (phase) {
    "early" -> maxOf(0.0, tier.earlyBirdPrice ?: tier.price ?: 0.0)
    "late" -> maxOf(0.0, tier.latePrice ?: tier.price ?: 0.0)
    else -> maxOf(0.0, tier.price ?: 0.0)
}

data class UnitPrice(val price: Double, val phase: String)

fun getEffectiveRoleUnitPrice(event: EventData?, tier: RoleTier, now: Long = System.currentTimeMillis()): UnitPrice {
    val phase = getApplicationTimeline(event, now).phase
    val p = when (phase) { "early" -> "early"; "late" -> "late"; else -> "regular" }
    return UnitPrice(rolePriceForPhase(tier, p), p)
}

/** Per-person price for a role; team roles multiply by member count. 0 when free/not found. */
fun getRolePrice(event: EventData?, role: String, teamSize: Int = 1, now: Long = System.currentTimeMillis()): Double {
    val tier = getRoleTier(event, role) ?: return 0.0
    val price = getEffectiveRoleUnitPrice(event, tier, now).price
    val multiplier = if (role == TEAM_ROLE) maxOf(1, teamSize) else 1
    return price * multiplier
}

data class RolePriceInfo(val unitPrice: Double, val phase: String, val tier: RoleTier?)

fun getRolePriceInfo(event: EventData?, role: String, now: Long = System.currentTimeMillis()): RolePriceInfo {
    val tier = getRoleTier(event, role) ?: return RolePriceInfo(0.0, "regular", null)
    val (price, phase) = getEffectiveRoleUnitPrice(event, tier, now)
    return RolePriceInfo(price, phase, tier)
}

/** How many committees an applicant may rank: default 1, clamped to [1, number of committees]. */
fun getCommitteeChoicesAllowed(event: EventData?): Int {
    val count = event?.committees?.size ?: 0
    if (count <= 0) return 1
    val raw = (event?.committeeChoicesAllowed ?: 1).coerceAtLeast(1)
    return minOf(raw, count)
}

fun getEventCapacity(event: EventData?): Int = event?.committees.orEmpty().sumOf { it.capacity ?: 0 }

fun getCommitteeAgendas(c: Committee): List<String> =
    c.agendas.ifEmpty { if (!c.topic.isNullOrEmpty()) listOf(c.topic) else emptyList() }

fun getCommitteeDifficulties(c: Committee): List<String> =
    c.difficulties.ifEmpty { if (!c.difficulty.isNullOrEmpty()) listOf(c.difficulty) else emptyList() }
