package com.munpro.app.ui.messages

// Messages, everywhere (redesign board 12, board A4): one list for every role. Direct messages,
// groups and the committee chat (ChatsRepo) sit with a delegate's dais thread and the committee's
// notices, newest first; the dais opens a per-committee inbox with one thread per delegation; the
// conference's announcements and platform updates follow. Filters: All / People / Groups /
// Conferences. Dais threads open from here, from Conference home ("Message the dais"), from the
// live console's chat button and from the banner that drops in over any screen. Data:
// MessagesHub, ChatsRepo.

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.data.Api
import com.munpro.app.data.AuthState
import com.munpro.app.data.DaisLine
import com.munpro.app.data.IncomingMessage
import com.munpro.app.data.LineFeed
import com.munpro.app.data.rememberAnnouncements
import com.munpro.app.data.writingAssist
import com.munpro.app.domain.countryName
import com.munpro.app.domain.dayLabel
import com.munpro.app.domain.live.BROADCAST_THREAD
import com.munpro.app.domain.sentAt
import com.munpro.app.domain.shortWhen
import com.munpro.app.nav.AnnouncementsRoute
import com.munpro.app.nav.ChatRoute
import com.munpro.app.nav.DaisInboxRoute
import com.munpro.app.nav.DaisThreadRoute
import com.munpro.app.nav.NotificationsRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.chat.ChatCopy
import com.munpro.app.ui.chat.ChatPanel
import com.munpro.app.ui.kit.ActionSheet
import com.munpro.app.ui.kit.Dot
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Flag
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.Inter
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.LocalBack
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.PlainInput
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.RoundButton
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.SearchField
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SectionHeader
import com.munpro.app.ui.kit.Segmented
import com.munpro.app.ui.kit.SfIcon
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.SheetRow
import com.munpro.app.ui.kit.Space
import com.munpro.app.ui.kit.SystemColors
import com.munpro.app.ui.kit.TextLink
import com.munpro.app.ui.kit.Toggle
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.markdownPreview
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.kit.rememberPress
import com.munpro.app.ui.kit.tap
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val CONFERENCE = "__conference__"
private const val ANNOUNCE_MAX = 500

// ---------------------------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------------------------

private const val F_ALL = "all"
private const val F_PEOPLE = "people"
private const val F_GROUPS = "groups"
private const val F_CONFERENCES = "conferences"

@Composable
fun MessagesTab() {
    val c = palette
    val nav = LocalNav.current
    val hub = AppGraph.messages
    val feeds by hub.feeds.collectAsStateWithLifecycle()
    val seen by hub.seen.collectAsStateWithLifecycle()
    val seats by hub.seats.collectAsStateWithLifecycle()
    val convs by AppGraph.chats.list.collectAsStateWithLifecycle()
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()
    val auth by AppGraph.auth.state.collectAsStateWithLifecycle()
    val uid = (auth as? AuthState.SignedIn)?.user?.uid.orEmpty()
    val notes by remember(uid) { if (uid.isEmpty()) kotlinx.coroutines.flow.flowOf(emptyList()) else AppGraph.content.myNotifications(uid) }
        .collectAsStateWithLifecycle(emptyList())

    var q by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf(F_ALL) }
    var composing by remember { mutableStateOf(false) }
    var newMessage by remember { mutableStateOf(false) }
    var newGroup by remember { mutableStateOf(false) }

    val mine = feeds.filter { !it.line.isDais }
    val dais = feeds.filter { it.line.isDais }
    // Conferences whose announcements this account reads: its own applications, then staff seats.
    val events = (confs.conferences.orEmpty().filter { it.app.status == "approved" }.map { Triple(it.event.id, it.event.title, it.app.role) } +
        seats.orEmpty().map { Triple(it.eventId, it.event.title, "") }).distinctBy { it.first }
    val announcers = seats.orEmpty().filter { it.organizerLevel }.distinctBy { it.eventId }
    val canAnnounce = dais.isNotEmpty() || announcers.isNotEmpty()

    // Chats I blocked stay out of the list, as on the web.
    val chats = convs.orEmpty().filter { uid !in it.blockedBy }

    fun matches(vararg s: String?) = q.isBlank() || s.any { it?.contains(q.trim(), ignoreCase = true) == true }
    fun shows(kind: String) = filter == F_ALL || filter == kind

    // Everything with a time, newest first: chats, the committee chat, dais threads and notices.
    val timed = mutableListOf<Pair<Long, com.munpro.app.ui.kit.SectionScope.() -> Unit>>()
    chats.forEach { cv ->
        val kind = when { !cv.isGroup -> F_PEOPLE; cv.isCommittee -> F_CONFERENCES; else -> F_GROUPS }
        val title = listTitle(cv, uid)
        if (shows(kind) && matches(title, cv.lastMessage)) timed += (cv.updatedAt ?: 0L) to { chatCell(cv, uid, title) { nav.go(ChatRoute(cv.id)) } }
    }
    if (shows(F_CONFERENCES)) {
        mine.forEach { f ->
            val thread = f.thread(uid)
            val last = thread.lastOrNull()?.m
            if (matches("The Dais", f.line.committee, last?.text)) timed += (last?.sentAt ?: 0L) to {
                cell(
                    "The Dais · ${f.line.committee}",
                    subtitle = last?.let { (if (it.fromRole == "dais") "${it.fromName.ifEmpty { "Dais" }}: " else "You: ") + it.text }
                        ?: if (f.live) "Write to the chair and vice-chairs" else "Opens when your committee sits",
                    value = last?.sentAt?.let(::shortWhen),
                    leading = { Avatar("DS", c.pass, ROW_AVATAR) },
                    trailing = unreadDot(hub.unreadIn(f, seen, uid)),
                    inset = ROW_INSET, chevron = false,
                    onClick = { nav.go(DaisThreadRoute(f.line.key, uid)) },
                )
            }
            val n = f.thread(BROADCAST_THREAD).lastOrNull()?.m
            if (n != null && matches("Announcements", f.line.committee, n.text)) timed += (n.sentAt ?: 0L) to {
                cell(
                    "Announcements · ${f.line.committee}",
                    subtitle = n.text,
                    value = n.sentAt?.let(::shortWhen),
                    leading = { IconAvatar(Icons.mega, SystemColors.blue, ROW_AVATAR) },
                    trailing = unreadDot(hub.unreadIn(f, seen, BROADCAST_THREAD)),
                    inset = ROW_INSET, chevron = false,
                    onClick = { nav.go(DaisThreadRoute(f.line.key, BROADCAST_THREAD)) },
                )
            }
        }
        dais.forEach { f ->
            val last = f.messages.lastOrNull()?.m
            if (matches("Dais inbox", f.line.committee, last?.text)) timed += (last?.sentAt ?: 0L) to {
                cell(
                    "Dais inbox · ${f.line.committee}",
                    subtitle = last?.let { m -> if (m.fromRole == "dais") "You: ${m.text}" else "${countryName(m.country)}: ${m.text}" } ?: "Each delegation writes to the dais here",
                    value = last?.sentAt?.let(::shortWhen),
                    leading = { IconAvatar(Icons.gavel, c.tint, ROW_AVATAR) },
                    trailing = unreadDot(hub.unreadIn(f, seen)),
                    inset = ROW_INSET, chevron = false,
                    onClick = { nav.go(DaisInboxRoute(f.line.key)) },
                )
            }
        }
    }
    val rows = timed.sortedByDescending { it.first }
    val nothingYet = convs != null && chats.isEmpty() && feeds.isEmpty()

    val trailing: @Composable () -> Unit = {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (canAnnounce) RoundButton(Icons.mega, "New announcement", { composing = true })
            RoundButton(Icons.compose, "New message", { newMessage = true })
        }
    }

    Screen(title = "Messages", trailing = trailing, onRefresh = { hub.refresh(); AppGraph.conferences.reload() }) {
        SearchField(q, { q = it }, placeholder = "Search messages")
        Segmented(listOf(F_ALL to "All", F_PEOPLE to "People", F_GROUPS to "Groups", F_CONFERENCES to "Conferences"), filter, { filter = it })

        // A sitting is running: the dais thread is live.
        if (shows(F_CONFERENCES)) mine.filter { it.live }.forEach { f ->
            LiveCard(
                "${f.line.committee} is in session",
                "Your dais thread is live — replies arrive instantly",
            ) { nav.go(DaisThreadRoute(f.line.key, uid)) }
        }

        when {
            nothingYet && filter == F_ALL && q.isBlank() -> FirstRun({ newMessage = true })
            rows.isNotEmpty() -> Section { rows.forEach { it.second(this) } }
            convs == null && feeds.isEmpty() -> com.munpro.app.ui.kit.Spinner()
            filter != F_CONFERENCES || q.isNotBlank() -> Text(
                when {
                    q.isNotBlank() -> "No messages match “${q.trim()}”."
                    filter == F_PEOPLE -> "No direct messages yet. Tap the pencil to message someone."
                    filter == F_GROUPS -> "No groups yet. Start one from New message."
                    else -> "No conversations yet."
                },
                style = Type.footnote, color = c.label2, textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            )
        }

        // Conference announcements and platform updates: read-only, loaded per conference.
        if (shows(F_CONFERENCES)) Section(header = if (filter == F_ALL) "Conferences" else null, footer = "Announcements are read-only.") {
            conferenceCells(events, notes, ::matches, nav)
        }
    }

    NewAnnouncementSheet(composing, { composing = false }, dais.map { it.line }, announcers.map { it.eventId to it.event.title })
    NewMessageSheet(newMessage, { newMessage = false }, onNewGroup = { newMessage = false; newGroup = true }) {
        if (mine.isNotEmpty()) Section(header = "Your committees") {
            mine.forEach { f ->
                cell(
                    "The Dais · ${f.line.committee}", subtitle = "Write to the chair and vice-chairs",
                    leading = { Avatar("DS", c.pass, 40.dp) }, inset = 68.dp, chevron = false,
                    onClick = { newMessage = false; nav.go(DaisThreadRoute(f.line.key, uid)) },
                )
            }
        }
    }
    NewGroupSheet(newGroup, { newGroup = false })
}

private val ROW_AVATAR = 46.dp
private val ROW_INSET = 74.dp

/** The committee chat reads "Screens MUN · Security Council" in the list; other chats by name. */
private fun listTitle(cv: com.munpro.app.domain.Conversation, me: String): String =
    if (cv.isCommittee) cv.groupName?.replace(" - ", " · ")?.ifEmpty { null } ?: cv.title(me) else cv.title(me)

private fun com.munpro.app.ui.kit.SectionScope.chatCell(cv: com.munpro.app.domain.Conversation, me: String, title: String, onClick: () -> Unit) {
    val unread = cv.unread(me)
    cell(
        title,
        subtitle = cv.preview(me),
        value = cv.updatedAt?.let(::shortWhen),
        leading = {
            val online = rememberOnline(cv.other(me))
            ChatAvatar(cv, me, ROW_AVATAR, title, online = online?.online == true)
        },
        trailing = if (unread > 0) ({ UnreadBadge(unread) }) else null,
        inset = ROW_INSET, chevron = false,
        onClick = onClick,
    )
}

/** A4.8: no chats and no conference lines yet. */
@Composable
private fun FirstRun(onNew: () -> Unit) {
    val nav = LocalNav.current
    val me = com.munpro.app.ui.network.rememberMe()
    val connections by AppGraph.home.connections.collectAsStateWithLifecycle()
    val connected = connections.orEmpty().map { it.otherUid }.toSet()
    val suggested by androidx.compose.runtime.produceState(emptyList<com.munpro.app.domain.PublicProfile>(), me?.uid, connected) {
        val u = me?.uid ?: return@produceState
        value = runCatching { AppGraph.people.discover(u, connected) }.getOrDefault(emptyList()).take(4)
    }
    com.munpro.app.ui.kit.Empty(
        "No conversations yet",
        "Message people you meet at conferences. Your committee chat appears here once you're approved.",
        action = { com.munpro.app.ui.kit.MunButton("New Message", onNew, height = 44.dp) },
        icon = Icons.messages,
    )
    if (suggested.isNotEmpty()) Section(header = "People you may know") {
        suggested.forEach { p ->
            cell(
                p.name, subtitle = listOfNotNull(p.roleLabel, p.institution?.ifBlank { null }).joinToString(" · "),
                leading = { com.munpro.app.ui.kit.PersonAvatar(p.name, size = 40.dp, seed = p.id, photo = p.photoURL) },
                trailing = {
                    com.munpro.app.ui.kit.Pill("Message", {
                        AppGraph.chats.directId(p.id)?.let { nav.go(ChatRoute(it, p.id)) }
                    })
                },
                inset = 68.dp, chevron = false,
                onClick = { nav.go(com.munpro.app.nav.PublicProfileRoute(p.id)) },
            )
        }
    }
}

/** One committee's dais inbox, opened from the Messages list. */
@Composable
fun DaisInboxScreen(lineKey: String) {
    val hub = AppGraph.messages
    val feeds by hub.feeds.collectAsStateWithLifecycle()
    val seen by hub.seen.collectAsStateWithLifecycle()
    val f = feeds.firstOrNull { it.line.key == lineKey }
    var q by rememberSaveable { mutableStateOf("") }
    fun matches(s: Array<out String?>) = q.isBlank() || s.any { it?.contains(q.trim(), ignoreCase = true) == true }
    Screen(back = "Messages", title = f?.line?.committee ?: "Dais inbox", overline = f?.line?.eventTitle, tabBar = false, onRefresh = { hub.refresh() }) {
        if (f == null) { com.munpro.app.ui.kit.Spinner(); return@Screen }
        SearchField(q, { q = it }, placeholder = "Search delegations")
        DaisInbox(f, seen, ::matches)
    }
}

@Composable
private fun DaisInbox(f: LineFeed, seen: Map<String, Long>, matches: (Array<out String?>) -> Boolean) {
    val nav = LocalNav.current
    val hub = AppGraph.messages
    val delegations = f.delegations
    val rows = delegations.entries.map { (uid, country) -> Triple(uid, country, f.thread(uid).lastOrNull()?.m) }
        .sortedWith(compareByDescending<Triple<String, String, com.munpro.app.domain.live.SessionChatMessage?>> { it.third?.sentAt ?: 0L }.thenBy { countryName(it.second) })
        .filter { matches(arrayOf(countryName(it.second), it.third?.text)) }
    if (f.denied) ErrorText("This account can't read the dais line for ${f.line.committee}.")
    Section {
        cell(
            "Announce to the committee",
            subtitle = "Every delegate gets it in Messages",
            leading = { IconAvatar(Icons.mega, palette.tint) },
            inset = 64.dp,
            onClick = { nav.go(DaisThreadRoute(f.line.key, BROADCAST_THREAD)) },
        )
    }
    Section(header = "Delegations · ${delegations.size}", footer = "Private notes, one thread per delegate. Only the dais sees them.") {
        if (rows.isEmpty()) cell("Nobody on the roll yet", subtitle = "Delegations appear once the committee has sat.", chevron = false, dim = true)
        rows.forEach { (uid, country, last) ->
            cell(
                countryName(country),
                subtitle = last?.let { (if (it.fromRole == "dais") "You: " else "") + it.text } ?: "No messages",
                value = last?.sentAt?.let(::shortWhen),
                leading = { Flag(country, 26f) },
                trailing = unreadDot(hub.unreadIn(f, seen, uid)),
                inset = 56.dp,
                onClick = { nav.go(DaisThreadRoute(f.line.key, uid)) },
            )
        }
    }
}

/** The conference announcements and platform updates rows, shared by both layouts. */
private fun com.munpro.app.ui.kit.SectionScope.conferenceCells(
    events: List<Triple<String, String, String>>,
    notes: List<com.munpro.app.domain.AppNotification>,
    matches: (Array<out String?>) -> Boolean,
    nav: com.munpro.app.ui.Navigator,
) {
    events.forEach { (eventId, title, role) ->
        item(64.dp) { ConferenceAnnouncementsCell(eventId, title, role, matches) }
    }
    val last = notes.firstOrNull()
    if (matches(arrayOf("Updates", last?.title, last?.body))) cell(
        "Updates",
        subtitle = last?.let { listOf(it.title, it.body).filter { s -> s.isNotEmpty() }.joinToString(" — ") } ?: "Allocations, papers and results",
        value = last?.createdAt?.let(::shortWhen),
        leading = { IconAvatar(Icons.bell, SystemColors.gray) },
        trailing = unreadDot(notes.count { !it.read }),
        inset = 64.dp,
        onClick = { nav.go(NotificationsRoute) },
    )
}

@Composable
private fun ConferenceAnnouncementsCell(eventId: String, title: String, role: String, matches: (Array<out String?>) -> Boolean) {
    val nav = LocalNav.current
    val news = rememberAnnouncements(eventId, role).data
    val latest = news?.maxByOrNull { sentAt(it) }
    if (!matches(arrayOf("Announcements", title, latest?.subject))) return
    com.munpro.app.ui.kit.Cell(
        "Announcements · $title",
        subtitle = latest?.let { it.subject.ifEmpty { markdownPreview(it.body) } } ?: "From the secretariat",
        value = latest?.let { shortWhen(sentAt(it)) },
        leading = { IconAvatar(Icons.mega, SystemColors.orange) },
        onClick = { nav.go(AnnouncementsRoute(eventId)) },
    )
}

private fun unreadDot(n: Int): (@Composable () -> Unit)? = if (n > 0) ({ Dot(palette.tint, 10.dp) }) else null

// ---------------------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------------------

@Composable
fun Avatar(initials: String, color: Color, size: Dp = 38.dp) {
    Box(Modifier.size(size).clip(CircleShape).background(color), contentAlignment = Alignment.Center) {
        Text(initials.take(2).uppercase(), color = Color.White, fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = (size.value * 0.36f).sp)
    }
}

@Composable
private fun IconAvatar(icon: com.munpro.app.ui.kit.SfIconSpec, color: Color, size: Dp = 38.dp) {
    Box(Modifier.size(size).clip(CircleShape).background(color.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) {
        SfIcon(icon, color, size = (size.value * 0.5f).dp)
    }
}

@Composable
private fun LiveCard(title: String, subtitle: String, onClick: () -> Unit) {
    val c = palette
    val press = rememberPress()
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radius.cell))
            .background(c.tintSoft)
            .tap(press, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Dot(c.tint, 8.dp)
        Column(Modifier.weight(1f)) {
            Text(title, style = Type.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = c.tint)
            Text(subtitle, style = Type.footnote, color = c.label2)
        }
        com.munpro.app.ui.kit.Chevron(c.tint)
    }
}

// ---------------------------------------------------------------------------------------------
// A thread
// ---------------------------------------------------------------------------------------------

@Composable
fun DaisThreadScreen(lineKey: String, threadKey: String) {
    val c = palette
    val hub = AppGraph.messages
    val alerts = LocalAlerts.current
    val goBack = LocalBack.current
    val feeds by hub.feeds.collectAsStateWithLifecycle()
    val auth by AppGraph.auth.state.collectAsStateWithLifecycle()
    val uid = (auth as? AuthState.SignedIn)?.user?.uid.orEmpty()
    val f = feeds.firstOrNull { it.line.key == lineKey }
    val status = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()

    DisposableEffect(lineKey, threadKey) {
        hub.viewing.value = "$lineKey#$threadKey"
        onDispose { if (hub.viewing.value == "$lineKey#$threadKey") hub.viewing.value = null }
    }

    val broadcast = threadKey == BROADCAST_THREAD
    val line = f?.line
    val country = line?.let { if (it.isDais) f.delegations[threadKey] else it.country }.orEmpty()
    val (title, subtitle) = when {
        line == null -> "Messages" to ""
        broadcast && line.isDais -> "Announce" to "Everyone in ${line.committee}"
        broadcast -> "Announcements" to "${line.committee} · from the dais"
        line.isDais -> countryName(country) to "Private · only the dais sees this"
        else -> "The Dais" to "${line.committee} · chair and vice-chairs"
    }
    val thread = f?.thread(threadKey).orEmpty()
    val dayOf = remember(thread) { thread.associate { it.m.id to it.dateStr } }
    val target = f?.sendTarget
    val canSend = f != null && target != null && !(broadcast && !line!!.isDais)
    val reason = when {
        f == null -> "Loading…"
        broadcast && !f.line.isDais -> "Announcements are read-only."
        f.line.isDais -> "Nothing to send into yet: ${f.line.committee} hasn't sat."
        !f.live -> "Your dais line opens when ${f.line.committee}'s session starts."
        else -> "You're not on today's roll yet. Answer roll call first."
    }

    Column(Modifier.fillMaxSize().background(c.bg)) {
        Spacer(Modifier.height(status))
        Row(
            Modifier.fillMaxWidth().height(56.dp).padding(horizontal = Space.gutter),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RoundButton(Icons.back, "Back", goBack)
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (line?.isDais == true && !broadcast) Flag(country, 17f)
                    Text(title, style = Type.headline, color = c.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (subtitle.isNotEmpty()) Text(subtitle, style = Type.caption.copy(fontWeight = FontWeight.Normal), color = c.label2, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Spacer(Modifier.width(36.dp))
        }
        Box(Modifier.fillMaxWidth().height(com.munpro.app.ui.kit.Hairline).background(c.separator))
        ChatPanel(
            onClose = goBack,
            messages = thread.map { it.m },
            meUid = uid,
            canSend = canSend,
            disabledReason = reason,
            denied = f?.denied == true,
            onSend = { text -> hub.send(f!!, threadKey, text) },
            onSeen = { if (f != null) thread.lastOrNull()?.m?.sentAt?.let { hub.markSeen(f.line, threadKey, it) } },
            copy = when {
                broadcast && line?.isDais == true -> ChatCopy(title, subtitle, "Announce to the room", "Reaches every delegate's Messages and console at once.", "Announce to the committee")
                broadcast -> ChatCopy(title, subtitle, "No announcements yet", "Notices from the dais to your committee appear here.", "")
                line?.isDais == true -> ChatCopy(title, subtitle, "No messages yet", "Write to this delegation privately. It stays on the session record.", "Reply to this delegation")
                else -> com.munpro.app.ui.chat.DELEGATE_COPY
            },
            notices = !(line?.isDais == true),
            confirmSend = if (broadcast) ({ text -> alerts.confirm("Announce to everyone?", "“$text”", "Announce") }) else null,
            showHeader = false,
            sittingLabel = { m -> dayOf[m.id]?.let { d -> "Session · " + runCatching { dayLabel(java.time.LocalDate.parse(d)) }.getOrDefault(d) } },
            sentCaption = if (line?.isDais == true && !broadcast) "Sent as dais" else null,
            incoming = c.cell,
        )
    }
}

// ---------------------------------------------------------------------------------------------
// New announcement (M6)
// ---------------------------------------------------------------------------------------------

@Composable
private fun NewAnnouncementSheet(visible: Boolean, onClose: () -> Unit, committees: List<DaisLine>, conferences: List<Pair<String, String>>) {
    val c = palette
    val scope = rememberCoroutineScope()
    val hub = AppGraph.messages
    // "line:<key>" = a committee's notice lane; "event:<id>" = the whole conference.
    val targets = committees.map { "line:${it.key}" to it.committee } + conferences.map { (id, title) -> "event:$id" to "Everyone at $title" }
    var to by remember(visible) { mutableStateOf(targets.firstOrNull()?.first) }
    var body by remember(visible) { mutableStateOf("") }
    var email by remember(visible) { mutableStateOf(false) }
    var picking by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var polishing by remember { mutableStateOf(false) }
    var error by remember(visible) { mutableStateOf<String?>(null) }
    val toLabel = targets.firstOrNull { it.first == to }?.second ?: "Choose"
    val isEvent = to?.startsWith("event:") == true
    val nav = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()

    fun send() {
        val target = to ?: return
        val text = body.trim()
        if (text.isEmpty() || busy) return
        busy = true
        error = null
        scope.launch {
            try {
                if (target.startsWith("line:")) {
                    val f = hub.feed(target.removePrefix("line:")) ?: throw IllegalStateException()
                    if (f.sendTarget == null) { error = "${f.line.committee} hasn't sat yet, so there's nowhere to post it."; return@launch }
                    hub.send(f, BROADCAST_THREAD, text)
                } else {
                    val eventId = target.removePrefix("event:")
                    val u = AppGraph.auth.user ?: return@launch
                    val name = AppGraph.auth.profile?.fullName?.ifEmpty { null } ?: u.displayName.orEmpty()
                    val subject = text.lineSequence().first().take(80)
                    if (email && Api.available) {
                        val ok = Api.call("/api/announcements/send", "POST", kotlinx.serialization.json.buildJsonObject {
                            put("eventId", kotlinx.serialization.json.JsonPrimitive(eventId))
                            put("subject", kotlinx.serialization.json.JsonPrimitive(subject))
                            put("body", kotlinx.serialization.json.JsonPrimitive(text))
                            put("sentBy", kotlinx.serialization.json.JsonPrimitive(u.uid))
                            put("recipientCount", kotlinx.serialization.json.JsonPrimitive(0))
                        }.toString())
                        if (ok == null) { error = "That didn't send. Check your connection and try again."; return@launch }
                    } else {
                        AppGraph.content.postAnnouncement(eventId, subject, text, u.uid, name)
                    }
                }
                onClose()
            } catch (_: Exception) {
                error = "That didn't send. Check your connection and try again."
            } finally {
                busy = false
            }
        }
    }

    PageSheet(visible, onClose) {
        SheetHeader("Announcement", leading = "Cancel", onLeading = onClose, trailing = if (busy) "Sending…" else "Send", onTrailing = ::send, trailingEnabled = body.isNotBlank() && to != null && !busy)
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 12.dp, bottom = nav + 24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Section { cell("To", value = toLabel, onClick = { picking = true }) }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell)) {
                PlainInput(
                    body, { body = it }, if (isEvent) "Write a notice for the conference" else "Write a notice for the committee",
                    singleLine = false, minLines = 6, maxLength = ANNOUNCE_MAX,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 150.dp).padding(14.dp),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                )
                Row(Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (Api.available && body.isNotBlank()) {
                        TextLink(if (polishing) "Polishing…" else "Polish with AI", {
                            if (polishing) return@TextLink
                            polishing = true
                            scope.launch {
                                writingAssist("improve", "announcement-email", body, mapOf("eventName" to toLabel))?.let { body = it.take(ANNOUNCE_MAX) }
                                polishing = false
                            }
                        }, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold))
                    }
                    Spacer(Modifier.weight(1f))
                    Text("${body.length} / $ANNOUNCE_MAX", style = Type.caption, color = c.label2)
                }
            }
            if (isEvent && Api.available) {
                Section(footer = "It lands under Announcements for everyone at the conference. Delegates can't reply to announcements.") {
                    cell("Email everyone too", subtitle = "Also sends it to every approved participant's inbox", chevron = false, trailing = { Toggle(email, { email = it }, "Email everyone too") })
                }
            } else {
                Text(
                    "It lands in every delegate's Messages under Announcements. Delegates can't reply to announcements.",
                    style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 16.dp),
                )
            }
            ErrorText(error)
        }
    }
    ActionSheet(picking, { picking = false }, title = "Send to") {
        targets.forEach { (k, label) -> SheetRow(label, { to = k; picking = false }, selected = k == to) }
    }
}

// ---------------------------------------------------------------------------------------------
// The banner over any screen (M3)
// ---------------------------------------------------------------------------------------------

@Composable
fun BoxScope.MessageBanner() {
    val c = palette
    val nav = LocalNav.current
    val hub = AppGraph.messages
    var shown by remember { mutableStateOf<IncomingMessage?>(null) }
    LaunchedEffect(Unit) {
        hub.incoming.collect { m ->
            if (hub.viewing.value == "${m.line.key}#${m.threadKey}") return@collect
            shown = m
        }
    }
    LaunchedEffect(shown) {
        if (shown != null) { delay(6000); shown = null }
    }
    val status = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    AnimatedVisibility(
        shown != null,
        modifier = Modifier.align(Alignment.TopCenter),
        enter = slideInVertically(tween(260)) { -it } + fadeIn(tween(200)),
        exit = slideOutVertically(tween(220)) { -it } + fadeOut(tween(180)),
    ) {
        val m = shown ?: return@AnimatedVisibility
        val from = if (m.line.isDais) countryName(m.m.country) else "The Dais · ${m.m.fromName.ifEmpty { "Chair" }}"
        Column(
            Modifier
                .padding(top = status + 6.dp, start = 10.dp, end = 10.dp)
                .fillMaxWidth()
                .shadow(8.dp, RoundedCornerShape(22.dp), ambientColor = Color.Black.copy(alpha = 0.10f), spotColor = Color.Black.copy(alpha = 0.10f))
                .clip(RoundedCornerShape(22.dp))
                .background(c.cell)
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (m.line.isDais) Flag(m.m.country, 24f) else Avatar("DS", c.pass, 32.dp)
                Column(Modifier.weight(1f)) {
                    Row {
                        Text(from, style = Type.subhead.copy(fontWeight = FontWeight.SemiBold), color = c.label, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        Text("now", style = Type.caption.copy(fontWeight = FontWeight.Normal), color = c.label2)
                    }
                    Text(m.m.text, style = Type.subhead, color = c.label, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
            Row(Modifier.padding(start = 42.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                com.munpro.app.ui.kit.Pill(if (m.threadKey == BROADCAST_THREAD) "Open" else "Reply", { shown = null; nav.go(DaisThreadRoute(m.line.key, m.threadKey)) })
                com.munpro.app.ui.kit.Pill("Dismiss", { shown = null })
            }
        }
    }
}
