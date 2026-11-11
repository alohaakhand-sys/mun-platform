package com.munpro.app.ui.organizer

// Event setup (board C3; web organizer/events/[id]/committees, details, partners): committees
// (choices per applicant, a template or scratch, the editor with the country roster capped at
// capacity, rename cascade, delete with the seated count), Details (audience, web & social),
// optional modules, marking criteria with live-floor auto-fill, the final-score blend, and
// partners in drag order. Data: SetupRepo.

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import com.munpro.app.AppGraph
import com.munpro.app.data.Api
import com.munpro.app.data.Fresh
import com.munpro.app.data.Partner
import com.munpro.app.data.Refresh
import com.munpro.app.data.prepareImage
import com.munpro.app.data.rememberCached
import com.munpro.app.data.writingAssist
import com.munpro.app.domain.ApplicationData
import com.munpro.app.domain.AUTO_FILL_SOURCES
import com.munpro.app.domain.COMMITTEE_DIFFICULTIES
import com.munpro.app.domain.COMMITTEE_TEMPLATES
import com.munpro.app.domain.COUNTRIES
import com.munpro.app.domain.Committee
import com.munpro.app.domain.DEFAULT_OVERALL_WEIGHT
import com.munpro.app.domain.EventData
import com.munpro.app.domain.MarkingTemplate
import com.munpro.app.domain.OPTIONAL_MODULES
import com.munpro.app.domain.P5_CODES
import com.munpro.app.domain.STARTER_CRITERIA
import com.munpro.app.domain.SocialMedia
import com.munpro.app.domain.autoFillLabel
import com.munpro.app.domain.countryName
import com.munpro.app.domain.getCommitteeAgendas
import com.munpro.app.domain.getCommitteeChoicesAllowed
import com.munpro.app.domain.getCommitteeDifficulties
import com.munpro.app.domain.getEventCapacity
import com.munpro.app.domain.markingMode
import com.munpro.app.domain.rosterCodes
import com.munpro.app.domain.seated
import com.munpro.app.nav.CommitteeEditorRoute
import com.munpro.app.nav.CommitteesRoute
import com.munpro.app.nav.EventEditorRoute
import com.munpro.app.nav.FinalScoringRoute
import com.munpro.app.nav.MarkingSetupRoute
import com.munpro.app.nav.ModulesSetupRoute
import com.munpro.app.ui.kit.LocalBack
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.Chip
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Flag
import com.munpro.app.ui.kit.Hairline
import com.munpro.app.ui.kit.IconTile
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.PlainInput
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.RemoteImage
import com.munpro.app.ui.kit.Ring
import com.munpro.app.ui.kit.RoundButton
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.SearchField
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SectionFooter
import com.munpro.app.ui.kit.SectionHeader
import com.munpro.app.ui.kit.Segmented
import com.munpro.app.ui.kit.SfIcon
import com.munpro.app.ui.kit.SheetHeader
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
import kotlinx.serialization.builtins.ListSerializer
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt

private const val SAVE_FAIL = "Check your connection and try again."

@Composable
private fun rememberSetupEvent(eventId: String) =
    rememberCached("orgEventDoc:$eventId", EventData.serializer(), Fresh.SHORT) { AppGraph.events.getEventById(eventId) ?: error("Event not found") }

@Composable
private fun rememberSetupApps(eventId: String) =
    rememberCached("orgApps:$eventId", ListSerializer(ApplicationData.serializer()), Fresh.SHORT) { AppGraph.allocation.applications(eventId) }

/**
 * After a save: the event's saved copy is replaced with the server's, so the screen we go back to
 * (composed afresh, reading its young saved copy) shows the change, then everything refetches.
 */
private suspend fun refreshEvent(eventId: String) {
    AppGraph.events.getEventById(eventId)?.let { AppGraph.saved.write("orgEventDoc:$eventId", EventData.serializer(), it) }
    Refresh.bump()
}

/** −, the number, +. */
@Composable
private fun CountStepper(value: Int, onChange: (Int) -> Unit, min: Int, max: Int = Int.MAX_VALUE, label: String) {
    val c = palette
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        StepBox("−", "Fewer $label", value > min) { onChange(value - 1) }
        Text("$value", style = Type.headline, color = c.label, textAlign = TextAlign.Center, modifier = Modifier.width(40.dp))
        StepBox("+", "More $label", value < max) { onChange(value + 1) }
    }
}

@Composable
private fun StepBox(text: String, label: String, enabled: Boolean, onClick: () -> Unit) {
    val c = palette
    Box(
        Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(c.fillSoft)
            .tap(rememberPress(), label = label) { if (enabled) onClick() },
        contentAlignment = Alignment.Center,
    ) { Text(text, style = Type.title2.copy(fontWeight = FontWeight.Medium), color = if (enabled) c.label else c.label3) }
}

/** The editor bar: Cancel, title, a filled action. */
@Composable
private fun EditorBar(title: String, action: String, enabled: Boolean, onCancel: () -> Unit, onAction: () -> Unit) {
    val c = palette
    val status = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    Spacer(Modifier.height(status))
    Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = Space.gutter), verticalAlignment = Alignment.CenterVertically) {
        TextLink("Cancel", onCancel)
        Text(title, style = Type.headline, color = c.label, textAlign = TextAlign.Center, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).padding(horizontal = 8.dp))
        Pill(action, onAction, filled = true, enabled = enabled)
    }
    Box(Modifier.fillMaxWidth().height(Hairline).background(c.separator))
}

// ---------------------------------------------------------------------------------------------
// C3.1 · Committees
// ---------------------------------------------------------------------------------------------

@Composable
fun CommitteesScreen(eventId: String) {
    val c = palette
    val nav = LocalNav.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val ev = rememberSetupEvent(eventId)
    val apps = rememberSetupApps(eventId)
    var choosing by remember { mutableStateOf(false) }
    var choices by remember(ev.data) { mutableStateOf(ev.data?.let(::getCommitteeChoicesAllowed) ?: 1) }

    Screen(back = "Event", tabBar = false, title = "Committees", overline = ev.data?.title, savedAt = ev.savedAt, onRefresh = {},
        navRight = { if (ev.data != null) RoundButton(Icons.plus, "New Committee", { choosing = true }) }) {
        val e = ev.data
        if (e == null) { if (ev.failed) Empty("Couldn't load committees", "Pull down to try again.", icon = Icons.gavel) else Spinner(); return@Screen }
        if (e.committees.isEmpty()) {
            Empty("No committees yet", "Pick a UN-standard template like UNSC or UNDP, or build your own from scratch.", icon = Icons.gavel,
                action = { MunButton("Create Committee", { choosing = true }, icon = Icons.plus) })
        } else {
            val max = maxOf(1, e.committees.size)
            Section(header = "Choices per applicant", footer = "How many committees an applicant ranks on the form, each with its own ranked countries. 1 = single committee. Max $max.") {
                item {
                    Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("Ranked committees on the application", style = Type.body, color = c.label, modifier = Modifier.weight(1f))
                        CountStepper(choices, { n ->
                            val prev = choices
                            choices = n
                            scope.launch {
                                runCatching { AppGraph.setup.setChoices(eventId, n); refreshEvent(eventId) }
                                    .onFailure { choices = prev; alerts.show("Couldn't save", SAVE_FAIL) }
                            }
                        }, 1, max, "choices")
                    }
                }
            }
            Section(header = "Committees") {
                e.committees.forEachIndexed { i, cm ->
                    item(inset = 74.dp) { CommitteeRow(cm, apps.data?.let { seated(it, cm.name).size }) { nav.go(CommitteeEditorRoute(eventId, i)) } }
                }
            }
        }
    }
    TemplateSheet(choosing, { choosing = false }) { id -> choosing = false; nav.go(CommitteeEditorRoute(eventId, -1, id)) }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CommitteeRow(cm: Committee, filled: Int?, onClick: () -> Unit) {
    val c = palette
    val cap = cm.capacity ?: 0
    val agendas = getCommitteeAgendas(cm).size
    Row(Modifier.fillMaxWidth().tap(rememberPress(), label = cm.name, onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) {
            Ring(if (cap > 0 && filled != null) (filled.toFloat() / cap).coerceIn(0f, 1f) else 0f, 44.dp)
            Text(if (filled == null) "…" else if (cap > 0) "$filled/$cap" else "$filled", style = Type.caption.copy(fontWeight = FontWeight.Bold), color = c.label)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(cm.name, style = Type.headline, color = c.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(listOfNotNull(
                if (agendas > 0) "$agendas agenda${if (agendas == 1) "" else "s"}" else null,
                "${cm.countries.size} countr${if (cm.countries.size == 1) "y" else "ies"}",
            ).joinToString(" · "), style = Type.footnote, color = c.label2)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                getCommitteeDifficulties(cm).forEach { Chip(it) }
            }
            if (cm.countries.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                cm.countries.take(7).forEach { Flag(it, 14f) }
                if (cm.countries.size > 7) Text("+${cm.countries.size - 7}", style = Type.caption, color = c.label2)
            }
        }
        SfIcon(Icons.chevronRight, c.label3, size = 14.dp)
    }
}

// ---------------------------------------------------------------------------------------------
// C3.2 · Start from a template
// ---------------------------------------------------------------------------------------------

@Composable
private fun TemplateSheet(visible: Boolean, onDismiss: () -> Unit, onContinue: (String) -> Unit) {
    val c = palette
    val navPad = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    var picked by remember(visible) { mutableStateOf<String?>(null) }
    PageSheet(visible, onDismiss) {
        SheetHeader("New Committee", leading = "Cancel", onLeading = onDismiss, trailing = "Continue", onTrailing = { picked?.let(onContinue) }, trailingEnabled = picked != null, divider = true)
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 14.dp, bottom = navPad + 32.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SectionHeader("Start from a template")
            COMMITTEE_TEMPLATES.forEach { t ->
                TemplateCard(t.name, "${t.countries.size} countries · ${t.groups.size} blocs", t.description, t.countries, picked == t.id) { picked = t.id }
            }
            SectionHeader("Or")
            TemplateCard("Build your own", "Start from scratch", "Set the name, capacity, and pick the country roster yourself.", emptyList(), picked == "") { picked = "" }
        }
    }
}

@Composable
private fun TemplateCard(name: String, meta: String, description: String, flags: List<String>, selected: Boolean, onClick: () -> Unit) {
    val c = palette
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell)
            .border(if (selected) 2.dp else Hairline, if (selected) c.tint else c.separator, RoundedCornerShape(Radius.cell))
            .tap(rememberPress(), label = name, onClick = onClick).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(name, style = Type.headline, color = c.label, modifier = Modifier.weight(1f))
            if (selected) SfIcon(Icons.check, c.tint, size = 18.dp)
        }
        Text(meta, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = c.tint)
        Text(description, style = Type.footnote, color = c.label2)
        if (flags.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
            flags.take(12).forEach { Flag(it, 14f) }
            if (flags.size > 12) Text("+${flags.size - 12}", style = Type.caption, color = c.label2)
        }
    }
}

// ---------------------------------------------------------------------------------------------
// C3.3 / C3.4 / C3.5 · Committee editor, roster, delete
// ---------------------------------------------------------------------------------------------

private data class CommitteeForm(
    val name: String = "",
    val capacity: Int = 0,
    val difficulties: List<String> = listOf("Beginner"),
    val agendas: List<String> = emptyList(),
    val description: String = "",
    val countries: List<String> = emptyList(),
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CommitteeEditorScreen(eventId: String, index: Int, template: String) {
    val c = palette
    val goBack = LocalBack.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val ev = rememberSetupEvent(eventId)
    val apps = rememberSetupApps(eventId)
    val editing = index >= 0
    var form by remember { mutableStateOf<CommitteeForm?>(null) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var roster by remember { mutableStateOf(false) }
    var aiBusy by remember { mutableStateOf(false) }

    val e = ev.data
    LaunchedEffect(e != null) {
        if (e == null || form != null) return@LaunchedEffect
        form = if (editing) e.committees.getOrNull(index)?.let { cm ->
            CommitteeForm(cm.name, cm.capacity ?: 0, getCommitteeDifficulties(cm).ifEmpty { listOf("Beginner") }, getCommitteeAgendas(cm), cm.description.orEmpty(), rosterCodes(cm))
        } else COMMITTEE_TEMPLATES.firstOrNull { it.id == template }?.let { t ->
            val cap = t.recommendedCapacity ?: t.countries.size
            CommitteeForm(t.name, cap, listOf("Beginner"), emptyList(), t.description, t.countries.take(cap))
        } ?: CommitteeForm()
    }
    val f = form
    fun set(fn: (CommitteeForm) -> CommitteeForm) { form = form?.let(fn); error = null }
    // A newly added agenda line takes the keyboard.
    var focusAgenda by remember { mutableStateOf(-1) }
    val agendaFocus = remember { androidx.compose.ui.focus.FocusRequester() }
    LaunchedEffect(focusAgenda) { if (focusAgenda >= 0) runCatching { agendaFocus.requestFocus() } }
    val original = if (editing) e?.committees?.getOrNull(index) else null

    fun save() {
        val ff = form ?: return
        val ev0 = e ?: return
        val name = ff.name.trim()
        if (name.isEmpty()) { error = "Give the committee a name."; return }
        if (ev0.committees.withIndex().any { (i, cm) -> i != index && cm.name.trim().equals(name, true) }) { error = "Another committee already has this name."; return }
        val difficulties = COMMITTEE_DIFFICULTIES.filter { it in ff.difficulties }.ifEmpty { listOf("Beginner") }
        val agendas = ff.agendas.map { it.trim() }.filter { it.isNotEmpty() }
        val built = Committee(
            name = name, capacity = ff.capacity,
            countries = ff.countries.filter { it.isNotEmpty() }.let { if (ff.capacity > 0) it.take(ff.capacity) else it },
            chairs = original?.chairs.orEmpty(),
            difficulty = difficulties.first(), difficulties = difficulties,
            description = ff.description.trim().ifEmpty { null },
            topic = agendas.firstOrNull(), agendas = agendas,
        )
        val list = ev0.committees.toMutableList().also { if (editing) it[index] = built else it.add(built) }
        saving = true; error = null
        scope.launch {
            // The event's plan caps its committees (Plan.kt; the rules hold it too).
            val settings = AppGraph.saved.read("planSettings", com.munpro.app.domain.PlanSettings.serializer())
            val cap = com.munpro.app.domain.resolvePlan(ev0, settings).committees
            if (!editing && cap != null && list.size > cap) {
                error = "This event's plan allows $cap committees. Make it Pro, or ask for more room, under Event › Plan."
                saving = false
                return@launch
            }
            runCatching {
                AppGraph.setup.saveCommittees(eventId, list)
                // A rename follows the name into every doc keyed by it.
                if (original != null && original.name != built.name) AppGraph.setup.renameCommittee(eventId, original.name, built.name)
                refreshEvent(eventId)
            }.fold(onSuccess = { goBack() }, onFailure = { error = "Couldn't save the committee. $SAVE_FAIL" })
            saving = false
        }
    }

    fun delete() = scope.launch {
        val ev0 = e ?: return@launch
        val cm = original ?: return@launch
        val n = apps.data?.let { seated(it, cm.name).size } ?: 0
        val msg = (if (n > 0) "$n delegate${if (n == 1) " is" else "s are"} seated in it and will need a new seat. " else "") + "This can't be undone."
        if (!alerts.confirm("Delete ${cm.name}?", msg, "Delete", destructive = true)) return@launch
        saving = true
        runCatching { AppGraph.setup.saveCommittees(eventId, ev0.committees.filterIndexed { i, _ -> i != index }); refreshEvent(eventId) }
            .fold(onSuccess = { goBack() }, onFailure = { alerts.show("Couldn't delete", SAVE_FAIL) })
        saving = false
    }

    Column(Modifier.fillMaxSize().background(c.bg)) {
        EditorBar(f?.name?.ifBlank { null } ?: if (editing) "Committee" else "New Committee", if (saving) "…" else "Save", f != null && f.name.isNotBlank() && !saving, goBack, ::save)
        if (f == null) { if (ev.failed || (e != null && editing && original == null)) ErrorText("Couldn't open this committee.", Modifier.padding(Space.gutter)) else Spinner(); return@Column }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 14.dp, bottom = navBottom + 32.dp),
            verticalArrangement = Arrangement.spacedBy(Space.section)) {
            Section(header = "Name") {
                item {
                    PlainInput(f.name, { v -> set { it.copy(name = v) } }, "e.g., UNSC, DISEC, WHO", maxLength = 80, modifier = Modifier.fillMaxWidth().padding(16.dp),
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words))
                }
            }
            Section(header = "Capacity", footer = "The most delegates it seats. Lowering it trims the roster to match.") {
                item {
                    Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("Delegates", style = Type.body, color = c.label, modifier = Modifier.weight(1f))
                        PlainInput(if (f.capacity == 0) "" else "${f.capacity}", { v ->
                            val n = v.filter(Char::isDigit).take(4).toIntOrNull() ?: 0
                            set { it.copy(capacity = n, countries = if (n > 0) it.countries.take(n) else it.countries) }
                        }, "0", modifier = Modifier.width(56.dp), style = Type.headline.copy(textAlign = TextAlign.End),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                        Spacer(Modifier.width(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            StepBox("−", "Fewer seats", f.capacity > 1) { set { it.copy(capacity = it.capacity - 1, countries = it.countries.take(it.capacity - 1)) } }
                            StepBox("+", "More seats", true) { set { it.copy(capacity = it.capacity + 1) } }
                        }
                    }
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionHeader("Difficulty")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    COMMITTEE_DIFFICULTIES.forEach { d ->
                        val on = d in f.difficulties
                        Box(
                            Modifier.weight(1f).height(38.dp).clip(RoundedCornerShape(12.dp)).background(if (on) c.tintSoft else c.cell)
                                .border(Hairline, if (on) c.tint else c.separator, RoundedCornerShape(12.dp))
                                .tap(rememberPress(), label = d) { set { it.copy(difficulties = if (on) it.difficulties - d else it.difficulties + d) } },
                            contentAlignment = Alignment.Center,
                        ) { Text(d, style = Type.subhead.copy(fontWeight = FontWeight.SemiBold), color = if (on) c.tint else c.label2) }
                    }
                }
                SectionFooter("Pick one or more.")
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.weight(1f)) { SectionHeader("Agendas") }
                    TextLink("+ Add", { focusAgenda = f.agendas.size; set { it.copy(agendas = it.agendas + "") } }, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold))
                }
                if (f.agendas.isNotEmpty()) Section {
                    f.agendas.forEachIndexed { i, a ->
                        item {
                            Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Text("${i + 1}", style = Type.headline, color = c.tint)
                                PlainInput(a, { v -> set { it.copy(agendas = it.agendas.toMutableList().also { l -> l[i] = v }) } }, "Agenda ${i + 1}", singleLine = false,
                                    maxLength = 200, modifier = Modifier.weight(1f).then(if (i == focusAgenda) Modifier.focusRequester(agendaFocus) else Modifier), keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
                                Box(Modifier.size(28.dp).tap(rememberPress(), label = "Remove agenda ${i + 1}") { set { it.copy(agendas = it.agendas.filterIndexed { j, _ -> j != i }) } },
                                    contentAlignment = Alignment.Center) { SfIcon(Icons.close, c.label3, size = 14.dp) }
                            }
                        }
                    }
                } else SectionFooter("No agenda yet. Delegates see these on the committee page.")
            }
            Section(header = "Delegation roster") {
                cell("Countries", value = if (f.capacity > 0) "${f.countries.size} of ${f.capacity}" else "${f.countries.size}", onClick = { roster = true })
                if (f.countries.isNotEmpty()) item {
                    FlowRow(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(5.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        f.countries.forEach { Flag(it, 18f) }
                    }
                }
            }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                PlainInput(f.description, { v -> set { it.copy(description = v) } }, "Short summary of the committee's mandate and agenda…", singleLine = false, minLines = 3,
                    maxLength = 2000, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
                if (Api.available) TextLink(if (aiBusy) "Writing…" else if (f.description.isBlank()) "Suggest with AI" else "Improve", {
                    if (aiBusy) return@TextLink
                    aiBusy = true
                    scope.launch {
                        writingAssist(if (f.description.isBlank()) "suggest" else "improve", "committee-description", f.description, mapOf("committee" to f.name))
                            ?.let { out -> set { it.copy(description = out.take(2000)) } }
                            ?: alerts.show("AI couldn't help this time", "Try again in a moment.")
                        aiBusy = false
                    }
                }, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold))
            }
            ErrorText(error)
            if (editing) Section { cell("Delete Committee", destructive = true, chevron = false, onClick = { delete() }) }
        }
    }
    if (f != null) RosterSheet(roster, { roster = false }, f.countries, f.capacity) { list -> roster = false; set { it.copy(countries = list) } }
}

@Composable
private fun RosterSheet(visible: Boolean, onDismiss: () -> Unit, initial: List<String>, capacity: Int, onDone: (List<String>) -> Unit) {
    val c = palette
    val navPad = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val picked = remember(visible) { mutableStateListOf<String>().also { it.addAll(initial) } }
    var q by remember(visible) { mutableStateOf("") }
    val full = capacity > 0 && picked.size >= capacity
    // Entries that aren't a known country (typed on an old event) stay at the top so they aren't lost.
    val known = remember { COUNTRIES.map { it.code.lowercase() }.toSet() }
    val custom = initial.filter { it !in known }
    PageSheet(visible, onDismiss) {
        SheetHeader("Roster", subtitle = if (capacity > 0) "${picked.size} of $capacity selected" else "${picked.size} selected",
            leading = "Back", onLeading = onDismiss, trailing = "Done", onTrailing = { onDone(picked.toList()) }, divider = true)
        Column(Modifier.padding(horizontal = Space.gutter, vertical = 10.dp)) { SearchField(q, { q = it }, placeholder = "Search countries") }
        val rows = custom.map { it to it } + COUNTRIES.sortedBy { it.name }.map { it.code.lowercase() to it.name }
        val shown = rows.filter { q.isBlank() || it.second.contains(q.trim(), true) }
        LazyColumn(Modifier.fillMaxWidth().weight(1f).padding(horizontal = Space.gutter), contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = navPad + 24.dp)) {
            items(shown, key = { it.first }) { (code, name) ->
                val on = code in picked
                val blocked = !on && full
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.cell)
                        .tap(rememberPress(), label = name) { if (on) picked.remove(code) else if (!blocked) picked.add(code) }
                        .padding(horizontal = 14.dp, vertical = 11.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Flag(code, 20f)
                    Text(name, style = Type.body, color = if (blocked) c.label3 else c.label, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (code in P5_CODES) Chip("P5", Tone.Tint)
                    Box(Modifier.size(22.dp).clip(CircleShape).background(if (on) c.tint else c.fillSoft), contentAlignment = Alignment.Center) {
                        if (on) SfIcon(Icons.check, c.onTint, size = 13.dp)
                    }
                }
                Spacer(Modifier.height(6.dp))
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// C3.6 · Details
// ---------------------------------------------------------------------------------------------

@Composable
fun EventDetailsScreen(eventId: String) {
    val c = palette
    val nav = LocalNav.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val ev = rememberSetupEvent(eventId)
    val e = ev.data
    var audience by remember(e?.id) { mutableStateOf(e?.targetAudience.orEmpty()) }
    var website by remember(e?.id) { mutableStateOf(e?.website.orEmpty()) }
    var email by remember(e?.id) { mutableStateOf(e?.contactEmail.orEmpty()) }
    var ig by remember(e?.id) { mutableStateOf(e?.socialMedia?.instagram.orEmpty()) }
    var tw by remember(e?.id) { mutableStateOf(e?.socialMedia?.twitter.orEmpty()) }
    var fb by remember(e?.id) { mutableStateOf(e?.socialMedia?.facebook.orEmpty()) }
    var li by remember(e?.id) { mutableStateOf(e?.socialMedia?.linkedin.orEmpty()) }
    var saving by remember { mutableStateOf(false) }
    val dirty = e != null && (audience != e.targetAudience.orEmpty() || website != e.website.orEmpty() || email != e.contactEmail.orEmpty() ||
        ig != e.socialMedia?.instagram.orEmpty() || tw != e.socialMedia?.twitter.orEmpty() || fb != e.socialMedia?.facebook.orEmpty() || li != e.socialMedia?.linkedin.orEmpty())

    fun save() {
        val ev0 = e ?: return
        saving = true
        scope.launch {
            runCatching { AppGraph.setup.saveDetails(eventId, getEventCapacity(ev0), audience, website, email, SocialMedia(ig, tw, fb, li)); refreshEvent(eventId) }
                .fold(onSuccess = { alerts.show("Details saved", null) }, onFailure = { alerts.show("Couldn't save the details", SAVE_FAIL) })
            saving = false
        }
    }

    Screen(back = "Event", tabBar = false, title = "Details", overline = e?.title, savedAt = ev.savedAt,
        navRight = { if (e != null) Pill(if (saving) "…" else "Save", ::save, filled = true, enabled = dirty && !saving) }) {
        if (e == null) { if (ev.failed) Empty("Couldn't load the details", "Pull down to try again.", icon = Icons.doc) else Spinner(); return@Screen }
        Section(header = "Basics") {
            cell("Name, dates, place, cover, description", value = "Edit", leading = { IconTile(SystemColors.blue, Icons.pen) }, inset = 58.dp, onClick = { nav.go(EventEditorRoute(eventId)) })
        }
        Section(header = "Delegates", footer = "The sum of committee seats; it updates when you change a committee.") {
            cell("Expected", value = "${getEventCapacity(e)}", chevron = false)
        }
        Section(header = "Audience", footer = "Who should apply for this event.") {
            item { DetailInput(audience, { audience = it }, "e.g., University and school students", KeyboardCapitalization.Sentences) }
        }
        Section(header = "Web & social") {
            item { LabeledInput("Website", website, { website = it }, "https://yourevent.com", KeyboardType.Uri) }
            item { LabeledInput("Email", email, { email = it }, "organizers@yourevent.com", KeyboardType.Email) }
            item { LabeledInput("Instagram", ig, { ig = it.removePrefix("@") }, "@handle", KeyboardType.Text) }
            item { LabeledInput("Twitter / X", tw, { tw = it.removePrefix("@") }, "@handle", KeyboardType.Text) }
            item { LabeledInput("Facebook", fb, { fb = it }, "facebook.com/yourpage", KeyboardType.Uri) }
            item { LabeledInput("LinkedIn", li, { li = it }, "linkedin.com/company/…", KeyboardType.Uri) }
        }
        val on = e.optionalModules.map { if (it == "live_mun") "livemun" else it }.count { k -> OPTIONAL_MODULES.any { it.key == k } }
        val mode = if (markingMode(e) == "binary") "Binary" else "Decimal"
        Section(header = "Setup") {
            cell("Optional modules", value = if (on == 0) "Off" else "$on on", leading = { IconTile(SystemColors.orange, Icons.folder) }, inset = 58.dp, onClick = { nav.go(ModulesSetupRoute(eventId)) })
            cell("Marking", value = "${e.markingTemplates.size} · $mode", leading = { IconTile(SystemColors.green, Icons.check) }, inset = 58.dp, onClick = { nav.go(MarkingSetupRoute(eventId)) })
            cell("Committees", value = "${e.committees.size}", leading = { IconTile(SystemColors.teal, Icons.gavel) }, inset = 58.dp, onClick = { nav.go(CommitteesRoute(eventId)) })
        }
    }
}

@Composable
private fun DetailInput(value: String, onChange: (String) -> Unit, placeholder: String, caps: KeyboardCapitalization) {
    PlainInput(value, onChange, placeholder, maxLength = 200, modifier = Modifier.fillMaxWidth().padding(16.dp), keyboardOptions = KeyboardOptions(capitalization = caps))
}

@Composable
private fun LabeledInput(label: String, value: String, onChange: (String) -> Unit, placeholder: String, type: KeyboardType) {
    val c = palette
    Row(Modifier.padding(horizontal = 16.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = Type.body, color = c.label, modifier = Modifier.width(110.dp))
        PlainInput(value, onChange, placeholder, maxLength = 300, modifier = Modifier.weight(1f), keyboardOptions = KeyboardOptions(keyboardType = type))
    }
}

// ---------------------------------------------------------------------------------------------
// C3.7 · Optional modules
// ---------------------------------------------------------------------------------------------

@Composable
fun ModulesSetupScreen(eventId: String) {
    val c = palette
    val goBack = LocalBack.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val ev = rememberSetupEvent(eventId)
    val e = ev.data
    val start = remember(e?.id) { e?.optionalModules.orEmpty().map { if (it == "live_mun") "livemun" else it }.distinct() }
    var modules by remember(e?.id) { mutableStateOf(start) }
    var saving by remember { mutableStateOf(false) }
    fun save() {
        saving = true
        scope.launch {
            runCatching { AppGraph.setup.saveModules(eventId, modules); refreshEvent(eventId) }
                .fold(onSuccess = { goBack() }, onFailure = { alerts.show("Couldn't save the modules", SAVE_FAIL) })
            saving = false
        }
    }
    Screen(back = "Details", tabBar = false, title = "Optional modules", savedAt = ev.savedAt,
        navRight = { if (e != null) Pill(if (saving) "…" else "Save", ::save, filled = true, enabled = modules.toSet() != start.toSet() && !saving) }) {
        if (e == null) { if (ev.failed) Empty("Couldn't load the modules", "Pull down to try again.", icon = Icons.folder) else Spinner(); return@Screen }
        val tiles = mapOf("food" to (SystemColors.orange to Icons.star), "transport" to (SystemColors.blue to Icons.pin),
            "accommodation" to (SystemColors.purple to Icons.home), "dresscode" to (SystemColors.green to Icons.people))
        Section(footer = "Turning one on adds its tab to every delegate portal. Set each one up under Modules in the event menu.") {
            OPTIONAL_MODULES.forEach { m ->
                val on = m.key in modules
                val (color, icon) = tiles.getValue(m.key)
                item(inset = 58.dp) {
                    Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        IconTile(color, icon)
                        Column(Modifier.weight(1f)) {
                            Text(m.label, style = Type.body, color = c.label)
                            Text(m.description, style = Type.footnote, color = c.label2)
                        }
                        Toggle(on, { v -> modules = if (v) (modules + m.key).distinct() else modules - m.key }, m.label)
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// C3.8 / C3.9 · Marking templates, criterion
// ---------------------------------------------------------------------------------------------

private fun newCriterionId() = java.util.UUID.randomUUID().toString()

@Composable
fun MarkingSetupScreen(eventId: String) {
    val c = palette
    val nav = LocalNav.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val ev = rememberSetupEvent(eventId)
    val e = ev.data
    var mode by remember(e?.id) { mutableStateOf(markingMode(e)) }
    var criteria by remember(e?.id) { mutableStateOf(e?.markingTemplates.orEmpty()) }
    var editing by remember { mutableStateOf<Int?>(null) }
    var saving by remember { mutableStateOf(false) }
    val dirty = e != null && (mode != markingMode(e) || criteria != e.markingTemplates)

    fun save() {
        saving = true
        scope.launch {
            runCatching { AppGraph.setup.saveMarking(eventId, criteria, mode); refreshEvent(eventId) }
                .fold(onSuccess = { alerts.show("Marking saved", null) }, onFailure = { alerts.show("Couldn't save marking", SAVE_FAIL) })
            saving = false
        }
    }

    Screen(back = "Details", tabBar = false, title = "Marking", overline = e?.title, savedAt = ev.savedAt,
        navRight = { if (e != null) Pill(if (saving) "…" else "Save", ::save, filled = true, enabled = dirty && !saving) }) {
        if (e == null) { if (ev.failed) Empty("Couldn't load marking", "Pull down to try again.", icon = Icons.check) else Spinner(); return@Screen }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SectionHeader("Pattern")
            Segmented(listOf("decimal" to "Decimal −100…+100", "binary" to "Binary −1/0/+1"), mode, { mode = it })
            SectionFooter(if (mode == "binary") "Chairs score each criterion −1 / 0 / +1 (fast, tally-style), normalised to 0–100% (0 = 50%)."
                else "Chairs score each criterion on −100…+100; negatives penalise invalid points, out-of-order motions or disruption.")
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { SectionHeader("Criteria · ${criteria.size}") }
                TextLink("+ Add", { editing = -1 }, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold))
            }
            if (criteria.isEmpty()) {
                Empty("No criteria yet", "Chairs can't score anyone until there's at least one.", icon = Icons.check,
                    action = { MunButton("Add Starter Set", { criteria = STARTER_CRITERIA.map { MarkingTemplate(newCriterionId(), it, 100.0) } }, variant = ButtonVariant.Tinted) })
            } else Section(footer = "Each becomes a column in the chair's marking. The daily % is the average of the criteria a chair actually scores that day. Auto-fill suggests a mark from the live floor; chairs still review it.") {
                criteria.forEachIndexed { i, t ->
                    cell(t.name.ifBlank { "Untitled" },
                        subtitle = if (t.autoFillFrom == null) "Manual only" else "Auto: ${autoFillLabel(t.autoFillFrom).replaceFirstChar { it.lowercase() }}",
                        value = if (t.autoFillFrom != null) "Cap ${t.autoFillCap?.roundToInt() ?: 100}" else null,
                        onClick = { editing = i })
                }
            }
        }
        Section(header = "Final score") {
            val w = e.scoringConfig?.overallWeight ?: DEFAULT_OVERALL_WEIGHT
            cell("Final score blend", value = "${(w * 100).roundToInt()}% chair", onClick = { nav.go(FinalScoringRoute(eventId)) })
        }
        if (dirty) SectionFooter("Unsaved changes: tap Save.")
    }

    val idx = editing
    if (idx != null) CriterionSheet(criteria.getOrNull(idx), mode, { editing = null },
        onDelete = if (idx >= 0) ({ criteria = criteria.filterIndexed { j, _ -> j != idx }; editing = null }) else null) { t ->
        criteria = if (idx >= 0) criteria.toMutableList().also { it[idx] = t } else criteria + t
        editing = null
    }
}

@Composable
private fun CriterionSheet(initial: MarkingTemplate?, mode: String, onDismiss: () -> Unit, onDelete: (() -> Unit)?, onSave: (MarkingTemplate) -> Unit) {
    val c = palette
    val navPad = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    var name by remember { mutableStateOf(initial?.name.orEmpty()) }
    var source by remember { mutableStateOf(initial?.autoFillFrom) }
    var cap by remember { mutableStateOf(initial?.autoFillCap?.roundToInt()?.toString().orEmpty()) }
    PageSheet(true, onDismiss) {
        SheetHeader("Criterion", leading = "Cancel", onLeading = onDismiss, trailing = "Save", trailingEnabled = name.isNotBlank(), divider = true, onTrailing = {
            onSave(MarkingTemplate(initial?.id ?: newCriterionId(), name.trim(), 100.0, source, if (source != null) cap.toIntOrNull()?.takeIf { it > 0 }?.toDouble() else null))
        })
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 14.dp, bottom = navPad + 32.dp),
            verticalArrangement = Arrangement.spacedBy(Space.section)) {
            Section(header = "Name") {
                item { PlainInput(name, { name = it }, "e.g. Debate", maxLength = 60, modifier = Modifier.fillMaxWidth().padding(16.dp), keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words)) }
                cell("Range", value = if (mode == "binary") "−1 / 0 / +1" else "−100 to +100", chevron = false)
            }
            Section(header = "Auto-fill from") {
                AUTO_FILL_SOURCES.forEach { (key, label) ->
                    cell(label, trailing = if (source == key) ({ SfIcon(Icons.check, c.tint, size = 18.dp) }) else null, chevron = false, onClick = { source = key })
                }
            }
            if (source != null) Section(header = "Cap", footer = "The suggested mark is the count itself, up to this cap: counts above it score the same. Blank = 100.") {
                item {
                    Row(Modifier.padding(horizontal = 16.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("Cap", style = Type.body, color = c.label, modifier = Modifier.weight(1f))
                        PlainInput(cap, { v -> cap = v.filter(Char::isDigit).take(3) }, "100", modifier = Modifier.width(80.dp),
                            style = Type.headline.copy(textAlign = TextAlign.End), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                    }
                }
            }
            if (onDelete != null) Section { cell("Delete Criterion", destructive = true, chevron = false, onClick = onDelete) }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// C3.10 · Final score blend
// ---------------------------------------------------------------------------------------------

private val DAY_LABEL = DateTimeFormatter.ofPattern("EEE d MMM yyyy")

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun FinalScoringScreen(eventId: String) {
    val c = palette
    val goBack = LocalBack.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val ev = rememberSetupEvent(eventId)
    val e = ev.data
    val startWeight = e?.scoringConfig?.overallWeight ?: DEFAULT_OVERALL_WEIGHT
    var weight by remember(e?.id) { mutableFloatStateOf(startWeight.toFloat()) }
    var days by remember(e?.id) { mutableStateOf(e?.scoringConfig?.markingDays.orEmpty().filter { runCatching { LocalDate.parse(it) }.isSuccess }.sorted()) }
    var adding by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    val pct = (weight * 20).roundToInt() * 5
    val dirty = e != null && (pct != (startWeight * 100).roundToInt() || days != e.scoringConfig?.markingDays.orEmpty().sorted())

    fun save() {
        saving = true
        scope.launch {
            runCatching { AppGraph.setup.saveScoring(eventId, pct / 100.0, days); refreshEvent(eventId) }
                .fold(onSuccess = { goBack() }, onFailure = { alerts.show("Couldn't save final scoring", SAVE_FAIL) })
            saving = false
        }
    }

    Screen(back = "Marking", tabBar = false, title = "Final scoring", savedAt = ev.savedAt,
        navRight = { if (e != null) Pill(if (saving) "…" else "Save", ::save, filled = true, enabled = dirty && !saving) }) {
        if (e == null) { if (ev.failed) Empty("Couldn't load final scoring", "Pull down to try again.", icon = Icons.check) else Spinner(); return@Screen }
        Section(header = "Chair overall weight",
            footer = "The final score is a consistency-first average of a delegate's daily % across every conference day (a missed day counts as 0%). On the final day a chair can add a holistic overall mark that blends in by this weight.") {
            item {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Weight", style = Type.body, color = c.label, modifier = Modifier.weight(1f))
                        Text("$pct%", style = Type.headline, color = c.tint)
                    }
                    androidx.compose.material3.Slider(weight, { weight = it }, valueRange = 0f..1f, steps = 19,
                        colors = androidx.compose.material3.SliderDefaults.colors(thumbColor = c.tint, activeTrackColor = c.tint, inactiveTrackColor = c.fillSoft,
                            activeTickColor = c.onTint.copy(alpha = 0.4f), inactiveTickColor = c.label3.copy(alpha = 0.4f)))
                    Text("final = ${100 - pct}% computed + $pct% chair overall", style = Type.footnote, color = c.label2)
                }
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { SectionHeader("Conference days") }
                TextLink("+ Add day", { adding = true }, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold))
            }
            if (days.isNotEmpty()) Section {
                days.forEach { d ->
                    cell(LocalDate.parse(d).format(DAY_LABEL), trailing = {
                        Box(Modifier.size(28.dp).tap(rememberPress(), label = "Remove $d") { days = days - d }, contentAlignment = Alignment.Center) { SfIcon(Icons.close, c.label3, size = 14.dp) }
                    }, chevron = false)
                }
            }
            SectionFooter(if (days.isEmpty()) "None set: the days are taken from the dates chairs marked. Add the conference days so a day someone missed counts as 0%."
                else "Only these days count toward the final; a day someone missed counts as 0%. Remove them all to go back to the marked dates.")
        }
    }

    if (adding) {
        val utc = ZoneOffset.UTC
        val initial = days.lastOrNull()?.let { LocalDate.parse(it).plusDays(1) } ?: runCatching { LocalDate.parse(e?.startDate.orEmpty()) }.getOrDefault(LocalDate.now())
        val state = androidx.compose.material3.rememberDatePickerState(initialSelectedDateMillis = initial.atStartOfDay(utc).toInstant().toEpochMilli())
        val colors = androidx.compose.material3.DatePickerDefaults.colors(
            containerColor = c.cell, selectedDayContainerColor = c.tint, selectedDayContentColor = c.onTint,
            todayDateBorderColor = c.tint, todayContentColor = c.tint, selectedYearContainerColor = c.tint, selectedYearContentColor = c.onTint,
        )
        androidx.compose.material3.DatePickerDialog(
            onDismissRequest = { adding = false },
            confirmButton = {
                androidx.compose.material3.TextButton({
                    state.selectedDateMillis?.let { ms -> val d = Instant.ofEpochMilli(ms).atZone(utc).toLocalDate().toString(); days = (days + d).distinct().sorted() }
                    adding = false
                }) { Text("Add", color = c.tint, style = Type.headline) }
            },
            dismissButton = { androidx.compose.material3.TextButton({ adding = false }) { Text("Cancel", color = c.tint, style = Type.body) } },
            colors = colors,
        ) { androidx.compose.material3.DatePicker(state, colors = colors, showModeToggle = true) }
    }
}

// ---------------------------------------------------------------------------------------------
// C3.11 / C3.12 · Partners
// ---------------------------------------------------------------------------------------------

@Composable
fun PartnersScreen(eventId: String) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val data = rememberCached("orgPartners:$eventId", ListSerializer(Partner.serializer()), Fresh.SHORT) { AppGraph.setup.partners(eventId) }
    val list = remember { mutableStateListOf<Partner>() }
    LaunchedEffect(data.data) { data.data?.let { list.clear(); list.addAll(it) } }
    var editing by remember { mutableStateOf<Partner?>(null) }
    var dragging by remember { mutableStateOf<String?>(null) }
    var offset by remember { mutableFloatStateOf(0f) }
    val heights = remember { mutableStateMapOf<String, Int>() }

    suspend fun reload() {
        val fresh = AppGraph.setup.partners(eventId)
        AppGraph.saved.write("orgPartners:$eventId", ListSerializer(Partner.serializer()), fresh)
        list.clear(); list.addAll(fresh)
    }

    Screen(back = "Event", tabBar = false, title = "Partners", savedAt = data.savedAt, onRefresh = {},
        navRight = { RoundButton(Icons.plus, "Add Partner", { editing = Partner() }) }) {
        if (data.data == null) { if (data.failed) Empty("Couldn't load partners", "Pull down to try again.", icon = Icons.star) else Spinner(); return@Screen }
        if (list.isEmpty()) {
            Empty("No partners yet", "Showcase your sponsors, university partners and affiliated organizations.", icon = Icons.star,
                action = { MunButton("Add Partner", { editing = Partner() }, icon = Icons.plus) })
            return@Screen
        }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell)) {
            list.forEachIndexed { i, p -> key(p.id) {
                val lifted = dragging == p.id
                Column(Modifier.zIndex(if (lifted) 1f else 0f).graphicsLayer { translationY = if (lifted) offset else 0f }
                    .onSizeChanged { heights[p.id] = it.height }.background(c.cell)) {
                    if (i > 0 && !lifted) Box(Modifier.padding(start = 76.dp).fillMaxWidth().height(Hairline).background(c.separator))
                    Row(Modifier.fillMaxWidth().tap(rememberPress(), label = p.name) { editing = p }.padding(start = 16.dp, top = 10.dp, bottom = 10.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        PartnerLogo(p, 46.dp)
                        Column(Modifier.weight(1f)) {
                            Text(p.name, style = Type.headline, color = c.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            val sub = listOfNotNull(p.description.lineSequence().firstOrNull()?.trim()?.ifEmpty { null }, hostOf(p.websiteUrl)).joinToString(" · ")
                            if (sub.isNotEmpty()) Text(sub, style = Type.footnote, color = c.label2, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        // The handle: drag up or down to reorder.
                        Box(Modifier.size(48.dp).pointerInput(p.id) {
                            detectVerticalDragGestures(
                                onDragStart = { dragging = p.id; offset = 0f },
                                onDragEnd = {
                                    dragging = null; offset = 0f
                                    val ids = list.map { it.id }
                                    if (ids != data.data?.map { it.id }) scope.launch {
                                        runCatching { AppGraph.setup.reorderPartners(eventId, ids); reload() }
                                            .onFailure { alerts.show("Couldn't save the order", SAVE_FAIL); data.data?.let { list.clear(); list.addAll(it) } }
                                    }
                                },
                                onDragCancel = { dragging = null; offset = 0f },
                            ) { change, dy ->
                                change.consume()
                                offset += dy
                                val at = list.indexOfFirst { it.id == p.id }
                                val next = list.getOrNull(at + 1)
                                val prev = list.getOrNull(at - 1)
                                if (next != null && offset > (heights[next.id] ?: 0) / 2f) {
                                    offset -= heights[next.id] ?: 0
                                    list.removeAt(at); list.add(at + 1, p)
                                } else if (prev != null && offset < -(heights[prev.id] ?: 0) / 2f) {
                                    offset += heights[prev.id] ?: 0
                                    list.removeAt(at); list.add(at - 1, p)
                                }
                            }
                        }, contentAlignment = Alignment.Center) { SfIcon(Icons.list, c.label3, size = 18.dp) }
                    }
                }
            } }
        }
        SectionFooter("Shown in this order on the public event page. Drag the handle to reorder.")
    }

    editing?.let { p ->
        PartnerSheet(p, { editing = null },
            onDelete = if (p.id.isEmpty()) null else ({
                scope.launch {
                    if (!alerts.confirm("Remove ${p.name}?", "They're taken off the public event page.", "Remove", destructive = true)) return@launch
                    runCatching { AppGraph.setup.deletePartner(eventId, p.id); reload() }
                        .fold(onSuccess = { editing = null }, onFailure = { alerts.show("Couldn't remove the partner", SAVE_FAIL) })
                }
            })) { out ->
            runCatching {
                if (out.id.isEmpty()) AppGraph.setup.addPartner(eventId, out, list.size) else AppGraph.setup.updatePartner(eventId, out)
                reload()
            }.isSuccess.also { if (it) editing = null }
        }
    }
}

private fun hostOf(url: String): String? = url.trim().ifEmpty { null }?.let {
    runCatching { java.net.URI(if ("://" in it) it else "https://$it").host?.removePrefix("www.") }.getOrNull() ?: it
}

@Composable
private fun PartnerLogo(p: Partner, size: androidx.compose.ui.unit.Dp) {
    val c = palette
    Box(Modifier.size(size).clip(RoundedCornerShape(12.dp)).background(c.fillSoft), contentAlignment = Alignment.Center) {
        if (p.logoUrl.isNotEmpty()) RemoteImage(p.logoUrl, Modifier.fillMaxSize(), p.name)
        else Text(p.name.split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1).uppercase() }.ifEmpty { "?" },
            style = Type.subhead.copy(fontWeight = FontWeight.Bold), color = c.label2)
    }
}

@Composable
private fun PartnerSheet(initial: Partner, onDismiss: () -> Unit, onDelete: (() -> Unit)?, onSave: suspend (Partner) -> Boolean) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val navPad = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    var p by remember { mutableStateOf(initial) }
    var uploading by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var aiBusy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        uploading = true
        scope.launch {
            runCatching { Api.uploadImage(prepareImage(context, uri, 800)) }
                .onSuccess { url -> p = p.copy(logoUrl = url) }
                .onFailure { alerts.show("Couldn't upload the logo", SAVE_FAIL) }
            uploading = false
        }
    }
    val adding = initial.id.isEmpty()
    PageSheet(true, onDismiss) {
        SheetHeader("Partner", leading = "Cancel", onLeading = onDismiss, trailing = if (saving) "…" else if (adding) "Add" else "Save",
            trailingEnabled = p.name.isNotBlank() && !saving && !uploading, divider = true, onTrailing = {
                saving = true; error = null
                scope.launch {
                    if (!onSave(p.copy(name = p.name.trim(), websiteUrl = p.websiteUrl.trim(), description = p.description.trim()))) error = "Couldn't save the partner. $SAVE_FAIL"
                    saving = false
                }
            })
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 16.dp, bottom = navPad + 32.dp),
            verticalArrangement = Arrangement.spacedBy(Space.section), horizontalAlignment = Alignment.CenterHorizontally) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.tap(rememberPress(), label = "Upload logo") { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) {
                Box(Modifier.size(96.dp).clip(RoundedCornerShape(20.dp)).background(c.cell), contentAlignment = Alignment.Center) {
                    if (p.logoUrl.isNotEmpty()) RemoteImage(p.logoUrl, Modifier.fillMaxSize(), "Logo")
                    if (uploading) Spinner() else if (p.logoUrl.isEmpty()) SfIcon(Icons.camera, c.label2, size = 28.dp)
                }
                Text(if (p.logoUrl.isEmpty()) "Upload logo" else "Change logo", style = Type.subhead.copy(fontWeight = FontWeight.SemiBold), color = c.tint)
            }
            Section(modifier = Modifier.fillMaxWidth()) {
                item { LabeledInput("Name", p.name, { p = p.copy(name = it) }, "e.g. City University", KeyboardType.Text) }
                item { LabeledInput("Website", p.websiteUrl, { p = p.copy(websiteUrl = it) }, "https://", KeyboardType.Uri) }
            }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                PlainInput(p.description, { p = p.copy(description = it) }, "A brief sentence about this partner…", singleLine = false, minLines = 3, maxLength = 500,
                    modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
                if (Api.available) TextLink(if (aiBusy) "Writing…" else if (p.description.isBlank()) "Suggest with AI" else "Improve", {
                    if (aiBusy) return@TextLink
                    aiBusy = true
                    scope.launch {
                        writingAssist(if (p.description.isBlank()) "suggest" else "improve", "partner-description", p.description, mapOf("eventName" to p.name))
                            ?.let { out -> p = p.copy(description = out.take(500)) }
                            ?: alerts.show("AI couldn't help this time", "Try again in a moment.")
                        aiBusy = false
                    }
                }, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold))
            }
            ErrorText(error)
            if (onDelete != null) Section(modifier = Modifier.fillMaxWidth()) { cell("Remove Partner", destructive = true, chevron = false, onClick = onDelete) }
        }
    }
}
