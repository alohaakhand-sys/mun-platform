package com.munpro.app.ui.kit

// The lowercase "munpilot" wordmark (board 00): navy carries "mun", green carries "pilot", and the
// i's dot is a diamond, the heading marker. Drawn as text (a dotless i) with the diamond placed
// from the laid-out glyph, so it stays sharp at any size and follows the theme.

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

private const val DOTLESS_I_INDEX = 4 // m u n p [ı] l o t

@Composable
fun Wordmark(modifier: Modifier = Modifier, size: TextUnit = 30.sp) {
    val c = palette
    var layout by remember { mutableStateOf<TextLayoutResult?>(null) }
    val text = buildAnnotatedString {
        withStyle(SpanStyle(color = c.label)) { append("mun") }
        withStyle(SpanStyle(color = c.tint)) { append("pılot") }
    }
    Text(
        text,
        style = TextStyle(fontFamily = Inter, fontWeight = FontWeight.SemiBold, fontSize = size, letterSpacing = (-0.035).em, lineHeight = size),
        onTextLayout = { layout = it },
        modifier = modifier
            .semantics { contentDescription = "MUN Pilot" }
            .drawWithContent {
                drawContent()
                val l = layout ?: return@drawWithContent
                val em = size.toPx()
                val box = l.getBoundingBox(DOTLESS_I_INDEX)
                val cx = box.center.x
                val cy = l.getLineBaseline(0) - em * 0.80f
                val r = em * 0.085f
                val p = Path().apply {
                    moveTo(cx, cy - r); lineTo(cx + r, cy); lineTo(cx, cy + r); lineTo(cx - r, cy); close()
                }
                drawPath(p, c.label)
            },
    )
}
