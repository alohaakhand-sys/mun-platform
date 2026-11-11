package com.munpro.app.ui.organizer

// Modules, complaints and tools (board C5; web organizer/events/[id]/modules, complaints,
// tools/*): one hub; food slots, transport routes, accommodation blocks with request approvals
// (rooms left = rooms − confirmed), dress code; complaints assigned to me; results approval with
// the published standings; the certificate template; ID cards printed on the phone; the theme.
// Data: ToolsRepo, plus ModulesRepo's reads.

import android.content.Context
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.munpro.app.AppGraph
import com.munpro.app.data.AccommodationBlock
import com.munpro.app.data.AccommodationRequest
import com.munpro.app.data.Api
import com.munpro.app.data.AwardResult
import com.munpro.app.data.DressCode
import com.munpro.app.data.Coupon
import com.munpro.app.data.FoodSlot
import com.munpro.app.data.PassAudience
import com.munpro.app.data.Fresh
import com.munpro.app.data.Standings
import com.munpro.app.data.TransportRoute
import com.munpro.app.data.awardLabel
import com.munpro.app.data.prepareImage
import com.munpro.app.data.rememberCached
import com.munpro.app.data.writingAssist
import com.munpro.app.domain.ApplicationData
import com.munpro.app.domain.BLOCK_TEMPLATES
import com.munpro.app.domain.CERTIFICATE_TEMPLATES
import com.munpro.app.domain.Complaint
import com.munpro.app.domain.DRESS_TEMPLATES
import com.munpro.app.domain.EventData
import com.munpro.app.domain.AUDIENCE_GROUPS
import com.munpro.app.domain.DEFAULT_MEAL_AUDIENCE
import com.munpro.app.domain.FOOD_TEMPLATES
import com.munpro.app.domain.audienceLabel
import com.munpro.app.domain.IdCardPerson
import com.munpro.app.domain.OPTIONAL_MODULES
import com.munpro.app.domain.ROUTE_TEMPLATES
import com.munpro.app.domain.THEME_PRESETS
import com.munpro.app.domain.certificateTemplate
import com.munpro.app.domain.complaintStatusLabel
import com.munpro.app.domain.complaintTypeLabel
import com.munpro.app.domain.countryName
import com.munpro.app.domain.getEventStartMs
import com.munpro.app.domain.hexToArgb
import com.munpro.app.domain.inkIsDark
import com.munpro.app.domain.themeHex
import com.munpro.app.nav.AccommodationSetupRoute
import com.munpro.app.nav.CertificatesSetupRoute
import com.munpro.app.nav.DressCodeSetupRoute
import com.munpro.app.nav.FoodSlotsRoute
import com.munpro.app.nav.IdCardsRoute
import com.munpro.app.nav.ModulesSetupRoute
import com.munpro.app.nav.OrgComplaintsRoute
import com.munpro.app.nav.ResultsApprovalRoute
import com.munpro.app.nav.ThemeSetupRoute
import com.munpro.app.nav.TransportRoutesRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.home.FilterChips
import com.munpro.app.ui.kit.ActionSheet
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.Chip
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Hairline
import com.munpro.app.ui.kit.IconTile
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.LocalBack
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.PlainInput
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.RemoteImage
import com.munpro.app.ui.kit.RoundButton
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SectionFooter
import com.munpro.app.ui.kit.SectionHeader
import com.munpro.app.ui.kit.Segmented
import com.munpro.app.ui.kit.SfIcon
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.SheetRow
import com.munpro.app.ui.kit.Space
import com.munpro.app.ui.kit.Spinner
import com.munpro.app.ui.kit.SystemColors
import com.munpro.app.ui.kit.TextLink
import com.munpro.app.ui.kit.Toggle
import com.munpro.app.ui.kit.Tone
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.kit.rememberPress
import com.munpro.app.ui.kit.tap
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlin.math.roundToInt

private const val RETRY = "Check your connection and try again."

@Composable
private fun rememberToolsEvent(eventId: String) =
    rememberCached("orgEventDoc:$eventId", EventData.serializer(), Fresh.SHORT) { AppGraph.events.getEventById(eventId) ?: error("Event not found") }

@Composable
private fun rememberToolsApps(eventId: String) =
    rememberCached("orgApps:$eventId", ListSerializer(ApplicationData.serializer()), Fresh.SHORT) { AppGraph.allocation.applications(eventId) }

private suspend fun refreshToolsEvent(eventId: String) {
    AppGraph.events.getEventById(eventId)?.let { AppGraph.saved.write("orgEventDoc:$eventId", EventData.serializer(), it) }
    com.munpro.app.data.Refresh.bump()
}

/** Pro looks belong to the event's plan (Plan.kt), not the person. */
private fun hasFeature(e: EventData?, f: String) = com.munpro.app.domain.resolvePlan(e, null).has(f)

private fun modulesOn(e: EventData) = e.optionalModules.map { if (it == "live_mun") "livemun" else it }

// ---------------------------------------------------------------------------------------------
// C5.1 · Tools
// ---------------------------------------------------------------------------------------------

@Serializable
private data class ModuleCounts(val food: Int = 0, val routes: Int = 0, val blocks: Int = 0, val waiting: Int = 0, val dress: Boolean = false)

@Composable
fun ToolsScreen(eventId: String) {
    val nav = LocalNav.current
    val ev = rememberToolsEvent(eventId)
    val e = ev.data
    val uid = AppGraph.auth.user?.uid.orEmpty()
    val counts = rememberCached("orgModuleCounts:$eventId", ModuleCounts.serializer(), Fresh.SHORT) {
        ModuleCounts(
            AppGraph.modules.food(eventId).size, AppGraph.modules.routes(eventId).size, AppGraph.modules.blocks(eventId).size,
            AppGraph.tools.roomRequests(eventId).count { it.status == "pending" }, AppGraph.modules.dressCode(eventId)?.text?.isNotBlank() == true,
        )
    }
    val complaints by remember(eventId, uid) { AppGraph.tools.complaints(eventId, uid) }.collectAsState(initial = null)
    val results by remember(eventId) { AppGraph.tools.results(eventId) }.collectAsState(initial = null)
    Screen(back = "Event", tabBar = false, title = "Tools", overline = e?.title, savedAt = ev.savedAt, onRefresh = {}) {
        if (e == null) { if (ev.failed) Empty("Couldn't load tools", "Pull down to try again.", icon = Icons.folder) else Spinner(); return@Screen }
        val on = modulesOn(e)
        val n = counts.data
        Section(header = "Modules", footer = if (OPTIONAL_MODULES.none { it.key in on }) "No modules are on. Turn them on under Details › Optional modules." else null) {
            if ("food" in on) cell("Food coupons", value = n?.let { "${it.food} slot${if (it.food == 1) "" else "s"}" }, leading = { IconTile(SystemColors.orange, Icons.star) }, inset = 58.dp, onClick = { nav.go(FoodSlotsRoute(eventId)) })
            if ("transport" in on) cell("Transport", value = n?.let { "${it.routes} route${if (it.routes == 1) "" else "s"}" }, leading = { IconTile(SystemColors.blue, Icons.pin) }, inset = 58.dp, onClick = { nav.go(TransportRoutesRoute(eventId)) })
            if ("accommodation" in on) cell("Accommodation", subtitle = n?.waiting?.takeIf { it > 0 }?.let { "$it request${if (it == 1) "" else "s"} waiting" },
                trailing = n?.waiting?.takeIf { it > 0 }?.let { w -> { Chip("$w", Tone.Warning) } }, leading = { IconTile(SystemColors.purple, Icons.home) }, inset = 58.dp, onClick = { nav.go(AccommodationSetupRoute(eventId)) })
            if ("dresscode" in on) cell("Dress code", value = if (n?.dress == true) "Set" else null, leading = { IconTile(SystemColors.green, Icons.people) }, inset = 58.dp, onClick = { nav.go(DressCodeSetupRoute(eventId)) })
            cell("Turn modules on or off", leading = { IconTile(SystemColors.gray, Icons.sliders) }, inset = 58.dp, onClick = { nav.go(ModulesSetupRoute(eventId)) })
        }
        val active = complaints.orEmpty().count { it.status !in setOf("resolved", "rejected") }
        val pending = results.orEmpty().count { it.status == "pending" }
        Section(header = "Run the event") {
            if (com.munpro.app.domain.passesInUse(e)) cell("Scan passes", subtitle = "Meals and coupons at the counter", leading = { IconTile(SystemColors.teal, Icons.qr) }, inset = 58.dp, onClick = { nav.go(com.munpro.app.nav.ScanRoute(eventId)) })
            cell("Coupons", trailing = if (!hasFeature(e, com.munpro.app.domain.FEATURE_PASSES)) ({ Chip("Pro", Tone.Warning) }) else null, leading = { IconTile(SystemColors.purple, Icons.star) }, inset = 58.dp, onClick = { nav.go(com.munpro.app.nav.CouponsRoute(eventId)) })
            cell("Complaints", trailing = if (active > 0) ({ Chip("$active", Tone.Warning) }) else null, leading = { IconTile(SystemColors.red, Icons.alert) }, inset = 58.dp, onClick = { nav.go(OrgComplaintsRoute(eventId)) })
            cell("Results", subtitle = if (pending > 0) "$pending award${if (pending == 1) "" else "s"} to approve" else null,
                trailing = if (pending > 0) ({ Chip("$pending", Tone.Warning) }) else null, leading = { IconTile(SystemColors.green, Icons.trophy) }, inset = 58.dp, onClick = { nav.go(ResultsApprovalRoute(eventId)) })
        }
        Section(header = "Print & look") {
            cell("Certificates", value = CERTIFICATE_TEMPLATES.firstOrNull { it.id == certificateTemplate(e.certificateTemplate) }?.name, leading = { IconTile(SystemColors.gold, Icons.doc) }, inset = 58.dp, onClick = { nav.go(CertificatesSetupRoute(eventId)) })
            cell("ID cards", leading = { IconTile(SystemColors.gray, Icons.card) }, inset = 58.dp, onClick = { nav.go(IdCardsRoute(eventId)) })
            cell("Theme", value = THEME_PRESETS.firstOrNull { it.id == e.theme }?.name ?: if (themeHex(e.theme) != null) "Custom" else "Default",
                leading = { IconTile(SystemColors.purple, Icons.sparkle) }, inset = 58.dp, onClick = { nav.go(ThemeSetupRoute(eventId)) })
        }
    }
}

// ---------------------------------------------------------------------------------------------
// C5.2 / C5.3 · Food slots
// ---------------------------------------------------------------------------------------------

/** "Day 1", "Day 2"… for the event's length (start to end date, at least one). */
private fun dayLabels(e: EventData?): List<String> = com.munpro.app.domain.eventDays(e).map { it.label }

@Composable
fun FoodSlotsScreen(eventId: String) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val ev = rememberToolsEvent(eventId)
    var tick by remember { mutableIntStateOf(0) }
    var slots by remember { mutableStateOf<List<FoodSlot>?>(null) }
    var adding by remember { mutableStateOf(false) }
    var picked by remember { mutableStateOf<FoodSlot?>(null) }
    LaunchedEffect(eventId, tick) { slots = runCatching { AppGraph.modules.food(eventId) }.getOrNull() ?: slots ?: emptyList() }
    Screen(back = "Tools", tabBar = false, title = "Food coupons", navRight = { RoundButton(Icons.plus, "Add slot", { adding = true }) }) {
        val l = slots ?: run { Spinner(); return@Screen }
        if (l.isEmpty()) { Empty("No meal slots yet", "Add the meals delegates get coupons for. Start from a template.", icon = Icons.star, action = { MunButton("Add Slot", { adding = true }, icon = Icons.plus) }); return@Screen }
        l.groupBy { it.day.ifBlank { "Any day" } }.toSortedMap().forEach { (day, list) ->
            Section(header = day) {
                list.forEach { s ->
                    val who = audienceLabel(s.audience?.groups, s.audience?.uids?.size ?: 0) + ((s.usesPerPerson ?: 1).takeIf { it > 1 }?.let { " · $it each" } ?: "")
                    cell(s.mealName, subtitle = (listOf(s.timeWindow, s.venue).filter { it.isNotBlank() } + who).joinToString(" · "), chevron = false, onClick = { picked = s })
                }
            }
        }
        SectionFooter("People claim each meal with their QR pass. Tap one to delete it.")
    }
    if (adding) FoodSlotSheet(dayLabels(ev.data), { adding = false }) { s ->
        runCatching { AppGraph.tools.addFoodSlot(eventId, s) }.isSuccess.also { if (it) { adding = false; tick++ } }
    }
    ActionSheet(picked != null, { picked = null }, title = picked?.mealName.orEmpty(), message = picked?.let { listOf(it.day, it.timeWindow, it.venue).filter { s -> s.isNotBlank() }.joinToString(" · ") }) {
        SheetRow("Delete Slot", {
            val s = picked ?: return@SheetRow
            picked = null
            scope.launch { runCatching { AppGraph.tools.deleteFoodSlot(eventId, s.id) }.fold(onSuccess = { tick++ }, onFailure = { alerts.show("Couldn't delete", RETRY) }) }
        }, destructive = true)
    }
}

@Composable
private fun TemplateChips(labels: List<String>, picked: String?, onPick: (Int) -> Unit) {
    val c = palette
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        labels.forEachIndexed { i, l ->
            val on = l == picked
            Box(Modifier.clip(CircleShape).background(if (on) c.tintSoft else c.cell).border(Hairline, if (on) c.tint else c.separator, CircleShape)
                .tap(rememberPress(), label = l) { onPick(i) }.padding(horizontal = 14.dp, vertical = 8.dp)) {
                Text(l, style = Type.subhead.copy(fontWeight = FontWeight.SemiBold), color = if (on) c.tint else c.label)
            }
        }
    }
}

@Composable
private fun FormSheet(title: String, action: String, enabled: Boolean, onDismiss: () -> Unit, onAction: suspend () -> Boolean, content: @Composable () -> Unit) {
    val scope = rememberCoroutineScope()
    val navPad = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    PageSheet(true, onDismiss) {
        SheetHeader(title, leading = "Cancel", onLeading = onDismiss, trailing = if (busy) "…" else action, trailingEnabled = enabled && !busy, divider = true, onTrailing = {
            busy = true; error = null
            scope.launch { if (!onAction()) error = "Couldn't save. $RETRY"; busy = false }
        })
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 14.dp, bottom = navPad + 32.dp),
            verticalArrangement = Arrangement.spacedBy(Space.section)) {
            content()
            ErrorText(error)
        }
    }
}

@Composable
private fun FieldRow(label: String, value: String, onChange: (String) -> Unit, placeholder: String, type: KeyboardType = KeyboardType.Text) {
    val c = palette
    Row(Modifier.padding(horizontal = 16.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = Type.body, color = c.label, modifier = Modifier.width(108.dp))
        PlainInput(value, onChange, placeholder, maxLength = 120, modifier = Modifier.weight(1f),
            keyboardOptions = KeyboardOptions(keyboardType = type, capitalization = if (type == KeyboardType.Text) KeyboardCapitalization.Words else KeyboardCapitalization.None))
    }
}

@Composable
private fun FoodSlotSheet(days: List<String>, onDismiss: () -> Unit, onAdd: suspend (FoodSlot) -> Boolean) {
    var s by remember { mutableStateOf(FoodSlot(day = days.firstOrNull().orEmpty(), audience = PassAudience(DEFAULT_MEAL_AUDIENCE), usesPerPerson = 1)) }
    var tpl by remember { mutableStateOf<String?>(null) }
    FormSheet("Food Slot", "Add", s.mealName.isNotBlank() && !s.audience?.groups.isNullOrEmpty(), onDismiss, { onAdd(s.copy(mealName = s.mealName.trim(), venue = s.venue.trim())) }) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SectionHeader("Start from")
            TemplateChips(FOOD_TEMPLATES.map { it.meal }, tpl) { i -> val t = FOOD_TEMPLATES[i]; tpl = t.meal; s = s.copy(mealName = t.meal, timeWindow = t.time) }
        }
        Section {
            item { FieldRow("Meal", s.mealName, { s = s.copy(mealName = it) }, "e.g. Lunch") }
            item { FieldRow("Time", s.timeWindow, { s = s.copy(timeWindow = it) }, "12:30 – 14:00") }
            item { FieldRow("Venue", s.venue, { s = s.copy(venue = it) }, "e.g. Dining hall") }
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SectionHeader("Day")
            TemplateChips(days, s.day) { i -> s = s.copy(day = days[i]) }
        }
        // Who claims it with their QR pass, and how many times each.
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SectionHeader("Who gets it")
            val groups = s.audience?.groups.orEmpty()
            MultiChips(AUDIENCE_GROUPS.map { it.second }, AUDIENCE_GROUPS.map { it.first in groups }) { i ->
                val k = AUDIENCE_GROUPS[i].first
                s = s.copy(audience = PassAudience(if (k in groups) groups - k else groups + k))
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SectionHeader("Uses per person")
            TemplateChips(listOf("1", "2", "3"), (s.usesPerPerson ?: 1).toString()) { i -> s = s.copy(usesPerPerson = i + 1) }
        }
    }
}

@Composable
private fun MultiChips(labels: List<String>, on: List<Boolean>, onToggle: (Int) -> Unit) {
    val c = palette
    androidx.compose.foundation.layout.FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        labels.forEachIndexed { i, l ->
            val sel = on[i]
            Box(Modifier.clip(CircleShape).background(if (sel) c.tintSoft else c.cell).border(Hairline, if (sel) c.tint else c.separator, CircleShape)
                .tap(rememberPress(), label = l) { onToggle(i) }.padding(horizontal = 14.dp, vertical = 8.dp)) {
                Text(l, style = Type.subhead.copy(fontWeight = FontWeight.SemiBold), color = if (sel) c.tint else c.label)
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Coupons (Pro, setup/qr-passes-plan.md P3): kits, gifts, drinks, claimed with the QR pass
// ---------------------------------------------------------------------------------------------

private val COUPON_KINDS = listOf("kit" to "Kit", "gift" to "Gift", "drink" to "Drink", "meal" to "Extra meal", "other" to "Other")

@Composable
fun CouponsScreen(eventId: String) {
    val alerts = LocalAlerts.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val ev = rememberToolsEvent(eventId)
    val uid = AppGraph.auth.user?.uid.orEmpty()
    var tick by remember { mutableIntStateOf(0) }
    var list by remember { mutableStateOf<List<Coupon>?>(null) }
    var editing by remember { mutableStateOf<Coupon?>(null) }
    var picked by remember { mutableStateOf<Coupon?>(null) }
    LaunchedEffect(eventId, tick) { list = runCatching { AppGraph.modules.coupons(eventId) }.getOrNull() ?: list ?: emptyList() }
    val pro = hasFeature(ev.data, com.munpro.app.domain.FEATURE_PASSES)
    Screen(back = "Tools", tabBar = false, title = "Coupons", overline = ev.data?.title,
        navRight = { if (pro) RoundButton(Icons.plus, "New coupon", { editing = Coupon() }) }) {
        if (ev.data == null) { Spinner(); return@Screen }
        if (!pro) {
            Empty("Coupons come with Pro", "Welcome kits, T-shirts, gala drinks: hand them out with each person's QR pass. Upgrade this event under Plan.", icon = Icons.qr,
                action = { MunButton("See Plan", { nav.go(com.munpro.app.nav.EventPlanRoute(eventId)) }, icon = Icons.star) })
            return@Screen
        }
        val l = list ?: run { Spinner(); return@Screen }
        if (l.isEmpty()) { Empty("No coupons yet", "Make one for a welcome kit, a T-shirt or a gala drink.", icon = Icons.qr, action = { MunButton("New coupon", { editing = Coupon() }, icon = Icons.plus) }); return@Screen }
        Section(footer = "People claim coupons with their QR pass. Tap one to edit, pause or delete it.") {
            l.forEach { c ->
                val who = audienceLabel(c.audience.groups.ifEmpty { listOf("none") }, c.audience.uids.size) + ((c.usesPerPerson ?: 1).takeIf { it > 1 }?.let { " · $it each" } ?: "")
                cell(c.title, subtitle = (listOf(COUPON_KINDS.firstOrNull { it.first == c.kind }?.second.orEmpty(), c.day, c.timeWindow).filter { it.isNotBlank() } + who).joinToString(" · "),
                    trailing = if (!c.active) ({ Chip("Paused") }) else null, dim = !c.active, chevron = false, onClick = { picked = c })
            }
        }
    }
    editing?.let { start ->
        CouponSheet(start, dayLabels(ev.data), { editing = null }) { c ->
            runCatching { AppGraph.tools.saveCoupon(eventId, c, uid) }.isSuccess.also { if (it) { editing = null; tick++ } }
        }
    }
    ActionSheet(picked != null, { picked = null }, title = picked?.title.orEmpty(), message = null) {
        SheetRow("Edit", { editing = picked; picked = null })
        SheetRow(if (picked?.active == true) "Pause" else "Resume", {
            val c = picked ?: return@SheetRow
            picked = null
            scope.launch { runCatching { AppGraph.tools.saveCoupon(eventId, c.copy(active = !c.active), uid) }.fold(onSuccess = { tick++ }, onFailure = { alerts.show("Couldn't save", RETRY) }) }
        })
        SheetRow("Delete", {
            val c = picked ?: return@SheetRow
            picked = null
            scope.launch {
                if (!alerts.confirm("Delete ${c.title}?", "Uses already recorded stay in the report.", "Delete", destructive = true)) return@launch
                runCatching { AppGraph.tools.deleteCoupon(eventId, c.id) }.fold(onSuccess = { tick++ }, onFailure = { alerts.show("Couldn't delete", RETRY) })
            }
        }, destructive = true)
    }
}

@Composable
private fun CouponSheet(start: Coupon, days: List<String>, onDismiss: () -> Unit, onSave: suspend (Coupon) -> Boolean) {
    var c by remember { mutableStateOf(start) }
    val groups = c.audience.groups
    FormSheet(if (start.id.isEmpty()) "New Coupon" else "Edit Coupon", "Save", c.title.isNotBlank() && (groups.isNotEmpty() || c.audience.uids.isNotEmpty()), onDismiss,
        { onSave(c.copy(title = c.title.trim(), venue = c.venue.trim(), timeWindow = c.timeWindow.trim())) }) {
        Section {
            item { FieldRow("Title", c.title, { c = c.copy(title = it.take(80)) }, "e.g. Welcome kit") }
            item { FieldRow("Time", c.timeWindow, { c = c.copy(timeWindow = it) }, "Any time") }
            item { FieldRow("Where", c.venue, { c = c.copy(venue = it) }, "e.g. Help desk") }
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SectionHeader("Kind")
            TemplateChips(COUPON_KINDS.map { it.second }, COUPON_KINDS.firstOrNull { it.first == c.kind }?.second) { i -> c = c.copy(kind = COUPON_KINDS[i].first) }
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SectionHeader("Day")
            val opts = listOf("Any day") + days
            TemplateChips(opts, c.day.ifEmpty { "Any day" }) { i -> c = c.copy(day = if (i == 0) "" else opts[i]) }
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SectionHeader("Who gets it")
            MultiChips(AUDIENCE_GROUPS.map { it.second }, AUDIENCE_GROUPS.map { it.first in groups }) { i ->
                val k = AUDIENCE_GROUPS[i].first
                c = c.copy(audience = c.audience.copy(groups = if (k in groups) groups - k else groups + k))
            }
            if (c.audience.uids.isNotEmpty()) SectionFooter("Plus ${c.audience.uids.size} named ${if (c.audience.uids.size == 1) "person" else "people"}, kept as set on the website.")
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SectionHeader("Uses per person")
            TemplateChips(listOf("1", "2", "3", "5"), (c.usesPerPerson ?: 1).toString()) { i -> c = c.copy(usesPerPerson = listOf(1, 2, 3, 5)[i]) }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// C5.4 · Transport routes
// ---------------------------------------------------------------------------------------------

@Composable
fun TransportRoutesScreen(eventId: String) {
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    var tick by remember { mutableIntStateOf(0) }
    var routes by remember { mutableStateOf<List<TransportRoute>?>(null) }
    var adding by remember { mutableStateOf(false) }
    var picked by remember { mutableStateOf<TransportRoute?>(null) }
    LaunchedEffect(eventId, tick) { routes = runCatching { AppGraph.modules.routes(eventId) }.getOrNull() ?: routes ?: emptyList() }
    Screen(back = "Tools", tabBar = false, title = "Transport", navRight = { RoundButton(Icons.plus, "Add route", { adding = true }) }) {
        val l = routes ?: run { Spinner(); return@Screen }
        if (l.isEmpty()) { Empty("No routes yet", "Add shuttle routes delegates can register for.", icon = Icons.pin, action = { MunButton("Add Route", { adding = true }, icon = Icons.plus) }); return@Screen }
        Section(footer = "Delegates register from their portal; a full route stops taking registrations. Tap one to delete it.") {
            l.forEach { r ->
                val cap = r.capacity ?: 0
                cell(r.routeName.ifBlank { "${r.pickupPoint} → ${r.dropoffPoint}" },
                    subtitle = listOfNotNull(r.departureTime.ifBlank { null }?.let { "Departs $it" }, r.returnTime.ifBlank { null }?.let { "returns $it" }).joinToString(" · ").ifEmpty { "${r.pickupPoint} → ${r.dropoffPoint}" },
                    value = "${r.registeredDelegates.size} of $cap", trailing = if (cap > 0 && r.full) ({ Chip("Full", Tone.Warning) }) else null, chevron = false, onClick = { picked = r })
            }
        }
    }
    if (adding) RouteSheet({ adding = false }) { r -> runCatching { AppGraph.tools.addRoute(eventId, r) }.isSuccess.also { if (it) { adding = false; tick++ } } }
    ActionSheet(picked != null, { picked = null }, title = picked?.routeName.orEmpty(), message = picked?.let { "${it.registeredDelegates.size} registered" }) {
        SheetRow("Delete Route", {
            val r = picked ?: return@SheetRow
            picked = null
            scope.launch {
                if (r.registeredDelegates.isNotEmpty() && !alerts.confirm("Delete ${r.routeName}?", "${r.registeredDelegates.size} delegates registered for it lose their seat.", "Delete", destructive = true)) return@launch
                runCatching { AppGraph.tools.deleteRoute(eventId, r.id) }.fold(onSuccess = { tick++ }, onFailure = { alerts.show("Couldn't delete", RETRY) })
            }
        }, destructive = true)
    }
}

@Composable
private fun RouteSheet(onDismiss: () -> Unit, onAdd: suspend (TransportRoute) -> Boolean) {
    var r by remember { mutableStateOf(TransportRoute(capacity = 20)) }
    var tpl by remember { mutableStateOf<String?>(null) }
    FormSheet("Route", "Add", r.routeName.isNotBlank() && (r.capacity ?: 0) > 0, onDismiss, { onAdd(r.copy(routeName = r.routeName.trim())) }) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SectionHeader("Start from")
            TemplateChips(ROUTE_TEMPLATES.map { it.label }, tpl) { i ->
                val t = ROUTE_TEMPLATES[i]; tpl = t.label
                r = TransportRoute(routeName = t.name, pickupPoint = t.pickup, dropoffPoint = t.dropoff, departureTime = t.departs, returnTime = t.returns, capacity = t.capacity)
            }
        }
        Section {
            item { FieldRow("Name", r.routeName, { r = r.copy(routeName = it) }, "e.g. Hotel → Venue") }
            item { FieldRow("Pickup", r.pickupPoint, { r = r.copy(pickupPoint = it) }, "Hotel lobby") }
            item { FieldRow("Drop-off", r.dropoffPoint, { r = r.copy(dropoffPoint = it) }, "Venue") }
            item { FieldRow("Departs", r.departureTime, { r = r.copy(departureTime = it) }, "08:00") }
            item { FieldRow("Returns", r.returnTime, { r = r.copy(returnTime = it) }, "18:00") }
            item { FieldRow("Capacity", (r.capacity ?: 0).takeIf { it > 0 }?.toString().orEmpty(), { v -> r = r.copy(capacity = v.filter(Char::isDigit).take(4).toIntOrNull() ?: 0) }, "40", KeyboardType.Number) }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// C5.5 · Accommodation
// ---------------------------------------------------------------------------------------------

@Composable
fun AccommodationSetupScreen(eventId: String) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val apps = rememberToolsApps(eventId)
    var tick by remember { mutableIntStateOf(0) }
    var blocks by remember { mutableStateOf<List<AccommodationBlock>?>(null) }
    var requests by remember { mutableStateOf<List<AccommodationRequest>>(emptyList()) }
    var adding by remember { mutableStateOf(false) }
    var picked by remember { mutableStateOf<AccommodationBlock?>(null) }
    var busy by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(eventId, tick) {
        runCatching { AppGraph.modules.blocks(eventId) to AppGraph.tools.roomRequests(eventId) }.onSuccess { (b, r) -> blocks = b; requests = r }.onFailure { if (blocks == null) blocks = emptyList() }
    }
    fun left(b: AccommodationBlock?) = b?.let { maxOf(0, (it.availableRooms ?: 0) - requests.count { r -> r.blockId == it.id && r.status == "confirmed" }) }
    val nameOf = apps.data.orEmpty().associate { it.userId to it.applicantName.orEmpty() }
    fun decide(r: AccommodationRequest, status: String) = scope.launch {
        busy = r.id
        runCatching { AppGraph.tools.decideRoom(eventId, r.id, status) }.fold(onSuccess = { tick++ }, onFailure = { alerts.show("Couldn't save", RETRY) })
        busy = null
    }
    Screen(back = "Tools", tabBar = false, title = "Accommodation", navRight = { RoundButton(Icons.plus, "Add block", { adding = true }) }) {
        val bl = blocks ?: run { Spinner(); return@Screen }
        val pending = requests.filter { it.status == "pending" }
        if (pending.isNotEmpty()) Section(header = "Requests · ${pending.size}") {
            pending.forEach { r ->
                val b = bl.firstOrNull { it.id == r.blockId }
                val full = left(b) == 0
                item {
                    Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(nameOf[r.delegateUid]?.ifEmpty { null } ?: "Delegate", style = Type.headline, color = c.label)
                        Text(listOfNotNull(r.blockName, b?.roomType?.ifEmpty { null }, if (full) "full" else null).joinToString(" · "), style = Type.footnote, color = if (full) c.orange else c.label2)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Pill("Reject", { decide(r, "rejected") }, tone = Tone.Destructive, enabled = busy == null)
                            Pill("Confirm", { decide(r, "confirmed") }, filled = true, enabled = busy == null && !full)
                        }
                    }
                }
            }
        }
        if (bl.isEmpty()) { Empty("No room blocks yet", "Add the rooms delegates can request. Start from a template.", icon = Icons.home, action = { MunButton("Add Block", { adding = true }, icon = Icons.plus) }); return@Screen }
        Section(header = "Blocks", footer = "Rooms left = rooms minus confirmed requests. Tap a block to delete it.") {
            bl.forEach { b ->
                val l = left(b) ?: 0
                cell(b.blockName, subtitle = listOfNotNull(b.roomType.ifEmpty { null }, b.pricePerNight?.let { "$${if (it % 1.0 == 0.0) it.toInt() else it} / night" }).joinToString(" · "),
                    value = if (l == 0) "full" else "$l left", chevron = false, onClick = { picked = b })
            }
        }
    }
    if (adding) BlockSheet({ adding = false }) { b -> runCatching { AppGraph.tools.addBlock(eventId, b) }.isSuccess.also { if (it) { adding = false; tick++ } } }
    ActionSheet(picked != null, { picked = null }, title = picked?.blockName.orEmpty()) {
        SheetRow("Delete Block", {
            val b = picked ?: return@SheetRow
            picked = null
            scope.launch { runCatching { AppGraph.tools.deleteBlock(eventId, b.id) }.fold(onSuccess = { tick++ }, onFailure = { alerts.show("Couldn't delete", RETRY) }) }
        }, destructive = true)
    }
}

@Composable
private fun BlockSheet(onDismiss: () -> Unit, onAdd: suspend (AccommodationBlock) -> Boolean) {
    var b by remember { mutableStateOf(AccommodationBlock()) }
    var tpl by remember { mutableStateOf<String?>(null) }
    FormSheet("Room Block", "Add", b.blockName.isNotBlank() && (b.availableRooms ?: 0) > 0, onDismiss, { onAdd(b.copy(blockName = b.blockName.trim())) }) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SectionHeader("Start from")
            TemplateChips(BLOCK_TEMPLATES.map { it.label }, tpl) { i -> val t = BLOCK_TEMPLATES[i]; tpl = t.label; b = AccommodationBlock(blockName = t.name, roomType = t.roomType, pricePerNight = t.price, availableRooms = t.rooms) }
        }
        Section {
            item { FieldRow("Name", b.blockName, { b = b.copy(blockName = it) }, "e.g. Hotel Lakeview") }
            item { FieldRow("Room type", b.roomType, { b = b.copy(roomType = it) }, "Twin, Single…") }
            item { FieldRow("Price / night", b.pricePerNight?.takeIf { it > 0 }?.let { if (it % 1.0 == 0.0) it.toInt().toString() else it.toString() }.orEmpty(), { v -> b = b.copy(pricePerNight = v.filter { it.isDigit() || it == '.' }.take(7).toDoubleOrNull() ?: 0.0) }, "40", KeyboardType.Decimal) }
            item { FieldRow("Rooms", (b.availableRooms ?: 0).takeIf { it > 0 }?.toString().orEmpty(), { v -> b = b.copy(availableRooms = v.filter(Char::isDigit).take(4).toIntOrNull() ?: 0) }, "10", KeyboardType.Number) }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// C5.6 · Dress code
// ---------------------------------------------------------------------------------------------

@Composable
fun DressCodeSetupScreen(eventId: String) {
    val c = palette
    val alerts = LocalAlerts.current
    val goBack = LocalBack.current
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var loaded by remember { mutableStateOf(false) }
    var original by remember { mutableStateOf(DressCode()) }
    var text by remember { mutableStateOf("") }
    var images by remember { mutableStateOf(listOf<String>()) }
    var uploading by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var aiBusy by remember { mutableStateOf(false) }
    LaunchedEffect(eventId) {
        original = runCatching { AppGraph.modules.dressCode(eventId) }.getOrNull() ?: DressCode()
        text = original.text; images = original.images; loaded = true
    }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        uploading = true
        scope.launch {
            runCatching { Api.uploadImage(prepareImage(context, uri, 1600)) }.onSuccess { images = images + it }.onFailure { alerts.show("Couldn't upload the image", RETRY) }
            uploading = false
        }
    }
    val dirty = loaded && (text != original.text || images != original.images)
    Screen(back = "Tools", tabBar = false, title = "Dress code",
        navRight = { Pill(if (saving) "…" else "Save", {
            saving = true
            scope.launch {
                runCatching { AppGraph.tools.saveDressCode(eventId, DressCode(text.trim(), images)) }.fold(onSuccess = { goBack() }, onFailure = { alerts.show("Couldn't save", RETRY) })
                saving = false
            }
        }, filled = true, enabled = dirty && !saving) }) {
        if (!loaded) { Spinner(); return@Screen }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SectionHeader("Start from")
            TemplateChips(DRESS_TEMPLATES.map { it.first }, DRESS_TEMPLATES.firstOrNull { it.second == text }?.first) { i -> text = DRESS_TEMPLATES[i].second }
        }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PlainInput(text, { text = it }, "Describe the expected attire for delegates, chairs and staff…", singleLine = false, minLines = 4, maxLength = 2000,
                modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
            if (Api.available) TextLink(if (aiBusy) "Writing…" else if (text.isBlank()) "Suggest with AI" else "Improve", {
                if (aiBusy) return@TextLink
                aiBusy = true
                scope.launch {
                    writingAssist(if (text.isBlank()) "suggest" else "improve", "dress-code-note", text)?.let { text = it.take(2000) } ?: alerts.show("AI couldn't help this time", "Try again in a moment.")
                    aiBusy = false
                }
            }, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold))
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { SectionHeader("Reference images") }
                TextLink(if (uploading) "Uploading…" else "+ Add", { if (!uploading) pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold))
            }
            if (images.isEmpty()) SectionFooter("No images yet. Add photos of the attire you expect.")
            else Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                images.forEach { url ->
                    Box(Modifier.size(120.dp).clip(RoundedCornerShape(14.dp)).background(c.fillSoft)) {
                        RemoteImage(url, Modifier.fillMaxSize(), "Reference")
                        Box(Modifier.align(Alignment.TopEnd).padding(6.dp).size(26.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.55f))
                            .tap(rememberPress(), label = "Remove image") { images = images - url }, contentAlignment = Alignment.Center) { SfIcon(Icons.close, Color.White, size = 12.dp) }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// C5.7 · Complaints
// ---------------------------------------------------------------------------------------------

private fun closed(c: Complaint) = c.status == "resolved" || c.status == "rejected"

private fun ago(ms: Long): String {
    val m = (System.currentTimeMillis() - ms) / 60_000
    return when { m < 60 -> "${maxOf(1, m)}m"; m < 1440 -> "${m / 60}h"; else -> "${m / 1440}d" }
}

@Composable
fun OrgComplaintsScreen(eventId: String) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val uid = AppGraph.auth.user?.uid.orEmpty()
    val apps = rememberToolsApps(eventId)
    val list by remember(eventId, uid) { AppGraph.tools.complaints(eventId, uid) }.collectAsState(initial = null)
    var tab by rememberSaveable { mutableStateOf("active") }
    val notes = remember { mutableStateMapOf<String, String>() }
    var busy by remember { mutableStateOf<String?>(null) }
    val active = list.orEmpty().filter { !closed(it) }
    val done = list.orEmpty().filter { closed(it) }
    fun act(r: Complaint, label: String, fn: suspend () -> Unit) = scope.launch {
        busy = r.id
        runCatching { fn() }.onFailure { alerts.show("Couldn't $label", RETRY) }
        busy = null
    }
    Screen(back = "Tools", tabBar = false, title = "Complaints") {
        Segmented(listOf("active" to "Active · ${active.size}", "resolved" to "Resolved · ${done.size}"), tab, { tab = it })
        val shown = if (tab == "active") active else done
        when {
            list == null -> Spinner()
            shown.isEmpty() -> Empty(if (tab == "active") "Nothing waiting" else "Nothing resolved yet", "Complaints a chair escalates, or that are sent to you, appear here.", icon = Icons.alert)
            else -> shown.forEach { r ->
                val from = apps.data?.firstOrNull { it.id == r.applicationId }
                val esc = r.history.lastOrNull { it.action == "escalated" }
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Chip(complaintTypeLabel(r.type), Tone.Info)
                        Chip(complaintStatusLabel(r.status), if (closed(r)) Tone.Tint else if (r.status == "escalated") Tone.Warning else Tone.Neutral)
                        Spacer(Modifier.weight(1f))
                        r.createdAt?.let { Text(ago(it), style = Type.footnote, color = c.label2) }
                    }
                    if (esc != null && !closed(r)) Text("From the ${esc.actorRole.ifEmpty { "chair" }}${esc.timestamp?.let { " · ${ago(it)} ago" } ?: ""}: ${esc.message}", style = Type.footnote, color = c.orange)
                    Text(r.subject, style = Type.headline, color = c.label)
                    if (r.description.isNotBlank()) Text(r.description, style = Type.subhead, color = c.label)
                    from?.let { a -> Text(listOfNotNull(a.applicantName?.ifEmpty { null }, com.munpro.app.domain.effectiveCommittee(a).ifEmpty { null }, a.assignedCountry?.ifEmpty { null }?.let(::countryName)).joinToString(" · "), style = Type.footnote, color = c.label2) }
                    r.resolution?.takeIf { it.isNotBlank() }?.let { Text("Resolution: $it", style = Type.footnote, color = c.tint) }
                    if (!closed(r)) {
                        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.field)).background(c.fillSoft).padding(horizontal = 12.dp, vertical = 10.dp)) {
                            PlainInput(notes[r.id].orEmpty(), { notes[r.id] = it }, "Resolution, or the reason to escalate or reject", singleLine = false, maxLength = 500, modifier = Modifier.fillMaxWidth(),
                                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
                        }
                        if (Api.available) TextLink("Help me write", {
                            scope.launch { writingAssist(if (notes[r.id].isNullOrBlank()) "suggest" else "improve", "complaint-resolution", notes[r.id].orEmpty(), instruction = r.subject)?.let { notes[r.id] = it.take(500) } }
                        }, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            MunButton("Reject", { act(r, "reject") { AppGraph.tools.rejectComplaint(r.id, notes[r.id].orEmpty(), r.assignedRole ?: "organizer") } },
                                variant = ButtonVariant.Plain, destructive = true, enabled = busy == null, height = 42.dp, modifier = Modifier.weight(1f))
                            MunButton("Escalate", {
                                scope.launch {
                                    if (!alerts.confirm("Escalate this complaint?", "It goes up to the main organizer or the platform admin, who gets an email.", "Escalate")) return@launch
                                    act(r, "escalate") { AppGraph.chairHub.escalateRequest(r, notes[r.id].orEmpty().ifBlank { "Escalated by ${r.assignedRole ?: "organizer"}." }, r.assignedRole ?: "organizer") }
                                }
                            }, variant = ButtonVariant.Tinted, enabled = busy == null, height = 42.dp, modifier = Modifier.weight(1f))
                            MunButton("Resolve", { act(r, "resolve") { AppGraph.chairHub.resolveRequest(r.id, notes[r.id].orEmpty(), r.assignedRole ?: "organizer") } },
                                loading = busy == r.id, enabled = busy == null, height = 42.dp, modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// C5.10 / C5.11 · Results, standings
// ---------------------------------------------------------------------------------------------

@Composable
fun ResultsApprovalScreen(eventId: String) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val ev = rememberToolsEvent(eventId)
    val apps = rememberToolsApps(eventId)
    val results by remember(eventId) { AppGraph.tools.results(eventId) }.collectAsState(initial = null)
    val boards = rememberCached("orgStandings:$eventId", ListSerializer(Standings.serializer()), Fresh.SHORT) { AppGraph.tools.standings(eventId) }
    var tab by rememberSaveable { mutableStateOf("awards") }
    var committee by rememberSaveable { mutableStateOf("all") }
    var busy by remember { mutableStateOf(false) }
    var revising by remember { mutableStateOf<AwardResult?>(null) }
    val emailOf = { uid: String -> apps.data?.firstOrNull { it.userId == uid }?.applicantEmail }
    val nameOf = { r: AwardResult -> r.delegateName.ifEmpty { apps.data?.firstOrNull { it.userId == r.delegateUid }?.applicantName.orEmpty() }.ifEmpty { "Delegate" } }
    val awards = results.orEmpty().filter { it.awardType != "none" }
    val pending = awards.filter { it.status == "pending" }
    fun approve(list: List<AwardResult>) = scope.launch {
        busy = true
        runCatching { AppGraph.tools.approve(eventId, ev.data?.title ?: "the conference", list, emailOf) }
            .fold(onSuccess = { alerts.show(if (list.size == 1) "Approved" else "${list.size} approved", "Their certificates are unlocked and they got an email.") }, onFailure = { alerts.show("Couldn't approve", RETRY) })
        busy = false
    }
    Screen(back = "Tools", tabBar = false, title = "Results", overline = ev.data?.title) {
        Segmented(listOf("awards" to "Awards · ${awards.size}", "standings" to "Standings"), tab, { tab = it })
        val names = (awards.map { it.committeeName.ifEmpty { it.committeeId } } + boards.data.orEmpty().map { it.id }).filter { it.isNotEmpty() }.distinct().sorted()
        if (names.size > 1) FilterChips(listOf("all" to "All") + names.map { it to it }, committee) { committee = it }
        if (tab == "awards") {
            if (results == null) { Spinner(); return@Screen }
            val shown = awards.filter { committee == "all" || it.committeeName == committee || it.committeeId == committee }
                .sortedWith(compareBy({ it.status != "pending" }, { it.committeeName }))
            if (shown.isEmpty()) { Empty("No awards yet", "Chairs submit awards from their Awards & Results screen.", icon = Icons.trophy); return@Screen }
            Section(footer = "Approving unlocks the delegate's certificate and emails them.") {
                shown.forEach { r ->
                    item {
                        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("${nameOf(r)} · ${awardLabel(r.awardType) ?: r.awardType}", style = Type.headline, color = c.label, modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                                Chip(when (r.status) { "approved" -> "Approved"; "revision_requested" -> "Revision asked"; else -> "Pending" },
                                    when (r.status) { "approved" -> Tone.Tint; "revision_requested" -> Tone.Warning; else -> Tone.Neutral })
                            }
                            Text(listOfNotNull(r.committeeName.ifEmpty { r.committeeId }.ifEmpty { null }, r.score?.let { "${it.roundToInt()}%" }).joinToString(" · "), style = Type.footnote, color = c.label2)
                            if (r.status == "revision_requested") r.notes?.takeIf { it.isNotBlank() }?.let { Text("Note: $it", style = Type.footnote, color = c.orange) }
                            if (r.status == "pending") Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Pill("Ask to revise", { revising = r }, enabled = !busy)
                                Pill("Approve", { approve(listOf(r)) }, filled = true, enabled = !busy)
                            }
                        }
                    }
                }
            }
            if (pending.size > 1) MunButton("Approve All Pending (${pending.size})", {
                scope.launch { if (alerts.confirm("Approve ${pending.size} awards?", "Each delegate's certificate unlocks and they get an email.", "Approve All")) approve(pending) }
            }, loading = busy)
        } else {
            val list = boards.data
            if (list == null) { if (boards.failed) Empty("Couldn't load standings", "Pull down to try again.", icon = Icons.chart) else Spinner(); return@Screen }
            val shown = list.filter { committee == "all" || it.id == committee }
            if (shown.isEmpty()) { Empty("Nothing published yet", "Chairs publish their committee's standings from Awards & Results.", icon = Icons.chart); return@Screen }
            shown.forEach { b ->
                Section(header = b.id, footer = "Published by the chair · ${if (b.visibility == "rank_only") "ranks only" else "full board"}") {
                    b.entries.sortedBy { it.rank ?: Int.MAX_VALUE }.forEach { s ->
                        cell(s.name.ifEmpty { "Delegate" }, subtitle = countryName(s.country).ifEmpty { null },
                            leading = { Text("${s.rank ?: "–"}", style = Type.headline, color = c.tint, modifier = Modifier.width(26.dp), textAlign = TextAlign.Center) },
                            value = s.finalScore?.let { "${it.roundToInt()}%" }, chevron = false, inset = 58.dp)
                    }
                }
            }
        }
    }
    revising?.let { r ->
        var note by remember(r.id) { mutableStateOf("") }
        FormSheet("Ask to Revise", "Send", true, { revising = null }, {
            runCatching { AppGraph.tools.askRevision(eventId, r.id, note) }.isSuccess.also { if (it) revising = null }
        }) {
            Text("${nameOf(r)} · ${awardLabel(r.awardType) ?: r.awardType}", style = Type.headline, color = c.label, modifier = Modifier.padding(horizontal = 4.dp))
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(14.dp)) {
                PlainInput(note, { note = it }, "What should the chair change?", singleLine = false, minLines = 3, maxLength = 500, modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
            }
            SectionFooter("The chair sees this note and can submit the award again.")
        }
    }
}

// ---------------------------------------------------------------------------------------------
// C5.8 · Certificates
// ---------------------------------------------------------------------------------------------

/** The certificate's colours and alignment per template (web CertificateDocument). */
internal data class CertLook(val border: Color, val accent: Color, val paper: Color, val centered: Boolean, val serif: Boolean)

internal fun certLook(template: String?): CertLook = when (certificateTemplate(template)) {
    "modern" -> CertLook(Color(0xFF7C3AED), Color(0xFF7C3AED), Color.White, centered = false, serif = false)
    "ornate" -> CertLook(Color(0xFFD4AF37), Color(0xFFB08D2E), Color.White, centered = true, serif = true)
    else -> CertLook(Color(0xFF1E293B), Color(0xFF1E293B), Color(0xFFFDFBF7), centered = true, serif = true)
}

@Composable
internal fun CertificateMini(template: String, modifier: Modifier = Modifier) {
    val look = certLook(template)
    val frame = when (certificateTemplate(template)) {
        "modern" -> Modifier.background(look.paper)
        "ornate" -> Modifier.background(look.paper).border(7.dp, look.border)
        else -> Modifier.background(look.paper).border(3.dp, look.border).padding(3.dp).border(1.dp, look.border)
    }
    Row(modifier.aspectRatio(1.414f).clip(RoundedCornerShape(6.dp)).then(frame)) {
        if (certificateTemplate(template) == "modern") Box(Modifier.width(8.dp).fillMaxSize().background(look.border))
        Column(Modifier.weight(1f).fillMaxSize().padding(10.dp), horizontalAlignment = if (look.centered) Alignment.CenterHorizontally else Alignment.Start, verticalArrangement = Arrangement.Center) {
            Text("CERTIFICATE", style = Type.caption.copy(letterSpacing = 1.5.sp, fontSize = 8.sp), color = Color(0xFF64748B))
            Text("of Participation", style = Type.subhead.copy(fontFamily = if (look.serif) FontFamily.Serif else FontFamily.Default, fontSize = 12.sp), color = look.accent)
            Box(Modifier.padding(vertical = 4.dp).width(60.dp).height(1.dp).background(Color(0xFFCBD5E1)))
            Text("Delegate name", style = Type.caption.copy(fontFamily = if (look.serif) FontFamily.Serif else FontFamily.Default, fontSize = 10.sp), color = Color(0xFF0F172A))
        }
    }
}

@Composable
fun CertificatesSetupScreen(eventId: String) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val ev = rememberToolsEvent(eventId)
    val e = ev.data
    var current by remember(e?.id) { mutableStateOf(certificateTemplate(e?.certificateTemplate)) }
    Screen(back = "Tools", tabBar = false, title = "Certificates", overline = e?.title) {
        if (e == null) { Spinner(); return@Screen }
        CERTIFICATE_TEMPLATES.forEach { t ->
            val on = t.id == current
            val locked = t.pro && !hasFeature(e, com.munpro.app.domain.FEATURE_ORNATE)
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell)
                .border(if (on) 2.dp else Hairline, if (on) c.tint else c.separator, RoundedCornerShape(Radius.cell))
                .tap(rememberPress(), label = t.name) {
                    if (on) return@tap
                    if (locked) { alerts.show("${t.name} is a Pro template", "Make this event Pro under Event › Plan to use it."); return@tap }
                    val prev = current
                    current = t.id
                    scope.launch { runCatching { AppGraph.tools.setCertificateTemplate(eventId, t.id); refreshToolsEvent(eventId) }.onFailure { current = prev; alerts.show("Couldn't save", RETRY) } }
                }.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                CertificateMini(t.id, Modifier.fillMaxWidth())
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(t.name, style = Type.headline, color = c.label, modifier = Modifier.weight(1f))
                    if (t.pro) Chip("Pro", Tone.Warning)
                    if (on) { Spacer(Modifier.width(8.dp)); SfIcon(Icons.check, c.tint, size = 18.dp) }
                }
            }
        }
        SectionFooter("Used for every certificate delegates download: Best, Outstanding, Honourable, Verbal and Participation. Certificates unlock when you approve results.")
    }
}

// ---------------------------------------------------------------------------------------------
// C5.9 · ID cards (made on the phone; the server's Cloud Function isn't available on this plan)
// ---------------------------------------------------------------------------------------------

private fun initials(name: String) = name.split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1).uppercase() }.ifEmpty { "?" }

@Composable
fun IdCardsScreen(eventId: String) {
    val c = palette
    val context = LocalContext.current
    val ev = rememberToolsEvent(eventId)
    val apps = rememberToolsApps(eventId)
    val e = ev.data
    var people by remember { mutableStateOf<List<IdCardPerson>?>(null) }
    var template by rememberSaveable { mutableStateOf("modern") }
    var group by rememberSaveable { mutableStateOf("all") }
    var withQr by rememberSaveable { mutableStateOf(true) }
    var building by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val alerts = LocalAlerts.current
    LaunchedEffect(apps.data) { apps.data?.let { a -> people = runCatching { AppGraph.tools.idCardPeople(eventId, a) }.getOrDefault(emptyList()) } }
    val accentHex = themeHex(e?.theme) ?: "#0B6E4F"
    val accent = Color(hexToArgb(accentHex))
    val ink = if (inkIsDark(accentHex)) Color(0xFF1B1F2A) else Color.White
    Screen(back = "Tools", tabBar = false, title = "ID cards", overline = e?.title) {
        val all = people
        if (e == null || all == null) { Spinner(); return@Screen }
        val staff = all.filter { it.staff }
        val delegates = all.filter { !it.staff }
        val chosen = when (group) { "delegates" -> delegates; "staff" -> staff; else -> all }
        val sample = chosen.firstOrNull() ?: IdCardPerson("", "Delegate name", "Delegate of Japan", "Committee")
        IdCardPreview(e.title, sample, template, accent, ink)
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SectionHeader("Template")
            Segmented(listOf("modern" to "Modern", "classic" to "Classic", "bold" to "Bold"), template, { template = it })
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SectionHeader("Print for")
            Segmented(listOf("all" to "All · ${all.size}", "delegates" to "Delegates · ${delegates.size}", "staff" to "Staff · ${staff.size}"), group, { group = it })
        }
        val passesPro = hasFeature(e, com.munpro.app.domain.FEATURE_PASSES)
        Section(footer = if (passesPro) "The same code as My pass on their phone. Resetting a pass makes its printed card stop working." else "Printing QR passes on cards comes with a Pro event.") {
            item { Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Print QR passes", style = Type.body, color = if (passesPro) c.label else c.label3, modifier = Modifier.weight(1f))
                if (passesPro) Toggle(withQr, { v -> withQr = v }, "Print QR passes") else Chip("Pro", Tone.Warning)
            } }
        }
        MunButton(if (building) "Getting passes…" else "Generate PDF", {
            val ink = if (inkIsDark(accentHex)) "#1b1f2a" else "#ffffff"
            if (!(passesPro && withQr)) { printIdCards(context, e.title, chosen, template, accentHex, ink); return@MunButton }
            building = true
            scope.launch {
                runCatching { AppGraph.modules.passCodes(eventId, chosen.map { it.uid }) }
                    .onSuccess { codes -> printIdCards(context, e.title, chosen, template, accentHex, ink, codes) }
                    .onFailure { alerts.show("Couldn't get the passes", it.message ?: RETRY) }
                building = false
            }
        }, enabled = chosen.isNotEmpty() && !building, icon = Icons.doc)
        SectionFooter("Ten cards to an A4 page, in your theme colour. It opens Android's print screen: choose “Save as PDF” or a printer.")
    }
}

@Composable
private fun IdCardPreview(event: String, p: IdCardPerson, template: String, accent: Color, ink: Color) {
    val bold = template == "bold"
    val classic = template == "classic"
    Column(Modifier.fillMaxWidth().aspectRatio(1.586f).clip(RoundedCornerShape(16.dp)).background(if (bold) accent else Color.White)
        .border(Hairline, Color(0xFFCBD5E1), RoundedCornerShape(16.dp))) {
        Box(Modifier.fillMaxWidth().then(if (!bold && !classic) Modifier.background(accent) else Modifier).padding(horizontal = 16.dp, vertical = 10.dp)) {
            Text(event.uppercase(), style = Type.caption.copy(letterSpacing = 1.2.sp), color = if (classic) accent else ink, maxLines = 1, overflow = TextOverflow.Ellipsis,
                textAlign = if (classic) TextAlign.Center else TextAlign.Start, modifier = Modifier.fillMaxWidth())
        }
        if (classic) Box(Modifier.fillMaxWidth().height(2.dp).background(accent))
        Row(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = if (classic) Arrangement.Center else Arrangement.Start) {
            if (!classic) {
                Box(Modifier.size(58.dp).clip(CircleShape).background(if (bold) Color.White.copy(alpha = 0.18f) else Color(0xFFEEF2F0)), contentAlignment = Alignment.Center) {
                    Text(initials(p.name), style = Type.title2, color = if (bold) ink else accent)
                }
                Spacer(Modifier.width(14.dp))
            }
            Column(horizontalAlignment = if (classic) Alignment.CenterHorizontally else Alignment.Start) {
                Text(p.name, style = Type.title2.copy(fontFamily = if (classic) FontFamily.Serif else FontFamily.Default), color = if (bold) ink else Color(0xFF0F172A), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(p.role, style = Type.subhead, color = if (bold) ink else Color(0xFF334155))
                if (p.committee.isNotEmpty()) Text(p.committee, style = Type.footnote, color = if (bold) ink else Color(0xFF64748B), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Text("OFFICIAL CREDENTIAL", style = Type.caption.copy(fontSize = 9.sp, letterSpacing = 1.sp), color = if (bold) ink else Color(0xFF94A3B8),
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), textAlign = if (classic) TextAlign.Center else TextAlign.Start)
    }
}

private var printingCards: WebView? = null

private fun escHtml(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

/** A QR as inline SVG for the printed card (zxing, the same library as the phone pass). */
private fun qrSvg(value: String): String {
    val m = com.google.zxing.qrcode.QRCodeWriter().encode(value, com.google.zxing.BarcodeFormat.QR_CODE, 0, 0, mapOf(com.google.zxing.EncodeHintType.MARGIN to 1))
    val path = StringBuilder()
    for (y in 0 until m.height) for (x in 0 until m.width) if (m.get(x, y)) path.append("M$x ${y}h1v1h-1z")
    return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 ${m.width} ${m.height}\" shape-rendering=\"crispEdges\"><rect width=\"100%\" height=\"100%\" fill=\"#fff\"/><path d=\"$path\" fill=\"#000\"/></svg>"
}

private fun printIdCards(context: Context, event: String, people: List<IdCardPerson>, template: String, accent: String, ink: String, codes: Map<String, String> = emptyMap()) {
    val bold = template == "bold"
    val classic = template == "classic"
    val cards = people.joinToString("") { p ->
        """<div class="card">
          <div class="band">${escHtml(event.uppercase())}</div>
          <div class="body">${if (classic) "" else "<div class=\"av\">${escHtml(initials(p.name))}</div>"}
            <div class="who"><div class="n">${escHtml(p.name)}</div><div class="r">${escHtml(p.role)}</div>${if (p.committee.isNotEmpty()) "<div class=\"c\">${escHtml(p.committee)}</div>" else ""}</div>
            ${codes[p.uid]?.let { "<div class=\"qr\">${qrSvg(it)}</div>" } ?: ""}
          </div>
          <div class="foot">OFFICIAL CREDENTIAL</div>
        </div>"""
    }
    val html = """
        <!DOCTYPE html><html><head><meta charset="utf-8"><style>
        @page{size:A4;margin:5mm 12mm}
        body{margin:0;font-family:sans-serif}
        .grid{display:grid;grid-template-columns:85.6mm 85.6mm;gap:3mm 8mm;justify-content:center}
        .card{width:85.6mm;height:54mm;box-sizing:border-box;border:0.3mm solid #cbd5e1;border-radius:3mm;overflow:hidden;display:flex;flex-direction:column;break-inside:avoid;
          background:${if (bold) accent else "#fff"};color:${if (bold) ink else "#0f172a"}}
        .band{padding:2.4mm 4mm;font-size:7pt;font-weight:bold;letter-spacing:1px;${when { classic -> "color:$accent;text-align:center;border-bottom:0.6mm solid $accent"; bold -> "color:$ink"; else -> "background:$accent;color:$ink" }}}
        .body{flex:1;display:flex;align-items:center;gap:3.5mm;padding:0 4mm;${if (classic) "justify-content:center;text-align:center" else ""}}
        .av{width:15mm;height:15mm;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:13pt;
          background:${if (bold) "rgba(255,255,255,.18)" else "#eef2f0"};color:${if (bold) ink else accent}}
        .n{font-weight:bold;font-size:11pt;${if (classic) "font-family:Georgia,serif" else ""}}
        .r{font-size:8pt;margin-top:1mm;opacity:.85}
        .c{font-size:7pt;margin-top:.6mm;opacity:.7}
        .qr{width:21mm;height:21mm;margin-left:auto;flex:none;background:#fff;padding:0.8mm;border-radius:1mm;box-sizing:border-box}
        .qr svg{width:100%;height:100%;display:block}
        .foot{font-size:5.5pt;letter-spacing:1px;padding:0 4mm 2.2mm;opacity:.6;${if (classic) "text-align:center" else ""}}
        </style></head><body><div class="grid">$cards</div></body></html>
    """.trimIndent()
    val view = WebView(context)
    printingCards = view
    view.webViewClient = object : WebViewClient() {
        override fun onPageFinished(v: WebView, url: String?) {
            val pm = context.getSystemService(Context.PRINT_SERVICE) as PrintManager
            pm.print("ID cards - $event", v.createPrintDocumentAdapter("id-cards"), PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build())
            printingCards = null
        }
    }
    view.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
}

// ---------------------------------------------------------------------------------------------
// C5.12 · Theme
// ---------------------------------------------------------------------------------------------

@Composable
fun ThemeSetupScreen(eventId: String) {
    val c = palette
    val alerts = LocalAlerts.current
    val goBack = LocalBack.current
    val scope = rememberCoroutineScope()
    val ev = rememberToolsEvent(eventId)
    val e = ev.data
    val start = e?.theme.orEmpty()
    var theme by remember(e?.id) { mutableStateOf(if (start.startsWith("#")) "custom" else start.ifEmpty { "classic-blue" }) }
    var custom by remember(e?.id) { mutableStateOf(if (start.startsWith("#")) start else "#4f46e5") }
    var saving by remember { mutableStateOf(false) }
    val valid = Regex("^#[0-9a-fA-F]{6}$").matches(custom)
    val value = if (theme == "custom") custom else theme
    val hex = themeHex(value) ?: "#2563eb"
    val customOk = hasFeature(e, com.munpro.app.domain.FEATURE_CUSTOM_THEME)
    Screen(back = "Tools", tabBar = false, title = "Theme", overline = e?.title,
        navRight = { if (e != null) Pill(if (saving) "…" else "Save", {
            saving = true
            scope.launch {
                runCatching { AppGraph.tools.setTheme(eventId, value); refreshToolsEvent(eventId) }.fold(onSuccess = { goBack() }, onFailure = { alerts.show("Couldn't save", RETRY) })
                saving = false
            }
        }, filled = true, enabled = !saving && value != start && (theme != "custom" || valid)) }) {
        if (e == null) { Spinner(); return@Screen }
        val accent = Color(hexToArgb(hex))
        val ink = if (inkIsDark(hex)) Color(0xFF1B1F2A) else Color.White
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SectionHeader("Preview")
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(accent).padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(e.title, style = Type.title2, color = ink)
                val day = getEventStartMs(e)?.let { java.time.Instant.ofEpochMilli(it).atZone(java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("d MMM yyyy", java.util.Locale.UK)) }
                Text(listOfNotNull(day, e.locationName ?: e.location.ifEmpty { null }).joinToString(" · "), style = Type.footnote, color = ink.copy(alpha = 0.8f))
                Spacer(Modifier.height(4.dp))
                Box(Modifier.clip(CircleShape).background(ink).padding(horizontal = 16.dp, vertical = 8.dp)) { Text("Apply now", style = Type.subhead.copy(fontWeight = FontWeight.SemiBold), color = accent) }
            }
            SectionFooter("Your conference page's header and Apply button, on the website and in the app.")
        }
        Section(header = "Presets") {
            THEME_PRESETS.forEach { p ->
                cell(p.name, leading = { Box(Modifier.size(26.dp).clip(CircleShape).background(Color(hexToArgb(p.hex)))) }, inset = 56.dp,
                    trailing = if (theme == p.id) ({ SfIcon(Icons.check, c.tint, size = 18.dp) }) else null, chevron = false, onClick = { theme = p.id })
            }
        }
        Section(header = "Custom colour", footer = if (customOk) "Any hex value, like #4f46e5." else "A custom colour comes with a Pro event. Upgrade under Event › Plan.") {
            item {
                Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(Modifier.size(26.dp).clip(CircleShape).background(if (valid) Color(hexToArgb(custom)) else c.fillSoft).tap(rememberPress(), label = "Use custom colour") { if (customOk && valid) theme = "custom" })
                    PlainInput(custom, { v -> if (customOk) { custom = ("#" + v.removePrefix("#").filter { it.isLetterOrDigit() }.take(6)); theme = "custom" } }, "#4f46e5",
                        modifier = Modifier.weight(1f), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii))
                    if (!customOk) Chip("Pro", Tone.Warning) else if (theme == "custom") SfIcon(Icons.check, c.tint, size = 18.dp)
                }
            }
        }
    }
}
