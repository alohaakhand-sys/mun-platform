package com.munpro.app.ui.kit

// AI help under a short live-session field (the web's AiAssistBar): "Suggest" offers a few short
// options from the committee context, "Improve" rewrites what was typed, "More" asks for fresh
// ones. Calls the site's /api/ai/session-assist (the provider chain and the 7-word clamp live on
// the server). Hidden when the app has no API_URL; a failure just shows a quiet line.

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.munpro.app.data.Api
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/** AiAssistContext: whatever the field is about. Empty values are left out. */
data class AiContext(
    val committee: String? = null,
    val country: String? = null,
    val phase: String? = null,
    val motionType: String? = null,
    val pointType: String? = null,
    val caucusTopic: String? = null,
    val agenda: String? = null,
    val subject: String? = null,
    val recentTopics: List<String> = emptyList(),
)

/**
 * [field] is one of the route's fields: motion_topic, point_note, caucus_topic, vote_label,
 * announcement_subject, dismiss_reason. [onPick] replaces the field's text with a suggestion.
 */
@Composable
fun AiAssist(field: String, text: String, context: AiContext, onPick: (String) -> Unit, modifier: Modifier = Modifier) {
    if (!Api.available) return
    val c = palette
    val scope = rememberCoroutineScope()
    val shown = remember { mutableStateListOf<String>() }
    val seen = remember { mutableStateListOf<String>() }
    var busy by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }

    fun ask(mode: String) = scope.launch {
        busy = true; failed = false
        val body = buildJsonObject {
            put("mode", mode); put("field", field)
            if (text.isNotBlank()) put("text", text.trim())
            put("context", buildJsonObject {
                context.committee?.takeIf { it.isNotBlank() }?.let { put("committee", it) }
                context.country?.takeIf { it.isNotBlank() }?.let { put("country", it) }
                context.phase?.takeIf { it.isNotBlank() }?.let { put("phase", it) }
                context.motionType?.takeIf { it.isNotBlank() }?.let { put("motionType", it) }
                context.pointType?.takeIf { it.isNotBlank() }?.let { put("pointType", it) }
                context.caucusTopic?.takeIf { it.isNotBlank() }?.let { put("caucusTopic", it) }
                context.agenda?.takeIf { it.isNotBlank() }?.let { put("agenda", it) }
                context.subject?.takeIf { it.isNotBlank() }?.let { put("subject", it) }
                if (context.recentTopics.isNotEmpty()) put("recentTopics", JsonArray(context.recentTopics.take(8).map { JsonPrimitive(it) }))
            })
            if (seen.isNotEmpty()) put("exclude", JsonArray(seen.takeLast(12).map { JsonPrimitive(it) }))
            com.munpro.app.data.AiScope.eventId?.let { put("eventId", it) }
        }
        val res = Api.call("/api/ai/session-assist", "POST", body.toString())
        val list = (res as? JsonObject)?.get("suggestions") as? JsonArray
        val got = list?.mapNotNull { runCatching { it.jsonPrimitive.content }.getOrNull()?.trim()?.takeIf(String::isNotEmpty) }.orEmpty()
        if (got.isEmpty()) failed = true
        shown.clear(); shown.addAll(got); seen.addAll(got)
        busy = false
    }

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Pill(if (busy) "Thinking…" else "✦ Suggest", { ask("suggest") }, enabled = !busy)
            if (text.isNotBlank()) Pill("Improve", { ask("improve") }, enabled = !busy)
            if (shown.isNotEmpty()) Pill("More", { ask("suggest") }, enabled = !busy)
        }
        shown.forEach { s ->
            Text(s, style = Type.subhead, color = c.tint, modifier = Modifier.fillMaxWidth().tap(rememberPress(), label = "Use: $s") { onPick(s); shown.clear() }.padding(vertical = 4.dp))
        }
        if (failed) Text("No suggestions right now.", style = Type.footnote, color = c.label3)
    }
}
