package com.munpro.app.ui.live

// A delegate's papers on the live floor (web DelegateDocsTool + EndorsementInbox): consent
// requests waiting on me (accept / decline before the 90-second window closes), my own papers with
// their status and the chair's note, "Write a paper", and Introduce once the floor is open for it.

import com.munpro.app.ui.kit.Flag
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import com.munpro.app.AppGraph
import com.munpro.app.data.live.DocEndorsement
import com.munpro.app.data.live.ProxyAttribution
import com.munpro.app.domain.CommitteeDoc
import com.munpro.app.domain.committeeDocTypeLabel
import com.munpro.app.domain.countryName
import com.munpro.app.domain.flagEmoji
import com.munpro.app.domain.fmtClock
import com.munpro.app.domain.live.LiveSession
import com.munpro.app.domain.live.MotionParams
import com.munpro.app.domain.live.ParticipationIdentity
import com.munpro.app.nav.ReaderRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.kit.CheckMark
import com.munpro.app.ui.kit.Emoji
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.PlainInput
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.Segmented
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.Space
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import kotlinx.coroutines.launch

private val STATUS_LINE = mapOf(
    "submitted" to "Submitted, waiting for the chair",
    "approved" to "Approved",
    "rejected" to "Rejected",
)

@Composable
fun PapersSection(
    eventId: String, sessionId: String, session: LiveSession, identity: ParticipationIdentity, name: String,
    canIntroduce: Boolean, now: Long,
    propose: suspend (type: String, params: MotionParams) -> Boolean,
    /** A vice-chair acting for the delegation: every write carries the stamp. */
    proxy: ProxyAttribution? = null,
    /** The committee's papers from the dais listener; a proxy can't run the delegate's own query. */
    committeeDocs: List<CommitteeDoc>? = null,
) {
    val c = palette
    val nav = LocalNav.current
    val desk = AppGraph.paperDesk
    val scope = rememberCoroutineScope()
    val me = identity.delegateId
    val own by remember(eventId, me, identity.committeeId, committeeDocs == null) {
        if (committeeDocs == null) desk.mine(eventId, me, identity.committeeId) else kotlinx.coroutines.flow.flowOf(emptyList())
    }.collectAsState(emptyList())
    val mine = committeeDocs?.filter { it.submittedBy == me } ?: own
    // A proxy listens per collecting paper (path reads); the delegate lists their own rows.
    val collectingKey = committeeDocs?.filter { it.status == "collecting-endorsements" }?.map { it.id }?.sorted()?.joinToString(",")
    val requests by remember(me, collectingKey) {
        if (collectingKey == null) desk.myPendingEndorsements(me)
        else desk.endorsementsForDocs(eventId, collectingKey.split(",").filter(String::isNotEmpty), me)
    }.collectAsState(emptyList())
    val inbox = requests.filter { it.eventId == eventId && (it.endsAt ?: 0L) > now }
    var composing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    if (inbox.isNotEmpty()) {
        Section(header = "Asked to endorse") {
            inbox.forEach { r -> endorsementRow(r, now) { accept -> scope.launch { runCatching { desk.respond(r, accept, proxy) }.onFailure { error = "That didn't go through." } } } }
        }
    }

    // The author closes the consent window: when it runs out, or everyone has answered. The server
    // call is idempotent, so two devices racing it is harmless.
    mine.filter { it.status == "collecting-endorsements" }.forEach { d -> AuthorWindow(eventId, d, now) }

    Section(header = if (proxy != null) "Their papers" else "Your papers", footer = "Working papers, draft resolutions and amendments go to the chair for review.") {
        mine.forEach { d ->
            item {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(d.title.ifEmpty { committeeDocTypeLabel(d.type) }, style = Type.bodyMedium, color = c.label)
                    val line = if (d.status == "collecting-endorsements") "Collecting endorsements · ${fmtClock(maxOf(0L, (d.endorsementEndsAt ?: 0L) - now))} left"
                        else STATUS_LINE[d.status] ?: d.status
                    Text("${committeeDocTypeLabel(d.type)} · $line", style = Type.footnote, color = c.label2)
                    if (d.status == "rejected" && !d.chairNote.isNullOrEmpty()) Text("“${d.chairNote}”", style = Type.footnote, color = c.label2)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Pill("Read", { nav.go(ReaderRoute("doc", eventId, d.id, identity.committeeId)) })
                        if (canIntroduce && (d.status == "submitted" || d.status == "approved")) {
                            Pill("Introduce", { scope.launch { propose("introduce_document", MotionParams(documentId = d.id, topic = d.title)) } }, filled = true)
                        }
                    }
                }
            }
        }
        cell("Write a paper", tinted = true, chevron = false, onClick = { composing = true })
    }
    ErrorText(error)

    ComposeSheet(composing, { composing = false }, session, identity) { type, title, content, sponsors, signatories ->
        desk.submit(eventId, identity.committeeId, sessionId, identity.dateStr, me, name, identity.country, type, title, content, sponsors, signatories, proxy)
    }
}

private fun com.munpro.app.ui.kit.SectionScope.endorsementRow(r: DocEndorsement, now: Long, answer: (Boolean) -> Unit) {
    item {
        val c = palette
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            com.munpro.app.ui.kit.FlagText(r.requestedByCountry, "${countryName(r.requestedByCountry)} asks you to ${if (r.role == "sponsor") "sponsor" else "sign"}", style = Type.bodyMedium, color = c.label)
            Text("“${r.docTitle}” · ${committeeDocTypeLabel(r.docType)} · ${fmtClock(maxOf(0L, (r.endsAt ?: 0L) - now))} left", style = Type.footnote, color = c.label2)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Pill("Accept", { answer(true) }, filled = true)
                Pill("Decline", { answer(false) })
            }
        }
    }
}

@Composable
internal fun AuthorWindow(eventId: String, d: CommitteeDoc, now: Long) {
    val rows by remember(eventId, d.id) { AppGraph.paperDesk.endorsements(eventId, d.id) }.collectAsState(emptyList())
    val closed = now >= (d.endorsementEndsAt ?: 0L)
    val allAnswered = rows.isNotEmpty() && rows.none { it.status == "pending" }
    var fired by remember(d.id) { mutableStateOf(false) }
    LaunchedEffect(closed, allAnswered) {
        if ((closed || allAnswered) && !fired) {
            fired = true
            // 409 = window not closed yet (raced the clock); the next tick retries.
            if (!AppGraph.paperDesk.finalize(eventId, d.id)) fired = false
        }
    }
}

/** DocComposer on the floor: the delegations asked to sponsor or sign are those on today's roll. */
@Composable
private fun ComposeSheet(
    visible: Boolean, onDismiss: () -> Unit, session: LiveSession, identity: ParticipationIdentity,
    submit: suspend (type: String, title: String, content: String, sponsors: List<String>, signatories: List<String>) -> String,
) {
    // Delegations on today's roll, other than ours: the ones who can be asked.
    val others = session.attendance.values.map { it.country }.filter { it.isNotEmpty() && it != identity.country }.distinct().sortedBy { countryName(it) }
    PaperComposeSheet(visible, onDismiss, others, identity.committeeId.isBlank(), submit)
}

/** DocComposer: type, title, text, and the delegations ([others]) asked to sponsor or sign. */
@Composable
internal fun PaperComposeSheet(
    visible: Boolean, onDismiss: () -> Unit, others: List<String>, noCommittee: Boolean,
    submit: suspend (type: String, title: String, content: String, sponsors: List<String>, signatories: List<String>) -> String,
) {
    val c = palette
    val scope = rememberCoroutineScope()
    var type by remember { mutableStateOf("working-paper") }
    var title by remember { mutableStateOf("") }
    var content by remember { mutableStateOf("") }
    val sponsors = remember { mutableStateListOf<String>() }
    val signatories = remember { mutableStateListOf<String>() }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    fun send() = scope.launch {
        if (title.isBlank() || content.isBlank()) { error = "A title and the document text are required."; return@launch }
        busy = true; error = null
        try {
            submit(type, title, content, sponsors.toList(), signatories.toList())
            title = ""; content = ""; sponsors.clear(); signatories.clear()
            onDismiss()
        } catch (_: Exception) { error = "Couldn't submit the document. Check your connection and try again." } finally { busy = false }
    }
    val nav = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    PageSheet(visible, onDismiss) {
        SheetHeader("New Paper", leading = "Cancel", onLeading = onDismiss, trailing = "Submit", trailingEnabled = !busy && !noCommittee, onTrailing = { send() })
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 8.dp, bottom = nav + 32.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)) {
            ErrorText(error)
            if (noCommittee) Text("You need a committee before you can submit a paper.", style = Type.footnote, color = c.red)
            Segmented(listOf("working-paper" to "Working paper", "draft-resolution" to "Draft resolution", "amendment" to "Amendment"), type, { type = it })
            Section(header = "Title") {
                item { PlainInput(title, { title = it }, "e.g. Securing humanitarian corridors", modifier = Modifier.fillMaxWidth().padding(16.dp),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences)) }
            }
            Section(header = "Text", footer = "Markdown works: **bold**, lists, headings.") {
                item { PlainInput(content, { content = it }, "Preambulatory and operative clauses…", modifier = Modifier.fillMaxWidth().padding(16.dp),
                    singleLine = false, minLines = 8, keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences)) }
            }
            if (others.isNotEmpty()) {
                Section(header = "Sponsors", footer = "Each one is asked to accept within 90 seconds of submitting.") {
                    others.forEach { country ->
                        cell(countryName(country), inset = 52.dp, chevron = false, leading = { Flag(country, 20f) },
                            trailing = if (country in sponsors) ({ CheckMark() }) else null,
                            onClick = { if (country in sponsors) sponsors.remove(country) else { sponsors.add(country); signatories.remove(country) } })
                    }
                }
                Section(header = "Signatories") {
                    others.forEach { country ->
                        cell(countryName(country), inset = 52.dp, chevron = false, leading = { Flag(country, 20f) },
                            trailing = if (country in signatories) ({ CheckMark() }) else null,
                            onClick = { if (country in signatories) signatories.remove(country) else { signatories.add(country); sponsors.remove(country) } })
                    }
                }
            }
            MunButton("Submit Paper", { send() }, loading = busy, enabled = !noCommittee)
        }
    }
}
