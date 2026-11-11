package com.munpro.app.ui.network

// Someone else's profile (board A2.6–A2.10; web dashboard/profile/[uid] + PublicProfileView,
// SkillsSection, RecommendationsSection, RateRecommendDialogs). Connect, Rate, Endorse and
// Recommend are offered as the web offers them: rating, endorsing and recommending only when the
// server says you're eligible (connected, or you shared a conference). Message joins with direct
// messages (board A4). Photos and covers show as initials and the navy slab until the app loads
// images.

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.munpro.app.AppGraph
import com.munpro.app.data.writingAssist
import com.munpro.app.domain.DelegateResult
import com.munpro.app.domain.PublicProfile
import com.munpro.app.domain.Recommendation
import com.munpro.app.domain.SkillState
import com.munpro.app.domain.awardLabel
import com.munpro.app.nav.TAB_PROFILE
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.Capsule
import com.munpro.app.ui.kit.Chip
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Essay
import com.munpro.app.ui.kit.Field
import com.munpro.app.ui.kit.IconTile
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.Inter
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.Markdown
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.Notice
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SectionFooter
import com.munpro.app.ui.kit.SectionHeader
import com.munpro.app.ui.kit.Segmented
import com.munpro.app.ui.kit.SfIcon
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.Spinner
import com.munpro.app.ui.kit.SystemColors
import com.munpro.app.ui.kit.TextLink
import com.munpro.app.ui.kit.Tone
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.kit.personInitials
import com.munpro.app.ui.kit.rememberPress
import com.munpro.app.ui.kit.tap
import kotlinx.coroutines.async
import kotlinx.coroutines.launch

private const val RECOMMEND_MAX = 1000

/** Everything the screen reads about the person, loaded together. */
private data class Loaded(
    val p: PublicProfile,
    val connected: Boolean,
    val eligible: Boolean,
    val myRating: Int,
    val connections: Int?,
    val results: List<DelegateResult>,
    val received: List<Recommendation>,
    val given: List<Recommendation>,
    val skills: List<SkillState>,
    val contact: com.munpro.app.domain.UserContact?,
)

/** [preview]: your own profile as others see it (the editor's Preview), with no actions. */
@Composable
fun PublicProfileScreen(uid: String, preview: Boolean = false) {
    val nav = LocalNav.current
    val me = rememberMe()
    // Opened on yourself any other way: your profile is the Profile tab (the web sends you to Settings).
    LaunchedEffect(uid, me?.uid) { if (me?.uid == uid && !preview) nav.tab(TAB_PROFILE) }

    var state by remember(uid) { mutableStateOf<Loaded?>(null) }
    var missing by remember(uid) { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }
    LaunchedEffect(uid, me?.uid, reload) {
        val m = me ?: return@LaunchedEffect
        val people = AppGraph.people
        // Your own preview is always read fresh (you just edited it); others' from the phone's copy.
        val p = runCatching { people.profile(uid, force = reload > 0 || m.uid == uid) }.getOrNull()
        if (p == null) { missing = true; return@LaunchedEffect }
        val self = m.uid == uid
        kotlinx.coroutines.coroutineScope {
            val connected = async { !self && people.isConnected(m.uid, uid) }
            val eligible = async { !self && people.eligible(uid) }
            val rating = async { if (self) 0 else people.myRating(m.uid, uid) }
            val count = async { people.connectionCount(uid) }
            val results = async { AppGraph.content.getUserAchievements(uid) }
            val received = async { people.recommendationsTo(uid) }
            val given = async { people.recommendationsBy(uid) }
            val contact = async { people.contact(uid) }
            val el = eligible.await()
            val skills = async { people.skills(p, m.uid, el) }
            state = Loaded(p, connected.await(), el, rating.await(), count.await(), results.await(), received.await(), given.await(), skills.await(), contact.await())
        }
    }

    var rating by remember { mutableStateOf(false) }
    var recommending by remember { mutableStateOf(false) }
    val s = state
    Screen(back = "Back", tabBar = false, navTitle = s?.p?.name, gap = 16.dp, onRefresh = { reload++ }) {
        when {
            missing -> Empty("Profile not found", "This member doesn't exist, or their profile is private.", icon = Icons.profile)
            s == null -> Spinner()
            else -> {
                if (preview) com.munpro.app.ui.kit.Notice("Preview", "This is how other members see your profile.", tone = com.munpro.app.ui.kit.Tone.Info, icon = Icons.eye)
                Body(s, if (preview) null else me, onRate = { rating = true }, onRecommend = { recommending = true }, onChanged = { state = it })
            }
        }
    }
    if (s != null) {
        RateSheet(rating, s.p, s.myRating, { rating = false }) { stars ->
            // The web's optimistic roll-up: a new rating adds a rater, a change only moves the sum.
            val was = s.myRating
            val p = s.p
            state = s.copy(
                myRating = stars,
                p = p.copy(ratingSum = (p.ratingSum ?: 0.0) + (if (was == 0) stars else stars - was), ratingCount = (p.ratingCount ?: 0) + (if (was == 0) 1 else 0)),
            )
        }
        RecommendSheet(recommending, s.p) { recommending = false }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Body(s: Loaded, me: com.munpro.app.data.Me?, onRate: () -> Unit, onRecommend: () -> Unit, onChanged: (Loaded) -> Unit) {
    val c = palette
    val p = s.p
    val scope = rememberCoroutineScope()
    val nav = LocalNav.current
    val alerts = LocalAlerts.current
    var connecting by remember { mutableStateOf(false) }

    // ---- hero ----
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell)) {
        Box {
            Box(Modifier.fillMaxWidth().height(96.dp).background(SystemColors.navy)) {
                p.coverURL?.ifBlank { null }?.let { com.munpro.app.ui.kit.RemoteImage(it, Modifier.matchParentSize(), "Cover image") }
            }
            Box(Modifier.padding(start = 16.dp, top = 52.dp).size(88.dp).clip(CircleShape).background(c.cell).padding(4.dp)) {
                com.munpro.app.ui.kit.PersonAvatar(p.name, size = 80.dp, seed = p.id, photo = p.photoURL)
            }
        }
        Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(p.name, style = Type.title2, color = c.label, modifier = Modifier.weight(1f, fill = false))
                if (p.verifiedOrganizer == true) Box(Modifier.size(20.dp).clip(CircleShape).background(c.tint), contentAlignment = Alignment.Center) { SfIcon(Icons.check, c.onTint, size = 12.dp) }
            }
            p.headline?.ifBlank { null }?.let { Text(it, style = Type.subhead, color = c.label) }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Chip(p.roleLabel, Tone.Tint)
                if (p.ratingAvg > 0) Text("★ ${"%.1f".format(p.ratingAvg)} (${p.ratingCount})", style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = c.gold)
                listOf(p.city, p.country).filter { !it.isNullOrBlank() }.joinToString(", ").ifEmpty { null }?.let { Text(it, style = Type.footnote, color = c.label2) }
                p.nationality?.ifBlank { null }?.let { Text(it, style = Type.footnote, color = c.label2) }
            }
            p.institution?.ifBlank { null }?.let { Text(it, style = Type.footnote, color = c.label2) }
            if ((s.connections ?: 0) > 0) Text("${s.connections} connection${if (s.connections == 1) "" else "s"}", style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = c.label)
            if (me != null) Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Pill(
                    if (s.connected) "Connected" else if (connecting) "Connecting…" else "Connect",
                    {
                        val m = me ?: return@Pill
                        if (s.connected || connecting) return@Pill
                        connecting = true
                        scope.launch {
                            runCatching { AppGraph.people.connect(m, p) }
                                .onSuccess { onChanged(s.copy(connected = true, connections = s.connections?.plus(1))) }
                                .onFailure { alerts.show("Couldn't connect", "You can't connect with this member right now.") }
                            connecting = false
                        }
                    },
                    filled = !s.connected,
                )
                Pill("Message", { AppGraph.chats.directId(p.id)?.let { nav.go(com.munpro.app.nav.ChatRoute(it, p.id)) } })
                if (s.eligible) Pill(if (s.myRating > 0) "Update rating" else "Rate", onRate)
            }
        }
    }

    if (p.openToWork && !p.openToRoles.isNullOrBlank()) {
        Notice("Open to delegate & chair invitations", p.openToRoles, tone = Tone.Tint, icon = Icons.flag)
    }

    // ---- MUN stats: only when the owner opted in ----
    val stats = p.publicStats
    if (p.privacySettings?.showStats == true && stats != null) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            listOf((stats.conferences ?: 0) to "Conferences", (stats.blogs ?: 0) to "Blogs", (stats.awards ?: 0) to "Awards").forEach { (n, l) ->
                Column(Modifier.weight(1f).clip(RoundedCornerShape(22.dp)).background(c.cell).padding(14.dp)) {
                    Text("$n", fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 24.sp, color = c.label)
                    Text(l, style = Type.footnote, color = c.label2)
                }
            }
        }
    }

    // ---- about ----
    if (!p.bio.isNullOrBlank() || p.skills.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SectionHeader("About")
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (!p.bio.isNullOrBlank()) Markdown(p.bio) else Text("No bio yet.", style = Type.subhead, color = c.label2)
                if (p.skills.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    p.skills.take(8).forEach { Chip(it) }
                    if (p.skills.size > 8) Chip("+${p.skills.size - 8} more")
                }
            }
        }
    }

    // ---- experience ----
    if (p.experience.isNotEmpty()) Section(header = "MUN experience") {
        p.experience.forEach { ex ->
            cell(
                ex.roleTitle, inset = 70.dp,
                subtitle = listOfNotNull(
                    ex.org.ifBlank { null },
                    listOfNotNull(ex.startDate.ifBlank { null }, if (ex.current) "Present" else ex.endDate?.ifBlank { null }).joinToString(" – ").ifEmpty { null },
                    ex.location?.ifBlank { null },
                ).joinToString(" · "),
                leading = { LetterTile((ex.orgShort?.ifBlank { null } ?: ex.org).take(2).uppercase().ifEmpty { "?" }) },
            )
        }
    }

    // ---- honors: platform results (verified) and the member's own ----
    if (s.results.isNotEmpty() || p.awards.isNotEmpty()) Section(header = "Honors & awards") {
        s.results.forEach { r ->
            cell("${awardLabel(r.awardType)} — ${r.committeeName}", subtitle = "MUN result", inset = 58.dp,
                leading = { IconTile(SystemColors.gold, Icons.trophy) }, trailing = { Chip("Verified", Tone.Tint) })
        }
        p.awards.forEach { a ->
            cell(a.title, subtitle = listOfNotNull(a.issuer?.ifBlank { null }, a.date?.ifBlank { null }).joinToString(" · ").ifEmpty { null }, inset = 58.dp,
                leading = { IconTile(SystemColors.gold, Icons.trophy) })
        }
    }

    // ---- education ----
    if (p.education.isNotEmpty()) Section(header = "Education") {
        p.education.forEach { ed ->
            cell(
                ed.school, inset = 58.dp,
                subtitle = listOfNotNull(
                    listOfNotNull(ed.degree?.ifBlank { null }, ed.field?.ifBlank { null }).joinToString(", ").ifEmpty { null },
                    listOfNotNull(ed.startYear?.ifBlank { null }, ed.endYear?.ifBlank { null }).joinToString("–").ifEmpty { null },
                ).joinToString(" · "),
                leading = { IconTile(SystemColors.green, Icons.book) },
            )
        }
    }

    // ---- skills & endorsements ----
    if (s.skills.isNotEmpty()) Skills(s, onChanged)

    // ---- recommendations ----
    if (s.eligible || s.received.isNotEmpty() || s.given.isNotEmpty()) Recommendations(s, onRecommend)

    // ---- contact & social ----
    Contact(p, s.contact)
}

@Composable
private fun LetterTile(text: String) {
    val c = palette
    Box(Modifier.size(42.dp).clip(RoundedCornerShape(12.dp)).background(c.fillSoft), contentAlignment = Alignment.Center) {
        Text(text, fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = c.tint)
    }
}

@Composable
private fun Skills(s: Loaded, onChanged: (Loaded) -> Unit) {
    val scope = rememberCoroutineScope()
    val alerts = LocalAlerts.current
    var busy by remember { mutableStateOf<String?>(null) }
    Section(header = "Skills", footer = if (s.eligible) "Endorse the skills you've seen them use." else null) {
        s.skills.forEach { sk ->
            cell(
                sk.skill,
                subtitle = when {
                    sk.count == 0 -> "No endorsements yet"
                    sk.endorsers.isNotEmpty() -> "Endorsed by ${sk.count} · ${sk.endorsers.filter { it.isNotBlank() }.joinToString(", ") { it.substringBefore(" ") }}"
                    else -> "Endorsed by ${sk.count}"
                },
                chevron = false,
                trailing = if (!s.eligible) null else ({
                    Pill(if (busy == sk.slug) "…" else if (sk.mine) "Endorsed" else "Endorse", {
                        busy = sk.slug
                        scope.launch {
                            runCatching { AppGraph.people.endorse(s.p.id, sk.skill) }
                                .onSuccess { now ->
                                    val names = runCatching { AppGraph.people.skills(s.p.copy(skills = listOf(sk.skill)), null, false).firstOrNull()?.endorsers }.getOrNull() ?: sk.endorsers
                                    onChanged(s.copy(skills = s.skills.map { if (it.slug == sk.slug) it.copy(mine = now, count = maxOf(0, it.count + if (now) 1 else -1), endorsers = names) else it }))
                                }
                                .onFailure { alerts.show("Couldn't endorse", it.message) }
                            busy = null
                        }
                    }, filled = sk.mine, enabled = busy == null)
                }),
            )
        }
    }
}

@Composable
private fun Recommendations(s: Loaded, onRecommend: () -> Unit) {
    val c = palette
    var tab by remember { mutableStateOf("received") }
    val items = if (tab == "received") s.received else s.given
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth().padding(end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { SectionHeader("Recommendations") }
            if (s.eligible) Capsule("Recommend", onRecommend, filled = false)
        }
        Segmented(listOf("received" to "Received · ${s.received.size}", "given" to "Given · ${s.given.size}"), tab, { tab = it })
        if (items.isEmpty()) {
            Text(if (tab == "received") "No recommendations yet." else "Hasn't recommended anyone yet.", style = Type.subhead, color = c.label2, modifier = Modifier.padding(horizontal = 16.dp))
        } else items.forEach { r ->
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    com.munpro.app.ui.kit.PersonAvatar(r.authorName, size = 40.dp, seed = r.authorUid, photo = r.authorPhotoURL)
                    Column(Modifier.weight(1f)) {
                        Text(r.authorName.ifEmpty { "MUN Pilot member" }, style = Type.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = c.label)
                        (r.relationship?.ifBlank { null } ?: r.authorHeadline?.ifBlank { null })?.let { Text(it, style = Type.footnote, color = c.label2) }
                    }
                }
                Text(r.body, style = Type.subhead.copy(lineHeight = 21.sp), color = c.label)
            }
        }
    }
}

@Composable
private fun Contact(p: PublicProfile, contact: com.munpro.app.domain.UserContact?) {
    val context = LocalContext.current
    fun open(uri: String) { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(uri))) } }
    val ig = p.instagram?.trim()?.removePrefix("@")?.ifEmpty { null }
    val tt = p.tiktok?.trim()?.removePrefix("@")?.ifEmpty { null }
    val li = p.linkedin?.trim()?.ifEmpty { null }
    // Email and phone come from their private contact doc, only when they let you see it.
    val email = contact?.email?.ifBlank { null }
    val phone = contact?.phoneNumber?.ifBlank { null }
    if (email == null && phone == null && ig == null && tt == null && li == null) return
    Section(header = "Contact & social") {
        email?.let { e -> cell("Email", value = e, onClick = { open("mailto:$e") }) }
        phone?.let { ph -> cell("Phone", value = ph, onClick = { open("tel:$ph") }) }
        ig?.let { h -> cell("Instagram", value = "@$h", onClick = { open("https://instagram.com/$h") }) }
        li?.let { l -> cell("LinkedIn", value = l.replace(Regex("^https?://(www\\.)?linkedin\\.com/"), ""), onClick = { open(if (l.startsWith("http")) l else "https://$l") }) }
        tt?.let { h -> cell("TikTok", value = "@$h", onClick = { open("https://tiktok.com/@$h") }) }
    }
}

// ---- rate (A2.9) -------------------------------------------------------------------------------

@Composable
private fun RateSheet(visible: Boolean, p: PublicProfile, initial: Int, onClose: () -> Unit, onSaved: (Int) -> Unit) {
    val c = palette
    val scope = rememberCoroutineScope()
    var stars by remember(visible) { mutableIntStateOf(initial) }
    var busy by remember { mutableStateOf(false) }
    var error by remember(visible) { mutableStateOf<String?>(null) }
    val first = p.name.substringBefore(" ")
    PageSheet(visible, onClose) {
        SheetHeader("Rate $first", leading = "Cancel", onLeading = onClose)
        Column(Modifier.fillMaxWidth().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
            com.munpro.app.ui.kit.PersonAvatar(p.name, size = 72.dp, seed = p.id, photo = p.photoURL)
            Text("How was working with $first? Ratings roll up into their average; only the average is shown.", style = Type.subhead, color = c.label2, textAlign = TextAlign.Center)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                (1..5).forEach { i ->
                    val press = rememberPress()
                    Box(Modifier.size(48.dp).tap(press, label = "$i star${if (i > 1) "s" else ""}") { stars = i }, contentAlignment = Alignment.Center) {
                        Text(if (stars >= i) "★" else "☆", fontSize = 36.sp, color = if (stars >= i) c.gold else c.label3)
                    }
                }
            }
            Text(if (stars == 0) "Tap a star" else "$stars of 5", style = Type.headline, color = c.label)
            ErrorText(error, center = true)
            MunButton("Save Rating", {
                if (stars == 0) { error = "Pick a star rating first."; return@MunButton }
                busy = true
                error = null
                scope.launch {
                    runCatching { AppGraph.people.rate(p.id, stars) }
                        .onSuccess { onSaved(stars); onClose() }
                        .onFailure { error = it.message ?: "Could not save your rating." }
                    busy = false
                }
            }, loading = busy)
            SectionFooter("You can change yours any time.")
        }
    }
}

// ---- recommend (A2.10) -------------------------------------------------------------------------

@Composable
private fun RecommendSheet(visible: Boolean, p: PublicProfile, onClose: () -> Unit) {
    val c = palette
    val scope = rememberCoroutineScope()
    val alerts = LocalAlerts.current
    var relationship by remember(visible) { mutableStateOf("") }
    var body by remember(visible) { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var polishing by remember { mutableStateOf(false) }
    var error by remember(visible) { mutableStateOf<String?>(null) }
    val first = p.name.substringBefore(" ")

    fun send() {
        if (body.isBlank()) { error = "Write a short recommendation."; return }
        busy = true
        error = null
        scope.launch {
            runCatching { AppGraph.people.recommend(p.id, body.trim(), relationship.trim()) }
                .onSuccess { onClose(); alerts.show("Recommendation sent", "$first reviews it before it appears on their profile.") }
                .onFailure { error = it.message ?: "Could not send. Try again." }
            busy = false
        }
    }

    // The web's recommendation box only polishes (improve, grammar): it never writes for you.
    fun polish(action: String) {
        if (body.isBlank() || polishing) return
        polishing = true
        scope.launch {
            writingAssist(action, "recommendation", body, mapOf("recipientName" to p.name))?.let { body = it.take(RECOMMEND_MAX) }
            polishing = false
        }
    }

    PageSheet(visible, onClose) {
        SheetHeader("Recommend $first", leading = "Cancel", onLeading = onClose, trailing = "Send", onTrailing = ::send, trailingEnabled = body.isNotBlank() && !busy)
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Section(header = "How you know them", footer = "Optional, e.g. chaired alongside them at DUNMUN 2025.") {
                item { Field("Context", relationship, { relationship = it.take(140) }, "How you know them", labelWidth = 80.dp) }
            }
            Essay("Recommendation", body, { body = it }, "Write about your experience working with $first…", maxLength = RECOMMEND_MAX)
            if (com.munpro.app.data.Api.available) Row(horizontalArrangement = Arrangement.spacedBy(16.dp), modifier = Modifier.padding(horizontal = 16.dp)) {
                TextLink(if (polishing) "Working…" else "Improve", { polish("improve") }, style = Type.subhead.copy(fontWeight = FontWeight.SemiBold))
                TextLink("Fix grammar", { polish("grammar") }, style = Type.subhead.copy(fontWeight = FontWeight.SemiBold))
            }
            ErrorText(error)
            SectionFooter("$first approves it before it appears on their profile.")
        }
    }
}
