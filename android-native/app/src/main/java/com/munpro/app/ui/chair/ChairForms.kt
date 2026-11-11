package com.munpro.app.ui.chair

// The chair's direct actions that don't come from a delegate's motion: start a caucus (web
// ModCaucusStartModal / CaucusPanel) and open a vote (web VotingPanel.OpenVoteForm). Same
// writes as the web: SessionRepo.startModCaucus / startUnmodCaucus / openVote.

import com.munpro.app.domain.P5_CODES
import com.munpro.app.ui.kit.Flag
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import com.munpro.app.data.live.SessionRepo
import com.munpro.app.domain.countryName
import com.munpro.app.domain.flagEmoji
import com.munpro.app.domain.live.DelegateRosterEntry
import com.munpro.app.domain.live.LiveSession
import com.munpro.app.domain.live.VOTE_DEFAULT_SECS
import com.munpro.app.ui.kit.AiAssist
import com.munpro.app.ui.kit.AiContext
import com.munpro.app.ui.kit.CheckMark
import com.munpro.app.ui.kit.Emoji
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.PlainInput
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.Segmented
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.Space
import com.munpro.app.ui.kit.Toggle
import com.munpro.app.ui.live.Stepper
import kotlinx.coroutines.launch

private const val FAIL = "That didn't go through. Check your connection and try again."

/** Start a moderated or unmoderated caucus directly. */
@Composable
fun StartCaucusSheet(
    visible: Boolean, onDismiss: () -> Unit, aiContext: AiContext = AiContext(),
    onStart: suspend (moderated: Boolean, topic: String, totalSecs: Int, perSpeakerSecs: Int) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var moderated by remember { mutableStateOf(true) }
    var topic by remember { mutableStateOf("") }
    var totalMin by remember { mutableStateOf(10) }
    var perSec by remember { mutableStateOf(45) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(visible) { if (visible) { error = null; busy = false } }
    val nav = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    fun start() = scope.launch {
        busy = true; error = null
        try { onStart(moderated, topic.trim(), totalMin * 60, perSec); onDismiss() } catch (_: Exception) { error = FAIL } finally { busy = false }
    }
    PageSheet(visible, onDismiss) {
        SheetHeader("Start a Caucus", leading = "Cancel", onLeading = onDismiss, trailing = "Start", trailingEnabled = !busy, onTrailing = { start() })
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 8.dp, bottom = nav + 32.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)) {
            ErrorText(error)
            Segmented(listOf(true to "Moderated", false to "Unmoderated"), moderated, { moderated = it })
            Section(footer = if (moderated) "Opens a speakers signup for the caucus, as a passed motion does." else "Delegates leave their seats; the clock runs the whole caucus.") {
                item { Stepper("Total time", totalMin, "min", 1, 1) { totalMin = it } }
                if (moderated) item { Stepper("Per speaker", perSec, "s", 15, 15) { perSec = it } }
            }
            if (moderated) {
                Section(header = "Topic") {
                    item {
                        PlainInput(topic, { topic = it }, "What the caucus is on (optional)", modifier = Modifier.fillMaxWidth().padding(16.dp),
                            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
                    }
                    item { AiAssist("caucus_topic", topic, aiContext, { topic = it }, Modifier.padding(start = 16.dp, end = 16.dp, bottom = 12.dp)) }
                }
            }
            MunButton("Start Caucus", { start() }, loading = busy)
        }
    }
}


/** Open a vote with no motion behind it (VotingPanel.OpenVoteForm). */
@Composable
fun OpenVoteSheet(
    visible: Boolean, onDismiss: () -> Unit, session: LiveSession, roster: List<DelegateRosterEntry>, aiContext: AiContext = AiContext(),
    onOpen: suspend (SessionRepo.OpenVoteConfig) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var motion by remember { mutableStateOf("") }
    var voteType by remember { mutableStateOf("substantive") }
    var threshold by remember { mutableStateOf("simple_majority") }
    var mode by remember { mutableStateOf("roll_call") }
    var durSecs by remember { mutableStateOf(VOTE_DEFAULT_SECS) }
    var scMode by remember { mutableStateOf(false) }
    var division by remember { mutableStateOf(false) }
    val p5 = remember { mutableStateListOf<String>() }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(visible) { if (visible) { error = null; busy = false } }
    val present = roster.filter { session.attendance[it.delegateId]?.status.let { st -> st == "present" || st == "present_and_voting" } }
    val nav = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    fun open() = scope.launch {
        if (motion.isBlank()) return@launch
        busy = true; error = null
        try {
            onOpen(SessionRepo.OpenVoteConfig(
                motion = motion.trim(), voteType = voteType, threshold = threshold, mode = mode, durationSecs = durSecs,
                scMode = scMode, p5 = if (scMode) p5.toList() else emptyList(), divisionOfQuestion = division, round = 1,
            ))
            onDismiss()
        } catch (ex: SessionRepo.VoteAlreadyOpen) { error = ex.message } catch (_: Exception) { error = FAIL } finally { busy = false }
    }
    PageSheet(visible, onDismiss) {
        SheetHeader("Open a Vote", leading = "Cancel", onLeading = onDismiss, trailing = "Open", trailingEnabled = !busy && motion.isNotBlank(), onTrailing = { open() })
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 8.dp, bottom = nav + 32.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)) {
            ErrorText(error)
            Section(header = "Motion / question") {
                item {
                    PlainInput(motion, { motion = it }, "e.g. Draft Resolution 1.1", modifier = Modifier.fillMaxWidth().padding(16.dp),
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
                }
                item { AiAssist("vote_label", motion, aiContext, { motion = it }, Modifier.padding(start = 16.dp, end = 16.dp, bottom = 12.dp)) }
            }
            Segmented(listOf("substantive" to "Substantive", "procedural" to "Procedural"), voteType, { voteType = it })
            Segmented(listOf("simple_majority" to "Majority", "two_thirds" to "Two-thirds", "consensus" to "Consensus"), threshold, { threshold = it })
            Segmented(listOf("roll_call" to "Roll call", "tally" to "Show of hands"), mode, { mode = it })
            Section(footer = if (mode == "roll_call") "Each delegate casts from their own screen until the clock runs out." else "You count the hands and enter the totals.") {
                item { Stepper("Voting time", durSecs, "s", 30, 30) { durSecs = it } }
                cell("Division of the question", chevron = false, trailing = { Toggle(division, { division = it }, "Division of the question") })
                cell("Security Council veto", chevron = false, trailing = {
                    Toggle(scMode, { on ->
                        scMode = on
                        // Pre-tick the permanent five among those present (the web's P5 guess, by code).
                        if (on && p5.isEmpty()) p5.addAll(present.filter { it.country.lowercase() in P5_CODES }.map { it.delegateId })
                    }, "Security Council veto")
                })
            }
            if (scMode) {
                Section(header = "Permanent members", footer = "A vote against from any of them vetoes a substantive question.") {
                    present.forEach { r ->
                        cell(countryName(r.country), inset = 52.dp, chevron = false, leading = { Flag(r.country, 20f) },
                            trailing = if (r.delegateId in p5) ({ CheckMark() }) else null,
                            onClick = { if (r.delegateId in p5) p5.remove(r.delegateId) else p5.add(r.delegateId) })
                    }
                }
            }
            MunButton("Open Vote", { open() }, loading = busy, enabled = motion.isNotBlank())
        }
    }
}
