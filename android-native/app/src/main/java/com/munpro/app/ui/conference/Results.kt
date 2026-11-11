package com.munpro.app.ui.conference

// Results and the certificate (board B3.6–B3.10; web portal ?tab=results and ?tab=certificate,
// markingScore.ts). Results: the final % and how it was computed (the same consistency-first
// formula the chair's console uses: counted days averaged, blended with the chair's overall),
// criteria, the chair's feedback, the daily breakdown and the committee board the chair published.
// "Published" means the chair saved the final rollup; before that it's provisional.
// The certificate unlocks with an organizer-approved award, as on the web, and also (the owner's
// rule) once the final score is published, as a certificate of participation. It's drawn on the
// phone and saved through Android's print-to-PDF, since the server PDF function isn't running.

import android.content.Context
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.munpro.app.AppGraph
import com.munpro.app.data.AwardResult
import com.munpro.app.data.Fresh
import com.munpro.app.data.Standings
import com.munpro.app.data.awardLabel
import com.munpro.app.data.rememberCached
import com.munpro.app.domain.Conference
import com.munpro.app.domain.DEFAULT_OVERALL_WEIGHT
import com.munpro.app.domain.DailyMarking
import com.munpro.app.domain.committeeOf
import com.munpro.app.domain.computeDailyScore
import com.munpro.app.domain.computeFinalScore
import com.munpro.app.domain.countryName
import com.munpro.app.domain.dayLabel
import com.munpro.app.domain.deriveDays
import com.munpro.app.domain.getEventStartMs
import com.munpro.app.domain.markingMode
import com.munpro.app.domain.splitMarkings
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.Chip
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Flag
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.Hairline
import com.munpro.app.ui.kit.Inter
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SectionFooter
import com.munpro.app.ui.kit.SectionHeader
import com.munpro.app.ui.kit.Spinner
import com.munpro.app.ui.kit.Tone
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.nullable
import kotlin.math.roundToInt

@Composable
private fun rememberMarks(conf: Conference) = AppGraph.auth.user?.uid.let { uid ->
    rememberCached(uid?.let { "results:${conf.event.id}:$it" }, ListSerializer(DailyMarking.serializer()), Fresh.SHORT) { AppGraph.modules.myMarkings(conf.event.id, uid!!) }
}

@Composable
private fun rememberAwardResults(conf: Conference) = AppGraph.auth.user?.uid.let { uid ->
    rememberCached(uid?.let { "awardResults:${conf.event.id}:$it" }, ListSerializer(AwardResult.serializer()), Fresh.SHORT) { AppGraph.modules.myResults(conf.event.id, uid!!) }
}

private fun approvedAward(results: List<AwardResult>?): String? =
    results.orEmpty().firstOrNull { it.status == "approved" }?.let { awardLabel(it.awardType) }

private fun signed(v: Double) = v.roundToInt().let { if (it > 0) "+$it" else "$it" }

private fun dayName(d: String) = runCatching { dayLabel(java.time.LocalDate.parse(d)) }.getOrDefault(d)

// ---------------------------------------------------------------------------------------------
// B3.8–B3.10 · Results
// ---------------------------------------------------------------------------------------------

@Composable
fun ResultsScreen(conf: Conference) {
    val c = palette
    val (app, event) = conf
    val marks = rememberMarks(conf)
    val awards = rememberAwardResults(conf)
    val committee = committeeOf(app)
    val board = rememberCached(if (committee.isEmpty()) null else "standings:${event.id}:$committee", Standings.serializer().nullable, Fresh.SHORT) {
        AppGraph.modules.standings(event.id, committee)
    }
    var reportOpen by remember { mutableStateOf(false) }

    Screen(back = "Portal", tabBar = false, title = "Results", overline = event.title, savedAt = marks.savedAt, onRefresh = {}) {
        val all = marks.data
        if (all == null) { if (marks.failed) ErrorText("Couldn't load your results. Pull to try again.") else Spinner(); return@Screen }
        val (daily, final) = splitMarkings(all)
        val published = final != null
        val templates = event.markingTemplates
        val days = final?.days?.takeIf { it.isNotEmpty() } ?: deriveDays(daily.filter { it.dateStr != null }, event.scoringConfig?.markingDays.orEmpty())
        if (!published && days.isEmpty()) {
            Empty("Results not published yet", "Your chairs are still marking. Your score, feedback and standing appear here once they publish.", icon = Icons.chart)
            Section { cell("Session report", subtitle = "Your speeches, points, motions and votes by day", onClick = { reportOpen = true }) }
            SessionReport(conf, reportOpen) { reportOpen = false }
            return@Screen
        }
        val weight = final?.overallWeight ?: event.scoringConfig?.overallWeight ?: DEFAULT_OVERALL_WEIGHT
        val mode = final?.markMode ?: markingMode(event)
        val live = computeFinalScore(daily.filter { it.dateStr != null }, templates, days, final?.chairOverall, weight, mode)
        val score = final?.finalScore?.roundToInt() ?: live.finalScore
        val computed = final?.computedPct ?: live.computedPct
        val award = approvedAward(awards.data)

        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Your final score", style = Type.subhead, color = c.label2, modifier = Modifier.weight(1f))
                Chip(if (published) "Published" else "Provisional", if (published) Tone.Tint else Tone.Warning)
            }
            Text("$score%", fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 48.sp, letterSpacing = (-1.6).sp, color = c.label)
            Box(Modifier.fillMaxWidth().height(6.dp).clip(CircleShape).background(c.fillSoft)) {
                Box(Modifier.fillMaxWidth(score / 100f).height(6.dp).clip(CircleShape).background(c.tint))
            }
            Text(
                listOfNotNull(
                    "Computed ${computed.roundToInt()}%",
                    (final?.chairOverall ?: live.chairOverall)?.takeIf { published }?.let { "chair overall ${it.roundToInt()} · blended ${(weight * 100).roundToInt()}%" },
                    "present ${live.presentDays} of ${live.dayCount} day${if (live.dayCount == 1) "" else "s"}",
                ).joinToString(" · "),
                style = Type.footnote, color = c.label2,
            )
            award?.let { Text(it, style = Type.subhead.copy(fontWeight = FontWeight.SemiBold), color = c.gold) }
            if (!published) Text("Aggregate so far: your chair hasn't published the final yet.", style = Type.footnote, color = c.label2)
        }

        // Criteria: the mean of each criterion's daily value, and how many marks fed it.
        val byDay = daily.filter { it.dateStr in days }
        if (templates.isNotEmpty()) Section(header = "Criteria") {
            templates.forEach { t ->
                val values = byDay.mapNotNull { m -> computeDailyScore(m, templates, mode).rows.firstOrNull { it.id == t.id }?.value }
                val count = byDay.sumOf { m -> m.scoreEntries[t.id]?.size ?: if (m.scores[t.id] != null) 1 else 0 }
                cell(t.name, subtitle = "$count mark${if (count == 1) "" else "s"}", value = if (values.isEmpty()) "—" else signed(values.average()), chevron = false)
            }
        }
        daily.filter { it.feedback.isNotBlank() && it.dateStr != null }.maxByOrNull { it.dateStr!! }?.let { f ->
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Chair feedback", style = Type.caption, color = c.label2)
                Text(f.feedback, style = Type.body, color = c.label)
            }
        }

        if (days.isNotEmpty()) Section(header = "Daily breakdown", footer = "A day you attended that wasn't scored isn't counted; a day you missed counts as 0%.") {
            days.forEach { d ->
                val ds = computeDailyScore(byDay.firstOrNull { it.dateStr == d }, templates, mode)
                val counted = live.counted.firstOrNull { it.first == d }?.second != false
                cell(dayName(d), value = when { ds.present && ds.pct != null -> "${ds.pct.roundToInt()}%"; !counted -> "Not counted"; else -> "Absent" }, chevron = false)
            }
        }

        val b = board.data
        val me = AppGraph.auth.user?.uid
        val mine = b?.entries?.firstOrNull { it.delegateId == me }
        if (b != null && mine != null) {
            SectionHeader("Committee standing · #${mine.rank ?: "–"} of ${b.entries.size}")
            if (b.visibility == "rank_only") SectionFooter("Your chair published placements only; other delegates' scores stay private.")
            else Section(footer = "Ties share a rank.") {
                b.entries.sortedBy { it.rank ?: Int.MAX_VALUE }.forEach { e ->
                    val you = e.delegateId == me
                    cell(
                        "${e.rank ?: "–"}  ${countryName(e.country).ifEmpty { e.name }}" + if (you) " · you" else "",
                        leading = { Flag(e.country, 20f) }, inset = 52.dp, chevron = false, tinted = you,
                        value = e.finalScore?.let { "${it.roundToInt()}%" },
                    )
                }
            }
        }
        Section { cell("Session report", subtitle = "Your speeches, points, motions and votes by day", onClick = { reportOpen = true }) }
    }
    SessionReport(conf, reportOpen) { reportOpen = false }
}

@Composable
private fun SessionReport(conf: Conference, open: Boolean, onClose: () -> Unit) {
    val uid = AppGraph.auth.user?.uid ?: return
    val committee = committeeOf(conf.app)
    if (committee.isEmpty()) return
    val today = remember(conf.event.timeZone) { com.munpro.app.domain.live.sessionDateStr(conf.event.timeZone) }
    com.munpro.app.ui.live.OwnReportSheet(open, onClose, conf.event.id, conf.event.title, committee,
        com.munpro.app.domain.live.ParticipationIdentity(uid, conf.app.assignedCountry.orEmpty(), conf.app.id, conf.event.id, committee, today), today)
}

// ---------------------------------------------------------------------------------------------
// B3.6–B3.7 · Certificate
// ---------------------------------------------------------------------------------------------

private data class Certificate(val title: String, val name: String, val line: String, val award: String?, val conference: String, val dates: String)

private fun certificateOf(conf: Conference, award: String?): Certificate {
    val (app, event) = conf
    // The person's own name first (the web preview uses it too); the application's copy as a fallback.
    val name = AppGraph.auth.profile?.fullName?.ifBlank { null } ?: app.applicantName?.ifBlank { null } ?: "Delegate"
    val seat = listOfNotNull(app.assignedCountry?.ifBlank { null }?.let { "Delegate of ${countryName(it)}" } ?: app.role.ifBlank { null }, committeeOf(app).ifBlank { null }).joinToString(", ")
    val start = getEventStartMs(event)?.let { java.time.Instant.ofEpochMilli(it).atZone(java.time.ZoneId.systemDefault()).toLocalDate() }
    val end = event.endDate?.let { runCatching { java.time.LocalDate.parse(it.take(10)) }.getOrNull() }
    val fmt = java.time.format.DateTimeFormatter.ofPattern("d MMMM yyyy", java.util.Locale.UK)
    val dates = when {
        start == null -> event.date
        end == null || end == start -> start.format(fmt)
        start.month == end.month && start.year == end.year -> "${start.dayOfMonth}–${end.format(fmt)}"
        else -> "${start.format(fmt)} – ${end.format(fmt)}"
    }
    return Certificate(
        title = if (award != null) "Certificate of Award" else "Certificate of Participation",
        name = name,
        line = if (award != null) "$seat, for the award of" else "for participating as $seat in",
        award = award,
        conference = event.title,
        dates = dates,
    )
}

@Composable
fun CertificateScreen(conf: Conference) {
    val c = palette
    val context = LocalContext.current
    val marks = rememberMarks(conf)
    val awards = rememberAwardResults(conf)
    val award = approvedAward(awards.data)
    val final = marks.data?.let { splitMarkings(it).second }
    val unlocked = award != null || final != null
    Screen(back = "Portal", tabBar = false, title = "Certificate", overline = conf.event.title, onRefresh = {}) {
        when {
            !marks.has || !awards.has -> if (marks.failed || awards.failed) ErrorText("Couldn't check your certificate. Pull to try again.") else Spinner()
            !unlocked -> {
                Empty("Not available yet", "Your chairs submit results after the conference. Once your final score is published, or the organizer approves your award, the certificate appears here.", icon = Icons.trophy)
                if (!marks.data.isNullOrEmpty()) Section { cell("Results", value = "Provisional score available", chevron = false) }
            }
            else -> {
                val cert = certificateOf(conf, award)
                // The organizer's template (Tools › Certificates): paper, border and alignment.
                val template = com.munpro.app.domain.certificateTemplate(conf.event.certificateTemplate)
                val look = com.munpro.app.ui.organizer.certLook(template)
                val ink = Color(0xFF1E293B)
                val sub = Color(0xFF64748B)
                val frame = when (template) {
                    "modern" -> Modifier.border(Hairline, Color(0xFFE2E8F0), RoundedCornerShape(Radius.cell))
                    "ornate" -> Modifier.border(8.dp, look.border, RoundedCornerShape(Radius.cell))
                    else -> Modifier.border(4.dp, look.border, RoundedCornerShape(Radius.cell))
                }
                Row(Modifier.fillMaxWidth().height(androidx.compose.foundation.layout.IntrinsicSize.Min).clip(RoundedCornerShape(Radius.cell)).background(look.paper).then(frame)) {
                if (template == "modern") Box(Modifier.width(10.dp).fillMaxHeight().background(look.border))
                Column(
                    Modifier.weight(1f).padding(22.dp),
                    horizontalAlignment = if (look.centered) Alignment.CenterHorizontally else Alignment.Start, verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(cert.conference.uppercase(), style = Type.caption.copy(letterSpacing = 1.5.sp), color = sub, textAlign = (if (look.centered) TextAlign.Center else TextAlign.Start))
                    Text(cert.title, style = Type.title2.copy(fontFamily = (if (look.serif) FontFamily.Serif else FontFamily.Default), letterSpacing = 0.sp), color = look.accent, textAlign = (if (look.centered) TextAlign.Center else TextAlign.Start))
                    Text("presented to", style = Type.subhead.copy(fontStyle = FontStyle.Italic, fontFamily = (if (look.serif) FontFamily.Serif else FontFamily.Default)), color = sub)
                    Text(cert.name, style = Type.title.copy(fontFamily = (if (look.serif) FontFamily.Serif else FontFamily.Default), letterSpacing = 0.sp), color = ink, textAlign = (if (look.centered) TextAlign.Center else TextAlign.Start))
                    Text(cert.line, style = Type.subhead, color = ink, textAlign = (if (look.centered) TextAlign.Center else TextAlign.Start))
                    Text(cert.award ?: cert.conference, style = Type.headline.copy(fontFamily = (if (look.serif) FontFamily.Serif else FontFamily.Default)), color = look.accent, textAlign = (if (look.centered) TextAlign.Center else TextAlign.Start))
                    Text(cert.dates, style = Type.footnote, color = sub)
                    Row(Modifier.padding(top = 18.dp), horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                        listOf("Secretary-General", "Organizing Chair").forEach { s ->
                            Column(Modifier.width(120.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFF94A3B8)))
                                Text(s, style = Type.caption.copy(fontWeight = FontWeight.Normal), color = sub, modifier = Modifier.padding(top = 4.dp))
                            }
                        }
                    }
                }
                }
                MunButton("Save PDF", { printCertificate(context, cert, template) })
                MunButton("Print", { printCertificate(context, cert, template) }, variant = ButtonVariant.Tinted)
                SectionFooter("Save PDF opens Android's print screen; choose “Save as PDF” as the printer.")
            }
        }
    }
}

private var printing: WebView? = null

private fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

private fun printCertificate(context: Context, cert: Certificate, template: String) {
    val html = """
        <!DOCTYPE html><html><head><meta charset="utf-8"><style>
        @page{size:A4 landscape;margin:0}
        body{margin:0;font-family:Georgia,serif;color:#1e293b}
        .s{box-sizing:border-box;width:100%;height:100vh;padding:48px 64px;display:flex;flex-direction:column;justify-content:center;gap:10px;${when (template) {
            "modern" -> "border-left:18px solid #7c3aed;text-align:left;font-family:sans-serif;background:#fff"
            "ornate" -> "border:18px solid #d4af37;text-align:center;background:#fff"
            else -> "border:12px double #1e293b;text-align:center;background:#fdfbf7"
        }}}
        h1,.a{color:${when (template) { "modern" -> "#7c3aed"; "ornate" -> "#b08d2e"; else -> "#1e293b" }}}
        .k{font-family:sans-serif;letter-spacing:4px;font-size:12px;color:#64748b;text-transform:uppercase}
        h1{font-size:40px;margin:6px 0}
        .p{font-style:italic;color:#64748b}
        .n{font-size:36px;color:#0f172a}
        .a{font-size:26px}
        .sig{display:flex;justify-content:${if (template == "modern") "flex-start;gap:60px" else "space-around"};margin-top:40px}
        .sig div{width:220px;border-top:1px solid #94a3b8;padding-top:6px;font-family:sans-serif;font-size:12px;color:#64748b}
        </style></head><body><div class="s">
        <div class="k">${esc(cert.conference)}</div>
        <h1>${esc(cert.title)}</h1>
        <div class="p">presented to</div>
        <div class="n">${esc(cert.name)}</div>
        <div>${esc(cert.line)}</div>
        <div class="a">${esc(cert.award ?: cert.conference)}</div>
        <div class="p">${esc(cert.dates)}</div>
        <div class="sig"><div>Secretary-General</div><div>Organizing Chair</div></div>
        </div></body></html>
    """.trimIndent()
    val view = WebView(context)
    printing = view
    view.webViewClient = object : WebViewClient() {
        override fun onPageFinished(v: WebView, url: String?) {
            val pm = context.getSystemService(Context.PRINT_SERVICE) as PrintManager
            pm.print("Certificate - ${cert.conference}", v.createPrintDocumentAdapter("certificate"),
                PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4.asLandscape()).build())
            printing = null
        }
    }
    view.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
}
