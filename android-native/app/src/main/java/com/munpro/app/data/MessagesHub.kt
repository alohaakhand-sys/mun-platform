package com.munpro.app.data

// Messages, one inbox for every role (redesign board 12). A dais line is a committee's private
// delegate <-> dais conversation threaded ACROSS sittings. The chat itself stays where the live
// console writes it (events/{e}/sessions/{s}/chat) and every message keeps the sitting it was sent
// in, so the website and firestore.rules need nothing new. Listeners are app-scoped and shared by
// the Messages tab, a thread, the live console's chat button and the drop-down banner: per line,
// one sittings query plus one chat query per recent sitting. Nothing polls.

import com.munpro.app.data.live.SessionRepo
import com.munpro.app.domain.Conference
import com.munpro.app.domain.SessionSeat
import com.munpro.app.domain.committeeOf
import com.munpro.app.domain.isAllocated
import com.munpro.app.domain.isDelegateApp
import com.munpro.app.domain.live.BROADCAST_THREAD
import com.munpro.app.domain.live.LiveSession
import com.munpro.app.domain.live.Phase
import com.munpro.app.domain.live.SessionChatMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer

/** A committee this account writes to as a delegate, or answers as the dais. */
data class DaisLine(
    val eventId: String,
    val eventTitle: String,
    val committee: String,
    /** "delegate": my own thread plus the committee's notices. "dais": every delegation's thread. */
    val side: String,
    val country: String = "",
    val appId: String = "",
) {
    val key: String get() = "$eventId|$committee|$side"
    val isDais: Boolean get() = side == SIDE_DAIS
}

const val SIDE_DELEGATE = "delegate"
const val SIDE_DAIS = "dais"

/** One sitting of the committee, as far as messaging cares. */
data class Sitting(
    val id: String,
    val dateStr: String,
    val open: Boolean,
    val onRoll: Boolean,
    /** Delegations on this sitting's roll: uid -> country. */
    val roster: Map<String, String> = emptyMap(),
)

/** A message with the sitting it was sent in. */
data class LineMessage(val m: SessionChatMessage, val sessionId: String, val dateStr: String)

data class LineFeed(val line: DaisLine, val sittings: List<Sitting>, val messages: List<LineMessage>, val denied: Boolean) {
    /** A sitting is running now. */
    val live: Boolean get() = sittings.any { it.open }

    /**
     * Where a new message goes. A delegate writes only into an open sitting whose roll they are on
     * (the /chat rule's terms); the dais may answer into the latest sitting, open or not.
     */
    val sendTarget: Sitting? get() =
        if (line.isDais) sittings.firstOrNull { it.open } ?: sittings.firstOrNull()
        else sittings.firstOrNull { it.open && it.onRoll }

    fun thread(key: String): List<LineMessage> = messages.filter { it.m.threadKey == key }

    /** Every delegation the dais can write to: anyone on a recent roll, plus anyone who wrote. */
    val delegations: Map<String, String> get() {
        val out = LinkedHashMap<String, String>()
        sittings.asReversed().forEach { s -> s.roster.forEach { (uid, country) -> out[uid] = country } }
        messages.forEach { lm -> if (lm.m.fromRole == "delegate" && lm.m.threadKey != BROADCAST_THREAD) out.putIfAbsent(lm.m.threadKey, lm.m.country) }
        return out
    }
}

/** A message that just arrived from the other side, for the drop-down banner. */
data class IncomingMessage(val line: DaisLine, val threadKey: String, val m: SessionChatMessage)

/** Sittings read per line: enough for a conference, bounded for the read budget. */
private const val RECENT_SITTINGS = 6
private const val SEEN_KEY = "mun-messages-seen"

@OptIn(ExperimentalCoroutinesApi::class)
class MessagesHub(
    private val auth: AuthRepo,
    private val conferences: ConferencesStore,
    private val content: ContentRepo,
    private val sessions: SessionRepo,
    private val saved: Saved,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val seenSerializer = MapSerializer(String.serializer(), Long.serializer())

    private val _seats = MutableStateFlow<List<SessionSeat>?>(null)
    /** Staff seats (chair, EB, organizer, observer), fetched once per sign-in; null until loaded. */
    val seats: StateFlow<List<SessionSeat>?> = _seats.asStateFlow()

    private val _feeds = MutableStateFlow<List<LineFeed>>(emptyList())
    val feeds: StateFlow<List<LineFeed>> = _feeds.asStateFlow()

    private val _seen = MutableStateFlow<Map<String, Long>>(emptyMap())
    val seen: StateFlow<Map<String, Long>> = _seen.asStateFlow()

    private val _incoming = MutableSharedFlow<IncomingMessage>(extraBufferCapacity = 4)
    val incoming: SharedFlow<IncomingMessage> = _incoming.asSharedFlow()

    /** Unread across every line: the Messages tab badge. */
    val unread: StateFlow<Int> = combine(_feeds, _seen) { feeds, seen -> feeds.sumOf { unreadIn(it, seen) } }
        .stateIn(scope, SharingStarted.Eagerly, 0)

    private var uid: String? = null

    /** The thread on screen ("lineKey#threadKey"): the banner stays quiet for it. */
    val viewing = MutableStateFlow<String?>(null)

    init {
        scope.launch {
            auth.state.map { (it as? AuthState.SignedIn)?.user?.uid }.distinctUntilChanged().collectLatest { u ->
                uid = u
                _feeds.value = emptyList()
                _seats.value = null
                if (u == null) return@collectLatest
                _seen.value = saved.read(SEEN_KEY, seenSerializer) ?: emptyMap()
                launch { refresh() }
                val known = HashSet<String>()
                val baselined = HashSet<String>()
                combine(conferences.state.map { it.conferences.orEmpty() }, _seats.filterNotNull()) { confs, seats -> linesFor(confs, seats) }
                    .distinctUntilChanged()
                    .flatMapLatest { lines -> if (lines.isEmpty()) flowOf(emptyList()) else combine(lines.map { lineFeed(it, u) }) { it.toList() } }
                    .collect { feeds ->
                        announce(feeds, u, known, baselined)
                        _feeds.value = feeds
                    }
            }
        }
    }

    /** Re-reads the staff seats (pull to refresh, after accepting a staff invite). */
    suspend fun refresh() {
        val u = uid ?: return
        _seats.value = runCatching { content.sessionSeats(u) }.getOrElse { _seats.value ?: emptyList() }
    }

    private fun linesFor(confs: List<Conference>, seats: List<SessionSeat>): List<DaisLine> {
        val delegate = confs.filter { isAllocated(it) && isDelegateApp(it.app) && !it.app.fromStaffSeat }.map {
            DaisLine(it.event.id, it.event.title, committeeOf(it.app), SIDE_DELEGATE, it.app.assignedCountry.orEmpty(), it.app.id)
        }
        val dais = seats.filter { it.dais }.map { DaisLine(it.eventId, it.event.title, it.committee, SIDE_DAIS) }
        return (delegate + dais).distinctBy { it.key }
    }

    private fun lineFeed(line: DaisLine, me: String): Flow<LineFeed> = channelFlow {
        val sittings = MutableStateFlow<List<LiveSession>?>(null)
        launch { sessions.committeeSittings(line.eventId, line.committee).collect { sittings.value = it.take(RECENT_SITTINGS) } }
        // The session doc changes on every timer tick; only a new or dropped sitting re-subscribes chat.
        val chat = sittings.filterNotNull().map { list -> list.map { it.id to it.dateStr } }.distinctUntilChanged().flatMapLatest { ids ->
            if (ids.isEmpty()) flowOf(emptyList())
            else combine(ids.map { (id, day) ->
                (if (line.isDais) sessions.chatInbox(line.eventId, id) else sessions.myThread(line.eventId, id, me)).map { Triple(id, day, it) }
            }) { it.toList() }
        }
        combine(sittings.filterNotNull(), chat) { ss, feeds ->
            LineFeed(
                line = line,
                sittings = ss.map { Sitting(it.id, it.dateStr, it.phase != Phase.CLOSED && !it.finalized, me in it.attendance.keys, it.attendance.mapValues { (_, a) -> a.country }) },
                messages = feeds.flatMap { (id, day, f) -> f.messages.map { LineMessage(it, id, day) } }.sortedBy { it.m.sentAt ?: 0L },
                denied = feeds.isNotEmpty() && feeds.all { it.third.denied },
            )
        }.collect { send(it) }
    }

    /** New messages from the other side, after each line's first load (that one is history). */
    private fun announce(feeds: List<LineFeed>, me: String, known: HashSet<String>, baselined: HashSet<String>) {
        for (f in feeds) {
            val fresh = f.messages.filter { known.add(f.line.key + "#" + it.m.id) }
            if (baselined.add(f.line.key)) continue
            fresh.filter { it.m.fromUid != me && fromOtherSide(f.line, it.m) }.forEach {
                _incoming.tryEmit(IncomingMessage(f.line, it.m.threadKey, it.m))
            }
        }
    }

    fun markSeen(line: DaisLine, threadKey: String, lastAt: Long) {
        val k = seenKey(line, threadKey)
        if ((_seen.value[k] ?: 0L) >= lastAt) return
        val next = _seen.value + (k to lastAt)
        _seen.value = next
        scope.launch { saved.write(SEEN_KEY, seenSerializer, next) }
    }

    /** The live console's chat sheet was looked at: the same messages are read in Messages too. */
    fun markDelegateSeen(eventId: String, me: String, lastAt: Long) {
        _feeds.value.filter { it.line.eventId == eventId && !it.line.isDais }.forEach { f ->
            markSeen(f.line, me, lastAt)
            markSeen(f.line, BROADCAST_THREAD, lastAt)
        }
    }

    fun unreadIn(feed: LineFeed, seen: Map<String, Long> = _seen.value, threadKey: String? = null): Int =
        feed.messages.count { lm ->
            (threadKey == null || lm.m.threadKey == threadKey) &&
                fromOtherSide(feed.line, lm.m) &&
                (lm.m.sentAt ?: 0L) > (seen[seenKey(feed.line, lm.m.threadKey)] ?: 0L)
        }

    /**
     * Sends into [LineFeed.sendTarget]. [threadKey] is the delegate's uid for a private note, or
     * "@all" for the dais's notice to the committee.
     */
    suspend fun send(feed: LineFeed, threadKey: String, text: String) {
        val u = auth.user ?: throw IllegalStateException("Not signed in.")
        val target = feed.sendTarget ?: throw IllegalStateException("No sitting to send into.")
        val name = auth.profile?.fullName?.ifEmpty { null } ?: u.displayName.orEmpty()
        val (e, s) = feed.line.eventId to target.id
        when {
            !feed.line.isDais -> sessions.sendDelegateNote(e, s, u.uid, name, feed.line.country, text)
            threadKey == BROADCAST_THREAD -> sessions.sendDaisBroadcast(e, s, u.uid, name, text)
            else -> sessions.sendDaisReply(e, s, threadKey, u.uid, name, text)
        }
    }

    fun feed(lineKey: String): LineFeed? = _feeds.value.firstOrNull { it.line.key == lineKey }

    private fun seenKey(line: DaisLine, threadKey: String) = "${line.key}#$threadKey"

    private fun fromOtherSide(line: DaisLine, m: SessionChatMessage): Boolean =
        if (line.isDais) m.fromRole != "dais" else m.fromRole == "dais"
}
