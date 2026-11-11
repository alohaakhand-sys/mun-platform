package com.munpro.app.data

// Client side of event membership (web: lib/services/membershipService.ts; server:
// lib/server/membership.ts). The live read rules let an event's members, staff, organizer and
// admins read its sittings and circulating papers; a member is recognised by a marker only the
// server writes, recomputed from the event's records. This asks for that recompute for the
// signed-in user — the self-heal every delegate-facing live surface runs before it subscribes,
// because a Firestore listener denied once is never retried.

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.concurrent.ConcurrentHashMap

object Membership {
    private val done = ConcurrentHashMap.newKeySet<String>()

    /** Once per user and event per process run; false when the server couldn't be reached. */
    suspend fun ensure(uid: String, eventId: String): Boolean {
        if (uid.isEmpty() || eventId.isEmpty()) return false
        val key = "$uid:$eventId"
        if (key in done) return true
        val ok = Api.call("/api/members/sync", "POST", buildJsonObject { put("eventId", eventId) }.toString()) != null
        if (ok) done += key
        return ok
    }

    /** Recompute again after the user's records on the event changed (an accepted staff invite). */
    suspend fun refresh(uid: String, eventId: String): Boolean {
        done -= "$uid:$eventId"
        return ensure(uid, eventId)
    }
}
