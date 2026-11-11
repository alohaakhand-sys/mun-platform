package com.munpro.app.data

// Payments (board A6.3–A6.6; web dashboard/payments, /api/payments/*). The fee and the gateway
// are decided by the server: the price from the event doc, the gateway by the App Admin
// (systemSettings paymentMode). The app asks for a checkout with returnTo "app", so the gateway
// lands on munpilot.com/app-return, which reopens the app on "Confirming payment". Only the
// gateway webhook or /api/payments/verify ever marks an application paid; the app watches its
// own application doc for that.

import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/** "stripe" | "zinipay" | "dev", or null when the server can't be reached. */
data class Gateway(val mode: String?)

sealed interface CheckoutResult {
    data class Open(val url: String, val provider: String) : CheckoutResult
    data class Failed(val message: String) : CheckoutResult
}

class PaymentsRepo {
    private val db = FirebaseFirestore.getInstance()

    /** /api/payments/status: the gateway checkout will actually use (no secrets in it). */
    suspend fun gateway(): Gateway {
        val res = Api.call("/api/payments/status") as? JsonObject
        return Gateway(runCatching { res?.get("activeMode")?.jsonPrimitive?.content }.getOrNull())
    }

    suspend fun checkout(applicationId: String, eventId: String): CheckoutResult {
        val r = Api.send("/api/payments/checkout", "POST", buildJsonObject {
            put("applicationId", applicationId)
            put("eventId", eventId)
            put("returnTo", "app")
        }.toString())
        val body = r.body as? JsonObject
        val url = runCatching { body?.get("url")?.jsonPrimitive?.content }.getOrNull()
        return if (r.ok && !url.isNullOrEmpty()) CheckoutResult.Open(url, runCatching { body?.get("provider")?.jsonPrimitive?.content }.getOrNull().orEmpty())
        else CheckoutResult.Failed(r.error ?: "Could not start payment.")
    }

    /** /api/payments/verify: the ZiniPay return-trip check (Stripe waits for its webhook). */
    suspend fun verify(applicationId: String): String? {
        val r = Api.call("/api/payments/verify", "POST", buildJsonObject { put("applicationId", applicationId) }.toString()) as? JsonObject
        return runCatching { r?.get("status")?.jsonPrimitive?.content }.getOrNull()
    }

    /** My application's paymentStatus, live (the doc the webhook writes). */
    fun paymentStatus(applicationId: String): Flow<String?> = callbackFlow {
        val reg = db.collection("applications").document(applicationId).addSnapshotListener { snap, _ ->
            trySend(snap?.getString("paymentStatus"))
        }
        awaitClose { reg.remove() }
    }
}
