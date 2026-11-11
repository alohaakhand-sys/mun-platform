package com.munpro.app.ui.blogs

// Blogs, the delegate handbook (board A5; web app/blogs, app/blogs/[articleId], dashboard/articles,
// ArticleEditor). Read: the list with categories, a reader set in serif with tags and the author
// linked to their profile, and the discussion. Write: My blogs (Published / Drafts), a focused
// markdown editor with a formatting bar and AI on selected text, and publish settings in a sheet.
// The unsent draft is kept on the phone while you write; the server only sees Publish or Save
// as Draft, as on the web. Data: BlogRepo.

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.munpro.app.AppGraph
import com.munpro.app.data.Api
import com.munpro.app.data.ArticleDraft
import com.munpro.app.data.BLOGS_PUBLISHED
import com.munpro.app.data.BlogRepo
import com.munpro.app.data.Fresh
import com.munpro.app.data.blogCommentsKey
import com.munpro.app.data.blogKey
import com.munpro.app.data.blogsMineKey
import com.munpro.app.data.prepareImage
import com.munpro.app.data.rememberCached
import com.munpro.app.data.writingAssist
import com.munpro.app.domain.Article
import com.munpro.app.domain.ArticleComment
import com.munpro.app.domain.BLOG_CATEGORIES
import com.munpro.app.domain.MyArticle
import com.munpro.app.domain.longDate
import com.munpro.app.domain.parseTags
import com.munpro.app.domain.readingMinutes
import com.munpro.app.domain.shortWhen
import com.munpro.app.domain.wordCount
import com.munpro.app.nav.BlogEditorRoute
import com.munpro.app.nav.BlogRoute
import com.munpro.app.nav.MyBlogsRoute
import com.munpro.app.nav.PublicProfileRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Hairline
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.LocalBack
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.PersonAvatar
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.PlainInput
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.RemoteImage
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.SearchField
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SectionHeader
import com.munpro.app.ui.kit.Segmented
import com.munpro.app.ui.kit.SfIcon
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.Space
import com.munpro.app.ui.kit.Spinner
import com.munpro.app.ui.kit.SystemColors
import com.munpro.app.ui.kit.TextLink
import com.munpro.app.ui.kit.Tone
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.kit.rememberPress
import com.munpro.app.ui.kit.tap
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

// ---------------------------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------------------------

/** Each category keeps its colour everywhere (the web's CATEGORY_META). */
fun categoryColor(category: String): Color = when (category) {
    "Analysis" -> SystemColors.purple
    "Tips" -> SystemColors.green
    "News" -> SystemColors.orange
    else -> SystemColors.blue
}

@Composable
fun CategoryChip(category: String) {
    val col = categoryColor(category)
    Text(
        category, style = Type.caption, color = col,
        modifier = Modifier.clip(CircleShape).background(col.copy(alpha = 0.13f)).padding(horizontal = 9.dp, vertical = 3.dp),
    )
}

/** The cover, or the subject word on the category's colour (web ArticleCard's placard). */
@Composable
private fun Placard(a: Article, modifier: Modifier, big: Boolean) {
    val col = categoryColor(a.category)
    Box(modifier.background(col.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
        val cover = a.coverImage?.ifBlank { null }
        if (cover != null) RemoteImage(cover, Modifier.fillMaxSize())
        else Text(
            a.subject, color = col, maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center,
            style = if (big) Type.title2.copy(fontFamily = FontFamily.Serif) else Type.caption,
            modifier = Modifier.padding(8.dp),
        )
    }
}

/** Published blogs, cache-first (also feeds Home's strip and Search). */
@Composable
fun rememberPublishedBlogs() = rememberCached(BLOGS_PUBLISHED, BlogRepo.listSerializer, Fresh.LONG) { AppGraph.blogs.published() }

private fun byline(a: Article) = listOfNotNull(
    a.authorName.ifEmpty { null },
    "${readingMinutes(a.content)} min read",
    a.createdAt?.let(::shortWhen),
).joinToString(" · ")

// ---------------------------------------------------------------------------------------------
// A5.1 · Blogs
// ---------------------------------------------------------------------------------------------

@Composable
fun BlogsScreen() {
    val c = palette
    val nav = LocalNav.current
    val list = rememberPublishedBlogs()
    var q by rememberSaveable { mutableStateOf("") }
    var cat by rememberSaveable { mutableStateOf("All") }
    val all = list.data.orEmpty()
    val shown = all.filter { a ->
        (cat == "All" || a.category == cat) &&
            (q.isBlank() || listOf(a.title, a.excerpt.orEmpty(), a.authorName, a.tags.joinToString(" ")).any { it.contains(q.trim(), ignoreCase = true) })
    }

    Screen(
        back = "Back", title = "Blogs", tabBar = false, savedAt = list.savedAt,
        trailing = { TextLink("My blogs", { nav.go(MyBlogsRoute) }, style = Type.body.copy(fontWeight = FontWeight.SemiBold)) },
    ) {
        Text("Delegate handbook" + if (list.has) " · ${all.size} article${if (all.size == 1) "" else "s"}" else "", style = Type.subhead, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp))
        SearchField(q, { q = it }, placeholder = "Search blogs")
        Segmented((listOf("All") + BLOG_CATEGORIES).map { it to it }, cat, { cat = it })
        when {
            !list.has -> if (list.failed) ErrorText("Couldn't load the handbook. Pull to try again.") else Spinner()
            shown.isEmpty() -> Empty(
                "No articles found",
                when {
                    q.isNotBlank() -> "Nothing matches “${q.trim()}”."
                    cat == "All" -> "The handbook is still being written. Check back soon."
                    else -> "Nothing filed under “$cat” yet. Try another category."
                },
                icon = Icons.book,
            )
            else -> {
                FeaturedCard(shown.first()) { nav.go(BlogRoute(shown.first().id)) }
                if (shown.size > 1) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell)) {
                    shown.drop(1).forEachIndexed { i, a ->
                        if (i > 0) Box(Modifier.padding(start = 92.dp).fillMaxWidth().height(Hairline).background(c.separator))
                        BlogRow(a) { nav.go(BlogRoute(a.id)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun FeaturedCard(a: Article, onClick: () -> Unit) {
    val c = palette
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).tap(rememberPress(), label = a.title, onClick = onClick)) {
        Placard(a, Modifier.fillMaxWidth().aspectRatio(16f / 9f), big = true)
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            CategoryChip(a.category)
            Text(a.title.ifEmpty { "Untitled" }, style = Type.title2.copy(fontFamily = FontFamily.Serif, letterSpacing = 0.sp), color = c.label)
            a.excerpt?.ifBlank { null }?.let { Text(it, style = Type.subhead, color = c.label2, maxLines = 2, overflow = TextOverflow.Ellipsis) }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PersonAvatar(a.authorName, size = 24.dp, seed = a.authorId)
                Text(byline(a), style = Type.footnote, color = c.label2, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun BlogRow(a: Article, onClick: () -> Unit) {
    val c = palette
    Row(
        Modifier.fillMaxWidth().tap(rememberPress(), label = a.title, onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically,
    ) {
        Placard(a, Modifier.size(62.dp).clip(RoundedCornerShape(14.dp)), big = false)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(a.category.uppercase(), style = Type.caption.copy(fontSize = 11.sp, letterSpacing = 0.5.sp), color = categoryColor(a.category))
            Text(a.title.ifEmpty { "Untitled" }, style = Type.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = c.label, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(byline(a), style = Type.footnote, color = c.label2, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Home's "From the handbook": the newest three (the web homepage strip). */
@Composable
fun HandbookStrip() {
    val c = palette
    val nav = LocalNav.current
    val list = rememberPublishedBlogs()
    val top = list.data.orEmpty().take(3)
    if (top.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { SectionHeader("From the handbook") }
            TextLink("See all", { nav.go(com.munpro.app.nav.BlogsRoute) }, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold))
        }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell)) {
            top.forEachIndexed { i, a ->
                if (i > 0) Box(Modifier.padding(start = 92.dp).fillMaxWidth().height(Hairline).background(c.separator))
                BlogRow(a) { nav.go(BlogRoute(a.id)) }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// A5.2 · Reading, A5.3 · Discussion
// ---------------------------------------------------------------------------------------------

private const val TEXT_SCALE = "blog.textScale"
private val SCALES = listOf(1f, 1.15f, 0.9f)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BlogReaderScreen(id: String) {
    val c = palette
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val me = AppGraph.auth.user?.uid
    val doc = rememberCached(blogKey(id), Article.serializer(), Fresh.LONG) { AppGraph.blogs.article(id) ?: throw NoSuchElementException() }
    var scale by remember { mutableFloatStateOf(1f) }
    LaunchedEffect(Unit) { AppGraph.saved.getString(TEXT_SCALE)?.toFloatOrNull()?.let { scale = it } }
    val a = doc.data

    Screen(
        back = "Blogs", tabBar = false, savedAt = doc.savedAt,
        navRight = {
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                if (a != null && a.authorId == me) TextLink("Edit", { nav.go(BlogEditorRoute(id)) }, style = Type.body.copy(fontWeight = FontWeight.SemiBold))
                TextLink("Aa", {
                    scale = SCALES[(SCALES.indexOf(scale).coerceAtLeast(0) + 1) % SCALES.size]
                    scope.launch { AppGraph.saved.putString(TEXT_SCALE, scale.toString()) }
                }, style = Type.body.copy(fontWeight = FontWeight.SemiBold))
            }
        },
    ) {
        if (a == null) {
            if (doc.failed) Empty("This article isn't here", "It may have been deleted, or you're offline.", icon = Icons.book) else Spinner()
            return@Screen
        }
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                CategoryChip(a.category)
                if (!a.published) Text("Draft", style = Type.caption, color = c.label2, modifier = Modifier.clip(CircleShape).background(c.fill).padding(horizontal = 9.dp, vertical = 3.dp))
                a.tags.forEach { Text("#$it", style = Type.footnote, color = c.label2, modifier = Modifier.padding(vertical = 2.dp)) }
            }
            Text(a.title, style = Type.title.copy(fontFamily = FontFamily.Serif, fontSize = (28 * scale).sp, lineHeight = (34 * scale).sp, letterSpacing = 0.sp), color = c.label)
            Row(
                Modifier.tap(rememberPress(), label = "About ${a.authorName}") { nav.go(PublicProfileRoute(a.authorId)) },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                val author by produceState<com.munpro.app.domain.PublicProfile?>(null, a.authorId) { value = AppGraph.people.profile(a.authorId) }
                PersonAvatar(a.authorName, size = 38.dp, seed = a.authorId, photo = author?.photoURL)
                Column {
                    Text(a.authorName.ifEmpty { "MUN Pilot member" }, style = Type.subhead.copy(fontWeight = FontWeight.SemiBold), color = c.tint)
                    Text(listOfNotNull(a.createdAt?.let { longDate(java.time.Instant.ofEpochMilli(it).atZone(java.time.ZoneId.systemDefault()).toLocalDate()) }, "${readingMinutes(a.content)} min read").joinToString(" · "),
                        style = Type.footnote, color = c.label2)
                }
            }
        }
        a.coverImage?.ifBlank { null }?.let { RemoteImage(it, Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(Radius.cell)), "Cover") }
        com.munpro.app.ui.kit.Markdown(a.content, serif = true, scale = scale)
        if (a.published) Discussion(a)
    }
}

@Composable
private fun Discussion(a: Article) {
    val c = palette
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val loaded = rememberCached(blogCommentsKey(a.id), BlogRepo.commentsSerializer, Fresh.SHORT) { AppGraph.blogs.comments(a.id) }
    val added = remember { mutableStateListOf<ArticleComment>() }
    val comments = loaded.data.orEmpty() + added.filter { n -> loaded.data.orEmpty().none { it.id == n.id } }
    var text by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var helping by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Box(Modifier.fillMaxWidth().height(Hairline).background(c.separator))
    Row(verticalAlignment = Alignment.Bottom) {
        Text("Discussion", style = Type.title2, color = c.label, modifier = Modifier.weight(1f))
        Text("${comments.size} comment${if (comments.size == 1) "" else "s"}", style = Type.footnote, color = c.label2)
    }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        PlainInput(
            text, { text = it }, "Join the discussion…", singleLine = false, minLines = 3, maxLength = 2000,
            modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            if (Api.available) TextLink(if (helping) "Writing…" else if (text.isBlank()) "Help me write" else "Improve with AI", {
                if (helping) return@TextLink
                helping = true
                scope.launch {
                    writingAssist(if (text.isBlank()) "suggest" else "improve", "blog-comment", text, mapOf("title" to a.title))?.let { text = it }
                    helping = false
                }
            }, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold))
            Spacer(Modifier.weight(1f))
            Pill(if (busy) "Posting…" else "Post", {
                val me = AppGraph.chats.me() ?: return@Pill
                busy = true
                error = null
                scope.launch {
                    runCatching { AppGraph.blogs.addComment(a.id, me.uid, me.name, me.photo, text.trim()) }
                        .onSuccess { added += it; text = "" }
                        .onFailure { error = "That didn't post. Check your connection and try again." }
                    busy = false
                }
            }, filled = true, enabled = text.isNotBlank() && !busy)
        }
        ErrorText(error, Modifier.padding(horizontal = 0.dp))
    }
    if (comments.isEmpty()) {
        if (loaded.has) Text("No comments yet. Be the first.", style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp))
    } else Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell)) {
        comments.forEachIndexed { i, cm ->
            if (i > 0) Box(Modifier.padding(start = 64.dp).fillMaxWidth().height(Hairline).background(c.separator))
            Row(Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.tap(rememberPress(), label = "About ${cm.authorName}") { nav.go(PublicProfileRoute(cm.authorId)) }) {
                    PersonAvatar(cm.authorName, size = 36.dp, seed = cm.authorId, photo = cm.authorPhotoURL)
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(cm.authorName.ifEmpty { "Member" } + if (cm.authorId == a.authorId) " · Author" else "",
                            style = Type.subhead.copy(fontWeight = FontWeight.SemiBold), color = c.label, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(cm.createdAt?.let(::shortWhen) ?: "just now", style = Type.caption.copy(fontWeight = FontWeight.Normal), color = c.label2)
                    }
                    Text(cm.text, style = Type.subhead, color = c.label)
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// A5.4 · My blogs, A5.8 · Delete
// ---------------------------------------------------------------------------------------------

@Composable
fun MyBlogsScreen() {
    val c = palette
    val nav = LocalNav.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val uid = AppGraph.auth.user?.uid
    val mine = rememberCached(uid?.let(::blogsMineKey), BlogRepo.mineSerializer, Fresh.SHORT) { AppGraph.blogs.mine(uid!!) }
    val gone = remember { mutableStateListOf<String>() }
    val all = mine.data.orEmpty().filter { it.article.id !in gone }
    val (published, drafts) = all.partition { it.article.published }
    var tab by rememberSaveable { mutableStateOf("published") }
    val shown = if (tab == "published") published else drafts

    Screen(
        back = "Blogs", title = "My blogs", tabBar = false, savedAt = mine.savedAt,
        trailing = { com.munpro.app.ui.kit.RoundButton(Icons.compose, "Write", { nav.go(BlogEditorRoute()) }) },
    ) {
        if (mine.has) Text("${all.size} blog${if (all.size == 1) "" else "s"} · ${published.size} published", style = Type.subhead, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp))
        Segmented(listOf("published" to "Published · ${published.size}", "drafts" to "Drafts · ${drafts.size}"), tab, { tab = it })
        when {
            !mine.has -> if (mine.failed) ErrorText("Couldn't load your blogs. Pull to try again.") else Spinner()
            shown.isEmpty() -> Empty(
                if (tab == "published") "Nothing published yet" else "No drafts",
                if (tab == "published") "Write about procedure, research or your first conference. Anyone can publish." else "Save a blog as a draft to finish it later.",
                action = { MunButton("Write a blog", { nav.go(BlogEditorRoute()) }, height = 44.dp) },
                icon = Icons.pen,
            )
            else -> shown.forEach { m ->
                MyBlogCard(m, onEdit = { nav.go(BlogEditorRoute(m.article.id)) }, onView = { nav.go(BlogRoute(m.article.id)) }) {
                    scope.launch {
                        val n = m.comments
                        val also = if (n > 0) " Its $n comment${if (n == 1) "" else "s"} will no longer be shown." else ""
                        if (!alerts.confirm("Delete this blog?", "“${m.article.title.ifEmpty { "Untitled" }}” will be removed for good.$also", "Delete", destructive = true)) return@launch
                        runCatching { AppGraph.blogs.delete(m.article.id, m.article.authorId) }
                            .onSuccess { gone += m.article.id }
                            .onFailure { alerts.show("Couldn't delete", "Check your connection and try again.") }
                    }
                }
            }
        }
    }
}

@Composable
private fun MyBlogCard(m: MyArticle, onEdit: () -> Unit, onView: () -> Unit, onDelete: () -> Unit) {
    val c = palette
    val a = m.article
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CategoryChip(a.category)
            if (!a.published) Text("Draft", style = Type.caption, color = c.label2, modifier = Modifier.clip(CircleShape).background(c.fill).padding(horizontal = 9.dp, vertical = 3.dp))
        }
        Text(a.title.ifEmpty { "Untitled" }, style = Type.headline, color = c.label, maxLines = 2, overflow = TextOverflow.Ellipsis)
        a.excerpt?.ifBlank { null }?.let { Text(it, style = Type.subhead, color = c.label2, maxLines = 2, overflow = TextOverflow.Ellipsis) }
        Text(
            listOfNotNull(
                "${readingMinutes(a.content)} min read",
                a.createdAt?.let { (if (a.published) "published " else "started ") + shortWhen(it) },
                if (a.published) "${m.comments} comment${if (m.comments == 1) "" else "s"}" else null,
            ).joinToString(" · "),
            style = Type.footnote, color = c.label2,
        )
        Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Pill("Edit", onEdit, modifier = Modifier.weight(1f))
            Pill("View", onView, tone = Tone.Neutral, modifier = Modifier.weight(1f))
            Pill("Delete", onDelete, tone = Tone.Destructive)
        }
    }
}

// ---------------------------------------------------------------------------------------------
// A5.5 · Writing, A5.6 · AI on selected text, A5.7 · Publish settings
// ---------------------------------------------------------------------------------------------

/** The editor's state, kept on the phone while writing (never on the server until you save). */
@Serializable
private data class LocalDraft(
    val title: String = "",
    val excerpt: String = "",
    val content: String = "",
    val category: String = "Guide",
    val tags: String = "",
    val cover: String = "",
    val savedAt: Long = 0,
)

private fun draftKey(id: String) = "blog.draft:${id.ifEmpty { "new" }}"

@Composable
fun BlogEditorScreen(id: String) {
    val c = palette
    val nav = LocalNav.current
    val goBack = LocalBack.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val status = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val imeBottom = WindowInsets.ime.asPaddingValues().calculateBottomPadding()

    var original by remember { mutableStateOf<LocalDraft?>(null) }
    var server by remember { mutableStateOf<Article?>(null) }
    var title by remember { mutableStateOf("") }
    var excerpt by remember { mutableStateOf("") }
    var body by remember { mutableStateOf(TextFieldValue("")) }
    var category by remember { mutableStateOf("Guide") }
    var tags by remember { mutableStateOf("") }
    var cover by remember { mutableStateOf("") }
    var restored by remember { mutableStateOf(false) }
    var keptAt by remember { mutableStateOf<Long?>(null) }
    var settings by remember { mutableStateOf(false) }
    var aiMenu by remember { mutableStateOf(false) }
    var aiBusy by remember { mutableStateOf<String?>(null) }
    var undo by remember { mutableStateOf<TextFieldValue?>(null) }
    var drafting by remember { mutableStateOf(false) }
    var excerptBusy by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf(false) }

    // Load: my article (if editing), and any newer copy this phone kept while I was writing.
    LaunchedEffect(id) {
        val art = if (id.isEmpty()) null else runCatching { AppGraph.blogs.article(id) }.getOrNull()
        if (id.isNotEmpty() && art == null) { loadError = true; return@LaunchedEffect }
        server = art
        val base = art?.let { LocalDraft(it.title, it.excerpt.orEmpty(), it.content, it.category, it.tags.joinToString(", "), it.coverImage.orEmpty()) } ?: LocalDraft()
        original = base
        val local = AppGraph.saved.read(draftKey(id), LocalDraft.serializer())
        val use = if (local != null && local.savedAt > (art?.updatedAt ?: 0L) && local.copy(savedAt = 0) != base) { restored = true; keptAt = local.savedAt; local } else base
        title = use.title; excerpt = use.excerpt; body = TextFieldValue(use.content); category = use.category; tags = use.tags; cover = use.cover
    }
    val current = LocalDraft(title, excerpt, body.text, category, tags, cover)
    val dirty = original != null && current != original

    // Keep the work on the phone a moment after each change.
    LaunchedEffect(current) {
        if (original == null || !dirty) return@LaunchedEffect
        delay(700)
        val now = System.currentTimeMillis()
        AppGraph.saved.write(draftKey(id), LocalDraft.serializer(), current.copy(savedAt = now))
        keptAt = now
    }

    fun close() {
        scope.launch {
            if (dirty && !alerts.confirm("Discard changes?", "What you wrote since the last save will be lost.", "Discard", destructive = true)) return@launch
            AppGraph.saved.remove(draftKey(id))
            goBack()
        }
    }

    val sel = body.selection
    val selected = if (sel.collapsed) "" else body.text.substring(sel.min, sel.max)

    fun runOnSelection(action: String) {
        if (selected.isBlank() || aiBusy != null) return
        aiBusy = action
        val (s, e) = sel.min to sel.max
        scope.launch {
            val out = writingAssist(action, "blog-article", selected, mapOf("title" to title))
            if (out == null) alerts.show("AI couldn't help this time", "Try again in a moment.")
            else {
                undo = body
                val t = body.text.replaceRange(s, e, out)
                body = TextFieldValue(t, TextRange(s + out.length))
            }
            aiBusy = null
        }
    }

    fun runWhole(action: String, instruction: String? = null) {
        if (aiBusy != null) return
        aiBusy = action
        scope.launch {
            val out = writingAssist(action, "blog-article", body.text, mapOf("title" to title), instruction = instruction)
            if (out == null) alerts.show("AI couldn't help this time", "Try again in a moment.")
            else {
                undo = body
                val t = when (action) {
                    "continue" -> body.text.trimEnd() + "\n\n" + out
                    "draft" -> if (body.text.isBlank()) out else body.text.trimEnd() + "\n\n" + out
                    else -> out
                }
                body = TextFieldValue(t, TextRange(t.length))
            }
            aiBusy = null
        }
    }

    Column(Modifier.fillMaxSize().background(c.bg)) {
        Spacer(Modifier.height(status))
        Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = Space.gutter), verticalAlignment = Alignment.CenterVertically) {
            TextLink("Cancel", ::close)
            Text(
                when {
                    server?.published == true && !dirty -> "Published"
                    keptAt != null && dirty -> "Draft · saved on phone"
                    id.isEmpty() -> "New blog"
                    else -> "Draft"
                },
                style = Type.footnote, color = c.label2, textAlign = TextAlign.Center, modifier = Modifier.weight(1f),
            )
            Pill("Next", { settings = true }, filled = true, enabled = title.isNotBlank() && body.text.isNotBlank())
        }
        Box(Modifier.fillMaxWidth().height(Hairline).background(c.separator))

        if (loadError) {
            Empty("Couldn't open this blog", "It may have been deleted, or you're offline.", icon = Icons.book)
            return@Column
        }

        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = Space.gutter, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (restored) Text("Restored what you were writing on this phone.", style = Type.footnote, color = c.tint)
            PlainInput(
                title, { title = it }, "Title", style = Type.title.copy(fontFamily = FontFamily.Serif, letterSpacing = 0.sp), singleLine = false, maxLength = 160,
                modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            )
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.field)).background(c.cell).padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                PlainInput(
                    excerpt, { excerpt = it.take(200) }, "Excerpt: a short summary for the list", style = Type.subhead, singleLine = false, maxLength = 200,
                    modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (Api.available) TextLink(if (excerptBusy) "Writing…" else if (excerpt.isBlank()) "Suggest with AI" else "Improve with AI", {
                        if (excerptBusy) return@TextLink
                        excerptBusy = true
                        scope.launch {
                            writingAssist(if (excerpt.isBlank()) "suggest" else "improve", "blog-excerpt", excerpt, mapOf("title" to title))?.let { excerpt = it.take(200) }
                            excerptBusy = false
                        }
                    }, style = Type.caption)
                    Spacer(Modifier.weight(1f))
                    Text("Excerpt ${excerpt.length} / 200", style = Type.caption.copy(fontWeight = FontWeight.Normal), color = if (excerpt.length > 180) c.orange else c.label2)
                }
            }
            BasicTextField(
                body, { body = it },
                textStyle = Type.body.copy(fontFamily = FontFamily.Serif, fontSize = 17.sp, lineHeight = 27.sp, letterSpacing = 0.sp, color = c.label),
                cursorBrush = SolidColor(c.tint),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                modifier = Modifier.fillMaxWidth().heightIn(min = 280.dp),
                decorationBox = { inner ->
                    Box {
                        if (body.text.isEmpty()) Text("Start writing… Markdown works: **bold**, _italic_, ## headings, - lists.", style = Type.body.copy(fontFamily = FontFamily.Serif, fontSize = 17.sp, letterSpacing = 0.sp), color = c.label3)
                        inner()
                    }
                },
            )
        }

        // The bar: formatting, or AI on the selection; words and undo.
        Column(Modifier.fillMaxWidth().background(c.cell).padding(bottom = if (imeBottom > 0.dp) 0.dp else navBottom)) {
            Box(Modifier.fillMaxWidth().height(Hairline).background(c.separator))
            if (selected.isNotBlank() && Api.available) {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    SfIcon(Icons.sparkle, c.tint, size = 18.dp)
                    listOf("improve" to "Improve", "shorten" to "Shorten", "expand" to "Expand", "grammar" to "Fix grammar").forEach { (k, label) ->
                        Pill(if (aiBusy == k) "…" else label, { runOnSelection(k) }, enabled = aiBusy == null)
                    }
                }
            } else {
                Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    FormatKey("B", "Bold", Type.headline) { body = wrap(body, "**") }
                    FormatKey("I", "Italic", Type.headline.copy(fontStyle = FontStyle.Italic, fontFamily = FontFamily.Serif)) { body = wrap(body, "_") }
                    FormatKey("H", "Heading", Type.headline) { body = prefixLine(body, "## ") }
                    FormatKey("•", "Bulleted list", Type.headline) { body = prefixLine(body, "- ") }
                    FormatKey("1.", "Numbered list", Type.subhead.copy(fontWeight = FontWeight.SemiBold)) { body = prefixLine(body, "1. ") }
                    if (Api.available) FormatKey(if (aiBusy != null) "…" else "AI", "Writing help", Type.subhead.copy(fontWeight = FontWeight.Bold), tint = true) { aiMenu = true }
                    Spacer(Modifier.weight(1f))
                    if (undo != null) TextLink("Undo AI", { body = undo!!; undo = null }, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), modifier = Modifier.padding(end = 10.dp))
                    Text("${wordCount(body.text)} words", style = Type.caption.copy(fontWeight = FontWeight.Normal), color = c.label2, modifier = Modifier.padding(end = 8.dp))
                }
            }
        }
    }

    com.munpro.app.ui.kit.ActionSheet(aiMenu, { aiMenu = false }, title = "Writing help", message = "Select text to improve, shorten, expand or fix just that part.") {
        com.munpro.app.ui.kit.SheetRow("Continue writing", { aiMenu = false; runWhole("continue") }, enabled = body.text.isNotBlank(), icon = Icons.pen)
        com.munpro.app.ui.kit.SheetRow("Draft from notes…", { aiMenu = false; drafting = true }, icon = Icons.sparkle)
        com.munpro.app.ui.kit.SheetRow("Improve the whole post", { aiMenu = false; runWhole("improve") }, enabled = body.text.isNotBlank(), icon = Icons.sparkle)
        com.munpro.app.ui.kit.SheetRow("Fix grammar everywhere", { aiMenu = false; runWhole("grammar") }, enabled = body.text.isNotBlank(), icon = Icons.check)
    }
    DraftNotesSheet(drafting, { drafting = false }) { notes -> runWhole("draft", notes) }
    PublishSheet(
        settings, { settings = false },
        category = category, onCategory = { category = it },
        tags = tags, onTags = { tags = it },
        cover = cover, onCover = { cover = it },
        wasPublished = server?.published == true,
    ) { publish ->
        val me = AppGraph.chats.me() ?: return@PublishSheet "You're signed out."
        if (title.isBlank()) return@PublishSheet "Title is required."
        if (body.text.isBlank()) return@PublishSheet "Content cannot be empty."
        runCatching {
            AppGraph.blogs.save(
                id.ifEmpty { null },
                ArticleDraft(title, body.text, excerpt, category, parseTags(tags), cover),
                publish, server?.authorId ?: me.uid, server?.authorName?.ifEmpty { null } ?: me.name,
            )
        }.fold(
            onSuccess = { savedId ->
                AppGraph.saved.remove(draftKey(id))
                settings = false
                goBack()
                if (publish) nav.go(BlogRoute(savedId))
                null
            },
            onFailure = { "Failed to save. Please try again." },
        )
    }
}

@Composable
internal fun FormatKey(text: String, label: String, style: androidx.compose.ui.text.TextStyle, tint: Boolean = false, onClick: () -> Unit) {
    val c = palette
    Box(
        Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(if (tint) c.tintSoft else Color.Transparent).tap(rememberPress(), label = label, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(text, style = style, color = if (tint) c.tint else c.label) }
}

/** **bold** / _italic_ around the selection, or a pair to type into. */
internal fun wrap(v: TextFieldValue, mark: String): TextFieldValue {
    val (s, e) = v.selection.min to v.selection.max
    val t = v.text.substring(0, s) + mark + v.text.substring(s, e) + mark + v.text.substring(e)
    return TextFieldValue(t, if (s == e) TextRange(s + mark.length) else TextRange(s + mark.length, e + mark.length))
}

/** Toggles a line prefix ("## ", "- ", "1. ") on the line the cursor is in. */
internal fun prefixLine(v: TextFieldValue, prefix: String): TextFieldValue {
    val s = v.selection.min
    val start = v.text.lastIndexOf('\n', (s - 1).coerceAtLeast(0)).let { if (it < 0 || s == 0) 0 else it + 1 }
    val line = v.text.substring(start)
    return if (line.startsWith(prefix)) TextFieldValue(v.text.removeRange(start, start + prefix.length), TextRange((s - prefix.length).coerceAtLeast(start)))
    else TextFieldValue(v.text.substring(0, start) + prefix + v.text.substring(start), TextRange(s + prefix.length))
}

@Composable
internal fun DraftNotesSheet(visible: Boolean, onClose: () -> Unit, onDraft: (String) -> Unit) {
    val c = palette
    var notes by remember(visible) { mutableStateOf("") }
    PageSheet(visible, onClose) {
        SheetHeader("Draft from notes", leading = "Cancel", onLeading = onClose, trailing = "Draft", trailingEnabled = notes.isNotBlank(), onTrailing = { onClose(); onDraft(notes.trim()) })
        Column(Modifier.padding(Space.gutter), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(14.dp)) {
                PlainInput(notes, { notes = it }, "What should it cover? A topic, points, your angle.", singleLine = false, minLines = 5, maxLength = 1000, modifier = Modifier.fillMaxWidth())
            }
            Text("The draft is added below what you've written. Read it through before you publish.", style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PublishSheet(
    visible: Boolean, onClose: () -> Unit,
    category: String, onCategory: (String) -> Unit,
    tags: String, onTags: (String) -> Unit,
    cover: String, onCover: (String) -> Unit,
    wasPublished: Boolean,
    save: suspend (publish: Boolean) -> String?,
) {
    val c = palette
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    var busy by remember { mutableStateOf<String?>(null) }
    var error by remember(visible) { mutableStateOf<String?>(null) }
    var uploading by remember { mutableStateOf(false) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        uploading = true
        error = null
        scope.launch {
            runCatching { Api.uploadImage(prepareImage(context, uri, 1600)) }
                .onSuccess(onCover)
                .onFailure { error = it.message ?: "Upload failed. Try another image." }
            uploading = false
        }
    }
    fun go(publish: Boolean) {
        busy = if (publish) "publish" else "draft"
        error = null
        scope.launch { error = save(publish); busy = null }
    }

    PageSheet(visible, onClose) {
        SheetHeader("Publish", leading = "Back", onLeading = onClose)
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 8.dp, bottom = navBottom + 24.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Box(
                Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(Radius.cell)).background(c.cell)
                    .tap(rememberPress(), label = "Cover image") { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                contentAlignment = Alignment.Center,
            ) {
                if (cover.isNotBlank()) RemoteImage(cover, Modifier.fillMaxSize(), "Cover image")
                else Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    SfIcon(Icons.camera, c.tint, size = 28.dp)
                    Text(if (uploading) "Uploading…" else "Add a cover image", style = Type.subhead.copy(fontWeight = FontWeight.SemiBold), color = c.tint)
                    Text("JPG or PNG · 16:9 works best", style = Type.footnote, color = c.label2)
                }
                if (cover.isNotBlank()) Row(Modifier.align(Alignment.BottomEnd).padding(10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Pill(if (uploading) "Uploading…" else "Change", { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, filled = true)
                    Pill("Remove", { onCover("") }, filled = true, tone = Tone.Neutral)
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionHeader("Category")
                Segmented(BLOG_CATEGORIES.map { it to it }, category, onCategory)
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionHeader("Tags")
                Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.field)).background(c.cell).padding(14.dp)) {
                    PlainInput(tags, onTags, "e.g. UNSC, diplomacy, guide", modifier = Modifier.fillMaxWidth())
                }
                val list = parseTags(tags)
                if (list.isNotEmpty()) FlowRow(Modifier.padding(horizontal = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    list.forEach { Text("#$it", style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = c.tint, modifier = Modifier.clip(CircleShape).background(c.tintSoft).padding(horizontal = 10.dp, vertical = 4.dp)) }
                }
                Text("Separate tags with commas. The first one names the post when there's no cover.", style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp))
            }
            ErrorText(error)
            MunButton(if (wasPublished) "Update Blog" else "Publish Blog", { go(true) }, loading = busy == "publish", enabled = busy == null && !uploading)
            MunButton(if (wasPublished) "Unpublish to Drafts" else "Save as Draft", { go(false) }, variant = ButtonVariant.Tinted, loading = busy == "draft", enabled = busy == null && !uploading)
        }
    }
}
