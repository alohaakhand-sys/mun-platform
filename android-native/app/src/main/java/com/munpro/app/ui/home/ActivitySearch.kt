package com.munpro.app.ui.home

// Activity, the full list (board A1.3; web ActivityFeed with "Load more" in tens), and Search
// (A1.4). The website has no global search: this one looks through the published conferences the
// Conferences tab already loads, the people you're connected to, and published blogs (the handbook
// the phone keeps, board A5). Searching every user would read the whole users collection.

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.domain.ActivityScope
import com.munpro.app.domain.getEventStartMs
import com.munpro.app.domain.fromPrice
import com.munpro.app.domain.place
import com.munpro.app.nav.EventRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.discover.DiscoverModel
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.Chip
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.IconTile
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.PersonAvatar
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.SearchField
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.Segmented
import com.munpro.app.ui.kit.Spinner
import com.munpro.app.ui.kit.SystemColors
import com.munpro.app.ui.kit.TextLink
import com.munpro.app.ui.kit.Tone
import com.munpro.app.ui.kit.Type
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private const val PAGE = 10L

@Composable
fun ActivityScreen() {
    val nav = LocalNav.current
    val uid = AppGraph.auth.user?.uid
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()
    var scope by rememberSaveable { mutableStateOf(ActivityScope.All) }
    var limit by rememberSaveable(scope) { mutableLongStateOf(PAGE) }
    val fresh = rememberActivity(uid, scope, limit)
    // The last answer stays on screen while the next page loads.
    var last by androidx.compose.runtime.remember(scope) { mutableStateOf<List<com.munpro.app.domain.Activity>?>(null) }
    LaunchedEffect(fresh) { if (fresh != null) last = fresh }
    val items = fresh ?: last

    Screen(title = "Activity", back = "Home", tabBar = false, gap = 16.dp) {
        Segmented(ActivityScope.entries.map { it to it.label }, scope, { scope = it })
        when {
            items == null -> Spinner()
            items.isEmpty() -> ActivityList(items, uid, nav, confs.conferences, scope)
            else -> {
                groupByAge(items) { it.createdAt }.forEach { (label, rows) ->
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        com.munpro.app.ui.kit.SectionHeader(label)
                        ActivityGroup(rows, uid, nav, confs.conferences)
                    }
                }
                if (items.size >= limit) MunButton("Load more", { limit += PAGE }, variant = ButtonVariant.Gray, height = 44.dp, loading = fresh == null)
            }
        }
    }
}

private enum class Kind(val label: String) { All("All"), Conferences("Conferences"), People("People"), Blogs("Blogs") }

@Composable
fun SearchScreen() {
    val nav = LocalNav.current
    var q by rememberSaveable { mutableStateOf("") }
    var kind by rememberSaveable { mutableStateOf(Kind.All) }
    val events by DiscoverModel.state.collectAsStateWithLifecycle()
    val connections by AppGraph.home.connections.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { DiscoverModel.ensure() }

    val term = q.trim().lowercase()
    val confHits = if (term.isEmpty()) emptyList() else events.events.orEmpty().filter { e ->
        (listOf(e.title, e.location, e.locationName.orEmpty()) + e.committees.map { it.name }).any { it.isNotEmpty() && it.lowercase().contains(term) }
    }.sortedBy { getEventStartMs(it)?.toDouble() ?: Double.POSITIVE_INFINITY }
    val peopleHits = if (term.isEmpty()) emptyList() else connections.orEmpty()
        .filter { it.status == "active" && it.displayName.lowercase().contains(term) }
        .sortedBy { it.displayName.lowercase() }
    val blogs = com.munpro.app.ui.blogs.rememberPublishedBlogs()
    val blogHits = if (term.isEmpty()) emptyList() else blogs.data.orEmpty().filter { a ->
        (listOf(a.title, a.excerpt.orEmpty(), a.authorName) + a.tags).any { it.lowercase().contains(term) }
    }
    fun shows(k: Kind) = kind == Kind.All || kind == k
    val day = DateTimeFormatter.ofPattern("d MMM", Locale.UK)

    Screen(tabBar = false, gap = 16.dp) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 4.dp)) {
            SearchField(q, { q = it }, Modifier.weight(1f), placeholder = "Conferences, people and blogs")
            TextLink("Cancel", { nav.back() })
        }
        FilterChips(Kind.entries.map { it to it.label }, kind) { kind = it }
        when {
            term.isEmpty() -> Empty("Search MUN Pilot", "Find conferences by name, city or committee, the people you're connected to, and blogs.", icon = Icons.search)
            events.events == null && connections == null -> Spinner()
            (shows(Kind.Conferences) && confHits.isNotEmpty()) || (shows(Kind.People) && peopleHits.isNotEmpty()) || (shows(Kind.Blogs) && blogHits.isNotEmpty()) -> {
                if (shows(Kind.Conferences) && confHits.isNotEmpty()) Section(header = "Conferences") {
                    confHits.forEach { e ->
                        val ms = getEventStartMs(e)
                        cell(
                            e.title,
                            subtitle = listOfNotNull(
                                ms?.let { Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()).format(day) },
                                place(e).ifEmpty { null },
                                fromPrice(e)?.let { if (it == "Free") it else "from $it" },
                            ).joinToString(" · "),
                            leading = { IconTile(SystemColors.navy, Icons.today) }, inset = 58.dp,
                            onClick = { nav.go(EventRoute(e.id)) },
                        )
                    }
                }
                if (shows(Kind.People) && peopleHits.isNotEmpty()) Section(header = "People", footer = "People you're connected to.") {
                    peopleHits.forEach { p ->
                        cell(
                            p.displayName, subtitle = com.munpro.app.domain.memberRole(p.role),
                            leading = { PersonAvatar(p.displayName, size = 44.dp, seed = p.otherUid, photo = p.photoURL) }, inset = 72.dp,
                            trailing = { Chip("Connected", Tone.Tint) },
                            onClick = { nav.go(com.munpro.app.nav.PublicProfileRoute(p.otherUid)) },
                        )
                    }
                }
                if (shows(Kind.Blogs) && blogHits.isNotEmpty()) Section(header = "Blogs") {
                    blogHits.forEach { a ->
                        cell(
                            a.title.ifEmpty { "Untitled" }, subtitle = listOf(a.category, a.authorName).filter { it.isNotEmpty() }.joinToString(" · "),
                            leading = { IconTile(com.munpro.app.ui.blogs.categoryColor(a.category), Icons.book) }, inset = 58.dp,
                            onClick = { nav.go(com.munpro.app.nav.BlogRoute(a.id)) },
                        )
                    }
                }
            }
            else -> Empty("No matches", "Try a city, a committee, part of a conference name, or a blog topic.")
        }
    }
}
