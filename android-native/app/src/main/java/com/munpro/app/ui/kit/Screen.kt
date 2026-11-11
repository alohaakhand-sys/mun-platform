package com.munpro.app.ui.kit

// The screen frame (redesign board 00): a pinned bar with circular glass buttons (back, actions)
// and a centred title + optional subtitle, a large title that collapses into the bar's 17 sp
// title once it scrolls away, the offline notice, pull to refresh, room for the floating tab bar,
// and an optional bottom dock (the live screen's "Raise Placard").

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

/** Back, or Today when there is nothing to go back to (a screen opened cold from a link). */
val LocalBack = staticCompositionLocalOf<() -> Unit> { {} }

private val BarHeight = 52.dp

@Composable
fun Screen(
    title: String? = null,
    overline: String? = null,
    /** The previous screen's name; shows the back button. */
    back: String? = null,
    /** A title that stays in the bar (e.g. "Apply"), independent of the large title. */
    navTitle: String? = null,
    /** A second line under the bar title ("Screens Model UN 2027", "Chair"). */
    navSubtitle: String? = null,
    navRight: (@Composable () -> Unit)? = null,
    /** Sits level with the large title on the right (e.g. the notifications button). */
    trailing: (@Composable () -> Unit)? = null,
    tabBar: Boolean = true,
    onRefresh: (suspend () -> Unit)? = null,
    /** The offline notice's wording for a live floor. */
    live: Boolean = false,
    /** When the offline copy on screen was saved, for the offline notice. */
    savedAt: Long? = null,
    gap: Dp = Space.section,
    /** Pinned under the scroll area (the live screen's "Raise Placard"). */
    bottomBar: (@Composable () -> Unit)? = null,
    overlay: (@Composable BoxScope.() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val c = palette
    val status = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val scroll = rememberScrollState()
    var titleBottom by remember { mutableIntStateOf(Int.MAX_VALUE) }
    val collapsed = title != null && scroll.value > titleBottom
    val hasBar = back != null || navTitle != null || navRight != null
    val topPad = status + (if (hasBar) BarHeight else 8.dp)

    val body: @Composable () -> Unit = {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(scroll)
                .imePadding()
                .padding(start = Space.gutter, end = Space.gutter, top = topPad + (if (hasBar) 2.dp else 0.dp))
                .padding(bottom = (if (tabBar) 96.dp else 32.dp) + navBottom + (if (bottomBar != null) 80.dp else 0.dp)),
            verticalArrangement = Arrangement.spacedBy(gap),
        ) {
            OfflineBanner(live = live, savedAt = savedAt)
            if (title != null) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .onGloballyPositioned { titleBottom = it.size.height / 2 },
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        if (overline != null) {
                            Text(overline.uppercase(), style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = c.label2)
                        }
                        Text(title, style = Type.largeTitle, color = c.label, modifier = Modifier.semantics { heading() })
                    }
                    trailing?.invoke()
                }
            }
            content()
        }
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(c.bg),
    ) {
        if (onRefresh != null) {
            val scope = rememberCoroutineScope()
            var refreshing by remember { mutableStateOf(false) }
            val state = rememberPullToRefreshState()
            PullToRefreshBox(
                isRefreshing = refreshing,
                onRefresh = { scope.launch { refreshing = true; com.munpro.app.data.Refresh.bump(); try { onRefresh() } finally { refreshing = false } } },
                state = state,
                modifier = Modifier.fillMaxSize(),
                indicator = {
                    PullToRefreshDefaults.Indicator(
                        state = state, isRefreshing = refreshing, color = c.tint, containerColor = c.cell,
                        modifier = Modifier
                            .align(Alignment.TopCenter)
                            .padding(top = topPad),
                    )
                },
            ) { body() }
        } else {
            body()
        }

        // ---- the pinned bar ----
        Column(Modifier.fillMaxWidth()) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(status)
                    .background(c.bg),
            )
            if (hasBar || collapsed) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(BarHeight)
                        .background(c.bg),
                ) {
                    NavBarRow(back = back, title = navTitle ?: if (collapsed) title else null, right = navRight, subtitle = navSubtitle)
                }
                AnimatedVisibility(collapsed, enter = fadeIn(), exit = fadeOut()) {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .height(Hairline)
                            .background(c.separator),
                    )
                }
            }
        }

        if (bottomBar != null) {
            Column(
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .background(c.bg),
            ) {
                Box(
                    Modifier
                        .padding(horizontal = Space.gutter)
                        .padding(top = 10.dp, bottom = navBottom + 14.dp),
                ) { bottomBar() }
            }
        }
        overlay?.invoke(this)
    }
}

/** Inline navigation bar: a circular back button, an optional centred title (and second line),
 *  optional trailing actions. [back] names the previous screen for TalkBack. */
@Composable
fun NavBarRow(back: String?, title: String?, right: (@Composable () -> Unit)?, subtitle: String? = null) {
    val c = palette
    val goBack = LocalBack.current
    Row(
        Modifier
            .fillMaxSize()
            .padding(horizontal = Space.gutter),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
            if (back != null) RoundButton(Icons.back, "Back to $back", goBack)
        }
        if (title != null) {
            Column(Modifier.widthIn(max = 240.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(title, style = Type.headline, color = c.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (subtitle != null) Text(subtitle, style = Type.caption.copy(fontWeight = FontWeight.Normal, fontSize = 11.sp), color = c.label2, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) { right?.invoke() }
        }
    }
}

/** The circular glass button in a bar or beside a large title (back, bell, chat, ...), with an optional badge. */
@Composable
fun RoundButton(icon: SfIconSpec, label: String, onClick: () -> Unit, badge: Int = 0, dotOnly: Boolean = false) {
    val c = palette
    val press = rememberPress()
    val pressed by press.pressed
    Box(Modifier.size(36.dp)) {
        Box(
            Modifier
                .size(36.dp)
                .alpha(if (pressed) 0.6f else 1f)
                .shadow(if (c.dark) 0.dp else 1.dp, CircleShape, ambientColor = androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.08f), spotColor = androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.08f))
                .clip(CircleShape)
                .background(if (c.dark) c.fill else c.cell)
                .tap(press, label = if (badge > 0) "$label, $badge unread" else label, onClick = onClick)
                .semantics { contentDescription = if (badge > 0) "$label, $badge unread" else label },
            contentAlignment = Alignment.Center,
        ) {
            SfIcon(icon, c.label, size = 19.dp)
        }
        if (badge > 0) {
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = 3.dp, y = (-3).dp)
                    .clip(CircleShape)
                    .background(c.bg)
                    .padding(2.dp),
            ) {
                Box(
                    Modifier
                        .size(height = 14.dp, width = if (badge > 9) 20.dp else 14.dp)
                        .clip(CircleShape)
                        .background(c.red),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        if (badge > 9) "9+" else "$badge", color = androidx.compose.ui.graphics.Color.White,
                        style = Type.caption.copy(fontWeight = FontWeight.Bold, fontSize = 10.sp, lineHeight = 12.sp),
                    )
                }
            }
        }
    }
}
