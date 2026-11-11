package com.munpro.app.data.live

// The Agora token for a live sitting (port of src/lib/agora/token.ts). The site's
// /api/agora/token decides the role from the platform's own data, never from the client:
// publisher for the dais and for whoever is on `session.live.stage`, subscriber for the rest of
// the committee, 403 for outsiders. The token is minted for the Firebase uid as an Agora USER
// ACCOUNT (buildTokenWithUserAccount), the same identity the web's string uid is, so a phone and
// a browser meet in one channel.

import com.munpro.app.data.Api
import com.munpro.app.data.MunJson
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.put

@Serializable
data class VideoToken(
    val token: String = "",
    val channel: String = "",
    val appId: String = "",
    val uid: String = "",
    /** "publisher" | "subscriber" */
    val role: String = "subscriber",
    val observer: Boolean = false,
    val ttl: Int = 3600,
) {
    val publisher: Boolean get() = role == "publisher"
}

/** Committee sitting, or an event-wide ceremony room when [ceremony] is "opening" / "closing". */
suspend fun fetchVideoToken(eventId: String, committeeId: String, dateStr: String, ceremony: String? = null): VideoToken? {
    val body = buildJsonObject {
        put("eventId", eventId)
        if (ceremony != null) put("ceremony", ceremony) else { put("committeeId", committeeId); put("dateStr", dateStr) }
    }
    val res = Api.call("/api/agora/token", "POST", body.toString()) ?: return null
    return runCatching { MunJson.decodeFromJsonElement<VideoToken>(res) }.getOrNull()?.takeIf { it.token.isNotEmpty() }
}
