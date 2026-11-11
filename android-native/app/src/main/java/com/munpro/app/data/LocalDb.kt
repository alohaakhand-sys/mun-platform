package com.munpro.app.data

// The phone's own copy of what the signed-in user has loaded (owner decision: load once, keep it
// on the phone, so munpilot.com and Firestore are asked again only when a copy is old or the user
// pulls to refresh). One SQLite file per account, `munpilot-<uid>.db`, deleted on sign-out, so the
// next account on the phone starts empty. Pictures are kept separately by Coil (MunApp).
//
// One table: key → the JSON the app decoded it from, and when it was saved. Live-session data is
// never written here (a stale floor is worse than none).

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.google.firebase.auth.FirebaseAuth

class LocalDb(private val context: Context) {
    private class Helper(context: Context, name: String) : SQLiteOpenHelper(context, name, null, 1) {
        override fun onCreate(db: SQLiteDatabase) {
            db.execSQL("CREATE TABLE cache (key TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL, saved_at INTEGER NOT NULL)")
        }
        override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
    }

    private var openFor: String? = null
    private var helper: Helper? = null

    private fun fileFor(uid: String) = "munpilot-$uid.db"

    /** The signed-in account's database, or null when nobody is signed in. */
    @Synchronized
    private fun db(): SQLiteDatabase? {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return null
        if (openFor != uid) {
            helper?.close()
            helper = Helper(context, fileFor(uid))
            openFor = uid
        }
        return helper!!.writableDatabase
    }

    /** The saved JSON and when it was saved. */
    fun get(key: String): Pair<String, Long>? = runCatching {
        db()?.rawQuery("SELECT json, saved_at FROM cache WHERE key = ?", arrayOf(key))?.use { c ->
            if (c.moveToFirst()) c.getString(0) to c.getLong(1) else null
        }
    }.getOrNull()

    fun put(key: String, json: String, at: Long = System.currentTimeMillis()) {
        runCatching {
            db()?.insertWithOnConflict("cache", null, ContentValues().apply { put("key", key); put("json", json); put("saved_at", at) }, SQLiteDatabase.CONFLICT_REPLACE)
        }
    }

    fun remove(key: String) {
        runCatching { db()?.delete("cache", "key = ?", arrayOf(key)) }
    }

    /** Sign-out: the whole file goes, not just its rows. */
    @Synchronized
    fun deleteForCurrentUser() {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return
        helper?.close()
        helper = null
        openFor = null
        context.deleteDatabase(fileFor(uid))
    }
}

/** How long a saved copy is good for before the app asks the server again (owner-approved windows). */
object Fresh {
    const val MIN = 60_000L
    const val HOUR = 60 * MIN
    /** Announcements, circulating papers: change during a conference. */
    const val SHORT = 15 * MIN
    /** The signed-in user's conferences and seats. */
    const val MEDIUM = HOUR
    /** Events, other members' profiles, study guides, rules, recommendations. */
    const val LONG = 6 * HOUR
    /** The Discover list of people. */
    const val DAY = 24 * HOUR
}
