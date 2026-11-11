package com.munpro.app.data

// Reads for the Home tab (board A1.1–A1.3; web app/dashboard/page.tsx + DashboardClient.tsx +
// components/dashboard/ActivityFeed.tsx): the activity stream in its three scopes, the user's
// connections, recommended conferences and whether the user already organises.

import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.munpro.app.domain.Activity
import com.munpro.app.domain.ActivityScope
import com.munpro.app.domain.Connection
import com.munpro.app.domain.EventData
import com.munpro.app.domain.getEventStartMs
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.tasks.await
import java.time.LocalDate

@OptIn(ExperimentalCoroutinesApi::class)
class HomeRepo(auth: AuthRepo, private val events: EventRepo, scope: CoroutineScope) {
    private val db = FirebaseFirestore.getInstance()

    /** users/{uid}/connections, shared by Home's "Following", Search and the Network tab; null until loaded. */
    val connections: StateFlow<List<Connection>?> = auth.state
        .map { (it as? AuthState.SignedIn)?.user?.uid }
        .distinctUntilChanged()
        .flatMapLatest { u -> if (u == null) flowOf(emptyList()) else connectionsOf(u) }
        .stateIn(scope, SharingStarted.WhileSubscribed(5_000), null)

    private fun connectionsOf(uid: String): Flow<List<Connection>> = callbackFlow {
        val reg = db.collection("users").document(uid).collection("connections").addSnapshotListener { snap, err ->
            if (err != null || snap == null) { trySend(emptyList()); return@addSnapshotListener }
            trySend(snap.documents.mapNotNull { d -> d.decode<Connection>()?.let { it.copy(otherUid = it.otherUid.ifEmpty { d.id }) } })
        }
        awaitClose { reg.remove() }
    }

    /**
     * getRecentActivitiesRealtime: the newest [limit] in [scope]. "Following" is the user's active
     * connections (Firestore's `in` takes 30 at most, as on the web); with none it is empty. Null
     * until the first answer; a denied or failed query answers empty.
     */
    fun activities(uid: String, scope: ActivityScope, limit: Long, following: List<String>): Flow<List<Activity>?> {
        val ref = db.collection("activities")
        val q: Query = when (scope) {
            ActivityScope.Mine -> ref.whereEqualTo("userId", uid)
            ActivityScope.Following -> {
                if (following.isEmpty()) return flowOf(emptyList())
                ref.whereIn("userId", following.take(30)).whereEqualTo("isPublic", true)
            }
            ActivityScope.All -> ref.whereEqualTo("isPublic", true)
        }.orderBy("createdAt", Query.Direction.DESCENDING).limit(limit)
        return callbackFlow {
            val reg = q.addSnapshotListener { snap, err ->
                if (err != null || snap == null) { trySend(emptyList()); return@addSnapshotListener }
                trySend(snap.documents.mapNotNull { it.decode<Activity>() })
            }
            awaitClose { reg.remove() }
        }
    }

    /**
     * Recommended conferences (the dashboard page's server scoring): the next 50 published events
     * from today, minus those already applied to; +3 starting within 60 days, +2 within 180, +2
     * when the location names the user's country; best three, earliest first among equals.
     */
    suspend fun recommended(appliedEventIds: Set<String>, userCountry: String?): List<EventData> {
        val today = LocalDate.now().toString()
        // The dashboard client's own fallback when the server answer is missing: published, not applied to, first three.
        val list = runCatching { upcoming(today) }.getOrElse {
            return events.getPublishedEvents(40).filter { it.id !in appliedEventIds }.take(3)
        }
        val now = System.currentTimeMillis()
        fun score(e: EventData): Int {
            var s = 0
            val start = getEventStartMs(e) ?: runCatching { java.time.Instant.parse(e.date + "T00:00:00Z").toEpochMilli() }.getOrNull()
            if (start != null) {
                val days = (start - now) / 86_400_000.0
                if (days in 0.0..60.0) s += 3 else if (days in 0.0..180.0) s += 2
            }
            if (!userCountry.isNullOrEmpty() && e.location.contains(userCountry)) s += 2
            return s
        }
        return list.filter { it.id !in appliedEventIds }
            .sortedWith(compareByDescending<EventData> { score(it) }.thenBy { it.date })
            .take(3)
    }

    private suspend fun upcoming(today: String): List<EventData> = db.collection("events")
        .whereEqualTo("status", "published")
        .whereGreaterThanOrEqualTo("date", today)
        .orderBy("date", Query.Direction.ASCENDING)
        .limit(50)
        .get().await()
        .documents.mapNotNull { it.decode<EventData>() }

    /** getCoOrganizedEventIds: accepted co-organizer staff docs. */
    suspend fun coOrganizes(uid: String): Boolean = runCatching {
        !db.collectionGroup("staff")
            .whereEqualTo("uid", uid).whereEqualTo("inviteStatus", "accepted").whereEqualTo("role", "co-organizer")
            .limit(1).get().await().isEmpty
    }.getOrDefault(false)
}
