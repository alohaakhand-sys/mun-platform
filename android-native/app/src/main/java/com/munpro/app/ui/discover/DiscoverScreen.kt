package com.munpro.app.ui.discover

// Discover, the Conferences tab's Browse (board B1.3; RN app/(tabs)/discover.tsx + the mockup's
// search state): a large title, search, filters (Upcoming / Online / In person / Free / Past, over
// the events already loaded) and one list with Calendar-style date tiles. Conferences you've
// applied to are marked, as on the web's Browse. Searching matches the conference, its committees
// and its city; a committee match is named on the row, and recent searches stay one tap away.

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import com.munpro.app.ui.kit.tap
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.domain.EventData
import com.munpro.app.domain.calTile
import com.munpro.app.domain.fromPrice
import com.munpro.app.domain.getEventStartMs
import com.munpro.app.domain.place
import com.munpro.app.nav.EventRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.Inter
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.SearchField
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.Segmented
import com.munpro.app.ui.kit.Spinner
import com.munpro.app.ui.kit.TextLink
import com.munpro.app.ui.kit.palette
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer

// Same read cap as the web homepage (Spark plan budget).
private const val READ_CAP = 40L
private const val RECENTS = "munpro.recentSearches"

/** Loaded once per app run (the RN tab stayed mounted), refreshed by pulling down. */
object DiscoverModel {
    data class State(val events: List<EventData>? = null, val failed: Boolean = false)

    private val _state = MutableStateFlow(State())
    val state = _state.asStateFlow()

    /** [force]: pull-to-refresh; otherwise a copy saved in the last few hours is used without a read. */
    suspend fun load(force: Boolean = true) {
        _state.value = _state.value.copy(failed = false)
        try {
            val list = AppGraph.saved.cached("publishedEvents", kotlinx.serialization.builtins.ListSerializer(EventData.serializer()), com.munpro.app.data.Fresh.LONG, force) {
                AppGraph.events.getPublishedEvents(READ_CAP)
            }
            _state.value = State(list, false)
        } catch (_: Exception) {
            _state.value = State(_state.value.events ?: emptyList(), true)
        }
    }

    suspend fun ensure() {
        if (_state.value.events == null) load(force = false)
    }
}

private val recentSerializer = ListSerializer(String.serializer())

/** [title] and [header] let the Conferences tab host it as its Browse half (board A1). */
@Composable
fun DiscoverScreen(title: String = "Discover", header: @Composable () -> Unit = {}) {
    val c = palette
    val nav = LocalNav.current
    val focus = LocalFocusManager.current
    val state by DiscoverModel.state.collectAsStateWithLifecycle()
    var q by rememberSaveable { mutableStateOf("") }
    var whenTab by rememberSaveable { mutableStateOf("upcoming") }
    var searching by remember { mutableStateOf(false) }
    var recents by remember { mutableStateOf<List<String>>(emptyList()) }

    LaunchedEffect(Unit) {
        DiscoverModel.ensure()
        recents = AppGraph.saved.getString(RECENTS)?.let { runCatching { com.munpro.app.data.MunJson.decodeFromString(recentSerializer, it) }.getOrNull() } ?: emptyList()
    }

    fun remember(term: String) {
        val t = term.trim()
        if (t.isEmpty()) return
        recents = (listOf(t) + recents.filter { !it.equals(t, ignoreCase = true) }).take(6)
        AppGraph.scope.launch { AppGraph.saved.putString(RECENTS, com.munpro.app.data.MunJson.encodeToString(recentSerializer, recents)) }
    }

    val term = q.trim().lowercase()
    val today = LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()
    // Any application counts, as on the web's Browse (hasApplied).
    val applied = confs.conferences.orEmpty().map { it.event.id }.toSet()
    val list = (state.events ?: emptyList())
        .filter { e ->
            val ms = getEventStartMs(e)
            val upcoming = ms == null || ms >= today
            when (whenTab) {
                "past" -> !upcoming
                "online" -> upcoming && (e.format == "online" || e.format == "hybrid")
                "inperson" -> upcoming && e.format != "online"
                "free" -> upcoming && fromPrice(e) == "Free"
                else -> upcoming
            }
        }
        .filter { e ->
            term.isEmpty() || (listOf(e.title, e.location, e.locationName.orEmpty()) + e.committees.map { it.name })
                .filter { it.isNotEmpty() }.any { it.lowercase().contains(term) }
        }
        .sortedBy { (if (whenTab == "upcoming") 1 else -1) * (getEventStartMs(it)?.toDouble() ?: Double.POSITIVE_INFINITY) }

    Screen(title = title, onRefresh = { DiscoverModel.load() }, gap = 20.dp) {
        header()
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 0.dp)) {
            SearchField(
                q, { q = it },
                Modifier
                    .weight(1f)
                    .onFocusChanged { searching = it.isFocused || q.isNotEmpty() },
                onSubmit = { remember(q) },
            )
            if (searching) TextLink("Cancel", { q = ""; searching = false; focus.clearFocus() })
        }

        if (searching && q.isEmpty() && recents.isNotEmpty()) {
            Section(header = "Recent") {
                recents.forEach { r -> cell(r, onClick = { q = r }, chevron = false, tinted = true) }
            }
            return@Screen
        }

        if (term.isEmpty()) {
            com.munpro.app.ui.home.FilterChips(listOf("upcoming" to "Upcoming", "online" to "Online", "inperson" to "In person", "free" to "Free", "past" to "Past"), whenTab) { whenTab = it }
        }

        when {
            state.events == null -> Spinner()
            state.failed && state.events.isNullOrEmpty() -> Empty("Conferences didn't load", "Check your connection, then pull down to try again.")
            list.isEmpty() -> Empty(
                if (q.isNotEmpty()) "No matches" else if (whenTab == "past") "No past conferences" else "Nothing open right now",
                if (q.isNotEmpty()) "Try a city, a committee or part of the conference name." else "New conferences appear here as organisers publish them.",
            )
            // Browsing: the board's conference cards. Searching: compact rows that name the hit.
            term.isEmpty() -> list.forEach { e -> EventCard(e, e.id in applied) { nav.go(EventRoute(e.id)) } }
            else -> Section(header = "Conferences") {
                list.forEach { e ->
                    val t = calTile(getEventStartMs(e))
                    // A search that hit a committee says which one, like the mockup's result rows.
                    val hit = if (term.isEmpty()) null else e.committees.firstOrNull { it.name.lowercase().contains(term) }
                    val subtitle = if (hit != null) "${hit.name} · ${hit.capacity ?: hit.countries.size} seats"
                    else listOfNotNull(place(e), fromPrice(e)).joinToString(" · ")
                    cell(
                        title = e.title,
                        subtitle = subtitle,
                        inset = 70.dp,
                        onClick = { if (term.isNotEmpty()) remember(q); nav.go(EventRoute(e.id)) },
                        leading = { DateTile(t.month, t.day) },
                        trailing = if (e.id in applied) ({ com.munpro.app.ui.kit.Chip("Applied", com.munpro.app.ui.kit.Tone.Tint) }) else null,
                    )
                }
            }
        }
    }
}

/** A conference as a card: the navy hero (format, date badge, title) over its date and terms. */
@Composable
private fun EventCard(e: EventData, applied: Boolean, onClick: () -> Unit) {
    val c = palette
    val press = com.munpro.app.ui.kit.rememberPress()
    val ms = getEventStartMs(e)
    val t = calTile(ms)
    val timeline = com.munpro.app.domain.getApplicationTimeline(e)
    val closes = timeline.closeAt?.let { java.time.Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("d MMMM", java.util.Locale.UK)) }
    val fee = fromPrice(e)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(com.munpro.app.ui.kit.Radius.cell))
            .background(c.cell)
            .tap(press, onClick = onClick),
    ) {
        Box(Modifier.fillMaxWidth().height(126.dp).background(c.pass).padding(14.dp)) {
            Text(
                com.munpro.app.domain.formatLabel(e), style = com.munpro.app.ui.kit.Type.caption.copy(fontSize = 11.sp), color = Color.White,
                modifier = Modifier.align(Alignment.TopStart).clip(androidx.compose.foundation.shape.CircleShape).background(Color.White.copy(alpha = 0.16f)).padding(horizontal = 9.dp, vertical = 4.dp),
            )
            Column(
                Modifier.align(Alignment.TopEnd).clip(androidx.compose.foundation.shape.RoundedCornerShape(10.dp)).background(Color.White.copy(alpha = 0.12f)).padding(horizontal = 9.dp, vertical = 4.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(t.month, fontFamily = Inter, fontWeight = FontWeight.SemiBold, fontSize = 9.sp, color = Color.White.copy(alpha = 0.7f))
                Text(t.day, fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 18.sp, color = Color.White, lineHeight = 20.sp)
            }
            if (applied) Text(
                "Applied", style = com.munpro.app.ui.kit.Type.caption.copy(fontSize = 11.sp), color = c.onTint,
                modifier = Modifier.align(Alignment.TopStart).padding(start = 0.dp, top = 30.dp).clip(androidx.compose.foundation.shape.CircleShape).background(c.tint).padding(horizontal = 9.dp, vertical = 4.dp),
            )
            Text(e.title, style = com.munpro.app.ui.kit.Type.title2.copy(fontSize = 20.sp, lineHeight = 24.sp), color = Color.White, maxLines = 2, modifier = Modifier.align(Alignment.BottomStart))
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(com.munpro.app.domain.whenText(ms, e.date), style = com.munpro.app.ui.kit.Type.bodyMedium, color = c.label, maxLines = 1)
                Text(
                    listOfNotNull(place(e).takeIf { e.format != "online" }, fee?.let { "$it for delegates" }, closes?.takeIf { timeline.isOpen }?.let { "applications close $it" }).joinToString(" · "),
                    style = com.munpro.app.ui.kit.Type.footnote, color = c.label2, maxLines = 2,
                )
            }
            com.munpro.app.ui.kit.Chevron(c.label3)
        }
    }
}

@Composable
fun DateTile(month: String, day: String) {
    val c = palette
    Column(Modifier.width(42.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(month, fontFamily = Inter, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, color = c.red, letterSpacing = 0.3.sp)
        Text(day, fontFamily = Inter, fontWeight = FontWeight.Normal, fontSize = 23.sp, color = c.label, letterSpacing = (-0.8).sp, modifier = Modifier.padding(top = 1.dp))
    }
}
