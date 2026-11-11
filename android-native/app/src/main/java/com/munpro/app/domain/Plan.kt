package com.munpro.app.domain

// Port of src/lib/data/eventPlan.ts: an event's plan (Free / Pro / custom) and the seats its
// participant cap counts. `event.plan` is written only by the App Admin or the server; an event
// without one is Free, capped by the admin's numbers in systemSettings/global.

import com.munpro.app.data.LenientDouble
import com.munpro.app.data.LenientInt
import com.munpro.app.data.LenientMillis
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull

@Serializable
data class EventPlan(
    val tier: String = "free",
    val source: String? = null,
    /** Kept raw: a missing key means "the plan's default", an explicit null means unlimited. */
    val limits: JsonObject? = null,
    val features: Map<String, Boolean> = emptyMap(),
    @Serializable(with = LenientDouble::class) val feePercent: Double? = null,
    @Serializable(with = LenientDouble::class) val paidAmount: Double? = null,
    val requestId: String? = null,
)

/** systemSettings/global's plan numbers (PlanSettings on the web). */
@Serializable
data class PlanSettings(
    @Serializable(with = LenientDouble::class) val platformFeePercent: Double? = null,
    @Serializable(with = LenientDouble::class) val proFeePercent: Double? = null,
    @Serializable(with = LenientDouble::class) val proEventPrice: Double? = null,
    @Serializable(with = LenientInt::class) val freeParticipantCap: Int? = null,
    @Serializable(with = LenientInt::class) val freeCommitteeCap: Int? = null,
    @Serializable(with = LenientInt::class) val freeEventCap: Int? = null,
    @Serializable(with = LenientInt::class) val freeAiDailyQuota: Int? = null,
    val paymentMode: String? = null,
    /** Admin → Settings → Maintenance: everyone but the App Admin sees a notice. */
    val maintenanceMode: Boolean? = null,
    val maintenanceMessage: String? = null,
) {
    val fee get() = platformFeePercent ?: 7.0
    val proFee get() = proFeePercent ?: 3.0
    val proPrice get() = proEventPrice ?: 49.0
    val participantCap get() = freeParticipantCap ?: 50
    val committeeCap get() = freeCommitteeCap ?: 5
    val eventCap get() = freeEventCap ?: 2
    val aiQuota get() = freeAiDailyQuota ?: 10
}

const val FEATURE_VIDEO = "video"
const val FEATURE_AI = "ai"
const val FEATURE_BULK_EMAIL = "bulkEmail"
const val FEATURE_ORNATE = "ornate"
const val FEATURE_CUSTOM_THEME = "customTheme"
const val FEATURE_PASSES = "passes"

val PLAN_FEATURES = listOf(
    FEATURE_VIDEO to "Live video in sessions and ceremonies",
    FEATURE_AI to "AI without the daily limit",
    FEATURE_BULK_EMAIL to "Emails to more than 50 people",
    FEATURE_ORNATE to "Ornate Gold certificate",
    FEATURE_CUSTOM_THEME to "Custom theme colour",
    FEATURE_PASSES to "QR coupons, check-in and transport scans",
)

data class ResolvedPlan(
    val tier: String,
    val source: String?,
    /** null = unlimited. */
    val participants: Int?,
    val committees: Int?,
    val features: Map<String, Boolean>,
    val feePercent: Double,
) {
    val isPro get() = tier != "free"
    fun has(feature: String) = features[feature] == true
    val label get() = when (tier) {
        "pro" -> "Pro"
        "custom" -> if (source == "legacy") "Pro (early event)" else "Pro (approved)"
        else -> "Free"
    }
}

/** resolvePlan: the event's stored plan over the admin's defaults. */
fun resolvePlan(event: EventData?, settings: PlanSettings?): ResolvedPlan {
    val s = settings ?: PlanSettings()
    val p = event?.plan
    val tier = if (p?.tier == "pro" || p?.tier == "custom") p.tier else "free"
    fun limit(key: String, freeDefault: Int): Int? = when (val v: JsonElement? = p?.limits?.get(key)) {
        null -> if (tier == "free") freeDefault else null
        is JsonNull -> null
        is JsonPrimitive -> v.doubleOrNull?.toInt() ?: if (tier == "free") freeDefault else null
        else -> null
    }
    val features = if (tier == "pro") PLAN_FEATURES.associate { it.first to true }
    else PLAN_FEATURES.associate { (k, _) -> k to (p?.features?.get(k) == true) }
    return ResolvedPlan(
        tier = tier,
        source = p?.source,
        participants = limit("participants", s.participantCap),
        committees = limit("committees", s.committeeCap),
        features = features,
        feePercent = (p?.feePercent ?: if (tier == "free") s.fee else s.proFee).coerceIn(0.0, 100.0),
    )
}

/** One event day for check-in and rides: key `d1`, label "Day 1", and its date when known. */
data class EventDay(val key: String, val label: String, val date: java.time.LocalDate?)

/** "Day 1"… from the start to the end date (1 to 7), or two days when unknown (web eventDays). */
fun eventDays(e: EventData?): List<EventDay> {
    val start = getEventStartMs(e)?.let { java.time.Instant.ofEpochMilli(it).atZone(e?.timeZone?.let { z -> runCatching { java.time.ZoneId.of(z) }.getOrNull() } ?: java.time.ZoneId.systemDefault()).toLocalDate() }
    val end = e?.endDate?.let { runCatching { java.time.LocalDate.parse(it.take(10)) }.getOrNull() }
    val n = if (start != null && end != null && !end.isBefore(start)) (java.time.temporal.ChronoUnit.DAYS.between(start, end) + 1).toInt().coerceIn(1, 7) else 2
    return (1..n).map { EventDay("d$it", "Day $it", start?.plusDays(it - 1L)) }
}

/** QR passes are in use at an event: meals or transport are on, or its plan includes coupons. */
fun passesInUse(e: EventData?): Boolean =
    e != null && ("food" in e.optionalModules || "transport" in e.optionalModules || resolvePlan(e, null).has(FEATURE_PASSES))

private val STAFF_APP_ROLES = listOf("staff", "co-organizer", "usg", "chair", "director", "vice-chair")

/** An approved application that isn't a staff role holds a participant seat. */
fun takesSeat(role: String, status: String): Boolean =
    status == "approved" && STAFF_APP_ROLES.none { role.lowercase().contains(it) }

fun seatDelta(prevRole: String, prevStatus: String, nextRole: String, nextStatus: String): Int =
    (if (takesSeat(nextRole, nextStatus)) 1 else 0) - (if (takesSeat(prevRole, prevStatus)) 1 else 0)

/** Room left under the participant cap; null = unlimited. */
fun seatsLeft(event: EventData?, settings: PlanSettings?): Int? =
    resolvePlan(event, settings).participants?.let { (it - (event?.approvedCount ?: 0)).coerceAtLeast(0) }

/** upgradeRequests/{id}: Pro for an event, or more Free room. */
@Serializable
data class UpgradeRequest(
    val id: String = "",
    val eventId: String = "",
    val eventTitle: String? = null,
    val organizerId: String = "",
    val kind: String = "pro",
    val wanted: Map<String, Int> = emptyMap(),
    val orgName: String? = null,
    val website: String? = null,
    val message: String = "",
    val status: String = "pending",
    val adminNote: String? = null,
    @Serializable(with = LenientMillis::class) val createdAt: Long? = null,
)

