package com.munpro.app.ui.chair

// The chair's console on a phone (port of mobile/src/app/chair/[id].tsx): run the floor, rule on
// points, motions and requests, take the roll and close votes. Every action is the web chair
// console's own service call (data/live/SessionRepo.kt); this file only lays them out for a thumb.
// Not on the phone (use the web console): reordering a seated list, agenda, marking, finalize,
// opening a moderated caucus directly, the projector.

import androidx.compose.ui.text.style.TextAlign
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.Spacer
import com.munpro.app.ui.kit.Flag
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.munpro.app.AppGraph
import com.munpro.app.data.live.FinalizeRow
import com.munpro.app.data.live.MarkingBase
import com.munpro.app.domain.countryName
import com.munpro.app.domain.flagEmoji
import com.munpro.app.domain.fmtClock
import com.munpro.app.domain.getCommitteeAgendas
import com.munpro.app.domain.live.ALL_DELEGATE_MOTION_TYPES
import com.munpro.app.domain.live.DelegateRosterEntry
import com.munpro.app.domain.live.FLOOR_REQUEST_META
import com.munpro.app.domain.live.FloorGate
import com.munpro.app.domain.live.FloorRequest
import com.munpro.app.domain.live.IDLE_GRACE_SEC
import com.munpro.app.domain.live.IDLE_LIMIT_MS
import com.munpro.app.domain.live.LiveSession
import com.munpro.app.domain.live.Loadable
import com.munpro.app.domain.live.Motion
import com.munpro.app.domain.live.Phase
import com.munpro.app.domain.live.StaffAccess
import com.munpro.app.domain.live.caucusListState
import com.munpro.app.domain.live.compareMotionPrecedence
import com.munpro.app.domain.live.computeVoteResult
import com.munpro.app.domain.live.eligibleVoterCount
import com.munpro.app.domain.live.floorHolder
import com.munpro.app.domain.live.floorLine
import com.munpro.app.domain.live.floorOccupancy
import com.munpro.app.domain.live.floorSpeechClock
import com.munpro.app.domain.live.gateEndsAt
import com.munpro.app.domain.live.idleSince
import com.munpro.app.domain.live.liveGateCopy
import com.munpro.app.domain.live.mergeSignupOrder
import com.munpro.app.domain.live.motionMeta
import com.munpro.app.domain.live.motionSummary
import com.munpro.app.domain.live.orderGslSignups
import com.munpro.app.domain.live.orderSignups
import com.munpro.app.domain.live.pointLabel
import com.munpro.app.domain.live.readRollCall
import com.munpro.app.domain.live.resolveLiveGate
import com.munpro.app.domain.live.stageFocus
import com.munpro.app.domain.live.stageLabel
import com.munpro.app.domain.live.timerRemainingMs
import com.munpro.app.domain.live.videoEnded
import com.munpro.app.domain.live.yieldGrantMs
import com.munpro.app.domain.markingMode
import com.munpro.app.domain.roleLabel
import com.munpro.app.ui.kit.ActionSheet
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.Emoji
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.Inter
import com.munpro.app.ui.kit.Loading
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.RoundButton
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.Segmented
import com.munpro.app.ui.kit.SheetRow
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.kit.rememberHaptics
import com.munpro.app.ui.kit.rememberPress
import com.munpro.app.ui.kit.tap
import com.munpro.app.ui.live.ClockBlock
import com.munpro.app.ui.live.rememberPresence
import com.munpro.app.ui.live.video.VideoRoom
import com.munpro.app.ui.live.video.VideoStage
import com.munpro.app.ui.live.video.rememberLiveVideo
import kotlinx.coroutines.launch

private data class GateChoice(val kind: String, val label: String, val detail: String, val window: Int?)

// The web chooser's kinds and default windows (GateBar DEFAULT_WINDOW).
private val GATES = listOf(
    GateChoice("motions", "Motions", "Every delegate motion is in order", 90),
    GateChoice("signup", "Speakers signup", "Delegates add themselves to the list", 60),
    GateChoice("roll_call", "Roll call", "Delegates declare their own status", 90),
    GateChoice("debate", "Points only", "For while a delegate holds the floor", null),
    GateChoice("nothing", "Nothing", "Lock the floor", null),
)
private val WINDOWS = listOf("30 seconds" to 30, "60 seconds" to 60, "90 seconds" to 90, "2 minutes" to 120, "No limit" to null)
private val ATTEND = listOf("present" to "P", "present_and_voting" to "P&V", "late" to "Late", "absent" to "Abs")

@Composable
fun ChairScreen(eventId: String, committee: String) {
    val c = palette
    val nav = com.munpro.app.ui.LocalNav.current
    val haptics = rememberHaptics()
    val scope = rememberCoroutineScope()
    val alerts = LocalAlerts.current
    val repo = AppGraph.sessions
    val user = AppGraph.auth.user
    val uid = user?.uid.orEmpty()
    val myName = AppGraph.auth.profile?.fullName?.ifEmpty { null } ?: user?.displayName?.ifEmpty { null } ?: "Chair"
    val live = rememberChairLive(eventId, committee, uid)
    val session = live.session
    val e = eventId
    val s = live.sessionId
    var tab by remember { mutableStateOf("floor") }
    var gateSheet by remember { mutableStateOf<Any?>(null) } // "kind" | GateChoice
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var chatOpen by remember { mutableStateOf(false) }
    // What this account may do here (StaffAccess = the web console's canControl / canDais).
    // Today lists watch-only seats too, so nothing is offered until this has loaded.
    val access by produceState<StaffAccess?>(null, eventId, uid) { value = AppGraph.content.staffAccess(eventId, uid) }
    val canControl = access?.canControl(committee) == true
    val canDais = access?.canDais(committee) == true
    // Top level, so the badge counts while the inbox is closed. Mounted only for an account the
    // /chat rule accepts as dais: a denied listener is never retried.
    val chat = rememberDaisChat(e, s, uid, enabled = session != null && canDais)
    // The day's participation report (web SessionReport "full"), open from the Session menu or
    // the adjourned screen — the end of the day is when a chair wants it.
    var reportOpen by remember { mutableStateOf(false) }
    val report: @Composable () -> Unit = {
        com.munpro.app.ui.live.CommitteeReportSheet(reportOpen, { reportOpen = false }, eventId, live.event?.title.orEmpty(), committee, live.dateStr,
            live.roster.orEmpty().associate { it.delegateId to it.name }, live.roster.orEmpty().size)
    }

    fun run(fn: suspend () -> Unit, after: () -> Unit = {}) {
        if (busy) return
        busy = true
        error = null
        scope.launch {
            try { fn(); haptics.selection(); after() }
            catch (ex: Exception) { error = ex.message?.takeIf { it == "A vote is already open." } ?: "That didn't go through. The committee may have moved on, or check your connection." }
            finally { busy = false }
        }
    }

    val pendingPoints = live.points.filter { it.status == "pending" }
    val liveMotions = live.motions.filter { it.status in listOf("pending", "recognized", "passed") }.sortedWith(::compareMotionPrecedence)
    val pendingRequests = live.requests.filter { it.status == "pending" && it.kind != "caucus_signup" }
    // Papers in this committee (reviewer listener, mounted only for someone who can review).
    val reviewDocs by remember(e, committee, canControl) {
        if (canControl) repo.reviewDocs(e, committee) else kotlinx.coroutines.flow.flowOf(emptyList())
    }.collectAsState(emptyList())
    val docsAwaiting = reviewDocs.count { it.status == "submitted" }
    val queueCount = pendingPoints.size + liveMotions.size + pendingRequests.size + docsAwaiting

    val a = access
    if (a == null) return Screen(title = committee.ifEmpty { "Committee" }, back = "Today", tabBar = false, live = true) { Loading() }

    // ---- before / outside a sitting ----
    if (session == null || session.phase == "closed" || session.finalized) {
        val closed = session != null && (session.phase == "closed" || session.finalized)
        val canStart = canControl && live.open && live.sessionState is Loadable.Ready && session == null && live.roster != null
        // A viewer who can't run the sitting waits for it like a delegate: it must exist first.
        val verdict = resolveLiveGate(live.control, live.sessionState, if (canControl) "chair" else "delegate", committee, live.dateStr)
        val copy = if (verdict.kind == "loading") null else liveGateCopy(verdict, live.event?.title, (live.control as? Loadable.Ready)?.value)
        return Screen(title = committee.ifEmpty { "Committee" }, back = "Today", tabBar = false, live = true) {
            when {
                closed && !canControl -> Empty("This sitting is adjourned", "The chair closed today's session.")
                closed -> {
                    Empty("This sitting is adjourned", "Reopen it to keep running today. The day's marks stay as they are.")
                    MunButton("Reopen Session", { run({ repo.reopenSession(e, s) }) }, loading = busy)
                    MunButton("Session Report", { reportOpen = true }, variant = ButtonVariant.Tinted)
                    report()
                }
                canStart -> {
                    Empty("Ready when you are", "${live.roster!!.size} delegates on the roll. Starting opens today's sitting and moves to roll call.")
                    MunButton("Start Session", {
                        run({
                            // The committee's agenda topics seed session.agenda, as the web console's Start does.
                            val agendas = live.event?.committees?.firstOrNull { it.name == committee }?.let { getCommitteeAgendas(it) }.orEmpty()
                            repo.ensureSession(e, committee, live.dateStr, uid, live.roster, 90, agendas)
                            repo.setPhase(e, s, "roll_call")
                            AppGraph.scope.launch { repo.closeEarlierSittings(e, committee, live.dateStr) }
                        })
                    }, loading = busy)
                }
                else -> Empty(copy?.title ?: "Connecting…", copy?.let { listOfNotNull(it.body, it.note).joinToString("\n\n") } ?: "Checking today's sitting.")
            }
            // Sessions are shut: the organizer can open them right here.
            if (a.isOrganizerLevel && !live.open) {
                MunButton("Open Live Control", { nav.go(com.munpro.app.nav.LiveControlRoute(eventId)) })
            }
            // Earlier days' reports, before (or without) today's sitting.
            if (canDais && !closed) {
                MunButton("Session Reports", { reportOpen = true }, variant = ButtonVariant.Tinted)
                report()
            }
            ErrorText(error)
        }
    }

    // ---- the sitting, watch-only ----
    if (!canControl) {
        // Watchers join the video as observers: audience for life, never announced to the room.
        val watchRoom = remember(e, committee, live.dateStr, uid) { VideoRoom(e, committee, live.dateStr, uid, observer = true) }
        val watchVideo = rememberLiveVideo(watchRoom, amHost = false, onStage = false, ended = videoEnded(session))
        // Reads the room's join/leave traffic, writes no node of its own.
        val watchPresence = rememberPresence(e, s, uid, myName, null, null, enabled = !videoEnded(session), publishSelf = false)
        return Screen(
            back = "Today", navTitle = committee, navSubtitle = "${if (a.isOwner) "Organizer" else roleLabel(a.role)} · watching", tabBar = false, live = true, gap = 20.dp,
            navRight = { RoundButton(Icons.monitor, "Room Board", { nav.go(com.munpro.app.nav.RoomBoardRoute(e, committee)) }) },
            bottomBar = { MunButton("Open Room Board", { nav.go(com.munpro.app.nav.RoomBoardRoute(e, committee)) }, variant = ButtonVariant.Tinted, icon = Icons.monitor) },
        ) {
            WatchBoard(session, live.now, if (a.isOwner) "Organizer" else roleLabel(a.role), watchVideo, uid, watchPresence)
        }
    }

    // ---- live video: the dais broadcasts by role (the token server has the last word) ----
    val videoRoom = remember(e, committee, live.dateStr, uid) { VideoRoom(e, committee, live.dateStr, uid) }
    val video = rememberLiveVideo(videoRoom, amHost = true, onStage = false, ended = videoEnded(session))
    val presence = rememberPresence(e, s, uid, myName, null, if (a.isOwner) "Organizer" else roleLabel(a.role),
        enabled = !videoEnded(session), publishSelf = true)
    var onAirSheet by remember { mutableStateOf(false) }
    // Vice-chair delegate power: act for a delegation that isn't on the platform.
    var representOpen by remember { mutableStateOf(false) }

    // ---- marking: the day's docs for this committee, the rubric, and the scale ----
    val daily by remember(e, committee, live.dateStr) { AppGraph.markings.daily(e, committee, live.dateStr) }.collectAsState(emptyList())
    val templates = live.event?.markingTemplates.orEmpty()
    val markMode = markingMode(live.event)
    fun baseFor(delegateId: String, applicationId: String) = MarkingBase(e, committee, delegateId, applicationId, live.dateStr, uid, markMode)
    // A GSL speech just ended: ask for its marks (web onSpeechComplete), when there is a rubric.
    var resultsOpen by remember { mutableStateOf(false) }
    var speechToScore by remember { mutableStateOf<com.munpro.app.domain.live.SpeakerSlot?>(null) }
    val onSpeechEnded: (com.munpro.app.domain.live.SpeakerSlot?) -> Unit = { slot -> if (slot != null && slot.delegateId.isNotEmpty() && templates.isNotEmpty()) speechToScore = slot }
    var sessionSheet by remember { mutableStateOf(false) }
    val suspended = session.phase == Phase.SUSPENDED

    // Idle guard (ChairSessionConsole.IdleGuard): an empty floor with no write for 2 minutes asks
    // "Still in session?", and closes the sitting if nobody answers within 15 s. Without it a
    // phone chair who walks away leaves the sitting running for the nightly sweep.
    val idle = idleSince(session)
    val idleWarn = idle != null && live.now - idle >= IDLE_LIMIT_MS
    var warnedAt by remember { mutableStateOf<Long?>(null) }
    LaunchedEffect(idleWarn) { warnedAt = if (idleWarn) System.currentTimeMillis() else null }
    val idleLeft = warnedAt?.let { IDLE_GRACE_SEC - ((live.now - it) / 1000).toInt() } ?: IDLE_GRACE_SEC
    // useVoteAutoClose: when a vote's clock runs out, the console records it. Jittered so two
    // dais devices don't both fire; finalizeVote no-ops on a vote that is already closed.
    val vote = session.activeVote
    LaunchedEffect(vote?.voteId, vote?.timer?.endsAt, vote?.timer?.running) {
        val v = vote ?: return@LaunchedEffect
        val endsAt = v.timer?.endsAt ?: return@LaunchedEffect
        if (v.timer.running != true) return@LaunchedEffect
        kotlinx.coroutines.delay(maxOf(0L, endsAt - System.currentTimeMillis()) + 600 + (Math.random() * 1400).toLong())
        runCatching { repo.finalizeVote(e, s, v.voteId, live::identityFor) }
    }
    var autoClosed by remember { mutableStateOf(false) }
    LaunchedEffect(idleWarn, idleLeft <= 0) {
        if (idleWarn && idleLeft <= 0 && !autoClosed) { autoClosed = true; run({ repo.setPhase(e, s, Phase.CLOSED) }) }
    }

    // ---- the sitting ----
    val now = live.now
    val holder = floorHolder(session)
    val speech = floorSpeechClock(session)
    val speechLeft = timerRemainingMs(speech.timer, now)
    val caucus = session.caucus
    val bigClock = if (caucus != null) timerRemainingMs(caucus.totalTimer, now) else if (holder != null) speechLeft else null
    val speechPath = if (caucus?.kind == "moderated") "caucus.speakerTimer" else "gsl.timer"
    val queue = (if (caucus?.kind == "moderated") caucus.queue else session.gsl?.queue).orEmpty()
    val gate = session.floorGate
    val occupied = floorOccupancy(session)
    val gateLine = floorLine(session, now).second
    val gateLeft = if (occupied == null && gate?.endsAt != null) gate.endsAt - now else null

    // Signups waiting to be seated, in the order the web's seat dialogs use.
    val gslSignupId = if (gate?.kind == "signup" && gate.signupFor == "gsl") gate.signupId else null
    val gslSignups = if (gslSignupId != null) orderGslSignups(live.requests, gslSignupId) else emptyList()
    val caucusId = if (caucus?.kind == "moderated") caucus.caucusId else null
    val caucusCollecting = caucusId != null && caucusListState(caucus) == "collecting"
    val caucusSignups = if (caucusCollecting) orderSignups(live.requests, caucusId) else emptyList()

    fun openGateChoice(g: GateChoice, secs: Int?) = run({
        when (g.kind) {
            "nothing" -> repo.closeGate(e, s, uid)
            "roll_call" -> repo.startRollCall(e, s, uid, secs)
            else -> repo.openGate(e, s, uid, FloorGate(
                kind = g.kind,
                allowsPoints = g.kind == "debate" || g.kind == "motions",
                endsAt = gateEndsAt(secs),
                windowSecs = secs,
                motionTypes = if (g.kind == "motions") ALL_DELEGATE_MOTION_TYPES else null,
                signupFor = if (g.kind == "signup") "gsl" else null,
                signupId = if (g.kind == "signup") "sg_${java.lang.Long.toString(System.currentTimeMillis(), 36)}" else null,
            ))
        }
    }) { gateSheet = null }

    Screen(
        back = "Today", navTitle = committee, navSubtitle = if (a.isOwner) "Organizer" else roleLabel(a.role), tabBar = false, live = true, gap = 16.dp,
        navRight = {
            if (canDais) RoundButton(Icons.chat, "Messages", { chatOpen = true }, badge = chat.unread)
            RoundButton(Icons.more, "Session menu", { sessionSheet = true })
        },
    ) {
        // Phase and the floor gate share one line (board 05); the speech clock lives in the speaker card.
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                com.munpro.app.ui.kit.Dot(if (suspended) c.orange else c.red, 6.dp)
                Text(com.munpro.app.domain.live.PHASE[session.phase] ?: session.phase, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = if (suspended) c.orange else c.red, maxLines = 1)
            }
            val press = rememberPress()
            Row(
                Modifier.clip(CircleShape).background(c.tintSoft).tap(press, label = "Change what the floor is open for") { gateSheet = "kind" }
                    .padding(start = 10.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(gateLine + if (gateLeft != null && gateLeft > 0) " · ${fmtClock(gateLeft)}" else "", style = Type.caption.copy(fontSize = 12.sp), color = c.tint, maxLines = 1)
                Text("Change", style = Type.caption.copy(fontSize = 11.sp), color = c.tint, modifier = Modifier.clip(CircleShape).background(c.cell).padding(horizontal = 8.dp, vertical = 3.dp))
            }
        }
        // A caucus or a vote runs on the committee's clock, so it stays big above the stage.
        if (caucus != null) ClockBlock(session, bigClock, now, fontSize = 56f)

        if (suspended) {
            com.munpro.app.ui.kit.Notice("Session suspended", "The clock is stopped. Delegates see the break.", icon = Icons.pause,
                action = { Pill("Resume", { run({ repo.resumeSession(e, s) }) }, filled = true) })
        }
        video?.let { v ->
            VideoStage(v, stageFocus(session), uid, label = { u -> if (u == uid) "You" else stageLabel(session, u) }, presence = presence, overlay = {
                OnAirOverlay(session, live.roster.orEmpty(),
                    onPick = { onAirSheet = true },
                    onClear = { run({ repo.setStage(e, s, emptyList()) }) },
                    onRestartCall = { run({ repo.startLiveCall(e, s) }) })
            })
        }

        Segmented(
            listOf("floor" to "Floor", "queue" to if (queueCount > 0) "Queue $queueCount" else "Queue", "roll" to "Roll", "vote" to if (session.activeVote != null) "Vote ●" else "Vote", "marks" to "Marks"),
            tab, { tab = it },
        )
        ErrorText(error)

        when (tab) {
            "floor" -> FloorTab(live, session, holder, speech.timer?.running == true, speechLeft, speechPath, queue, caucusCollecting, gslSignups, caucusSignups, caucusId, ::run, alerts, onSpeechEnded)
            "queue" -> {
                if (queueCount == 0 && reviewDocs.isEmpty()) Empty("Nothing waiting", "Points, motions, requests and papers from delegates appear here.")
                if (pendingPoints.isNotEmpty()) {
                    Section(header = "Points") {
                        pendingPoints.forEach { p ->
                            item {
                                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    com.munpro.app.ui.kit.FlagText(p.country, "${pointLabel(p.type)}, ${countryName(p.country)}", style = Type.bodyMedium, color = c.label)
                                    if (!p.note.isNullOrEmpty()) Text("“${p.note}”", style = Type.subhead.copy(fontStyle = FontStyle.Italic), color = c.label2)
                                    ProxyLine(p.proxyBy, p.proxyByName)
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Pill("Recognise", { run({ repo.resolvePoint(e, s, p, "recognized", uid, live.identityFor(p.delegateId)) }) }, filled = true)
                                        Pill("Dismiss", { run({ repo.resolvePoint(e, s, p, "dismissed", uid) }) })
                                    }
                                }
                            }
                        }
                    }
                }
                if (liveMotions.isNotEmpty()) {
                    Section(header = "Motions, in order of precedence") {
                        liveMotions.forEach { m ->
                            item {
                                MotionRow(m, busy,
                                    onRecognize = { run({ repo.recognizeMotion(e, s, m, uid) }) },
                                    onVote = { run({ repo.putMotionToVote(e, s, m, uid) }) },
                                    onExecute = { run({ repo.executeMotion(e, s, m, uid, live.identityFor(m.byDelegateId), live.motions) }) },
                                    onDismiss = { run({ repo.dismissMotion(e, s, m, uid) }) })
                            }
                        }
                    }
                }
                if (pendingRequests.isNotEmpty()) {
                    Section(header = "Requests") {
                        pendingRequests.forEach { r ->
                            item {
                                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    com.munpro.app.ui.kit.FlagText(r.country, countryName(r.country), style = Type.bodyMedium, color = c.label)
                                    Text(requestLine(r) + if (r.kind == "yield") ". They'd get ${fmtClock(yieldGrantMs(speech.baseSecs, speechLeft))}" else "", style = Type.subhead, color = c.label2)
                                    ProxyLine(r.proxyBy, r.proxyByName)
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Pill("Grant", { run({ repo.grantFloorRequest(e, s, session, r, uid) }) }, filled = true)
                                        Pill("Dismiss", { run({ if (r.kind == "yield") repo.declineYieldRequest(e, s, r, uid) else repo.resolveHand(e, s, r, "dismissed", uid) }) })
                                    }
                                }
                            }
                        }
                    }
                }
                DocsReview(e, committee, session, reviewDocs, uid, ::run,
                    confirm = { t, m, b -> alerts.confirm(t, m, b) }, launch = { block -> scope.launch { block() } })
            }
            "roll" -> RollTab(live, session, ::run)
            "marks" -> MarksTab(session, live.roster.orEmpty(), daily, templates, markMode, { r -> baseFor(r.delegateId, r.applicationId) }, onResults = { resultsOpen = true })
            else -> VoteTab(live, session, ::run)
        }
    }

    report()
    StandingsSheet(resultsOpen, { resultsOpen = false }, e, committee, live.roster.orEmpty(), templates, markMode, live.event?.scoringConfig, uid)

    speechToScore?.let { slot ->
        SpeechScorerSheet(true, { speechToScore = null }, slot.country, daily.firstOrNull { it.delegateId == slot.delegateId }, templates, markMode,
            baseFor(slot.delegateId, slot.applicationId.ifEmpty { live.identityFor(slot.delegateId).applicationId }))
    }

    if (canDais) ChairChat(chatOpen, { chatOpen = false }, chat, live.roster.orEmpty(), uid, myName)

    // The host controls the web console keeps in its top bar: suspend / resume, close, the call.
    ActionSheet(
        visible = sessionSheet, onDismiss = { sessionSheet = false },
        title = "Session", message = if (suspended) "Suspended. The clock is stopped." else "Running since ${live.dateStr}.",
        error = error,
    ) {
        SheetRow(if (suspended) "Resume Session" else "Suspend Session", {
            run({ if (suspended) repo.resumeSession(e, s) else repo.suspendSession(e, s) }) { sessionSheet = false }
        }, enabled = !busy, icon = if (suspended) Icons.play else Icons.pause)
        if (a.canActAsDelegate && a.isChairOf(committee)) SheetRow("Represent a Delegation", { sessionSheet = false; representOpen = true }, icon = Icons.people)
        SheetRow("Session Report", { sessionSheet = false; reportOpen = true }, icon = Icons.chart)
        SheetRow("Room Board", { sessionSheet = false; nav.go(com.munpro.app.nav.RoomBoardRoute(e, committee)) }, icon = Icons.monitor)
        val consoleDark = palette.dark
        SheetRow("Console: ${if (consoleDark) "Light" else "Dark"}", { sessionSheet = false; AppGraph.setConsoleAppearance(if (consoleDark) com.munpro.app.ui.kit.AppearanceMode.Light else com.munpro.app.ui.kit.AppearanceMode.Dark) }, icon = Icons.moon)
        if (session.live?.callEnded == true) SheetRow("Restart Video Call", { run({ repo.startLiveCall(e, s) }) { sessionSheet = false } }, enabled = !busy, icon = Icons.video)
        else SheetRow("End Video Call for Everyone", {
            sessionSheet = false
            scope.launch {
                if (alerts.confirm("End the video for everyone?", "Everyone leaves the call. The session stays open: marking and the floor carry on, and you can restart the call.", "End Call")) {
                    run({ repo.endLiveCall(e, s) })
                }
            }
        }, enabled = !busy, destructive = true, icon = Icons.videoOff)
        SheetRow("Finalize Day", {
            sessionSheet = false
            scope.launch {
                if (alerts.confirm("Finalize today's session?", "This writes a marking record for every delegate so they can see their result. Your scores are preserved.", "Finalize")) {
                    run({
                        // sessionService.finalizeSession, with the console's rows: every delegate on the
                        // roll, their current scores and feedback, and the day's roll call.
                        val rows = live.roster.orEmpty().map { r ->
                            val m = daily.firstOrNull { it.delegateId == r.delegateId }
                            FinalizeRow(r.delegateId, r.applicationId, m?.scores.orEmpty(), m?.feedback.orEmpty(), session.attendance[r.delegateId]?.status)
                        }
                        AppGraph.markings.finalizeSession(e, committee, live.dateStr, s, uid, rows, markMode)
                    })
                }
            }
        }, enabled = !busy, icon = Icons.check)
        SheetRow("Close Session", {
            sessionSheet = false
            scope.launch {
                if (alerts.confirm("Close this session?", "Controls lock for everyone. You can reopen it today.", "Close Session")) run({ repo.setPhase(e, s, Phase.CLOSED) })
            }
        }, enabled = !busy, destructive = true, icon = Icons.exit)
    }

    ActionSheet(
        visible = idleWarn && !autoClosed, onDismiss = {},
        title = "Still in session?",
        message = "No activity for 2 minutes. This session ends automatically in ${maxOf(0, idleLeft)}s.",
        error = null,
    ) {
        SheetRow("Continue Meeting", { run({ repo.keepAlive(e, s) }) })
        SheetRow("End Now", { autoClosed = true; run({ repo.setPhase(e, s, Phase.CLOSED) }) }, destructive = true)
    }

    // "Put on air": any delegation on the roll, the same `setStage` the web's tile action writes.
    // The token route reads `live.stage`, so the chosen delegate's next token is a publisher one.
    ActionSheet(
        visible = onAirSheet, onDismiss = { onAirSheet = false },
        title = "Put a delegation on air",
        message = "Their camera and mic go live for the room. Only one at a time.",
        error = error,
    ) {
        live.roster.orEmpty().sortedBy { countryName(it.country) }.forEach { r ->
            SheetRow(countryName(r.country), { run({ repo.setStage(e, s, listOf(r.delegateId)) }) { onAirSheet = false } }, flag = r.country,
                enabled = !busy, selected = session.live?.stage?.contains(r.delegateId) == true)
        }
    }

    if (a.canActAsDelegate && a.isChairOf(committee)) {
        RepresentSheet(representOpen, { representOpen = false }, live, session, reviewDocs, uid, myName)
    }

    val sheet = gateSheet
    ActionSheet(
        visible = sheet != null, onDismiss = { gateSheet = null },
        title = if (sheet == "kind") "Open the floor for…" else "${(sheet as? GateChoice)?.label.orEmpty()}: how long?",
        message = if (sheet == "kind") "Whatever you pick is what every delegate can do." else "The window closes itself. Late writes are refused.",
        error = error,
    ) {
        if (sheet == "kind") GATES.forEach { g -> SheetRow(g.label, { if (g.window == null) openGateChoice(g, null) else gateSheet = g }, enabled = !busy) }
        else if (sheet is GateChoice) WINDOWS.forEach { (label, secs) -> SheetRow(label, { openGateChoice(sheet, secs) }, enabled = !busy, selected = secs == sheet.window) }
    }
}

@Composable
private fun FloorTab(
    live: ChairLive, session: LiveSession, holder: com.munpro.app.domain.live.SpeakerSlot?,
    running: Boolean, speechLeft: Long, speechPath: String, queue: List<com.munpro.app.domain.live.SpeakerSlot>, caucusCollecting: Boolean,
    gslSignups: List<FloorRequest>, caucusSignups: List<FloorRequest>, caucusId: String?,
    run: (suspend () -> Unit, () -> Unit) -> Unit, alerts: com.munpro.app.ui.kit.AlertController,
    /** A GSL speech ended (Next / Finish): the console asks for its marks. */
    onSpeechEnded: (com.munpro.app.domain.live.SpeakerSlot?) -> Unit = {},
) {
    val c = palette
    val repo = AppGraph.sessions
    val ui = rememberCoroutineScope()
    val (e, s, uid) = Triple(live.eventId, live.sessionId, live.uid)
    val caucus = session.caucus
    val now = live.now
    if (holder != null) {
        Section(header = "Speaking") {
            item {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Flag(holder.country, 26f)
                        Column(Modifier.weight(1f)) {
                            Text(countryName(holder.country), style = Type.headline, color = c.label)
                            Text(if (holder.viaYield == true) "On a yield" else if (running) "Clock running" else "Clock paused", style = Type.subhead, color = c.label2)
                        }
                        Text(fmtClock(speechLeft), style = Type.title.copy(fontSize = 34.sp, fontFeatureSettings = "tnum"), color = c.label)
                    }
                    // Start / Next / Finish, then the clock nudges (board 05 "Speaker controls").
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        MunButton(if (running) "Pause" else "Start", { run({ if (running) repo.timerPause(e, s, speechPath, speechLeft) else repo.timerStart(e, s, speechPath, speechLeft) }) {} },
                            Modifier.weight(1f), height = 40.dp, icon = if (running) Icons.pause else Icons.play)
                        MunButton("Next", { run({ if (caucus?.kind == "moderated") repo.nextCaucusSpeaker(e, s) else repo.nextSpeaker(e, s) }) { if (caucus == null) onSpeechEnded(holder) } },
                            Modifier.weight(1f), height = 40.dp, variant = ButtonVariant.Tinted)
                        if (caucus == null) MunButton("Finish", { run({ repo.clearActiveSpeaker(e, s) }) { onSpeechEnded(holder) } }, Modifier.weight(1f), height = 40.dp, variant = ButtonVariant.Gray)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(-30_000L to "−30s", 30_000L to "+30s").forEach { (delta, label) ->
                            MunButton(label, {
                                val rem = maxOf(0L, speechLeft + delta)
                                run({ if (running) repo.timerStart(e, s, speechPath, rem) else repo.timerPause(e, s, speechPath, rem) }) {}
                            }, Modifier.weight(1f), height = 38.dp, variant = ButtonVariant.Gray)
                        }
                    }
                }
            }
        }
    } else if (queue.isNotEmpty() && !caucusCollecting) {
        MunButton("Call ${countryName(queue[0].country)}", { run({ if (caucus?.kind == "moderated") repo.nextCaucusSpeaker(e, s) else repo.nextSpeaker(e, s) }) {} }, icon = Icons.flag)
    }

    if (caucus != null) {
        val totalRunning = caucus.totalTimer?.running == true
        val totalLeft = timerRemainingMs(caucus.totalTimer, now)
        Section(header = if (caucus.kind == "moderated") "Moderated caucus" else "Unmoderated caucus") {
            cell(caucus.topic.ifEmpty { "No topic" }, subtitle = "${fmtClock(totalLeft)} left${if (totalRunning) "" else ", paused"}", chevron = false,
                trailing = { Pill(if (totalRunning) "Pause" else "Start", { run({ if (totalRunning) repo.timerPause(e, s, "caucus.totalTimer", totalLeft) else repo.timerStart(e, s, "caucus.totalTimer", totalLeft) }) {} }) })
            item {
                Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Pill("+1 min", { run({ repo.extendCaucus(e, s, 60) }) {} })
                    Pill("+5 min", { run({ repo.extendCaucus(e, s, 300) }) {} })
                }
            }
            cell("End caucus", destructive = true, chevron = false, onClick = {
                ui.launch { if (alerts.confirm("End the caucus?", "The floor returns to the General Speakers List.", "End Caucus", destructive = true)) run({ repo.endCaucus(e, s) }) {} }
            })
        }
    }

    var startCaucus by remember { mutableStateOf(false) }
    if (caucus == null) {
        Section(header = "Caucus") {
            cell("Start a caucus", subtitle = "Moderated or unmoderated, without waiting for a motion", tinted = true, chevron = false, onClick = { startCaucus = true })
        }
    }
    StartCaucusSheet(startCaucus, { startCaucus = false }, com.munpro.app.ui.kit.AiContext(committee = live.committee, phase = com.munpro.app.domain.live.PHASE[session.phase])) { moderated, topic, totalSecs, perSecs ->
        if (moderated) repo.startModCaucus(e, s, topic, totalSecs, perSecs, chairUid = uid) else repo.startUnmodCaucus(e, s, totalSecs)
    }

    val signups = gslSignups.ifEmpty { caucusSignups }
    if (signups.isNotEmpty()) {
        Section(header = "Signed up · ${signups.size}", footer = "Seated in the order they signed up. Reorder on the web console if you need to.") {
            signups.forEach { r -> cell(countryName(r.country), leading = { Flag(r.country, 20f) }, inset = 52.dp, chevron = false) }
            cell(if (gslSignups.isNotEmpty()) "Seat list and start" else "Seat caucus list", tinted = true, chevron = false, onClick = {
                run({
                    val ok = if (gslSignups.isNotEmpty()) repo.seatGslList(e, s, mergeSignupOrder(session.gsl?.queue.orEmpty(), gslSignups), uid, gslSignups, true)
                    else repo.seatCaucusList(e, s, caucusId!!, mergeSignupOrder(caucus?.queue.orEmpty(), caucusSignups), uid, caucusSignups)
                    if (!ok) throw IllegalStateException("stale")
                }) {}
            })
        }
    }

    // The list itself is editable, as on the web's speakers panel: add anyone on the roll, move
    // a speaker up, take one off. Whole-list writes (setGslQueue / setCaucusQueue).
    val listKey = if (caucus?.kind == "moderated") "caucus" else "gsl"
    val canEditList = caucus == null || caucus.kind == "moderated"
    var addSpeaker by remember { mutableStateOf(false) }
    Section(header = if (caucus?.kind == "moderated") "Caucus speakers" else "Speakers list") {
        if (queue.isEmpty()) cell("Nobody on the list", subtitle = "Open a speakers signup from the floor button above, or add a delegation", chevron = false, dim = true)
        queue.forEachIndexed { i, q ->
            cell(countryName(q.country), subtitle = if (!q.proxyBy.isNullOrEmpty()) "By proxy · ${q.proxyByName?.ifEmpty { null } ?: "Vice-chair"}" else null,
                value = if (i == 0) "Next" else null, inset = 52.dp, chevron = false, leading = { Flag(q.country, 20f) },
                trailing = if (canEditList) ({
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (i > 0) Pill("Up", { run({ repo.setQueue(e, s, listKey, queue.toMutableList().apply { add(i - 1, removeAt(i)) }) }) {} })
                        Pill("Remove", { run({ repo.setQueue(e, s, listKey, queue.filterIndexed { j, _ -> j != i }) }) {} })
                    }
                }) else null)
        }
        if (canEditList) cell("Add a delegation", tinted = true, chevron = false, onClick = { addSpeaker = true })
    }
    val onList = queue.map { it.delegateId }.toSet() + listOfNotNull(holder?.delegateId)
    ActionSheet(visible = addSpeaker, onDismiss = { addSpeaker = false }, title = "Add to the list", message = "Goes to the end of the list.") {
        live.roster.orEmpty().filter { it.delegateId !in onList }.sortedBy { countryName(it.country) }.forEach { r ->
            SheetRow(countryName(r.country), flag = r.country, onClick = {
                run({ repo.enqueueSpeaker(e, s, listOf(live.identityFor(r.delegateId).let { id -> com.munpro.app.domain.live.SpeakerSlot(delegateId = id.delegateId, country = id.country, applicationId = id.applicationId) }), listKey) }) { addSpeaker = false }
            })
        }
    }
}

private fun requestLine(r: FloorRequest): String =
    if (r.kind == "yield") "Yield to ${countryName(r.yieldTargetCountry)}" else FLOOR_REQUEST_META[r.kind]?.label ?: r.kind

@OptIn(ExperimentalLayoutApi::class)
/** The web's ProxyChip: raised by a vice-chair acting for the delegation. */
@Composable
private fun ProxyLine(by: String?, name: String?) {
    if (by.isNullOrEmpty()) return
    Text("By proxy · ${name?.ifEmpty { null } ?: "Vice-chair"}", style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = palette.tint)
}

@Composable
private fun MotionRow(m: Motion, busy: Boolean, onRecognize: () -> Unit, onVote: () -> Unit, onExecute: () -> Unit, onDismiss: () -> Unit) {
    val c = palette
    val meta = motionMeta(m.type)
    Column(Modifier.padding(14.dp).alpha(if (busy) 0.6f else 1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(meta.label, style = Type.bodyMedium, color = c.label, modifier = Modifier.weight(1f))
            Text(when (m.status) { "pending" -> "Pending"; "recognized" -> "Recognised"; else -> "Passed" }, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = if (m.status == "passed") c.tint else c.label2)
        }
        com.munpro.app.ui.kit.FlagText(m.byCountry, listOf(countryName(m.byCountry), motionSummary(m.params)).filter { it.isNotBlank() }.joinToString(" · "), style = Type.footnote, color = c.label2)
        ProxyLine(m.proxyBy, m.proxyByName)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (m.status == "passed") Pill("Carry out", onExecute, filled = true)
            else {
                if (m.status == "pending") Pill("Recognise", onRecognize)
                if (meta.needsVote) Pill("Put to vote", onVote, filled = true) else Pill("Adopt", onExecute, filled = true)
            }
            Pill("Dismiss", onDismiss)
        }
    }
}

@Composable
private fun RollTab(live: ChairLive, session: LiveSession, run: (suspend () -> Unit, () -> Unit) -> Unit) {
    val c = palette
    val repo = AppGraph.sessions
    val (e, s, uid) = Triple(live.eventId, live.sessionId, live.uid)
    val roll = readRollCall(session, live.now)
    val att = session.attendance
    val present = att.values.count { it.status == "present" || it.status == "present_and_voting" }
    val rows = live.roster.orEmpty().sortedBy { countryName(it.country) }
    val quorum = session.quorumThreshold ?: Math.ceil(rows.size / 2.0).toInt()
    // The roll card (board 06): state, quorum bar, the one next action.
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        val open = roll.stage == "running" || roll.stage == "ended"
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (open) com.munpro.app.ui.kit.Dot(c.tint, 7.dp)
            Column(Modifier.weight(1f)) {
                Text(if (open) "Roll call is open" else "Roll call", style = Type.headline, color = c.label)
                if (!open) Text("Delegates declare their own status, no time limit", style = Type.footnote, color = c.label2)
            }
            if (open) Text("$present of ${rows.size} · ${if (present >= quorum) "quorum met" else "quorum needs $quorum"}", style = Type.footnote, color = c.label2)
            else Pill(if (roll.stage == "done") "Again" else "Start", { run({ repo.startRollCall(e, s, uid, null) }) {} }, filled = true)
        }
        Box(Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)).background(c.fillSoft)) {
            Box(Modifier.fillMaxWidth(if (rows.isEmpty()) 0f else present.toFloat() / rows.size).fillMaxHeight().background(c.tint))
        }
        if (open) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (roll.stage == "running") MunButton("Stop", { run({ repo.stopRollCall(e, s, uid) }) {} }, Modifier.weight(1f), height = 40.dp, variant = ButtonVariant.Gray)
                MunButton("Complete", { run({ repo.completeRollCall(e, s, uid) }) {} }, Modifier.weight(1f), height = 40.dp)
            }
            Text("Stop: delegates can no longer declare. Complete: fix the register for today.", style = Type.footnote, color = c.label2)
        } else {
            Text("$present of ${rows.size} present · quorum needs $quorum", style = Type.footnote, color = c.label2)
        }
    }
    Section(header = "Delegations · $present of ${rows.size} present") {
        if (rows.isEmpty()) cell(if (live.roster == null) "Loading the roster…" else "No delegates allocated to this committee", chevron = false, dim = true)
        rows.forEach { r ->
            val st = att[r.delegateId]?.status ?: "absent"
            val declared = att[r.delegateId]?.let { it.status != "absent" } == true
            item {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Flag(r.country, 18f)
                        Text(countryName(r.country), style = Type.bodyMedium, color = c.label, modifier = Modifier.weight(1f))
                        when {
                            declared -> com.munpro.app.ui.kit.Chip("Declared", com.munpro.app.ui.kit.Tone.Tint)
                            roll.stage == "running" -> com.munpro.app.ui.kit.Chip("Waiting", com.munpro.app.ui.kit.Tone.Warning)
                            else -> com.munpro.app.ui.kit.Chip("Absent", com.munpro.app.ui.kit.Tone.Destructive)
                        }
                    }
                    Row(Modifier.clip(RoundedCornerShape(12.dp)).background(c.fillSoft).padding(2.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                        ATTEND.forEach { (status, label) ->
                            val on = st == status
                            val press = rememberPress()
                            val (bg, fg) = when {
                                !on -> androidx.compose.ui.graphics.Color.Transparent to c.label
                                status == "absent" -> c.redSoft to c.red
                                status == "late" -> c.orangeSoft to c.orange
                                else -> c.tint to c.onTint
                            }
                            Box(
                                Modifier.weight(1f).height(32.dp).clip(RoundedCornerShape(10.dp)).background(bg)
                                    .tap(press, label = "${countryName(r.country)} $label") { if (!on) run({ repo.setAttendance(e, s, live.identityFor(r.delegateId), status) }) {} },
                                contentAlignment = Alignment.Center,
                            ) { Text(label, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = fg) }
                        }
                    }
                }
            }
        }
    }
    Text("Quorum needs $quorum. You can mark anyone yourself — marking everyone present isn't required.", style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 16.dp))
}

@Composable
private fun VoteTab(live: ChairLive, session: LiveSession, run: (suspend () -> Unit, () -> Unit) -> Unit) {
    val c = palette
    val repo = AppGraph.sessions
    val alerts = LocalAlerts.current
    val ui = rememberCoroutineScope()
    val (e, s, uid) = Triple(live.eventId, live.sessionId, live.uid)
    val vote = session.activeVote
    val pending = session.pendingPublish
    if (pending != null) {
        // Board 06 "Result — not yet shown": the dais sees it first, then decides.
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(18.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            com.munpro.app.ui.kit.Chip("Only the dais can see this")
            val word = when (pending.result) { "passed" -> "Passes"; "failed" -> "Fails"; "tied" -> "Tied"; "vetoed" -> "Vetoed"; else -> pending.result }
            Text(word, style = Type.title.copy(fontSize = 34.sp), color = if (pending.result == "passed") c.tint else c.red)
            Text(pending.motion, style = Type.footnote, color = c.label2, textAlign = TextAlign.Center)
            Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                listOf(Triple("For", pending.affirmative ?: 0, c.tint), Triple("Against", pending.negative ?: 0, c.red), Triple("Abstain", pending.abstentions ?: 0, c.label)).forEach { (l, n, col) ->
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("$n", style = Type.title.copy(fontFeatureSettings = "tnum"), color = col)
                        Text(l, style = Type.footnote, color = c.label2)
                    }
                }
            }
        }
        MunButton("Publish to the Room", { run({ repo.publishVoteResult(e, s, uid) }) {} })
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { com.munpro.app.ui.kit.TextLink("Keep private", { run({ repo.discardPendingPublish(e, s) }) {} }) }
        return
    }
    var openVote by remember { mutableStateOf(false) }
    OpenVoteSheet(openVote, { openVote = false }, session, live.roster.orEmpty(), com.munpro.app.ui.kit.AiContext(committee = live.committee, phase = com.munpro.app.domain.live.PHASE[session.phase])) { cfg ->
        // startedBy = the sitting's creator, as VotingPanel passes it.
        repo.openVote(e, s, cfg, session.createdBy)
    }
    if (vote == null) {
        Empty(
            "No vote running", "Open one on a paper or motion. Ballots stay hidden until you publish.",
            action = { MunButton(if (session.publishedResult != null) "Open a New Vote" else "Open a Vote", { openVote = true }) },
            icon = Icons.check,
        )
        return
    }
    val r = computeVoteResult(vote)
    val voters = eligibleVoterCount(session.attendance)
    val cast = r.affirmative + r.negative + r.abstentions
    val left = vote.timer?.let { timerRemainingMs(it, live.now) }
    // One card (board 06 "Vote running"): what's being voted, the clock, a blind count of ballots.
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            com.munpro.app.ui.kit.Dot(c.red, 6.dp)
            Text("VOTE RUNNING", style = Type.caption.copy(fontSize = 11.sp), color = c.red)
        }
        Text(vote.motion, style = Type.title2, color = c.label)
        Text(
            listOfNotNull(
                if (vote.voteType == "substantive") "Substantive" else "Procedural",
                when (vote.threshold) { "two_thirds" -> "two-thirds"; "consensus" -> "consensus"; else -> "simple majority" },
                if (vote.mode == "roll_call") "roll call" else "placards",
                if (vote.scMode) "P5 veto" else null,
            ).joinToString(" · "),
            style = Type.footnote, color = c.label2,
        )
        if (left != null) Text(fmtClock(left), style = Type.timer.copy(fontSize = 56.sp, lineHeight = 60.sp), color = c.label, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        if (vote.mode == "tally") {
            listOf("yes" to "For", "no" to "Against", "abstain" to "Abstain").forEach { (k, label) ->
                val n = when (k) { "yes" -> r.affirmative; "no" -> r.negative; else -> r.abstentions }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(label, style = Type.bodyMedium, color = c.label, modifier = Modifier.weight(1f))
                    Text("$n", style = Type.headline, color = c.label)
                    Pill("−", { if (n > 0) run({ repo.bumpTally(e, s, k, -1) }) {} }, tone = com.munpro.app.ui.kit.Tone.Neutral)
                    Pill("+", { run({ repo.bumpTally(e, s, k, 1) }) {} }, filled = true)
                }
            }
        } else {
            Row { Text("Ballots cast", style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = c.label, modifier = Modifier.weight(1f)); Text("$cast of $voters", style = Type.footnote, color = c.label2) }
            Box(Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)).background(c.fillSoft)) {
                Box(Modifier.fillMaxWidth(if (voters == 0) 0f else cast.toFloat() / voters).fillMaxHeight().background(c.tint))
            }
            Text("Blind count — totals stay hidden until you close the vote.", style = Type.footnote, color = c.label2)
        }
        if (left != null) {
            // extendVoteTimer moves durationMs with the deadline, so the bar never runs past 100%.
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MunButton("−30s", { run({ repo.extendVoteTimer(e, s, -30_000) }) {} }, Modifier.weight(1f), height = 38.dp, variant = ButtonVariant.Gray)
                MunButton("+30s", { run({ repo.extendVoteTimer(e, s, 30_000) }) {} }, Modifier.weight(1f), height = 38.dp, variant = ButtonVariant.Gray)
            }
        }
    }
    MunButton("Close Vote", {
        ui.launch {
            if (alerts.confirm("Close the vote?", "No more ballots after this. You can choose whether to publish the result.", "Close Vote")) {
                run({ repo.finalizeVote(e, s, vote.voteId, live::identityFor) }) {}
            }
        }
    })
}

/** "Room sees: only the dais" + Put on air, folded into the video stage (board 05). */
@Composable
private fun androidx.compose.foundation.layout.BoxScope.OnAirOverlay(
    session: LiveSession, roster: List<DelegateRosterEntry>,
    onPick: () -> Unit, onClear: () -> Unit, onRestartCall: () -> Unit,
) {
    val stage = session.live?.stage.orEmpty()
    val onAir = stage.firstOrNull()?.let { u -> roster.firstOrNull { it.delegateId == u }?.country ?: session.attendance[u]?.country }
    Row(
        Modifier.align(Alignment.TopCenter).fillMaxWidth().padding(10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(
            Modifier.clip(CircleShape).background(androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.45f)).padding(horizontal = 10.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            if (onAir != null && session.live?.callEnded != true) Flag(onAir, 12f)
            Text(
                when { session.live?.callEnded == true -> "Video call ended"; onAir != null -> "Room sees: ${countryName(onAir)}"; else -> "Room sees: only the dais" },
                style = Type.caption.copy(fontSize = 11.sp), color = androidx.compose.ui.graphics.Color.White,
            )
        }
        Spacer(Modifier.weight(1f))
        @Composable
        fun light(label: String, onClick: () -> Unit) {
            val press = rememberPress()
            Text(
                label, style = Type.caption.copy(fontSize = 12.sp), color = androidx.compose.ui.graphics.Color(0xFF0E1D2C),
                modifier = Modifier.clip(CircleShape).background(androidx.compose.ui.graphics.Color.White).tap(press, label = label, onClick = onClick).padding(horizontal = 11.dp, vertical = 6.dp),
            )
        }
        if (session.live?.callEnded == true) light("Restart", onRestartCall)
        else {
            if (stage.isNotEmpty()) light("Clear", onClear)
            light(if (stage.isEmpty()) "Put on air" else "Change", onPick)
        }
    }
}

