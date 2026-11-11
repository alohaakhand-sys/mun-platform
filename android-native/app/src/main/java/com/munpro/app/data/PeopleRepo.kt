package com.munpro.app.data

// Network and public profiles (board A2; web app/dashboard/network/page.tsx,
// lib/services/connectionService.ts, reputationService.ts, PublicProfileView.tsx). Connection and
// block writes are the web's own client writes under the same rules; ratings, recommendations and
// endorsements go through the site's /api/reputation routes, which check eligibility and keep the
// counters (clients never write those).

import com.google.firebase.firestore.FieldPath
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.munpro.app.domain.BlockedPerson
import com.munpro.app.domain.PublicProfile
import com.munpro.app.domain.Recommendation
import com.munpro.app.domain.SkillState
import com.munpro.app.domain.slugifySkill
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/** Who I am, as the other side's connection doc records me. */
data class Me(val uid: String, val name: String, val photo: String, val role: String)

class PeopleRepo {
    private val db = FirebaseFirestore.getInstance()
    private fun user(uid: String) = db.collection("users").document(uid)

    /** Another member's profile: the phone's copy for a few hours, unless [force] (pull-to-refresh). */
    suspend fun profile(uid: String, force: Boolean = false): PublicProfile? = runCatching {
        com.munpro.app.AppGraph.saved.cached("profile.public:$uid", PublicProfile.serializer(), Fresh.LONG, force) {
            user(uid).get().await().takeIf { it.exists() }?.decode<PublicProfile>() ?: throw NoSuchElementException()
        }
    }.getOrNull()

    /**
     * Discover (the network page's candidates): the first 30 members in document order who aren't
     * me, aren't connected, haven't hidden their profile and aren't App Admins. The web reads the
     * whole users collection for this; reading in document order up to what 30 needs gives the same
     * people for a fraction of the reads.
     */
    suspend fun discover(meUid: String, connected: Set<String>, force: Boolean = false): List<PublicProfile> =
        com.munpro.app.AppGraph.saved.cached("discover.people", kotlinx.serialization.builtins.ListSerializer(PublicProfile.serializer()), Fresh.DAY, force) {
            discoverFromServer(meUid, connected)
        }.filter { it.id !in connected }

    private suspend fun discoverFromServer(meUid: String, connected: Set<String>): List<PublicProfile> {
        val out = mutableListOf<PublicProfile>()
        var after: com.google.firebase.firestore.DocumentSnapshot? = null
        repeat(4) {
            var q = db.collection("users").orderBy(FieldPath.documentId()).limit(60)
            after?.let { q = q.startAfter(it) }
            val snap = q.get().await()
            for (d in snap.documents) {
                if (d.id == meUid || d.id in connected) continue
                val p = d.decode<PublicProfile>() ?: continue
                if (p.privacySettings?.showProfile == false || p.isAdminAccount) continue
                out += p
                if (out.size == 30) return out
            }
            if (snap.size() < 60) return out
            after = snap.documents.last()
        }
        return out
    }

    /** connectManually: refused (ambiguously, as on the web) when the other person blocked me. */
    suspend fun connect(me: Me, other: PublicProfile) {
        if (user(other.id).collection("blocks").document(me.uid).get().await().exists()) throw IllegalStateException("Cannot connect")
        val batch = db.batch()
        batch.set(user(me.uid).collection("connections").document(other.id), mapOf(
            "otherUid" to other.id, "displayName" to other.name, "photoURL" to other.photoURL.orEmpty(),
            "role" to (other.role?.ifEmpty { null } ?: "Delegate"), "source" to "manual",
            "connectedAt" to FieldValue.serverTimestamp(), "status" to "active",
        ))
        batch.set(user(other.id).collection("connections").document(me.uid), mapOf(
            "otherUid" to me.uid, "displayName" to me.name, "photoURL" to me.photo, "role" to me.role,
            "source" to "manual", "connectedAt" to FieldValue.serverTimestamp(), "status" to "active",
        ))
        batch.commit().await()
    }

    suspend fun disconnect(meUid: String, otherUid: String) {
        val batch = db.batch()
        batch.delete(user(meUid).collection("connections").document(otherUid))
        batch.delete(user(otherUid).collection("connections").document(meUid))
        batch.commit().await()
    }

    /**
     * blockUser: the block doc, both connection docs marked blocked, and the direct conversation
     * (if there is one) marked blocked by me. The conversation is updated on its own: the web folds
     * it into the batch as a merge, which the conversation create rule refuses when no chat exists.
     */
    suspend fun block(meUid: String, otherUid: String) {
        val batch = db.batch()
        batch.set(user(meUid).collection("blocks").document(otherUid), mapOf("blockedUid" to otherUid, "blockedAt" to FieldValue.serverTimestamp(), "reason" to ""))
        batch.set(user(meUid).collection("connections").document(otherUid), mapOf("status" to "blocked"), com.google.firebase.firestore.SetOptions.merge())
        batch.set(user(otherUid).collection("connections").document(meUid), mapOf("status" to "blocked"), com.google.firebase.firestore.SetOptions.merge())
        batch.commit().await()
        runCatching { db.collection("conversations").document(convId(meUid, otherUid)).update("blockedBy", FieldValue.arrayUnion(meUid)).await() }
    }

    /**
     * unblockUser. A real connection goes back to active, as on the web; the bare `{status}` docs a
     * block leaves behind for people who were never connected are removed instead of turned
     * "active" (the web's version leaves nameless connections in both lists).
     */
    suspend fun unblock(meUid: String, otherUid: String) {
        val mine = user(meUid).collection("connections").document(otherUid)
        val theirs = user(otherUid).collection("connections").document(meUid)
        val wasConnected = runCatching { !mine.get().await().getString("otherUid").isNullOrEmpty() }.getOrDefault(true)
        val batch = db.batch()
        batch.delete(user(meUid).collection("blocks").document(otherUid))
        if (wasConnected) {
            batch.set(mine, mapOf("status" to "active"), com.google.firebase.firestore.SetOptions.merge())
            batch.set(theirs, mapOf("status" to "active"), com.google.firebase.firestore.SetOptions.merge())
        } else {
            batch.delete(mine)
            batch.delete(theirs)
        }
        batch.commit().await()
        runCatching { db.collection("conversations").document(convId(meUid, otherUid)).update("blockedBy", FieldValue.arrayRemove(meUid)).await() }
    }

    private fun convId(a: String, b: String) = listOf(a, b).sorted().joinToString("_")

    /**
     * The blocked list with names, not the raw ids the web shows: the name on my connection doc
     * when we were connected, else their profile, else a neutral label.
     */
    suspend fun blocked(meUid: String, names: Map<String, String>): List<BlockedPerson> = coroutineScope {
        user(meUid).collection("blocks").get().await().documents.map { d ->
            async {
                val uid = d.getString("blockedUid")?.ifEmpty { null } ?: d.id
                val name = names[uid]?.ifEmpty { null } ?: runCatching { profile(uid)?.name }.getOrNull() ?: "MUN Pilot member"
                BlockedPerson(uid, name, d.getTimestamp("blockedAt")?.toDate()?.time)
            }
        }.awaitAll().sortedByDescending { it.blockedAt ?: 0L }
    }

    /**
     * Their email and phone, or null when their contactVisibility doesn't include you (the rules
     * refuse the read) or they have none. Never cached: a hidden contact must stay hidden.
     */
    suspend fun contact(uid: String): com.munpro.app.domain.UserContact? = runCatching {
        user(uid).collection("private").document("contact").get().await().takeIf { it.exists() }?.decode<com.munpro.app.domain.UserContact>()
    }.getOrNull()

    suspend fun isConnected(meUid: String, otherUid: String): Boolean =
        runCatching { user(meUid).collection("connections").document(otherUid).get().await().exists() }.getOrDefault(false)

    /** Their connection count: only readable by organizers (the web shows it when it can). */
    suspend fun connectionCount(uid: String): Int? =
        runCatching { user(uid).collection("connections").get().await().size() }.getOrNull()

    /** /api/profile/{uid}/eligibility: may I rate, recommend and endorse them (connected or shared a conference)? */
    suspend fun eligible(uid: String): Boolean =
        runCatching { Api.send("/api/profile/$uid/eligibility", "GET").body?.jsonObject?.get("eligible")?.jsonPrimitive?.booleanOrNull }.getOrNull() == true

    suspend fun myRating(meUid: String, toUid: String): Int =
        runCatching { db.collection("ratings").document("${meUid}_$toUid").get().await().getLong("stars")?.toInt() }.getOrNull() ?: 0

    suspend fun recommendationsTo(uid: String): List<Recommendation> = recs("toUid", uid)
    suspend fun recommendationsBy(uid: String): List<Recommendation> = recs("authorUid", uid)

    private suspend fun recs(field: String, uid: String): List<Recommendation> = runCatching {
        db.collection("recommendations").whereEqualTo(field, uid).whereEqualTo("status", "approved").get().await()
            .documents.mapNotNull { it.decode<Recommendation>() }.sortedByDescending { it.createdAt ?: 0L }
    }.getOrDefault(emptyList())

    /** Per skill: the count on their profile, the first three endorsers, and whether I endorsed it. */
    suspend fun skills(p: PublicProfile, meUid: String?, eligible: Boolean): List<SkillState> = coroutineScope {
        p.skills.filter { it.isNotBlank() }.map { skill ->
            async {
                val slug = slugifySkill(skill)
                val endorsers = runCatching {
                    db.collection("endorsements").whereEqualTo("toUid", p.id).whereEqualTo("skillSlug", slug).limit(3).get().await()
                        .documents.map { it.getString("endorserName").orEmpty() }
                }.getOrDefault(emptyList())
                val mine = eligible && meUid != null &&
                    runCatching { db.collection("endorsements").document("${meUid}_${p.id}_$slug").get().await().exists() }.getOrDefault(false)
                SkillState(skill, slug, maxOf(0, p.endorsementCounts[slug]?.toInt() ?: 0), endorsers, mine)
            }
        }.awaitAll()
    }

    // ---- your own profile (board A3) -------------------------------------------------------------

    /** users/{uid} live, for the editor; closes with the screen. */
    fun own(uid: String): kotlinx.coroutines.flow.Flow<PublicProfile?> = kotlinx.coroutines.flow.callbackFlow {
        val reg = user(uid).addSnapshotListener { snap, _ -> trySend(snap?.takeIf { it.exists() }?.decode<PublicProfile>()) }
        awaitClose { reg.remove() }
    }

    /** updateUserProfile: only the fields given; the rules let you write your own doc. */
    suspend fun update(uid: String, fields: Map<String, Any?>) {
        user(uid).update(fields).await()
    }

    /**
     * The MUN Stats the public profile shows (web ProfileView, owner side): visitors can't count
     * your applications or articles, so the owner's own view writes the counts onto the profile,
     * only when they changed.
     */
    suspend fun syncPublicStats(uid: String, p: PublicProfile) = runCatching {
        val conferences = db.collection("applications").whereEqualTo("userId", uid).whereEqualTo("status", "approved").get().await().size()
        val blogs = runCatching { db.collection("articles").whereEqualTo("authorId", uid).get().await().size() }.getOrDefault(0)
        val awards = com.munpro.app.AppGraph.content.getUserAchievements(uid).size
        val cur = p.publicStats
        if (cur == null || cur.conferences != conferences || cur.blogs != blogs || cur.awards != awards) {
            update(uid, mapOf("publicStats" to mapOf("conferences" to conferences, "blogs" to blogs, "awards" to awards)))
        }
    }

    suspend fun pendingRecommendations(uid: String): List<Recommendation> = runCatching {
        db.collection("recommendations").whereEqualTo("toUid", uid).whereEqualTo("status", "pending").get().await()
            .documents.mapNotNull { it.decode<Recommendation>() }.sortedByDescending { it.createdAt ?: 0L }
    }.getOrDefault(emptyList())

    /** Approve (shows on your profile) or hide a recommendation written about you. */
    suspend fun decide(recId: String, approve: Boolean) {
        post("/api/reputation/recommend/decide", buildJsonObject { put("recId", recId); put("action", if (approve) "approve" else "hide") }.toString())
    }

    /** Throws with the server's message when it refuses. */
    suspend fun rate(toUid: String, stars: Int) = post("/api/reputation/rate", buildJsonObject { put("toUid", toUid); put("stars", stars) }.toString())

    suspend fun recommend(toUid: String, body: String, relationship: String) =
        post("/api/reputation/recommend", buildJsonObject { put("toUid", toUid); put("body", body); if (relationship.isNotBlank()) put("relationship", relationship) }.toString())

    /** Toggles; true when it's now endorsed. */
    suspend fun endorse(toUid: String, skill: String): Boolean =
        post("/api/reputation/endorse", buildJsonObject { put("toUid", toUid); put("skill", skill) }.toString())
            ?.jsonObject?.get("endorsed")?.jsonPrimitive?.booleanOrNull == true

    private suspend fun post(path: String, body: String): kotlinx.serialization.json.JsonElement? {
        val r = Api.send(path, "POST", body)
        if (!r.ok) throw IllegalStateException(r.error ?: "Request failed. Please try again.")
        return r.body
    }
}
