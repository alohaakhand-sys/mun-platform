package com.munpro.app.ui.conference

// People and the faculty advisor panel (board B2.7–B2.10). People: everyone at the conference from
// the portal's member list (/api/events/{id}/members, the web's PortalMembersDialog), grouped and
// searchable; tap someone for their card with Profile, Connect and Message. Faculty advisors get
// their institution's delegates instead of the delegate portal (web FacultyAdvisorPanel), with real
// data only: status, paid or not, position paper. Scores, attendance and request counts aren't
// readable by an advisor under firestore.rules, so they aren't shown.

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.data.ChatPerson
import com.munpro.app.data.Fresh
import com.munpro.app.data.rememberCached
import com.munpro.app.domain.ApplicationData
import com.munpro.app.domain.Conference
import com.munpro.app.domain.Member
import com.munpro.app.domain.committeeOf
import com.munpro.app.domain.countryName
import com.munpro.app.domain.dayMonth
import com.munpro.app.domain.getPaymentGate
import com.munpro.app.domain.isExecBoardRole
import com.munpro.app.domain.roleLabel
import com.munpro.app.domain.sameCommittee
import com.munpro.app.nav.ChatRoute
import com.munpro.app.nav.PublicProfileRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.kit.Chip
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Flag
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.PersonAvatar
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.SearchField
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.Space
import com.munpro.app.ui.kit.Spinner
import com.munpro.app.ui.kit.Tone
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer

// ---------------------------------------------------------------------------------------------
// B2.7 · People
// ---------------------------------------------------------------------------------------------

private fun Member.line(): String = when {
    isStaff -> roleLabel(role)
    country.isNotEmpty() -> countryName(country)
    else -> roleLabel(role.ifEmpty { "Delegate" })
}

/** PortalMembersDialog's sections: organizers, the executive board, committees (yours first), observers & faculty. */
private fun sections(members: List<Member>, mine: String): List<Pair<String, List<Member>>> {
    fun r(m: Member) = m.role.lowercase()
    val organizers = members.filter { "organizer" in r(it) }
    val board = members.filter { it !in organizers && isExecBoardRole(it.role) }
    val watchers = members.filter { it !in organizers && it !in board && ("observer" in r(it) || "faculty" in r(it)) }
    val rest = members - organizers.toSet() - board.toSet() - watchers.toSet()
    val byCommittee = rest.groupBy { it.committee.ifEmpty { "Unassigned" } }
        .toList().sortedWith(compareBy<Pair<String, List<Member>>> { !sameCommittee(it.first, mine) }.thenBy { it.first == "Unassigned" }.thenBy { it.first })
        .map { (k, v) -> (if (sameCommittee(k, mine)) "$k · yours" else k) to v.sortedWith(compareByDescending<Member> { it.isStaff }.thenBy { it.name.lowercase() }) }
    return listOf("Organizers" to organizers, "Executive Board" to board) + byCommittee + listOf("Observers & Faculty" to watchers)
}

@Composable
fun PeopleScreen(conf: Conference) {
    val c = palette
    val event = conf.event
    val roster = rememberCached("members:${event.id}", ListSerializer(Member.serializer()), Fresh.LONG) {
        AppGraph.papers.members(event.id) ?: throw IllegalStateException("no api")
    }
    var q by rememberSaveable { mutableStateOf("") }
    var open by remember { mutableStateOf<Member?>(null) }
    val term = q.trim().lowercase()
    val all = roster.data.orEmpty()
    val shown = if (term.isEmpty()) all else all.filter { m ->
        listOf(m.name, m.role, m.committee, m.country, countryName(m.country)).any { it.lowercase().contains(term) }
    }
    Screen(back = "Portal", tabBar = false, title = "People", overline = event.title, savedAt = roster.savedAt) {
        SearchField(q, { q = it }, placeholder = "Search by name, role or country")
        when {
            !roster.has && roster.failed -> ErrorText("The member list didn't load. Pull down to try again.")
            !roster.has -> Spinner()
            shown.isEmpty() -> Empty(if (term.isEmpty()) "No one here yet" else "No people match", if (term.isEmpty()) "Members appear once they're allocated." else "Try a name, a role or a country.", icon = Icons.people)
            else -> sections(shown, committeeOf(conf.app)).filter { it.second.isNotEmpty() }.forEach { (title, people) ->
                Section(header = "$title · ${people.size}") {
                    people.forEach { m ->
                        val me = m.uid == AppGraph.auth.user?.uid
                        cell(
                            m.name.ifEmpty { "Member" } + if (me) " · you" else "",
                            subtitle = m.line(),
                            leading = { PersonAvatar(m.name, size = 40.dp, seed = m.uid, photo = m.photoURL.ifEmpty { null }) }, inset = 68.dp,
                            trailing = if (!m.isStaff && m.country.isNotEmpty()) ({ Flag(m.country, 20f) }) else null,
                            chevron = false,
                            onClick = if (me) null else ({ open = m }),
                        )
                    }
                }
            }
        }
    }
    open?.let { MemberSheet(it, conf) { open = null } }
}

// ---------------------------------------------------------------------------------------------
// B2.8 · Member card
// ---------------------------------------------------------------------------------------------

@Composable
private fun MemberSheet(m: Member, conf: Conference, onClose: () -> Unit) {
    val c = palette
    val nav = LocalNav.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val me = com.munpro.app.ui.network.rememberMe()
    val profile by produceState<com.munpro.app.domain.PublicProfile?>(null, m.uid) { value = AppGraph.people.profile(m.uid) }
    val connections by AppGraph.home.connections.collectAsStateWithLifecycle()
    var connected by remember(connections) { mutableStateOf(connections.orEmpty().any { it.otherUid == m.uid && it.status == "active" }) }
    var busy by remember { mutableStateOf(false) }
    PageSheet(true, onClose) {
        SheetHeader("", trailing = "Done", onTrailing = onClose)
        Column(
            Modifier.fillMaxWidth().padding(start = Space.gutter, end = Space.gutter, top = 4.dp, bottom = navBottom + 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            PersonAvatar(m.name, size = 84.dp, seed = m.uid, photo = m.photoURL.ifEmpty { null } ?: profile?.photoURL)
            Text(m.name, style = Type.title2, color = c.label, textAlign = TextAlign.Center)
            Text(
                when {
                    m.isStaff -> listOfNotNull(roleLabel(m.role), m.committee.ifEmpty { null }).joinToString(" · ")
                    m.country.isNotEmpty() -> "Delegate of ${countryName(m.country)}" + (m.committee.ifEmpty { null }?.let { " · $it" } ?: "")
                    else -> roleLabel(m.role.ifEmpty { "Delegate" })
                },
                style = Type.subhead, color = c.label2, textAlign = TextAlign.Center,
            )
            val p = profile
            if (p != null) Text(listOfNotNull(p.institution?.ifBlank { null }, p.ratingAvg.takeIf { it > 0 }?.let { "%.1f ★".format(it) }).joinToString(" · "),
                style = Type.footnote, color = c.label2, textAlign = TextAlign.Center)
            Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Pill("Profile", { onClose(); nav.go(PublicProfileRoute(m.uid)) }, tone = Tone.Neutral, modifier = Modifier.weight(1f))
                Pill(if (connected) "Connected" else if (busy) "…" else "Connect", {
                    val mm = me ?: return@Pill
                    val pp = p ?: return@Pill
                    if (connected || busy) return@Pill
                    busy = true
                    scope.launch {
                        runCatching { AppGraph.people.connect(mm, pp) }
                            .onSuccess { connected = true }
                            .onFailure { alerts.show("Couldn't connect", "You can't connect with this member right now.") }
                        busy = false
                    }
                }, enabled = p != null && !connected, modifier = Modifier.weight(1f))
                Pill("Message", {
                    AppGraph.chats.directId(m.uid)?.let { id -> onClose(); nav.go(ChatRoute(id, m.uid)) }
                }, filled = true, modifier = Modifier.weight(1f))
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// B2.9 · Faculty advisor panel, B2.10 · one delegate
// ---------------------------------------------------------------------------------------------

fun isFacultyAdvisor(app: ApplicationData) = app.role.contains("faculty", true)

private fun institutionOf(app: ApplicationData) = app.institutionName?.ifBlank { null } ?: app.institution?.ifBlank { null }

@Composable
fun FacultyPanel(conf: Conference) {
    val c = palette
    val nav = LocalNav.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val (app, event) = conf
    val institution = institutionOf(app)
    val list = rememberCached(institution?.let { "faculty:${event.id}:$it" }, ListSerializer(ApplicationData.serializer()), Fresh.SHORT) {
        AppGraph.gate.institutionDelegates(event.id, institution!!)
    }
    val delegates = list.data.orEmpty().filter { it.userId != app.userId && it.role == "Delegate" && it.status != "rejected" && it.status != "withdrawn" }
        .sortedWith(compareBy<ApplicationData> { it.status != "approved" }.thenBy { it.applicantName.orEmpty().lowercase() })
    var open by remember { mutableStateOf<ApplicationData?>(null) }
    var messaging by remember { mutableStateOf(false) }
    val chats by AppGraph.chats.list.collectAsStateWithLifecycle()

    fun messageDelegation() {
        val me = AppGraph.chats.me() ?: return
        val name = "${institution ?: "Institution"} Group"
        // One group per advisor and conference: the web made a new one on every click.
        chats.orEmpty().firstOrNull { it.isGroup && it.eventId == event.id && it.createdBy == me.uid && it.groupName == name }?.let { nav.go(ChatRoute(it.id)); return }
        messaging = true
        scope.launch {
            runCatching { AppGraph.chats.createGroup(name, delegates.map { ChatPerson(it.userId, it.applicantName.orEmpty().ifEmpty { "Delegate" }, "") }, eventId = event.id) }
                .onSuccess { nav.go(ChatRoute(it)) }
                .onFailure { alerts.show("Couldn't start the group", "Check your connection and try again.") }
            messaging = false
        }
    }

    Screen(back = "Conferences", tabBar = false, title = event.title, overline = "Faculty advisor", savedAt = list.savedAt) {
        if (institution == null) {
            Empty("No institution on your application", "Your delegates are matched by institution. Ask the organizer to set yours.", icon = Icons.people)
            return@Screen
        }
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(institution, style = Type.headline, color = c.label)
                Text("Monitoring ${delegates.size} delegate${if (delegates.size == 1) "" else "s"}", style = Type.footnote, color = c.label2)
            }
        }
        if (delegates.isNotEmpty()) MunButton(if (messaging) "Starting…" else "Message Delegation", ::messageDelegation, icon = Icons.bubble, enabled = !messaging)
        when {
            !list.has && list.failed -> ErrorText("Your delegates didn't load. Pull down to try again.")
            !list.has -> Spinner()
            delegates.isEmpty() -> Empty("No delegates found from your institution", "Delegates appear here when their application names the same institution.", icon = Icons.people)
            else -> Section(header = "My delegates") {
                delegates.forEach { d ->
                    val unpaid = getPaymentGate(d, event).status == "due"
                    val paper = !d.positionPaperContent.isNullOrBlank() || !d.positionPaperUrl.isNullOrBlank()
                    cell(
                        d.applicantName?.ifEmpty { null } ?: "Delegate",
                        subtitle = if (committeeOf(d).isEmpty()) "Not allocated yet" else "${committeeOf(d)} · ${if (paper) "paper ✓" else "no paper"}",
                        leading = { PersonAvatar(d.applicantName.orEmpty(), size = 40.dp, seed = d.id) }, inset = 68.dp,
                        trailing = { if (unpaid) Chip("Unpaid", Tone.Warning) else Chip(d.status.replaceFirstChar { it.uppercase() }, if (d.status == "approved") Tone.Tint else Tone.Neutral) },
                        onClick = { open = d },
                    )
                }
            }
        }
    }
    open?.let { d -> FacultyDelegateSheet(d, conf) { open = null } }
}

@Composable
private fun FacultyDelegateSheet(d: ApplicationData, conf: Conference, onClose: () -> Unit) {
    val c = palette
    val nav = LocalNav.current
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val gate = getPaymentGate(d, conf.event)
    val name = d.applicantName?.ifEmpty { null } ?: "Delegate"
    PageSheet(true, onClose) {
        SheetHeader(name, trailing = "Done", onTrailing = onClose)
        Column(Modifier.fillMaxWidth().padding(start = Space.gutter, end = Space.gutter, top = 8.dp, bottom = navBottom + 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                PersonAvatar(name, size = 56.dp, seed = d.id)
                Column(Modifier.weight(1f)) {
                    Text(name, style = Type.headline, color = c.label)
                    Text(listOfNotNull(committeeOf(d).ifEmpty { null }, d.assignedCountry?.ifEmpty { null }?.let(::countryName)).joinToString(" · ").ifEmpty { "Not allocated yet" },
                        style = Type.footnote, color = c.label2)
                }
                d.assignedCountry?.ifEmpty { null }?.let { Flag(it, 26f) }
            }
            Section {
                cell("Application", value = d.status.replaceFirstChar { it.uppercase() } + when (gate.status) { "paid" -> " · paid"; "due" -> " · unpaid"; else -> "" }, chevron = false)
                cell("Position paper", value = d.positionPaperUpdatedAt?.let { "Handed in ${dayMonth(it)}" }
                    ?: if (!d.positionPaperContent.isNullOrBlank() || !d.positionPaperUrl.isNullOrBlank()) "Handed in" else "Not handed in", chevron = false)
            }
            if (d.userId.isNotEmpty() && !d.userId.contains("@")) MunButton("Message ${name.substringBefore(' ')}", {
                AppGraph.chats.directId(d.userId)?.let { id -> onClose(); nav.go(ChatRoute(id, d.userId)) }
            }, icon = Icons.bubble)
        }
    }
}
