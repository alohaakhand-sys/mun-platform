package com.munpro.app.ui.kit

// A small reader for the markdown the web's rich-text editor produces (announcements, rules,
// study guides, event descriptions): headings, paragraphs, bulleted and numbered lists, with
// bold/italic/link markup dropped. Set for reading: one column, generous line height.
// Port of mobile/src/components/Markdown.tsx.

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private fun inline(s: String) = s
    .replace(Regex("!\\[[^\\]]*]\\([^)]*\\)"), "")
    .replace(Regex("\\[([^\\]]+)]\\([^)]*\\)"), "$1")
    .replace(Regex("(\\*\\*|__)(.+?)\\1"), "$2")
    .replace(Regex("(\\*|_)(.+?)\\1"), "$2")
    .replace(Regex("`([^`]+)`"), "$1")
    .replace(Regex("<[^>]+>"), "")
    .replace("&nbsp;", " ")
    .trim()

private data class Block(val kind: String, val text: String, val n: Int = 0)

private fun parse(md: String): List<Block> {
    val out = mutableListOf<Block>()
    val para = mutableListOf<String>()
    fun flush() {
        if (para.isNotEmpty()) { out += Block("p", inline(para.joinToString(" "))); para.clear() }
    }
    val h = Regex("^(#{1,3})\\s+(.*)$")
    val li = Regex("^[-*+]\\s+(.*)$")
    val ol = Regex("^(\\d+)[.)]\\s+(.*)$")
    for (raw in md.replace("\r", "").split("\n")) {
        val line = raw.trim()
        if (line.isEmpty()) { flush(); continue }
        val hm = h.find(line)
        val lm = li.find(line)
        val om = ol.find(line)
        when {
            hm != null -> { flush(); out += Block("h${hm.groupValues[1].length}", inline(hm.groupValues[2])) }
            lm != null -> { flush(); out += Block("li", inline(lm.groupValues[1])) }
            om != null -> { flush(); out += Block("ol", inline(om.groupValues[2]), om.groupValues[1].toInt()) }
            else -> para += line
        }
    }
    flush()
    return out.filter { it.text.isNotEmpty() }
}

/** Strips markdown for one-line previews (Announcements list). */
fun markdownPreview(md: String): String =
    md.replace(Regex("[#*_>`\\[\\]]"), "").replace(Regex("\\([^)]*\\)"), "").replace(Regex("\\s+"), " ").trim()

/** [serif] sets long reading (a blog post) in the system serif; [scale] is the reader's text size. */
@Composable
fun Markdown(source: String, serif: Boolean = false, scale: Float = 1f) {
    val c = palette
    val blocks = remember(source) { parse(source) }
    val body = Type.body.copy(
        fontSize = (16.5f * scale).sp, lineHeight = (26f * scale).sp,
        fontFamily = if (serif) androidx.compose.ui.text.font.FontFamily.Serif else Type.body.fontFamily,
        letterSpacing = if (serif) 0.sp else Type.body.letterSpacing,
    )
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        blocks.forEachIndexed { i, b ->
            when (b.kind) {
                "h1", "h2" -> Text(b.text, style = Type.title2, color = c.label, modifier = Modifier.padding(top = if (i > 0) 10.dp else 0.dp).semantics { heading() })
                "h3" -> Text(b.text, style = Type.headline, color = c.label, modifier = Modifier.padding(top = 6.dp).semantics { heading() })
                "li", "ol" -> Row(Modifier.padding(start = 2.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(if (b.kind == "ol") "${b.n}." else "•", style = body.copy(fontWeight = FontWeight.Medium), color = c.label2, modifier = Modifier.widthIn(min = 14.dp))
                    Text(b.text, style = body, color = c.label, modifier = Modifier.weight(1f))
                }
                else -> Text(b.text, style = body, color = c.label)
            }
        }
    }
}
