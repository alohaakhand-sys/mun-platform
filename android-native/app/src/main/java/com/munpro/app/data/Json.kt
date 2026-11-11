package com.munpro.app.data

// Firestore documents → Kotlin models. A document is turned into JSON (Timestamps become epoch
// millis) and decoded leniently, because field types drift between web versions: a date can be a
// Timestamp, millis or an ISO string; a capacity can be "15" or 15. The same JSON is what the
// device keeps as its saved copy, so a cached screen decodes exactly like a fresh one.

import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.GeoPoint
import com.munpro.app.domain.jsDateMs
import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

val MunJson = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
    isLenient = true
    explicitNulls = false
    encodeDefaults = false
}

/** Any Firestore value as JSON. Timestamps → epoch millis; whole doubles → integers. */
fun Any?.toJsonElement(): JsonElement = when (this) {
    null -> JsonNull
    is String -> JsonPrimitive(this)
    is Boolean -> JsonPrimitive(this)
    is Long -> JsonPrimitive(this)
    is Int -> JsonPrimitive(this)
    is Double -> if (this % 1.0 == 0.0 && !this.isInfinite() && kotlin.math.abs(this) < 9e15) JsonPrimitive(this.toLong()) else JsonPrimitive(this)
    is Float -> JsonPrimitive(this.toDouble())
    is Number -> JsonPrimitive(this.toDouble())
    is Timestamp -> JsonPrimitive(this.seconds * 1000 + this.nanoseconds / 1_000_000)
    is java.util.Date -> JsonPrimitive(this.time)
    is GeoPoint -> JsonObject(mapOf("latitude" to JsonPrimitive(latitude), "longitude" to JsonPrimitive(longitude)))
    is DocumentReference -> JsonPrimitive(path)
    is Map<*, *> -> JsonObject(entries.associate { (k, v) -> k.toString() to v.toJsonElement() })
    is List<*> -> JsonArray(map { it.toJsonElement() })
    is Array<*> -> JsonArray(map { it.toJsonElement() })
    else -> JsonPrimitive(toString())
}

/** The document as a JSON object with its id under "id" (the web's `{ id: snap.id, ...data }`). */
fun DocumentSnapshot.toJson(): JsonObject? {
    val data = data ?: return null
    val obj = data.toJsonElement() as JsonObject
    return JsonObject(obj + ("id" to JsonPrimitive(id)))
}

inline fun <reified T> DocumentSnapshot.decode(): T? = toJson()?.let { decodeOrNull<T>(it) }

inline fun <reified T> decodeOrNull(e: JsonElement): T? = try {
    MunJson.decodeFromJsonElement<T>(e)
} catch (t: Throwable) {
    android.util.Log.w("MunJson", "decode ${T::class.simpleName} failed: ${t.message}")
    null
}

// ---- lenient field serializers -------------------------------------------------------------

/** A moment as epoch millis, from a number, an ISO string, or a {seconds, nanoseconds} object. */
object LenientMillis : KSerializer<Long?> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("LenientMillis", PrimitiveKind.LONG)
    override fun serialize(encoder: Encoder, value: Long?) {
        if (value == null) encoder.encodeNull() else encoder.encodeLong(value)
    }
    override fun deserialize(decoder: Decoder): Long? {
        val e = (decoder as? JsonDecoder)?.decodeJsonElement() ?: return decoder.decodeLong()
        return millisOf(e)
    }
}

fun millisOf(e: JsonElement?): Long? = when (e) {
    null, JsonNull -> null
    is JsonPrimitive -> if (e.isString) jsDateMs(e.content) else e.longOrNull ?: e.doubleOrNull?.toLong()
    is JsonObject -> {
        val s = (e["seconds"] ?: e["_seconds"])?.jsonPrimitive?.longOrNull
        val n = (e["nanoseconds"] ?: e["_nanoseconds"])?.jsonPrimitive?.longOrNull ?: 0
        s?.let { it * 1000 + n / 1_000_000 }
    }
    else -> null
}

/** An integer that may arrive as a string or a double. */
object LenientInt : KSerializer<Int?> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("LenientInt", PrimitiveKind.INT)
    override fun serialize(encoder: Encoder, value: Int?) {
        if (value == null) encoder.encodeNull() else encoder.encodeInt(value)
    }
    override fun deserialize(decoder: Decoder): Int? {
        val e = (decoder as? JsonDecoder)?.decodeJsonElement() ?: return decoder.decodeInt()
        val p = e as? JsonPrimitive ?: return null
        return p.longOrNull?.toInt() ?: p.doubleOrNull?.toInt() ?: p.content.trim().toDoubleOrNull()?.toInt()
    }
}

/** A number that may arrive as a string. */
object LenientDouble : KSerializer<Double?> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("LenientDouble", PrimitiveKind.DOUBLE)
    override fun serialize(encoder: Encoder, value: Double?) {
        if (value == null) encoder.encodeNull() else encoder.encodeDouble(value)
    }
    override fun deserialize(decoder: Decoder): Double? {
        val e = (decoder as? JsonDecoder)?.decodeJsonElement() ?: return decoder.decodeDouble()
        val p = e as? JsonPrimitive ?: return null
        return p.doubleOrNull ?: p.content.trim().toDoubleOrNull()
    }
}

/** A string that may arrive as a number or boolean (or be missing). */
object LenientString : KSerializer<String> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("LenientString", PrimitiveKind.STRING)
    override fun serialize(encoder: Encoder, value: String) = encoder.encodeString(value)
    override fun deserialize(decoder: Decoder): String {
        val e = (decoder as? JsonDecoder)?.decodeJsonElement() ?: return decoder.decodeString()
        return when (e) {
            is JsonPrimitive -> if (e.isString) e.content else (e.booleanOrNull?.toString() ?: e.content)
            else -> ""
        }
    }
}
