package com.munpro.app.ui.passes

// The pass scanner (setup/qr-passes-plan.md, phase P2; web /dashboard/scan/[eventId]). Pick what
// you are handing out, then scan passes one after another. The server decides and counts
// (/api/passes/scan), so two volunteers can never hand out the same meal; without a connection a
// scan fails loudly instead of being queued. CameraX frames are read by zxing, the same library
// that draws the holder's pass, so there's no model to download at the venue.

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.material3.Text
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import com.munpro.app.AppGraph
import com.munpro.app.data.ClaimRow
import com.munpro.app.data.FoodSlot
import com.munpro.app.data.LookupOutcome
import com.munpro.app.data.PassPerson
import com.munpro.app.data.ScanOutcome
import com.munpro.app.domain.staffRoleLabel
import com.munpro.app.ui.kit.Chip
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Hairline
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.PlainInput
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.Segmented
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.Spinner
import com.munpro.app.ui.kit.SystemColors
import com.munpro.app.ui.kit.Tone
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import kotlinx.coroutines.launch
import java.util.concurrent.Executors

/** Something the scanner can hand out: a meal slot or a coupon. */
private data class Pick(val id: String, val name: String, val day: String, val time: String, val venue: String, val today: Boolean = false) {
    val title get() = listOf(name, day).filter { it.isNotBlank() }.joinToString(" · ")
}

private class LastScan(var code: String = "", var at: Long = 0)

private fun timeOf(ms: Long): String = java.text.SimpleDateFormat("h:mm a", java.util.Locale.getDefault()).format(java.util.Date(ms))
private fun roleText(kind: String, role: String) = if (kind == "applicant") role else staffRoleLabel(role)

/** A meal's window as minutes after midnight (web passAudience.ts parseTimeWindow), for "Now". */
private fun windowOf(text: String): IntRange? {
    val times = Regex("""(\d{1,2})(?:[:.](\d{2}))?\s*([ap]\.?m\.?)?""", RegexOption.IGNORE_CASE).findAll(text)
        .filter { it.groupValues[2].isNotEmpty() || it.groupValues[3].isNotEmpty() }.toList()
    if (times.size < 2) return null
    fun min(m: MatchResult, other: String = ""): Int? {
        var h = m.groupValues[1].toInt(); val mm = m.groupValues[2].ifEmpty { "0" }.toInt()
        val ap = m.groupValues[3].ifEmpty { other }.lowercase().replace(".", "")
        if (h > 23 || mm > 59) return null
        if (ap == "pm" && h < 12) h += 12
        if (ap == "am" && h == 12) h = 0
        return h * 60 + mm
    }
    val end = min(times[1]) ?: return null
    val start = min(times[0], if (times[0].groupValues[3].isEmpty()) times[1].groupValues[3] else "") ?: return null
    return if (end > start) start..end else null
}

@Composable
fun ScanScreen(eventId: String) {
    val c = palette
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf<String?>(null) }
    var access by remember { mutableStateOf<com.munpro.app.domain.live.StaffAccess?>(null) }
    var slots by remember { mutableStateOf<List<FoodSlot>?>(null) }
    var coupons by remember { mutableStateOf<List<com.munpro.app.data.Coupon>>(emptyList()) }
    // Pro (`passes`): arrival check-in per day and boarding per route and day.
    var days by remember { mutableStateOf<List<com.munpro.app.domain.EventDay>>(emptyList()) }
    var routes by remember { mutableStateOf<List<com.munpro.app.data.TransportRoute>>(emptyList()) }
    var failed by remember { mutableStateOf(false) }
    LaunchedEffect(eventId) {
        val uid = AppGraph.auth.user?.uid.orEmpty()
        runCatching {
            val ev = AppGraph.events.getEventById(eventId)
            title = ev?.title
            if (com.munpro.app.domain.resolvePlan(ev, null).has(com.munpro.app.domain.FEATURE_PASSES)) {
                days = com.munpro.app.domain.eventDays(ev)
                routes = runCatching { AppGraph.modules.routes(eventId) }.getOrDefault(emptyList())
            }
            access = AppGraph.content.staffAccess(eventId, uid)
            slots = AppGraph.modules.food(eventId)
            coupons = runCatching { AppGraph.modules.coupons(eventId) }.getOrDefault(emptyList())
        }.onFailure { failed = true }
    }
    var mode by remember { mutableStateOf("redeem") }
    var target by remember { mutableStateOf<String?>(null) }
    var result by remember { mutableStateOf<ScanOutcome?>(null) }
    var lookup by remember { mutableStateOf<LookupOutcome?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var finding by remember { mutableStateOf(false) }
    // "Accept anyway" repeats exactly the request that got outside_window (a scan or a manual redeem).
    var accept by remember { mutableStateOf<(() -> Unit)?>(null) }
    val last = remember { LastScan() }
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it }

    val now = java.time.LocalTime.now().let { it.hour * 60 + it.minute }
    // Meals and active coupons; whatever is running now on top.
    val today = java.time.LocalDate.now()
    val meals = (slots.orEmpty().map { Pick("meal:${it.id}", it.mealName, it.day, it.timeWindow, it.venue) } +
        coupons.filter { it.active }.map { Pick("coupon:${it.id}", it.title, it.day, it.timeWindow, it.venue) } +
        days.map { d -> Pick("checkin:${d.key}", "Check-in", d.label, "", d.date?.toString().orEmpty(), today = d.date == today) } +
        routes.flatMap { r -> days.map { d -> Pick("ride:${r.id}:${d.key}", r.routeName.ifEmpty { "${r.pickupPoint} → ${r.dropoffPoint}" }, d.label, "", "${r.registeredDelegates.size} registered", today = d.date == today) } })
        .map { it to windowOf(it.time) }
        .sortedWith(compareByDescending<Pair<Pick, IntRange?>> { it.first.today || it.second?.contains(now) == true }.thenBy { it.first.day }.thenBy { it.second?.first ?: 9999 })
    val targetTitle = meals.firstOrNull { it.first.id == target }?.first?.title

    fun send(code: String?, uid: String?, override: Boolean) {
        val t = target
        if (busy) return
        busy = true; error = null
        scope.launch {
            runCatching {
                if (mode == "lookup" && code != null) { lookup = AppGraph.modules.lookup(eventId, code); result = null }
                else if (t != null) {
                    result = AppGraph.modules.scan(eventId, t, code, uid, override); lookup = null
                    accept = { send(code, uid, true) }
                    val ok = result?.result == "ok"
                    (ctx.getSystemService(android.content.Context.VIBRATOR_SERVICE) as? android.os.Vibrator)?.vibrate(
                        if (ok) android.os.VibrationEffect.createOneShot(80, 255) else android.os.VibrationEffect.createWaveform(longArrayOf(0, 60, 60, 60), -1))
                }
            }.onFailure { error = it.message }
            busy = false
        }
    }
    fun onCode(code: String) {
        val t = System.currentTimeMillis()
        // A pass held up is read many times a second: ignore it until it has been out of frame
        // for 8 seconds, so a "Claimed" card isn't replaced by "Already used".
        val seen = code == last.code && t - last.at < 8000
        last.code = code; last.at = t
        if (seen) return
        send(code, null, false)
    }

    Screen(back = "Back", tabBar = false, title = "Scan passes", overline = title) {
        val a = access
        when {
            failed -> { ErrorText("Couldn't load this event. Check your connection."); return@Screen }
            a == null || slots == null -> { Spinner(); return@Screen }
            !a.can("canScanPasses") -> { Empty("Not allowed", "Ask the organizer to turn on Scan passes for you.", icon = Icons.lock); return@Screen }
        }
        Segmented(listOf("redeem" to "Redeem", "lookup" to "Check only"), mode, { mode = it; result = null; lookup = null })
        if (mode == "redeem") {
            if (meals.isEmpty()) Empty("Nothing to hand out yet", "Add meals under Tools › Food coupons, or coupons under Tools › Coupons.", icon = Icons.clock)
            else Section(header = "What are you handing out?") {
                meals.forEach { (p, w) ->
                    cell(p.title, subtitle = listOf(p.time, p.venue).filter { it.isNotBlank() }.joinToString(" · ").ifEmpty { null },
                        trailing = { Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                            if (p.today || w?.contains(now) == true) Chip(if (p.today) "Today" else "Now", Tone.Tint)
                            if (target == p.id) com.munpro.app.ui.kit.SfIcon(Icons.check, c.tint, size = 18.dp)
                        } },
                        chevron = false, onClick = { target = p.id; result = null })
                }
            }
        }
        Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(Radius.cell)).background(Color.Black), contentAlignment = Alignment.Center) {
            val ready = mode == "lookup" || target != null
            if (granted && ready) QrCamera(::onCode, Modifier.fillMaxWidth().aspectRatio(1f))
            else Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(if (!ready) "Pick what you hand out first." else "The scanner needs the camera.", style = Type.subhead, color = Color.White)
                if (ready && !granted) MunButton("Allow camera", { ask.launch(Manifest.permission.CAMERA) }, height = 44.dp, icon = Icons.camera)
            }
            if (busy) Box(Modifier.align(Alignment.TopEnd).padding(12.dp)) { Spinner() }
        }
        if (mode == "redeem" && targetTitle != null) Text("Scanning for $targetTitle", style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp))
        ErrorText(error)
        result?.let { r -> ResultCard(r, busy, onAccept = { accept?.invoke() }, onUndo = {
            val id = r.redemptionId ?: return@ResultCard; val at = r.at ?: return@ResultCard
            busy = true
            scope.launch { runCatching { AppGraph.modules.undo(eventId, id, at) }.onSuccess { result = null }.onFailure { error = it.message }; busy = false }
        }) }
        lookup?.let { LookupCard(it) }
        if (a.isOrganizerLevel) Section(footer = "No phone or pass? Redeem by hand. It's recorded as manual.") {
            cell("Find by name", onClick = { finding = true })
        }
        ClaimsSection(eventId, detail = a.isOrganizerLevel && days.isNotEmpty())
    }
    if (finding) FindSheet(eventId, targetTitle, { finding = false }) { person ->
        finding = false
        send(null, person.uid, false)
    }
}

@Composable
private fun QrCamera(onCode: (String) -> Unit, modifier: Modifier) {
    val ctx = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val latest by rememberUpdatedState(onCode)
    val executor = remember { Executors.newSingleThreadExecutor() }
    val reader = remember { QRCodeReader() }
    DisposableEffect(Unit) {
        onDispose {
            runCatching { ProcessCameraProvider.getInstance(ctx).get().unbindAll() }
            executor.shutdown()
        }
    }
    AndroidView(factory = { c ->
        val view = PreviewView(c).apply { scaleType = PreviewView.ScaleType.FILL_CENTER }
        val future = ProcessCameraProvider.getInstance(c)
        future.addListener({
            val provider = future.get()
            val preview = Preview.Builder().build().also { it.setSurfaceProvider(view.surfaceProvider) }
            val analysis = ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
            analysis.setAnalyzer(executor) { img ->
                try {
                    // The Y plane is a ready luminance image; zxing reads the QR straight from it.
                    val plane = img.planes[0]
                    val bytes = ByteArray(plane.buffer.remaining()).also { plane.buffer.get(it) }
                    val src = PlanarYUVLuminanceSource(bytes, plane.rowStride, img.height, 0, 0, img.width, img.height, false)
                    val text = runCatching { reader.decode(BinaryBitmap(HybridBinarizer(src)), mapOf(DecodeHintType.TRY_HARDER to true)).text }.getOrNull()
                    if (text != null) ContextCompat.getMainExecutor(c).execute { latest(text) }
                } finally {
                    reader.reset()
                    img.close()
                }
            }
            provider.unbindAll()
            provider.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
        }, ContextCompat.getMainExecutor(c))
        view
    }, modifier)
}

@Composable
private fun HolderRow(name: String, kind: String, role: String, committee: String) {
    val c = palette
    Column {
        Text(name, style = Type.headline, color = c.label)
        Text(listOf(roleText(kind, role), committee).filter { it.isNotBlank() }.joinToString(" · "), style = Type.footnote, color = c.label2)
    }
}

@Composable
private fun ResultCard(r: ScanOutcome, busy: Boolean, onAccept: () -> Unit, onUndo: () -> Unit) {
    val c = palette
    val (color, head) = when (r.result) {
        "ok" -> SystemColors.green to "Claimed"
        "already_used" -> SystemColors.orange to "Already used"
        "outside_window" -> SystemColors.orange to "Outside meal time"
        "not_eligible" -> SystemColors.red to "Not for them"
        "wrong_event" -> SystemColors.red to "Pass for another event"
        "replaced" -> SystemColors.red to "This pass was reset"
        "pro_required" -> SystemColors.red to "Coupons need a Pro event"
        "paused" -> SystemColors.orange to "This coupon is paused"
        else -> SystemColors.red to "Not a MUN Pilot pass"
    }
    val uses = r.target?.uses ?: 1
    val detail = when (r.result) {
        "ok" -> if (uses > 1) "${r.remaining ?: 0} of $uses left" else r.target?.title
        "already_used" -> listOfNotNull(r.usedAt?.let { "At ${timeOf(it)}" } ?: "Earlier", r.usedBy?.takeIf { it.isNotBlank() }?.let { "by $it" }).joinToString(" ")
        "outside_window" -> "${r.target?.title} runs ${r.window}"
        "wrong_event" -> r.otherEvent?.takeIf { it.isNotBlank() }?.let { "It's for $it." }
        "replaced" -> "Ask them to open My pass again for the new code."
        else -> r.reason
    }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(color.copy(alpha = 0.12f)).border(2.dp, color, RoundedCornerShape(Radius.cell)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(head, style = Type.headline, color = color)
        r.holder?.let { HolderRow(it.name, it.kind, it.role, it.committee) }
        detail?.takeIf { it.isNotBlank() }?.let { Text(it, style = Type.subhead, color = c.label2) }
        if (r.result == "outside_window") Pill("Accept anyway", onAccept, filled = true, enabled = !busy)
        if (r.result == "ok" && r.redemptionId != null) Pill("Undo", onUndo, enabled = !busy)
    }
}

@Composable
private fun LookupCard(l: LookupOutcome) {
    val c = palette
    if (l.result != "ok") { ResultCard(ScanOutcome(result = l.result, reason = l.reason), false, {}, {}); return }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        l.holder?.let { HolderRow(it.name, it.kind, it.role, it.committee) }
        if (l.items.isEmpty()) Text("Nothing for their role.", style = Type.subhead, color = c.label2)
        l.items.forEach { i ->
            val uses = i.uses ?: 1; val used = i.used ?: 0
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(i.title, style = Type.subhead, color = if (used >= uses) c.label3 else c.label, modifier = Modifier.weight(1f))
                Text(if (used >= uses) "Used${i.lastAt?.let { " ${timeOf(it)}" } ?: ""}" else if (uses > 1) "${uses - used} of $uses left" else "Ready", style = Type.footnote, color = c.label2)
            }
        }
    }
}

@Composable
private fun ClaimsSection(eventId: String, detail: Boolean) {
    val c = palette
    val scope = rememberCoroutineScope()
    var rows by remember { mutableStateOf<List<ClaimRow>?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var open by remember { mutableStateOf<ClaimRow?>(null) }
    Section(header = "Claimed so far", footer = error ?: if (detail && rows != null) "Tap one to see who has it and who doesn't yet." else null) {
        rows?.forEach { r -> cell(r.title, value = "${r.claimed ?: 0} / ${r.eligible ?: 0}", chevron = detail, onClick = if (detail) ({ open = r }) else null) }
        cell(if (busy) "Counting…" else if (rows == null) "Count claims" else "Count again", tinted = true, chevron = false, onClick = {
            if (busy) return@cell
            busy = true; error = null
            scope.launch { runCatching { AppGraph.modules.claims(eventId) }.onSuccess { rows = it }.onFailure { error = it.message }; busy = false }
        })
    }
    open?.let { r -> ClaimDetailSheet(eventId, r) { open = null } }
}

/** One item: who claimed it (when, by whom) and who hasn't yet, the organizer's check at the door. */
@Composable
private fun ClaimDetailSheet(eventId: String, row: ClaimRow, onClose: () -> Unit) {
    val c = palette
    val d by androidx.compose.runtime.produceState<Result<com.munpro.app.data.ClaimDetail>?>(null, row.target) { value = runCatching { AppGraph.modules.claimDetail(eventId, row.target) } }
    PageSheet(true, onClose) {
        SheetHeader(row.title, trailing = "Done", onTrailing = onClose)
        Column(Modifier.fillMaxWidth().verticalScroll(androidx.compose.foundation.rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            val r = d
            when {
                r == null -> Spinner()
                r.isFailure -> ErrorText(r.exceptionOrNull()?.message ?: "Couldn't load.")
                else -> {
                    val x = r.getOrThrow()
                    Section(header = "Claimed · ${x.claimed.size}") {
                        if (x.claimed.isEmpty()) cell("Nobody yet", chevron = false)
                        x.claimed.forEach { l ->
                            val flags = listOfNotNull(l.lastBy.takeIf { it.isNotBlank() }?.let { "by $it" }, if (l.manual) "by hand" else null, if (l.override) "outside time" else null)
                            cell(l.name, subtitle = (listOf(roleText("applicant", l.role), l.committee).filter { it.isNotBlank() } + flags).joinToString(" · ").ifEmpty { null },
                                value = l.lastAt?.let { timeOf(it) }, chevron = false)
                        }
                    }
                    Section(header = "Not yet · ${x.notYet.size}") {
                        if (x.notYet.isEmpty()) cell("Everyone has it", chevron = false)
                        x.notYet.forEach { l -> cell(l.name, subtitle = listOf(l.role, l.committee).filter { it.isNotBlank() }.joinToString(" · ").ifEmpty { null }, chevron = false) }
                    }
                }
            }
        }
    }
}

@Composable
private fun FindSheet(eventId: String, targetTitle: String?, onDismiss: () -> Unit, onPick: (PassPerson) -> Unit) {
    val c = palette
    var people by remember { mutableStateOf<List<PassPerson>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var q by remember { mutableStateOf("") }
    LaunchedEffect(eventId) { runCatching { AppGraph.modules.people(eventId) }.onSuccess { people = it }.onFailure { error = it.message } }
    PageSheet(true, onDismiss) {
        SheetHeader("Find by name", trailing = "Done", onTrailing = onDismiss)
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (targetTitle == null) Text("Pick what you hand out first, then find the person.", style = Type.subhead, color = c.label2)
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).border(Hairline, c.separator, RoundedCornerShape(Radius.cell)).padding(horizontal = 14.dp, vertical = 12.dp)) {
                PlainInput(q, { q = it }, "Type a name", maxLength = 60, keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words))
            }
            ErrorText(error)
            val list = people
            if (list == null && error == null) Spinner()
            val found = if (q.trim().length < 2) emptyList() else list.orEmpty().filter { it.name.contains(q.trim(), ignoreCase = true) }.take(12)
            if (found.isNotEmpty()) Section {
                found.forEach { p ->
                    cell(p.name, subtitle = listOf(p.role, p.committee).filter { it.isNotBlank() }.joinToString(" · ").ifEmpty { null },
                        trailing = { Pill("Redeem", { onPick(p) }, filled = true, enabled = targetTitle != null) }, chevron = false)
                }
            }
        }
    }
}
