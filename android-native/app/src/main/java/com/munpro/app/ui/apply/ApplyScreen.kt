package com.munpro.app.ui.apply

// The application wizard: role, ranked preferences, experience, review (RN app/apply/[id].tsx and
// the mockup's four Apply screens). The payload, validation and side effects are the web wizard's
// (ApplicationWizard.tsx), so an application sent from the phone is identical to one sent from
// the website. The mockup adds: drag to reorder country choices, Edit beside each part on Review,
// "View application" after sending, and an optional AI draft (needs the site's API).

import androidx.compose.foundation.layout.Row
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.data.Api
import com.munpro.app.data.ApplicationRepo
import com.munpro.app.domain.CommitteePreference
import com.munpro.app.domain.EventData
import com.munpro.app.domain.countryName
import com.munpro.app.domain.flagEmoji
import com.munpro.app.domain.formatFee
import com.munpro.app.domain.getCommitteeChoicesAllowed
import com.munpro.app.domain.getEnabledRoleTiers
import com.munpro.app.domain.getRolePrice
import com.munpro.app.domain.getRolePriceInfo
import com.munpro.app.domain.isApplicationOpen
import com.munpro.app.nav.ConferenceRoute
import com.munpro.app.nav.Tabs
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.CheckMark
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Essay
import com.munpro.app.ui.kit.Inter
import com.munpro.app.ui.kit.Loading
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.PickerItem
import com.munpro.app.ui.kit.PickerSheet
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.TextLink
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.kit.rememberHaptics
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import kotlin.math.roundToInt

// Roles whose web forms ask for more than this app collects (institution, team roster).
private val WEB_ONLY_ROLES = setOf("Faculty Advisor", "Team Delegation Lead")
private val STEPS = listOf("Role", "Preferences", "Experience", "Review")
private val RANK = listOf("1st choice", "2nd choice", "3rd choice")

private class Block(committee: String = "", countries: List<String> = listOf("", "", "")) {
    var committee by mutableStateOf(committee)
    val countries = mutableStateListOf<String>().apply { addAll(countries) }
}

private data class Availability(val committees: Map<String, Boolean>, val allFull: Boolean)

private sealed interface Picker {
    data class Committee(val block: Int) : Picker
    data class Country(val block: Int, val rank: Int) : Picker
}

@Composable
fun ApplyScreen(id: String) {
    val c = palette
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()

    var loaded by remember { mutableStateOf(false) }
    var event by remember { mutableStateOf<EventData?>(null) }
    var availability by remember { mutableStateOf<Availability?>(null) }
    var step by remember { mutableIntStateOf(0) }
    var role by remember { mutableStateOf("Delegate") }
    val blocks = remember { mutableStateListOf<Block>() }
    var experience by remember { mutableStateOf("") }
    var motivation by remember { mutableStateOf("") }
    var picker by remember { mutableStateOf<Picker?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var done by remember { mutableStateOf<Pair<Double, String>?>(null) } // fee, application id

    LaunchedEffect(id) {
        val e = AppGraph.events.getEventById(id)
        event = e
        if (e != null) repeat(getCommitteeChoicesAllowed(e)) { blocks += Block() }
        loaded = true
        // Seat availability (server-only: it counts approved seats). Null without the site's API.
        availability = Api.call("/api/events/$id/availability")?.let { j ->
            runCatching {
                val o = j.jsonObject
                Availability(
                    (o["committees"] as? JsonObject).orEmpty().mapValues { (_, v) -> (v as? JsonObject)?.get("full")?.jsonPrimitive?.booleanOrNull == true },
                    o["allFull"]?.jsonPrimitive?.booleanOrNull == true,
                )
            }.getOrNull()
        }
    }

    val e = event
    val roles = remember(e) {
        if (e == null) emptyList() else {
            val tiers = getEnabledRoleTiers(e)
            val list = if (tiers.isNotEmpty()) tiers.map { it.role to (it.label?.ifEmpty { null } ?: it.role) } else listOf("Delegate" to "Delegate", "Observer" to "Observer")
            list.map { (r, label) -> Triple(r, label, getRolePriceInfo(e, r).unitPrice) }
        }
    }
    LaunchedEffect(roles) {
        if (roles.isNotEmpty() && roles.none { it.first == role && it.first !in WEB_ONLY_ROLES }) {
            role = roles.firstOrNull { it.first !in WEB_ONLY_ROLES }?.first ?: "Delegate"
        }
    }

    if (!loaded) return Screen(back = "Back", tabBar = false) { Loading() }
    if (e == null) return Screen(back = "Back", tabBar = false) { Empty("This conference isn't available", "It may have been unpublished.") }
    done?.let { (fee, appId) -> return Submitted(e, fee, appId, blocks.firstOrNull()?.committee, blocks.firstOrNull()?.countries?.firstOrNull()) }

    val alreadyApplied = confs.conferences?.any { it.app.eventId == id } == true
    if (alreadyApplied || !isApplicationOpen(e)) {
        return Screen(title = "Apply", back = e.title, tabBar = false) {
            Empty(
                if (alreadyApplied) "You've already applied" else "Applications are closed",
                if (alreadyApplied) "Each person can apply to a conference once. Your application is on Today." else "The organiser isn't taking applications for this conference any more.",
            )
        }
    }

    fun full(name: String) = availability?.committees?.get(name) == true

    // ---- validation: the web's validateStep, minus the web-only roles ----
    val chosen = blocks.filter { it.committee.isNotEmpty() }
    val valid = when (step) {
        0 -> role.isNotEmpty()
        1 -> availability?.allFull != true && chosen.none { full(it.committee) } &&
            blocks.firstOrNull()?.committee?.isNotEmpty() == true && blocks.firstOrNull()?.countries?.firstOrNull()?.isNotEmpty() == true &&
            chosen.map { it.committee }.toSet().size == chosen.size
        2 -> experience.isNotBlank() && motivation.isNotBlank()
        else -> true
    }
    val fee = getRolePrice(e, role)
    val user = AppGraph.auth.user
    val profile = AppGraph.auth.profile

    fun submit() {
        if (user == null || busy) return
        if (!isApplicationOpen(e)) { error = "Applications closed while you were filling this in."; return }
        busy = true
        error = null
        scope.launch {
            val prefs = blocks.filter { it.committee.isNotEmpty() }.map { CommitteePreference(it.committee, it.countries.filter { c -> c.isNotEmpty() }) }
            val name = profile?.fullName?.ifEmpty { null } ?: user.displayName?.ifEmpty { null } ?: "Delegate"
            val res = AppGraph.applications.submitApplication(
                ApplicationRepo.Submission(
                    eventId = e.id, userId = user.uid, applicantName = name,
                    applicantEmail = AppGraph.auth.contact.value?.email?.ifEmpty { null } ?: user.email.orEmpty(),
                    // The organizer sees the phone on the application; the profile keeps it private.
                    applicantPhone = AppGraph.auth.contact.value?.phoneNumber.orEmpty(),
                    role = role, committeePreferences = prefs, experience = experience, motivation = motivation, fee = fee,
                ),
            )
            busy = false
            when (res) {
                is ApplicationRepo.SubmitResult.Ok -> {
                    AppGraph.applications.logActivity(user.uid, name, role, "application_submitted", "submitted an application for", e.id, e.title, true)
                    AppGraph.conferences.reload()
                    done = fee to res.id
                }
                ApplicationRepo.SubmitResult.AlreadyApplied -> error = "You've already applied to this conference."
                is ApplicationRepo.SubmitResult.Failed -> error = "Your application didn't send. Check your connection and try again."
            }
        }
    }

    val pickerBlock = when (val p = picker) { is Picker.Committee -> blocks.getOrNull(p.block); is Picker.Country -> blocks.getOrNull(p.block); null -> null }
    val committeeObj = pickerBlock?.let { b -> e.committees.firstOrNull { it.name == b.committee } }
    val multi = blocks.size > 1

    // The bar's Back steps back through the wizard; Cancel (step 1) leaves it.
    androidx.compose.runtime.CompositionLocalProvider(com.munpro.app.ui.kit.LocalBack provides { if (step > 0) step-- else nav.back() }) {
    Screen(
        back = if (step > 0) "Back" else "Cancel",
        navTitle = "Apply",
        overline = "Step ${step + 1} of ${STEPS.size}",
        title = if (step == 0) "Apply as" else STEPS[step],
        tabBar = false,
    ) {
        // Progress bar.
        Box(Modifier.fillMaxWidth().height(3.dp).offset(y = (-14).dp).clip(RoundedCornerShape(2.dp)).background(c.fill)) {
            Box(Modifier.fillMaxWidth((step + 1f) / STEPS.size).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(c.tint))
        }

        when (step) {
            0 -> Section(footer = if (roles.any { it.first in WEB_ONLY_ROLES }) "Faculty advisors and team delegation leads apply on the website, where the extra details are collected." else null) {
                roles.forEach { (r, label, price) ->
                    val webOnly = r in WEB_ONLY_ROLES
                    cell(
                        label,
                        subtitle = if (webOnly) "Apply on the website" else if (r == "Observer") "Watch and learn without voting rights" else "Represent a country in committee",
                        value = if (price > 0) formatFee(price) else "Free",
                        onClick = if (webOnly) null else ({ role = r }),
                        chevron = false,
                        dim = webOnly,
                        leading = { Radio(role == r && !webOnly) },
                        inset = 52.dp,
                    )
                }
            }
            1 -> {
                if (availability?.allFull == true) Empty("Every committee is full", "The organiser has filled all seats. Check back in case a seat opens.")
                blocks.forEachIndexed { i, b ->
                    Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
                        val cm = e.committees.firstOrNull { it.name == b.committee }
                        Section(header = if (multi) "Committee choice ${i + 1}${if (i > 0) " (optional)" else ""}" else "Committee") {
                            cell(
                                b.committee.ifEmpty { "Choose a committee" },
                                value = if (cm != null && !full(b.committee)) "${cm.capacity?.takeIf { it > 0 } ?: cm.countries.size} seats" else null,
                                subtitle = if (full(b.committee)) "Full, choose another" else null,
                                destructive = full(b.committee),
                                onClick = { picker = Picker.Committee(i) },
                            )
                        }
                        if (b.committee.isNotEmpty()) {
                            CountryRanks(b, i == 0, onPick = { r -> picker = Picker.Country(i, r) })
                        }
                    }
                }
            }
            2 -> {
                Essay("Previous MUN experience", experience, { experience = it }, "Conferences, committees, countries and any awards.")
                AiDraft("application-experience", experience, e.title) { experience = it }
                Essay(if (multi) "Why these choices" else "Why these countries", motivation, { motivation = it }, "Why this conference, and why these countries.")
                AiDraft("application-motivation", motivation, e.title) { motivation = it }
            }
            else -> {
                Section(header = "Application") {
                    cell("Role", value = role, trailing = { TextLink("Edit", { step = 0 }) })
                    chosen.forEachIndexed { i, b ->
                        cell(if (chosen.size > 1) "Committee ${i + 1}" else "Committee", value = b.committee, trailing = { TextLink("Edit", { step = 1 }) })
                        b.countries.filter { it.isNotEmpty() }.forEachIndexed { r, code ->
                            cell(RANK.getOrElse(r) { "Choice ${r + 1}" }, value = countryName(code))
                        }
                    }
                    cell("Fee", value = if (fee > 0) formatFee(fee) else "Free")
                }
                Section {
                    cell("Experience", subtitle = experience, trailing = { TextLink("Edit", { step = 2 }) })
                    cell("Motivation", subtitle = motivation, trailing = { TextLink("Edit", { step = 2 }) })
                }
            }
        }

        ErrorText(error)
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            if (step < 3) MunButton("Next", { step++ }, enabled = valid)
            else MunButton("Submit Application", ::submit, loading = busy)
            if (step > 0) MunButton("Back", { step-- }, variant = ButtonVariant.Plain)
        }
    }
    }

    // Back in the bar steps back through the wizard before leaving it.
    androidx.activity.compose.BackHandler(enabled = step > 0) { step-- }

    when (val p = picker) {
        is Picker.Committee -> PickerSheet(
            visible = true, title = "Committee", searchable = false,
            items = e.committees.map { cm ->
                PickerItem(
                    cm.name, cm.name,
                    detail = if (full(cm.name)) "Full" else "${cm.capacity?.takeIf { it > 0 } ?: cm.countries.size} seats",
                    disabled = full(cm.name) || blocks.withIndex().any { (j, x) -> j != p.block && x.committee == cm.name },
                )
            },
            onPick = { v -> blocks[p.block].committee = v; blocks[p.block].countries.apply { clear(); addAll(listOf("", "", "")) }; picker = null },
            onDismiss = { picker = null },
        )
        is Picker.Country -> if (pickerBlock != null) PickerSheet(
            visible = true, title = "Choice ${p.rank + 1}",
            items = committeeObj?.countries.orEmpty().map { code ->
                PickerItem(code, countryName(code), flag = code, disabled = pickerBlock.countries.withIndex().any { (r, x) -> r != p.rank && x == code })
            },
            onPick = { v -> pickerBlock.countries[p.rank] = v; picker = null },
            onDismiss = { picker = null },
        )
        null -> Unit
    }
}

/** Ranked country rows: tap to choose, press and hold then drag to reorder. */
@Composable
private fun CountryRanks(b: Block, first: Boolean, onPick: (Int) -> Unit) {
    val c = palette
    val haptics = rememberHaptics()
    var dragging by remember { mutableIntStateOf(-1) }
    var dy by remember { mutableFloatStateOf(0f) }
    val rowPx = with(androidx.compose.ui.platform.LocalDensity.current) { 46.dp.toPx() }
    val filled = b.countries.count { it.isNotEmpty() }
    Section(
        header = "Countries, ranked",
        footer = if (first) "Your first choice is required. The same country can't be ranked twice." + if (filled > 1) " Press and hold a country to drag it." else "" else null,
    ) {
        b.countries.forEachIndexed { r, code ->
            item(inset = 60.dp) {
                Box(
                    Modifier
                        .zIndex(if (dragging == r) 1f else 0f)
                        .graphicsLayer { translationY = if (dragging == r) dy else 0f; shadowElevation = if (dragging == r) 8f else 0f }
                        .background(if (dragging == r) c.cell else androidx.compose.ui.graphics.Color.Transparent)
                        .then(
                            if (code.isEmpty()) Modifier else Modifier.pointerInput(code) {
                                detectDragGesturesAfterLongPress(
                                    onDragStart = { dragging = b.countries.indexOf(code); dy = 0f; haptics.medium() },
                                    onDragEnd = { dragging = -1; dy = 0f },
                                    onDragCancel = { dragging = -1; dy = 0f },
                                ) { change, drag ->
                                    change.consume()
                                    dy += drag.y
                                    // Swap with the neighbour once the row has moved past half of it.
                                    val steps = (dy / rowPx).roundToInt()
                                    if (steps != 0 && dragging >= 0) {
                                        val to = (dragging + steps).coerceIn(0, b.countries.lastIndex)
                                        if (to != dragging && b.countries[to].isNotEmpty()) {
                                            val moved = b.countries.removeAt(dragging)
                                            b.countries.add(to, moved)
                                            dy -= (to - dragging) * rowPx
                                            dragging = to
                                            haptics.selection()
                                        }
                                    }
                                }
                            },
                        ),
                ) {
                    com.munpro.app.ui.kit.Cell(
                        title = if (code.isNotEmpty()) countryName(code) else if (r == 0) "Choose your first choice" else if (r == 2 && filled >= 2) "Add a third choice" else "Add choice ${r + 1}",
                        tinted = code.isEmpty(),
                        leading = {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                RankBadge(r + 1, code.isNotEmpty() || r == 0)
                                if (code.isNotEmpty()) com.munpro.app.ui.kit.Flag(code, 18f)
                            }
                        },
                        onClick = { onPick(r) },
                    )
                }
            }
        }
    }
}

/** The round choice marker on Apply as: a filled tint disc with a check, or an empty ring. */
@Composable
private fun Radio(on: Boolean) {
    val c = palette
    Box(
        Modifier.size(22.dp).clip(CircleShape)
            .background(if (on) c.tint else Color.Transparent)
            .then(if (on) Modifier else Modifier.border(1.5.dp, c.label3, CircleShape)),
        contentAlignment = Alignment.Center,
    ) { if (on) com.munpro.app.ui.kit.SfIcon(com.munpro.app.ui.kit.Icons.check, c.onTint, size = 14.dp) }
}

@Composable
private fun RankBadge(n: Int, filled: Boolean) {
    val c = palette
    Box(Modifier.size(24.dp).clip(CircleShape).background(if (filled) c.tint else c.fill), contentAlignment = Alignment.Center) {
        Text("$n", fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = if (filled) c.onTint else c.label2)
    }
}

/** "Draft with AI" (the web's AiTextareaAssist): only when the site's API is configured. */
@Composable
private fun AiDraft(surface: String, value: String, eventName: String, onResult: (String) -> Unit) {
    if (!Api.available) return
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    Column(Modifier.padding(horizontal = 16.dp).offset(y = (-14).dp)) {
        com.munpro.app.ui.kit.Pill(if (busy) "Drafting…" else if (value.isBlank()) "✦ Draft with AI" else "✦ Improve with AI", {
            if (busy) return@Pill
            busy = true
            failed = false
            scope.launch {
                val res = Api.call(
                    "/api/ai/writing-assist", "POST",
                    buildJsonObject {
                        put("action", if (value.isBlank()) "draft" else "improve")
                        put("surface", surface)
                        put("text", value)
                        com.munpro.app.data.AiScope.eventId?.let { put("eventId", it) }
                        putJsonObject("context") { put("eventName", eventName) }
                    }.toString(),
                )
                val text = runCatching { res?.jsonObject?.get("result")?.jsonPrimitive?.content }.getOrNull()
                if (!text.isNullOrBlank()) onResult(text) else failed = true
                busy = false
            }
        })
        if (failed) Text("The AI draft didn't come back. Try again in a moment.", style = Type.footnote, color = palette.red)
    }
}

@Composable
private fun Submitted(event: EventData, fee: Double, appId: String, committee: String?, firstChoice: String?) {
    val c = palette
    val nav = LocalNav.current
    Screen(tabBar = false) {
        Column(Modifier.fillMaxWidth().padding(top = 90.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.size(76.dp).clip(CircleShape).background(c.tint), contentAlignment = Alignment.Center) {
                com.munpro.app.ui.kit.SfIcon(com.munpro.app.ui.kit.Icons.check, c.onTint, size = 36.dp)
            }
            Text("Application sent", style = Type.title2.copy(fontSize = 26.sp), color = c.label, modifier = Modifier.padding(top = 8.dp))
            Text(
                "${event.title} will review it. You'll get a notification when you're allocated a country.",
                style = Type.body.copy(lineHeight = 23.sp), color = c.label2, textAlign = TextAlign.Center,
            )
            if (fee > 0) {
                Text(
                    "The ${formatFee(fee)} fee is paid on the website, from Payments. Paying in the app comes in a later update.",
                    style = Type.subhead, color = c.label, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 6.dp),
                )
            }
        }
        if (!committee.isNullOrEmpty()) {
            Section {
                cell("Committee", value = committee)
                if (!firstChoice.isNullOrEmpty()) cell("1st choice", value = countryName(firstChoice), trailing = { com.munpro.app.ui.kit.Flag(firstChoice, 16f) })
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            MunButton("Done", { nav.reset(Tabs()) })
            MunButton("View application", { nav.reset(Tabs()); nav.go(ConferenceRoute(appId)) }, variant = ButtonVariant.Plain)
        }
    }
}
