package com.munpro.app.data

// What the phone keeps on its own (RN lib/cache.ts + the AsyncStorage keys the RN app used).
//
// Two kinds of thing live here:
//  - saved copies: the last good answer for what the user reads, so the app opens at a venue with
//    no signal and asks the server again only when a copy is old ([Fresh]). Each carries the time
//    it was saved, for the offline banner. They live in the account's SQLite file ([LocalDb]),
//    deleted on sign-out: the next account must not see this one's conferences.
//  - device preferences: appearance, chat "seen" stamps, announcement read marks, recent searches.
//
// Live-session data is never saved: a stale floor is worse than none.

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.JsonElement
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private val Context.store: DataStore<Preferences> by preferencesDataStore(name = "munpro")

private const val CACHE = "cache:"
private const val SAVED_AT = "savedAt:"

class Saved(private val context: Context) {
    private val ds get() = context.store
    private val db = LocalDb(context)

    // ---- saved copies: the signed-in account's SQLite file (LocalDb) ----

    suspend fun <T> read(key: String, serializer: KSerializer<T>): T? = withContext(Dispatchers.IO) {
        val raw = db.get(key)?.first ?: return@withContext null
        runCatching { MunJson.decodeFromString(serializer, raw) }.getOrNull()
    }

    /** The saved copy only while it is younger than [maxAgeMs]; null when older or missing. */
    suspend fun <T> fresh(key: String, serializer: KSerializer<T>, maxAgeMs: Long): T? = withContext(Dispatchers.IO) {
        val (raw, at) = db.get(key) ?: return@withContext null
        if (System.currentTimeMillis() - at > maxAgeMs) return@withContext null
        runCatching { MunJson.decodeFromString(serializer, raw) }.getOrNull()
    }

    suspend fun <T> write(key: String, serializer: KSerializer<T>, value: T) = withContext(Dispatchers.IO) {
        runCatching { db.put(key, MunJson.encodeToString(serializer, value)) }
        Unit
    }

    suspend fun readJson(key: String): JsonElement? = withContext(Dispatchers.IO) {
        val raw = db.get(key)?.first ?: return@withContext null
        runCatching { MunJson.parseToJsonElement(raw) }.getOrNull()
    }

    suspend fun savedAt(key: String): Long? = withContext(Dispatchers.IO) { db.get(key)?.second }

    /** Forget one copy, so the next read asks the server (e.g. seats after accepting an invite). */
    suspend fun remove(key: String) = withContext(Dispatchers.IO) { db.remove(key) }

    /**
     * Saved copy if fresh enough (and no refresh was asked for), else [fetch] and save it. When the
     * fetch fails, any older copy is better than nothing.
     */
    suspend fun <T> cached(key: String, serializer: KSerializer<T>, maxAgeMs: Long, force: Boolean = false, fetch: suspend () -> T): T {
        if (!force) fresh(key, serializer, maxAgeMs)?.let { android.util.Log.d("MunCache", "hit $key"); return it }
        android.util.Log.d("MunCache", "fetch $key${if (force) " (refresh)" else ""}")
        return try {
            fetch().also { write(key, serializer, it) }
        } catch (e: Exception) {
            read(key, serializer) ?: throw e
        }
    }

    /** Sign-out: the account's whole file. Also drops the copies older versions kept in DataStore. */
    suspend fun clear() {
        withContext(Dispatchers.IO) { db.deleteForCurrentUser() }
        dropLegacyCopies()
    }

    /** Saved copies used to live in DataStore; they're not read any more, so free the space once. */
    suspend fun dropLegacyCopies() {
        ds.edit { prefs ->
            prefs.asMap().keys.filter { it.name.startsWith(CACHE) || it.name.startsWith(SAVED_AT) }.forEach { prefs.remove(it) }
        }
    }

    // ---- device preferences ----

    fun string(key: String): Flow<String?> = ds.data.map { it[stringPreferencesKey(key)] }
    suspend fun getString(key: String): String? = ds.data.first()[stringPreferencesKey(key)]
    suspend fun putString(key: String, value: String?) {
        ds.edit { if (value == null) it.remove(stringPreferencesKey(key)) else it[stringPreferencesKey(key)] = value }
    }

    suspend fun getLong(key: String): Long = ds.data.first()[longPreferencesKey(key)] ?: 0L
    suspend fun putLong(key: String, value: Long) {
        ds.edit { it[longPreferencesKey(key)] = value }
    }
}
