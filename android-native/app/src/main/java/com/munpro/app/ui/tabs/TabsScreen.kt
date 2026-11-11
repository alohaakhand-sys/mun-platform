package com.munpro.app.ui.tabs

// Five tabs (board A1) — Home, Conferences, Messages, Network, Profile — under a translucent bar
// that floats over the content like the iOS material bar. Each tab keeps its own state (scroll,
// search) while another is showing.

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.offset
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.munpro.app.nav.TAB_CONFERENCES
import com.munpro.app.nav.TAB_HOME
import com.munpro.app.nav.TAB_MESSAGES
import com.munpro.app.nav.TAB_NETWORK
import com.munpro.app.nav.TAB_PROFILE
import com.munpro.app.ui.conferences.ConferencesTab
import com.munpro.app.ui.home.HomeTab
import com.munpro.app.ui.network.NetworkTab
import kotlinx.coroutines.flow.MutableStateFlow
import com.munpro.app.ui.kit.Hairline
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.Inter
import com.munpro.app.ui.kit.SfIcon
import com.munpro.app.ui.kit.SfIconSpec
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.kit.rememberPress
import com.munpro.app.ui.kit.tap
import com.munpro.app.ui.profile.ProfileTab

private data class TabSpec(val key: String, val title: String, val icon: SfIconSpec)

private val TABS = listOf(
    TabSpec(TAB_HOME, "Home", Icons.home),
    TabSpec(TAB_CONFERENCES, "Conferences", Icons.today),
    TabSpec(TAB_MESSAGES, "Messages", Icons.messages),
    TabSpec(TAB_NETWORK, "Network", Icons.network),
    TabSpec(TAB_PROFILE, "Profile", Icons.profile),
)

/** Switches tabs from inside one (Home's "See all" → Conferences). */
val LocalSelectTab = staticCompositionLocalOf<(String) -> Unit> { {} }

/**
 * Tab requests from outside the tab host (a pushed screen, a link): [com.munpro.app.ui.Navigator.tab]
 * sets them, the host takes them. [conferences] is the Conferences tab's half (Mine / Browse).
 */
object TabHost {
    val request = MutableStateFlow<String?>(null)
    val conferences = MutableStateFlow(com.munpro.app.nav.CONF_MINE)
    /** The Network tab's segment to open ("blocked" from Settings → Privacy), taken once. */
    val network = MutableStateFlow<String?>(null)

    fun select(tab: String, segment: String = "") {
        if (segment.isNotEmpty()) { if (tab == com.munpro.app.nav.TAB_NETWORK) network.value = segment else conferences.value = segment }
        request.value = tab
    }
}

@Composable
fun TabsScreen(initial: String, segment: String = "") {
    var tab by rememberSaveable(initial) { mutableStateOfTab(initial) }
    androidx.compose.runtime.LaunchedEffect(initial, segment) { if (segment.isNotEmpty()) TabHost.conferences.value = segment }
    val requested by TabHost.request.collectAsStateWithLifecycle()
    androidx.compose.runtime.LaunchedEffect(requested) {
        requested?.let { tab = it; TabHost.request.value = null }
    }
    val holder = rememberSaveableStateHolder()
    CompositionLocalProvider(LocalSelectTab provides { tab = it }) {
        Box(Modifier.fillMaxSize()) {
            holder.SaveableStateProvider(tab) {
                when (tab) {
                    TAB_CONFERENCES -> ConferencesTab()
                    TAB_MESSAGES -> com.munpro.app.ui.messages.MessagesTab()
                    TAB_NETWORK -> NetworkTab()
                    TAB_PROFILE -> ProfileTab()
                    else -> HomeTab()
                }
            }
            TabBar(tab, { tab = it }, Modifier.align(Alignment.BottomCenter))
        }
    }
}

private fun mutableStateOfTab(initial: String) = androidx.compose.runtime.mutableStateOf(initial)

/**
 * The floating glass bar (board 00): a 62 high capsule 20 from the edges, five tabs, the selected
 * one in a soft tinted pill. Glass is the translucent token over the content; Android has no
 * backdrop blur short of a library, so the colour carries it (the board's "solid fallback").
 */
@Composable
private fun TabBar(current: String, onSelect: (String) -> Unit, modifier: Modifier) {
    val c = palette
    val nav = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val daisUnread by com.munpro.app.AppGraph.messages.unread.collectAsStateWithLifecycle()
    val chatUnread by com.munpro.app.AppGraph.chats.unread.collectAsStateWithLifecycle()
    val unread = daisUnread + chatUnread
    val shape = androidx.compose.foundation.shape.RoundedCornerShape(com.munpro.app.ui.kit.Radius.tabBar)
    Row(
        modifier
            .padding(start = 20.dp, end = 20.dp, bottom = nav + 10.dp)
            .fillMaxWidth()
            .height(62.dp)
            .shadow(10.dp, shape, ambientColor = Color.Black.copy(alpha = 0.10f), spotColor = Color.Black.copy(alpha = 0.14f))
            .clip(shape)
            .background(c.tabBar)
            .border(Hairline, c.separator, shape)
            .padding(5.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TABS.forEach { t ->
            val on = t.key == current
            val color = if (on) c.tint else c.label
            val press = rememberPress()
            Column(
                Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .clip(androidx.compose.foundation.shape.RoundedCornerShape(26.dp))
                    .background(if (on) c.tintSoft else Color.Transparent)
                    .semantics { selected = on }
                    .tap(press, role = Role.Tab, label = if (t.key == TAB_MESSAGES && unread > 0) "${t.title}, $unread unread" else t.title) { onSelect(t.key) },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterVertically),
            ) {
                Box {
                    SfIcon(t.icon, color, size = 22.dp, filled = on)
                    if (t.key == TAB_MESSAGES && unread > 0) {
                        Box(
                            Modifier.align(Alignment.TopEnd).offset(x = 7.dp, y = (-4).dp).clip(CircleShape).background(c.red).padding(horizontal = 5.dp),
                            contentAlignment = Alignment.Center,
                        ) { Text(if (unread > 99) "99+" else "$unread", color = Color.White, fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 10.sp) }
                    }
                }
                Text(t.title, color = color, fontFamily = Inter, fontWeight = if (on) FontWeight.SemiBold else FontWeight.Medium, fontSize = 10.sp, maxLines = 1)
            }
        }
    }
}
