package com.munpro.app.ui.chair

// The dais's document desk on a phone (web SessionDocsPanel): papers awaiting review with
// Approve / Reject (with a reason), approved papers, and "On screen" to put one on every
// delegate's console and the projector. Reading a paper opens the same reader delegates use.

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import com.munpro.app.AppGraph
import com.munpro.app.domain.CommitteeDoc
import com.munpro.app.domain.committeeDocTypeLabel
import com.munpro.app.domain.countryName
import com.munpro.app.domain.flagEmoji
import com.munpro.app.domain.live.LiveSession
import com.munpro.app.nav.ReaderRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.kit.AiAssist
import com.munpro.app.ui.kit.AiContext
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.PlainInput
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.Space
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette

@Composable
fun DocsReview(
    eventId: String, committee: String, session: LiveSession, docs: List<CommitteeDoc>, uid: String,
    run: (suspend () -> Unit, () -> Unit) -> Unit, confirm: suspend (String, String, String) -> Boolean,
    launch: (suspend () -> Unit) -> Unit,
) {
    val c = palette
    val nav = LocalNav.current
    val repo = AppGraph.sessions
    val s = session.id.ifEmpty { "" }
    val published = session.publishedDoc?.docId
    var rejecting by remember { mutableStateOf<CommitteeDoc?>(null) }
    var showRejected by remember { mutableStateOf(false) }
    val awaiting = docs.filter { it.status == "submitted" }
    val approved = docs.filter { it.status == "approved" }
    val rejected = docs.filter { it.status == "rejected" }
    if (docs.isEmpty()) return

    fun putOnScreen(d: CommitteeDoc) = launch {
        if (d.status != "approved" && !confirm("Not approved yet", "Put this paper on every screen anyway?", "Put On Screen")) return@launch
        run({ repo.publishDoc(eventId, s, d, uid) }) {}
    }

    fun com.munpro.app.ui.kit.SectionScope.docRow(d: CommitteeDoc) {
        item {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                com.munpro.app.ui.kit.FlagText(d.submittedCountry, d.title.ifEmpty { committeeDocTypeLabel(d.type) }, style = Type.bodyMedium, color = c.label)
                Text(listOfNotNull(committeeDocTypeLabel(d.type), d.submittedCountry?.let { countryName(it) },
                    if (d.sponsors.isNotEmpty()) "${d.sponsors.size} sponsors" else null,
                    if (d.signatories.isNotEmpty()) "${d.signatories.size} signatories" else null,
                    if (published == d.id) "On screen" else null).joinToString(" · "), style = Type.footnote, color = c.label2)
                if (d.status == "rejected" && !d.chairNote.isNullOrEmpty()) Text("“${d.chairNote}”", style = Type.footnote, color = c.label2)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Pill("Read", { nav.go(ReaderRoute("doc", eventId, d.id, committee)) })
                    if (d.status == "submitted") {
                        Pill("Approve", { run({ repo.setDocStatus(eventId, d.id, "approved", "", uid) }) {} }, filled = true)
                        Pill("Reject", { rejecting = d })
                    }
                    if (d.status != "rejected") {
                        if (published == d.id) Pill("Take off screen", { run({ repo.unpublishDoc(eventId, s) }) {} })
                        else Pill("On screen", { putOnScreen(d) })
                    }
                }
            }
        }
    }

    if (awaiting.isNotEmpty()) Section(header = "Papers to review · ${awaiting.size}") { awaiting.forEach { docRow(it) } }
    if (approved.isNotEmpty()) Section(header = "Approved papers") { approved.forEach { docRow(it) } }
    if (rejected.isNotEmpty()) {
        Section(header = "Rejected") {
            if (showRejected) rejected.forEach { docRow(it) }
            else cell("Show ${rejected.size} rejected", chevron = false, onClick = { showRejected = true })
        }
    }

    // Reject with a reason (SessionDocsPanel's RejectButton): the note goes back to the author.
    var reason by remember { mutableStateOf("") }
    val target = rejecting
    val navPad = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    PageSheet(target != null, { rejecting = null; reason = "" }) {
        SheetHeader("Reject Paper", leading = "Cancel", onLeading = { rejecting = null; reason = "" })
        Column(Modifier.fillMaxWidth().padding(start = Space.gutter, end = Space.gutter, top = 8.dp, bottom = navPad + 32.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text(target?.title.orEmpty(), style = Type.headline, color = c.label)
            Section(header = "Reason for the delegation") {
                item {
                    PlainInput(reason, { reason = it }, "What needs to change", modifier = Modifier.fillMaxWidth().padding(16.dp), singleLine = false, minLines = 3,
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
                }
                item {
                    AiAssist("dismiss_reason", reason, AiContext(committee = committee, subject = target?.title), { reason = it },
                        Modifier.padding(start = 16.dp, end = 16.dp, bottom = 12.dp))
                }
            }
            MunButton("Reject Paper", {
                val d = target ?: return@MunButton
                val note = reason.trim()
                run({ repo.setDocStatus(eventId, d.id, "rejected", note, uid) }) { rejecting = null; reason = "" }
            }, destructive = true, enabled = reason.isNotBlank())
        }
    }
}
