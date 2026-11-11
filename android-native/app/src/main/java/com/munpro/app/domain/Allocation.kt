package com.munpro.app.domain

// The organizer's allocation rules (board C2; web ApplicationsTable, ApplicationDetailSidebar,
// countries and capacity pages): who still owes the fee, which seats are taken, how full a
// committee is, and the first seat an applicant's ranked choices allow.

/** applicationService.eventRequiresPayment: any enabled role has a price in some phase. */
fun eventRequiresPayment(event: EventData?): Boolean =
    getEnabledRoleTiers(event).any { (it.price ?: 0.0) > 0 || (it.earlyBirdPrice ?: 0.0) > 0 || (it.latePrice ?: 0.0) > 0 }

/** applicationService.isAwaitingPayment: the fee for their role is due and not paid. Blocks approval. */
fun isAwaitingPayment(app: ApplicationData, event: EventData?, now: Long = System.currentTimeMillis()): Boolean {
    if (app.paymentStatus == "paid") return false
    val tiers = getEnabledRoleTiers(event)
    if (app.role.isNotEmpty()) {
        val tier = tiers.firstOrNull { it.role == app.role } ?: return false
        return getEffectiveRoleUnitPrice(event, tier, now).price > 0
    }
    return tiers.any { getEffectiveRoleUnitPrice(event, it, now).price > 0 }
}

/** The row's payment chip: Paid, Refunded, Unpaid (fee due) or Free. */
fun paymentLabel(app: ApplicationData, event: EventData?): String = when {
    app.paymentStatus == "paid" -> "Paid"
    app.paymentStatus == "refunded" -> "Refunded"
    isAwaitingPayment(app, event) -> "Unpaid"
    else -> "Free"
}

/** Approved applications seated in [committee] (assigned committee wins, then preference). */
fun seated(apps: List<ApplicationData>, committee: String): List<ApplicationData> =
    apps.filter { it.status == "approved" && belongsToCommittee(it, committee) }

/** Country (lower-cased) → who holds it in [committee], leaving out [exceptAppId]. */
fun takenCountries(apps: List<ApplicationData>, committee: String, exceptAppId: String? = null): Map<String, String> =
    seated(apps, committee).filter { it.id != exceptAppId && !it.assignedCountry.isNullOrEmpty() }
        .associate { it.assignedCountry!!.lowercase() to it.applicantName.orEmpty().ifEmpty { "another delegate" } }

/** A committee is full when it has a capacity and that many approved delegates (the availability route). */
fun isCommitteeFull(c: Committee, apps: List<ApplicationData>, exceptAppId: String? = null): Boolean {
    val cap = c.capacity ?: 0
    return cap > 0 && seated(apps, c.name).count { it.id != exceptAppId } >= cap
}

/**
 * Swipe-to-approve: the applicant's highest-ranked committee that still has a seat, with their
 * highest-ranked country there that nobody holds. null when no ranked choice is free.
 */
fun firstAvailableSeat(app: ApplicationData, event: EventData, apps: List<ApplicationData>): Pair<String, String>? {
    for (pref in getAppCommitteePreferences(app)) {
        val c = event.committees.firstOrNull { sameCommittee(it.name, pref.committee) } ?: continue
        if (isCommitteeFull(c, apps, app.id)) continue
        val taken = takenCountries(apps, c.name, app.id)
        val country = pref.countries.firstOrNull { it.isNotEmpty() && !it.equals("any", true) && it.lowercase() !in taken && (c.countries.isEmpty() || c.countries.any { cc -> cc.equals(it, true) }) }
            ?: continue
        return c.name to (c.countries.firstOrNull { it.equals(country, true) } ?: country)
    }
    return null
}
