package com.munpro.app.data

// Saved copy first, then the network (port of useCached in mobile/src/lib/cache.ts).
//
// `has` is false until either answers. `saved` is true while what's shown came from the device;
// `failed` means the network gave up, so a screen with no saved copy can say so instead of
// loading forever. Offline, the fetch is not even tried: Firestore would answer from its cache,
// and an empty answer must never overwrite a good saved copy.

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.munpro.app.AppGraph
import kotlinx.serialization.KSerializer

data class Cached<T>(
    val has: Boolean = false,
    val data: T? = null,
    val saved: Boolean = false,
    val failed: Boolean = false,
    val savedAt: Long? = null,
)

/**
 * Pull-to-refresh anywhere bumps this, so every cached read on the screen asks the server again
 * instead of trusting its saved copy (kit/Screen.kt).
 */
object Refresh {
    val tick = kotlinx.coroutines.flow.MutableStateFlow(0)
    fun bump() { tick.value++ }
}

/**
 * The saved copy first; the server only when there is none, it is older than [maxAgeMs], or the
 * user pulled to refresh. [maxAgeMs] 0 = always ask (the old behaviour).
 */
@Composable
fun <T> rememberCached(key: String?, serializer: KSerializer<T>, maxAgeMs: Long = 0, fetch: suspend () -> T): Cached<T> {
    var state by remember(key) { mutableStateOf(Cached<T>()) }
    val tick by Refresh.tick.collectAsState()
    val firstTick = remember(key) { tick }
    LaunchedEffect(key, tick) {
        if (key == null) return@LaunchedEffect
        val force = tick != firstTick
        var fresh = false
        val saved = AppGraph.saved.read(key, serializer)
        val at = AppGraph.saved.savedAt(key)
        if (saved != null) state = Cached(true, saved, true, false, at)
        // Young enough: no read at all.
        if (!force && saved != null && at != null && maxAgeMs > 0 && System.currentTimeMillis() - at < maxAgeMs) {
            state = Cached(true, saved, false, false, null)
            android.util.Log.d("MunCache", "hit $key")
            return@LaunchedEffect
        }
        if (!AppGraph.network.isOnline()) { state = state.copy(failed = true); return@LaunchedEffect }
        try {
            android.util.Log.d("MunCache", "fetch $key${if (force) " (refresh)" else ""}")
            val d = fetch()
            fresh = true
            state = Cached(true, d, false, false, null)
            AppGraph.saved.write(key, serializer, d)
        } catch (_: Exception) {
            if (!fresh) state = state.copy(failed = true) // keep any saved copy
        }
    }
    return state
}
