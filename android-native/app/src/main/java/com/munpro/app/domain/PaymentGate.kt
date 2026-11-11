package com.munpro.app.domain

// Port of src/lib/services/paymentGate.ts — "has this delegate paid for their seat, what do they
// owe, and by when". A display/navigation gate, not a security boundary (see the web file).

import java.text.NumberFormat
import java.util.Locale
import kotlin.math.abs

data class PaymentGate(
    val required: Boolean,
    val amount: Double,
    val tierLabel: String,
    /** "not-required" | "due" | "paid" | "refunded" */
    val status: String,
    val dueAt: Long? = null,
    val daysLeft: Long? = null,
    val overdue: Boolean,
    val blocksPortal: Boolean,
)

private const val DAY_MS = 24L * 60 * 60 * 1000

private fun dueAtFor(event: EventData, now: Long): Long? {
    val t = getApplicationTimeline(event, now)
    return when (t.phase) {
        "early" -> t.earlyEndAt
        "late" -> t.lateEndAt
        else -> t.closeAt
    }
}

fun getPaymentGate(app: ApplicationData?, event: EventData?, now: Long = System.currentTimeMillis()): PaymentGate {
    val idle = PaymentGate(false, 0.0, "", "not-required", overdue = false, blocksPortal = false)
    if (app == null || event == null) return idle

    val amount = getRolePrice(event, app.role, app.teamSize ?: 1, now)
    if (amount <= 0) return idle // free event, or a free role on a paid event

    val tierLabel = getRoleTier(event, app.role)?.label?.ifEmpty { null } ?: app.role.ifEmpty { "Registration" }
    val dueAt = dueAtFor(event, now)
    // Truncated toward zero, so the count never overstates in either direction.
    val daysLeft = dueAt?.let { (it - now) / DAY_MS }

    // A rejected/withdrawn application owes nothing.
    val dead = app.status == "rejected" || app.status == "withdrawn"
    val status = when {
        app.paymentStatus == "paid" -> "paid"
        app.paymentStatus == "refunded" || dead -> "refunded"
        else -> "due"
    }
    return PaymentGate(
        required = true,
        amount = amount,
        tierLabel = tierLabel,
        status = status,
        dueAt = dueAt,
        daysLeft = daysLeft,
        overdue = status == "due" && dueAt != null && now > dueAt,
        blocksPortal = status == "due",
    )
}

/** `$1,250` — whole dollars, no trailing `.00` on typical MUN fees. */
fun formatFee(amount: Double): String {
    val f = NumberFormat.getNumberInstance(Locale.US).apply {
        minimumFractionDigits = if (amount % 1.0 == 0.0) 0 else 2
        maximumFractionDigits = 2
    }
    return "$" + f.format(amount)
}

/** "3 days left" / "Due today" / "5 days overdue". Branches on `overdue`, not the sign of daysLeft. */
fun formatDueLabel(gate: PaymentGate): String? {
    if (gate.dueAt == null || gate.daysLeft == null) return null
    if (gate.overdue) {
        val d = abs(gate.daysLeft)
        if (d < 1) return "Overdue"
        return "$d day${if (d == 1L) "" else "s"} overdue"
    }
    val d = gate.daysLeft
    if (d <= 0) return "Due today"
    if (d == 1L) return "1 day left"
    return "$d days left"
}
