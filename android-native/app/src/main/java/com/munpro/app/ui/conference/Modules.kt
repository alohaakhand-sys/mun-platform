package com.munpro.app.ui.conference

// The optional modules (board B3.1–B3.5; web FoodCouponsModule, TransportModule,
// AccommodationModule, DressCodeModule), shown when the organizer turns them on
// (event.optionalModules). Meals and rides are claimed with one personal pass (PassSheet): a QR the
// server signs (/api/passes/mine; setup/qr-passes-plan.md), brightened for a scanner and kept on the
// phone so it shows without internet. Scanning, and marking a meal used, come in phase P2.

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Bitmap
import android.view.WindowManager
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.munpro.app.AppGraph
import com.munpro.app.data.AccommodationBlock
import com.munpro.app.data.AccommodationRequest
import com.munpro.app.data.DressCode
import com.munpro.app.data.FoodSlot
import com.munpro.app.data.MyPass
import com.munpro.app.data.Fresh
import com.munpro.app.data.TransportRoute
import com.munpro.app.data.rememberCached
import com.munpro.app.domain.Conference
import com.munpro.app.domain.formatFee
import com.munpro.app.domain.inAudience
import com.munpro.app.domain.staffRoleLabel
import com.munpro.app.ui.kit.Chip
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.RemoteImage
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SectionHeader
import com.munpro.app.ui.kit.Segmented
import com.munpro.app.ui.kit.SfIcon
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.Spinner
import com.munpro.app.ui.kit.SystemColors
import com.munpro.app.ui.kit.Tone
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.nullable

/** The organizer's module keys (organizer/events/[id]/details). */
object Modules {
    const val FOOD = "food"
    const val TRANSPORT = "transport"
    const val ACCOMMODATION = "accommodation"
    const val DRESS = "dresscode"
}

// ---------------------------------------------------------------------------------------------
// The code to show staff
// ---------------------------------------------------------------------------------------------

@Composable
fun QrCode(value: String, modifier: Modifier = Modifier) {
    val bmp = remember(value) {
        val m = QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 0, 0, mapOf(EncodeHintType.MARGIN to 1))
        val w = m.width
        val h = m.height
        val px = IntArray(w * h) { i -> if (m.get(i % w, i / w)) android.graphics.Color.BLACK else android.graphics.Color.WHITE }
        Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888).asImageBitmap()
    }
    Image(bmp, "QR code", modifier, filterQuality = FilterQuality.None)
}

private fun Context.activity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.activity()
    else -> null
}

/** Full brightness while a code is on screen, so a scanner can read it. */
@Composable
private fun BrightWhileShown() {
    val window = LocalContext.current.activity()?.window ?: return
    DisposableEffect(window) {
        val before = window.attributes.screenBrightness
        window.attributes = window.attributes.apply { screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_FULL }
        onDispose { window.attributes = window.attributes.apply { screenBrightness = before } }
    }
}

/** B3.2: a coupon or boarding pass, full screen. */
@Composable
private fun CodeSheet(title: String, lines: List<String>, value: String, note: String, onClose: () -> Unit, extra: @Composable () -> Unit = {}) {
    val c = palette
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    PageSheet(true, onClose) {
        BrightWhileShown()
        SheetHeader(title, trailing = "Done", onTrailing = onClose)
        Column(Modifier.fillMaxWidth().padding(start = 24.dp, end = 24.dp, top = 12.dp, bottom = navBottom + 28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(Radius.cell)).background(Color.White).padding(20.dp)) {
                QrCode(value, Modifier.fillMaxWidth().aspectRatio(1f))
            }
            lines.forEachIndexed { i, l -> Text(l, style = if (i == 0) Type.headline else Type.subhead, color = if (i == 0) c.label else c.label2, textAlign = TextAlign.Center) }
            Text(note, style = Type.footnote, color = c.label2, textAlign = TextAlign.Center)
            extra()
        }
    }
}

/** The holder's personal QR pass for one event: one code for every meal, coupon, check-in and ride. */
@Composable
fun PassSheet(eventId: String, eventTitle: String?, onClose: () -> Unit) {
    val c = palette
    val pass = rememberCached("pass:$eventId", MyPass.serializer(), Fresh.MEDIUM) { AppGraph.modules.myPass(eventId) }
    val p = pass.data
    if (p != null && p.code.isNotEmpty()) {
        val role = if (p.holder.kind == "applicant") p.holder.role else staffRoleLabel(p.holder.role)
        CodeSheet("My pass", listOfNotNull(p.holder.name, listOf(role, p.holder.committee).filter { it.isNotBlank() }.joinToString(" · ").ifEmpty { null }, eventTitle),
            p.code, "Show this to staff for meals, coupons and check-in. One pass for everything.", onClose) { PassHoldings(eventId) }
    } else PageSheet(true, onClose) {
        SheetHeader("My pass", trailing = "Done", onTrailing = onClose)
        Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
            if (pass.failed) Text("Couldn't load your pass. Check your connection and try again.", style = Type.subhead, color = c.label2, textAlign = TextAlign.Center)
            else Spinner()
        }
    }
}

/** What this pass can claim: the holder's meals and coupons, with what's already used. */
@Composable
private fun PassHoldings(eventId: String) {
    val c = palette
    val uid = AppGraph.auth.user?.uid.orEmpty()
    val rows by produceState<List<Triple<String, Int, Pair<Int, Long?>?>>?>(null, eventId, uid) {
        value = runCatching {
            val use = AppGraph.modules.myPassUse(eventId, uid)
            if (use.kind == null) return@runCatching emptyList()
            val meals = AppGraph.modules.food(eventId).filter { inAudience(uid, use.kind, use.role, it.audience?.groups, it.audience?.uids) }
                .map { Triple(listOf(it.mealName, it.day).filter { s -> s.isNotBlank() }.joinToString(" · "), it.usesPerPerson ?: 1, use.used["meal:${it.id}"]) }
            val ev = AppGraph.events.getEventById(eventId)
            val pro = com.munpro.app.domain.resolvePlan(ev, null).has(com.munpro.app.domain.FEATURE_PASSES)
            if (!pro) return@runCatching meals
            val coupons = runCatching { AppGraph.modules.coupons(eventId) }.getOrDefault(emptyList())
                .filter { it.active && inAudience(uid, use.kind, use.role, it.audience.groups.ifEmpty { listOf("none") }, it.audience.uids) }
                .map { Triple(listOf(it.title, it.day).filter { s -> s.isNotBlank() }.joinToString(" · "), it.usesPerPerson ?: 1, use.used["coupon:${it.id}"]) }
            val days = com.munpro.app.domain.eventDays(ev)
            val checkins = days.map { d -> Triple("Check-in · ${d.label}", 1, use.used["checkin:${d.key}"]) }
            val rides = runCatching { AppGraph.modules.routes(eventId) }.getOrDefault(emptyList())
                .filter { r -> use.applicationId != null && use.applicationId in r.registeredDelegates }
                .flatMap { r -> days.map { d -> Triple("${r.routeName.ifEmpty { "Ride" }} · ${d.label}", 1, use.used["ride:${r.id}:${d.key}"]) } }
            meals + coupons + checkins + rides
        }.getOrNull()
    }
    val list = rows ?: return
    if (list.isEmpty()) return
    Column(Modifier.fillMaxWidth().padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("WHAT YOUR PASS HOLDS", style = Type.footnote, color = c.label2)
        list.forEach { (title, uses, got) ->
            val left = uses - (got?.first ?: 0)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, style = Type.subhead, color = if (left <= 0) c.label3 else c.label, modifier = Modifier.weight(1f))
                // Check-in rows read like the web: "Checked in 9:02" / "Not yet".
                val checkin = title.startsWith("Check-in · ")
                Text(when {
                    left <= 0 -> (if (checkin) "Checked in" else "Used") + (got?.second?.let { " " + java.text.SimpleDateFormat("h:mm a", java.util.Locale.getDefault()).format(java.util.Date(it)) } ?: "")
                    uses > 1 -> "$left of $uses left"
                    else -> if (checkin) "Not yet" else "Ready"
                }, style = Type.footnote, color = c.label2)
            }
        }
    }
}

private fun mealColor(name: String): Color = name.lowercase().let { when {
    "breakfast" in it -> SystemColors.orange
    "lunch" in it -> SystemColors.green
    "dinner" in it -> SystemColors.indigo
    else -> SystemColors.teal
} }

// ---------------------------------------------------------------------------------------------
// B3.1 · Food
// ---------------------------------------------------------------------------------------------

@Composable
fun FoodScreen(conf: Conference) {
    val c = palette
    val eventId = conf.event.id
    val slots = rememberCached("food:$eventId", ListSerializer(FoodSlot.serializer()), Fresh.LONG) { AppGraph.modules.food(eventId) }
    // Which meals are theirs and which they already claimed (read fresh: a scan just happened).
    val uid = AppGraph.auth.user?.uid.orEmpty()
    val use by produceState<com.munpro.app.data.MyPassUse?>(null, eventId, uid) { value = runCatching { AppGraph.modules.myPassUse(eventId, uid) }.getOrNull() }
    val mine = slots.data.orEmpty().filter { s -> use?.kind == null || inAudience(uid, use?.kind, use?.role, s.audience?.groups, s.audience?.uids) }
    val days = mine.map { it.day }.distinct().sorted()
    var day by rememberSaveable { mutableStateOf<String?>(null) }
    val current = day?.takeIf { it in days } ?: days.firstOrNull()
    var showing by remember { mutableStateOf(false) }
    Screen(back = "Portal", tabBar = false, title = "Food", overline = conf.event.title, savedAt = slots.savedAt) {
        when {
            !slots.has -> if (slots.failed) ErrorText("Couldn't load the meal schedule. Pull to try again.") else Spinner()
            days.isEmpty() -> Empty("No meals set up yet", "Check back once the organizer sets up the meal schedule.", icon = Icons.cal)
            else -> {
                MunButton("Show my pass", { showing = true }, icon = Icons.qr)
                if (days.size > 1) Segmented(days.map { it to it }, current, { day = it })
                Section(footer = "Show your pass at the counter: one QR for every meal.") {
                    mine.filter { it.day == current }.forEach { s ->
                        val uses = s.usesPerPerson ?: 1
                        val got = use?.used?.get("meal:${s.id}")
                        val left = uses - (got?.first ?: 0)
                        val state = when {
                            left <= 0 -> "Used" + (got?.second?.let { " at " + java.text.SimpleDateFormat("h:mm a", java.util.Locale.getDefault()).format(java.util.Date(it)) } ?: "")
                            uses > 1 -> "$left of $uses left"
                            else -> null
                        }
                        cell(
                            s.mealName.ifEmpty { "Meal" }, subtitle = (listOf(s.timeWindow, s.venue).filter { it.isNotBlank() } + listOfNotNull(state)).joinToString(" · "), dim = left <= 0,
                            leading = { Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(mealColor(s.mealName).copy(alpha = 0.15f)), contentAlignment = Alignment.Center) { SfIcon(Icons.clock, mealColor(s.mealName), size = 18.dp) } },
                            inset = 62.dp, chevron = false,
                        )
                    }
                }
            }
        }
    }
    if (showing) PassSheet(eventId, conf.event.title) { showing = false }
}

// ---------------------------------------------------------------------------------------------
// B3.3 · Transport
// ---------------------------------------------------------------------------------------------

@Composable
fun TransportScreen(conf: Conference) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val eventId = conf.event.id
    val appId = conf.app.id
    val routes = rememberCached("transport:$eventId", ListSerializer(TransportRoute.serializer()), Fresh.SHORT) { AppGraph.modules.routes(eventId) }
    val joined = remember { mutableStateListOf<String>() }
    val list = routes.data.orEmpty().map { r -> if (r.id in joined && appId !in r.registeredDelegates) r.copy(registeredDelegates = r.registeredDelegates + appId) else r }
    val mine = list.firstOrNull { appId in it.registeredDelegates }
    var boarding by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf<String?>(null) }

    Screen(back = "Portal", tabBar = false, title = "Transport", overline = conf.event.title, savedAt = routes.savedAt, onRefresh = {}) {
        when {
            !routes.has -> if (routes.failed) ErrorText("Couldn't load the routes. Pull to try again.") else Spinner()
            list.isEmpty() -> Empty("No routes yet", "The organizer hasn't added any transport routes yet.", icon = Icons.pin)
            else -> {
                if (mine != null) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Your route", style = Type.headline, color = c.label, modifier = Modifier.weight(1f))
                        Chip("Registered", Tone.Tint)
                    }
                    RouteLine("Pickup", mine.pickupPoint, mine.departureTime)
                    RouteLine("Drop-off", mine.dropoffPoint, mine.returnTime.takeIf { it.isNotBlank() }?.let { "Return $it" }.orEmpty())
                    MunButton("Show my pass", { boarding = true }, height = 44.dp, icon = Icons.qr)
                }
                Section(header = "All routes", footer = if (mine == null) "Register for one route. Show your pass to the transport coordinator." else null) {
                    list.forEach { r ->
                        val seats = "${r.registeredDelegates.size} of ${r.capacity ?: 0}"
                        cell(
                            r.routeName.ifEmpty { "${r.pickupPoint} → ${r.dropoffPoint}" },
                            subtitle = listOfNotNull(seats, r.departureTime.takeIf { it.isNotBlank() }?.let { "departs $it" }).joinToString(" · "),
                            chevron = false,
                            trailing = when {
                                r.id == mine?.id -> ({ Chip("Yours", Tone.Tint) })
                                r.full -> ({ Chip("Full") })
                                mine == null -> ({
                                    Pill(if (busy == r.id) "…" else "Register", {
                                        scope.launch {
                                            if (!alerts.confirm("Register for ${r.routeName.ifEmpty { "this route" }}?", "You can only register for one route, and changing it needs the organizer.", "Register")) return@launch
                                            busy = r.id
                                            runCatching { AppGraph.modules.register(eventId, r.id, appId) }
                                                .onSuccess { joined += r.id }
                                                .onFailure { alerts.show("Couldn't register", it.message ?: "Registration failed") }
                                            busy = null
                                        }
                                    }, enabled = busy == null)
                                })
                                else -> null
                            },
                        )
                    }
                }
            }
        }
    }
    if (boarding && mine != null) PassSheet(eventId, conf.event.title) { boarding = false }
}

@Composable
private fun RouteLine(label: String, place: String, time: String) {
    val c = palette
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = Type.footnote, color = c.label2, modifier = Modifier.width(72.dp))
        Text(place, style = Type.subhead.copy(fontWeight = FontWeight.SemiBold), color = c.label, modifier = Modifier.weight(1f))
        Text(time, style = Type.footnote, color = c.label2)
    }
}

// ---------------------------------------------------------------------------------------------
// B3.4 · Accommodation
// ---------------------------------------------------------------------------------------------

@Composable
fun AccommodationScreen(conf: Conference) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val eventId = conf.event.id
    val uid = AppGraph.auth.user?.uid.orEmpty()
    val blocks = rememberCached("rooms:$eventId", ListSerializer(AccommodationBlock.serializer()), Fresh.LONG) { AppGraph.modules.blocks(eventId) }
    val request = rememberCached("roomRequest:$eventId:$uid", AccommodationRequest.serializer().nullable, Fresh.SHORT) { AppGraph.modules.myRoomRequest(eventId, uid) }
    var sent by remember { mutableStateOf<AccommodationRequest?>(null) }
    var busy by remember { mutableStateOf<String?>(null) }
    Screen(back = "Portal", tabBar = false, title = "Accommodation", overline = conf.event.title, savedAt = request.savedAt, onRefresh = {}) {
        val mine = sent ?: request.data
        if (mine != null) {
            val block = blocks.data.orEmpty().firstOrNull { it.id == mine.blockId }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Your request", style = Type.headline, color = c.label, modifier = Modifier.weight(1f))
                    when (mine.status) {
                        "confirmed" -> Chip("Confirmed", Tone.Tint)
                        "rejected" -> Chip("Rejected", Tone.Destructive)
                        else -> Chip("Pending review", Tone.Warning)
                    }
                }
                Text(listOfNotNull(mine.blockName, block?.roomType?.ifBlank { null }).joinToString(" · "), style = Type.subhead, color = c.label)
                Text(listOfNotNull(block?.pricePerNight?.let { "${formatFee(it)} / night" }, if (mine.status == "pending") "the organizer confirms rooms" else null).joinToString(" · "), style = Type.footnote, color = c.label2)
            }
        }
        when {
            !blocks.has -> if (blocks.failed) ErrorText("Couldn't load the rooms. Pull to try again.") else Spinner()
            blocks.data.orEmpty().isEmpty() -> Empty("No rooms set up yet", "The organizer hasn't set up accommodation yet.", icon = Icons.home)
            else -> Section(header = "Available", footer = if (mine == null) "One request per delegate. The organizer confirms rooms." else null) {
                blocks.data.orEmpty().forEach { b ->
                    val left = b.availableRooms ?: 0
                    cell(
                        b.blockName, subtitle = listOfNotNull(b.roomType.ifBlank { null }, b.pricePerNight?.let { "${formatFee(it)} / night" }, if (left > 0) "$left room${if (left == 1) "" else "s"} left" else "No rooms left").joinToString(" · "),
                        chevron = false,
                        trailing = when {
                            mine != null -> null
                            left <= 0 -> ({ Chip("Full") })
                            else -> ({
                                Pill(if (busy == b.id) "…" else "Request", {
                                    scope.launch {
                                        if (!alerts.confirm("Request ${b.blockName}?", "You can make one request; the organizer confirms it.", "Request")) return@launch
                                        busy = b.id
                                        runCatching { AppGraph.modules.requestRoom(eventId, uid, b) }
                                            .onSuccess { AppGraph.saved.remove("roomRequest:$eventId:$uid"); sent = AccommodationRequest(blockId = b.id, blockName = b.blockName, status = "pending") }
                                            .onFailure { alerts.show("Couldn't send the request", "Check your connection and try again.") }
                                        busy = null
                                    }
                                }, enabled = busy == null)
                            })
                        },
                    )
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// B3.5 · Dress code
// ---------------------------------------------------------------------------------------------

@Composable
fun DressCodeScreen(conf: Conference) {
    val c = palette
    val eventId = conf.event.id
    val dress = rememberCached("dresscode:$eventId", DressCode.serializer().nullable, Fresh.LONG) { AppGraph.modules.dressCode(eventId) }
    Screen(back = "Portal", tabBar = false, title = "Dress code", overline = conf.event.title, savedAt = dress.savedAt) {
        val d = dress.data
        when {
            !dress.has -> if (dress.failed) ErrorText("Couldn't load the dress code. Pull to try again.") else Spinner()
            d == null || (d.text.isBlank() && d.images.isEmpty()) -> Empty("No dress code yet", "The organizer hasn't added dress code guidance yet.", icon = Icons.profile)
            else -> {
                d.images.firstOrNull()?.let { RemoteImage(it, Modifier.fillMaxWidth().aspectRatio(16f / 10f).clip(RoundedCornerShape(Radius.cell)), "Dress code") }
                if (d.text.isNotBlank()) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp)) {
                    Text(d.text, style = Type.body, color = c.label)
                }
                if (d.images.size > 1) {
                    SectionHeader("Reference")
                    d.images.drop(1).chunked(2).forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            row.forEach { RemoteImage(it, Modifier.weight(1f).aspectRatio(1f).clip(RoundedCornerShape(Radius.cell)), "Reference") }
                            if (row.size == 1) Box(Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}
