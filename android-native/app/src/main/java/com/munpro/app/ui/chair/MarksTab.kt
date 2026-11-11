package com.munpro.app.ui.chair

// Daily marking on the phone: the committee hub's matrix, one delegation at a time (MarksTab +
// MarkSheet), and the console's SpeechScorer, which asks for one mark per criterion when a
// speech ends and appends it to that criterion's list for the day. Every write is MarkingRepo,
// so a mark is a field-path update and never touches the rest of the doc.

import androidx.compose.ui.text.font.FontWeight
import com.munpro.app.ui.kit.Flag
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.munpro.app.AppGraph
import com.munpro.app.data.live.MarkingBase
import com.munpro.app.domain.DailyMarking
import com.munpro.app.domain.MarkingTemplate
import com.munpro.app.domain.clampMark
import com.munpro.app.domain.computeDailyScore
import com.munpro.app.domain.countryName
import com.munpro.app.domain.flagEmoji
import com.munpro.app.domain.markScale
import com.munpro.app.domain.live.DelegateRosterEntry
import com.munpro.app.domain.live.LiveSession
import com.munpro.app.ui.kit.Emoji
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.PlainInput
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.Segmented
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.Space
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import kotlinx.coroutines.launch

private const val FAIL = "That didn't go through. Check your connection and try again."

private val ATTEND_LABEL = mapOf("present" to "Present", "present_and_voting" to "Present and voting", "late" to "Late", "absent" to "Absent")

/** A whole number shows without ".0" (60, not 60.0); a tallied mean keeps one decimal. */
private fun fmtMark(v: Double): String = if (v == Math.floor(v)) v.toLong().toString() else "%.1f".format(v)

@Composable
fun MarksTab(
    session: LiveSession, roster: List<DelegateRosterEntry>, daily: List<DailyMarking>,
    templates: List<MarkingTemplate>, mode: String, baseFor: (DelegateRosterEntry) -> MarkingBase,
    onResults: () -> Unit = {},
) {
    var open by remember { mutableStateOf<DelegateRosterEntry?>(null) }
    if (templates.isEmpty()) {
        Empty("No marking criteria yet", "The organizer sets the committee's rubric on the web, under Modules.")
        return
    }
    Section {
        cell("Results and standings", subtitle = "Finals across the conference, and the board delegates see", onClick = onResults)
    }
    Section(header = "Today's marks", footer = if (mode == "binary") "Each criterion is −1, 0 or +1." else "Each criterion is −100 to +100. The day's % averages the criteria you scored.") {
        roster.sortedBy { countryName(it.country) }.forEach { r ->
            val m = daily.firstOrNull { it.delegateId == r.delegateId }
            val d = computeDailyScore(m, templates, mode)
            val att = session.attendance[r.delegateId]?.status ?: m?.attendanceStatus
            cell(
                countryName(r.country), inset = 52.dp, leading = { Flag(r.country, 20f) },
                subtitle = listOfNotNull(att?.let { ATTEND_LABEL[it] }, "${d.scoredCount} of ${templates.size} scored").joinToString(" · "),
                value = d.pct?.let { "${Math.round(it)}%" } ?: "—",
                onClick = { open = r },
            )
        }
    }
    val r = open
    MarkSheet(
        visible = r != null, onDismiss = { open = null },
        title = r?.let { countryName(it.country) } ?: "",
        marking = r?.let { x -> daily.firstOrNull { it.delegateId == x.delegateId } },
        templates = templates, mode = mode, base = r?.let(baseFor),
    )
}

/** One delegation's day: a value per criterion, and the chair's written feedback. */
@Composable
private fun MarkSheet(
    visible: Boolean, onDismiss: () -> Unit, title: String, marking: DailyMarking?,
    templates: List<MarkingTemplate>, mode: String, base: MarkingBase?,
) {
    val c = palette
    val scope = rememberCoroutineScope()
    val repo = AppGraph.markings
    val vals = remember { mutableStateMapOf<String, String>() }
    var feedback by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(visible, base?.docId) {
        if (!visible) return@LaunchedEffect
        vals.clear()
        templates.forEach { t -> marking?.scores?.get(t.id)?.let { vals[t.id] = fmtMark(it) } }
        feedback = marking?.feedback.orEmpty()
        error = null
    }
    val scale = markScale(mode)
    fun parsed(id: String): Double? = vals[id]?.trim()?.takeIf { it.isNotEmpty() && it != "-" }?.toDoubleOrNull()?.let { clampMark(it, scale.start, scale.endInclusive) }
    fun save() = scope.launch {
        val b = base ?: return@launch
        busy = true; error = null
        try {
            for (t in templates) {
                val now = parsed(t.id)
                val before = marking?.scores?.get(t.id)
                if (now != before) repo.setCriterion(b, t.id, now)
            }
            if (feedback != marking?.feedback.orEmpty()) repo.setFeedback(b, feedback)
            onDismiss()
        } catch (_: Exception) { error = FAIL } finally { busy = false }
    }
    val nav = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    PageSheet(visible, onDismiss) {
        SheetHeader(title, leading = "Cancel", onLeading = onDismiss, trailing = "Save", trailingEnabled = !busy, onTrailing = { save() })
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 8.dp, bottom = nav + 32.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)) {
            ErrorText(error)
            Section(header = "Criteria", footer = "Leave a criterion blank if you didn't see enough to score it; blanks don't count against the day.") {
                templates.forEach { t ->
                    val entries = marking?.scoreEntries?.get(t.id).orEmpty()
                    item {
                        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            val v = vals[t.id].orEmpty()
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(t.name, style = Type.bodyMedium, color = c.label, modifier = Modifier.weight(1f))
                                Text(v.toDoubleOrNull()?.let { if (it > 0) "+${fmtMark(it)}" else fmtMark(it) } ?: "—", style = Type.headline, color = if (v.isEmpty()) c.label3 else c.tint)
                            }
                            if (entries.size > 1) Text("${entries.size} marks today (${entries.joinToString(", ") { fmtMark(it) }}). A new value replaces them.", style = Type.footnote, color = c.label2)
                            if (mode == "binary") ScoreInput(mode, v) { vals[t.id] = it } else ScoreSlider(v) { vals[t.id] = it }
                        }
                    }
                }
            }
            Section(header = "Feedback") {
                item {
                    PlainInput(feedback, { feedback = it }, "What the delegate did well, and what to work on", modifier = Modifier.fillMaxWidth().padding(16.dp),
                        singleLine = false, minLines = 3, keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
                }
            }
            MunButton("Save Marks", { save() }, loading = busy)
        }
    }
}

/** The mark sheet's −100…+100 slider (board 06): snaps to 5, blank until first moved. */
@Composable
private fun ScoreSlider(value: String, onChange: (String) -> Unit) {
    val c = palette
    val v = value.toFloatOrNull()
    androidx.compose.material3.Slider(
        value = v ?: 0f,
        onValueChange = { onChange(((Math.round(it / 5f) * 5)).toString()) },
        valueRange = -100f..100f,
        colors = androidx.compose.material3.SliderDefaults.colors(
            thumbColor = c.cell, activeTrackColor = if (v == null) c.fill else c.tint, inactiveTrackColor = c.fillSoft,
        ),
    )
    Row {
        Text("−100", style = Type.caption.copy(fontWeight = FontWeight.Normal), color = c.label2, modifier = Modifier.weight(1f))
        if (v != null) com.munpro.app.ui.kit.TextLink("Clear", { onChange("") }, style = Type.caption)
        else Text("0", style = Type.caption.copy(fontWeight = FontWeight.Normal), color = c.label2)
        Text("+100", style = Type.caption.copy(fontWeight = FontWeight.Normal), color = c.label2, textAlign = androidx.compose.ui.text.style.TextAlign.End, modifier = Modifier.weight(1f))
    }
}

/** −1/0/+1 in binary mode; a signed number −100…+100 otherwise. Empty = not scored. */
@Composable
private fun ScoreInput(mode: String, value: String, onChange: (String) -> Unit) {
    val c = palette
    if (mode == "binary") {
        Segmented(listOf("" to "—", "-1" to "−1", "0" to "0", "1" to "+1"), value.ifEmpty { "" }, onChange)
    } else {
        // Board 05 "Score the speech": five quick marks, the chosen one filled.
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf(-100, -50, 0, 50, 100).forEach { q ->
                com.munpro.app.ui.kit.Pill(if (q > 0) "+$q" else if (q < 0) "−${-q}" else "0", { onChange("$q") }, filled = value == "$q",
                    tone = if (value == "$q") com.munpro.app.ui.kit.Tone.Tint else com.munpro.app.ui.kit.Tone.Neutral, modifier = Modifier.weight(1f))
            }
        }
    }
}

/**
 * When a GSL speech ends, one mark per criterion for that speech, appended to the day's list
 * (web SpeechScorer). Pre-filled with each criterion's last mark; only a CHANGED value is
 * appended, as the web does, so tapping Save on an untouched form adds nothing.
 */
@Composable
fun SpeechScorerSheet(
    visible: Boolean, onDismiss: () -> Unit, country: String, marking: DailyMarking?,
    templates: List<MarkingTemplate>, mode: String, base: MarkingBase?,
) {
    val scope = rememberCoroutineScope()
    val repo = AppGraph.markings
    val vals = remember { mutableStateMapOf<String, String>() }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    fun last(t: MarkingTemplate): Double? = marking?.scoreEntries?.get(t.id)?.lastOrNull() ?: marking?.scores?.get(t.id)
    LaunchedEffect(visible, base?.docId) {
        if (!visible) return@LaunchedEffect
        vals.clear(); error = null
        templates.forEach { t -> last(t)?.let { vals[t.id] = fmtMark(it) } }
    }
    val scale = markScale(mode)
    fun parsed(id: String): Double? = vals[id]?.trim()?.takeIf { it.isNotEmpty() && it != "-" }?.toDoubleOrNull()?.let { clampMark(it, scale.start, scale.endInclusive) }
    fun save() = scope.launch {
        val b = base ?: return@launch
        busy = true; error = null
        try {
            for (t in templates) {
                val v = parsed(t.id) ?: continue
                if (last(t) == null || v != last(t)) repo.appendEntry(b, t.id, v)
            }
            onDismiss()
        } catch (_: Exception) { error = FAIL } finally { busy = false }
    }
    val nav = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    PageSheet(visible, onDismiss) {
        SheetHeader("Score ${countryName(country)}'s speech", leading = "Skip", onLeading = onDismiss, trailing = "Save", trailingEnabled = !busy, onTrailing = { save() })
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 8.dp, bottom = nav + 32.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)) {
            ErrorText(error)
            Section(footer = "Each mark joins today's list for that criterion; the day's score is their average.") {
                templates.forEach { t ->
                    item {
                        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(t.name, style = Type.bodyMedium, color = palette.label)
                            ScoreInput(mode, vals[t.id].orEmpty()) { vals[t.id] = it }
                        }
                    }
                }
            }
            MunButton("Save Speech Marks", { save() }, loading = busy)
        }
    }
}

/**
 * Results and published standings for the committee (the hub's Awards & Results): each
 * delegation's final across the conference days, the chair's optional holistic overall, Save
 * finals (the `__final` rollup docs) and Publish / Withdraw the board delegates see. Reads the
 * committee's marks once per opening, never a listener.
 */
@Composable
fun StandingsSheet(
    visible: Boolean, onDismiss: () -> Unit, eventId: String, committee: String, roster: List<DelegateRosterEntry>,
    templates: List<MarkingTemplate>, mode: String, scoring: com.munpro.app.domain.ScoringConfig?, uid: String,
) {
    val c = palette
    val scope = rememberCoroutineScope()
    val repo = AppGraph.markings
    var all by remember { mutableStateOf<List<DailyMarking>?>(null) }
    var published by remember { mutableStateOf<String?>(null) }
    var visibility by remember { mutableStateOf("full") }
    val overall = remember { mutableStateMapOf<String, String>() }
    var busy by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(visible) {
        if (!visible) return@LaunchedEffect
        note = null; all = null
        val got = runCatching { repo.committee(eventId, committee) }.getOrDefault(emptyList())
        overall.clear()
        got.filter { it.kind == "final" || it.id.endsWith("__final") }.forEach { f -> f.chairOverall?.let { overall[f.delegateId] = fmtMark(it) } }
        all = got
        published = repo.standingsVisibility(eventId, committee)
        published?.let { visibility = it }
    }
    val scale = markScale(mode)
    val weight = scoring?.overallWeight ?: com.munpro.app.domain.DEFAULT_OVERALL_WEIGHT
    val dailyAll = all?.let { com.munpro.app.domain.splitMarkings(it).first }.orEmpty()
    val days = com.munpro.app.domain.deriveDays(dailyAll, scoring?.markingDays.orEmpty())
    val rows = roster.map { r ->
        val mine = dailyAll.filter { it.delegateId == r.delegateId }
        val ov = overall[r.delegateId]?.trim()?.toDoubleOrNull()?.let { clampMark(it, scale.start, scale.endInclusive) }
        com.munpro.app.domain.StandingRow(r.delegateId, r.applicationId, r.country, "", com.munpro.app.domain.computeFinalScore(mine, templates, days, ov, weight, mode))
    }
    val ranked = com.munpro.app.domain.rankEntries(rows)
    fun act(fn: suspend () -> Unit, done: String) = scope.launch {
        busy = true; note = null
        try { fn(); note = done } catch (_: Exception) { note = FAIL } finally { busy = false }
    }
    val nav = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    PageSheet(visible, onDismiss) {
        SheetHeader("Results", trailing = "Done", onTrailing = onDismiss, divider = true)
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 12.dp, bottom = nav + 32.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)) {
            if (all == null) { com.munpro.app.ui.kit.Loading(); return@Column }
            note?.let { Text(it, style = Type.footnote, color = c.label2) }
            Section(
                header = "${days.size} ${if (days.size == 1) "day" else "days"}",
                footer = "Final = the counted days' average (absent day = 0%; a day attended but unscored is left out), blended ${Math.round((1 - weight) * 100)}/${Math.round(weight * 100)} with your overall when you give one.",
            ) {
                ranked.forEach { rr ->
                    item {
                        Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text("${rr.rank}", style = Type.headline, color = c.label2, modifier = Modifier.width(24.dp))
                            Flag(rr.row.country, 20f)
                            Column(Modifier.weight(1f)) {
                                Text(countryName(rr.row.country), style = Type.bodyMedium, color = c.label)
                                Text("Computed ${fmtMark(rr.row.final.computedPct)}% · ${rr.row.final.presentDays}/${rr.row.final.totalDays} days scored", style = Type.footnote, color = c.label2)
                            }
                            PlainInput(overall[rr.row.delegateId].orEmpty(), { v -> overall[rr.row.delegateId] = v.filter { it.isDigit() || it == '-' || it == '.' }.take(6) }, "Overall",
                                modifier = Modifier.width(72.dp), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                            Text("${rr.row.final.finalScore}%", style = Type.headline, color = c.label)
                        }
                    }
                }
            }
            MunButton("Save Finals", {
                act({ ranked.forEach { rr -> repo.saveFinal(eventId, committee, rr.row.delegateId, rr.row.applicationId, uid, rr.row.final, days, mode) } }, "Finals saved.")
            }, loading = busy, variant = com.munpro.app.ui.kit.ButtonVariant.Tinted)
            Section(
                header = "Published standings",
                footer = if (published != null) "Delegates can see the board (${if (published == "rank_only") "their rank only" else "everyone's scores"})." else "Not published. Publishing shows the board to the room.",
            ) {
                item {
                    Column(Modifier.padding(12.dp)) {
                        Segmented(listOf("full" to "Show scores", "rank_only" to "Rank only"), visibility, { visibility = it })
                    }
                }
            }
            MunButton(if (published != null) "Update Board" else "Publish Standings", {
                act({ repo.publishStandings(eventId, committee, ranked, uid, visibility, days.size, mode); published = visibility }, "Standings published.")
            }, loading = busy)
            if (published != null) MunButton("Withdraw Board", { act({ repo.unpublishStandings(eventId, committee); published = null }, "Board withdrawn.") },
                variant = com.munpro.app.ui.kit.ButtonVariant.Plain, destructive = true)
        }
    }
}

