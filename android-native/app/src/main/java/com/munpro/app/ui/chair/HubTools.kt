package com.munpro.app.ui.chair

// The rest of the committee hub (board B5; web dashboard/chair/committee/[id]): the request
// inbox, the study guide editor, awards & results (standings, final scoring, awards sent to the
// organizer) and the room alert. Same documents and writes as the web: complaints, studyGuides,
// committees/{c}/notifications, the `__final` rollups, events/{e}/standings and events/{e}/results.

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.data.Api
import com.munpro.app.data.AwardResult
import com.munpro.app.data.GuideDoc
import com.munpro.app.data.PaperRepo
import com.munpro.app.data.awardLabel
import com.munpro.app.data.writingAssist
import com.munpro.app.domain.ApplicationData
import com.munpro.app.domain.Complaint
import com.munpro.app.domain.DEFAULT_OVERALL_WEIGHT
import com.munpro.app.domain.DailyMarking
import com.munpro.app.domain.RankedRow
import com.munpro.app.domain.StandingRow
import com.munpro.app.domain.ago
import com.munpro.app.domain.clampMark
import com.munpro.app.domain.complaintStatusLabel
import com.munpro.app.domain.complaintTypeLabel
import com.munpro.app.domain.computeFinalScore
import com.munpro.app.domain.countryName
import com.munpro.app.domain.deriveDays
import com.munpro.app.domain.markingMode
import com.munpro.app.domain.rankEntries
import com.munpro.app.domain.splitMarkings
import com.munpro.app.domain.wordCount
import com.munpro.app.ui.blogs.DraftNotesSheet
import com.munpro.app.ui.blogs.FormatKey
import com.munpro.app.ui.blogs.prefixLine
import com.munpro.app.ui.blogs.wrap
import com.munpro.app.ui.kit.ActionSheet
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.Chip
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Flag
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.PlainInput
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.Segmented
import com.munpro.app.ui.kit.SfIcon
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.SheetRow
import com.munpro.app.ui.kit.Space
import com.munpro.app.ui.kit.Spinner
import com.munpro.app.ui.kit.Tone
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlin.math.roundToInt

private const val FAIL = "Something went wrong. Check your connection and try again."

// ---------------------------------------------------------------------------------------------
// B5.1 · Request inbox
// ---------------------------------------------------------------------------------------------

private fun isClosed(c: Complaint) = c.status == "resolved" || c.status == "rejected"

@Composable
fun RequestInboxScreen(eventId: String, committee: String) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val uid = AppGraph.auth.user?.uid.orEmpty()
    val list by remember(eventId, uid) { AppGraph.chairHub.inbox(eventId, uid) }.collectAsStateWithLifecycle(null)
    val roster = rememberRoster(eventId, committee).data.orEmpty()
    var tab by rememberSaveable { mutableStateOf("open") }
    val notes = remember { mutableStateMapOf<String, String>() }
    var busy by remember { mutableStateOf<String?>(null) }
    val open = list.orEmpty().filter { !isClosed(it) }
    val closed = list.orEmpty().filter { isClosed(it) }

    Screen(back = committee, tabBar = false, title = "Requests", overline = committee) {
        Segmented(listOf("open" to "Open · ${open.size}", "resolved" to "Resolved · ${closed.size}"), tab, { tab = it })
        val shown = if (tab == "open") open else closed
        when {
            list == null -> Spinner()
            shown.isEmpty() -> Empty(if (tab == "open") "No open requests" else "Nothing resolved yet", "Help-desk requests delegates send you appear here.", icon = Icons.bubble)
            else -> shown.forEach { r ->
                val from = roster.firstOrNull { it.id == r.applicationId }
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Chip(complaintTypeLabel(r.type), Tone.Info)
                        Chip(complaintStatusLabel(r.status), if (isClosed(r)) Tone.Tint else if (r.status == "escalated") Tone.Warning else Tone.Neutral)
                        Spacer(Modifier.weight(1f))
                        r.createdAt?.let { Text(ago(it), style = Type.footnote, color = c.label2) }
                    }
                    Text(r.subject, style = Type.headline, color = c.label)
                    from?.let { a ->
                        Text(listOfNotNull(countryName(a.assignedCountry.orEmpty()).ifEmpty { null }, a.applicantName?.ifEmpty { null }).joinToString(" · "), style = Type.footnote, color = c.label2)
                    }
                    if (r.description.isNotBlank()) Text(r.description, style = Type.subhead, color = c.label)
                    if (r.type == "logistics" && r.status == "open") Text("Venue issue — escalate to the organizer", style = Type.footnote, color = c.orange)
                    r.resolution?.takeIf { it.isNotBlank() }?.let { Text("Resolution: $it", style = Type.footnote, color = c.tint) }
                    if (r.status == "open") {
                        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.field)).background(c.fillSoft).padding(horizontal = 12.dp, vertical = 10.dp)) {
                            PlainInput(notes[r.id].orEmpty(), { notes[r.id] = it }, "Resolution note (optional)", singleLine = false, maxLength = 500, modifier = Modifier.fillMaxWidth(),
                                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            MunButton("Escalate", {
                                scope.launch {
                                    if (!alerts.confirm("Escalate to the organizer?", "The organizer takes this request over and gets an email.", "Escalate")) return@launch
                                    busy = r.id
                                    runCatching { AppGraph.chairHub.escalateRequest(r) }.onFailure { alerts.show("Couldn't escalate", FAIL) }
                                    busy = null
                                }
                            }, variant = ButtonVariant.Tinted, enabled = busy == null, height = 42.dp, modifier = Modifier.weight(1f))
                            MunButton("Resolve", {
                                busy = r.id
                                scope.launch {
                                    runCatching { AppGraph.chairHub.resolveRequest(r.id, notes[r.id].orEmpty()) }.onFailure { alerts.show("Couldn't resolve", FAIL) }
                                    busy = null
                                }
                            }, loading = busy == r.id, enabled = busy == null, height = 42.dp, modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// B5.2 · Study guide editor
// ---------------------------------------------------------------------------------------------

@Serializable
private data class GuideDraft(val content: String = "", val savedAt: Long = 0)

private fun guideKey(eventId: String, committee: String) = "guide.draft:$eventId:$committee"

@Composable
fun StudyGuideEditorScreen(eventId: String, committee: String) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val event = rememberEvent(eventId)
    val roster = rememberRoster(eventId, committee).data
    var server by remember { mutableStateOf<GuideDoc?>(null) }
    var loaded by remember { mutableStateOf(false) }
    var original by remember { mutableStateOf("") }
    var body by remember { mutableStateOf(TextFieldValue("")) }
    var restored by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var reading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var aiMenu by remember { mutableStateOf(false) }
    var aiBusy by remember { mutableStateOf<String?>(null) }
    var undo by remember { mutableStateOf<TextFieldValue?>(null) }
    var drafting by remember { mutableStateOf(false) }
    val key = guideKey(eventId, committee)

    LaunchedEffect(eventId, committee) {
        val g = runCatching { AppGraph.chairHub.studyGuide(eventId, committee) }.getOrNull()
        server = g
        original = g?.content.orEmpty()
        val local = AppGraph.saved.read(key, GuideDraft.serializer())
        val use = if (local != null && local.savedAt > (g?.uploadedAt ?: 0L) && local.content != original) { restored = true; local.content } else original
        body = TextFieldValue(use)
        loaded = true
    }
    val dirty = loaded && body.text != original
    // Keep unsent work on this phone a moment after each change.
    LaunchedEffect(body.text) {
        if (!dirty) return@LaunchedEffect
        delay(700)
        AppGraph.saved.write(key, GuideDraft.serializer(), GuideDraft(body.text, System.currentTimeMillis()))
    }

    val pick = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        error = null
        scope.launch {
            if (body.text.isNotBlank() && !alerts.confirm("Replace the guide?", "The imported file replaces what's in the editor.", "Replace")) return@launch
            reading = true
            try { val p = AppGraph.papers.readPicked(uri); undo = body; body = TextFieldValue(p.text) }
            catch (e: PaperRepo.PickError) { error = e.message }
            catch (e: Exception) { error = "Failed to read the file: ${e.message ?: "unknown"}" }
            finally { reading = false }
        }
    }

    val sel = body.selection
    val selected = if (sel.collapsed) "" else body.text.substring(sel.min, sel.max)
    val ctx = mapOf("committee" to committee, "title" to "$committee study guide")
    fun runOnSelection(action: String) {
        if (selected.isBlank() || aiBusy != null) return
        aiBusy = action
        val (s, e) = sel.min to sel.max
        scope.launch {
            val out = writingAssist(action, "study-guide", selected, ctx)
            if (out == null) alerts.show("AI couldn't help this time", "Try again in a moment.")
            else { undo = body; val t = body.text.replaceRange(s, e, out); body = TextFieldValue(t, TextRange(s + out.length)) }
            aiBusy = null
        }
    }
    fun runWhole(action: String, instruction: String? = null) {
        if (aiBusy != null) return
        aiBusy = action
        scope.launch {
            val out = writingAssist(action, "study-guide", body.text, ctx, instruction = instruction)
            if (out == null) alerts.show("AI couldn't help this time", "Try again in a moment.")
            else {
                undo = body
                val t = when (action) { "continue", "draft" -> if (body.text.isBlank()) out else body.text.trimEnd() + "\n\n" + out; else -> out }
                body = TextFieldValue(t, TextRange(t.length))
            }
            aiBusy = null
        }
    }

    val status = when {
        !loaded -> ""
        server != null && !dirty -> "Published · $committee"
        else -> "Draft · $committee"
    }
    Screen(back = committee, tabBar = false, title = "Study guide", overline = status.ifEmpty { committee }) {
        if (!loaded) { Spinner(); return@Screen }
        if (restored) Text("Restored what you were writing on this phone.", style = Type.footnote, color = c.tint, modifier = Modifier.padding(horizontal = 4.dp))
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell)) {
            if (selected.isNotBlank() && Api.available) {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    SfIcon(Icons.sparkle, c.tint, size = 18.dp)
                    listOf("improve" to "Improve", "grammar" to "Fix grammar").forEach { (k, label) -> Pill(if (aiBusy == k) "…" else label, { runOnSelection(k) }, enabled = aiBusy == null) }
                }
            } else Row(Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                FormatKey("H", "Heading", Type.headline) { body = prefixLine(body, "## ") }
                FormatKey("B", "Bold", Type.headline) { body = wrap(body, "**") }
                FormatKey("I", "Italic", Type.headline.copy(fontStyle = FontStyle.Italic, fontFamily = FontFamily.Serif)) { body = wrap(body, "_") }
                FormatKey("•", "Bulleted list", Type.headline) { body = prefixLine(body, "- ") }
                if (Api.available) FormatKey(if (aiBusy != null) "…" else "AI", "Writing help", Type.subhead.copy(fontWeight = FontWeight.Bold), tint = true) { aiMenu = true }
                Spacer(Modifier.weight(1f))
                Pill(if (reading) "Reading…" else "Import", { pick.launch(arrayOf("application/pdf", "text/markdown", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "*/*")) }, enabled = !reading)
                Spacer(Modifier.width(6.dp))
            }
            Box(Modifier.fillMaxWidth().padding(1.dp).background(c.separator))
            BasicTextField(
                body, { body = it },
                textStyle = Type.body.copy(fontSize = 16.sp, lineHeight = 25.sp, color = c.label),
                cursorBrush = SolidColor(c.tint),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                modifier = Modifier.fillMaxWidth().heightIn(min = 360.dp).padding(16.dp),
                decorationBox = { inner ->
                    Box {
                        if (body.text.isEmpty()) Text("# Topic\n\n## 1. Background\n\nWrite the guide here, or import a .md, .docx or PDF.", style = Type.body.copy(fontSize = 16.sp), color = c.label3)
                        inner()
                    }
                },
            )
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (undo != null) com.munpro.app.ui.kit.TextLink("Undo", { body = undo!!; undo = null }, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold))
                Spacer(Modifier.weight(1f))
                Text("${wordCount(body.text)} words", style = Type.caption.copy(fontWeight = FontWeight.Normal), color = c.label2)
            }
        }
        ErrorText(error, Modifier.padding(horizontal = 4.dp))
        MunButton(if (server != null) "Update Guide" else "Publish Guide", {
            if (body.text.isBlank()) { error = "Study guide is empty."; return@MunButton }
            saving = true; error = null
            val wasUpdate = server != null
            scope.launch {
                runCatching { AppGraph.chairHub.publishStudyGuide(eventId, committee, body.text, wasUpdate, event?.title) }.fold(
                    onSuccess = {
                        AppGraph.saved.remove(key)
                        server = GuideDoc(body.text, uploadedAt = System.currentTimeMillis()); original = body.text; restored = false
                        alerts.show(if (wasUpdate) "Guide updated" else "Guide published", "Delegates get an email and a room alert.")
                    },
                    onFailure = { error = "Save failed: ${it.message ?: "permission or network error"}" },
                )
                saving = false
            }
        }, loading = saving, enabled = dirty || server == null)
        Text("${roster?.size ?: "The committee's"} delegates get an email and a room alert.", style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp))
        if (server != null) MunButton("Delete Guide", {
            scope.launch {
                if (!alerts.confirm("Delete the study guide?", "Delegates can no longer read it.", "Delete", destructive = true)) return@launch
                runCatching { AppGraph.chairHub.deleteStudyGuide(eventId, committee) }.fold(
                    onSuccess = { server = null; original = ""; body = TextFieldValue(""); AppGraph.saved.remove(key) },
                    onFailure = { alerts.show("Couldn't delete", FAIL) },
                )
            }
        }, variant = ButtonVariant.Plain, destructive = true)
    }

    ActionSheet(aiMenu, { aiMenu = false }, title = "Writing help", message = "Select text to improve or fix just that part.") {
        SheetRow("Continue writing", { aiMenu = false; runWhole("continue") }, enabled = body.text.isNotBlank(), icon = Icons.pen)
        SheetRow("Draft from notes…", { aiMenu = false; drafting = true }, icon = Icons.sparkle)
        SheetRow("Improve the whole guide", { aiMenu = false; runWhole("improve") }, enabled = body.text.isNotBlank(), icon = Icons.sparkle)
        SheetRow("Fix grammar everywhere", { aiMenu = false; runWhole("grammar") }, enabled = body.text.isNotBlank(), icon = Icons.check)
    }
    DraftNotesSheet(drafting, { drafting = false }) { notes -> runWhole("draft", notes) }
}

// ---------------------------------------------------------------------------------------------
// B5.3–B5.6 · Awards & results
// ---------------------------------------------------------------------------------------------

private val AWARDS = listOf("best_delegate", "outstanding", "honorable")

@Composable
fun AwardsResultsScreen(eventId: String, committee: String) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val event = rememberEvent(eventId)
    val roster = rememberRoster(eventId, committee).data
    val uid = AppGraph.auth.user?.uid.orEmpty()
    val repo = AppGraph.markings
    var tab by rememberSaveable { mutableStateOf("standings") }
    var all by remember { mutableStateOf<List<DailyMarking>?>(null) }
    var results by remember { mutableStateOf<List<AwardResult>>(emptyList()) }
    var published by remember { mutableStateOf<String?>(null) }
    var visibility by remember { mutableStateOf("full") }
    val overall = remember { mutableStateMapOf<String, String>() }
    val picks = remember { mutableStateMapOf<String, String>() }
    var picking by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }

    LaunchedEffect(eventId, committee, reload) {
        val got = runCatching { repo.committee(eventId, committee) }.getOrDefault(emptyList())
        if (reload == 0) {
            overall.clear()
            got.filter { it.kind == "final" || it.id.endsWith("__final") }.forEach { f -> f.chairOverall?.let { overall[f.delegateId] = fmtOverall(it) } }
        }
        all = got
        results = runCatching { AppGraph.chairHub.results(eventId, committee) }.getOrDefault(emptyList())
        published = repo.standingsVisibility(eventId, committee)
        published?.let { visibility = it }
    }

    val mode = markingMode(event)
    val scoring = event?.scoringConfig
    val templates = event?.markingTemplates.orEmpty()
    val weight = scoring?.overallWeight ?: DEFAULT_OVERALL_WEIGHT
    val binary = mode == "binary"
    val dailyAll = all?.let { splitMarkings(it).first }.orEmpty()
    val days = deriveDays(dailyAll, scoring?.markingDays.orEmpty())
    val apps = roster.orEmpty()
    val ranked: List<RankedRow> = rankEntries(apps.map { a ->
        val ov = overall[a.userId]?.trim()?.toDoubleOrNull()?.let { if (binary) clampMark(it, -1.0, 1.0) else clampMark(it, -100.0, 100.0) }
        StandingRow(a.userId, a.id, a.assignedCountry.orEmpty(), a.applicantName.orEmpty(), computeFinalScore(dailyAll.filter { it.delegateId == a.userId }, templates, days, ov, weight, mode))
    })
    // An award already with the organizer (pending or approved) isn't sent twice.
    val sent = AWARDS.associateWith { t -> results.firstOrNull { it.awardType == t && it.status != "revision_requested" } }
    fun act(fn: suspend () -> Unit, done: String) = scope.launch {
        busy = true
        runCatching { fn() }.fold(onSuccess = { alerts.show(done, "") }, onFailure = { alerts.show("Couldn't save", FAIL) })
        busy = false
    }

    Screen(back = committee, tabBar = false, title = "Awards & results", overline = committee) {
        Segmented(listOf("standings" to "Standings", "final" to "Final scoring", "awards" to "Awards"), tab, { tab = it })
        when {
            all == null || roster == null || event == null -> { Spinner(); return@Screen }
            apps.isEmpty() -> { Empty("No approved delegates", "Standings and awards appear once the committee has delegates.", icon = Icons.trophy); return@Screen }
        }
        when (tab) {
            "standings" -> {
                Section(footer = (if (published != null) "Published · delegates see ${if (published == "rank_only") "their rank only" else "the full board"}" else "Not published yet") + " · ties share a rank") {
                    ranked.forEach { rr -> item { RankLine(rr) } }
                }
                Section(header = "Delegates see") {
                    item { Column(Modifier.padding(12.dp)) { Segmented(listOf("full" to "Full board", "rank_only" to "Rank only"), visibility, { visibility = it }) } }
                }
                MunButton(if (published != null) "Update Board" else "Publish Standings", {
                    scope.launch {
                        if (published == null && !alerts.confirm("Publish standings?", "Delegates of $committee will see the board.", "Publish")) return@launch
                        act({ repo.publishStandings(eventId, committee, ranked, uid, visibility, days.size, mode); published = visibility }, "Standings published")
                    }
                }, loading = busy)
                if (published != null) MunButton("Withdraw Board", { act({ repo.unpublishStandings(eventId, committee); published = null }, "Board withdrawn") },
                    variant = ButtonVariant.Plain, destructive = true)
            }
            "final" -> {
                Text(
                    "Final = ${((1 - weight) * 100).roundToInt()}% computed + ${(weight * 100).roundToInt()}% your overall (${if (binary) "−1…+1" else "−100…+100"})",
                    style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp),
                )
                Section(header = "Delegation · your overall · final", footer = "A day attended but unscored is left out; an absent day counts as 0%. Leave overall empty to use the computed % alone.") {
                    ranked.sortedBy { countryName(it.row.country) }.forEach { rr ->
                        item {
                            Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                Flag(rr.row.country, 20f)
                                Column(Modifier.weight(1f)) {
                                    Text(countryName(rr.row.country).ifEmpty { rr.row.name }, style = Type.bodyMedium, color = c.label)
                                    Text("${rr.row.final.presentDays}/${rr.row.final.totalDays} days · computed ${rr.row.final.computedPct.roundToInt()}%", style = Type.footnote, color = c.label2)
                                }
                                Box(Modifier.width(64.dp).clip(RoundedCornerShape(8.dp)).background(c.fillSoft).padding(horizontal = 8.dp, vertical = 6.dp)) {
                                    PlainInput(overall[rr.row.delegateId].orEmpty(), { v -> overall[rr.row.delegateId] = v.filter { it.isDigit() || it == '-' || it == '.' }.take(6) }, "—",
                                        style = Type.subhead, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                                }
                                Text("${rr.row.final.finalScore}%", style = Type.headline, color = c.label, modifier = Modifier.width(48.dp))
                            }
                        }
                    }
                }
                MunButton("Compute & Save Finals", {
                    act({ ranked.forEach { rr -> repo.saveFinal(eventId, committee, rr.row.delegateId, rr.row.applicationId, uid, rr.row.final, days, mode) }; reload++ }, "Finals saved")
                }, loading = busy)
            }
            else -> {
                Section(footer = "Sent to the organizer as pending. Delegates are told once approved.") {
                    AWARDS.forEach { t ->
                        val done = sent[t]
                        val pick = picks[t]?.let { id -> ranked.firstOrNull { it.row.delegateId == id } }
                        val doneRow = done?.let { d -> ranked.firstOrNull { it.row.delegateId == d.delegateUid } }
                        cell(
                            awardLabel(t).orEmpty(),
                            subtitle = when {
                                done != null -> listOfNotNull(doneRow?.let { countryName(it.row.country) }, if (done.status == "approved") "Approved" else "With the organizer").joinToString(" · ")
                                pick != null -> "${countryName(pick.row.country)} · ${pick.row.final.finalScore}%"
                                else -> "Choose a delegation"
                            },
                            leading = {
                                val country = (doneRow ?: pick)?.row?.country
                                if (country != null) Flag(country, 22f) else com.munpro.app.ui.kit.IconTile(com.munpro.app.ui.kit.SystemColors.gold, Icons.trophy)
                            }, inset = 58.dp,
                            trailing = if (done != null) ({ Chip(if (done.status == "approved") "Approved" else "Pending", if (done.status == "approved") Tone.Tint else Tone.Warning) }) else null,
                            onClick = if (done == null) ({ picking = t }) else null,
                        )
                    }
                }
                val toSend = AWARDS.filter { sent[it] == null && picks[it] != null }
                MunButton("Submit Awards", {
                    scope.launch {
                        if (!alerts.confirm("Submit ${toSend.size} award${if (toSend.size == 1) "" else "s"}?", "The organizer approves them before certificates unlock.", "Submit")) return@launch
                        act({
                            toSend.forEach { t ->
                                val id = picks[t]!!
                                val a = apps.first { it.userId == id }
                                AppGraph.chairHub.submitAward(eventId, committee, t, a, ranked.first { it.row.delegateId == id }.row.final)
                            }
                            picks.clear(); reload++
                        }, "Awards sent")
                    }
                }, loading = busy, enabled = toSend.isNotEmpty())
            }
        }
    }

    picking?.let { t ->
        val taken = AWARDS.filter { it != t }.mapNotNull { o -> (sent[o]?.delegateUid ?: picks[o])?.let { it to o } }.toMap()
        PickWinnerSheet(awardLabel(t).orEmpty(), ranked, taken, onDismiss = { picking = null }) { id -> picks[t] = id; picking = null }
    }
}

private fun fmtOverall(v: Double) = if (v == v.roundToInt().toDouble()) v.roundToInt().toString() else v.toString()

@Composable
private fun RankLine(rr: RankedRow, note: String? = null) {
    val c = palette
    Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("${rr.rank}", style = Type.headline, color = c.label2, modifier = Modifier.width(24.dp))
        Flag(rr.row.country, 20f)
        Column(Modifier.weight(1f)) {
            Text(countryName(rr.row.country).ifEmpty { rr.row.name }, style = Type.bodyMedium, color = if (note != null) c.label3 else c.label)
            note?.let { Text(it, style = Type.footnote, color = c.label3) }
        }
        Text("${rr.row.final.finalScore}%", style = Type.headline, color = if (note != null) c.label3 else c.label)
    }
}

/** B5.6: delegations ranked by final %, one tap; one already holding another award is shown but not offered. */
@Composable
private fun PickWinnerSheet(title: String, ranked: List<RankedRow>, taken: Map<String, String>, onDismiss: () -> Unit, onPick: (String) -> Unit) {
    val nav = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    PageSheet(true, onDismiss) {
        SheetHeader(title, leading = "Cancel", onLeading = onDismiss, divider = true)
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 12.dp, bottom = nav + 32.dp)) {
            Section {
                ranked.sortedBy { it.row.delegateId in taken }.forEach { rr ->
                    val other = taken[rr.row.delegateId]
                    item {
                        Box(Modifier.fillMaxWidth().then(if (other == null) Modifier.clickable { onPick(rr.row.delegateId) } else Modifier)) {
                            RankLine(rr, other?.let { "Already ${awardLabel(it)}" })
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// B5.7 · Room alert
// ---------------------------------------------------------------------------------------------

private val ALERT_TYPES = listOf("info" to "Info", "warning" to "Warning", "urgent" to "Urgent")
private val ALERT_EXPIRY = listOf(15 to "15 min", 30 to "30 min", 60 to "1 hour")

@Composable
fun RoomAlertSheet(visible: Boolean, onDismiss: () -> Unit, eventId: String, committee: String) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    var message by remember(visible) { mutableStateOf("") }
    var type by remember(visible) { mutableStateOf("info") }
    var minutes by remember(visible) { mutableIntStateOf(30) }
    var sending by remember { mutableStateOf(false) }
    PageSheet(visible, onDismiss) {
        SheetHeader("Room Alert", leading = "Cancel", onLeading = onDismiss, trailing = if (sending) "…" else "Send", trailingEnabled = message.isNotBlank() && !sending, onTrailing = {
            sending = true
            scope.launch {
                runCatching { AppGraph.chairHub.sendRoomAlert(eventId, committee, message, type, minutes) }.fold(
                    onSuccess = { onDismiss() },
                    onFailure = { alerts.show("Couldn't send the alert", FAIL) },
                )
                sending = false
            }
        })
        Column(Modifier.padding(Space.gutter), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(14.dp)) {
                PlainInput(message, { message = it }, "What should the room know?", singleLine = false, minLines = 3, maxLength = 300, modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                com.munpro.app.ui.kit.SectionHeader("Type")
                Segmented(ALERT_TYPES, type, { type = it })
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                com.munpro.app.ui.kit.SectionHeader("Expires in")
                Segmented(ALERT_EXPIRY, minutes, { minutes = it })
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                com.munpro.app.ui.kit.SectionHeader("Preview")
                val tone = when (type) { "urgent" -> c.red; "warning" -> c.orange; else -> com.munpro.app.ui.kit.SystemColors.blue }
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(tone.copy(alpha = 0.12f)).padding(14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    SfIcon(if (type == "info") Icons.info else Icons.warning, tone, size = 20.dp)
                    Column {
                        Text("${ALERT_TYPES.first { it.first == type }.second} · $committee", style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = tone)
                        Text(message.ifBlank { "Your message" }, style = Type.subhead, color = if (message.isBlank()) c.label3 else c.label)
                    }
                }
            }
        }
    }
}
