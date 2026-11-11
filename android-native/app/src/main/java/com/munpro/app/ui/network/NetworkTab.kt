package com.munpro.app.ui.network

// Network (board A2.1–A2.5; web app/dashboard/network/page.tsx): Discover people to connect with,
// your Connections (met at a conference, or added by you) with their actions, and the people
// you've Blocked, by name. Message joins the actions with direct messages (board A4).

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.data.AuthState
import com.munpro.app.data.Me
import com.munpro.app.domain.BlockedPerson
import com.munpro.app.domain.Connection
import com.munpro.app.domain.PublicProfile
import com.munpro.app.domain.relativeAgo
import com.munpro.app.nav.PublicProfileRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.kit.ActionSheet
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.Loading
import com.munpro.app.ui.kit.PersonAvatar
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.RoundButton
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.Segmented
import com.munpro.app.ui.kit.SheetRow
import com.munpro.app.ui.kit.Tone
import kotlinx.coroutines.launch

private enum class Tab { Discover, Connections, Blocked }

/** The signed-in user as the other side's connection doc records them (web: displayName || email, photo, role). */
@Composable
fun rememberMe(): Me? {
    val auth by AppGraph.auth.state.collectAsStateWithLifecycle()
    val s = auth as? AuthState.SignedIn ?: return null
    val p = s.profile
    return Me(
        s.user.uid,
        p?.displayName?.ifBlank { null } ?: p?.fullName?.ifBlank { null } ?: s.user.email.orEmpty().ifEmpty { "User" },
        p?.photoURL.orEmpty(),
        p?.role?.ifBlank { null } ?: "Delegate",
    )
}

@Composable
fun NetworkTab() {
    val me = rememberMe()
    val all by AppGraph.home.connections.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableStateOf(Tab.Discover) }
    val asked by com.munpro.app.ui.tabs.TabHost.network.collectAsStateWithLifecycle()
    LaunchedEffect(asked) {
        if (asked == "blocked") tab = Tab.Blocked
        if (asked != null) com.munpro.app.ui.tabs.TabHost.network.value = null
    }
    var discover by remember { mutableStateOf<List<PublicProfile>?>(null) }
    var blocked by remember { mutableStateOf<List<BlockedPerson>?>(null) }
    var reload by remember { mutableStateOf(0) }
    val active = all?.filter { it.status == "active" }?.sortedBy { it.displayName.lowercase() }

    // The web refetches its candidates whenever the connections change; here, once the
    // connections are known and on pull-to-refresh, then hides anyone connected since.
    LaunchedEffect(me?.uid, all != null, reload) {
        val m = me ?: return@LaunchedEffect
        val conns = all ?: return@LaunchedEffect
        discover = runCatching { AppGraph.people.discover(m.uid, conns.map { it.otherUid }.toSet(), force = reload > 0) }.getOrDefault(emptyList())
    }
    LaunchedEffect(me?.uid, tab, reload) {
        val m = me ?: return@LaunchedEffect
        if (tab == Tab.Blocked) blocked = runCatching { AppGraph.people.blocked(m.uid, all.orEmpty().associate { it.otherUid to it.displayName }) }.getOrDefault(emptyList())
    }
    val connectedIds = all.orEmpty().map { it.otherUid }.toSet()
    val candidates = discover?.filter { it.id !in connectedIds }

    Screen(
        title = "Network",
        overline = listOfNotNull(active?.let { "${it.size} connection${if (it.size == 1) "" else "s"}" }, candidates?.let { "${it.size} to discover" }).joinToString(" · ").ifEmpty { null },
        onRefresh = { reload++ },
        gap = 16.dp,
    ) {
        Segmented(
            listOf(Tab.Discover to "Discover", Tab.Connections to if (active.isNullOrEmpty()) "Connections" else "Connections · ${active.size}", Tab.Blocked to "Blocked"),
            tab, { tab = it },
        )
        when (tab) {
            Tab.Discover -> Discover(candidates, me)
            Tab.Connections -> Connections(active, me) { reload++ }
            Tab.Blocked -> Blocked(blocked, me) { gone -> blocked = blocked?.filter { it.uid != gone } }
        }
    }
}

@Composable
private fun Discover(list: List<PublicProfile>?, me: Me?) {
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val busy = remember { mutableStateMapOf<String, Boolean>() }
    when {
        list == null -> Loading()
        list.isEmpty() -> Empty("No one new right now", "As more people join MUN Pilot, they'll appear here.", icon = Icons.network)
        else -> Section(header = "People you may know") {
            list.forEach { p ->
                cell(
                    p.name, subtitle = listOfNotNull(p.roleLabel, p.institution?.ifBlank { null }).joinToString(" · "),
                    leading = { PersonAvatar(p.name, size = 44.dp, seed = p.id, photo = p.photoURL) }, inset = 72.dp, chevron = false,
                    trailing = {
                        Pill(if (busy[p.id] == true) "…" else "Connect", {
                            val m = me ?: return@Pill
                            busy[p.id] = true
                            // A refusal (they blocked me) stays quiet, as on the web.
                            scope.launch { runCatching { AppGraph.people.connect(m, p) }; busy[p.id] = false }
                        }, enabled = busy[p.id] != true)
                    },
                    onClick = { nav.go(PublicProfileRoute(p.id)) },
                )
            }
        }
    }
}

@Composable
private fun Connections(list: List<Connection>?, me: Me?, onChanged: () -> Unit) {
    val nav = LocalNav.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    var acting by remember { mutableStateOf<Connection?>(null) }
    // "Met at …": the conference a conference-made connection came from.
    val titles = remember { mutableStateMapOf<String, String>() }
    LaunchedEffect(list) {
        list.orEmpty().mapNotNull { it.sourceEventId?.ifEmpty { null } }.distinct().filter { it !in titles }.forEach { id ->
            AppGraph.events.getEventById(id)?.title?.let { titles[id] = it }
        }
    }
    when {
        list == null -> Loading()
        list.isEmpty() -> Empty("No connections yet", "People you share a conference with appear here, and anyone you connect with from Discover.", icon = Icons.network)
        else -> {
            val (auto, manual) = list.partition { it.source != "manual" }
            val row: com.munpro.app.ui.kit.SectionScope.(Connection, String) -> Unit = { c, sub ->
                cell(
                    c.displayName.ifEmpty { "MUN Pilot member" }, subtitle = sub,
                    leading = { PersonAvatar(c.displayName, size = 44.dp, seed = c.otherUid, photo = c.photoURL) }, inset = 72.dp, chevron = false,
                    trailing = { Box { RoundButton(Icons.more, "More for ${c.displayName}", { acting = c }) } },
                    onClick = { nav.go(PublicProfileRoute(c.otherUid)) },
                )
            }
            if (auto.isNotEmpty()) Section(header = "From conferences") {
                auto.forEach { c -> row(c, c.sourceEventId?.let { titles[it] }?.let { "Met at $it" } ?: com.munpro.app.domain.memberRole(c.role)) }
            }
            if (manual.isNotEmpty()) Section(header = "Added by you") {
                manual.forEach { c -> row(c, com.munpro.app.domain.memberRole(c.role)) }
            }
        }
    }

    val c = acting
    ActionSheet(c != null, { acting = null }, title = c?.displayName.orEmpty(), message = if (c?.source == "manual") "Connected · added by you" else "Connected · met at a conference") {
        if (c != null) {
            SheetRow("Message", { acting = null; AppGraph.chats.directId(c.otherUid)?.let { nav.go(com.munpro.app.nav.ChatRoute(it, c.otherUid)) } })
            SheetRow("View Profile", { acting = null; nav.go(PublicProfileRoute(c.otherUid)) })
            SheetRow("Disconnect", {
                acting = null
                scope.launch {
                    if (alerts.confirm("Disconnect ${c.displayName}?", "Remove ${c.displayName} from your connections?", "Disconnect", destructive = true) && me != null) {
                        runCatching { AppGraph.people.disconnect(me.uid, c.otherUid) }.onFailure { alerts.show("Couldn't disconnect", "Check your connection and try again.") }
                        onChanged()
                    }
                }
            }, destructive = true)
            SheetRow("Block", {
                acting = null
                scope.launch { confirmBlock(alerts, me, c.otherUid, c.displayName); onChanged() }
            }, destructive = true)
        }
    }
}

/** Block confirm (A2.4): the web's wording. */
suspend fun confirmBlock(alerts: com.munpro.app.ui.kit.AlertController, me: Me?, uid: String, name: String): Boolean {
    if (me == null) return false
    if (!alerts.confirm("Block $name?", "They won't be able to message you, and your connection will be set to blocked. They aren't told.", "Block", destructive = true)) return false
    return runCatching { AppGraph.people.block(me.uid, uid) }.onFailure { alerts.show("Couldn't block", "Check your connection and try again.") }.isSuccess
}

@Composable
private fun Blocked(list: List<BlockedPerson>?, me: Me?, onUnblocked: (String) -> Unit) {
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    when {
        list == null -> Loading()
        list.isEmpty() -> Empty("No one blocked", "People you block can't message you. You can unblock them here any time.", icon = Icons.lock)
        else -> Section(footer = "Blocked people can't message you.") {
            list.forEach { b ->
                cell(
                    b.name, subtitle = b.blockedAt?.let { "Blocked ${relativeAgo(it).replaceFirstChar { ch -> ch.lowercase() }}" },
                    leading = { PersonAvatar(b.name, size = 44.dp, seed = b.uid) }, inset = 72.dp, chevron = false,
                    trailing = {
                        Pill("Unblock", {
                            scope.launch {
                                if (me != null && alerts.confirm("Unblock ${b.name}?", null, "Unblock")) {
                                    runCatching { AppGraph.people.unblock(me.uid, b.uid) }
                                        .onSuccess { onUnblocked(b.uid) }
                                        .onFailure { alerts.show("Couldn't unblock", "Check your connection and try again.") }
                                }
                            }
                        }, tone = Tone.Neutral)
                    },
                )
            }
        }
    }
}
