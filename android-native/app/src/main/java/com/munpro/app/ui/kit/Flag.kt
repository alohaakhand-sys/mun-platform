package com.munpro.app.ui.kit

// A country's flag in a leading slot. The one place screens ask for a flag, so the redesign's
// vector flags (board 00: "Vector flag drawables, no emoji") replace the emoji everywhere at once.
// Drawables are res/drawable/flag_<code>.xml, converted from flag-icons (MIT, see
// THIRD_PARTY_NOTICES.md); the code -> resource map is FLAG_DRAWABLES in FlagDrawables.kt.

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.munpro.app.domain.getCountry

/** [size] is the old emoji font size: the flag is [size] dp tall and 4:3 wide. */
@Composable
fun Flag(country: String?, size: Float = 22f) {
    Flag(country, width = (size * 4f / 3f).dp, height = size.dp)
}

@Composable
fun Flag(country: String?, width: Dp, height: Dp) {
    val c = palette
    val shape = RoundedCornerShape(minOf(width, height) * 0.18f)
    val res = flagDrawable(country)
    val frame = Modifier
        .size(width, height)
        .clip(shape)
        .border(Hairline, c.separator, shape)
    if (res == null) {
        // Unknown or free-text country: a neutral chip, never a crash.
        Box(frame.background(c.fill))
    } else {
        Image(
            painter = painterResource(res),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = frame,
        )
    }
}

/** A flag and a line of text side by side, where a row reads "France · Point of Order". */
@Composable
fun FlagText(country: String?, text: String, style: androidx.compose.ui.text.TextStyle, color: androidx.compose.ui.graphics.Color, modifier: Modifier = Modifier) {
    androidx.compose.foundation.layout.Row(modifier, verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
        if (!country.isNullOrEmpty()) Flag(country, (style.fontSize.value * 0.95f).coerceAtLeast(12f))
        androidx.compose.material3.Text(text, style = style, color = color)
    }
}

/** The flag drawable for a code or a name, or null when there is none. */
fun flagDrawable(country: String?): Int? {
    val code = getCountry(country)?.code?.lowercase() ?: return null
    return FLAG_DRAWABLES[code]
}
