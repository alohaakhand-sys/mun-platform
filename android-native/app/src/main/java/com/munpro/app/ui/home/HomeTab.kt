package com.munpro.app.ui.home

// Home (board A1.1–A1.4; web app/dashboard/page.tsx + DashboardClient.tsx + ActivityFeed.tsx):
// a greeting, the three numbers, the conference to continue, recommended conferences, the
// platform's recent activity and, for anyone not organising yet, the organizer card. The web's
// "feed" is system events only (X applied to Y): nobody posts, likes or comments, so neither does
// this screen.

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.layout
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.data.Api
import com.munpro.app.data.AuthState
import com.munpro.app.data.rememberCached
import com.munpro.app.domain.Activity
import com.munpro.app.domain.ActivityScope
import com.munpro.app.domain.Conference
import com.munpro.app.domain.EventData
import com.munpro.app.domain.ago
import com.munpro.app.domain.calTile
import com.munpro.app.domain.committeeOf
import com.munpro.app.domain.countryName
import com.munpro.app.domain.findConference
import com.munpro.app.domain.formatLabel
import com.munpro.app.domain.fromPrice
import com.munpro.app.domain.getEventStartMs
import com.munpro.app.domain.isAllocated
import com.munpro.app.domain.nextSession
import com.munpro.app.domain.place
import com.munpro.app.domain.todayOverline
import com.munpro.app.domain.untilLabel
import com.munpro.app.domain.watchesOnly
import com.munpro.app.nav.AchievementsRoute
import com.munpro.app.nav.ActivityRoute
import com.munpro.app.nav.CONF_BROWSE
import com.munpro.app.nav.ConferenceRoute
import com.munpro.app.nav.EventRoute
import com.munpro.app.nav.NotificationsRoute
import com.munpro.app.nav.SearchRoute
import com.munpro.app.nav.TAB_CONFERENCES
import com.munpro.app.nav.TodayRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.Navigator
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.Chevron
import com.munpro.app.ui.kit.Chip
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.Flag
import com.munpro.app.ui.kit.Hairline
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.Inter
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.PersonAvatar
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.RoundButton
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.SectionHeader
import com.munpro.app.ui.kit.SfIcon
import com.munpro.app.ui.kit.SfIconSpec
import com.munpro.app.ui.kit.Spinner
import com.munpro.app.ui.kit.SystemColors
import com.munpro.app.ui.kit.TextLink
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.kit.rememberPress
import com.munpro.app.ui.kit.tap
import com.munpro.app.ui.profile.rememberAwards
import com.munpro.app.ui.tabs.LocalSelectTab
import com.munpro.app.ui.today.rememberSessionSeats
import kotlinx.serialization.builtins.ListSerializer
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/** How many rows Home shows; "See all" opens the full list. */
private const val HOME_ACTIVITY = 3L

@Composable
fun HomeTab() {
    val nav = LocalNav.current
    val selectTab = LocalSelectTab.current
    val auth by AppGraph.auth.state.collectAsStateWithLifecycle()
    val user = (auth as? AuthState.SignedIn)?.user
    val profile = (auth as? AuthState.SignedIn)?.profile
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()
    val unread by AppGraph.inbox.unread.collectAsStateWithLifecycle()
    val seats = rememberSessionSeats()

    val first = profile?.firstName?.ifBlank { null } ?: user?.displayName?.split(" ")?.firstOrNull()?.ifBlank { null } ?: "there"
    // "user" is the role every new account starts with; the web's fallback label for it is Delegate.
    val role = profile?.role?.ifBlank { null }?.takeUnless { it.equals("user", true) }?.replaceFirstChar { it.uppercase() } ?: "Delegate"

    Screen(
        title = "Hi, $first",
        overline = "$role · ${todayOverline()}",
        trailing = {
            Row(Modifier.padding(bottom = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RoundButton(Icons.search, "Search", { nav.go(SearchRoute) })
                RoundButton(Icons.bell, "Notifications", { nav.go(NotificationsRoute) }, badge = unread)
            }
        },
        savedAt = confs.savedAt,
        onRefresh = { AppGraph.conferences.reload() },
        gap = 20.dp,
    ) {
        val current = confs.current
        com.munpro.app.ui.live.CeremonyBanner(listOfNotNull(current?.event?.id?.takeIf { isAllocated(current) }) + seats.map { it.eventId })
        Stats(confs.conferences) { if (it) nav.go(AchievementsRoute) else selectTab(TAB_CONFERENCES) }
        if (current != null) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionHeader("Continue")
                ContinueCard(current) { nav.go(TodayRoute) }
            }
        }
        Recommended(user?.uid, confs.conferences, profile?.address?.country, nav)
        com.munpro.app.ui.blogs.HandbookStrip()
        RecentActivity(user?.uid, nav, confs.conferences)
        OrganizerCard(user?.uid, profile?.role, runsAnEvent = seats.any { it.organizerLevel })
    }
}

// ---- the three numbers ---------------------------------------------------------------------

@Composable
private fun Stats(list: List<Conference>?, onOpen: (awards: Boolean) -> Unit) {
    val awards = rememberAwards()
    val apps = list.orEmpty()
    // The web's counts: "past" is the application status; a paper is a URL or written content.
    val active = apps.count { it.app.status != "past" }
    val past = apps.count { it.app.status == "past" }
    val papers = apps.count { it.app.positionPaperUrl != null || it.app.positionPaperContent != null }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        StatTile(SystemColors.green, Icons.today, list?.size, "$active active · $past past", Modifier.weight(1f)) { onOpen(false) }
        StatTile(SystemColors.blue, Icons.doc, list?.let { papers }, if (papers == 1) "Position paper" else "Position papers", Modifier.weight(1f)) { onOpen(false) }
        StatTile(SystemColors.orange, Icons.trophy, awards?.size, if (awards?.size == 1) "Award" else "Awards", Modifier.weight(1f)) { onOpen(true) }
    }
}

@Composable
private fun StatTile(color: Color, icon: SfIconSpec, value: Int?, label: String, modifier: Modifier, onClick: () -> Unit) {
    val c = palette
    val press = rememberPress()
    Column(
        modifier
            .clip(RoundedCornerShape(22.dp))
            .background(c.cell)
            .tap(press, label = "${value ?: ""} $label", onClick = onClick)
            .padding(start = 14.dp, end = 14.dp, top = 14.dp, bottom = 12.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Box(Modifier.padding(bottom = 8.dp).size(30.dp).clip(RoundedCornerShape(9.dp)).background(color), contentAlignment = Alignment.Center) {
            SfIcon(icon, Color.White, size = 18.dp)
        }
        Text(value?.toString() ?: "–", fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 26.sp, letterSpacing = (-0.5).sp, color = c.label, style = Type.body.copy(fontFeatureSettings = "tnum"))
        Text(label, style = Type.caption.copy(fontWeight = FontWeight.Normal, fontSize = 12.5.sp, lineHeight = 16.sp), color = c.label2, maxLines = 2)
    }
}

// ---- continue --------------------------------------------------------------------------------

/** The navy card for the conference Today is about: the country, the committee, what's next. */
@Composable
private fun ContinueCard(conf: Conference, onClick: () -> Unit) {
    val press = rememberPress()
    val (app, event) = conf
    val committee = committeeOf(app)
    val allocated = isAllocated(conf)
    val next = nextSession(event)
    val now = System.currentTimeMillis()
    val muted = Color(0xFF9FB0BF)
    val title = when {
        allocated -> listOf(countryName(app.assignedCountry), committee).filter { it.isNotEmpty() }.joinToString(" · ")
        watchesOnly(conf) -> listOf(app.role.ifEmpty { "Observer" }, committee).filter { it.isNotEmpty() }.joinToString(" · ")
        else -> app.role.ifEmpty { "Application" }
    }
    val detail = when {
        !allocated && !watchesOnly(conf) -> "Under review"
        next == null -> "No sessions scheduled yet"
        next.start <= now -> "${next.item.title.ifEmpty { "Session" }} · happening now"
        else -> "${next.item.title.ifEmpty { "Session" }} · ${untilLabel(next.start, now).replaceFirstChar { it.lowercase() }}"
    }
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radius.cell))
            .background(SystemColors.navy)
            .tap(press, onClick = onClick)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (allocated) Box(Modifier.clip(RoundedCornerShape(6.dp))) { Flag(app.assignedCountry, width = 40.dp, height = 28.dp) }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(event.title.uppercase(), style = Type.caption.copy(fontSize = 11.sp, letterSpacing = 0.6.sp), color = muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(title, fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 19.sp, lineHeight = 24.sp, color = Color(0xFFEDF2F5), maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(detail, style = Type.footnote, color = muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Chevron(muted)
    }
}

// ---- recommended -----------------------------------------------------------------------------

@Composable
private fun Recommended(uid: String?, list: List<Conference>?, country: String?, nav: Navigator) {
    // Waits for the conference list, so a conference already applied to is never recommended.
    val recs = rememberCached(if (uid != null && list != null) "recommended:$uid" else null, ListSerializer(EventData.serializer()), maxAgeMs = com.munpro.app.data.Fresh.LONG) {
        AppGraph.home.recommended(list.orEmpty().map { it.event.id }.toSet(), country)
    }
    val applied = list.orEmpty().map { it.event.id }.toSet()
    val events = recs.data.orEmpty().filter { it.id !in applied }
    if (recs.has && events.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        HeaderWithLink("Recommended for you", "See all") { nav.tab(TAB_CONFERENCES, CONF_BROWSE) }
        if (!recs.has) Spinner()
        else Row(
            Modifier.bleed(16.dp).horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) { events.forEach { e -> RecommendedCard(e) { nav.go(EventRoute(e.id)) } } }
    }
}

@Composable
private fun RecommendedCard(e: EventData, onClick: () -> Unit) {
    val c = palette
    val press = rememberPress()
    val t = calTile(getEventStartMs(e))
    Column(
        Modifier
            .width(250.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(c.cell)
            .tap(press, onClick = onClick),
    ) {
        Row(
            Modifier.fillMaxWidth().height(96.dp).background(SystemColors.navy).padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                formatLabel(e), style = Type.caption, color = Color(0xFFEDF2F5),
                modifier = Modifier.clip(CircleShape).background(Color.White.copy(alpha = 0.14f)).padding(horizontal = 10.dp, vertical = 5.dp),
            )
            Column(
                Modifier.size(width = 44.dp, height = 48.dp).clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = 0.12f)),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
            ) {
                Text(t.month, fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 10.sp, letterSpacing = 0.6.sp, color = Color(0xFF8FD3B6))
                Text(t.day, fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 19.sp, lineHeight = 20.sp, color = Color(0xFFEDF2F5))
            }
        }
        Column(Modifier.padding(start = 14.dp, end = 14.dp, top = 12.dp, bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(e.title, style = Type.headline.copy(fontSize = 16.sp), color = c.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val n = e.committees.size
            Text(
                listOfNotNull(place(e).ifEmpty { null }, fromPrice(e)?.let { if (it == "Free") it else "from $it" }, if (n > 0) "$n committee${if (n == 1) "" else "s"}" else null).joinToString(" · "),
                style = Type.footnote, color = c.label2, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

// ---- recent activity ---------------------------------------------------------------------------

@Composable
private fun RecentActivity(uid: String?, nav: Navigator, list: List<Conference>?) {
    var scope by rememberSaveable { mutableStateOf(ActivityScope.All) }
    val items = rememberActivity(uid, scope, HOME_ACTIVITY)
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        HeaderWithLink("Recent activity", "See all") { nav.go(ActivityRoute) }
        FilterChips(ActivityScope.entries.map { it to it.label }, scope) { scope = it }
        ActivityList(items, uid, nav, list, scope)
    }
}

/** The activity stream in [scope], with Following resolved from the user's connections. */
@Composable
fun rememberActivity(uid: String?, scope: ActivityScope, limit: Long): List<Activity>? {
    val connections by AppGraph.home.connections.collectAsStateWithLifecycle()
    val following = connections?.filter { it.status == "active" }?.map { it.otherUid }
    // Following waits for the connections, so it never flashes "nothing yet".
    val ready = uid != null && (scope != ActivityScope.Following || following != null)
    val flow = remember(uid, scope, limit, following, ready) {
        if (!ready) kotlinx.coroutines.flow.flowOf(null) else AppGraph.home.activities(uid!!, scope, limit, following.orEmpty())
    }
    val items by flow.collectAsStateWithLifecycle(null)
    return items
}

@Composable
fun ActivityList(items: List<Activity>?, uid: String?, nav: Navigator, list: List<Conference>?, scope: ActivityScope) {
    when {
        items == null -> Spinner()
        items.isEmpty() -> Empty(
            "No activity yet",
            when (scope) {
                ActivityScope.Following -> "When people you're connected to apply to conferences, it shows here."
                ActivityScope.Mine -> "Apply to a conference to get started."
                ActivityScope.All -> "No recent activity yet. Apply to a conference to get started!"
            },
        )
        else -> ActivityGroup(items, uid, nav, list)
    }
}

@Composable
fun ActivityGroup(items: List<Activity>, uid: String?, nav: Navigator, list: List<Conference>?) {
    val c = palette
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell)) {
        items.forEachIndexed { i, a ->
            if (i > 0) Box(Modifier.padding(start = 64.dp).fillMaxWidth().height(Hairline).background(c.separator))
            ActivityRow(a, uid, activityRoute(a, list)?.let { r -> { nav.go(r) } })
        }
    }
}

/** ActivityFeed.handleActivityClick: application and paper events open that conference, a published event its page. */
private fun activityRoute(a: Activity, list: List<Conference>?): Any? {
    if (a.targetId.isEmpty()) return null
    return when {
        a.type.startsWith("application_") || a.type == "position_paper_submitted" || a.type == "marking_submitted" ->
            findConference(list, a.targetId)?.let { ConferenceRoute(it.app.id) } ?: EventRoute(a.targetId)
        a.type == "event_published" -> EventRoute(a.targetId)
        else -> null
    }
}

@Composable
private fun ActivityRow(a: Activity, uid: String?, onClick: (() -> Unit)?) {
    val c = palette
    val press = rememberPress()
    val mine = a.userId == uid
    Row(
        Modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.tap(press, onClick = onClick) else Modifier)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        PersonAvatar(a.actorName.ifEmpty { "?" }, seed = a.userId, photo = a.actorPhotoURL)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                buildAnnotatedString {
                    withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(if (mine) "You" else a.actorName.ifEmpty { "Someone" }) }
                    append(" ${a.action} ")
                    withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(a.targetTitle) }
                },
                style = Type.subhead.copy(lineHeight = 21.sp), color = c.label,
            )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (a.actorRole.isNotEmpty()) Chip(a.actorRole)
                Text(a.createdAt?.let { ago(it) } ?: "just now", style = Type.footnote, color = c.label2)
            }
        }
        if (onClick != null) Box(Modifier.align(Alignment.CenterVertically)) { Chevron(c.label3) }
    }
}

// ---- organizer card ----------------------------------------------------------------------------

/**
 * Anyone not organising yet: the web's promo card, hidden for organizer/admin accounts, co-organizers
 * and anyone who already owns an event ([runsAnEvent], from the session seats).
 */
@Composable
private fun OrganizerCard(uid: String?, role: String?, runsAnEvent: Boolean) {
    val c = palette
    val context = LocalContext.current
    val own = role.equals("organizer", true) || role.equals("admin", true) || runsAnEvent
    var coOrg by remember(uid) { mutableStateOf<Boolean?>(null) }
    LaunchedEffect(uid, own) { if (uid != null && !own) coOrg = AppGraph.home.coOrganizes(uid) }
    val nav = com.munpro.app.ui.LocalNav.current
    if (own || coOrg != false) return
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(SystemColors.navy), contentAlignment = Alignment.Center) {
                SfIcon(Icons.calPlus, Color.White, size = 20.dp)
            }
            Column(Modifier.weight(1f)) {
                Text("Become an organiser", style = Type.bodyMedium.copy(fontWeight = FontWeight.Bold), color = c.label)
                Text("Host your own Model UN conference: create events, manage delegates and run committees.", style = Type.footnote, color = c.label2)
            }
        }
        MunButton("Get started", { nav.go(com.munpro.app.nav.OrganizerHomeRoute) }, variant = ButtonVariant.Tinted, height = 44.dp)
    }
}

// ---- pieces shared by Home, Activity and Search -------------------------------------------------

/** A section label with a tinted link on the right ("Recommended for you · See all"). */
@Composable
fun HeaderWithLink(title: String, link: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(end = 16.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.weight(1f)) { SectionHeader(title) }
        TextLink(link, onClick, style = Type.subhead.copy(fontWeight = FontWeight.SemiBold, fontSize = 14.sp))
    }
}

/** The board's filter chips: outlined capsules, the selected one filled with the label colour. */
@Composable
fun <T> FilterChips(options: List<Pair<T, String>>, value: T, onChange: (T) -> Unit) {
    val c = palette
    Row(Modifier.bleed(16.dp).horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { (v, label) ->
            val on = v == value
            val press = rememberPress()
            Box(
                Modifier
                    .height(34.dp)
                    .clip(CircleShape)
                    .background(if (on) c.label else c.cell)
                    .then(if (on) Modifier else Modifier.border(Hairline * 2, c.separator, CircleShape))
                    .semantics { selected = on }
                    .tap(press, role = androidx.compose.ui.semantics.Role.Tab) { onChange(v) }
                    .padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center,
            ) { Text(label, style = Type.subhead.copy(fontWeight = FontWeight.SemiBold, fontSize = 14.sp), color = if (on) c.bg else c.label, maxLines = 1) }
        }
    }
}

/** Lets a horizontal strip run edge to edge past the screen's gutter. */
fun Modifier.bleed(by: Dp) = layout { measurable, constraints ->
    val px = by.roundToPx()
    val p = measurable.measure(constraints.copy(minWidth = constraints.minWidth + 2 * px, maxWidth = constraints.maxWidth + 2 * px))
    layout(p.width - 2 * px, p.height) { p.place(-px, 0) }
}

/** Today / This week / Earlier, for a list sorted newest first. */
fun <T> groupByAge(items: List<T>, at: (T) -> Long?): List<Pair<String, List<T>>> {
    val zone = ZoneId.systemDefault()
    val today = LocalDate.now(zone).atStartOfDay(zone).toInstant().toEpochMilli()
    val week = today - 6 * 86_400_000L
    val groups = items.groupBy { val t = at(it) ?: Instant.now().toEpochMilli(); when { t >= today -> "Today"; t >= week -> "This week"; else -> "Earlier" } }
    return listOf("Today", "This week", "Earlier").mapNotNull { k -> groups[k]?.let { k to it } }
}
