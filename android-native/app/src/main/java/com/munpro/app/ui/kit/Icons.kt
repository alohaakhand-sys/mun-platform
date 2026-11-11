package com.munpro.app.ui.kit

// Icons drawn in the SF Symbols manner from the RN app's SVG paths (components/icons.tsx and the
// inline icons on Today, Profile, Conference home, the chat button): 24-unit viewBox, round caps.
// `filled` adds the soft fill iOS uses for the selected tab.

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** One stroked shape of an icon. `fill` = soft fill when the icon is "filled". */
data class IconPart(val d: String, val fillable: Boolean = false)

class SfIconSpec(val parts: List<IconPart>, val viewBox: Float = 24f, val stroke: Float = 1.8f)

private fun spec(vararg d: String, stroke: Float = 1.8f) = SfIconSpec(d.map { IconPart(it) }, stroke = stroke)

private fun circle(cx: Float, cy: Float, r: Float) =
    "M${cx - r},${cy}a$r,$r 0 1,0 ${2 * r},0a$r,$r 0 1,0 ${-2 * r},0z"

private fun rect(x: Float, y: Float, w: Float, h: Float, rx: Float) =
    "M${x + rx},${y}h${w - 2 * rx}a$rx,$rx 0 0 1 $rx,$rx v${h - 2 * rx}a$rx,$rx 0 0 1 ${-rx},$rx h${-(w - 2 * rx)}a$rx,$rx 0 0 1 ${-rx},${-rx} v${-(h - 2 * rx)}a$rx,$rx 0 0 1 $rx,${-rx}z"

object Icons {
    val today = SfIconSpec(listOf(IconPart(rect(3f, 5f, 18f, 14f, 3f), fillable = true), IconPart("M3 10h18")))
    val discover = SfIconSpec(listOf(IconPart(circle(12f, 12f, 9f), fillable = true), IconPart("m15.5 8.5-2 5-5 2 2-5z")))
    val schedule = SfIconSpec(listOf(IconPart(rect(3.5f, 4.5f, 17f, 16f, 3f), fillable = true), IconPart("M3.5 9.5h17M8 2.5v4M16 2.5v4")))
    val profile = SfIconSpec(listOf(IconPart(circle(12f, 8f, 4f), fillable = true), IconPart("M4.5 20.5c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5")))
    val search = SfIconSpec(listOf(IconPart(circle(11f, 11f, 7f)), IconPart("m20 20-3.5-3.5")), stroke = 2.2f)
    val back = spec("m15 5-7 7 7 7", stroke = 2.4f)
    val bell = spec("M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0", stroke = 1.9f)
    val chat = spec("M4 11.5C4 7.4 7.6 4.5 12 4.5s8 2.9 8 7-3.6 7-8 7c-1 0-2-.1-2.9-.4L5 19.5l1.1-3.3C4.8 14.9 4 13.3 4 11.5z", stroke = 1.9f)
    val send = spec("M12 20V5M5.5 11.5 12 5l6.5 6.5", stroke = 2.8f)
    val close = spec("M6 6l12 12M18 6 6 18", stroke = 2.2f)
    val check = spec("m5 12.5 4.5 4.5L19 7.5", stroke = 2.4f)
    /** Read: two ticks. */
    val checks = spec("m2 12.5 4.5 4.5L16 7.5M11 16.5l.5.5L21 7.5", stroke = 2.2f)

    // Icon tiles (white glyph on a coloured rounded square), from Profile and Conference home.
    val star = spec("m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z", stroke = 2f)
    val card = spec("M3 6h18v12H3zM3 10h18", stroke = 2f)
    val gear = spec("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1", stroke = 2f)
    val mega = spec("M4 11v2h3l6 5V6L7 11zM17 9a4 4 0 0 1 0 6", stroke = 2f)
    val doc = spec("M6 3h9l4 4v14H6zM14 3v5h5", stroke = 2f)
    val book = spec("M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5", stroke = 2f)
    val cal = spec("M3.5 4.5h17v16h-17zM3.5 9.5h17M8 2.5v4M16 2.5v4", stroke = 2f)
    val info = spec("M12 8h.01M11 12h1v5h1M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", stroke = 2f)
    val live = spec("M5 12a7 7 0 0 1 14 0M8.5 12a3.5 3.5 0 0 1 7 0M12 12v8", stroke = 2f)
    // Live video controls (the web stage's Mic / MicOff / Video / VideoOff).
    val mic = spec("M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3", stroke = 2f)
    val micOff = spec("M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M4 4l16 16", stroke = 2f)
    val video = spec("M3.5 7h11v10h-11zM14.5 10.5l6-3.5v10l-6-3.5", stroke = 2f)
    val videoOff = spec("M3.5 7h11v10h-11zM14.5 10.5l6-3.5v10l-6-3.5M3 3l18 18", stroke = 2f)
    val people = spec("M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.9-3.3 3.4-5 6.5-5s5.6 1.7 6.5 5M16 4.5a3.3 3.3 0 0 1 0 6.4M18 15c1.8.6 3 2.2 3.5 5", stroke = 2f)
    val bubble = spec("M4 11.5C4 7.4 7.6 4.5 12 4.5s8 2.9 8 7-3.6 7-8 7c-1 0-2-.1-2.9-.4L5 19.5l1.1-3.3C4.8 14.9 4 13.3 4 11.5z", stroke = 2f)
    val folder = spec("M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", stroke = 2f)
    val list = spec("M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01", stroke = 2f)

    // The MUN Pilot redesign (board 00: 24 grid, 1.9 stroke, round caps).
    val messages = SfIconSpec(listOf(IconPart("M4 11.5C4 7.4 7.6 4.5 12 4.5s8 2.9 8 7-3.6 7-8 7c-1 0-2-.1-2.9-.4L5 19.5l1.1-3.3C4.8 14.9 4 13.3 4 11.5z", fillable = true)), stroke = 1.9f)
    val compose = spec("M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4zM14 6l3 3", stroke = 1.9f)
    val plus = spec("M12 5v14M5 12h14", stroke = 2.2f)
    val share = spec("M12 3v12M7.5 7.5 12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7", stroke = 1.9f)
    val more = spec("M5.5 12h.01M12 12h.01M18.5 12h.01", stroke = 3.2f)
    val flag = spec("M5 21V4M5 4h11l-2 4 2 4H5", stroke = 1.9f)
    val lock = spec("M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3", stroke = 1.9f)
    val eye = spec("M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", stroke = 1.9f)
    val monitor = spec("M3.5 4.5h17v11h-17zM8.5 20h7M12 15.5V20", stroke = 1.9f)
    val trophy = spec("M8 4h8v5a4 4 0 0 1-8 0zM8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M8.5 20.5h7M10 17h4v3.5h-4z", stroke = 1.9f)
    val key = spec("M14.5 9.5a4 4 0 1 1-1.2-2.8M13.3 6.7 19 1M17 3l2 2M15 5l2 2", stroke = 1.9f)
    val pause = spec("M9 5v14M15 5v14", stroke = 2.4f)
    val play = SfIconSpec(listOf(IconPart("M7 4.5v15l12-7.5z", fillable = true)), stroke = 1.9f)
    val gavel = spec("M13.5 4.5l6 6M11 7l6 6M12.5 5.5l-4 4 6 6 4-4M9.5 11.5 3 18l3 3 6.5-6.5", stroke = 1.9f)
    val mail = spec("M3.5 5.5h17v13h-17zM3.5 6l8.5 7 8.5-7", stroke = 1.9f)
    val chart = spec("M4 20h16M7 16v-5M12 16V7M17 16v-8", stroke = 1.9f)
    val moon = spec("M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z", stroke = 1.9f)
    val exit = spec("M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10", stroke = 1.9f)
    val refresh = spec("M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7", stroke = 1.9f)
    val sparkle = spec("M12 3.5l1.8 4.7 4.7 1.8-4.7 1.8L12 16.5l-1.8-4.7L5.5 10l4.7-1.8zM18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z", stroke = 1.7f)
    val text = spec("M4 19 8.5 6l4.5 13M5.6 14.5h5.8M15 19l2.8-8 2.7 8M15.8 16.5h3.9", stroke = 1.9f)
    val chevronRight = spec("m9 5 7 7-7 7", stroke = 2.4f)
    val alert = spec("M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5v5.5M12 16.5h.01", stroke = 2f)
    val clock = spec("M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2", stroke = 1.9f)
    val pin = spec("M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z", stroke = 1.9f)
    val minus = spec("M6 12h12", stroke = 2.4f)
    // The five-tab bar and Home (board A1).
    val home = SfIconSpec(listOf(IconPart("M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z", fillable = true)), stroke = 1.9f)
    val network = SfIconSpec(listOf(IconPart(circle(9f, 8f, 3.5f), fillable = true), IconPart("M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6")), stroke = 1.9f)
    val sliders = SfIconSpec(listOf(IconPart("M4 7h10M18 7h2M4 17h4M12 17h8"), IconPart(circle(16f, 7f, 2f)), IconPart(circle(10f, 17f, 2f))), stroke = 1.9f)
    val calPlus = SfIconSpec(listOf(IconPart(rect(3f, 4f, 18f, 18f, 3f)), IconPart("M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4")), stroke = 1.9f)
    val warning = spec("M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z", stroke = 1.9f)
    val camera = SfIconSpec(listOf(IconPart("M4 8h3l2-2.5h6L17 8h3v11H4z"), IconPart(circle(12f, 13f, 3.5f))), stroke = 1.9f)
    /** A QR code: three finder squares and a few modules (the personal pass). */
    val qr = spec("M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2h-2", stroke = 1.9f)
    val pen = spec("M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z", stroke = 1.9f)
    val signOut = spec("M10 4H5v16h5M14 8l4 4-4 4M18 12H9", stroke = 1.9f)
}

private val parsed = HashMap<String, Path>()

private fun pathOf(d: String): Path = parsed.getOrPut(d) { PathParser().parsePathString(d).toPath() }

@Composable
fun SfIcon(icon: SfIconSpec, color: Color, size: Dp = 24.dp, filled: Boolean = false, modifier: Modifier = Modifier) {
    val paths = remember(icon) { icon.parts.map { pathOf(it.d) to it.fillable } }
    Canvas(modifier.size(size)) {
        val k = this.size.minDimension / icon.viewBox
        scale(k, k, pivot = Offset.Zero) {
            for ((p, fillable) in paths) {
                if (filled && fillable) drawPath(p, color.copy(alpha = 0.18f))
                drawPath(p, color, style = Stroke(width = icon.stroke, cap = StrokeCap.Round, join = StrokeJoin.Round))
            }
        }
    }
}
