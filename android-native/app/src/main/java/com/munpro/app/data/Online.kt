package com.munpro.app.data

// Online status for Messages (board A4): RTDB /status/{uid} = {state, lastChangedAt}, the same
// node the website's initPresence writes (database.rules.json: any member reads, only you write).
// The phone says "online" while the app is in the foreground and signed in, and arms an
// onDisconnect "offline" first, so a killed app or a lost network still ends up offline. One RTDB
// socket serves this and the live console's room presence (RtdbLink).

import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ProcessLifecycleOwner
import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.DatabaseError
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.database.ServerValue
import com.google.firebase.database.ValueEventListener
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/** One RTDB socket for everything that needs it: online while anyone holds it. */
object RtdbLink {
    private var users = 0
    @Synchronized fun acquire() { if (users++ == 0) FirebaseDatabase.getInstance().goOnline() }
    @Synchronized fun release() { if (--users == 0) FirebaseDatabase.getInstance().goOffline() }
}

/** [lastChangedAt] is when they came online or went offline (RTDB server time). */
data class OnlineStatus(val online: Boolean, val lastChangedAt: Long?)

@OptIn(ExperimentalCoroutinesApi::class)
class Online(private val auth: AuthRepo, private val people: PeopleRepo) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val foreground = MutableStateFlow(false)

    init {
        ProcessLifecycleOwner.get().lifecycle.addObserver(LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_START -> foreground.value = true
                Lifecycle.Event.ON_STOP -> foreground.value = false
                else -> Unit
            }
        })
        scope.launch {
            combine(auth.state.map { (it as? AuthState.SignedIn)?.user?.uid }.distinctUntilChanged(), foreground) { u, fg -> u.takeIf { fg } }
                .distinctUntilChanged()
                .collectLatest { u -> if (u != null) publish(u) }
        }
    }

    /** initPresence: offline armed on disconnect, then online; offline again when cancelled. */
    private suspend fun publish(uid: String) {
        val db = FirebaseDatabase.getInstance()
        val mine = db.getReference("status/$uid")
        val connected = db.getReference(".info/connected")
        val listener = object : ValueEventListener {
            override fun onDataChange(s: DataSnapshot) {
                if (s.getValue(Boolean::class.java) != true) return
                mine.onDisconnect().setValue(state("offline")).addOnSuccessListener { mine.setValue(state("online")) }
            }
            override fun onCancelled(e: DatabaseError) {}
        }
        RtdbLink.acquire()
        connected.addValueEventListener(listener)
        try {
            awaitCancellation()
        } finally {
            connected.removeEventListener(listener)
            mine.setValue(state("offline"))
            RtdbLink.release()
        }
    }

    private fun state(s: String) = mapOf("state" to s, "lastChangedAt" to ServerValue.TIMESTAMP)

    /** Their status; always offline for members who hid their profile, as on the web. */
    fun status(uid: String): Flow<OnlineStatus> = callbackFlow {
        if (people.profile(uid)?.privacySettings?.showProfile == false) {
            trySend(OnlineStatus(false, null))
            awaitClose {}
            return@callbackFlow
        }
        val ref = FirebaseDatabase.getInstance().getReference("status/$uid")
        val listener = object : ValueEventListener {
            override fun onDataChange(s: DataSnapshot) {
                trySend(OnlineStatus(s.child("state").getValue(String::class.java) == "online", s.child("lastChangedAt").getValue(Long::class.java)))
            }
            override fun onCancelled(e: DatabaseError) { trySend(OnlineStatus(false, null)) }
        }
        RtdbLink.acquire()
        ref.addValueEventListener(listener)
        awaitClose { ref.removeEventListener(listener); RtdbLink.release() }
    }
}
