package com.munpro.app.ui.live

// Join / leave pills in a live sitting (port of src/components/session/useSessionPresence.ts and
// LiveVideoRoom's PresenceToasts). Each participant writes one node,
// /sessionPresence/{eventId}/{sessionKey}/{uid} = { name, country?, role?, joinedAt }, removed by
// onDisconnect; everyone watches the room and diffs it.
//
// The Realtime Database plan allows 100 concurrent connections for the whole platform, so the
// socket is opened only while a live screen shows and dropped when the last one closes. An
// observer reads the room but writes no node: that is the difference between watching the room
// and being in it.

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.DatabaseError
import com.google.firebase.database.FirebaseDatabase
import com.munpro.app.data.RtdbLink
import com.google.firebase.database.ServerValue
import com.google.firebase.database.ValueEventListener
import com.munpro.app.domain.flagEmoji
import com.munpro.app.ui.kit.Type
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

data class PresenceEvent(val id: String, val join: Boolean, val uid: String, val name: String, val country: String?, val role: String?)

private const val EVENT_TTL_MS = 4000L
private const val MAX_VISIBLE = 4

/** RTDB keys may not contain . # $ [ ] / (useSessionPresence.sanitizeKey). */
private fun sanitizeKey(raw: String) = raw.replace(Regex("[.#$\\[\\]/]"), "-")

@Composable
fun rememberPresence(
    eventId: String, sessionId: String, uid: String,
    name: String, country: String?, role: String?,
    enabled: Boolean, publishSelf: Boolean,
): List<PresenceEvent> {
    val events = remember { mutableStateListOf<PresenceEvent>() }
    DisposableEffect(enabled, eventId, sessionId, uid, publishSelf) {
        if (!enabled || eventId.isEmpty() || sessionId.isEmpty() || uid.isEmpty()) return@DisposableEffect onDispose {}
        RtdbLink.acquire()
        val db = FirebaseDatabase.getInstance()
        // /sessionPresence/{eventId}/{sessionKey}: the event level lets the RTDB rules check the
        // server-written /eventMembers mirror (same path as the web's presenceRoomPath).
        val room = db.getReference("sessionPresence").child(sanitizeKey(eventId)).child(sanitizeKey(sessionId))
        val mine = room.child(uid)
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
        var counter = 0

        val connected = db.getReference(".info/connected")
        val connListener = if (publishSelf) object : ValueEventListener {
            override fun onDataChange(s: DataSnapshot) {
                if (s.getValue(Boolean::class.java) != true) return
                val node = buildMap<String, Any> {
                    put("name", name.ifEmpty { "Participant" })
                    country?.takeIf { it.isNotEmpty() }?.let { put("country", it) }
                    role?.takeIf { it.isNotEmpty() }?.let { put("role", it) }
                    put("joinedAt", ServerValue.TIMESTAMP)
                }
                // Right after a sign-in the database can still be on the previous account's auth and
                // refuse the write; one retry a moment later lands it.
                fun write(retry: Boolean) {
                    mine.onDisconnect().removeValue()
                        .addOnSuccessListener { mine.setValue(node).addOnFailureListener { ex ->
                            android.util.Log.w("Presence", "write own node", ex)
                            if (retry) scope.launch { delay(2000); write(false) }
                        } }
                        .addOnFailureListener { ex ->
                            android.util.Log.w("Presence", "arm onDisconnect", ex)
                            if (retry) scope.launch { delay(2000); write(false) }
                        }
                }
                write(true)
            }
            override fun onCancelled(e: DatabaseError) { android.util.Log.w("Presence", ".info/connected: ${e.message}") }
        } else null
        connListener?.let { connected.addValueEventListener(it) }

        var prev: Map<String, Triple<String, String?, String?>>? = null
        val timers = mutableListOf<Job>()
        fun push(join: Boolean, who: String, v: Triple<String, String?, String?>) {
            val ev = PresenceEvent("$who-${counter++}", join, who, v.first, v.second, v.third)
            if (events.size >= MAX_VISIBLE) events.removeAt(0)
            events.add(ev)
            timers += scope.launch { delay(EVENT_TTL_MS); events.remove(ev) }
        }
        val roomListener = object : ValueEventListener {
            override fun onDataChange(s: DataSnapshot) {
                val next = s.children.associate { c ->
                    (c.key ?: "") to Triple(
                        c.child("name").getValue(String::class.java) ?: "Someone",
                        c.child("country").getValue(String::class.java),
                        c.child("role").getValue(String::class.java),
                    )
                }
                prev?.let { p ->
                    next.forEach { (k, v) -> if (k != uid && k !in p) push(true, k, v) }
                    p.forEach { (k, v) -> if (k != uid && k !in next) push(false, k, v) }
                }
                prev = next
            }
            override fun onCancelled(e: DatabaseError) {}
        }
        room.addValueEventListener(roomListener)

        onDispose {
            connListener?.let { connected.removeEventListener(it) }
            room.removeEventListener(roomListener)
            if (publishSelf) { mine.removeValue(); mine.onDisconnect().cancel() }
            timers.forEach { it.cancel() }
            scope.cancel()
            events.clear()
            RtdbLink.release()
        }
    }
    return events
}

/** Bottom-left pills over the video stage (the web's PresenceToasts). */
@Composable
fun PresencePills(events: List<PresenceEvent>, modifier: Modifier = Modifier) {
    Column(modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        events.forEach { ev ->
            Row(
                Modifier.clip(RoundedCornerShape(8.dp)).background(Color(0xB3000000)).padding(horizontal = 9.dp, vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Box(Modifier.size(6.dp).clip(CircleShape).background(if (ev.join) Color(0xFF34D399) else Color(0xCCF87171)))
                ev.country?.takeIf { it.isNotEmpty() }?.let { com.munpro.app.ui.kit.Flag(it, 11f) }
                Text(
                    (if (ev.role.isNullOrEmpty()) ev.name else "${ev.name} (${ev.role})") + if (ev.join) " joined" else " left",
                    style = Type.footnote.copy(fontWeight = FontWeight.Medium), color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
