package com.munpro.app.data

// The signed-in delegate's applications, each joined with its event, shared by Today, Schedule
// and the conference screens (port of mobile/src/lib/conferences.tsx). Loaded once per sign-in
// and on pull-to-refresh — applications change rarely, so no listener spends reads on them.
//
// The saved copy shows first, so the app opens with the delegate's conference even offline. An
// offline answer never replaces it: with no network the SDK can answer from an empty cache.

import com.munpro.app.AppGraph
import com.munpro.app.domain.Conference
import com.munpro.app.domain.getEventStartMs
import com.munpro.app.domain.isAllocated
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import java.time.LocalDate
import java.time.ZoneId

class ConferencesStore(private val auth: AuthRepo, private val saved: Saved, private val apps: ApplicationRepo, private val events: EventRepo) {
    data class State(
        val conferences: List<Conference>? = null,
        /** What's shown is the copy saved on the device; the network hasn't confirmed it. */
        val saved: Boolean = false,
        val savedAt: Long? = null,
    ) {
        /** The conference Today and Schedule are about: allocated and not over, soonest first. */
        val current: Conference? get() = pickCurrent(conferences)
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var uid: String? = null
    private var fresh = false
    private val serializer = ListSerializer(Conference.serializer())

    init {
        AppGraph.scope.launch {
            auth.state.map { (it as? AuthState.SignedIn)?.user?.uid }.distinctUntilChanged().collect { u ->
                uid = u
                fresh = false
                _state.value = State()
                if (u == null) return@collect
                val c = saved.read("conferences:$u", serializer)
                val at = saved.savedAt("conferences:$u")
                if (c != null && !fresh && uid == u) _state.value = State(c, true, at)
                // A copy younger than the window is used as is: no reads at app start (owner's
                // load-once rule). Pull-to-refresh and changes the app makes still reload.
                if (c != null && at != null && System.currentTimeMillis() - at < Fresh.MEDIUM) {
                    android.util.Log.d("MunCache", "hit conferences:$u")
                    if (uid == u) _state.value = State(c, false, null)
                } else reload()
            }
        }
        // Back online after starting offline: replace the saved copy with the real list.
        AppGraph.scope.launch {
            AppGraph.network.changes.drop(1).collect {
                val u = uid ?: return@collect
                val at = saved.savedAt("conferences:$u")
                if (at == null || System.currentTimeMillis() - at >= Fresh.MEDIUM) reload()
            }
        }
    }

    suspend fun reload() {
        val u = uid ?: run { _state.value = State(emptyList()); return }
        if (!AppGraph.network.isOnline()) {
            if (_state.value.conferences == null) _state.value = _state.value.copy(conferences = emptyList())
            return
        }
        try {
            val list = apps.getUserApplications(u).filter { it.id.isNotEmpty() && it.eventId.isNotEmpty() }
            val ids = list.map { it.eventId }.distinct()
            val byId = ids.mapNotNull { events.getEventById(it) }.associateBy { it.id }
            val joined = list.mapNotNull { a -> byId[a.eventId]?.let { Conference(a, it) } }
            if (uid != u) return
            fresh = true
            // Stamped now, the moment it is saved, so a later drop-out still says when the copy is from.
            _state.value = State(joined, false, System.currentTimeMillis())
            saved.write("conferences:$u", serializer, joined)
        } catch (_: Exception) {
            // Offline or denied: keep whatever is showing; an empty list only if nothing is.
            if (_state.value.conferences == null) _state.value = _state.value.copy(conferences = emptyList())
        }
    }
}

fun pickCurrent(conferences: List<Conference>?): Conference? {
    if (conferences == null) return null
    val dayStart = LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
    fun live(c: Conference): Boolean { val ms = getEventStartMs(c.event); return ms == null || ms >= dayStart - 3 * 86_400_000L }
    val byDate = compareBy<Conference> { (getEventStartMs(it.event)?.toDouble() ?: Double.POSITIVE_INFINITY) }
    return conferences.filter { isAllocated(it) && !com.munpro.app.domain.watchesOnly(it) }.filter(::live).sortedWith(byDate).firstOrNull()
        // Approved as an observer / press / faculty advisor: a seat to watch from.
        ?: conferences.filter { com.munpro.app.domain.watchesOnly(it) }.filter(::live).sortedWith(byDate).firstOrNull()
        ?: conferences.filter { it.app.status == "pending" }.filter(::live).sortedWith(byDate).firstOrNull()
}
