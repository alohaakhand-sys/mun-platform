package com.munpro.app.domain.live

// Who may do what in a committee's live sitting. Port of src/lib/hooks/useEventStaffRole.ts plus
// the `canControl` / `canDais` lines of src/app/dashboard/chair/committee/[id]/live/page.tsx, which
// mirror firestore.rules (`canRunSession` for the sitting, `canWriteMarking` for the dais chat).
// Every chair-console control reads one of these, so a watch-only viewer gets the board without
// a single button the rules would refuse.

import com.munpro.app.domain.isChairTierRole
import com.munpro.app.domain.isExecBoardRole

/** Read-only spectator/supervisor tier (staffService.READONLY_ROLES). */
fun isWatchOnlyStaffRole(role: String?): Boolean = role.orEmpty().lowercase().let { it == "observer" || it == "faculty-advisor" || it == "faculty_advisor" }

data class StaffAccess(
    /** "" when this account has no ACCEPTED staff doc on the event. */
    val role: String = "",
    /** The staff doc's committee; empty = event-wide. */
    val committeeId: String = "",
    val permissions: Map<String, Boolean> = emptyMap(),
    /** event.organizerId == uid */
    val isOwner: Boolean = false,
    /** Vice-chair granted "delegate power" (proxy for delegations). */
    val delegatePower: Boolean = false,
) {
    private val r get() = role.lowercase()
    val isCoOrganizer: Boolean get() = r == "co-organizer"
    val isOrganizerLevel: Boolean get() = isOwner || isCoOrganizer
    val isExecBoard: Boolean get() = isExecBoardRole(role)
    /** chair / vice-chair (staffService.isChairTierRole). */
    val isChairTier: Boolean get() = isChairTierRole(role)
    val canActAsDelegate: Boolean get() = r == "vice-chair" && delegatePower

    fun isChairOf(committee: String): Boolean = isChairTier && committeeId.isNotEmpty() && committeeId == committee
    /** EB whose scope covers [committee]: committeeId empty (event-wide) or equal. */
    fun isExecBoardOf(committee: String): Boolean = isExecBoard && (committeeId.isEmpty() || committeeId == committee)
    /** Permission check that auto-grants to owner/co-organizer. */
    fun can(perm: String): Boolean = isOrganizerLevel || permissions[perm] == true

    /** May run the sitting: every floor, list, vote, roll and marking control. */
    fun canControl(committee: String): Boolean =
        isOrganizerLevel || isExecBoardOf(committee) || isChairOf(committee) || can("canMarkDelegates")

    /** May read and answer delegates' private notes: [canControl] minus the Executive Board. */
    fun canDais(committee: String): Boolean =
        isOrganizerLevel || isChairOf(committee) || can("canMarkDelegates")

    /** Belongs to the committee's room without running it (observer, faculty advisor, out-of-scope EB). */
    fun canWatch(committee: String): Boolean = !canControl(committee) && (role.isNotEmpty() || isOwner)
}
