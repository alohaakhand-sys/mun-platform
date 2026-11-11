package com.munpro.app.ui.pass

// The pass's thin top band is "the country's colours" (mockup .pass::before). There is no colour
// table for 250 flags, so the band is taken from the flag the phone already draws: the emoji is
// rendered small, its pixels bucketed, and the 1–3 dominant colours laid left→right in the order
// they sit in the flag, each as wide as its share. France comes out blue/white/red, Japan
// white/red, Brazil green/yellow.

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import androidx.compose.ui.graphics.Color
import com.munpro.app.domain.flagEmoji

data class BandStripe(val color: Color, val weight: Float)

private val bandCache = HashMap<String, List<BandStripe>>()

fun flagBand(country: String): List<BandStripe> = bandCache.getOrPut(country.lowercase()) { sample(flagEmoji(country)) }

private fun sample(emoji: String): List<BandStripe> {
    val w = 64
    val h = 64
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 56f; textAlign = Paint.Align.CENTER }
    Canvas(bmp).drawText(emoji, w / 2f, h / 2f - (paint.descent() + paint.ascent()) / 2, paint)

    class Bucket { var n = 0; var r = 0L; var g = 0L; var b = 0L; var x = 0L }
    val buckets = HashMap<Int, Bucket>()
    var total = 0
    val px = IntArray(w * h)
    bmp.getPixels(px, 0, w, 0, 0, w, h)
    for (y in 0 until h) for (x in 0 until w) {
        val p = px[y * w + x]
        if ((p ushr 24) < 200) continue // transparent edges and antialiasing
        val r = (p shr 16) and 0xFF
        val g = (p shr 8) and 0xFF
        val b = p and 0xFF
        val key = ((r shr 5) shl 6) or ((g shr 5) shl 3) or (b shr 5)
        val k = buckets.getOrPut(key) { Bucket() }
        k.n++; k.r += r; k.g += g; k.b += b; k.x += x
        total++
    }
    bmp.recycle()
    if (total == 0) return listOf(BandStripe(Color(0xFF0A7C57), 1f)) // no emoji font: the tint

    val top = buckets.values.sortedByDescending { it.n }
        .filter { it.n >= total * 0.06 }
        .take(3)
        .ifEmpty { listOf(buckets.values.maxBy { it.n }) }
    val sum = top.sumOf { it.n }.toFloat()
    return top.sortedBy { it.x.toDouble() / it.n }
        .map { BandStripe(Color((it.r / it.n).toInt(), (it.g / it.n).toInt(), (it.b / it.n).toInt()), it.n / sum) }
}
