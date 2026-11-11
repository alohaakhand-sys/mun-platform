package com.munpro.app.ui.chair

// The chair side of a sitting (port of mobile/src/lib/chair.ts useChairLive and lib/chat.ts
// useDaisChat). The listeners match what the web console holds (session, requests, points, motion
// queue), opened only once the organiser has opened Live MUN and a sitting exists, so an idle
// committee costs nothing.

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.munpro.app.AppGraph
import com.munpro.app.data.MunJson
import com.munpro.app.data.live.SessionRepo
import com.munpro.app.domain.EventData
import com.munpro.app.domain.belongsToCommittee
import com.munpro.app.domain.live.BROADCAST_THREAD
import com.munpro.app.domain.live.ChatThread
import com.munpro.app.domain.live.DelegateRosterEntry
import com.munpro.app.domain.live.EventLiveControl
import com.munpro.app.domain.live.FloorRequest
import com.munpro.app.domain.live.LiveSession
import com.munpro.app.domain.live.Loadable
import com.munpro.app.domain.live.Motion
import com.munpro.app.domain.live.ParticipationIdentity
import com.munpro.app.domain.live.RaisedPoint
import com.munpro.app.domain.live.SessionChatMessage
import com.munpro.app.domain.live.foldThreads
import com.munpro.app.domain.live.makeSessionId
import com.munpro.app.domain.live.sessionDateStr
import com.munpro.app.domain.live.totalUnread
import com.munpro.app.ui.live.rememberNow
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer

class ChairLive(
    val eventId: String,
    val committee: String,
    val event: EventData?,
    val dateStr: String,
    val sessionId: String,
    val control: Loadable<EventLiveControl>,
    val sessionState: Loadable<LiveSession>,
    val requests: List<FloorRequest>,
    val points: List<RaisedPoint>,
    val motions: List<Motion>,
    /** null while loading. */
    val roster: List<DelegateRosterEntry>?,
    val now: Long,
    val uid: String,
) {
    val session: LiveSession? get() = (sessionState as? Loadable.Ready)?.value
    val open: Boolean get() = (control as? Loadable.Ready)?.value?.sessionsOpen == true

    fun identityFor(delegateId: String): ParticipationIdentity {
        val r = roster?.firstOrNull { it.delegateId == delegateId }
        val a = session?.attendance?.get(delegateId)
        return ParticipationIdentity(
            delegateId, r?.country?.ifEmpty { null } ?: a?.country.orEmpty(),
            r?.applicationId?.ifEmpty { null } ?: a?.applicationId.orEmpty(), eventId, committee, dateStr,
        )
    }
}

@Composable
fun rememberChairLive(eventId: String, committee: String, uid: String): ChairLive {
    val repo = AppGraph.sessions
    var event by remember(eventId) { mutableStateOf<EventData?>(null) }
    LaunchedEffect(eventId) { event = AppGraph.events.getEventById(eventId) }

    // Same day key as the delegate side: the event's own timezone, or the ids won't meet.
    val dateStr = remember(event?.timeZone) { sessionDateStr(event?.timeZone) }
    val sessionId = if (committee.isNotEmpty()) makeSessionId(committee, dateStr) else ""

    val control by remember(eventId) { repo.liveControl(eventId).map<EventLiveControl?, Loadable<EventLiveControl>> { Loadable.Ready(it) } }
        .collectAsState(Loadable.Loading)
    val open = (control as? Loadable.Ready)?.value?.sessionsOpen == true
    val ready = open && sessionId.isNotEmpty() && event != null
    val sessionState by remember(ready, eventId, sessionId) {
        if (!ready) flowOf<Loadable<LiveSession>>(Loadable.Loading) else repo.session(eventId, sessionId).map<LiveSession?, Loadable<LiveSession>> { Loadable.Ready(it) }
    }.collectAsState(Loadable.Loading)

    val sitting = (sessionState as? Loadable.Ready)?.value != null
    val requests by remember(sitting, eventId, sessionId) { if (sitting) repo.requests(eventId, sessionId) else flowOf(emptyList()) }.collectAsState(emptyList())
    val points by remember(sitting, eventId, sessionId) { if (sitting) repo.points(eventId, sessionId) else flowOf(emptyList()) }.collectAsState(emptyList())
    val motions by remember(sitting, eventId, sessionId) { if (sitting) repo.motionQueue(eventId, sessionId) else flowOf(emptyList()) }.collectAsState(emptyList())

    // The roster, built exactly like ChairSessionConsole: approved delegates whose effective
    // committee is this one. Read once; it changes only when allocations do.
    var roster by remember(eventId, committee) { mutableStateOf<List<DelegateRosterEntry>?>(null) }
    LaunchedEffect(eventId, committee) {
        roster = runCatching {
            AppGraph.applications.getApplicationsByEvent(eventId)
                .filter { Regex("delegate", RegexOption.IGNORE_CASE).containsMatchIn(it.role) && it.status == "approved" && belongsToCommittee(it, committee) }
                .map { DelegateRosterEntry(it.userId, it.assignedCountry.orEmpty(), it.id, it.applicantName.orEmpty()) }
                .filter { it.delegateId.isNotEmpty() }
        }.getOrDefault(emptyList())
    }

    val now = rememberNow()
    return ChairLive(eventId, committee, event, dateStr, sessionId, control, sessionState, requests, points, motions, roster, now, uid)
}

// ── The dais inbox (useDaisChat) ────────────────────────────────────────────────────────────────

class DaisChat(
    val threads: List<ChatThread>,
    val unread: Int,
    val denied: Boolean,
    val markSeen: (threadKey: String, lastAt: Long) -> Unit,
    val reply: suspend (threadKey: String, name: String, text: String) -> Unit,
)

private val seenSerializer = MapSerializer(String.serializer(), Long.serializer())

/**
 * Mount ONLY for someone the /chat rule accepts as dais. A listener the rule denies is not retried by
 * Firestore, and the web console hits exactly that when its inbox mounts in the instant the chair
 * creates the session (the rule reads the session doc). So a denial is retried a few times here,
 * a couple of seconds apart, before the inbox says it can't read.
 */
@Composable
fun rememberDaisChat(eventId: String, sessionId: String, uid: String, enabled: Boolean): DaisChat {
    val repo = AppGraph.sessions
    var attempt by remember(eventId, sessionId) { mutableIntStateOf(0) }
    val feed by remember(enabled, eventId, sessionId, attempt) {
        if (!enabled || eventId.isEmpty() || sessionId.isEmpty()) flowOf(SessionRepo.ChatFeed(emptyList(), false)) else repo.chatInbox(eventId, sessionId)
    }.collectAsState(SessionRepo.ChatFeed(emptyList(), false))
    LaunchedEffect(feed.denied, attempt) {
        if (feed.denied && attempt < 3) { delay(2000); attempt++ }
    }

    val key = "mun-live-chat-seen:$eventId:$sessionId:threads"
    var seen by remember(key) { mutableStateOf<Map<String, Long>>(emptyMap()) }
    LaunchedEffect(key) { seen = AppGraph.saved.getString(key)?.let { runCatching { MunJson.decodeFromString(seenSerializer, it) }.getOrNull() } ?: emptyMap() }

    val messages: List<SessionChatMessage> = feed.messages
    val threads = remember(messages, seen) { foldThreads(messages, seen, "dais") }
    return DaisChat(
        threads = threads,
        unread = totalUnread(threads),
        denied = feed.denied && attempt >= 3,
        markSeen = { k, lastAt ->
            if ((seen[k] ?: 0) < lastAt) {
                val next = seen + (k to lastAt)
                seen = next
                AppGraph.scope.launch { AppGraph.saved.putString(key, MunJson.encodeToString(seenSerializer, next)) }
            }
        },
        reply = { k, name, text ->
            if (k == BROADCAST_THREAD) repo.sendDaisBroadcast(eventId, sessionId, uid, name, text)
            else repo.sendDaisReply(eventId, sessionId, k, uid, name, text)
        },
    )
}
