package com.munpro.app.ui.documents

// Documents and Position paper (the mockup's "Your conference" screens the RN app never
// built). Documents: what you read (from the dais), what you owe (your paper), and what the
// committee is drafting (approved papers). The position paper follows the web's
// PositionPaperUpload.tsx: write it, or pick a PDF / Word / .md file whose TEXT is used (the file
// isn't stored); read-first once submitted, with the chairs' verdict on top.

import com.munpro.app.ui.kit.Flag
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.data.Api
import com.munpro.app.data.PaperRepo
import com.munpro.app.data.rememberCached
import com.munpro.app.data.rememberReaderDoc
import com.munpro.app.domain.CommitteeDoc
import com.munpro.app.domain.Member
import com.munpro.app.domain.PaperMarking
import com.munpro.app.domain.committeeDocBadge
import com.munpro.app.domain.committeeDocTypeLabel
import com.munpro.app.domain.committeeOf
import com.munpro.app.domain.countryName
import com.munpro.app.domain.dayMonth
import com.munpro.app.domain.findConference
import com.munpro.app.domain.flagEmoji
import com.munpro.app.domain.isChairTierRole
import com.munpro.app.domain.isExecBoardRole
import com.munpro.app.domain.roleLabel
import com.munpro.app.domain.sameCommittee
import com.munpro.app.domain.wordCount
import com.munpro.app.nav.PositionPaperRoute
import com.munpro.app.nav.ReaderRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.conference.initials
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.Emoji
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Inter
import com.munpro.app.ui.kit.Loading
import com.munpro.app.ui.kit.Markdown
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.PlainInput
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SectionHeader
import com.munpro.app.ui.kit.SystemColors
import com.munpro.app.ui.kit.TextLink
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.kit.rememberHaptics
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer

/** The mockup's file badge: a small coloured tile with a two-letter kind. */
@Composable
fun DocBadge(text: String, color: Color) {
    Box(Modifier.size(width = 34.dp, height = 40.dp).clip(RoundedCornerShape(6.dp)).background(color.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) {
        Text(text, color = color, fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 11.sp)
    }
}

@Composable
fun DocumentsScreen(appId: String) {
    val nav = LocalNav.current
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()
    val conf = findConference(confs.conferences, appId)
    val committee = conf?.let { committeeOf(it.app) }.orEmpty()
    val eventId = conf?.event?.id
    val guide = rememberReaderDoc("guide", eventId, committee = committee)
    val rules = rememberReaderDoc("rules", eventId)
    val papers = rememberCached(eventId?.let { "committeeDocs:$it:$committee" }, ListSerializer(CommitteeDoc.serializer()), maxAgeMs = com.munpro.app.data.Fresh.SHORT) {
        AppGraph.papers.approvedCommitteeDocs(eventId!!, committee)
    }

    if (conf == null) return Screen(back = "Back", tabBar = false) { Empty("Conference not found", "Pull down on Today to refresh your conferences.") }
    val app = conf.app

    Screen(back = committee.ifEmpty { "Back" }, tabBar = false, title = "Documents") {
        Section(header = "From the dais") {
            cell(
                "Study guide", subtitle = if (guide.data != null) "Your committee's background reading" else "Not published yet", inset = 62.dp,
                leading = { DocBadge("SG", SystemColors.orange) }, dim = guide.data == null,
                value = if (guide.saved) "Saved" else null,
                onClick = if (guide.data != null) ({ nav.go(ReaderRoute("guide", conf.event.id, committee = committee)) }) else null,
            )
            cell(
                "Rules of procedure", subtitle = if (rules.data != null) "The conference rulebook" else "Not published yet", inset = 62.dp,
                leading = { DocBadge("MD", SystemColors.indigo) }, dim = rules.data == null,
                value = if (rules.saved) "Saved" else null,
                onClick = if (rules.data != null) ({ nav.go(ReaderRoute("rules", conf.event.id, committee = committee)) }) else null,
            )
        }
        Section(header = "Yours") {
            cell(
                "Position paper", inset = 62.dp, leading = { DocBadge("DOC", SystemColors.blue) },
                subtitle = app.positionPaperUpdatedAt?.let { "Handed in ${dayMonth(it)}" } ?: "Not handed in yet",
                chevron = false,
                trailing = { TextLink(if (app.positionPaperContent.isNullOrBlank()) "Upload" else "Open", { nav.go(PositionPaperRoute(app.id)) }) },
                onClick = { nav.go(PositionPaperRoute(app.id)) },
            )
        }
        val list = papers.data
        Section(header = "Committee", footer = if (list.isNullOrEmpty()) "Working papers and draft resolutions appear here once the chairs approve them." else null) {
            cell("Committee papers", subtitle = "Yours with their status, and Submit a Paper", tinted = true, inset = 62.dp,
                leading = { DocBadge("WP", SystemColors.green) }, onClick = { nav.go(com.munpro.app.nav.CommitteePapersRoute(app.id)) })
            when {
                list == null && !papers.failed -> item { Box(Modifier.padding(16.dp)) { Loading() } }
                list.isNullOrEmpty() -> cell("Nothing approved yet", chevron = false, dim = true)
                else -> list.forEach { d ->
                    cell(
                        d.title.ifEmpty { committeeDocTypeLabel(d.type) },
                        subtitle = when {
                            d.signatories.isNotEmpty() -> "${d.sponsors.size} sponsor${if (d.sponsors.size == 1) "" else "s"}, ${d.signatories.size} signator${if (d.signatories.size == 1) "y" else "ies"}"
                            d.sponsors.isNotEmpty() -> d.sponsors.joinToString(", ") { countryName(it) }
                            else -> committeeDocTypeLabel(d.type)
                        },
                        inset = 62.dp,
                        leading = { DocBadge(committeeDocBadge(d.type), SystemColors.green) },
                        onClick = { nav.go(ReaderRoute("doc", conf.event.id, d.id, committee)) },
                    )
                }
            }
        }
    }
}

private val STATUS = mapOf(
    "review" to Triple("Under review by the Chairs", "Your paper has been submitted. You can still edit it until it's graded.", SystemColors.blue),
    "approved" to Triple("Position paper approved", "The Chairs approved your paper.", SystemColors.green),
    "revision" to Triple("Revision requested", "The Chairs asked for changes. Edit and resubmit.", SystemColors.orange),
    "flagged" to Triple("Plagiarism concern flagged", "The Chairs flagged a concern. Review the feedback and resubmit.", SystemColors.red),
)

@Composable
fun PositionPaperScreen(appId: String) {
    val c = palette
    val haptics = rememberHaptics()
    val scope = rememberCoroutineScope()
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()
    val conf = findConference(confs.conferences, appId)
    val app = conf?.app

    val submitted = app?.positionPaperContent.orEmpty()
    var editing by remember(appId) { mutableStateOf(submitted.isBlank()) }
    var content by remember(appId) { mutableStateOf(submitted) }
    var picked by remember { mutableStateOf<PaperRepo.Picked?>(null) }
    var reading by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var marking by remember { mutableStateOf<PaperMarking?>(null) }

    LaunchedEffect(app?.id, submitted.isNotBlank()) {
        if (app != null && submitted.isNotBlank()) marking = AppGraph.papers.paperMarking(app.id, app.userId)
    }

    val pick = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        error = null
        reading = true
        scope.launch {
            try {
                val p = AppGraph.papers.readPicked(uri)
                picked = p
                content = p.text
            } catch (e: PaperRepo.PickError) {
                error = e.message
            } catch (e: Exception) {
                error = "Failed to read the file: ${e.message ?: "unknown"}"
            } finally {
                reading = false
            }
        }
    }

    if (conf == null || app == null) return Screen(back = "Back", tabBar = false) { Empty("Conference not found", "Pull down on Today to refresh your conferences.") }

    fun save() {
        if (content.isBlank()) { error = "Position paper is empty."; return }
        saving = true
        error = null
        scope.launch {
            try {
                AppGraph.papers.savePositionPaper(app.id, content)
                haptics.success()
                AppGraph.conferences.reload()
                editing = false
                picked = null
            } catch (e: Exception) {
                error = "Save failed: ${e.message ?: "unknown"}"
            } finally {
                saving = false
            }
        }
    }

    Screen(back = "Back", tabBar = false, title = "Position paper", overline = listOfNotNull(app.assignedCountry?.let(::countryName), committeeOf(app).ifEmpty { null }).joinToString(", ").ifEmpty { null }) {
        if (submitted.isNotBlank()) {
            val (label, sub, color) = STATUS[marking?.paperStatus ?: "review"] ?: STATUS.getValue("review")
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(color.copy(alpha = 0.10f)).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(label, style = Type.headline, color = color)
                Text(sub, style = Type.subhead, color = c.label2)
                marking?.feedback?.takeIf { it.isNotBlank() }?.let { Text("“$it”", style = Type.body.copy(fontStyle = androidx.compose.ui.text.font.FontStyle.Italic), color = c.label, modifier = Modifier.padding(top = 6.dp)) }
                app.positionPaperUpdatedAt?.let { Text("Handed in ${dayMonth(it)}", style = Type.footnote, color = c.label2, modifier = Modifier.padding(top = 4.dp)) }
            }
        }

        if (!editing) {
            // Read-first once submitted; the editor only appears when the delegate chooses to edit.
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp)) { Markdown(submitted) }
            Text("${wordCount(submitted)} words. Only your committee chairs can read this paper.", style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 16.dp).offset(y = (-14).dp))
            MunButton("Edit Paper", { content = submitted; editing = true; error = null }, variant = ButtonVariant.Tinted)
            return@Screen
        }

        Section(header = "Choose a file", footer = "PDF, Word (.docx) or Markdown. Only the text is kept; the file itself isn't stored.") {
            cell(
                if (reading) "Reading the file…" else if (picked != null) "Choose a different file" else "Choose a file",
                subtitle = if (picked == null) "PDF or Word up to 20 MB, Markdown up to 2 MB" else null,
                tinted = true, chevron = false,
                onClick = if (reading) null else ({ pick.launch(arrayOf("application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/markdown", "text/plain", "text/*")) }),
            )
            picked?.let { p ->
                cell(
                    p.name, inset = 62.dp,
                    subtitle = listOfNotNull(if (p.size >= 0) fileSize(p.size) else null, "${wordCount(p.text)} words read").joinToString(" · "),
                    leading = { DocBadge(p.name.substringAfterLast('.', "DOC").uppercase().take(4), SystemColors.red) },
                )
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
            SectionHeader(if (picked != null) "The text, ready to edit" else "Or write it here")
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell)) {
                PlainInput(
                    content, { content = it }, "Your country's position on the agenda. Markdown headings and lists are kept.",
                    singleLine = false, minLines = 8, style = Type.body.copy(lineHeight = 22.sp),
                    modifier = Modifier.fillMaxWidth().heightIn(min = 200.dp).padding(14.dp),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                )
                Text("${wordCount(content)} words", style = Type.caption, color = c.label2, textAlign = TextAlign.End, modifier = Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, bottom = 10.dp))
            }
        }

        ErrorText(error)
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            MunButton(if (submitted.isBlank()) "Submit Paper" else "Save Changes", ::save, loading = saving, enabled = content.isNotBlank() && !reading)
            if (submitted.isNotBlank()) MunButton("Cancel", { content = submitted; picked = null; editing = false; error = null }, variant = ButtonVariant.Plain)
        }
    }
}

private fun fileSize(bytes: Long): String = when {
    bytes >= 1024 * 1024 -> "%.1f MB".format(bytes / 1024.0 / 1024.0)
    bytes >= 1024 -> "${bytes / 1024} KB"
    else -> "$bytes B"
}

// The dais first, then every delegation with its flag.
