package com.munpro.app.ui.live

// Raise Placard: points and motions in a standard sheet (RN RaiseSheet + the mockup's "Raise
// placard" and "Propose motion"). The motion gate is the shared list ∩ what the floor gate admits
// right now; a motion the delegation already moved is dimmed, not hidden.

import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.Segmented
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.background
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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.munpro.app.domain.live.DelegateCapabilities
import com.munpro.app.domain.live.FloorRequest
import com.munpro.app.domain.live.HOLDS_FLOOR_NO_POINT
import com.munpro.app.domain.live.LiveSession
import com.munpro.app.domain.live.MOTION_PENDING_LIMIT
import com.munpro.app.domain.live.Motion
import com.munpro.app.domain.live.MotionParams
import com.munpro.app.domain.live.PROPOSABLE_MOTIONS
import com.munpro.app.domain.live.duplicateMotionNote
import com.munpro.app.domain.live.motionMeta
import com.munpro.app.domain.live.motionNeedsPerSpeaker
import com.munpro.app.domain.live.motionNeedsTopic
import com.munpro.app.domain.live.motionNeedsTotal
import com.munpro.app.domain.live.motionSummary
import com.munpro.app.domain.live.motionsInOrder
import com.munpro.app.domain.live.myLiveMotion
import com.munpro.app.ui.kit.AiAssist
import com.munpro.app.ui.kit.AiContext
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.PlainInput
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.Space
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import kotlinx.coroutines.launch

data class PointChoice(val type: String, val title: String, val detail: String)

val POINTS = listOf(
    PointChoice("personal_privilege", "Personal Privilege", "You can't hear, or something stops you taking part"),
    PointChoice("order", "Point of Order", "The rules of procedure aren't being followed"),
    PointChoice("parliamentary_inquiry", "Parliamentary Inquiry", "Ask the chair about procedure"),
    PointChoice("information", "Point of Information", "A question to the speaker, when they yield to questions"),
)
val POINT_TITLE = POINTS.associate { it.type to it.title }

/** Each point's tile on the placard sheet: urgency reads from the colour. */
private val POINT_LOOK = mapOf(
    "personal_privilege" to (com.munpro.app.ui.kit.SystemColors.red to com.munpro.app.ui.kit.Icons.alert),
    "order" to (com.munpro.app.ui.kit.SystemColors.orange to com.munpro.app.ui.kit.Icons.book),
    "parliamentary_inquiry" to (com.munpro.app.ui.kit.SystemColors.purple to com.munpro.app.ui.kit.Icons.info),
    "information" to (com.munpro.app.ui.kit.SystemColors.blue to com.munpro.app.ui.kit.Icons.bubble),
)

@Composable
fun RaiseSheet(
    visible: Boolean,
    onDismiss: () -> Unit,
    session: LiveSession,
    caps: DelegateCapabilities,
    me: String,
    motions: List<Motion>,
    hands: List<FloorRequest>,
    holdsFloor: Boolean,
    hasPendingPoint: Boolean,
    error: String?,
    /** A point, with the delegate's optional note for the chair. */
    onPoint: (type: String, note: String) -> Unit,
    /** Committee context for the AI topic suggestions. */
    aiContext: AiContext = AiContext(),
    onHand: (kind: String, existingId: String?) -> Unit,
    onMotion: suspend (String, MotionParams) -> Boolean,
) {
    val c = palette
    val scope = rememberCoroutineScope()
    var motion by remember { mutableStateOf<String?>(null) }
    // The point picked, before it is sent: one step for an optional note (the web's point note).
    var point by remember { mutableStateOf<String?>(null) }
    var pointNote by remember { mutableStateOf("") }
    var topic by remember { mutableStateOf("") }
    var total by remember { mutableIntStateOf(10) }
    var per by remember { mutableIntStateOf(45) }
    var sent by remember { mutableStateOf<Pair<String, String>?>(null) }
    var busy by remember { mutableStateOf(false) }
    // Points and motions on two tabs (board 04): no long list greyed out top to bottom.
    var tab by remember { mutableStateOf("points") }
    LaunchedEffect(visible) { if (!visible) { motion = null; sent = null; topic = ""; point = null; pointNote = ""; tab = "points" } }

    val choices = PROPOSABLE_MOTIONS.filter { it in caps.proposableMotionTypes }
    val floor = motionsInOrder(session)
    val live = motions.filter { it.status in listOf("pending", "recognized", "voting") }
    val atLimit = live.size >= MOTION_PENDING_LIMIT
    val signupKind = when (caps.canJoinSignup) { "gsl" -> "speak"; "caucus" -> "caucus_signup"; else -> null }
    val mySignup = signupKind?.let { k -> hands.firstOrNull { it.kind == k && it.status == "pending" } }
    val onList = (session.caucus?.queue ?: session.gsl?.queue).orEmpty().any { it.delegateId == me }
    val nav = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()

    PageSheet(visible, onDismiss) {
        val m = motion
        when {
            sent != null -> SheetHeader("Motion sent", trailing = "Done", onTrailing = onDismiss)
            point != null -> SheetHeader(
                POINT_TITLE[point!!] ?: "Point", leading = "Cancel", onLeading = { point = null; pointNote = "" },
                trailing = "Raise", onTrailing = { onPoint(point!!, pointNote.trim()) },
            )
            m != null -> SheetHeader(
                motionMeta(m).label.substringBefore(" /"), leading = "Cancel", onLeading = { motion = null }, trailing = "Send",
                trailingEnabled = !busy && floor.inOrder && !(motionNeedsTopic(m) && m != "introduce_document" && topic.isBlank()),
                onTrailing = { propose(scope, m, topic, total, per, { busy = it }, onMotion) { sent = it } },
            )
            else -> SheetHeader("Raise Placard", leading = "Cancel", onLeading = onDismiss)
        }
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 8.dp, bottom = nav + 32.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            ErrorText(error)
            val s = sent
            when {
                s != null -> Column(Modifier.fillMaxWidth().padding(top = 110.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    androidx.compose.foundation.layout.Box(
                        Modifier.size(64.dp).clip(androidx.compose.foundation.shape.CircleShape).background(c.tint),
                        contentAlignment = Alignment.Center,
                    ) { com.munpro.app.ui.kit.SfIcon(com.munpro.app.ui.kit.Icons.check, c.onTint, size = 30.dp) }
                    Text("Motion sent", style = Type.title2, color = c.label, textAlign = TextAlign.Center)
                    Text(
                        listOf(s.first.substringBefore(" /"), s.second).filter { it.isNotEmpty() }.joinToString(" · ") + ". The chair will recognise it in order of precedence.",
                        style = Type.subhead, color = c.label2, textAlign = TextAlign.Center,
                    )
                    MunButton("Follow in Your motions", onDismiss, Modifier.padding(top = 12.dp), variant = ButtonVariant.Tinted)
                }
                point != null -> {
                    val pt = point!!
                    Section(header = "Note for the chair · optional", footer = "The chair sees your placard first and recognises you before the note is read.") {
                        item {
                            PlainInput(pointNote, { pointNote = it.take(200) }, "What's wrong, in a few words",
                                modifier = Modifier.fillMaxWidth().padding(16.dp),
                                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
                        }
                        item {
                            AiAssist("point_note", pointNote, aiContext.copy(pointType = POINT_TITLE[pt]), { pointNote = it },
                                Modifier.padding(start = 16.dp, end = 16.dp, bottom = 12.dp))
                        }
                    }
                }
                m != null -> {
                    Section(footer = "The chair decides the order motions are voted on.") {
                        cell("Type", value = motionMeta(m).label.substringBefore(" /"))
                        if (motionNeedsTotal(m)) item { Stepper("Total time", total, "min", 1, 1) { total = it } }
                        if (motionNeedsPerSpeaker(m)) item { Stepper("Per speaker", per, "s", 15, 15) { per = it } }
                    }
                    if (motionNeedsTopic(m)) {
                        Section(header = if (m == "introduce_document") "Paper" else "Topic") {
                            item {
                                PlainInput(
                                    topic, { topic = it }, if (m == "introduce_document") "Which paper (optional)" else "What the committee should discuss",
                                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                                )
                            }
                            if (m != "introduce_document") item {
                                AiAssist("motion_topic", topic, aiContext.copy(motionType = motionMeta(m).label.substringBefore(" /")), { topic = it },
                                    Modifier.padding(start = 16.dp, end = 16.dp, bottom = 12.dp))
                            }
                        }
                    }
                    if (!floor.inOrder) Text(floor.detail, style = Type.footnote, color = c.red, modifier = Modifier.padding(horizontal = 16.dp))
                    Text("The chair recognises motions in order of precedence, then puts them to a vote.", style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 16.dp))
                }
                else -> {
                    if (signupKind != null) {
                        Section {
                            cell(
                                if (mySignup != null) "Leave the speakers list" else if (onList) "You're on the list" else "Join the speakers list",
                                tinted = mySignup == null && !onList, destructive = mySignup != null, chevron = false,
                                onClick = if (onList && mySignup == null) null else ({ onHand(signupKind, mySignup?.id) }),
                            )
                        }
                    }
                    val motionList = if (caps.canProposeMotion) choices else PROPOSABLE_MOTIONS
                    Segmented(listOf("points" to "Points", "motions" to "Motions · ${motionList.size}"), tab, { tab = it })
                    if (tab == "points") {
                        val pointsLocked = !caps.canRaisePoint || hasPendingPoint
                        if (pointsLocked) {
                            com.munpro.app.ui.kit.Notice(
                                if (holdsFloor) "You have the floor" else if (hasPendingPoint) "A point is waiting" else "Points are closed",
                                if (holdsFloor) "Yield your time instead of raising a point." else if (hasPendingPoint) "You already have a point waiting for the chair." else caps.lockReason["canRaisePoint"],
                                tone = com.munpro.app.ui.kit.Tone.Neutral, icon = com.munpro.app.ui.kit.Icons.lock,
                            )
                        }
                        Section {
                            POINTS.forEach { p ->
                                cell(p.title, subtitle = p.detail, dim = pointsLocked, inset = 58.dp,
                                    leading = { val (color, icon) = POINT_LOOK.getValue(p.type); com.munpro.app.ui.kit.IconTile(if (pointsLocked) c.label3 else color, icon) },
                                    onClick = if (!pointsLocked) ({ point = p.type }) else null)
                            }
                        }
                        val waiting = live.count { it.status == "pending" }
                        if (live.isNotEmpty()) Section {
                            cell("Your motions", subtitle = if (waiting > 0) "$waiting waiting on the chair" else "${live.size} with the chair", inset = 58.dp,
                                leading = { com.munpro.app.ui.kit.IconTile(com.munpro.app.ui.kit.SystemColors.gray, com.munpro.app.ui.kit.Icons.list) },
                                onClick = onDismiss)
                        }
                    } else {
                        val lock = when {
                            !caps.canProposeMotion -> caps.lockReason["canProposeMotion"] ?: "Motions aren't open to you right now."
                            !floor.inOrder -> "Motions open again when the floor is free."
                            atLimit -> "You have $MOTION_PENDING_LIMIT motions waiting. Wait for the chair to take one up."
                            else -> null
                        }
                        if (lock != null) com.munpro.app.ui.kit.Notice("Out of order right now", lock, tone = com.munpro.app.ui.kit.Tone.Neutral, icon = com.munpro.app.ui.kit.Icons.lock)
                        Section {
                            motionList.forEach { t ->
                                val dup = myLiveMotion(motions, t)
                                val ok = caps.canProposeMotion && floor.inOrder && !atLimit && dup == null
                                cell(motionMeta(t).label, subtitle = dup?.let { duplicateMotionNote(it) }, dim = !ok, chevron = ok, onClick = if (ok) ({ motion = t }) else null)
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun propose(
    scope: kotlinx.coroutines.CoroutineScope, m: String, topic: String, total: Int, per: Int,
    setBusy: (Boolean) -> Unit, onMotion: suspend (String, MotionParams) -> Boolean, onSent: (Pair<String, String>) -> Unit,
) {
    val p = MotionParams(
        totalDurationSecs = if (motionNeedsTotal(m)) total * 60 else null,
        perSpeakerSecs = if (motionNeedsPerSpeaker(m)) per else null,
        topic = if (motionNeedsTopic(m) && topic.isNotBlank()) topic.trim() else null,
    )
    scope.launch {
        setBusy(true)
        val ok = onMotion(m, p)
        setBusy(false)
        if (ok) onSent(motionMeta(m).label to motionSummary(p))
    }
}
