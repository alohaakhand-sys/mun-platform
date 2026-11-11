package com.munpro.app.ui.chair

// Vice-chair "delegate power" (web RepresentPanel): act for a delegation that is in the room but
// not on the platform. Pick the delegation, then everything its own console could do (ask to
// speak, ask for the floor, points and motions under ITS floor gate, the caucus signup, a ballot,
// a vote-change ask, yields while it holds the floor, withdrawals, papers and consent answers),
// each write stamped with the vice-chair in proxyBy/proxyByName. Private chat, video and presence
// are left out on purpose: a vice-chair IS the dais, so proxying those would forge the delegate.
//
// The delegation's own capabilities gate every control, never the vice-chair's: a proxy raise the
// delegate couldn't make would let a chair-tier writer through the rules regardless.

import com.munpro.app.ui.kit.Flag
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.munpro.app.AppGraph
import com.munpro.app.data.live.ProxyAttribution
import com.munpro.app.domain.CommitteeDoc
import com.munpro.app.domain.countryName
import com.munpro.app.domain.flagEmoji
import com.munpro.app.domain.live.DuplicateMotionError
import com.munpro.app.domain.live.LiveSession
import com.munpro.app.domain.live.Phase
import com.munpro.app.domain.live.capabilitiesFor
import com.munpro.app.domain.live.floorHolder
import com.munpro.app.domain.live.holdsTheFloor
import com.munpro.app.domain.live.isSeated
import com.munpro.app.domain.live.motionMeta
import com.munpro.app.domain.live.pointLabel
import com.munpro.app.domain.live.signupIdFor
import com.munpro.app.domain.live.timerRemainingMs
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.Emoji
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.Space
import com.munpro.app.ui.kit.TrailingAction
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.kit.rememberHaptics
import com.munpro.app.ui.live.AuthorWindow
import com.munpro.app.ui.live.MyFloor
import com.munpro.app.ui.live.PapersSection
import com.munpro.app.ui.live.RaiseSheet
import kotlinx.coroutines.launch

private val ATTENDANCE_LABEL = mapOf("present" to "Present", "present_and_voting" to "Present and Voting", "late" to "Late", "absent" to "Absent")
private val BALLOTS = listOf("yes" to "For", "no" to "Against", "abstain" to "Abstain")
private val REQUEST_LABEL = mapOf("floor" to "Asked for the floor", "speak" to "Asked to speak", "yield" to "Yield request", "vote_change" to "Asked to change their vote")

@Composable
fun RepresentSheet(
    visible: Boolean, onDismiss: () -> Unit,
    live: ChairLive, session: LiveSession, committeeDocs: List<CommitteeDoc>,
    viceChairUid: String, viceChairName: String,
) {
    val c = palette
    val haptics = rememberHaptics()
    val scope = rememberCoroutineScope()
    val alerts = LocalAlerts.current
    val repo = AppGraph.sessions
    val e = live.eventId
    val s = live.sessionId
    val now = live.now
    val proxy = ProxyAttribution(viceChairUid, viceChairName)
    var selected by remember { mutableStateOf<String?>(null) }
    var raise by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(visible) { if (!visible) { selected = null; raise = false; error = null } }

    fun run(fn: suspend () -> Unit, fail: String, after: () -> Unit = {}) {
        if (busy) return
        busy = true; error = null
        scope.launch {
            try {
                fn(); haptics.success(); after()
                // Proxy writes land in subcollections, which the idle guard can't see: acting for a
                // delegation is dais activity, so it keeps the sitting alive like a chair write.
                runCatching { repo.keepAlive(e, s) }
            }
            catch (ex: DuplicateMotionError) { error = ex.message }
            catch (_: Exception) { error = fail }
            finally { busy = false }
        }
    }

    val vote = session.activeVote
    val voteOpen = vote != null && vote.mode == "roll_call" && session.phase == Phase.VOTING
    val modCaucus = session.caucus?.takeIf { it.kind == "moderated" }
    val holder = floorHolder(session)
    val gsl = session.gsl?.queue.orEmpty()
    val caucusQueue = session.caucus?.queue.orEmpty()
    val answered = modCaucus?.let { m -> live.requests.filter { it.kind == "caucus_signup" && it.caucusId == m.caucusId }.map { it.delegateId }.toSet() }.orEmpty()

    // Papers this vice-chair wrote for a delegation close their consent window from here, whichever
    // delegation is open (the per-delegation Papers section only watches the one on screen).
    if (visible) committeeDocs.filter { it.status == "collecting-endorsements" && it.proxyBy == viceChairUid }
        .forEach { d -> androidx.compose.runtime.key(d.id) { AuthorWindow(e, d, now) } }

    PageSheet(visible, onDismiss) {
        val sel = selected
        if (sel == null) {
            SheetHeader("Represent", subtitle = "Act for a delegation", leading = "Done", onLeading = onDismiss)
            val nav = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 8.dp, bottom = nav + 32.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp)) {
                // Who needs something first (a ballot, a caucus answer), then the floor, then A–Z.
                data class RepRow(val uid: String, val country: String, val status: String?, val note: String?, val rank: Int)
                val rows = live.roster.orEmpty().map { r ->
                    val st = session.attendance[r.delegateId]?.status
                    val seated = isSeated(st)
                    val standing = live.points.count { it.delegateId == r.delegateId && it.status == "pending" } +
                        live.motions.count { it.byDelegateId == r.delegateId && it.status == "pending" } +
                        live.requests.count { it.delegateId == r.delegateId && it.status == "pending" && it.kind != "caucus_signup" }
                    val gslPos = gsl.indexOfFirst { it.delegateId == r.delegateId } + 1
                    val caucusPos = caucusQueue.indexOfFirst { it.delegateId == r.delegateId } + 1
                    val needsBallot = voteOpen && seated && vote?.ballots?.get(r.delegateId) == null
                    val needsSignup = modCaucus != null && seated && r.delegateId !in answered
                    val note = when {
                        needsBallot -> "Hasn't voted"
                        needsSignup -> "Hasn't answered the caucus"
                        holder?.delegateId == r.delegateId -> "Holds the floor"
                        standing > 0 -> "$standing waiting"
                        caucusPos > 0 -> "Caucus list #$caucusPos"
                        gslPos > 0 -> "Speakers list #$gslPos"
                        else -> null
                    }
                    val rank = when { needsBallot || needsSignup -> 0; holder?.delegateId == r.delegateId -> 1; standing > 0 -> 2; else -> 3 }
                    RepRow(r.delegateId, r.country, st, note, rank)
                }.sortedWith(compareBy<RepRow> { it.rank }.thenBy { countryName(it.country) })
                com.munpro.app.ui.kit.Notice(
                    "Everything you send is tagged as your proxy", "So the chair and the delegate can see it was you.",
                    tone = com.munpro.app.ui.kit.Tone.Info, icon = com.munpro.app.ui.kit.Icons.info,
                )
                // Delegations that need something sort to the top (board 09).
                val (needs, rest) = rows.partition { it.rank <= 2 }
                val repCell: com.munpro.app.ui.kit.SectionScope.(RepRow) -> Unit = { r ->
                    cell(
                        countryName(r.country).ifEmpty { "Delegate" }, inset = 56.dp,
                        subtitle = listOfNotNull(ATTENDANCE_LABEL[r.status] ?: "Absent", r.note).joinToString(" · "),
                        leading = { Flag(r.country, 22f) },
                        trailing = if (r.rank <= 2) ({ com.munpro.app.ui.kit.Chip(when (r.rank) { 0 -> "Now"; 1 -> "Floor"; else -> "Waiting" }, com.munpro.app.ui.kit.Tone.Warning) }) else null,
                        onClick = { selected = r.uid; error = null },
                    )
                }
                if (needs.isNotEmpty()) Section(header = "Needs something") { needs.forEach { repCell(it) } }
                Section(header = "Delegations") {
                    if (rows.isEmpty()) cell("No delegations on the roll", chevron = false)
                    rest.forEach { repCell(it) }
                }
            }
            return@PageSheet
        }

        val identity = live.identityFor(sel)
        val entry = live.roster.orEmpty().firstOrNull { it.delegateId == sel }
        val country = countryName(identity.country).ifEmpty { "Delegate" }
        val caps = capabilitiesFor(session, sel, now)
        val attendance = session.attendance[sel]?.status
        val seated = isSeated(attendance)
        val theirPoints = live.points.filter { it.delegateId == sel }
        val theirMotions = live.motions.filter { it.byDelegateId == sel }
        val theirHands = live.requests.filter { it.delegateId == sel }
        val pendingPoint = theirPoints.firstOrNull { it.status == "pending" }
        val ballot = vote?.ballots?.get(sel)
        val theirSignup = modCaucus?.let { m -> theirHands.firstOrNull { it.kind == "caucus_signup" && it.caucusId == m.caucusId } }
        val gslGate = session.floorGate?.takeIf { it.kind == "signup" && it.signupFor != "caucus" }
        val onList = (gsl + caucusQueue).any { it.delegateId == sel }
        val speakAsk = theirHands.firstOrNull { it.kind == "speak" && it.status == "pending" }
        val floorAsk = theirHands.firstOrNull { it.kind == "floor" && it.status == "pending" }

        // The acting-as bar is the sheet's header: it never scrolls away from whose name this is.
        SheetHeader(country, subtitle = "Acting as this delegation", leading = "Back", onLeading = { selected = null; error = null }, divider = true)
        val nav = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 12.dp, bottom = nav + 32.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)) {
            ErrorText(error)
            if (seated) com.munpro.app.ui.kit.Notice("Proxy", "Tagged as ${proxy.byName.ifEmpty { "Vice-chair" }} · acting for $country", tone = com.munpro.app.ui.kit.Tone.Info, icon = com.munpro.app.ui.kit.Icons.people)
            Section(footer = if (!seated) "Mark this delegation present on the Roll tab before acting for it." else null) {
                cell("Attendance", chevron = false, leading = { Flag(identity.country, 18f) }, inset = 52.dp,
                    trailing = { if (seated) com.munpro.app.ui.kit.Chip(ATTENDANCE_LABEL[attendance] ?: "Present", com.munpro.app.ui.kit.Tone.Tint) else com.munpro.app.ui.kit.Chip("Absent", com.munpro.app.ui.kit.Tone.Destructive) })
                if (holdsTheFloor(session, sel)) cell("Holds the floor", tinted = true, chevron = false)
            }

            // ---- the vote: one ballot per delegation; a spent ballot is the chair's to reopen ----
            if (voteOpen && vote != null) {
                val expired = vote.timer?.running == true && timerRemainingMs(vote.timer, now) <= 0
                val changeAsk = theirHands.firstOrNull { it.kind == "vote_change" && it.status == "pending" && it.voteId == vote.voteId }
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Vote: ${vote.motion}", style = Type.headline, color = c.label, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                    BALLOTS.forEach { (b, label) ->
                        val on = ballot == b
                        MunButton(if (on) "✓  $label" else label, {
                            scope.launch {
                                if (alerts.confirm("Vote $label for $country?", "On “${vote.motion}”. Tagged as your proxy. Only the chair can reopen it.", "Vote $label")) {
                                    run({ repo.castBallotAsProxy(e, s, sel, b, proxy) }, "Couldn't cast that ballot. Make sure the delegation is marked present.")
                                }
                            }
                        }, variant = if (on) ButtonVariant.Filled else ButtonVariant.Tinted,
                            enabled = (caps.canCastBallot && ballot == null && !expired && !busy) || on, height = 52.dp)
                    }
                    Text(
                        when { ballot != null -> "Ballot recorded. Only the chair can reopen it."; expired -> "Voting time is up."; caps.canCastBallot -> "One vote per delegation."; else -> caps.lockReason["canCastBallot"] ?: "This delegation can't vote on this one." },
                        style = Type.footnote, color = c.label2, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
                    )
                    if (ballot != null && !expired) MunButton(if (changeAsk != null) "Withdraw Change Request" else "Ask the Chair to Reopen", {
                        run({ if (changeAsk != null) repo.cancelHand(e, s, changeAsk.id) else repo.requestVoteChange(e, s, identity, vote.voteId, "", proxy) },
                            "Couldn't ask the chair to reopen that ballot.")
                    }, variant = ButtonVariant.Plain)
                }
            }

            // ---- the moderated caucus prompt: answered once, by the delegate or for them ----
            if (modCaucus != null && seated) {
                Section(header = "Moderated caucus", footer = if (theirSignup != null) "Answered${if (theirSignup.proxyBy.isNullOrEmpty()) " by the delegate" else ""}. Only the chair can change it now." else null) {
                    if (theirSignup == null) {
                        cell("Speak in this caucus?", subtitle = modCaucus.topic.ifEmpty { null }, chevron = false, trailing = {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Pill("Yes", { run({ repo.answerCaucusSignup(e, s, identity, modCaucus.caucusId, "yes", proxy, signupIdFor(modCaucus.caucusId)) }, "Couldn't answer for this delegation. Make sure it is marked present.") }, filled = true, enabled = !busy)
                                Pill("No", { run({ repo.answerCaucusSignup(e, s, identity, modCaucus.caucusId, "no", proxy, signupIdFor(modCaucus.caucusId)) }, "Couldn't answer for this delegation. Make sure it is marked present.") }, enabled = !busy)
                            }
                        })
                    } else cell(if (theirSignup.answer == "yes") "Wants to speak" else "Passed", chevron = false)
                }
            }

            // ---- the floor ----
            Section(header = "Floor") {
                when {
                    onList -> cell("On the speakers list", chevron = false)
                    speakAsk != null -> cell("Asked to speak", chevron = false, trailing = { TrailingAction("Withdraw") }, onClick = { run({ repo.cancelHand(e, s, speakAsk.id) }, "Couldn't withdraw that. It may already have been ruled on.") })
                    else -> cell("Ask to speak", tinted = true, chevron = false, dim = !seated,
                        onClick = if (seated) ({ run({ repo.joinSignup(e, s, identity, gslGate, null, proxy) }, "Couldn't join the speakers list.") }) else null)
                }
                if (floorAsk != null) cell("Asked for the floor", chevron = false, trailing = { TrailingAction("Withdraw") }, onClick = { run({ repo.cancelHand(e, s, floorAsk.id) }, "Couldn't withdraw that. It may already have been ruled on.") })
                else cell("Ask for the floor", tinted = true, chevron = false, dim = !caps.canRequestFloor,
                    subtitle = if (!caps.canRequestFloor) caps.lockReason["canRequestFloor"] ?: "The chair has closed the floor." else null,
                    onClick = if (caps.canRequestFloor) ({ run({ repo.raiseHand(e, s, identity, "floor", "", proxy) }, "Couldn't send that request.") }) else null)
                cell("Raise a point or motion", tinted = true, chevron = true, onClick = { error = null; raise = true })
            }

            // Yields and recognised points, while this delegation holds the floor.
            MyFloor(e, s, session, identity, theirHands, now, proxy)

            // ---- in flight: everything the delegation could take back itself ----
            val waiting = theirPoints.filter { it.status == "pending" }.size + theirMotions.count { it.status == "pending" } +
                theirHands.count { it.status == "pending" && it.kind != "caucus_signup" && it.kind != "speak" && it.kind != "floor" && it.kind != "vote_change" }
            if (waiting > 0) {
                Section(header = "Waiting on the chair") {
                    theirPoints.filter { it.status == "pending" }.forEach { p ->
                        cell(pointLabel(p.type), subtitle = p.note?.ifEmpty { null }, chevron = false, trailing = { TrailingAction("Withdraw") },
                            onClick = { run({ repo.cancelPoint(e, s, p.id) }, "Couldn't withdraw that. It may already have been ruled on.") })
                    }
                    theirMotions.filter { it.status == "pending" }.forEach { m ->
                        cell(motionMeta(m.type).label, subtitle = m.params.topic?.ifEmpty { null }, chevron = false, trailing = { TrailingAction("Withdraw") },
                            onClick = { run({ repo.cancelMotion(e, s, m.id) }, "Couldn't withdraw that. It may already have been ruled on.") })
                    }
                    theirHands.filter { it.status == "pending" && it.kind !in listOf("caucus_signup", "speak", "floor", "vote_change") }.forEach { h ->
                        cell(REQUEST_LABEL[h.kind] ?: h.kind, chevron = false, trailing = { TrailingAction("Withdraw") },
                            onClick = { run({ repo.cancelHand(e, s, h.id) }, "Couldn't withdraw that. It may already have been ruled on.") })
                    }
                }
            }

            // ---- papers: their consent requests, their papers, write one for them ----
            PapersSection(
                e, s, session, identity, entry?.name?.ifEmpty { null } ?: country,
                canIntroduce = "introduce_document" in caps.proposableMotionTypes, now = now,
                propose = { t, p ->
                    try { repo.proposeMotion(e, s, identity, t, p, "", proxy); haptics.success(); true }
                    catch (ex: DuplicateMotionError) { error = ex.message; false }
                    catch (_: Exception) { error = "That didn't go through."; false }
                },
                proxy = proxy, committeeDocs = committeeDocs,
            )
        }

        // Same placard as the delegate's own: the delegation's floor gate, the proxy stamp on top.
        RaiseSheet(
            visible = raise, onDismiss = { raise = false }, session = session, caps = caps, me = sel,
            motions = theirMotions, hands = theirHands, holdsFloor = holdsTheFloor(session, sel), hasPendingPoint = pendingPoint != null, error = error,
            aiContext = com.munpro.app.ui.kit.AiContext(committee = live.committee, country = country, phase = com.munpro.app.domain.live.PHASE[session.phase]),
            onPoint = { t, note -> run({ repo.raisePoint(e, s, identity, t, note, proxy = proxy) }, "Couldn't raise that point.") { raise = false } },
            onHand = { _, existing -> run({ if (existing != null) repo.cancelHand(e, s, existing) else repo.joinSignup(e, s, identity, session.floorGate, session.caucus?.caucusId, proxy) }, "Couldn't send that request.") { raise = false } },
            onMotion = { t, p ->
                try { repo.proposeMotion(e, s, identity, t, p, "", proxy); haptics.success(); true }
                catch (ex: DuplicateMotionError) { error = ex.message; false }
                catch (_: Exception) { error = "That didn't go through."; false }
            },
        )
    }
}
