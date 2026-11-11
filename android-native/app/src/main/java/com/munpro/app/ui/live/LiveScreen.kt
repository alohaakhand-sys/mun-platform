package com.munpro.app.ui.live

// The committee floor on a phone (RN app/live/[id].tsx + the mockup's "In session" screens).
// Every rule comes from the ported session logic (LiveState.kt); this file only lays it out:
// one big clock, the speaker, your place in line, and Raise Placard at the bottom.

import androidx.compose.foundation.layout.offset
import com.munpro.app.ui.kit.tap
import com.munpro.app.ui.kit.rememberPress
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.alpha
import androidx.compose.foundation.border
import com.munpro.app.ui.kit.Flag
import android.Manifest
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.domain.countryName
import com.munpro.app.domain.findConference
import com.munpro.app.domain.flagEmoji
import com.munpro.app.domain.fmtClock
import com.munpro.app.domain.live.DuplicateMotionError
import com.munpro.app.domain.live.LiveSession
import com.munpro.app.domain.live.Motion
import com.munpro.app.domain.live.SpeakerSlot
import com.munpro.app.domain.live.floorHolder
import com.munpro.app.domain.live.floorQueue
import com.munpro.app.domain.live.floorSpeechClock
import com.munpro.app.domain.live.gateHeadline
import com.munpro.app.domain.live.holdsTheFloor
import com.munpro.app.domain.live.isSeated
import com.munpro.app.domain.live.liveGateCopy
import com.munpro.app.domain.live.motionMeta
import com.munpro.app.domain.live.motionSummary
import com.munpro.app.domain.live.stageFocus
import com.munpro.app.domain.live.stageLabel
import com.munpro.app.domain.live.timerRemainingMs
import com.munpro.app.domain.live.turnEtaMs
import com.munpro.app.domain.live.videoEnded
import com.munpro.app.ui.chat.ChatSheet
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.CheckMark
import com.munpro.app.ui.kit.Emoji
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.Inter
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.RoundButton
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.Space
import com.munpro.app.ui.kit.TextLink
import com.munpro.app.ui.kit.TrailingAction
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.kit.rememberHaptics
import com.munpro.app.ui.live.video.VideoRoom
import com.munpro.app.ui.live.video.VideoStage
import com.munpro.app.ui.live.video.rememberLiveVideo
import com.munpro.app.ui.pass.Pass
import com.munpro.app.ui.pass.PassSize
import kotlinx.coroutines.launch

private val MOTION_STATUS = mapOf(
    "pending" to "Pending", "recognized" to "Recognised", "voting" to "In vote", "passed" to "Passed",
    "executed" to "Carried out", "failed" to "Failed", "dropped" to "Dismissed",
)
private const val RECOGNISED_WINDOW_MS = 90_000L
// "none" omitted on purpose: it is the service's DEFAULT on every new slot, never "yielded back".
private val YIELD_STATUS = mapOf("questions" to "Yielded to questions", "comments" to "Yielded to comments", "delegate" to "Yielded to a delegation")
private const val ASKED_NOTIFY = "munpro.askedNotify"
private const val FAIL_MSG = "That didn't go through. Check your connection and try again."

@Composable
fun LiveScreen(appId: String, openChat: Boolean) {
    val c = palette
    val nav = com.munpro.app.ui.LocalNav.current
    val haptics = rememberHaptics()
    val scope = rememberCoroutineScope()
    val alerts = LocalAlerts.current
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()
    val conf = findConference(confs.conferences, appId)
    val user = AppGraph.auth.user
    val profile = AppGraph.auth.profile
    val live = rememberLive(conf, user?.uid)
    // AI in the live floor counts as inside this event (AiScope; Pro events don't use the quota).
    androidx.compose.runtime.LaunchedEffect(live.eventId) { if (live.eventId.isNotEmpty()) com.munpro.app.data.AiScope.eventId = live.eventId }
    val repo = AppGraph.sessions
    var sheet by remember { mutableStateOf(false) }
    var chatOpen by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var dismissed by remember { mutableStateOf<String?>(null) }
    val myBallots = remember { mutableStateMapOf<String, String>() }

    val session = live.session
    val identity = live.identity
    val caps = live.caps
    // Top level, not inside the sheet: the badge has to count while the chat is closed.
    val watching = conf?.let { com.munpro.app.domain.watchesOnly(it) } == true
    val chat = rememberLiveChat(live.eventId, live.sessionId, user?.uid, enabled = session != null && user != null && !watching)
    var openedChat by remember { mutableStateOf(false) }
    LaunchedEffect(openChat, session != null) { if (openChat && session != null && !openedChat) { chatOpen = true; openedChat = true } }

    // ---- the floor on the lock screen (FloorService) while this screen is open ----
    val context = LocalContext.current
    val lockScreen by AppGraph.lockScreenFloor.collectAsStateWithLifecycle()
    var canNotify by remember { mutableStateOf(FloorService.canNotify(context)) }
    val askNotify = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { canNotify = it }
    LaunchedEffect(Unit) {
        // Asked once, the first time a sitting is opened; after that it's the system setting's call.
        if (!canNotify && Build.VERSION.SDK_INT >= 33 && AppGraph.saved.getString(ASKED_NOTIFY) == null) {
            AppGraph.saved.putString(ASKED_NOTIFY, "1")
            askNotify.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
    val sitting = session != null && identity != null
    DisposableEffect(lockScreen && canNotify && sitting, live.eventId, live.sessionId, identity?.delegateId) {
        if (lockScreen && canNotify && sitting) {
            FloorService.start(context, live.eventId, live.sessionId, identity!!.delegateId, live.committee, "munpro://live/$appId")
        }
        onDispose { FloorService.stop(context) }
    }

    // ---- entry gate ----
    if (live.verdict.kind != "pass" || session == null || identity == null || caps == null) {
        val copy = if (live.verdict.kind == "loading") null else liveGateCopy(live.verdict, conf?.event?.title, (live.control as? com.munpro.app.domain.live.Loadable.Ready)?.value)
        return Screen(title = live.committee.ifEmpty { "Live session" }, back = "Committee", tabBar = false, live = true) {
            Empty(copy?.title ?: "Connecting…", copy?.let { listOfNotNull(it.body, it.note).joinToString("\n\n") } ?: "Checking whether the committee is sitting.")
            if (live.verdict.kind == "ceremony_only") {
                val k = live.verdict.ceremony ?: "opening"
                MunButton("Join ${com.munpro.app.domain.live.ceremonyLabel(k)}", { nav.go(com.munpro.app.nav.CeremonyRoute(live.eventId, k)) })
            }
            if (openChat) Text("Messages with the dais open once your committee is in session.", style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 16.dp))
        }
    }

    // ---- watch-only (observer / press / faculty advisor applications): the web's WatchConsole ----
    if (watching) {
        val watchRoom = remember(live.eventId, live.committee, live.dateStr, identity.delegateId) {
            VideoRoom(live.eventId, live.committee, live.dateStr, identity.delegateId, observer = true)
        }
        val watchVideo = rememberLiveVideo(watchRoom, amHost = false, onStage = false, ended = videoEnded(session))
        val watchPresence = rememberPresence(live.eventId, live.sessionId, identity.delegateId, "", null, null, enabled = !videoEnded(session), publishSelf = false)
        return Screen(
            back = "Committee", navTitle = live.committee, navSubtitle = conf?.event?.title, tabBar = false, live = true, gap = 20.dp,
            bottomBar = { com.munpro.app.ui.chair.WatchingBanner(session, conf!!.app.role.ifEmpty { "Observer" }) },
        ) {
            com.munpro.app.ui.chair.WatchBoard(session, live.now, conf!!.app.role.ifEmpty { "Observer" }, watchVideo, identity.delegateId, watchPresence)
        }
    }

    val now = live.now
    val me = identity.delegateId
    val holder = floorHolder(session)
    val speech = floorSpeechClock(session)
    val speechLeft = timerRemainingMs(speech.timer, now)
    // The big clock: the vote's while one runs (board 04 "Vote"), else the caucus, else the speech.
    val bigClock = session.activeVote?.timer?.let { timerRemainingMs(it, now) }
        ?: if (session.caucus != null) timerRemainingMs(session.caucus.totalTimer, now) else if (holder != null) speechLeft else null
    val queue: List<SpeakerSlot> = floorQueue(session)
    // Time-boxed like the web's RecognizedPointCard. A null resolvedAt is the write-through snapshot.
    val recognised = live.points.firstOrNull { p ->
        p.status == "recognized" && p.id != dismissed && (p.resolvedAt == null || now - p.resolvedAt < RECOGNISED_WINDOW_MS)
    }
    val pendingPoint = live.points.firstOrNull { it.status == "pending" }
    val vote = session.activeVote
    vote?.ballots?.get(me)?.let { myBallots[vote.voteId] = it }
    val myAttendance = session.attendance[me]?.status
    // Chat send gate, word for word the web's: the /chat rule blocks the write either way.
    val onRoll = session.attendance[me] != null
    val sittingOpen = !session.finalized && session.phase != "closed"
    val chatBlocked = if (!onRoll) "You're not on today's roll. Ask the chair to mark you present." else if (!sittingOpen) "This session is closed. The record is read-only." else null
    val signupKind = when (caps.canJoinSignup) { "gsl" -> "speak"; "caucus" -> "caucus_signup"; else -> null }
    val mySignup = signupKind?.let { k -> live.hands.firstOrNull { it.kind == k && it.status == "pending" } }
    val onList = queue.any { it.delegateId == me }

    fun run(fn: suspend () -> Unit, after: () -> Unit = {}) {
        error = null
        scope.launch {
            try { fn(); haptics.success(); after() }
            catch (e: DuplicateMotionError) { error = e.message }
            catch (_: Exception) { error = FAIL_MSG }
        }
    }
    suspend fun runOk(fn: suspend () -> Unit): Boolean {
        error = null
        return try { fn(); haptics.success(); true }
        catch (e: DuplicateMotionError) { error = e.message; false }
        catch (_: Exception) { error = FAIL_MSG; false }
    }

    val name = profile?.fullName?.ifEmpty { null } ?: user?.displayName.orEmpty()
    val (e, s) = live.eventId to live.sessionId

    // ---- live video: audience, broadcasting while the chair has us on `live.stage` ----
    val videoRoom = remember(live.eventId, live.committee, live.dateStr, me) { VideoRoom(live.eventId, live.committee, live.dateStr, me) }
    val video = rememberLiveVideo(videoRoom, amHost = false, onStage = session.live?.stage.orEmpty().contains(me), ended = videoEnded(session))
    val presence = rememberPresence(live.eventId, live.sessionId, me, countryName(identity.country), identity.country, null,
        enabled = !videoEnded(session), publishSelf = true)

    Screen(
        back = "Committee", navTitle = live.committee, navSubtitle = conf?.event?.title, tabBar = false, live = true, gap = 20.dp,
        navRight = { RoundButton(Icons.chat, "Message the dais", { chatOpen = true }, badge = chat.unread) },
        bottomBar = {
            if (pendingPoint != null) {
                // The mockup's "Point waiting": the bar becomes the way to take it back.
                MunButton("Withdraw Point", { run({ repo.cancelPoint(e, s, pendingPoint.id) }) }, variant = ButtonVariant.Tinted, destructive = true)
            } else {
                MunButton("Raise Placard", { haptics.medium(); error = null; sheet = true }, icon = Icons.flag)
            }
        },
    ) {
        ClockBlock(session, bigClock, now) {
            // What the floor is open for — the web's own copy; a chair's label is dropped once the floor overrides it.
            Text(
                gateHeadline(if (caps.gateOverridden) session.floorGate?.copy(label = null) else session.floorGate, caps.effectiveKind),
                style = Type.headline, color = c.label, textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = if (bigClock != null) 4.dp else 18.dp),
            )
            caps.expiresAt?.let { Text("Closes in ${fmtClock(it - now)}", style = Type.subhead.copy(fontFeatureSettings = "tnum"), color = c.label2) }
        }

        video?.let { v -> VideoStage(v, stageFocus(session), me, label = { uid -> if (uid == me) "You" else stageLabel(session, uid) }, presence = presence) }

        ErrorText(error)

        // ---- who has the floor ----
        if (holder != null) {
            Section {
                item {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Flag(holder.country, 24f)
                            Column(Modifier.weight(1f)) {
                                Text(if (holder.delegateId == me) "You have the floor" else countryName(holder.country), style = Type.headline, color = c.label)
                                Text(if (holder.viaYield == true) "Speaking on a yield" else YIELD_STATUS[holder.yieldTo.orEmpty()] ?: "Speaking", style = Type.subhead, color = c.label2)
                            }
                            Text(fmtClock(speechLeft), fontFamily = Inter, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, color = c.label, style = Type.body.copy(fontFeatureSettings = "tnum"))
                        }
                        SpeechBar(speech.timer?.durationMs?.takeIf { it > 0 }?.let { speechLeft.toFloat() / it } ?: 0f)
                    }
                }
            }
        }

        MyFloor(e, s, session, identity, live.hands, now)

        if (pendingPoint != null) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(POINT_TITLE[pendingPoint.type] ?: pendingPoint.type, style = Type.headline, color = c.label)
                Text("Sent to the chair. You'll be told when you're recognised.", style = Type.subhead, color = c.label2)
            }
        }

        // ---- roll call: one answer per delegate; after that only the chair moves you ----
        if (caps.canDeclareAttendance) {
            RollCallCard(identity.country, listOfNotNull(conf?.event?.title, live.committee.ifEmpty { null }).joinToString(" · ")) { st ->
                run({ repo.declareOwnAttendance(e, s, identity, st) })
            }
        } else if (!isSeated(myAttendance)) {
            com.munpro.app.ui.kit.Notice("Not marked present", caps.lockReason["canDeclareAttendance"] ?: "Waiting for roll call")
            Text(
                "The chair seats you during roll call. If you're in the room and still not marked, raise it with the dais.",
                style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 16.dp).offset(y = (-10).dp),
            )
        }

        // ---- signups are short windows, so joining lives on the main screen ----
        if (signupKind != null) {
            val caucus = session.caucus
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                // The gate headline above already says the list is open; a caucus adds what it's on.
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    if (caucus?.kind == "moderated") {
                        Text(listOfNotNull(caucus.topic.ifEmpty { null }?.let { "Moderated caucus on $it" }, caucus.perSpeakerSecs?.takeIf { it > 0 }?.let { "$it s each" }).joinToString(", "), style = Type.subhead, color = c.label2, textAlign = TextAlign.Center)
                    }
                }
                when {
                    onList -> MunButton("You're on the list", {}, variant = ButtonVariant.Tinted, enabled = false)
                    mySignup != null -> {
                        MunButton("Withdraw", { run({ repo.cancelHand(e, s, mySignup.id) }) }, variant = ButtonVariant.Tinted, destructive = true)
                        Text("Asked to speak. The chair adds you from the requests.", style = Type.footnote, color = c.label2, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                    }
                    else -> MunButton("Join Speakers List", { run({ repo.joinSignup(e, s, identity, session.floorGate, session.caucus?.caucusId) }) })
                }
            }
        }

        // ---- vote ----
        if (vote != null) {
            VoteCard(session, me, caps.canCastBallot, now, live.hands,
                onCast = { b ->
                    scope.launch {
                        val label = mapOf("yes" to "For", "no" to "Against", "abstain" to "Abstain")[b]
                        if (alerts.confirm("Vote $label?", "On “${vote.motion}”. This is final. You can't change it afterwards.", "Vote $label")) {
                            run({ repo.castBallot(e, s, me, b) })
                        }
                    }
                },
                onChange = { pendingId -> run({ if (pendingId != null) repo.cancelHand(e, s, pendingId) else repo.requestVoteChange(e, s, identity, vote.voteId) }) },
            )
            if (vote.ballots?.get(me) != null) {
                // The pass stays raised while the vote stands (mockup "Vote").
                Pass(identity.country, live.committee, size = PassSize.Tiny, raisedExternally = true)
            }
        }

        // ---- published result ----
        val published = session.publishedResult
        if (vote == null && published != null) ResultCard(published, myBallots[published.voteId], identity.country)

        // ---- the list ----
        if (queue.isNotEmpty()) {
            Section(header = if (session.caucus != null) "Caucus speakers" else "Speakers list") {
                queue.forEachIndexed { i, q ->
                    val mine = q.delegateId == me
                    val eta = turnEtaMs(session, i, now)
                    cell(
                        if (mine) "${countryName(q.country)} (you)" else countryName(q.country),
                        tinted = mine, inset = 52.dp, chevron = false,
                        value = if (i == 0) "Next" else if (mine) "~${maxOf(1, Math.round(eta / 60_000.0))} min" else null,
                        leading = { Flag(q.country, 20f) },
                    )
                }
            }
        }

        // ---- papers: consent requests, my papers, write one ----
        PapersSection(
            e, s, session, identity, name,
            canIntroduce = "introduce_document" in caps.proposableMotionTypes, now = now,
            propose = { t, p -> runOk { repo.proposeMotion(e, s, identity, t, p) } },
        )

        if (live.motions.isNotEmpty()) {
            Section(header = "Your motions") {
                live.motions.take(6).forEach { m -> MotionRowCell(this, m) { run({ repo.cancelMotion(e, s, m.id) }) } }
            }
        }

        // ---- points I raised today, with how the chair ruled ----
        val ruled = live.points.filter { it.status != "pending" }
        if (ruled.isNotEmpty()) {
            Section(header = "Your points") {
                ruled.take(6).forEach { p ->
                    cell(POINT_TITLE[p.type] ?: p.type, chevron = false,
                        subtitle = listOfNotNull(p.note?.ifEmpty { null }?.let { "“$it”" }, p.chairNote?.ifEmpty { null }?.let { "Chair: “$it”" }).joinToString(". ").ifEmpty { null },
                        value = if (p.status == "recognized") "Recognised" else "Not recognised")
                }
            }
        }

        // ---- status (web StatusTool): low priority, so it sits at the end ----
        Section(header = "Status") {
            if (!caps.canDeclareAttendance && isSeated(myAttendance)) {
                cell(if (myAttendance == "present_and_voting") "Present and Voting" else "Present", subtitle = "${countryName(identity.country)} is seated", tinted = true, chevron = false, trailing = { CheckMark() })
            }
            cell("Committee session", value = com.munpro.app.domain.live.PHASE[session.phase] ?: session.phase, chevron = false)
            cell("Delegates present", value = "${session.attendance.values.count { isSeated(it.status) }}", chevron = false)
        }
    }

    // ---- the chair recognised my point: the whole screen says so ----
    if (recognised != null) RecognisedOverlay(countryName(identity.country), POINT_TITLE[recognised.type] ?: recognised.type, holder?.let { countryName(it.country) }, if (holder != null) speechLeft else null) { dismissed = recognised.id }

    ChatSheet(
        visible = chatOpen, onClose = { chatOpen = false }, messages = chat.messages, meUid = me, denied = chat.denied,
        canSend = onRoll && sittingOpen, disabledReason = chatBlocked, onSeen = chat.markSeen,
        onSend = { text -> chat.send(name, identity.country, text) },
    )

    RaiseSheet(
        visible = sheet, onDismiss = { sheet = false }, session = session, caps = caps, me = me,
        motions = live.motions, hands = live.hands, holdsFloor = holdsTheFloor(session, me), hasPendingPoint = pendingPoint != null, error = error,
        aiContext = com.munpro.app.ui.kit.AiContext(
            committee = live.committee, country = countryName(identity.country), phase = com.munpro.app.domain.live.PHASE[session.phase],
            agenda = session.agenda?.items?.getOrNull(session.agenda.activeIndex ?: -1)?.title,
            recentTopics = live.motions.mapNotNull { it.params.topic?.takeIf(String::isNotBlank) },
        ),
        onPoint = { t, note -> run({ repo.raisePoint(e, s, identity, t, note) }) { sheet = false } },
        onHand = { kind, existing -> run({ if (existing != null) repo.cancelHand(e, s, existing) else repo.joinSignup(e, s, identity, session.floorGate, session.caucus?.caucusId) }) { sheet = false } },
        onMotion = { t, p -> runOk { repo.proposeMotion(e, s, identity, t, p) } },
    )
}

private fun MotionRowCell(scope: com.munpro.app.ui.kit.SectionScope, m: Motion, onWithdraw: () -> Unit) {
    scope.cell(
        motionMeta(m.type).label, chevron = false,
        subtitle = listOf(motionSummary(m.params), m.chairNote?.ifEmpty { null }?.let { if (m.autoResolved == true) it else "Chair: “$it”" }.orEmpty()).filter { it.isNotEmpty() }.joinToString(". ").ifEmpty { null },
        value = if (m.status == "dropped" && m.autoResolved == true) "Out of order" else MOTION_STATUS[m.status],
        trailing = if (m.status == "pending") ({ TrailingAction("Withdraw") }) else null,
        onClick = if (m.status == "pending" && m.id.isNotEmpty()) onWithdraw else null,
    )
}

/** "France, are you present?" — two answers, said the way the rules of procedure say them. */
@Composable
private fun RollCallCard(code: String, where: String, onAnswer: (String) -> Unit) {
    val c = palette
    val shape = RoundedCornerShape(Radius.cell)
    Column(
        Modifier.fillMaxWidth().clip(shape).background(c.cell).border(1.5.dp, c.tint, shape).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Flag(code, 16f)
            Text("ROLL CALL · YOUR TURN", style = Type.caption.copy(fontSize = 11.sp), color = c.tint)
        }
        Text("${countryName(code)}, are you present?", style = Type.title2, color = c.label)
        if (where.isNotEmpty()) Text(where, style = Type.footnote, color = c.label2)
        MunButton("Present and Voting", { onAnswer("present_and_voting") }, Modifier.padding(top = 4.dp))
        MunButton("Present", { onAnswer("present") }, variant = ButtonVariant.Tinted)
        Text("Present and Voting means you can't abstain on substantive votes today. You can't change your answer once sent.", style = Type.footnote, color = c.label2)
    }
}

@Composable
private fun VoteCard(session: LiveSession, me: String, canCast: Boolean, now: Long, hands: List<com.munpro.app.domain.live.FloorRequest>, onCast: (String) -> Unit, onChange: (String?) -> Unit) {
    val c = palette
    val vote = session.activeVote!!
    val mine = vote.ballots?.get(me)
    val expired = vote.timer?.running == true && timerRemainingMs(vote.timer, now) <= 0
    val changeReq = hands.firstOrNull { it.kind == "vote_change" && it.status == "pending" && it.voteId == vote.voteId }
    val labels = mapOf("yes" to "For", "no" to "Against", "abstain" to "Abstain")
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            listOfNotNull(if (vote.voteType == "substantive") "Substantive" else "Procedural", if (vote.mode == "roll_call") "roll call" else if (vote.mode == "tally") "placards" else null).joinToString(" · ").uppercase(),
            style = Type.caption.copy(fontSize = 11.sp), color = c.label2,
        )
        Text(vote.motion, style = Type.title2, color = c.label)
        when {
            vote.mode == "tally" -> Text("Raise your placard in the room. The chair counts this vote.", style = Type.subhead, color = c.label2)
            mine != null -> {
                // Recorded (board 04 "Vote recorded"): the ballot, then the one way to reopen it.
                Column(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(Modifier.size(52.dp).clip(CircleShape).background(c.tint), contentAlignment = Alignment.Center) { com.munpro.app.ui.kit.SfIcon(Icons.check, c.onTint, size = 26.dp) }
                    Text("You voted ${labels[mine] ?: mine}", style = Type.title2, color = c.label)
                    Text("${vote.motion} · recorded. Results stay hidden until the chair publishes them.", style = Type.footnote, color = c.label2, textAlign = TextAlign.Center)
                    if (!expired) TextLink(if (changeReq != null) "Withdraw my reopen request" else "Ask the chair to reopen my ballot", { onChange(changeReq?.id) }, style = Type.subhead.copy(fontWeight = FontWeight.SemiBold))
                }
            }
            else -> {
                listOf("yes", "no", "abstain").forEach { b -> VoteOption(b, labels.getValue(b), enabled = canCast && !expired) { onCast(b) } }
                Text(
                    when { expired -> "Voting time is up."; canCast -> "One vote per delegation. Votes are final."; else -> "You can't vote on this one." },
                    style = Type.footnote, color = c.label2, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

/** For / Against / Abstain as the board draws them: a coloured row with its glyph in a disc. */
@Composable
private fun VoteOption(ballot: String, label: String, enabled: Boolean, onClick: () -> Unit) {
    val c = palette
    val press = rememberPress()
    val (bg, fg, glyph) = when (ballot) {
        "yes" -> Triple(c.tint, c.onTint, Icons.check)
        "no" -> Triple(c.redSoft, c.red, Icons.close)
        else -> Triple(c.fillSoft, c.label, com.munpro.app.ui.kit.Icons.minus)
    }
    Row(
        Modifier.fillMaxWidth().height(56.dp).alpha(if (enabled) 1f else 0.45f).clip(RoundedCornerShape(18.dp)).background(bg)
            .tap(press, enabled = enabled, label = "Vote $label", onClick = onClick).padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier.size(30.dp).clip(CircleShape).background(if (ballot == "yes") Color.White.copy(alpha = 0.2f) else if (ballot == "no") c.red else c.fill),
            contentAlignment = Alignment.Center,
        ) { com.munpro.app.ui.kit.SfIcon(glyph, if (ballot == "abstain") c.label else Color.White, size = 16.dp) }
        Text(label, style = Type.headline, color = fg)
    }
}

/** When the chair recognises you, the whole screen says so (mockup "Recognised"). */
@Composable
private fun RecognisedOverlay(country: String, point: String, holderCountry: String?, speechLeft: Long?, onDone: () -> Unit) {
    val c = palette
    val top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    BackHandler(onBack = onDone)
    com.munpro.app.ui.kit.LightStatusBarIcons()
    Box(Modifier.fillMaxSize().background(c.tint)) {
        Column(
            Modifier.fillMaxSize().padding(start = Space.gutter + 8.dp, end = Space.gutter + 8.dp, top = top + 40.dp, bottom = bottom + 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("THE CHAIR RECOGNISES ${country.uppercase()}", style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = c.onTint.copy(alpha = 0.75f))
            Text(point, fontFamily = Inter, fontWeight = FontWeight.ExtraBold, fontSize = 34.sp, lineHeight = 38.sp, color = c.onTint)
            Text(
                "State your point now. The floor returns to ${holderCountry ?: "the speaker"} when you finish.",
                style = Type.body.copy(fontSize = 17.sp, lineHeight = 24.sp), color = c.onTint.copy(alpha = 0.85f),
            )
            if (speechLeft != null) {
                Text(fmtClock(speechLeft), fontFamily = Inter, fontSize = 56.sp, color = c.onTint, style = Type.body.copy(fontFeatureSettings = "tnum"), modifier = Modifier.padding(top = 16.dp))
                Text("left on $holderCountry's clock", style = Type.subhead, color = c.onTint.copy(alpha = 0.75f))
            }
            Box(Modifier.weight(1f))
            Box(
                Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(Radius.button)).background(c.onTint),
                contentAlignment = Alignment.Center,
            ) { TextLink("I'm Done", onDone, style = Type.headline.copy(color = c.tint)) }
        }
    }
}
