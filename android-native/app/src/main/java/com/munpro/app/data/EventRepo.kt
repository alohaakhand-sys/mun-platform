package com.munpro.app.data

// Port of the reads in src/lib/services/eventService.ts the app makes.

import com.google.firebase.firestore.FirebaseFirestore
import com.munpro.app.domain.EventData
import kotlinx.coroutines.tasks.await

class EventRepo {
    private val db = FirebaseFirestore.getInstance()

    /**
     * Published events. The web homepage caps this read (Spark plan: Firestore bills per document
     * returned), so the app passes the same cap: equality filter + limit, sorted on the phone.
     */
    suspend fun getPublishedEvents(max: Long? = null): List<EventData> {
        val base = db.collection("events").whereEqualTo("status", "published")
        val snap = (if (max != null) base.limit(max) else base).get().await()
        // Unlisted events open by link only: never in Browse or a recommendation.
        return snap.documents.mapNotNull { it.decode<EventData>() }.filter { it.visibility != "unlisted" }
    }

    suspend fun getEventById(eventId: String): EventData? {
        if (eventId.isEmpty()) return null
        return runCatching { db.collection("events").document(eventId).get().await() }
            .getOrNull()
            ?.takeIf { it.exists() }
            ?.decode<EventData>()
    }
}
