package com.munpro.app.ui.chat

// The private line to the dais, drawn like Messages (port of mobile/src/components/ChatSheet.tsx):
// my notes on the right in the tint, the dais on the left in grey, "@all" announcements as centred
// notices in the same timeline. No typing indicators or read receipts, on purpose: each would be a
// write per keystroke and would reveal the App Admin's silent observer.
//
// ChatPanel has no sheet of its own, so the chair's inbox switches to it in place (one surface,
// content swapped — the arrangement that kept the RN app from hanging on Android).

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.munpro.app.domain.clock
import com.munpro.app.domain.live.BROADCAST_THREAD
import com.munpro.app.domain.live.CHAT_BURST_LIMIT
import com.munpro.app.domain.live.CHAT_BURST_WINDOW_MS
import com.munpro.app.domain.live.CHAT_MAX_CHARS
import com.munpro.app.domain.live.CHAT_MIN_SEND_GAP_MS
import com.munpro.app.domain.live.SessionChatMessage
import com.munpro.app.domain.live.normalizeChatText
import com.munpro.app.ui.kit.Hairline
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.PlainInput
import com.munpro.app.ui.kit.SfIcon
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.kit.rememberHaptics
import com.munpro.app.ui.kit.rememberPress
import com.munpro.app.ui.kit.tap
import kotlinx.coroutines.launch

private const val GAP_FOR_TIME_MS = 10 * 60_000L

data class ChatCopy(val title: String, val subtitle: String, val emptyTitle: String, val emptyBody: String, val placeholder: String)

/** The delegate's view by default; the chair console passes its own words for each thread. */
val DELEGATE_COPY = ChatCopy(
    title = "The Dais", subtitle = "Chair and vice-chairs only",
    emptyTitle = "Write to the dais",
    emptyBody = "Ask a question or flag a problem without raising your placard. Only the chair and vice-chairs see it, and it stays on the session record.",
    placeholder = "Message the dais",
)

private sealed interface Row {
    val key: String
    data class Time(override val key: String, val at: Long) : Row
    /** The sitting the following messages were sent in (Messages threads span days). */
    data class Sitting(override val key: String, val label: String) : Row
    data class Msg(override val key: String, val m: SessionChatMessage, val mine: Boolean, val showName: Boolean, val tail: Boolean) : Row
}

/** The conversation in its own sheet. */
@Composable
fun ChatSheet(
    visible: Boolean, onClose: () -> Unit, messages: List<SessionChatMessage>, meUid: String,
    canSend: Boolean, disabledReason: String? = null, denied: Boolean,
    onSend: suspend (String) -> Unit, onSeen: () -> Unit,
    copy: ChatCopy = DELEGATE_COPY, notices: Boolean = true,
) {
    PageSheet(visible, onClose, background = palette.cell) {
        ChatPanel(onClose, messages, meUid, canSend, disabledReason, denied, onSend, onSeen, copy, notices)
    }
}

@Composable
fun ColumnScope.ChatPanel(
    onClose: () -> Unit,
    messages: List<SessionChatMessage>,
    meUid: String,
    canSend: Boolean,
    disabledReason: String?,
    denied: Boolean,
    onSend: suspend (String) -> Unit,
    onSeen: () -> Unit,
    copy: ChatCopy = DELEGATE_COPY,
    /** Draw "@all" messages as centred notices (the delegate's view) rather than bubbles. */
    notices: Boolean = true,
    /** Shows a Back button that returns to a thread list instead of closing. */
    onBack: (() -> Unit)? = null,
    /** Asked before sending, e.g. an announcement that reaches every delegate. */
    confirmSend: (suspend (String) -> Boolean)? = null,
    /** Off when the screen draws its own navigation bar (a Messages thread). */
    showHeader: Boolean = true,
    /** Names the sitting a message was sent in; a chip marks each change. */
    sittingLabel: ((SessionChatMessage) -> String?)? = null,
    /** Caption under my last message ("Sent as Chair"). */
    sentCaption: String? = null,
    /** Their bubbles' colour; white on a grey thread background (Messages), grey on a white sheet. */
    incoming: androidx.compose.ui.graphics.Color? = null,
) {
    val c = palette
    val haptics = rememberHaptics()
    val scope = rememberCoroutineScope()
    var draft by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf<String?>(null) }
    var lastSent by remember { mutableStateOf(0L) }
    val burst = remember { mutableListOf<Long>() }
    val nav = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val imeBottom = WindowInsets.ime.asPaddingValues().calculateBottomPadding()

    // Everything on screen counts as seen while the sheet is open, including arrivals.
    LaunchedEffect(messages.size) { onSeen() }

    // Newest first, because the list is drawn bottom-up.
    val rows = remember(messages, meUid, notices) {
        val out = mutableListOf<Row>()
        var prevAt = 0L
        var prevSitting: String? = null
        messages.forEachIndexed { i, m ->
            val at = m.sentAt ?: 0
            if (prevAt == 0L || at - prevAt > GAP_FOR_TIME_MS) out += Row.Time("t$at-$i", at)
            val sitting = sittingLabel?.invoke(m)
            if (sitting != null && sitting != prevSitting) out += Row.Sitting("s$at-$i", sitting)
            prevSitting = sitting
            fun sameSide(a: SessionChatMessage?) = a != null && a.threadKey != BROADCAST_THREAD && a.fromUid == m.fromUid && ((a.sentAt ?: 0) - at) < GAP_FOR_TIME_MS
            val prev = messages.getOrNull(i - 1)
            val next = messages.getOrNull(i + 1)
            out += Row.Msg(
                m.id.ifEmpty { "m$at-$i" }, m, m.fromUid == meUid,
                // Names on dais bubbles that aren't mine; a delegate's own thread needs no caption.
                showName = m.fromUid != meUid && m.fromRole == "dais" && !(notices && m.threadKey == BROADCAST_THREAD) && !sameSide(prev),
                tail = !sameSide(next),
            )
            prevAt = at
        }
        out.reversed()
    }

    fun submit() {
        val text = normalizeChatText(draft)
        if (text.isEmpty() || sending || !canSend) return
        scope.launch {
            if (confirmSend != null && !confirmSend(text)) return@launch
            // Client-side only, the web's numbers: rules can't rate-limit without reading prior state.
            val now = System.currentTimeMillis()
            if (now - lastSent < CHAT_MIN_SEND_GAP_MS) return@launch
            burst.removeAll { now - it >= CHAT_BURST_WINDOW_MS }
            if (burst.size >= CHAT_BURST_LIMIT) { note = "You've sent a lot in a few minutes. Wait a moment before sending more."; return@launch }
            sending = true
            note = null
            try {
                onSend(text)
                lastSent = now
                burst += now
                draft = ""
                haptics.selection()
            } catch (_: Exception) {
                note = "That didn't send. Check your connection and try again."
            } finally {
                sending = false
            }
        }
    }
    val ready = normalizeChatText(draft).isNotEmpty() && !sending

    if (showHeader) SheetHeader(copy.title, subtitle = copy.subtitle, leading = if (onBack != null) "Back" else null, onLeading = onBack, trailing = "Done", onTrailing = onClose, divider = true)
    val lastMine = messages.lastOrNull { it.fromUid == meUid }?.id

    Box(Modifier.weight(1f).fillMaxWidth()) {
        when {
            denied -> Centered("Messages unavailable", "This account can't read the dais line for this session. Sign out and back in, then try again.")
            rows.isEmpty() -> Centered(copy.emptyTitle, copy.emptyBody)
            else -> LazyColumn(Modifier.fillMaxSize(), reverseLayout = true, contentPadding = PaddingValues(12.dp)) {
                items(rows, key = { it.key }) { row ->
                    when (row) {
                        is Row.Time -> Text(chatStamp(row.at), style = Type.caption, color = c.label2, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp))
                        is Row.Sitting -> Box(Modifier.fillMaxWidth().padding(bottom = 8.dp), contentAlignment = Alignment.Center) {
                            Row(
                                Modifier.clip(CircleShape).background(c.fill).padding(horizontal = 10.dp, vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp),
                            ) {
                                Box(Modifier.size(6.dp).clip(CircleShape).background(c.tint))
                                Text(row.label, style = Type.caption, color = c.label2)
                            }
                        }
                        is Row.Msg -> if (notices && row.m.threadKey == BROADCAST_THREAD) {
                            Box(Modifier.fillMaxWidth().padding(vertical = 6.dp), contentAlignment = Alignment.Center) {
                                Column(
                                    Modifier.widthIn(max = 320.dp).clip(RoundedCornerShape(14.dp)).background(c.tintSoft).padding(horizontal = 14.dp, vertical = 10.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp),
                                ) {
                                    Text("TO EVERYONE" + if (row.m.fromName.isNotEmpty()) " · ${row.m.fromName}" else "", style = Type.caption.copy(fontWeight = FontWeight.SemiBold), color = c.tint)
                                    Text(row.m.text, style = Type.body, color = c.label, textAlign = TextAlign.Center)
                                }
                            }
                        } else {
                            Bubble(row, incoming ?: c.fill)
                            if (sentCaption != null && row.mine && row.m.id == lastMine) {
                                Text(sentCaption, style = Type.caption.copy(fontWeight = FontWeight.Normal), color = c.label2, textAlign = TextAlign.End, modifier = Modifier.fillMaxWidth().padding(end = 4.dp, bottom = 4.dp))
                            }
                        }
                    }
                }
            }
        }
    }

    Column(
        Modifier
            .fillMaxWidth()
            .padding(bottom = if (imeBottom > 0.dp) 0.dp else nav),
    ) {
        Box(Modifier.fillMaxWidth().height(Hairline).background(c.separator))
        Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            if (canSend) {
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(
                        Modifier
                            .weight(1f)
                            .heightIn(min = 38.dp)
                            .clip(RoundedCornerShape(19.dp))
                            .border(Hairline, c.separator, RoundedCornerShape(19.dp))
                            .padding(horizontal = 14.dp, vertical = 9.dp),
                    ) {
                        PlainInput(
                            draft, { draft = it }, copy.placeholder, singleLine = false, maxLength = CHAT_MAX_CHARS,
                            modifier = Modifier.fillMaxWidth().heightIn(max = 120.dp),
                            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                        )
                    }
                    val press = rememberPress()
                    Box(
                        Modifier
                            .padding(bottom = 2.dp)
                            .size(34.dp)
                            .clip(CircleShape)
                            .background(if (ready) c.tint else c.fill)
                            .tap(press, enabled = ready, label = "Send") { submit() },
                        contentAlignment = Alignment.Center,
                    ) { SfIcon(Icons.send, if (ready) c.onTint else c.label3, size = 16.dp) }
                }
                if (draft.length > CHAT_MAX_CHARS - 100) Text("${draft.length}/$CHAT_MAX_CHARS", style = Type.caption, color = c.label2, textAlign = TextAlign.End, modifier = Modifier.fillMaxWidth())
                note?.let { Text(it, style = Type.footnote, color = c.red, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }
            } else {
                Text(disabledReason ?: "You can't send messages here.", style = Type.footnote, color = c.label2, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp))
            }
        }
    }
}

@Composable
private fun Bubble(row: Row.Msg, incoming: androidx.compose.ui.graphics.Color) {
    val c = palette
    val maxW = (LocalConfiguration.current.screenWidthDp * 0.78f).dp
    Column(
        Modifier
            .fillMaxWidth()
            .padding(top = if (row.showName) 8.dp else 2.dp, bottom = if (row.tail) 6.dp else 0.dp),
        horizontalAlignment = if (row.mine) Alignment.End else Alignment.Start,
    ) {
        if (row.showName) Text(row.m.fromName.ifEmpty { "Dais" }, style = Type.caption.copy(fontWeight = FontWeight.Normal), color = c.label2, modifier = Modifier.padding(start = 12.dp, bottom = 3.dp))
        val shape = RoundedCornerShape(
            topStart = 18.dp, topEnd = 18.dp,
            bottomEnd = if (row.mine && row.tail) 5.dp else 18.dp,
            bottomStart = if (!row.mine && row.tail) 5.dp else 18.dp,
        )
        Box(Modifier.widthIn(max = maxW).clip(shape).background(if (row.mine) c.tint else incoming).padding(horizontal = 13.dp, vertical = 8.dp)) {
            Text(row.m.text, style = Type.body, color = if (row.mine) c.onTint else c.label)
        }
    }
}

/** "Today, 10:15 AM" / "Yesterday, …" / "Sun 15 Nov, …": a thread spans the conference's days. */
private fun chatStamp(at: Long): String {
    val zone = java.time.ZoneId.systemDefault()
    val day = java.time.Instant.ofEpochMilli(at).atZone(zone).toLocalDate()
    val today = java.time.LocalDate.now(zone)
    val label = when (day) {
        today -> "Today"
        today.minusDays(1) -> "Yesterday"
        else -> com.munpro.app.domain.dayLabel(day)
    }
    return "$label, ${clock(at)}"
}

@Composable
private fun Centered(title: String, body: String) {
    val c = palette
    Column(Modifier.fillMaxSize().padding(horizontal = 36.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, style = Type.headline, color = c.label, textAlign = TextAlign.Center)
        Text(body, style = Type.subhead, color = c.label2, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 6.dp))
    }
}

