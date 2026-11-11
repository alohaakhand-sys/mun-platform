package com.munpro.app.ui.live

// The day's session report (web SessionReport.tsx). Two views:
//  - committee (dais): every delegation's participation, the totals and the voting record;
//  - own (delegate): one delegation's card — a delegate may only read their own participation.
// Read once on open (Refresh reads again), like the web. Share sends a plain-text copy through
// the Android share sheet, where the web offers Print and a PDF.

import com.munpro.app.ui.kit.Flag
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.munpro.app.AppGraph
import com.munpro.app.domain.countryName
import com.munpro.app.domain.flagEmoji
import com.munpro.app.domain.live.CommitteeReport
import com.munpro.app.domain.live.DelegateReportRow
import com.munpro.app.domain.live.ParticipationIdentity
import com.munpro.app.domain.live.REPORT_POINT_TYPES
import com.munpro.app.domain.live.attendanceShort
import com.munpro.app.domain.live.fmtSpeaking
import com.munpro.app.domain.live.pointLabel
import com.munpro.app.ui.kit.Emoji
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.Inter
import com.munpro.app.ui.kit.Loading
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.Space
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import java.time.LocalDate

private const val FAIL = "Couldn't load the report. Check your connection and try again."

/** "1/0/0/0" in the web's O / I / PP / PI order, or "—" with none. */
private fun pointsLine(r: DelegateReportRow) =
    if (r.pointsTotal == 0) "—" else REPORT_POINT_TYPES.joinToString("/") { "${r.pointsByType[it] ?: 0}" }

private fun plural(n: Long, one: String, many: String = one + "s") = "$n ${if (n == 1L) one else many}"

private fun yieldsLine(r: DelegateReportRow) =
    r.yieldsGiven.map { countryName(it.targetCountry).ifEmpty { it.targetCountry } }.filter { it.isNotEmpty() }.joinToString(", ")

@Composable
fun CommitteeReportSheet(
    visible: Boolean, onDismiss: () -> Unit,
    eventId: String, eventTitle: String, committee: String, dateStr: String,
    /** The committee roll: names for the rows, and the quorum the web derives from its size. */
    names: Map<String, String>, rosterSize: Int,
) {
    val c = palette
    val context = LocalContext.current
    var day by remember(dateStr) { mutableStateOf(dateStr) }
    var report by remember { mutableStateOf<CommitteeReport?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var loads by remember { mutableIntStateOf(0) }
    LaunchedEffect(visible, loads, day) {
        if (!visible) return@LaunchedEffect
        error = null
        report = runCatching { AppGraph.sessions.committeeReport(eventId, committee, day, maxOf(1, (rosterSize + 1) / 2)) }
            .onFailure { error = FAIL }.getOrNull()
    }

    PageSheet(visible, onDismiss) {
        SheetHeader("Session Report", subtitle = committee, leading = "Done", onLeading = onDismiss,
            trailing = "Share", trailingEnabled = report?.rows?.isNotEmpty() == true, onTrailing = {
                report?.let { r -> share(context, "$committee report, $day", committeeText(eventTitle, committee, day, r, names)) }
            })
        val nav = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 8.dp, bottom = nav + 32.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)) {
            DayPicker(day, dateStr) { day = it }
            val r = report
            when {
                r == null && error == null -> Loading()
                r == null -> Empty("Report unavailable", error!!)
                r.rows.isEmpty() -> Empty("Nothing recorded yet", "No participation recorded for this day yet.")
                else -> {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Stat("${r.rows.size}", "Delegates", Modifier.weight(1f))
                        Stat("${r.present}/${r.quorum}", "Quorum", Modifier.weight(1f), tint = com.munpro.app.ui.kit.SystemColors.green)
                        Stat("${r.totalSpeeches}", "Speeches", Modifier.weight(1f))
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Stat(fmtSpeaking(r.totalSpeakingSeconds), "Speaking time", Modifier.weight(1f))
                        Stat("${r.votes.size}", "Votes", Modifier.weight(1f), tint = c.tint)
                    }
                    Section(header = "Delegations", footer = "Points are order / information / personal privilege / parliamentary inquiry.") {
                        r.rows.forEach { row ->
                            item {
                                Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    Flag(row.country, 22f)
                                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Text(countryName(row.country).ifEmpty { row.country.ifEmpty { "—" } }, style = Type.bodyMedium, color = c.label, modifier = Modifier.weight(1f))
                                            Text(attendanceShort(row.attendanceStatus), style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = c.label2)
                                        }
                                        names[row.delegateId]?.ifEmpty { null }?.let { Text(it, style = Type.footnote, color = c.label2) }
                                        Text(
                                            "${plural(row.speeches, "speech", "speeches")} · ${fmtSpeaking(row.speakingSeconds)} · points ${pointsLine(row)} · ${plural(row.motions, "motion")} · ${plural(row.votesCast, "vote")}",
                                            style = Type.footnote.copy(fontFeatureSettings = "tnum"), color = c.label,
                                        )
                                        yieldsLine(row).ifEmpty { null }?.let { Text("Yielded to $it", style = Type.footnote, color = c.label2) }
                                    }
                                }
                            }
                        }
                    }
                    if (r.votes.isNotEmpty()) {
                        Section(header = "Voting record") {
                            r.votes.forEach { v ->
                                cell(v.motion.ifEmpty { "Vote" }, chevron = false,
                                    value = "${v.affirmative}-${v.negative}-${v.abstentions} · ${v.result.uppercase()}")
                            }
                        }
                    }
                }
            }
            if (report != null) Pill("Refresh", { loads++ })
        }
    }
}

/** A delegate's own card, with a day picker (the web's date input on the conference page). */
@Composable
fun OwnReportSheet(
    visible: Boolean, onDismiss: () -> Unit,
    eventId: String, eventTitle: String, committee: String, identity: ParticipationIdentity, today: String,
) {
    val c = palette
    val context = LocalContext.current
    var day by remember(today) { mutableStateOf(today) }
    var row by remember { mutableStateOf<DelegateReportRow?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    LaunchedEffect(visible, day) {
        if (!visible) return@LaunchedEffect
        loading = true; error = null; row = null
        row = runCatching { AppGraph.sessions.myReportRow(eventId, committee, day, identity) }.onFailure { error = FAIL }.getOrNull()
        loading = false
    }
    val country = countryName(identity.country).ifEmpty { "Your delegation" }

    PageSheet(visible, onDismiss) {
        SheetHeader("Session Report", subtitle = "$committee · $day", leading = "Done", onLeading = onDismiss,
            trailing = "Share", trailingEnabled = row != null, onTrailing = {
                row?.let { r -> share(context, "$country report, $day", ownText(eventTitle, committee, day, country, r)) }
            })
        val nav = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 8.dp, bottom = nav + 32.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)) {
            DayPicker(day, today) { day = it }
            val r = row
            when {
                loading -> Loading()
                r == null -> Empty("Report unavailable", error ?: FAIL)
                else -> {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Flag(identity.country, 30f)
                        Column {
                            Text(country, style = Type.title2, color = c.label)
                            Text("Attendance: ${attendanceShort(r.attendanceStatus)}", style = Type.footnote, color = c.label2)
                        }
                    }
                    val stats = listOf(
                        "Speeches" to "${r.speeches}", "Speaking time" to fmtSpeaking(r.speakingSeconds), "Caucus speeches" to "${r.caucusSpeeches}",
                    ) + REPORT_POINT_TYPES.map { pointLabel(it) to "${r.pointsByType[it] ?: 0}" } +
                        listOf("Motions raised" to "${r.motions}", "Votes cast" to "${r.votesCast}")
                    stats.chunked(2).forEach { pair ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            pair.forEach { (label, n) -> Stat(n, label, Modifier.weight(1f)) }
                            if (pair.size == 1) Column(Modifier.weight(1f)) {}
                        }
                    }
                    yieldsLine(r).ifEmpty { null }?.let { Text("Yielded to: $it", style = Type.subhead, color = c.label2) }
                }
            }
        }
    }
}

/** Step a day at a time, never past [today] (the web's date input). */
@Composable
private fun DayPicker(day: String, today: String, onPick: (String) -> Unit) {
    val c = palette
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Pill("‹ Earlier", { onPick(LocalDate.parse(day).minusDays(1).toString()) })
        Text(runCatching { LocalDate.parse(day).let { "${it.dayOfMonth} ${it.month.name.lowercase().replaceFirstChar(Char::uppercase)} ${it.year}" } }.getOrDefault(day),
            style = Type.headline, color = c.label, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
        Pill("Later ›", { onPick(LocalDate.parse(day).plusDays(1).toString()) }, enabled = day < today)
    }
}

@Composable
private fun Stat(n: String, label: String, modifier: Modifier = Modifier, tint: androidx.compose.ui.graphics.Color = palette.label) {
    val c = palette
    Column(modifier.clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(vertical = 12.dp, horizontal = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(n, fontFamily = Inter, fontWeight = FontWeight.ExtraBold, fontSize = 22.sp, color = tint, style = Type.body.copy(fontFeatureSettings = "tnum"))
        Text(label.uppercase(), style = Type.caption, color = c.label2, textAlign = TextAlign.Center)
    }
}

private fun share(context: android.content.Context, subject: String, text: String) {
    val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, subject).putExtra(Intent.EXTRA_TEXT, text)
    context.startActivity(Intent.createChooser(send, "Share report").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

private fun committeeText(eventTitle: String, committee: String, dateStr: String, r: CommitteeReport, names: Map<String, String>): String = buildString {
    appendLine("$eventTitle — $committee — Session report, $dateStr")
    appendLine("Delegates ${r.rows.size} · Quorum ${r.present}/${r.quorum} · Speeches ${r.totalSpeeches} · Speaking ${fmtSpeaking(r.totalSpeakingSeconds)} · Votes ${r.votes.size}")
    appendLine()
    appendLine("Delegation | Att | Speeches | Time | Points O/I/PP/PI | Motions | Votes | Yields")
    r.rows.forEach { row ->
        val name = names[row.delegateId]?.ifEmpty { null }?.let { " ($it)" }.orEmpty()
        appendLine("${countryName(row.country).ifEmpty { row.country }}$name | ${attendanceShort(row.attendanceStatus)} | ${row.speeches} | ${fmtSpeaking(row.speakingSeconds)} | ${pointsLine(row)} | ${row.motions} | ${row.votesCast} | ${yieldsLine(row).ifEmpty { "—" }}")
    }
    if (r.votes.isNotEmpty()) {
        appendLine(); appendLine("Voting record")
        r.votes.forEach { appendLine("${it.motion}: ${it.affirmative}-${it.negative}-${it.abstentions} ${it.result.uppercase()}") }
    }
}

private fun ownText(eventTitle: String, committee: String, dateStr: String, country: String, r: DelegateReportRow): String = buildString {
    appendLine("$eventTitle — $committee — $country, $dateStr")
    appendLine("Attendance: ${attendanceShort(r.attendanceStatus)}")
    appendLine("Speeches ${r.speeches} · Speaking time ${fmtSpeaking(r.speakingSeconds)} · Caucus speeches ${r.caucusSpeeches}")
    REPORT_POINT_TYPES.forEach { appendLine("${pointLabel(it)}: ${r.pointsByType[it] ?: 0}") }
    appendLine("Motions raised ${r.motions} · Votes cast ${r.votesCast}")
    yieldsLine(r).ifEmpty { null }?.let { appendLine("Yielded to: $it") }
}
