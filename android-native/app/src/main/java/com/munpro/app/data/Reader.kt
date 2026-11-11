package com.munpro.app.data

// The three long texts a delegate reads (an announcement, the rules, their study guide), fetched
// once and saved on the device (port of mobile/src/lib/reader.ts). Shared by the Reader, the
// conference home and Documents so all use the same saved copy and stay tappable offline.
// Plus the device-side "read" marks behind the Announcements unread dot (mockup: "as in Mail").

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.munpro.app.AppGraph
import com.munpro.app.domain.Announcement
import com.munpro.app.domain.ReaderDoc
import com.munpro.app.domain.readerMeta
import com.munpro.app.domain.sentAt
import com.munpro.app.domain.visibleTo
import kotlinx.coroutines.flow.map
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.SetSerializer
import kotlinx.serialization.builtins.nullable
import kotlinx.serialization.builtins.serializer

/** kind: "announcement" | "rules" | "guide" | "doc" (an approved committee paper) */
@Composable
fun rememberReaderDoc(kind: String, eventId: String?, id: String? = null, committee: String? = null, by: String? = null): Cached<ReaderDoc?> {
    val key = if (eventId != null && (kind != "guide" || !committee.isNullOrEmpty())) "reader:$kind:$eventId:${id ?: (if (kind == "guide") committee else null) ?: ""}" else null
    return rememberCached(key, ReaderDoc.serializer().nullable, maxAgeMs = Fresh.LONG) {
        val content = AppGraph.content
        when (kind) {
            "announcement" -> content.getAnnouncements(eventId!!).firstOrNull { it.id == id }?.let { a ->
                val t = sentAt(a)
                ReaderDoc(a.subject, if (t > 0) readerMeta(t) else null, a.body, by)
            }
            "doc" -> AppGraph.papers.committeeDoc(eventId!!, id.orEmpty())?.let { d ->
                ReaderDoc(
                    d.title.ifEmpty { com.munpro.app.domain.committeeDocTypeLabel(d.type) },
                    listOfNotNull(com.munpro.app.domain.committeeDocTypeLabel(d.type), d.sponsors.takeIf { it.isNotEmpty() }?.joinToString(", ") { com.munpro.app.domain.countryName(it) }).joinToString(" · "),
                    d.content,
                )
            }
            "rules" -> content.getRulesGuide(eventId!!)?.content?.takeIf { it.isNotBlank() }?.let { ReaderDoc("Rules of procedure", null, it) }
            else -> content.getStudyGuide(eventId!!, committee.orEmpty())?.content?.takeIf { it.isNotBlank() }?.let { ReaderDoc("Study guide", committee, it) }
        }
    }
}

/** Announcements this delegate may see, saved on the device (the list screen and the home count). */
@Composable
fun rememberAnnouncements(eventId: String?, role: String?): Cached<List<Announcement>> =
    rememberCached(eventId?.let { "announcements:$it:${role.orEmpty()}" }, ListSerializer(Announcement.serializer()), maxAgeMs = Fresh.SHORT) {
        visibleTo(AppGraph.content.getAnnouncements(eventId!!), role.orEmpty())
    }

private fun readKey(eventId: String) = "munpro.read.ann:$eventId"
private val idSet = SetSerializer(String.serializer())

/** Ids of announcements opened on this phone (Mail's unread dot). Zero reads, zero writes. */
@Composable
fun rememberReadAnnouncements(eventId: String?): Set<String> {
    var ids by remember(eventId) { mutableStateOf<Set<String>>(emptySet()) }
    LaunchedEffect(eventId) {
        if (eventId == null) return@LaunchedEffect
        AppGraph.saved.string(readKey(eventId)).map { raw -> raw?.let { runCatching { MunJson.decodeFromString(idSet, it) }.getOrNull() } ?: emptySet() }
            .collect { ids = it }
    }
    return ids
}

suspend fun markAnnouncementRead(eventId: String, id: String) {
    val cur = AppGraph.saved.getString(readKey(eventId))?.let { runCatching { MunJson.decodeFromString(idSet, it) }.getOrNull() } ?: emptySet()
    if (id in cur) return
    AppGraph.saved.putString(readKey(eventId), MunJson.encodeToString(idSet, cur + id))
}
