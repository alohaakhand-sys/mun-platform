package com.munpro.app.ui.messages

// Direct messages and group chats (board A4.2–A4.7; web ChatWindow.tsx, ChatSidebar.tsx). A chat
// with a person, a group, the committee chat made on approval, and group info. The web's "•••"
// did nothing; here it opens View profile, Search in chat and Block. Data: ChatsRepo, Online.

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.data.CHAT_PAGE
import com.munpro.app.data.ChatPerson
import com.munpro.app.data.ConversationDoc
import com.munpro.app.data.OnlineStatus
import com.munpro.app.domain.Conversation
import com.munpro.app.domain.Delivery
import com.munpro.app.domain.DirectMessage
import com.munpro.app.domain.clock
import com.munpro.app.domain.countryName
import com.munpro.app.domain.dayLabel
import com.munpro.app.domain.delivery
import com.munpro.app.domain.memberRole
import com.munpro.app.domain.sameCommittee
import com.munpro.app.nav.ChatRoute
import com.munpro.app.nav.GroupInfoRoute
import com.munpro.app.nav.PublicProfileRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.kit.ActionSheet
import com.munpro.app.ui.kit.Chip
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Flag
import com.munpro.app.ui.kit.Hairline
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.LocalBack
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.PersonAvatar
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.PlainInput
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.RoundButton
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.SearchField
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SfIcon
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.SheetRow
import com.munpro.app.ui.kit.Space
import com.munpro.app.ui.kit.Spinner
import com.munpro.app.ui.kit.SystemColors
import com.munpro.app.ui.kit.TextLink
import com.munpro.app.ui.kit.Tone
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.kit.rememberHaptics
import com.munpro.app.ui.kit.rememberPress
import com.munpro.app.ui.kit.tap
import com.munpro.app.ui.network.rememberMe
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch

private const val DM_MAX_CHARS = 2000
private const val RUN_GAP_MS = 5 * 60_000L

// ---------------------------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------------------------

/** Their online status, or null for a group / while unknown. */
@Composable
fun rememberOnline(uid: String?): OnlineStatus? {
    val flow = remember(uid) { if (uid.isNullOrEmpty()) flowOf(null) else AppGraph.online.status(uid) }
    return flow.collectAsStateWithLifecycle(null).value
}

/** "Active now", "Active 5m ago", or "Offline" (web ChatWindow's header line). */
fun onlineLabel(s: OnlineStatus?, now: Long = System.currentTimeMillis()): String? {
    if (s == null) return null
    if (s.online) return "Active now"
    val mins = s.lastChangedAt?.let { (now - it) / 60_000 } ?: return "Offline"
    return when {
        mins < 1 -> "Active just now"
        mins < 60 -> "Active ${mins}m ago"
        mins < 24 * 60 -> "Active ${mins / 60}h ago"
        mins < 7 * 24 * 60 -> "Active ${mins / (24 * 60)}d ago"
        else -> "Offline"
    }
}

/** A chat's avatar: their photo, or the group's initials; a green dot while they're online. */
@Composable
fun ChatAvatar(c: Conversation?, me: String, size: Dp = 52.dp, title: String, online: Boolean = false) {
    val pal = palette
    Box(Modifier.size(size)) {
        PersonAvatar(title, size = size, seed = c?.id ?: title, photo = c?.photo(me))
        if (online) Box(
            Modifier.align(Alignment.BottomEnd).size(size * 0.27f).clip(CircleShape).background(pal.cell).padding(2.dp),
        ) { Box(Modifier.fillMaxSize().clip(CircleShape).background(SystemColors.green)) }
    }
}

/** The tint capsule with the unread count. */
@Composable
fun UnreadBadge(n: Int) {
    val c = palette
    Box(Modifier.heightIn(min = 20.dp).widthIn(min = 20.dp).clip(CircleShape).background(c.tint).padding(horizontal = 6.dp), contentAlignment = Alignment.Center) {
        Text(if (n > 99) "99+" else "$n", style = Type.caption, color = c.onTint)
    }
}

/** People I can message or add: my active connections first, then members Discover already loaded. */
@Composable
fun rememberChatPeople(): Pair<List<Pair<ChatPerson, String>>, List<Pair<ChatPerson, String>>> {
    val me = rememberMe()
    val connections by AppGraph.home.connections.collectAsStateWithLifecycle()
    val active = connections.orEmpty().filter { it.status == "active" && it.otherUid.isNotEmpty() }
    val mine = active.map { ChatPerson(it.otherUid, it.displayName.ifEmpty { "MUN Pilot member" }, it.photoURL.orEmpty()) to memberRole(it.role) }
        .sortedBy { it.first.name.lowercase() }
    val connected = active.map { it.otherUid }.toSet()
    val more by produceState(emptyList<Pair<ChatPerson, String>>(), me?.uid, connected) {
        val u = me?.uid ?: return@produceState
        value = runCatching { AppGraph.people.discover(u, connected) }.getOrDefault(emptyList())
            .filter { it.id != u }
            .map { ChatPerson(it.id, it.name, it.photoURL.orEmpty()) to listOfNotNull(it.roleLabel, it.institution?.ifBlank { null }).joinToString(" · ") }
    }
    return mine to more
}

// ---------------------------------------------------------------------------------------------
// A4.2 / A4.6 · The chat
// ---------------------------------------------------------------------------------------------

private sealed interface Line {
    val key: String
    data class Day(override val key: String, val label: String) : Line
    data class Note(override val key: String, val text: String) : Line
    data class Msg(
        override val key: String, val m: DirectMessage, val mine: Boolean,
        val head: Boolean, val tail: Boolean, val ticks: Delivery?,
    ) : Line
}

@Composable
fun ChatScreen(convId: String, otherUid: String) {
    val c = palette
    val nav = LocalNav.current
    val goBack = LocalBack.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val haptics = rememberHaptics()
    val me = rememberMe()
    val meUid = me?.uid.orEmpty()
    val status = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val imeBottom = WindowInsets.ime.asPaddingValues().calculateBottomPadding()

    val doc by remember(convId) { AppGraph.chats.conversation(convId) }.collectAsStateWithLifecycle(ConversationDoc(false, null))
    val conv = doc.conv
    var limit by remember(convId) { mutableIntStateOf(CHAT_PAGE) }
    val messages by remember(convId, limit) { AppGraph.chats.messages(convId, limit) }.collectAsStateWithLifecycle(emptyList())

    // The other person: from the conversation, else (a chat not started yet) their profile.
    val other = conv?.other(meUid) ?: otherUid.ifEmpty { null }
    val profile by produceState<com.munpro.app.domain.PublicProfile?>(null, other, conv == null) {
        if (other != null && conv == null) value = AppGraph.people.profile(other)
    }
    val group = conv?.isGroup == true
    val title = when {
        conv != null -> conv.title(meUid)
        profile != null -> profile!!.name
        else -> ""
    }
    val online = rememberOnline(if (group) null else other)
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()
    val eventTitle = conv?.eventId?.let { id -> confs.conferences.orEmpty().firstOrNull { it.event.id == id }?.event?.title }
        ?: conv?.groupName?.substringBefore(" - ")?.takeIf { conv.isCommittee }
    val subtitle = when {
        conv?.isCommittee == true -> listOfNotNull(eventTitle, "${conv.participants.size} members").joinToString(" · ")
        group -> "${conv.participants.size} members"
        else -> onlineLabel(online)
    }

    // Committee chat: senders' countries, from the dais line's rolls (no extra reads).
    val feeds by AppGraph.messages.feeds.collectAsStateWithLifecycle()
    val countries = remember(feeds, conv?.eventId, conv?.committeeId) {
        if (conv?.isCommittee != true) emptyMap()
        else feeds.filter { it.line.eventId == conv.eventId && sameCommittee(it.line.committee, conv.committeeId) }
            .flatMap { it.delegations.entries }.associate { it.key to it.value }
    }

    // How we met, for the note at the top of a direct chat ("You connected at …").
    val connections by AppGraph.home.connections.collectAsStateWithLifecycle()
    val link = if (group) null else connections.orEmpty().firstOrNull { it.otherUid == other }
    val metAt by produceState<String?>(null, link?.sourceEventId) {
        value = link?.sourceEventId?.ifEmpty { null }?.let { AppGraph.events.getEventById(it)?.title }
    }

    var searching by remember { mutableStateOf(false) }
    var q by remember { mutableStateOf("") }
    var menu by remember { mutableStateOf(false) }
    var draft by remember { mutableStateOf("") }
    var note by remember { mutableStateOf<String?>(null) }

    // Read receipts and my unread counter, whenever something new is on screen.
    LaunchedEffect(conv?.id, messages) {
        if (conv != null && messages.isNotEmpty()) AppGraph.chats.markRead(conv, messages)
    }

    val iBlocked = conv != null && meUid in conv.blockedBy
    val lastMine = messages.lastOrNull { it.senderId == meUid && !it.system }?.id
    val shown = if (searching && q.isNotBlank()) messages.filter { !it.system && it.text.contains(q.trim(), ignoreCase = true) } else messages
    val lines = remember(shown, meUid, metAt, searching) {
        val out = mutableListOf<Line>()
        if (!searching && metAt != null && shown.size < limit) out += Line.Note("met", "You connected at $metAt")
        var prevDay: java.time.LocalDate? = null
        shown.forEachIndexed { i, m ->
            val day = m.at?.let { java.time.Instant.ofEpochMilli(it).atZone(java.time.ZoneId.systemDefault()).toLocalDate() }
            if (day != null && day != prevDay) { out += Line.Day("d$day", dayName(day)); prevDay = day }
            if (m.system) { out += Line.Note(m.id, m.text); return@forEachIndexed }
            fun sameRun(o: DirectMessage?) = o != null && !o.system && o.senderId == m.senderId && kotlin.math.abs((o.at ?: 0) - (m.at ?: 0)) < RUN_GAP_MS
            out += Line.Msg(
                m.id, m, m.senderId == meUid,
                head = !sameRun(shown.getOrNull(i - 1)),
                tail = !sameRun(shown.getOrNull(i + 1)),
                ticks = if (m.id == lastMine) m.delivery(meUid) else null,
            )
        }
        out.reversed()
    }

    // Older messages: the list is drawn bottom-up, so the top is its far end.
    val listState = rememberLazyListState()
    LaunchedEffect(listState, lines.size) {
        snapshotFlow { listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 }
            .distinctUntilChanged()
            .collect { last -> if (!searching && messages.size >= limit && last >= lines.size - 3) limit += CHAT_PAGE }
    }

    fun submit() {
        val text = draft.trim().take(DM_MAX_CHARS)
        if (text.isEmpty() || me == null) return
        draft = ""
        note = null
        haptics.selection()
        scope.launch {
            val o = other?.let { ChatPerson(it, profile?.name ?: title, profile?.photoURL.orEmpty()) }
            runCatching { AppGraph.chats.send(convId, conv, text, o) }.onFailure {
                if (draft.isEmpty()) draft = text
                note = "That didn't send. Check your connection and try again."
            }
        }
    }

    Column(Modifier.fillMaxSize().background(c.bg)) {
        Spacer(Modifier.height(status))
        if (searching) {
            Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = Space.gutter), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                SearchField(q, { q = it }, Modifier.weight(1f), placeholder = "Search in chat")
                TextLink("Cancel", { searching = false; q = "" })
            }
        } else {
            val press = rememberPress()
            Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = Space.gutter), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                RoundButton(Icons.back, "Back", goBack)
                Row(
                    Modifier.weight(1f).tap(press, label = "About this chat") {
                        if (group) nav.go(GroupInfoRoute(convId)) else other?.let { nav.go(PublicProfileRoute(it)) }
                    },
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    ChatAvatar(conv, meUid, 36.dp, title.ifEmpty { "?" }, online = online?.online == true)
                    Column(Modifier.weight(1f)) {
                        Text(title, style = Type.headline, color = c.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        subtitle?.let { Text(it, style = Type.caption.copy(fontWeight = FontWeight.Normal), color = if (online?.online == true) SystemColors.green else c.label2, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                    }
                }
                RoundButton(Icons.more, "Chat options", { menu = true })
            }
        }
        Box(Modifier.fillMaxWidth().height(Hairline).background(c.separator))

        Box(Modifier.weight(1f).fillMaxWidth()) {
            when {
                !doc.loaded -> Spinner()
                searching && q.isNotBlank() && shown.isEmpty() -> CenteredText("No matches", "Only messages loaded on this phone are searched.")
                lines.isEmpty() -> CenteredText("No messages yet", if (group) "Say hello to the group." else "Say hello!")
                else -> LazyColumn(Modifier.fillMaxSize(), state = listState, reverseLayout = true, contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp)) {
                    items(lines, key = { it.key }) { line ->
                        when (line) {
                            is Line.Day -> Text(line.label, style = Type.caption, color = c.label2, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp))
                            is Line.Note -> Box(Modifier.fillMaxWidth().padding(vertical = 6.dp), contentAlignment = Alignment.Center) {
                                Text(line.text, style = Type.caption.copy(fontWeight = FontWeight.Normal), color = c.label2, textAlign = TextAlign.Center,
                                    modifier = Modifier.clip(CircleShape).background(c.fillSoft).padding(horizontal = 12.dp, vertical = 5.dp))
                            }
                            is Line.Msg -> Bubble(line, group, countries[line.m.senderId], conv?.participantPhotos?.get(line.m.senderId), q.takeIf { searching })
                        }
                    }
                }
            }
        }

        Column(Modifier.fillMaxWidth().padding(bottom = if (imeBottom > 0.dp) 0.dp else navBottom)) {
            Box(Modifier.fillMaxWidth().height(Hairline).background(c.separator))
            Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                if (iBlocked) {
                    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                        Text("You blocked ${title.substringBefore(' ')}. ", style = Type.footnote, color = c.label2)
                        TextLink("Unblock", {
                            val o = other ?: return@TextLink
                            scope.launch { runCatching { AppGraph.people.unblock(meUid, o) }.onFailure { alerts.show("Couldn't unblock", "Check your connection and try again.") } }
                        }, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold))
                    }
                } else {
                    val ready = draft.isNotBlank() && doc.loaded
                    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(
                            Modifier.weight(1f).heightIn(min = 38.dp).clip(RoundedCornerShape(19.dp)).background(c.cell)
                                .border(Hairline, c.separator, RoundedCornerShape(19.dp)).padding(horizontal = 14.dp, vertical = 9.dp),
                        ) {
                            PlainInput(
                                draft, { draft = it }, "Message", singleLine = false, maxLength = DM_MAX_CHARS,
                                modifier = Modifier.fillMaxWidth().heightIn(max = 120.dp),
                                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                            )
                        }
                        val press = rememberPress()
                        Box(
                            Modifier.padding(bottom = 2.dp).size(34.dp).clip(CircleShape).background(if (ready) c.tint else c.fill)
                                .tap(press, enabled = ready, label = "Send") { submit() },
                            contentAlignment = Alignment.Center,
                        ) { SfIcon(Icons.send, if (ready) c.onTint else c.label3, size = 16.dp) }
                    }
                    note?.let { Text(it, style = Type.footnote, color = c.red, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }
                }
            }
        }
    }

    val first = title.substringBefore(' ').ifEmpty { "them" }
    ActionSheet(menu, { menu = false }, title = title) {
        if (group) SheetRow("Group info", { menu = false; nav.go(GroupInfoRoute(convId)) }, icon = Icons.people)
        else if (other != null) SheetRow("View Profile", { menu = false; nav.go(PublicProfileRoute(other)) }, icon = Icons.profile)
        SheetRow("Search in Chat", { menu = false; searching = true }, icon = Icons.search, enabled = messages.isNotEmpty())
        if (!group && other != null && !iBlocked) SheetRow("Block $first", {
            menu = false
            scope.launch {
                if (com.munpro.app.ui.network.confirmBlock(alerts, me, other, title)) goBack()
            }
        }, destructive = true)
    }
}

private fun dayName(d: java.time.LocalDate): String {
    val today = java.time.LocalDate.now()
    return when (d) {
        today -> "Today"
        today.minusDays(1) -> "Yesterday"
        else -> dayLabel(d)
    }
}

@Composable
private fun Bubble(line: Line.Msg, group: Boolean, country: String?, photo: String?, highlight: String?) {
    val c = palette
    val m = line.m
    val maxW = (LocalConfiguration.current.screenWidthDp * 0.74f).dp
    val avatar = group && !line.mine
    Column(
        Modifier.fillMaxWidth().padding(top = if (line.head) 8.dp else 2.dp),
        horizontalAlignment = if (line.mine) Alignment.End else Alignment.Start,
    ) {
        if (avatar && line.head) {
            Row(Modifier.padding(start = 44.dp, bottom = 3.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                if (!country.isNullOrEmpty()) Flag(country, 14f)
                Text(listOfNotNull(m.senderName.ifEmpty { "Member" }.substringBefore(' '), country?.ifEmpty { null }?.let(::countryName)).joinToString(" · "),
                    style = Type.caption.copy(fontWeight = FontWeight.Normal), color = c.label2)
            }
        }
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (avatar) {
                if (line.tail) PersonAvatar(m.senderName, size = 32.dp, seed = m.senderId, photo = photo) else Spacer(Modifier.width(32.dp))
            }
            val shape = RoundedCornerShape(
                topStart = 18.dp, topEnd = 18.dp,
                bottomEnd = if (line.mine && line.tail) 5.dp else 18.dp,
                bottomStart = if (!line.mine && line.tail) 5.dp else 18.dp,
            )
            Box(Modifier.widthIn(max = maxW).clip(shape).background(if (line.mine) c.tint else c.cell).padding(horizontal = 13.dp, vertical = 8.dp)) {
                Text(highlighted(m.text, highlight, if (line.mine) c.onTint.copy(alpha = 0.28f) else c.tintSoft), style = Type.body, color = if (line.mine) c.onTint else c.label)
            }
        }
        if (line.tail) {
            Row(
                Modifier.padding(top = 3.dp, start = if (avatar) 44.dp else 4.dp, end = 4.dp, bottom = 4.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(m.at?.let(::clock).orEmpty(), style = Type.caption.copy(fontWeight = FontWeight.Normal), color = c.label2)
                when (line.ticks) {
                    Delivery.Sending -> SfIcon(Icons.clock, c.label3, size = 12.dp)
                    Delivery.Sent -> SfIcon(Icons.check, c.label3, size = 13.dp)
                    Delivery.Read -> SfIcon(Icons.checks, SystemColors.blue, size = 14.dp)
                    null -> Unit
                }
            }
        }
    }
}

private fun highlighted(text: String, q: String?, color: Color): androidx.compose.ui.text.AnnotatedString {
    val term = q?.trim().orEmpty()
    if (term.isEmpty()) return androidx.compose.ui.text.AnnotatedString(text)
    return androidx.compose.ui.text.buildAnnotatedString {
        append(text)
        var i = text.indexOf(term, ignoreCase = true)
        while (i >= 0) {
            addStyle(androidx.compose.ui.text.SpanStyle(background = color, fontWeight = FontWeight.SemiBold), i, i + term.length)
            i = text.indexOf(term, i + term.length, ignoreCase = true)
        }
    }
}

@Composable
private fun CenteredText(title: String, body: String) {
    val c = palette
    Column(Modifier.fillMaxSize().padding(horizontal = 36.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, style = Type.headline, color = c.label, textAlign = TextAlign.Center)
        Text(body, style = Type.subhead, color = c.label2, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 6.dp))
    }
}

// ---------------------------------------------------------------------------------------------
// A4.7 · Group info
// ---------------------------------------------------------------------------------------------

@Composable
fun GroupInfoScreen(convId: String) {
    val c = palette
    val nav = LocalNav.current
    val goBack = LocalBack.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val me = rememberMe()
    val meUid = me?.uid.orEmpty()
    val doc by remember(convId) { AppGraph.chats.conversation(convId) }.collectAsStateWithLifecycle(ConversationDoc(false, null))
    val conv = doc.conv
    var renaming by remember { mutableStateOf(false) }
    var adding by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf<String?>(null) }

    val admin = conv != null && meUid in conv.admins
    val manage = admin && !conv.isCommittee
    Screen(
        back = "Chat", navTitle = "Group info", tabBar = false, gap = 20.dp,
        navRight = if (manage) ({ TextLink("Edit", { renaming = true }, style = Type.body.copy(fontWeight = FontWeight.SemiBold)) }) else null,
    ) {
        if (conv == null) {
            if (doc.loaded) CenteredBlock("You're not in this group", "You left it, or were removed.") else Spinner()
            return@Screen
        }
        val title = conv.title(meUid)
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            PersonAvatar(title, size = 84.dp, seed = conv.id, photo = conv.groupPhotoUrl)
            Text(title, style = Type.title2, color = c.label, textAlign = TextAlign.Center)
            val by = conv.createdBy?.let { if (it == meUid) "created by you" else if (conv.isCommittee) null else "created by ${conv.nameOf(it)}" }
            Text(listOfNotNull(if (conv.isCommittee) "Committee chat" else "Group", "${conv.participants.size} members", by).joinToString(" · "), style = Type.footnote, color = c.label2, textAlign = TextAlign.Center)
        }
        val members = conv.participants.sortedWith(compareByDescending<String> { it == meUid }.thenByDescending { it in conv.admins }.thenBy { conv.nameOf(it).lowercase() })
        Section(
            header = "Members · ${members.size}",
            footer = if (conv.isCommittee) "The organizer's chat for this committee. Delegates join when they're approved and move when they're reallocated." else null,
        ) {
            members.forEach { uid ->
                val name = conv.nameOf(uid)
                cell(
                    if (uid == meUid) "You" else name,
                    leading = { PersonAvatar(name, size = 40.dp, seed = uid, photo = conv.participantPhotos[uid]) },
                    inset = 68.dp, chevron = false,
                    trailing = {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            if (uid in conv.admins) Chip("Admin", Tone.Tint)
                            if (manage && uid != meUid) Pill(if (busy == uid) "…" else "Remove", {
                                scope.launch {
                                    if (!alerts.confirm("Remove $name?", "They'll stop getting this group's messages.", "Remove", destructive = true)) return@launch
                                    busy = uid
                                    runCatching { AppGraph.chats.removeMember(conv, uid) }.onFailure { alerts.show("Couldn't remove", "Check your connection and try again.") }
                                    busy = null
                                }
                            }, tone = Tone.Neutral, enabled = busy == null)
                        }
                    },
                    onClick = if (uid != meUid) ({ nav.go(PublicProfileRoute(uid)) }) else null,
                )
            }
            if (manage) cell("Add members", leading = { Box(Modifier.size(40.dp).clip(CircleShape).background(c.tintSoft), contentAlignment = Alignment.Center) { SfIcon(Icons.plus, c.tint, size = 18.dp) } },
                inset = 68.dp, tinted = true, chevron = false, onClick = { adding = true })
        }
        if (!conv.isCommittee) Section {
            cell("Leave group", destructive = true, chevron = false, onClick = {
                scope.launch {
                    if (!alerts.confirm("Leave “$title”?", "You'll stop getting its messages. Someone in the group can add you back.", "Leave", destructive = true)) return@launch
                    runCatching { AppGraph.chats.removeMember(conv, meUid) }
                        .onSuccess { nav.go(com.munpro.app.nav.Tabs(com.munpro.app.nav.TAB_MESSAGES)) }
                        .onFailure { alerts.show("Couldn't leave", "Check your connection and try again.") }
                }
            })
        }
    }

    if (conv != null) {
        RenameSheet(renaming, conv.groupName.orEmpty(), { renaming = false }) { name ->
            runCatching { AppGraph.chats.rename(conv, name) }.isSuccess
        }
        PeoplePickerSheet(
            adding, { adding = false }, title = "Add Members", action = "Add",
            exclude = conv.participants.toSet(),
        ) { picked ->
            runCatching { AppGraph.chats.addMembers(conv, picked) }.isSuccess
        }
    }
}

@Composable
private fun CenteredBlock(title: String, body: String) {
    val c = palette
    Column(Modifier.fillMaxWidth().padding(top = 40.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(title, style = Type.headline, color = c.label)
        Text(body, style = Type.subhead, color = c.label2, textAlign = TextAlign.Center)
    }
}

@Composable
private fun RenameSheet(visible: Boolean, current: String, onClose: () -> Unit, save: suspend (String) -> Boolean) {
    val c = palette
    val scope = rememberCoroutineScope()
    var name by remember(visible) { mutableStateOf(current) }
    var busy by remember { mutableStateOf(false) }
    var error by remember(visible) { mutableStateOf<String?>(null) }
    PageSheet(visible, onClose) {
        SheetHeader("Group Name", leading = "Cancel", onLeading = onClose, trailing = if (busy) "Saving…" else "Save",
            trailingEnabled = name.isNotBlank() && name.trim() != current && !busy,
            onTrailing = {
                busy = true
                scope.launch {
                    if (save(name.trim())) onClose() else error = "That didn't save. Check your connection and try again."
                    busy = false
                }
            })
        Column(Modifier.padding(Space.gutter), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp)) {
                PlainInput(name, { name = it }, "Group name", maxLength = 80, keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words))
            }
            ErrorText(error)
        }
    }
}

// ---------------------------------------------------------------------------------------------
// A4.4 · New message, A4.5 · New group, and Add members
// ---------------------------------------------------------------------------------------------

/**
 * New message: my connections first, then members Discover loaded. Picking someone opens our
 * chat (it starts on the first message, as on the web). [extra] adds rows above the list (the
 * delegate's "The Dais" lines).
 */
@Composable
fun NewMessageSheet(visible: Boolean, onClose: () -> Unit, onNewGroup: () -> Unit, extra: @Composable () -> Unit = {}) {
    val c = palette
    val nav = LocalNav.current
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    var q by remember(visible) { mutableStateOf("") }
    val (mine, more) = rememberChatPeople()
    fun hit(p: Pair<ChatPerson, String>) = q.isBlank() || p.first.name.contains(q.trim(), ignoreCase = true)
    PageSheet(visible, onClose) {
        SheetHeader("New Message", leading = "Cancel", onLeading = onClose)
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 8.dp, bottom = navBottom + 24.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            SearchField(q, { q = it }, placeholder = "Search people")
            Section {
                cell("New group", leading = { Box(Modifier.size(40.dp).clip(CircleShape).background(c.tintSoft), contentAlignment = Alignment.Center) { SfIcon(Icons.people, c.tint, size = 19.dp) } },
                    inset = 68.dp, tinted = true, onClick = onNewGroup)
            }
            if (q.isBlank()) extra()
            val a = mine.filter(::hit)
            val b = more.filter(::hit)
            fun open(p: ChatPerson) {
                val id = AppGraph.chats.directId(p.uid) ?: return
                onClose()
                nav.go(ChatRoute(id, p.uid))
            }
            if (a.isNotEmpty()) Section(header = "Your connections") {
                a.forEach { (p, sub) -> cell(p.name, subtitle = sub.ifEmpty { null }, leading = { PersonAvatar(p.name, size = 40.dp, seed = p.uid, photo = p.photo) }, inset = 68.dp, chevron = false, onClick = { open(p) }) }
            }
            if (b.isNotEmpty()) Section(header = "More members") {
                b.forEach { (p, sub) -> cell(p.name, subtitle = sub.ifEmpty { null }, leading = { PersonAvatar(p.name, size = 40.dp, seed = p.uid, photo = p.photo) }, inset = 68.dp, chevron = false, onClick = { open(p) }) }
            }
            if (a.isEmpty() && b.isEmpty()) Text(
                if (q.isBlank()) "Connect with people in Network, or meet them at a conference, to message them here." else "No one by that name among your connections and suggested members.",
                style = Type.footnote, color = c.label2, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            )
        }
    }
}

/** New group: a name, then people. Opens the group once it exists. */
@Composable
fun NewGroupSheet(visible: Boolean, onClose: () -> Unit) {
    val nav = LocalNav.current
    var name by remember(visible) { mutableStateOf("") }
    PeoplePickerSheet(
        visible, onClose, title = "New Group", action = "Create", needsName = name,
        header = {
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(palette.cell).padding(16.dp)) {
                PlainInput(name, { name = it }, "Group name", maxLength = 80, keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words))
            }
        },
    ) { picked ->
        runCatching { AppGraph.chats.createGroup(name.trim(), picked) }
            .onSuccess { id -> nav.go(ChatRoute(id)) }
            .isSuccess
    }
}

/** Pick several people; [submit] returns whether it worked, and the sheet closes when it did. */
@Composable
private fun PeoplePickerSheet(
    visible: Boolean,
    onClose: () -> Unit,
    title: String,
    action: String,
    exclude: Set<String> = emptySet(),
    /** Set for New Group: the action also needs a name. */
    needsName: String? = null,
    header: @Composable () -> Unit = {},
    submit: suspend (List<ChatPerson>) -> Boolean,
) {
    val c = palette
    val scope = rememberCoroutineScope()
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    var q by remember(visible) { mutableStateOf("") }
    val picked = remember(visible) { mutableStateListOf<ChatPerson>() }
    var busy by remember { mutableStateOf(false) }
    var error by remember(visible) { mutableStateOf<String?>(null) }
    val (mine, more) = rememberChatPeople()
    fun hit(p: Pair<ChatPerson, String>) = p.first.uid !in exclude && (q.isBlank() || p.first.name.contains(q.trim(), ignoreCase = true))
    val ready = picked.isNotEmpty() && (needsName == null || needsName.isNotBlank()) && !busy

    PageSheet(visible, onClose) {
        SheetHeader(
            title, subtitle = if (picked.isEmpty()) null else "${picked.size} selected",
            leading = "Cancel", onLeading = onClose,
            trailing = if (busy) "…" else action, trailingEnabled = ready,
            onTrailing = {
                busy = true
                error = null
                scope.launch {
                    if (submit(picked.toList())) onClose() else error = "That didn't work. Check your connection and try again."
                    busy = false
                }
            },
        )
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 8.dp, bottom = navBottom + 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            header()
            if (picked.isNotEmpty()) Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                picked.forEach { p ->
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(56.dp).tap(rememberPress(), label = "Remove ${p.name}") { picked.remove(p) }) {
                        Box {
                            PersonAvatar(p.name, size = 48.dp, seed = p.uid, photo = p.photo)
                            Box(Modifier.align(Alignment.TopEnd).offset(x = 3.dp, y = (-3).dp).size(18.dp).clip(CircleShape).background(c.label3), contentAlignment = Alignment.Center) {
                                SfIcon(Icons.close, Color.White, size = 10.dp)
                            }
                        }
                        Text(p.name.substringBefore(' '), style = Type.caption.copy(fontWeight = FontWeight.Normal), color = c.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
            SearchField(q, { q = it }, placeholder = "Search people")
            ErrorText(error)
            val rows: com.munpro.app.ui.kit.SectionScope.(Pair<ChatPerson, String>) -> Unit = { (p, sub) ->
                val on = picked.any { it.uid == p.uid }
                cell(
                    p.name, subtitle = sub.ifEmpty { null },
                    leading = { PersonAvatar(p.name, size = 40.dp, seed = p.uid, photo = p.photo) },
                    trailing = { CheckCircle(on) }, inset = 68.dp, chevron = false,
                    onClick = { if (on) picked.removeAll { it.uid == p.uid } else picked.add(p) },
                )
            }
            val a = mine.filter(::hit)
            val b = more.filter(::hit)
            if (a.isNotEmpty()) Section(header = "Your connections") { a.forEach { rows(it) } }
            if (b.isNotEmpty()) Section(header = "More members") { b.forEach { rows(it) } }
            if (a.isEmpty() && b.isEmpty()) Text("No one to add.", style = Type.footnote, color = c.label2, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun CheckCircle(on: Boolean) {
    val c = palette
    Box(
        Modifier.size(24.dp).clip(CircleShape).background(if (on) c.tint else Color.Transparent)
            .border(if (on) 0.dp else 1.5.dp, c.label3, CircleShape),
        contentAlignment = Alignment.Center,
    ) { if (on) SfIcon(Icons.check, c.onTint, size = 14.dp) }
}
