package com.munpro.app.data

// Optional modules, results and the certificate (board B3; web optionalModulesService.ts,
// markingService.ts, standingsService.ts, resultService.ts). Same documents, same writes:
// - food slots, transport routes, accommodation blocks and the dress code are the organizer's;
// - a delegate registers for one route (its application id on registeredDelegates) and requests
//   one room (accommodationRequests, status "pending" until the organizer decides);
// - results read the delegate's own markings (daily and the final rollup), the committee board
//   the chair published, and the organizer-approved award.
// Route registration runs in a transaction, so two delegates can't both take the last seat.

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.munpro.app.domain.DailyMarking
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.serializer

/** Who may claim a coupon with their pass (web passAudience.ts): groups, plus named uids. */
@Serializable
data class PassAudience(val groups: List<String> = emptyList(), val uids: List<String> = emptyList())

@Serializable
data class FoodSlot(
    val id: String = "", val mealName: String = "", val timeWindow: String = "", val venue: String = "", val day: String = "",
    /** Missing = approved applicants (DEFAULT_MEAL_AUDIENCE). */
    val audience: PassAudience? = null,
    @Serializable(with = LenientInt::class) val usesPerPerson: Int? = null,
)

/** Who the personal pass belongs to, as the server resolved it (members marker + profile). */
@Serializable
data class PassHolder(val uid: String = "", val name: String = "", val role: String = "", val committee: String = "", val kind: String = "")

/** The signed personal QR pass (setup/qr-passes-plan.md): one code for meals, coupons, check-in, rides. */
@Serializable
data class MyPass(val code: String = "", val version: Int = 0, val holder: PassHolder = PassHolder())

/** An organizer's custom coupon (events/{e}/coupons; Pro: plan feature `passes`). */
@Serializable
data class Coupon(
    val id: String = "", val title: String = "", val note: String = "", val kind: String = "kit",
    val day: String = "", val timeWindow: String = "", val venue: String = "",
    val audience: PassAudience = PassAudience(listOf("delegate")),
    @Serializable(with = LenientInt::class) val usesPerPerson: Int? = 1,
    val active: Boolean = true,
)

/** A scan's answer (/api/passes/scan): ok | already_used | not_eligible | outside_window | invalid | wrong_event | replaced. */
@Serializable
data class ScanHolder(val uid: String = "", val name: String = "", val photoUrl: String = "", val role: String = "", val committee: String = "", val kind: String = "")

@Serializable
data class ScanOutcome(
    val result: String = "",
    val holder: ScanHolder? = null,
    val target: ScanTargetInfo? = null,
    @Serializable(with = LenientInt::class) val remaining: Int? = null,
    val usedAt: Long? = null,
    val usedBy: String? = null,
    val window: String? = null,
    val reason: String? = null,
    val otherEvent: String? = null,
    val redemptionId: String? = null,
    val at: Long? = null,
)

@Serializable
data class ScanTargetInfo(val title: String = "", @Serializable(with = LenientInt::class) val uses: Int? = null)

@Serializable
data class LookupItem(val target: String = "", val title: String = "", @Serializable(with = LenientInt::class) val uses: Int? = null, @Serializable(with = LenientInt::class) val used: Int? = null, val lastAt: Long? = null)

@Serializable
data class LookupOutcome(val result: String = "", val holder: ScanHolder? = null, val items: List<LookupItem> = emptyList(), val reason: String? = null)

@Serializable
data class PassPerson(val uid: String = "", val name: String = "", val role: String = "", val committee: String = "", val country: String? = null)

@Serializable
data class ClaimRow(val target: String = "", val title: String = "", val window: String = "", @Serializable(with = LenientInt::class) val claimed: Int? = null, @Serializable(with = LenientInt::class) val eligible: Int? = null)

@Serializable
data class ClaimLine(
    val uid: String = "", val name: String = "", val role: String = "", val committee: String = "",
    @Serializable(with = LenientInt::class) val count: Int? = 0, val lastAt: Long? = null, val lastBy: String = "",
    val manual: Boolean = false, val override: Boolean = false, @Serializable(with = LenientInt::class) val undone: Int? = 0,
)

@Serializable
data class ClaimDetail(val target: ScanTargetInfo = ScanTargetInfo(), val claimed: List<ClaimLine> = emptyList(), val notYet: List<ClaimLine> = emptyList())

/** What the signed-in member already claimed with their pass: target → (count, last time). */
data class MyPassUse(val kind: String?, val role: String?, val used: Map<String, Pair<Int, Long?>>, val applicationId: String? = null)

@Serializable
data class TransportRoute(
    val id: String = "",
    val routeName: String = "",
    val pickupPoint: String = "",
    val dropoffPoint: String = "",
    val departureTime: String = "",
    val returnTime: String = "",
    @Serializable(with = LenientInt::class) val capacity: Int? = null,
    /** Application ids, not uids. */
    val registeredDelegates: List<String> = emptyList(),
) {
    val full: Boolean get() = registeredDelegates.size >= (capacity ?: 0)
}

@Serializable
data class AccommodationBlock(
    val id: String = "",
    val blockName: String = "",
    val roomType: String = "",
    @Serializable(with = LenientDouble::class) val pricePerNight: Double? = null,
    @Serializable(with = LenientInt::class) val availableRooms: Int? = null,
)

@Serializable
data class AccommodationRequest(
    val id: String = "",
    val delegateUid: String = "",
    val blockId: String = "",
    val blockName: String = "",
    /** pending | confirmed | rejected */
    val status: String = "",
)

@Serializable
data class DressCode(val text: String = "", val images: List<String> = emptyList())

@Serializable
data class StandingEntry(
    val delegateId: String = "",
    val country: String = "",
    val name: String = "",
    @Serializable(with = LenientInt::class) val rank: Int? = null,
    @Serializable(with = LenientDouble::class) val finalScore: Double? = null,
)

@Serializable
data class Standings(
    /** The committee (the doc id). */
    val id: String = "",
    /** "full" | "rank_only" */
    val visibility: String = "full",
    val entries: List<StandingEntry> = emptyList(),
)

/** events/{e}/results/{id}: the award a chair submitted and the organizer approves. */
@Serializable
data class AwardResult(
    val id: String = "",
    val delegateUid: String = "",
    val delegateName: String = "",
    val committeeId: String = "",
    val committeeName: String = "",
    @Serializable(with = LenientDouble::class) val score: Double? = null,
    val notes: String? = null,
    /** best_delegate | outstanding | honorable | verbal_mention | none */
    val awardType: String = "",
    /** pending | approved | revision_requested */
    val status: String = "",
)

fun awardLabel(type: String): String? = when (type) {
    "best_delegate" -> "Best Delegate"
    "outstanding" -> "Outstanding Delegate"
    "honorable" -> "Honorable Mention"
    "verbal_mention" -> "Verbal Mention"
    else -> null
}

class ModulesRepo {
    private val db = FirebaseFirestore.getInstance()
    private fun event(id: String) = db.collection("events").document(id)

    /** The caller's pass, signed by the server (/api/passes/mine); kept so the QR shows offline. */
    suspend fun myPass(eventId: String): MyPass {
        val r = Api.send("/api/passes/mine?eventId=${java.net.URLEncoder.encode(eventId, "UTF-8")}", "GET")
        val body = r.body
        if (!r.ok || body == null) error(r.error ?: "Couldn't load your pass.")
        return MunJson.decodeFromJsonElement(MyPass.serializer(), body)
    }

    // ── Scanning (staff; every decision and count is the server's) ─────────────────────────

    private suspend inline fun <reified T> passCall(path: String, body: JsonObject?, method: String = "POST"): T {
        val r = Api.send(path, method, body?.toString())
        val json = r.body
        if (!r.ok || json == null) error(r.error ?: "Couldn't reach the server. Check your connection.")
        return MunJson.decodeFromJsonElement(serializer<T>(), json)
    }

    suspend fun scan(eventId: String, target: String, code: String? = null, uid: String? = null, override: Boolean = false): ScanOutcome =
        passCall("/api/passes/scan", buildJsonObject {
            put("eventId", eventId); put("target", target)
            code?.let { put("code", it) }; uid?.let { put("uid", it) }
            if (override) put("override", true)
        })

    suspend fun lookup(eventId: String, code: String): LookupOutcome =
        passCall("/api/passes/lookup", buildJsonObject {
            put("eventId", eventId); put("code", code)
        })

    suspend fun undo(eventId: String, redemptionId: String, at: Long) {
        val r = Api.send("/api/passes/undo", "POST", buildJsonObject {
            put("eventId", eventId); put("redemptionId", redemptionId); put("at", at)
        }.toString())
        if (!r.ok) error(r.error ?: "Couldn't undo.")
    }

    @Serializable private data class People(val people: List<PassPerson> = emptyList())
    suspend fun people(eventId: String): List<PassPerson> =
        passCall<People>("/api/passes/people?eventId=${java.net.URLEncoder.encode(eventId, "UTF-8")}", null, "GET").people

    @Serializable private data class Claims(val rows: List<ClaimRow> = emptyList())
    suspend fun claims(eventId: String): List<ClaimRow> =
        passCall<Claims>("/api/passes/report?eventId=${java.net.URLEncoder.encode(eventId, "UTF-8")}", null, "GET").rows

    /** Who claimed one item and who hasn't yet (organizer, Pro). */
    suspend fun claimDetail(eventId: String, target: String): ClaimDetail =
        passCall("/api/passes/report?eventId=${java.net.URLEncoder.encode(eventId, "UTF-8")}&target=${java.net.URLEncoder.encode(target, "UTF-8")}", null, "GET")

    @Serializable private data class Codes(val codes: Map<String, String> = emptyMap())
    /** Signed passes to print on ID cards (organizer, Pro); non-members are left out. */
    suspend fun passCodes(eventId: String, uids: List<String>): Map<String, String> =
        passCall<Codes>("/api/passes/codes", buildJsonObject {
            put("eventId", eventId)
            put("uids", kotlinx.serialization.json.JsonArray(uids.distinct().map { kotlinx.serialization.json.JsonPrimitive(it) }))
        }).codes

    /** The member marker (which meals are theirs) and their own redemptions (rules: holder reads own). */
    suspend fun myPassUse(eventId: String, uid: String): MyPassUse {
        val m = runCatching { event(eventId).collection("members").document(uid).get().await() }.getOrNull()
        val r = runCatching { event(eventId).collection("redemptions").whereEqualTo("holderUid", uid).get().await() }.getOrNull()
        val used = r?.documents.orEmpty().associate { d ->
            (d.getString("target") ?: "") to ((d.getLong("count") ?: 0L).toInt() to d.getTimestamp("lastAt")?.toDate()?.time)
        }
        val app = runCatching { db.collection("applications").whereEqualTo("userId", uid).whereEqualTo("eventId", eventId).get().await() }.getOrNull()
            ?.documents?.firstOrNull { it.getString("status") == "approved" }?.id
        return MyPassUse(m?.getString("kind"), m?.getString("role"), used, app)
    }

    suspend fun coupons(eventId: String): List<Coupon> =
        event(eventId).collection("coupons").get().await().documents.mapNotNull { it.decode<Coupon>() }

    suspend fun food(eventId: String): List<FoodSlot> =
        event(eventId).collection("foodSlots").get().await().documents.mapNotNull { it.decode<FoodSlot>() }

    suspend fun routes(eventId: String): List<TransportRoute> =
        event(eventId).collection("transportRoutes").get().await().documents.mapNotNull { it.decode<TransportRoute>() }

    /** registerForTransport, in a transaction: refuses a full route or a second registration. */
    suspend fun register(eventId: String, routeId: String, applicationId: String) {
        val ref = event(eventId).collection("transportRoutes").document(routeId)
        db.runTransaction { tx ->
            val snap = tx.get(ref)
            if (!snap.exists()) throw IllegalStateException("Route not found")
            @Suppress("UNCHECKED_CAST")
            val list = (snap.get("registeredDelegates") as? List<String>).orEmpty()
            val cap = (snap.get("capacity") as? Number)?.toInt() ?: 0
            if (applicationId in list) throw IllegalStateException("Already registered")
            if (list.size >= cap) throw IllegalStateException("Route is full")
            tx.update(ref, "registeredDelegates", FieldValue.arrayUnion(applicationId))
            null
        }.await()
    }

    suspend fun blocks(eventId: String): List<AccommodationBlock> =
        event(eventId).collection("accommodationBlocks").get().await().documents.mapNotNull { it.decode<AccommodationBlock>() }

    suspend fun myRoomRequest(eventId: String, uid: String): AccommodationRequest? =
        event(eventId).collection("accommodationRequests").whereEqualTo("delegateUid", uid).get().await()
            .documents.firstNotNullOfOrNull { it.decode<AccommodationRequest>() }

    suspend fun requestRoom(eventId: String, uid: String, block: AccommodationBlock) {
        event(eventId).collection("accommodationRequests").add(mapOf(
            "delegateUid" to uid, "blockId" to block.id, "blockName" to block.blockName,
            "status" to "pending", "requestedAt" to FieldValue.serverTimestamp(),
        )).await()
    }

    suspend fun dressCode(eventId: String): DressCode? =
        event(eventId).collection("settings").document("dressCode").get().await().takeIf { it.exists() }?.decode<DressCode>()

    /** getDelegateEventMarkings: my daily marks and the final rollup on this event. */
    suspend fun myMarkings(eventId: String, uid: String): List<DailyMarking> =
        db.collection("markings").whereEqualTo("eventId", eventId).whereEqualTo("delegateId", uid).get().await()
            .documents.mapNotNull { it.decode<DailyMarking>() }

    /** The committee board the chair published, or null. */
    suspend fun standings(eventId: String, committee: String): Standings? =
        event(eventId).collection("standings").document(committee.replace("/", "_")).get().await().takeIf { it.exists() }?.decode<Standings>()

    /** My award results on this event (organizer-approved ones unlock the award certificate). */
    suspend fun myResults(eventId: String, uid: String): List<AwardResult> =
        event(eventId).collection("results").whereEqualTo("delegateUid", uid).get().await().documents.mapNotNull { it.decode<AwardResult>() }
}
