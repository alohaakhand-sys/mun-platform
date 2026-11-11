package com.munpro.app.ui.kit

// "Continue with Google" (board 01): a white capsule with Google's four-colour G, as Google's
// sign-in branding asks. Hidden by the caller when the build has no Google client id.

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp

private val G_PARTS = listOf(
    Color(0xFFEA4335) to "M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z",
    Color(0xFF4285F4) to "M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z",
    Color(0xFFFBBC05) to "M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z",
    Color(0xFF34A853) to "M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z",
).map { (color, d) -> color to PathParser().parsePathString(d).toPath() }

@Composable
fun GoogleG(size: androidx.compose.ui.unit.Dp = 18.dp) {
    Canvas(Modifier.size(size)) {
        val k = this.size.minDimension / 48f
        scale(k, k, pivot = Offset.Zero) { G_PARTS.forEach { (color, path) -> drawPath(path, color) } }
    }
}

@Composable
fun GoogleButton(title: String, onClick: () -> Unit, modifier: Modifier = Modifier, loading: Boolean = false) {
    val c = palette
    val haptics = rememberHaptics()
    val press = rememberPress()
    val pressed by press.pressed
    Row(
        modifier
            .fillMaxWidth()
            .height(50.dp)
            .alpha(if (pressed) 0.75f else 1f)
            .clip(CircleShape)
            .background(c.cell)
            .border(Hairline, c.separator, CircleShape)
            .tap(press, enabled = !loading) { haptics.selection(); onClick() },
        horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (loading) CircularProgressIndicator(color = c.label2, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
        else GoogleG()
        Text(title, style = Type.headline, color = c.label)
    }
}

/** The thin "or" rule between the email form and Google. */
@Composable
fun OrDivider() {
    val c = palette
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        androidx.compose.foundation.layout.Box(Modifier.weight(1f).height(Hairline).background(c.separator))
        Text("or", style = Type.footnote, color = c.label2)
        androidx.compose.foundation.layout.Box(Modifier.weight(1f).height(Hairline).background(c.separator))
    }
}
