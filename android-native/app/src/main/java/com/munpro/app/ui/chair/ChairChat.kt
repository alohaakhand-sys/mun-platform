package com.munpro.app.ui.chair

// The dais inbox on a phone (port of mobile/src/components/ChairChat.tsx): announcements pinned
// first, then every delegation on the roll — the ones that have written sorted by latest message,
// with an unread count — so a delegation nobody has messaged yet can still be written to. ONE
// sheet: the list and a thread swap inside it (same model as the web's ChairChatDock).

import com.munpro.app.ui.kit.Flag
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.munpro.app.domain.countryName
import com.munpro.app.domain.flagEmoji
import com.munpro.app.domain.live.BROADCAST_THREAD
import com.munpro.app.domain.live.DelegateRosterEntry
import com.munpro.app.ui.chat.ChatCopy
import com.munpro.app.ui.chat.ChatPanel
import com.munpro.app.ui.kit.CountBadge
import com.munpro.app.ui.kit.Emoji
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.Space
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette

@Composable
fun ChairChat(visible: Boolean, onClose: () -> Unit, chat: DaisChat, roster: List<DelegateRosterEntry>, meUid: String, meName: String) {
    val c = palette
    val alerts = LocalAlerts.current
    var open by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(visible) { if (!visible) open = null }
    val byKey = chat.threads.associateBy { it.key }
    // Every rostered delegation, the ones with messages first (newest), the rest alphabetically.
    val rows = roster.map { it to byKey[it.delegateId] }
        .sortedWith(compareByDescending<Pair<DelegateRosterEntry, com.munpro.app.domain.live.ChatThread?>> { it.second?.lastAt ?: 0L }.thenBy { countryName(it.first.country) })
    val nav = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()

    PageSheet(visible, { if (open != null) open = null else onClose() }, background = if (open == null) c.bg else c.cell) {
        val key = open
        if (key == null) {
            SheetHeader("Messages", trailing = "Done", onTrailing = onClose, divider = true)
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 16.dp, bottom = nav + 24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                if (chat.denied) Text("This account can't read the dais inbox for this committee.", style = Type.subhead, color = c.red, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                Section {
                    cell("Announcements", subtitle = byKey[BROADCAST_THREAD]?.lastText?.ifEmpty { null } ?: "Send a notice to the whole committee", inset = 52.dp,
                        leading = { Emoji("📣") }, onClick = { open = BROADCAST_THREAD })
                }
                Section(header = "Delegations", footer = "Private notes, one thread per delegate. Only the dais sees them.") {
                    if (rows.isEmpty()) cell("Nobody on the roll yet", chevron = false, dim = true)
                    rows.forEach { (r, t) ->
                        cell(
                            countryName(r.country), inset = 52.dp, leading = { Flag(r.country) },
                            subtitle = if (t != null) (if (t.lastFromRole == "dais") "You: " else "") + t.lastText else "No messages",
                            trailing = if ((t?.unread ?: 0) > 0) ({ CountBadge(t!!.unread) }) else null,
                            onClick = { open = r.delegateId },
                        )
                    }
                }
            }
        } else {
            val thread = byKey[key]
            val broadcast = key == BROADCAST_THREAD
            val row = roster.firstOrNull { it.delegateId == key }
            ChatPanel(
                onClose = { open = null; onClose() },
                messages = thread?.messages.orEmpty(),
                meUid = meUid,
                canSend = true,
                disabledReason = null,
                denied = chat.denied,
                onSend = { text -> chat.reply(key, meName, text) },
                onSeen = { thread?.let { chat.markSeen(key, it.lastAt) } },
                copy = if (broadcast) ChatCopy("Announcements", "Everyone in this committee", "Announce to the room", "Reaches every delegate's phone and console at once.", "Announce to the committee")
                else ChatCopy(countryName(row?.country), "Private to this delegation", "No messages yet", "Write to this delegation privately. It stays on the session record.", "Reply to this delegate"),
                notices = false,
                onBack = { open = null },
                // One write here reaches every delegate's screen, so it asks first, like the web's "Confirm announce".
                confirmSend = if (broadcast) ({ text -> alerts.confirm("Announce to everyone?", "“$text”", "Announce") }) else null,
            )
        }
    }
}
