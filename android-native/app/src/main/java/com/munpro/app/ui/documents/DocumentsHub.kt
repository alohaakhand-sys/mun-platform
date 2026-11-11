package com.munpro.app.ui.documents

// The Documents hub (board A6.1; web dashboard/documents): every approved conference, shaped by
// your role in it. A delegate gets their position paper, the study guide, the committee's papers
// and the rules; the dais and read-only roles (observer, faculty) read the same; an organizer is
// sent to the event dashboard on the website. The dais's study-guide editor and paper grading
// join with their own boards (B4, B5). Committee papers (A6.2): approved papers, mine with their
// status, consent requests, and Submit a Paper outside a sitting (web CommitteeDocsDelegate).

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.data.Api
import com.munpro.app.data.Fresh
import com.munpro.app.data.rememberCached
import com.munpro.app.data.rememberReaderDoc
import com.munpro.app.domain.CommitteeDoc
import com.munpro.app.domain.Conference
import com.munpro.app.domain.SessionSeat
import com.munpro.app.domain.committeeDocBadge
import com.munpro.app.domain.committeeDocTypeLabel
import com.munpro.app.domain.committeeOf
import com.munpro.app.domain.dayMonth
import com.munpro.app.domain.countryName
import com.munpro.app.domain.isDelegateApp
import com.munpro.app.domain.sameCommittee
import com.munpro.app.nav.CommitteePapersRoute
import com.munpro.app.nav.PositionPaperRoute
import com.munpro.app.nav.ReaderRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.kit.Chip
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SectionFooter
import com.munpro.app.ui.kit.Segmented
import com.munpro.app.ui.kit.Spinner
import com.munpro.app.ui.kit.SystemColors
import com.munpro.app.ui.kit.Tone
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.live.AuthorWindow
import com.munpro.app.ui.live.PaperComposeSheet
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer

/** How a conference's documents are shaped for me (the web hub's tab sets). */
private enum class DocRole { Delegate, Dais, ReadOnly, Organizer }

private fun roleIn(c: Conference, seat: SessionSeat?): DocRole = when {
    seat?.organizerLevel == true -> DocRole.Organizer
    seat?.dais == true -> DocRole.Dais
    isDelegateApp(c.app) && !c.app.fromStaffSeat -> DocRole.Delegate
    else -> DocRole.ReadOnly
}

private fun committeeFor(c: Conference, seat: SessionSeat?) = seat?.takeIf { it.dais }?.committee?.ifEmpty { null } ?: committeeOf(c.app)

@Composable
private fun rememberApproved(eventId: String?, committee: String) =
    rememberCached(eventId?.let { "committeeDocs:$it:$committee" }, ListSerializer(CommitteeDoc.serializer()), maxAgeMs = Fresh.SHORT) {
        AppGraph.papers.approvedCommitteeDocs(eventId!!, committee)
    }

// ---------------------------------------------------------------------------------------------
// A6.1 · Documents hub
// ---------------------------------------------------------------------------------------------

@Composable
fun DocumentsHubScreen() {
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()
    val seats by AppGraph.messages.seats.collectAsStateWithLifecycle()
    // One per conference, approved only: a pending applicant has no committee yet.
    val list = confs.conferences?.filter { it.app.status == "approved" }?.distinctBy { it.event.id }

    Screen(back = "Profile", tabBar = false, title = "Documents", onRefresh = { AppGraph.conferences.reload(); AppGraph.messages.refresh() }) {
        when {
            list == null -> Spinner()
            list.isEmpty() -> Empty("No conferences yet", "Once you're accepted into a conference, your documents show up here.", icon = Icons.folder)
            else -> list.forEach { c -> ConferenceDocs(c, seats.orEmpty().firstOrNull { it.eventId == c.event.id && (it.dais || it.organizerLevel) }) }
        }
    }
}

@Composable
private fun ConferenceDocs(conf: Conference, seat: SessionSeat?) {
    val c = palette
    val nav = LocalNav.current
    val context = LocalContext.current
    val role = roleIn(conf, seat)
    val committee = committeeFor(conf, seat)
    val eventId = conf.event.id
    val app = conf.app
    val guide = rememberReaderDoc("guide", eventId, committee = committee)
    val rules = rememberReaderDoc("rules", eventId)
    val approved = rememberApproved(eventId.takeIf { committee.isNotEmpty() && role != DocRole.Organizer }, committee)

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Column(Modifier.padding(horizontal = 16.dp)) {
            Text(conf.event.title, style = Type.headline, color = c.label)
            Text(listOfNotNull(seat?.roleLabel?.ifEmpty { null } ?: app.role.ifEmpty { "Participant" }, committee.ifEmpty { null }).joinToString(" · "), style = Type.footnote, color = c.label2)
        }
        Section {
            if (role == DocRole.Organizer) {
                cell("Event documents", subtitle = "Study guides, certificates and committee tools are under Manage Events on the website",
                    leading = { DocBadge("EV", SystemColors.navy) }, inset = 62.dp,
                    onClick = { Api.site("/dashboard/organizer/events/$eventId")?.let { context.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(it))) } })
                return@Section
            }
            if (role == DocRole.Delegate) cell(
                "Position paper", leading = { DocBadge("DOC", SystemColors.blue) }, inset = 62.dp,
                subtitle = app.positionPaperUpdatedAt?.let { "Handed in ${dayMonth(it)}" } ?: "Not handed in yet",
                trailing = if (app.positionPaperContent.isNullOrBlank()) ({ Chip("Due", Tone.Warning) }) else null,
                onClick = { nav.go(PositionPaperRoute(app.id)) },
            )
            cell(
                "Study guide", subtitle = if (guide.data != null) "Your committee's background reading" else "Not published yet",
                leading = { DocBadge("SG", SystemColors.orange) }, inset = 62.dp, dim = guide.data == null,
                onClick = if (guide.data != null) ({ nav.go(ReaderRoute("guide", eventId, committee = committee)) }) else null,
            )
            if (role == DocRole.Dais && committee.isNotEmpty()) {
                cell("Edit study guide", subtitle = if (guide.data != null) "Update it; delegates are told" else "Write or import it, then publish",
                    leading = { DocBadge("ED", SystemColors.purple) }, inset = 62.dp,
                    onClick = { nav.go(com.munpro.app.nav.StudyGuideEditRoute(eventId, committee)) })
                cell("Position papers to grade", subtitle = "Grade and note your delegates' papers",
                    leading = { DocBadge("PP", SystemColors.blue) }, inset = 62.dp,
                    onClick = { nav.go(com.munpro.app.nav.PapersRoute(eventId, committee)) })
            }
            if (committee.isNotEmpty()) cell(
                "Committee papers",
                subtitle = approved.data?.let { a -> "${a.size} approved" } ?: "Working papers, draft resolutions, amendments",
                leading = { DocBadge("WP", SystemColors.green) }, inset = 62.dp,
                onClick = { nav.go(CommitteePapersRoute(app.id)) },
            )
            cell(
                "Rules & regulations", subtitle = if (rules.data != null) "The conference rulebook" else "Not published yet",
                leading = { DocBadge("MD", SystemColors.indigo) }, inset = 62.dp, dim = rules.data == null,
                onClick = if (rules.data != null) ({ nav.go(ReaderRoute("rules", eventId, committee = committee)) }) else null,
            )
        }
    }
}

// ---------------------------------------------------------------------------------------------
// A6.2 · Committee papers
// ---------------------------------------------------------------------------------------------

private fun statusChip(d: CommitteeDoc): Pair<String, Tone> = when (d.status) {
    "approved" -> "Approved" to Tone.Tint
    "submitted" -> "Submitted" to Tone.Info
    "collecting-endorsements" -> "Pending" to Tone.Warning
    "rejected" -> "Rejected" to Tone.Destructive
    else -> d.status.replaceFirstChar { it.uppercase() } to Tone.Neutral
}

private fun clockLeft(ms: Long): String { val s = maxOf(0L, ms) / 1000; return "%d:%02d".format(s / 60, s % 60) }

@Composable
fun CommitteePapersScreen(appId: String) {
    val c = palette
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()
    val seats by AppGraph.messages.seats.collectAsStateWithLifecycle()
    val conf = confs.conferences?.firstOrNull { it.app.id == appId }
    val seat = conf?.let { cf -> seats.orEmpty().firstOrNull { it.eventId == cf.event.id && (it.dais || it.organizerLevel) } }
    val role = conf?.let { roleIn(it, seat) }
    val committee = conf?.let { committeeFor(it, seat) }.orEmpty()
    val eventId = conf?.event?.id
    val uid = AppGraph.auth.user?.uid.orEmpty()
    val desk = AppGraph.paperDesk
    val delegate = role == DocRole.Delegate

    val approved = rememberApproved(eventId, committee)
    val mine by remember(eventId, uid, committee, delegate) {
        if (eventId != null && delegate) desk.mine(eventId, uid, committee) else kotlinx.coroutines.flow.flowOf(emptyList())
    }.collectAsState(emptyList())
    val requests by remember(uid, delegate) { if (delegate) desk.myPendingEndorsements(uid) else kotlinx.coroutines.flow.flowOf(emptyList()) }.collectAsState(emptyList())
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val ticking = mine.any { it.status == "collecting-endorsements" } || requests.isNotEmpty()
    LaunchedEffect(ticking) { while (ticking) { now = System.currentTimeMillis(); delay(1000) } }
    val inbox = requests.filter { it.eventId == eventId && (it.endsAt ?: 0L) > now }

    var tab by rememberSaveable { mutableStateOf("all") }
    var composing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val approvedList = approved.data.orEmpty()
    val all = (mine + approvedList).distinctBy { it.id }.sortedByDescending { it.createdAt ?: 0L }
    val shown = when (tab) { "mine" -> mine; "approved" -> approvedList; else -> all }

    Screen(back = "Documents", tabBar = false, title = "Committee papers", overline = committee.ifEmpty { null }, savedAt = approved.savedAt) {
        if (conf == null) { Spinner(); return@Screen }
        if (eventId != null) mine.filter { it.status == "collecting-endorsements" }.forEach { d -> AuthorWindow(eventId, d, now) }

        if (inbox.isNotEmpty()) Section(header = "Asked to endorse") {
            inbox.forEach { r ->
                item {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        com.munpro.app.ui.kit.FlagText(r.requestedByCountry, "${countryName(r.requestedByCountry)} asks you to ${if (r.role == "sponsor") "sponsor" else "sign"}", style = Type.bodyMedium, color = c.label)
                        Text("“${r.docTitle}” · ${committeeDocTypeLabel(r.docType)} · ${clockLeft((r.endsAt ?: 0L) - now)} left", style = Type.footnote, color = c.label2)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Pill("Accept", { scope.launch { runCatching { desk.respond(r, true) }.onFailure { error = "That didn't go through." } } }, filled = true)
                            Pill("Decline", { scope.launch { runCatching { desk.respond(r, false) }.onFailure { error = "That didn't go through." } } })
                        }
                    }
                }
            }
        }
        ErrorText(error)

        if (delegate) Segmented(listOf("all" to "All · ${all.size}", "mine" to "Mine · ${mine.size}", "approved" to "Approved · ${approvedList.size}"), tab, { tab = it })
        when {
            !approved.has && approved.failed -> ErrorText("Couldn't load the committee's papers. Pull to try again.")
            !approved.has -> Spinner()
            shown.isEmpty() -> Empty(
                if (tab == "mine") "No papers from you yet" else "Nothing approved yet",
                if (tab == "mine") "Write a working paper, draft resolution or amendment and send it to the chair." else "Working papers and draft resolutions appear here once the chairs approve them.",
                icon = Icons.doc,
            )
            else -> Section {
                shown.forEach { d ->
                    val (label, tone) = statusChip(d)
                    val by = d.submittedCountry?.ifEmpty { null }?.let(::countryName) ?: d.sponsors.firstOrNull()?.let(::countryName)
                    cell(
                        d.title.ifEmpty { committeeDocTypeLabel(d.type) },
                        subtitle = listOfNotNull(
                            by,
                            if (d.status == "collecting-endorsements") "collecting endorsements · ${clockLeft((d.endorsementEndsAt ?: 0L) - now)}"
                            else d.sponsors.size.takeIf { it > 0 }?.let { "$it sponsor${if (it == 1) "" else "s"}" },
                        ).joinToString(" · "),
                        leading = { DocBadge(committeeDocBadge(d.type), if (d.status == "approved") SystemColors.green else SystemColors.gray) },
                        trailing = { Chip(label, tone) }, inset = 62.dp, chevron = false,
                        onClick = { nav.go(ReaderRoute("doc", eventId!!, d.id, committee)) },
                    )
                    if (d.status == "rejected" && !d.chairNote.isNullOrEmpty() && d.submittedBy == uid) item {
                        Text("Chair: “${d.chairNote}”", style = Type.footnote, color = c.label2, modifier = Modifier.padding(start = 62.dp, end = 16.dp, bottom = 10.dp))
                    }
                }
            }
        }
        if (delegate) {
            MunButton("Submit a Paper", { composing = true }, icon = Icons.compose)
            SectionFooter("Working papers, draft resolutions and amendments go to the chair for review. Sponsors and signatories are asked to accept within 90 seconds.")
        }
    }

    if (conf != null && delegate && eventId != null) {
        val myCountry = conf.app.assignedCountry.orEmpty()
        val others = conf.event.committees.firstOrNull { sameCommittee(it.name, committee) }?.countries.orEmpty()
            .filter { it.isNotEmpty() && it != myCountry }.distinct().sortedBy { countryName(it) }
        PaperComposeSheet(composing, { composing = false }, others, committee.isBlank()) { type, title, content, sponsors, signatories ->
            val name = conf.app.applicantName?.ifEmpty { null } ?: AppGraph.chats.me()?.name.orEmpty()
            desk.submit(eventId, committee, "", "", uid, name, myCountry, type, title, content, sponsors, signatories)
        }
    }
}
