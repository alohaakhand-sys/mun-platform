package com.munpro.app.data

// The site's /api/ai/writing-assist (the web's AiTextareaAssist / editor toolbar). The server holds
// the provider chain and the per-surface action list (src/lib/ai/writingSurfaces.ts); a surface
// that doesn't allow an action is refused there. Null when the API is unset or nothing came back.

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/** [instruction] is the author's notes for "draft" (and "suggest"). */
/**
 * The event on screen (its route's eventId, or the live sitting's): AI used inside a Pro event
 * doesn't count against the daily quota (the site's aiQuota.ts).
 */
object AiScope {
    @Volatile var eventId: String? = null
}

suspend fun writingAssist(action: String, surface: String, text: String, context: Map<String, String> = emptyMap(), instruction: String? = null): String? {
    val res = Api.call(
        "/api/ai/writing-assist", "POST",
        buildJsonObject {
            put("action", action)
            put("surface", surface)
            put("text", text)
            AiScope.eventId?.let { put("eventId", it) }
            if (!instruction.isNullOrBlank()) put("instruction", instruction)
            putJsonObject("context") { context.forEach { (k, v) -> if (v.isNotEmpty()) put(k, v) } }
        }.toString(),
    )
    return runCatching { res?.jsonObject?.get("result")?.jsonPrimitive?.content }.getOrNull()?.ifBlank { null }
}
