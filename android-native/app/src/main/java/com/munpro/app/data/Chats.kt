package com.munpro.app.data

// Direct messages and group chats (board A4): the web's lib/services/messageService.ts, same
// documents, same writes, under the same rules. Chats are live data, so they are listeners, never
// saved copies; Firestore's own offline cache already shows the last list on a cold start.
//
// Differences from the web, each one a fix rather than a new behaviour:
// - a send is one batch (message + the conversation's preview and unread counters) instead of
//   three round trips, so it shows at once and survives a flaky connection;
// - read receipts mark only the messages already on screen (the web re-reads the last 50);
// - a new group stores the creator's real name (the web writes "Me", which everyone else sees);
// - removing a member is an arrayRemove, not a read-modify-write of the whole list.

import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.MetadataChanges
import com.google.firebase.firestore.Query
import com.munpro.app.domain.Conversation
import com.munpro.app.domain.DirectMessage
import com.munpro.app.domain.directConversationId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.tasks.await

/** A person to message or add to a group. */
data class ChatPerson(val uid: String, val name: String, val photo: String)

/** The conversation document as last heard; [loaded] is false until the first snapshot. */
data class ConversationDoc(val loaded: Boolean, val conv: Conversation?)

const val CHAT_PAGE = 50

@OptIn(ExperimentalCoroutinesApi::class)
class ChatsRepo(private val auth: AuthRepo) {
    private val db = FirebaseFirestore.getInstance()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private fun conv(id: String) = db.collection("conversations").document(id)

    private val uid: Flow<String?> = auth.state.map { (it as? AuthState.SignedIn)?.user?.uid }.distinctUntilChanged()

    /** My conversations, newest first; null until the first snapshot. */
    val list: StateFlow<List<Conversation>?> = uid
        .flatMapLatest { u -> if (u == null) flowOf(null) else listFor(u) }
        .stateIn(scope, SharingStarted.Eagerly, null)

    /** Unread across my chats (the web's unreadCount counters): part of the Messages tab badge. */
    val unread: StateFlow<Int> = combine(list, uid) { l, u ->
        if (u == null) 0 else l.orEmpty().filter { u !in it.blockedBy }.sumOf { it.unread(u) }
    }.stateIn(scope, SharingStarted.Eagerly, 0)

    private fun listFor(u: String): Flow<List<Conversation>> = callbackFlow {
        val reg = db.collection("conversations")
            .whereArrayContains("participants", u)
            .orderBy("updatedAt", Query.Direction.DESCENDING)
            .addSnapshotListener { snap, err ->
                if (err != null) { android.util.Log.w("Chats", "conversations", err); trySend(emptyList()); return@addSnapshotListener }
                trySend(snap?.documents.orEmpty().mapNotNull { it.decode<Conversation>() })
            }
        awaitClose { reg.remove() }
    }

    fun conversation(id: String): Flow<ConversationDoc> = callbackFlow {
        val reg = conv(id).addSnapshotListener { snap, err ->
            // A direct chat that hasn't started yet doesn't exist; its read is allowed and empty.
            if (err != null) { trySend(ConversationDoc(true, null)); return@addSnapshotListener }
            trySend(ConversationDoc(true, snap?.takeIf { it.exists() }?.decode<Conversation>()))
        }
        awaitClose { reg.remove() }
    }

    /** The latest [limit] messages, oldest first. Includes my own writes before the server has them. */
    fun messages(id: String, limit: Int): Flow<List<DirectMessage>> = callbackFlow {
        val reg: ListenerRegistration = conv(id).collection("messages")
            .orderBy("timestamp", Query.Direction.DESCENDING)
            .limit(limit.toLong())
            .addSnapshotListener(MetadataChanges.INCLUDE) { snap, err ->
                if (err != null) { trySend(emptyList()); return@addSnapshotListener }
                trySend(snap?.documents.orEmpty().map(::message).reversed())
            }
        awaitClose { reg.remove() }
    }

    private fun message(d: DocumentSnapshot) = DirectMessage(
        id = d.id,
        senderId = d.getString("senderId").orEmpty(),
        senderName = d.getString("senderName").orEmpty(),
        text = d.getString("text").orEmpty(),
        at = d.getTimestamp("timestamp", DocumentSnapshot.ServerTimestampBehavior.ESTIMATE)?.toDate()?.time,
        readBy = (d.get("readBy") as? List<*>)?.filterIsInstance<String>().orEmpty(),
        system = d.getBoolean("systemMessage") == true,
        pending = d.metadata.hasPendingWrites(),
    )

    /** My name as the other side sees it: the web's displayName, else full name, else email. */
    fun me(): ChatPerson? {
        val u = auth.user ?: return null
        val p = auth.profile
        val name = p?.displayName?.ifBlank { null } ?: p?.fullName?.ifBlank { null } ?: u.displayName?.ifBlank { null } ?: u.email.orEmpty().ifEmpty { "Me" }
        return ChatPerson(u.uid, name, p?.photoURL.orEmpty())
    }

    /**
     * sendMessage. [known] is the conversation as the screen has it; null for a direct chat that
     * hasn't started, which [other] then creates (createOrGetDirectConversation's initial data).
     */
    suspend fun send(id: String, known: Conversation?, text: String, other: ChatPerson? = null) {
        val me = me() ?: throw IllegalStateException("Not signed in.")
        var participants = known?.participants
        if (known == null) {
            val snap = conv(id).get().await()
            participants = snap.takeIf { it.exists() }?.decode<Conversation>()?.participants
            if (participants == null) {
                val o = other ?: throw IllegalStateException("No conversation to send into.")
                conv(id).set(mapOf(
                    "participants" to listOf(me.uid, o.uid),
                    "participantNames" to mapOf(me.uid to me.name, o.uid to o.name),
                    "participantPhotos" to listOf(me.uid to me.photo, o.uid to o.photo).filter { it.second.isNotEmpty() }.toMap(),
                    "type" to "direct",
                    "lastMessage" to text,
                    "lastMessageSenderId" to me.uid,
                    "updatedAt" to FieldValue.serverTimestamp(),
                    "unreadCount" to mapOf(me.uid to 0, o.uid to 0),
                )).await()
                participants = listOf(me.uid, o.uid)
            }
        }
        val batch = db.batch()
        batch.set(conv(id).collection("messages").document(), mapOf(
            "senderId" to me.uid,
            "senderName" to me.name,
            "text" to text,
            "timestamp" to FieldValue.serverTimestamp(),
            "readBy" to listOf(me.uid),
            "readAt" to mapOf(me.uid to FieldValue.serverTimestamp()),
        ))
        val update = mutableMapOf<String, Any>(
            "lastMessage" to text,
            "lastMessageSenderId" to me.uid,
            "updatedAt" to FieldValue.serverTimestamp(),
        )
        participants.orEmpty().filter { it != me.uid }.forEach { update["unreadCount.$it"] = FieldValue.increment(1) }
        batch.update(conv(id), update)
        batch.commit().await()
    }

    private val marked = HashSet<String>()

    /** markConversationRead: my unread counter to 0, and me on each message on screen I haven't read. */
    suspend fun markRead(c: Conversation, shown: List<DirectMessage>) {
        val me = auth.user?.uid ?: return
        if (c.unread(me) > 0) runCatching { conv(c.id).update("unreadCount.$me", 0).await() }
        val todo = shown.filter { !it.pending && !it.system && it.senderId != me && me !in it.readBy && marked.add(c.id + "/" + it.id) }
        if (todo.isEmpty()) return
        val batch = db.batch()
        todo.takeLast(CHAT_PAGE).forEach {
            batch.update(conv(c.id).collection("messages").document(it.id), mapOf(
                "readBy" to FieldValue.arrayUnion(me),
                "readAt.$me" to FieldValue.serverTimestamp(),
            ))
        }
        runCatching { batch.commit().await() }.onFailure { todo.forEach { m -> marked.remove(c.id + "/" + m.id) } }
    }

    fun directId(otherUid: String): String? = auth.user?.uid?.let { directConversationId(it, otherUid) }

    // ---- groups ------------------------------------------------------------------------------

    /** createGroupConversation: the group, then its "Group created" note. Returns the new id. */
    suspend fun createGroup(name: String, members: List<ChatPerson>, eventId: String? = null): String {
        val me = me() ?: throw IllegalStateException("Not signed in.")
        val all = (listOf(me) + members).distinctBy { it.uid }
        val ref = db.collection("conversations").document()
        ref.set(mapOf(
            "type" to "group",
            "groupName" to name,
            "participants" to all.map { it.uid },
            "participantNames" to all.associate { it.uid to it.name },
            "participantPhotos" to all.associate { it.uid to it.photo },
            "createdBy" to me.uid,
            "createdAt" to FieldValue.serverTimestamp(),
            "admins" to listOf(me.uid),
            "unreadCount" to all.associate { it.uid to 0 },
            "lastMessage" to "Group created",
            "lastMessageSenderId" to "system",
            "updatedAt" to FieldValue.serverTimestamp(),
        ) + (if (eventId != null) mapOf("eventId" to eventId) else emptyMap())).await()
        runCatching { ref.collection("messages").add(systemNote("Group created", me.uid)).await() }
        return ref.id
    }

    /** addGroupMember, for several people at once: one note each, as the web writes them. */
    suspend fun addMembers(c: Conversation, people: List<ChatPerson>) {
        val me = me() ?: return
        val fresh = people.filter { it.uid !in c.participants }
        if (fresh.isEmpty()) return
        val batch = db.batch()
        val update = mutableMapOf<String, Any>(
            "participants" to FieldValue.arrayUnion(*fresh.map { it.uid }.toTypedArray()),
            "lastMessage" to "${me.name} added ${fresh.last().name}",
            "lastMessageSenderId" to "system",
            "updatedAt" to FieldValue.serverTimestamp(),
        )
        fresh.forEach {
            update["participantNames.${it.uid}"] = it.name
            update["participantPhotos.${it.uid}"] = it.photo
            update["unreadCount.${it.uid}"] = 0
            batch.set(conv(c.id).collection("messages").document(), systemNote("${me.name} added ${it.name}"))
        }
        batch.update(conv(c.id), update)
        batch.commit().await()
    }

    /** removeGroupMember; removing myself is leaving ("… left the group"). */
    suspend fun removeMember(c: Conversation, uid: String) {
        val me = me() ?: return
        val text = if (uid == me.uid) "${me.name} left the group" else "${me.name} removed ${c.nameOf(uid)}"
        val batch = db.batch()
        // Rules read the conversation as it was before the batch, so someone leaving may still write the note.
        batch.set(conv(c.id).collection("messages").document(), systemNote(text))
        batch.update(conv(c.id), mapOf(
            "participants" to FieldValue.arrayRemove(uid),
            "lastMessage" to text,
            "lastMessageSenderId" to "system",
            "updatedAt" to FieldValue.serverTimestamp(),
        ))
        batch.commit().await()
    }

    /** updateGroupMeta: the name. */
    suspend fun rename(c: Conversation, name: String) {
        conv(c.id).update("groupName", name).await()
    }

    private fun systemNote(text: String, readerUid: String? = null): Map<String, Any> = buildMap {
        put("senderId", "system")
        put("senderName", "System")
        put("text", text)
        put("timestamp", FieldValue.serverTimestamp())
        put("readBy", listOfNotNull(readerUid))
        if (readerUid != null) put("readAt", mapOf(readerUid to FieldValue.serverTimestamp()))
        put("systemMessage", true)
    }
}
