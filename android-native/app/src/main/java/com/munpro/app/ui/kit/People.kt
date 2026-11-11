package com.munpro.app.ui.kit

// A person's initials in a soft circle (board A1: activity, search, network rows). Five hues, the
// board's a1–a5, picked from the name so the same person keeps the same colour everywhere.

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val LightHues = listOf(
    Color(0xFFDCEBFF) to Color(0xFF1F4E9E),
    Color(0xFFFBE3EC) to Color(0xFF9C2A57),
    Color(0xFFE7E2FB) to Color(0xFF4F3AA8),
    Color(0xFFFCEBD9) to Color(0xFF8A4B0E),
    Color(0xFFDDF3EC) to Color(0xFF0B6E4F),
)
private val DarkHues = listOf(
    Color(0xFF1D2C44) to Color(0xFF9CC1FF),
    Color(0xFF3A1D2A) to Color(0xFFF2A6C2),
    Color(0xFF2A2442) to Color(0xFFC5B7FF),
    Color(0xFF3A2A1A) to Color(0xFFF5C089),
    Color(0xFF173027) to Color(0xFF7FD3B0),
)

/** `Nadia Rahman` → `NR`. */
fun personInitials(name: String): String =
    name.trim().split(Regex("\\s+")).mapNotNull { it.firstOrNull()?.uppercaseChar() }.take(2).joinToString("").ifEmpty { "?" }

/** [photo]: their profile photo URL; the initials show until it loads, and when there is none. */
@Composable
fun PersonAvatar(name: String, size: Dp = 36.dp, seed: String = name, photo: String? = null) {
    val c = palette
    val hues = if (c.dark) DarkHues else LightHues
    val (bg, fg) = hues[Math.floorMod(seed.hashCode(), hues.size)]
    Box(Modifier.size(size).clip(CircleShape).background(bg), contentAlignment = Alignment.Center) {
        Text(personInitials(name), color = fg, fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = (size.value * 0.36f).sp)
        if (!photo.isNullOrBlank()) RemoteImage(photo, Modifier.matchParentSize())
    }
}

/** A picture from a URL (Cloudinary photos and covers), cropped to fill. Nothing while it loads or if it fails. */
@Composable
fun RemoteImage(url: String, modifier: Modifier = Modifier, description: String? = null) {
    coil3.compose.AsyncImage(
        model = url, contentDescription = description, modifier = modifier,
        contentScale = androidx.compose.ui.layout.ContentScale.Crop,
    )
}
