package com.munpro.app.ui.kit

// A quiet notice when the phone has no connection, so a saved copy or a frozen floor is never
// mistaken for the live state (RN OfflineBanner.tsx). The mockup's offline Today adds when the
// saved copy is from: pass [savedAt].

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun OfflineBanner(live: Boolean = false, savedAt: Long? = null) {
    val online by AppGraph.network.online.collectAsStateWithLifecycle()
    if (online) return
    val c = palette
    val text = when {
        live -> "Offline. The floor may have moved on."
        savedAt != null && savedAt > 0 -> "You're offline. Showing what was saved at ${SimpleDateFormat("h:mm a", Locale.US).format(Date(savedAt))}."
        else -> "Offline. Showing what's saved on this phone."
    }
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Row(
            Modifier
                .clip(RoundedCornerShape(14.dp))
                .background(c.fill)
                .padding(horizontal = 12.dp, vertical = 6.dp)
                .semantics { liveRegion = LiveRegionMode.Polite },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Dot(c.label2, 7.dp)
            Text(text, style = Type.footnote.copy(fontWeight = FontWeight.Medium), color = c.label2)
        }
    }
}
