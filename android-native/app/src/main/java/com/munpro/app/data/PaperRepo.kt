package com.munpro.app.data

// Position papers, committee papers and the member roster.
//
// The paper is written exactly where the web's PositionPaperUpload.tsx writes it (on the
// application: positionPaperContent / Format / UpdatedAt). Like the web, an uploaded PDF or Word
// file is only read for its text; the file itself is never stored.

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.google.firebase.firestore.FirebaseFirestore
import com.munpro.app.domain.CommitteeDoc
import com.munpro.app.domain.Member
import com.munpro.app.domain.PaperMarking
import com.munpro.app.domain.sameCommittee
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.jsonObject
import java.util.Date
import java.util.zip.ZipInputStream

class PaperRepo(private val context: Context) {
    private val db = FirebaseFirestore.getInstance()

    suspend fun savePositionPaper(applicationId: String, content: String) {
        db.collection("applications").document(applicationId).update(
            mapOf(
                "positionPaperContent" to content,
                "positionPaperFormat" to "markdown",
                "positionPaperUpdatedAt" to Date(),
            ),
        ).await()
    }

    /** The chair's verdict (markingService.getDelegateMarking, the delegate's self-read shape). */
    suspend fun paperMarking(applicationId: String, delegateId: String): PaperMarking? = runCatching {
        db.collection("markings").whereEqualTo("applicationId", applicationId).whereEqualTo("delegateId", delegateId).get().await()
            .documents.firstOrNull()?.decode<PaperMarking>()
    }.getOrNull()

    /** Approved papers of one committee, newest first (committeeDocService.listApprovedCommitteeDocs). */
    suspend fun approvedCommitteeDocs(eventId: String, committee: String): List<CommitteeDoc> =
        db.collection("events").document(eventId).collection("committeeDocs").whereEqualTo("status", "approved").get().await()
            .documents.mapNotNull { it.decode<CommitteeDoc>() }
            .filter { sameCommittee(it.committee, committee) }
            .sortedByDescending { it.createdAt ?: 0L }

    suspend fun committeeDoc(eventId: String, id: String): CommitteeDoc? =
        db.collection("events").document(eventId).collection("committeeDocs").document(id).get().await()
            .takeIf { it.exists() }?.decode<CommitteeDoc>()

    /**
     * The event roster from the web's server route (delegates can't read applications or staff
     * themselves). Null when the site's API isn't configured or the call fails.
     */
    suspend fun members(eventId: String): List<Member>? {
        val j = Api.call("/api/events/$eventId/members") ?: return null
        return runCatching { MunJson.decodeFromJsonElement(ListSerializer(Member.serializer()), j.jsonObject["members"]!!) }.getOrNull()
    }

    // ---- reading a picked file ----

    data class Picked(val name: String, val size: Long, val text: String)

    class PickError(message: String) : Exception(message)

    /** The text of a picked .pdf, .docx, .md or .txt — the same limits the web applies. */
    suspend fun readPicked(uri: Uri): Picked = withContext(Dispatchers.IO) {
        val cr = context.contentResolver
        var name = "document"
        var size = -1L
        cr.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
            if (c.moveToFirst()) {
                name = c.getString(0) ?: name
                size = if (c.isNull(1)) -1 else c.getLong(1)
            }
        }
        val mime = cr.getType(uri).orEmpty()
        val lower = name.lowercase()
        val text = when {
            mime == "application/pdf" || lower.endsWith(".pdf") -> {
                if (size > 20L * 1024 * 1024) throw PickError("PDF must be under 20MB.")
                pdfToMarkdown(uri)
            }
            lower.endsWith(".docx") || mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" -> {
                if (size > 20L * 1024 * 1024) throw PickError("The document must be under 20MB.")
                docxToMarkdown(uri)
            }
            lower.endsWith(".md") || lower.endsWith(".txt") || mime.startsWith("text/") -> {
                if (size > 2L * 1024 * 1024) throw PickError("File must be under 2MB.")
                cr.openInputStream(uri)!!.bufferedReader().use { it.readText() }
            }
            else -> throw PickError("Choose a PDF, a Word document (.docx) or a .md file.")
        }
        if (text.isBlank()) throw PickError("No text could be read from that file. If it's a scanned PDF, paste the text instead.")
        Picked(name, size, text.trim())
    }

    /** Port of the web's pdfToMarkdown heuristics: page text by lines, ALL CAPS short line → heading. */
    private fun pdfToMarkdown(uri: Uri): String {
        PDFBoxResourceLoader.init(context)
        context.contentResolver.openInputStream(uri)!!.use { input ->
            PDDocument.load(input).use { doc ->
                val stripper = PDFTextStripper()
                val pages = (1..doc.numberOfPages).map { p ->
                    stripper.startPage = p
                    stripper.endPage = p
                    stripper.getText(doc).split("\n").map { it.trim() }.filter { it.isNotEmpty() }
                        .joinToString("\n\n") { l -> if (l.length < 80 && l == l.uppercase() && l.any { it.isLetter() }) "## $l" else l }
                }
                return pages.joinToString("\n\n---\n\n").trim()
            }
        }
    }

    /** A .docx is a zip; its paragraphs are <w:p> in word/document.xml. Headings keep their level. */
    private fun docxToMarkdown(uri: Uri): String {
        val xml = context.contentResolver.openInputStream(uri)!!.use { input ->
            ZipInputStream(input).use { zip ->
                generateSequence { zip.nextEntry }.firstOrNull { it.name == "word/document.xml" } ?: throw PickError("That Word file couldn't be read.")
                zip.readBytes().toString(Charsets.UTF_8)
            }
        }
        return Regex("<w:p[ >].*?</w:p>", RegexOption.DOT_MATCHES_ALL).findAll(xml).map { m ->
            val p = m.value
            val text = Regex("<w:t[^>]*>(.*?)</w:t>", RegexOption.DOT_MATCHES_ALL).findAll(p).joinToString("") { it.groupValues[1] }
                .replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'")
            val level = Regex("<w:pStyle w:val=\"Heading(\\d)\"").find(p)?.groupValues?.get(1)?.toIntOrNull()
            when {
                text.isBlank() -> ""
                level != null -> "${"#".repeat(level.coerceIn(1, 3))} $text"
                p.contains("<w:numPr>") -> "- $text"
                else -> text
            }
        }.filter { it.isNotEmpty() }.joinToString("\n\n")
    }
}
