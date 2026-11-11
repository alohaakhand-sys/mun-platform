package com.munpro.app.ui.live

// Everything the delegate's live screen needs about today's sitting (port of useLive in
// mobile/src/lib/live.ts and useLiveChat in lib/chat.ts). Nothing here decides floor logic: who
// holds the floor comes from floorHolder/floorSpeechClock, what the delegate may do from
// capabilitiesFor, whether a motion is in order from motionsInOrder — the web's own functions.
//
// Listeners are opened by composition and closed when the screen leaves, and only in sequence:
// live control → (open) session → (sitting) my points / hands / motions. An idle committee costs
// one listener.

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.munpro.app.AppGraph
import com.munpro.app.data.live.SessionRepo
import com.munpro.app.domain.Conference
import com.munpro.app.domain.committeeOf
import com.munpro.app.domain.watchesOnly
import com.munpro.app.domain.live.BROADCAST_THREAD
import com.munpro.app.domain.live.DelegateCapabilities
import com.munpro.app.domain.live.EventLiveControl
import com.munpro.app.domain.live.FloorRequest
import com.munpro.app.domain.live.LiveGateVerdict
import com.munpro.app.domain.live.LiveSession
import com.munpro.app.domain.live.Loadable
import com.munpro.app.domain.live.Motion
import com.munpro.app.domain.live.ParticipationIdentity
import com.munpro.app.domain.live.RaisedPoint
import com.munpro.app.domain.live.SessionChatMessage
import com.munpro.app.domain.live.capabilitiesFor
import com.munpro.app.domain.live.makeSessionId
import com.munpro.app.domain.live.resolveLiveGate
import com.munpro.app.domain.live.sessionDateStr
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/** Re-renders every `ms` so countdowns move. */
@Composable
fun rememberNow(ms: Long = 1000): Long {
    val now by produceState(System.currentTimeMillis()) {
        while (true) {
            delay(ms - System.currentTimeMillis() % ms)
            value = System.currentTimeMillis()
        }
    }
    return now
}

data class LiveState(
    val eventId: String,
    val sessionId: String,
    val committee: String,
    val dateStr: String,
    val identity: ParticipationIdentity?,
    val control: Loadable<EventLiveControl>,
    val session: LiveSession?,
    val sessionLoaded: Boolean,
    val verdict: LiveGateVerdict,
    val caps: DelegateCapabilities?,
    val points: List<RaisedPoint>,
    val hands: List<FloorRequest>,
    val motions: List<Motion>,
    val now: Long,
)

@Composable
fun rememberLive(conf: Conference?, uid: String?): LiveState {
    val repo = AppGraph.sessions
    val committee = conf?.let { committeeOf(it.app) }.orEmpty()
    val eventId = conf?.event?.id.orEmpty()
    // The session id is committee + the day IN THE EVENT'S TIMEZONE — must match the chair's.
    val dateStr = remember(conf?.event?.timeZone) { sessionDateStr(conf?.event?.timeZone) }
    val sessionId = if (committee.isNotEmpty()) makeSessionId(committee, dateStr) else ""

    val identity = if (conf != null && uid != null) ParticipationIdentity(uid, conf.app.assignedCountry.orEmpty(), conf.app.id, eventId, committee, dateStr) else null

    val control by remember(eventId) {
        if (eventId.isEmpty()) flowOf(Loadable.Loading) else repo.liveControl(eventId).map<EventLiveControl?, Loadable<EventLiveControl>> { Loadable.Ready(it) }
    }.collectAsState(Loadable.Loading)

    // Only watch the sitting once the organiser has opened Live MUN — the web gate's rule — and
    // our membership marker has been asked for (the read rules check it; a denied listener is
    // never retried). A failed ask still proceeds: being on the roll also opens the sitting.
    val open = (control as? Loadable.Ready)?.value?.sessionsOpen == true
    val memberReady by produceState(false, uid, eventId) {
        if (uid != null && eventId.isNotEmpty()) com.munpro.app.data.Membership.ensure(uid, eventId)
        value = true
    }
    val sessionState by remember(open, memberReady, eventId, sessionId) {
        if (!open || !memberReady || sessionId.isEmpty()) flowOf<Loadable<LiveSession>>(Loadable.Loading) else repo.session(eventId, sessionId).map<LiveSession?, Loadable<LiveSession>> { Loadable.Ready(it) }
    }.collectAsState(Loadable.Loading)
    val session = (sessionState as? Loadable.Ready)?.value

    // A watch-only viewer reads the sitting and nothing of its own (they have no points, hands
    // or motions, and those listeners would only be refused).
    val watching = conf?.let(::watchesOnly) == true
    val sitting = session != null && uid != null && !watching
    val points by remember(sitting, eventId, sessionId, uid) { if (sitting) repo.myPoints(eventId, sessionId, uid!!) else flowOf(emptyList()) }.collectAsState(emptyList())
    val hands by remember(sitting, eventId, sessionId, uid) { if (sitting) repo.myHands(eventId, sessionId, uid!!) else flowOf(emptyList()) }.collectAsState(emptyList())
    val motions by remember(sitting, eventId, sessionId, uid) { if (sitting) repo.myMotions(eventId, sessionId, uid!!) else flowOf(emptyList()) }.collectAsState(emptyList())

    val verdict = if (conf == null) LiveGateVerdict("loading") else resolveLiveGate(control, sessionState, "delegate", committee, dateStr)
    val now = rememberNow()
    val caps = if (session != null && uid != null) capabilitiesFor(session, uid, now) else null
    return LiveState(eventId, sessionId, committee, dateStr, identity, control, session, sessionState is Loadable.Ready, verdict, caps, points, hands, motions, now)
}

// ── Chat with the dais (useLiveChat) ────────────────────────────────────────────────────────────

/** Same key shape as the web (`useChatSeen`): the newest dais/announcement message looked at. */
private fun seenKey(eventId: String, sessionId: String) = "mun-live-chat-seen:$eventId:$sessionId"

class LiveChat(
    val messages: List<SessionChatMessage>,
    val unread: Int,
    val denied: Boolean,
    val markSeen: () -> Unit,
    val send: suspend (name: String, country: String, text: String) -> Unit,
)

@Composable
fun rememberLiveChat(eventId: String, sessionId: String, uid: String?, enabled: Boolean): LiveChat {
    val repo = AppGraph.sessions
    val feed by remember(enabled, eventId, sessionId, uid) {
        if (!enabled || eventId.isEmpty() || sessionId.isEmpty() || uid == null) flowOf(SessionRepo.ChatFeed(emptyList(), false))
        else repo.myThread(eventId, sessionId, uid)
    }.collectAsState(SessionRepo.ChatFeed(emptyList(), false))
    var seen by remember(eventId, sessionId) { mutableLongStateOf(0L) }
    LaunchedEffect(eventId, sessionId) { if (eventId.isNotEmpty() && sessionId.isNotEmpty()) seen = AppGraph.saved.getString(seenKey(eventId, sessionId))?.toLongOrNull() ?: 0L }

    // Unread = anything the dais wrote (to me or to everyone) after my last look.
    val unread = feed.messages.count { it.fromRole == "dais" && (it.sentAt ?: 0) > seen }
    return LiveChat(
        messages = feed.messages,
        unread = unread,
        denied = feed.denied,
        markSeen = {
            val last = feed.messages.maxOfOrNull { it.sentAt ?: 0L } ?: 0L
            if (last > seen) {
                seen = last
                AppGraph.scope.launch { AppGraph.saved.putString(seenKey(eventId, sessionId), last.toString()) }
            }
            if (uid != null && last > 0) AppGraph.messages.markDelegateSeen(eventId, uid, last)
        },
        send = { name, country, text -> if (uid != null) repo.sendDelegateNote(eventId, sessionId, uid, name, country, text) },
    )
}

fun isAnnouncement(m: SessionChatMessage) = m.threadKey == BROADCAST_THREAD

/** A small holder for "which sheet is up" — one sheet at a time, like the RN screen. */
class SheetState { var current by mutableStateOf<String?>(null) }
