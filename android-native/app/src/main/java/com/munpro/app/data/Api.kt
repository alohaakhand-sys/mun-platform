package com.munpro.app.data

// Calls to the web app's API routes (port of mobile/src/lib/api.ts). Protected routes take the
// Firebase ID token as a Bearer header (the web's `requireUid`), which works without cookies.
//
// API_URL is the deployed site (mobile/.env EXPO_PUBLIC_API_URL or local.properties API_URL).
// While it is unset every call resolves to null, and callers treat that as "not available": the
// app keeps working, it just skips server-only extras (seat availability, emails).

import com.munpro.app.AppGraph
import com.munpro.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement
import java.net.HttpURLConnection
import java.net.URL

object Api {
    val base: String = BuildConfig.API_URL.trimEnd('/')
    val available: Boolean get() = base.isNotEmpty()

    suspend fun call(path: String, method: String = "GET", body: String? = null): JsonElement? {
        if (!available) return null
        return withContext(Dispatchers.IO) {
            runCatching {
                val token = AppGraph.auth.idToken()
                val conn = (URL(base + path).openConnection() as HttpURLConnection).apply {
                    requestMethod = method
                    connectTimeout = 15000
                    readTimeout = 20000
                    setRequestProperty("Content-Type", "application/json")
                    if (token != null) setRequestProperty("Authorization", "Bearer $token")
                    if (body != null) {
                        doOutput = true
                        outputStream.use { it.write(body.toByteArray()) }
                    }
                }
                try {
                    if (conn.responseCode !in 200..299) return@runCatching null
                    val text = conn.inputStream.bufferedReader().use { it.readText() }
                    MunJson.parseToJsonElement(text)
                } finally {
                    conn.disconnect()
                }
            }.getOrNull()
        }
    }

    /** A call whose refusal matters: the server's `{ error }` text comes back to show the user. */
    data class Result(val ok: Boolean, val body: JsonElement?, val error: String?)

    suspend fun send(path: String, method: String = "POST", body: String? = null): Result {
        if (!available) return Result(false, null, "The server isn't reachable from this build.")
        return withContext(Dispatchers.IO) {
            runCatching {
                val token = AppGraph.auth.idToken()
                val conn = (URL(base + path).openConnection() as HttpURLConnection).apply {
                    requestMethod = method
                    connectTimeout = 15000
                    readTimeout = 20000
                    setRequestProperty("Content-Type", "application/json")
                    if (token != null) setRequestProperty("Authorization", "Bearer $token")
                    if (body != null) {
                        doOutput = true
                        outputStream.use { it.write(body.toByteArray()) }
                    }
                }
                try {
                    val ok = conn.responseCode in 200..299
                    val text = (if (ok) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                    val json = runCatching { MunJson.parseToJsonElement(text) }.getOrNull()
                    val err = runCatching { (json as? kotlinx.serialization.json.JsonObject)?.get("error")?.let { (it as kotlinx.serialization.json.JsonPrimitive).content } }.getOrNull()
                    Result(ok, json, if (ok) null else err ?: "Request failed. Please try again.")
                } finally {
                    conn.disconnect()
                }
            }.getOrElse { Result(false, null, "Couldn't reach the server. Check your connection.") }
        }
    }

    /**
     * /api/upload (the web's uploadImage): one image as multipart field "image", stored on the
     * site's Cloudinary. Returns its URL, or throws with the server's message.
     */
    suspend fun uploadImage(bytes: ByteArray, mime: String = "image/jpeg"): String {
        if (!available) throw IllegalStateException("The server isn't reachable from this build.")
        // The site refuses anonymous uploads: send the member's ID token.
        val token = AppGraph.auth.idToken()
        return withContext(Dispatchers.IO) {
            val boundary = "munpilot" + System.currentTimeMillis()
            val conn = (URL("$base/api/upload").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 15000
                readTimeout = 60000
                doOutput = true
                setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
                if (token != null) setRequestProperty("Authorization", "Bearer $token")
            }
            try {
                conn.outputStream.use { out ->
                    out.write("--$boundary\r\nContent-Disposition: form-data; name=\"image\"; filename=\"photo.jpg\"\r\nContent-Type: $mime\r\n\r\n".toByteArray())
                    out.write(bytes)
                    out.write("\r\n--$boundary--\r\n".toByteArray())
                }
                val ok = conn.responseCode in 200..299
                val text = (if (ok) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                val json = runCatching { MunJson.parseToJsonElement(text) as kotlinx.serialization.json.JsonObject }.getOrNull()
                fun str(k: String) = (json?.get(k) as? kotlinx.serialization.json.JsonPrimitive)?.content
                if (!ok) throw IllegalStateException(str("error") ?: "Upload failed")
                str("url") ?: throw IllegalStateException("Upload failed")
            } finally {
                conn.disconnect()
            }
        }
    }

    /** The site URL for a path, to open in the browser (payments, web-only roles). */
    fun site(path: String): String? = if (available) base + path else null
}
