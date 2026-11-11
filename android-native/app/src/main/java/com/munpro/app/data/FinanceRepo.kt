package com.munpro.app.data

// Board C6 · Financials and Pro: the same documents the web's financials pages write.
// - event.roleTiers + applicationSchedule + applicationCloseAt (RolesTiersSection's one save),
// - the money: each application's paid amount, less the event plan's platform fee,
// - payoutRequests (the organizer's own), systemSettings/global's plan numbers,
// - upgradeRequests (Pro for an event, or more Free room) and the Pro checkout.

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.munpro.app.AppGraph
import com.munpro.app.domain.ApplicationData
import com.munpro.app.domain.ApplicationSchedule
import com.munpro.app.domain.EventData
import com.munpro.app.domain.PlanSettings
import com.munpro.app.domain.RoleTier
import com.munpro.app.domain.UpgradeRequest
import com.munpro.app.domain.computeApplicationCloseAt
import com.munpro.app.domain.getRolePrice
import com.munpro.app.domain.resolvePlan
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

@Serializable
data class Payout(
    val id: String = "",
    @Serializable(with = LenientDouble::class) val amount: Double? = 0.0,
    val status: String = "pending",
    val note: String? = null,
    @Serializable(with = LenientMillis::class) val requestedAt: Long? = null,
    @Serializable(with = LenientMillis::class) val processedAt: Long? = null,
)

/** One application's line in the money: what it's worth and where it stands. */
@Serializable
data class PaymentRow(val app: ApplicationData, val amount: Double, val status: String /* paid | pending | refunded */)

@Serializable
data class EventMoney(
    val event: EventData,
    val rows: List<PaymentRow>,
    val revenue: Double,
    val feePercent: Double,
) {
    val fee get() = revenue * feePercent / 100.0
    val net get() = revenue - fee
    val pending get() = rows.filter { it.status == "pending" }.sumOf { it.amount }
}

@Serializable
data class Wallet(val events: List<EventMoney>, val payouts: List<Payout>) {
    val earned get() = events.sumOf { it.net }
    val gross get() = events.sumOf { it.revenue }
    val fees get() = events.sumOf { it.fee }
    /** Pending and paid payouts are spoken for (the web's reservedPayouts). */
    val reserved get() = payouts.filter { it.status == "pending" || it.status == "paid" }.sumOf { it.amount ?: 0.0 }
    val available get() = (earned - reserved).coerceAtLeast(0.0)
}

class FinanceRepo {
    private val db = FirebaseFirestore.getInstance()
    private fun event(id: String) = db.collection("events").document(id)

    suspend fun settings(): PlanSettings =
        db.collection("systemSettings").document("global").get().await().decode<PlanSettings>() ?: PlanSettings()

    // ── Roles, tickets and the shared schedule ──────────────────────────────────────────

    /** RolesTiersSection.save: roles carry prices only; phase timing lives on the schedule. */
    suspend fun saveRoles(e: EventData, tiers: List<RoleTier>, schedule: ApplicationSchedule) {
        val earlyOn = schedule.earlyBird?.enabled == true
        val lateOn = earlyOn && schedule.lateComer?.enabled == true
        val cleaned = tiers.map { t ->
            buildMap<String, Any> {
                put("role", t.role); put("enabled", t.enabled); put("price", maxOf(0.0, t.price ?: 0.0))
                t.label?.trim()?.takeIf { it.isNotEmpty() }?.let { put("label", it) }
                if (earlyOn) t.earlyBirdPrice?.let { put("earlyBirdPrice", maxOf(0.0, it)) }
                if (lateOn) t.latePrice?.let { put("latePrice", maxOf(0.0, it)) }
            }
        }
        val sched = buildMap<String, Any> {
            schedule.earlyBird?.takeIf { it.enabled && !it.endAt.isNullOrEmpty() }?.let { put("earlyBird", mapOf("enabled" to true, "endAt" to it.endAt)) }
            schedule.lateComer?.takeIf { earlyOn && it.enabled && !it.startAt.isNullOrEmpty() && !it.endAt.isNullOrEmpty() }
                ?.let { put("lateComer", mapOf("enabled" to true, "startAt" to it.startAt, "endAt" to it.endAt)) }
            if (!earlyOn && !(schedule.lateComer?.enabled == true)) schedule.regularCloseAt?.takeIf { it.isNotEmpty() }?.let { put("regularCloseAt", it) }
        }
        val closeAt = computeApplicationCloseAt(e.copy(applicationSchedule = normalized(schedule)))
        event(e.id).update(mapOf(
            "roleTiers" to cleaned, "applicationSchedule" to sched, "applicationCloseAt" to closeAt,
            "updatedAt" to java.time.Instant.now().toString(),
        )).await()
    }

    /** The schedule as it will be stored (toSchedule on the web). */
    fun normalized(s: ApplicationSchedule): ApplicationSchedule {
        val earlyOn = s.earlyBird?.enabled == true && !s.earlyBird.endAt.isNullOrEmpty()
        val lateOn = s.earlyBird?.enabled == true && s.lateComer?.enabled == true && !s.lateComer.startAt.isNullOrEmpty() && !s.lateComer.endAt.isNullOrEmpty()
        return ApplicationSchedule(
            earlyBird = if (earlyOn) s.earlyBird else null,
            lateComer = if (lateOn) s.lateComer else null,
            regularCloseAt = if (s.earlyBird?.enabled != true && s.lateComer?.enabled != true) s.regularCloseAt?.ifEmpty { null } else null,
        )
    }

    // ── Money ───────────────────────────────────────────────────────────────────────────

    /** The financials page's payments: live applications, and rejected ones only if money moved. */
    fun money(e: EventData, apps: List<ApplicationData>, settings: PlanSettings): EventMoney {
        val rows = apps.filter { a ->
            when {
                a.paymentStatus == "paid" || a.paymentStatus == "refunded" -> true
                a.status == "rejected" || a.status == "withdrawn" -> false
                else -> a.status == "approved" || a.status == "pending" || !a.paymentStatus.isNullOrEmpty()
            }
        }.map { a ->
            val amount = a.paidAmount ?: getRolePrice(e, a.role, a.teamSize ?: 1)
            PaymentRow(a, amount, when (a.paymentStatus) { "paid" -> "paid"; "refunded" -> "refunded"; else -> "pending" })
        }
        return EventMoney(e, rows, rows.filter { it.status == "paid" }.sumOf { it.amount }, resolvePlan(e, settings).feePercent)
    }

    suspend fun eventMoney(e: EventData): EventMoney = coroutineScope {
        val s = async { settings() }
        val apps = async { AppGraph.allocation.applications(e.id) }
        money(e, apps.await(), s.await())
    }

    /** The organizer-wide wallet: every owned event's paid revenue less its fee, minus payouts. */
    suspend fun wallet(uid: String): Wallet = coroutineScope {
        val s = async { settings() }
        val payouts = async { payouts(uid) }
        val owned = db.collection("events").whereEqualTo("organizerId", uid).get().await().documents.mapNotNull { it.decode<EventData>() }
        val settings = s.await()
        val events = owned.map { e -> async { money(e, AppGraph.allocation.applications(e.id), settings) } }.awaitAll()
        Wallet(events.filter { it.rows.isNotEmpty() }.sortedByDescending { it.revenue }, payouts.await())
    }

    suspend fun payouts(uid: String): List<Payout> =
        db.collection("payoutRequests").whereEqualTo("organizerId", uid).orderBy("requestedAt", Query.Direction.DESCENDING)
            .get().await().documents.mapNotNull { it.decode<Payout>() }

    /** createPayoutRequest. */
    suspend fun requestPayout(amount: Double) {
        val u = AppGraph.auth.user ?: error("Not signed in.")
        val p = AppGraph.auth.profile
        db.collection("payoutRequests").add(mapOf(
            "organizerId" to u.uid,
            "organizerName" to (p?.fullName?.ifBlank { null } ?: p?.displayName?.ifBlank { null } ?: u.email ?: "Organizer"),
            "organizerEmail" to (u.email ?: ""),
            "amount" to amount, "note" to "", "status" to "pending", "requestedAt" to FieldValue.serverTimestamp(),
        )).await()
    }

    // ── Plans: upgrade requests and the Pro checkout ────────────────────────────────────

    /** freeEventsInUse: published, unfinished Free events (not [exceptId]) and the owner's cap. */
    suspend fun freeEventsInUse(uid: String, exceptId: String): Pair<Int, Int> = coroutineScope {
        val s = async { settings() }
        val me = async { db.collection("users").document(uid).get().await() }
        val events = db.collection("events").whereEqualTo("organizerId", uid).get().await().documents.mapNotNull { it.decode<EventData>() }
        val settings = s.await()
        val today = java.time.LocalDate.now().toString()
        val used = events.count { e ->
            e.id != exceptId && e.status == "published" && !resolvePlan(e, settings).isPro && (e.endDate?.ifEmpty { null } ?: e.date).take(10) >= today
        }
        val override = (me.await().get("planOverrides") as? Map<*, *>)?.get("freeEvents") as? Number
        used to (override?.toInt() ?: settings.eventCap)
    }

    suspend fun upgradeRequests(eventId: String, uid: String): List<UpgradeRequest> =
        db.collection("upgradeRequests").whereEqualTo("organizerId", uid).whereEqualTo("eventId", eventId).get().await()
            .documents.mapNotNull { it.decode<UpgradeRequest>() }.sortedByDescending { it.createdAt ?: 0 }

    suspend fun requestUpgrade(e: EventData, kind: String, message: String, orgName: String, website: String, wanted: Map<String, Int>) {
        val u = AppGraph.auth.user ?: error("Not signed in.")
        val p = AppGraph.auth.profile
        db.collection("upgradeRequests").add(buildMap<String, Any> {
            put("eventId", e.id); put("eventTitle", e.title); put("organizerId", u.uid)
            put("organizerName", p?.fullName?.ifBlank { null } ?: u.email ?: "Organizer")
            put("kind", kind); put("message", message.trim()); put("status", "pending")
            orgName.trim().takeIf { it.isNotEmpty() }?.let { put("orgName", it) }
            website.trim().takeIf { it.isNotEmpty() }?.let { put("website", it) }
            if (wanted.isNotEmpty()) put("wanted", wanted)
            put("createdAt", FieldValue.serverTimestamp())
        }).await()
    }

    /** /api/pro/verify: "paid" once the event is Pro. */
    suspend fun verifyPro(eventId: String): String? {
        val r = Api.call("/api/pro/verify", "POST", buildJsonObject { put("eventId", eventId) }.toString()) as? kotlinx.serialization.json.JsonObject
        return runCatching { r?.get("status")?.jsonPrimitive?.content }.getOrNull()
    }

    /** /api/pro/checkout: the gateway's page to pay for this event's Pro, opened in the browser. */
    suspend fun proCheckout(eventId: String): String {
        val r = Api.send("/api/pro/checkout", "POST", buildJsonObject { put("eventId", eventId); put("returnTo", "app") }.toString())
        val url = runCatching { (r.body as? kotlinx.serialization.json.JsonObject)?.get("url")?.jsonPrimitive?.content }.getOrNull()
        return if (r.ok && !url.isNullOrEmpty()) url else error(r.error ?: "Couldn't start the checkout.")
    }
}
