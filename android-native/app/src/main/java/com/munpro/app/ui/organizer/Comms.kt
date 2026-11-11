package com.munpro.app.ui.organizer

// Staff, schedule and communication (board C4; web organizer/events/[id]/staff, schedule,
// announcements, rules): the team with invites, role changes, committee, vice-chair delegate
// power and six permissions; public staff applications; the schedule builder by day with
// templates; announcement history, a composer with the audience sheet, and the rules editor.
// Data: CommsRepo.

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.munpro.app.AppGraph
import com.munpro.app.data.Api
import com.munpro.app.data.Fresh
import com.munpro.app.data.rememberCached
import com.munpro.app.data.writingAssist
import com.munpro.app.domain.AUDIENCE_ROLES
import com.munpro.app.domain.ApplicationData
import com.munpro.app.domain.AudienceFilter
import com.munpro.app.domain.EventData
import com.munpro.app.domain.FREE_RECIPIENT_LIMIT
import com.munpro.app.domain.OrgAnnouncement
import com.munpro.app.domain.RulesGuide
import com.munpro.app.domain.SCHEDULE_TEMPLATES
import com.munpro.app.domain.SCHEDULE_TYPES
import com.munpro.app.domain.STAFF_APPLY_ROLES
import com.munpro.app.domain.STAFF_PERMISSIONS
import com.munpro.app.domain.STAFF_ROLES
import com.munpro.app.domain.ScheduleItem
import com.munpro.app.domain.StaffDoc
import com.munpro.app.domain.audienceOf
import com.munpro.app.domain.audienceRecipients
import com.munpro.app.domain.audienceSummary
import com.munpro.app.domain.buildTemplateSessions
import com.munpro.app.domain.roleCount
import com.munpro.app.domain.roleLabel
import com.munpro.app.domain.takesCommittee
import com.munpro.app.nav.ComposeAnnouncementRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.blogs.DraftNotesSheet
import com.munpro.app.ui.blogs.FormatKey
import com.munpro.app.ui.blogs.prefixLine
import com.munpro.app.ui.blogs.wrap
import com.munpro.app.ui.kit.ActionSheet
import com.munpro.app.ui.kit.AiAssist
import com.munpro.app.ui.kit.AiContext
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.Chip
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Hairline
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.LocalBack
import com.munpro.app.ui.kit.Markdown
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.PersonAvatar
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.PlainInput
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.RoundButton
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.SearchField
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SectionFooter
import com.munpro.app.ui.kit.SectionHeader
import com.munpro.app.ui.kit.Segmented
import com.munpro.app.ui.kit.SfIcon
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.SheetRow
import com.munpro.app.ui.kit.Space
import com.munpro.app.ui.kit.Spinner
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
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private const val TRY_AGAIN = "Check your connection and try again."

@Composable
private fun rememberCommsEvent(eventId: String) =
    rememberCached("orgEventDoc:$eventId", EventData.serializer(), Fresh.SHORT) { AppGraph.events.getEventById(eventId) ?: error("Event not found") }

@Composable
private fun rememberCommsApps(eventId: String) =
    rememberCached("orgApps:$eventId", ListSerializer(ApplicationData.serializer()), Fresh.SHORT) { AppGraph.allocation.applications(eventId) }

private fun ago(ms: Long?): String {
    if (ms == null) return ""
    val m = (System.currentTimeMillis() - ms) / 60_000
    return when {
        m < 1 -> "just now"
        m < 60 -> "${m}m ago"
        m < 1440 -> "${m / 60}h ago"
        m < 2880 -> "yesterday"
        else -> Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("d MMM", Locale.UK))
    }
}

// ---------------------------------------------------------------------------------------------
// C4.1 – C4.5 · Staff
// ---------------------------------------------------------------------------------------------

/** Profile names by uid: a staff doc's `name` is set at invite time ("Pending User") and never updated. */
private val profileNames = mutableStateMapOf<String, String>()

private fun staffName(s: StaffDoc) = profileNames[s.uid] ?: s.name.takeIf { it.isNotBlank() && it != "Pending User" } ?: s.email.ifEmpty { "Staff member" }

private fun staffLine(s: StaffDoc): String = listOfNotNull(
    roleLabel(s.role),
    when {
        !takesCommittee(s.role) -> null
        !s.committeeId.isNullOrEmpty() -> s.committeeId
        s.role in setOf("director", "usg", "eb") -> "all committees"
        else -> "no committee"
    },
    if (s.role == "vice-chair" && s.delegatePower) "delegate power" else null,
).joinToString(" · ")

@Composable
fun StaffScreen(eventId: String) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val ev = rememberCommsEvent(eventId)
    val e = ev.data
    val flow = remember(eventId) { AppGraph.comms.staff(eventId) }
    val staff by flow.collectAsState(initial = null)
    var tab by rememberSaveable { mutableStateOf("team") }
    var inviting by remember { mutableStateOf(false) }
    var openId by remember { mutableStateOf<String?>(null) }
    var publicOn by remember(e?.id) { mutableStateOf(e?.allowPublicStaff == true) }
    val conferences = remember { mutableStateMapOf<String, Int?>() }

    val team = staff.orEmpty().filter { it.inviteStatus == "accepted" || it.inviteStatus == "invited" }
    val applied = staff.orEmpty().filter { it.inviteStatus == "applied" }
    LaunchedEffect(staff?.map { it.uid }) {
        staff.orEmpty().map { it.uid }.filter { it.isNotEmpty() && it !in profileNames }.distinct().forEach { uid ->
            AppGraph.comms.profileName(uid)?.let { profileNames[uid] = it }
        }
    }
    LaunchedEffect(applied.map { it.uid }) {
        applied.forEach { s -> if (s.uid.isNotEmpty() && s.uid !in conferences) conferences[s.uid] = AppGraph.comms.conferenceCount(s.uid) }
    }

    Screen(back = "Event", tabBar = false, title = "Staff", overline = e?.title, savedAt = ev.savedAt,
        navRight = { if (e != null) RoundButton(Icons.plus, "Invite", { inviting = true }) }) {
        if (e == null || staff == null) { if (ev.failed) Empty("Couldn't load staff", "Pull down to try again.", icon = Icons.people) else Spinner(); return@Screen }
        Segmented(listOf("team" to "Team · ${team.size}", "applications" to if (applied.isEmpty()) "Applications" else "Applications · ${applied.size}"), tab, { tab = it })
        if (tab == "team") {
            if (team.isEmpty()) Empty("No staff yet", "Invite people to help run your conference. They accept from their notifications.", icon = Icons.people,
                action = { MunButton("Invite", { inviting = true }, icon = Icons.plus) })
            else Section {
                team.forEach { s ->
                    item(inset = 70.dp) {
                        Row(Modifier.fillMaxWidth().tap(rememberPress(), label = staffName(s)) { openId = s.id }.padding(horizontal = 16.dp, vertical = 11.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            PersonAvatar(if (s.inviteStatus == "invited" && s.uid.isEmpty()) "?" else staffName(s), size = 42.dp, seed = s.uid.ifEmpty { s.email })
                            Column(Modifier.weight(1f)) {
                                Text(staffName(s), style = Type.headline, color = c.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(staffLine(s), style = Type.footnote, color = c.label2, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                if (s.inviteStatus == "invited") Text(if (s.isRoleUpdate) "Role change pending" else "Invite pending", style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = c.orange)
                            }
                            SfIcon(Icons.chevronRight, c.label3, size = 14.dp)
                        }
                    }
                }
            }
        } else {
            Section(footer = "People can apply as Chair, Vice chair or Director from the conference page. You assign their committee after accepting.") {
                item {
                    Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("Allow public staff applications", style = Type.body, color = c.label)
                            Text(if (publicOn) "Open on the conference page" else "Off", style = Type.footnote, color = c.label2)
                        }
                        Toggle(publicOn, { on ->
                            publicOn = on
                            scope.launch {
                                runCatching { AppGraph.comms.setPublicStaff(eventId, on); refreshCommsEvent(eventId) }
                                    .onFailure { publicOn = !on; alerts.show("Couldn't save", TRY_AGAIN) }
                            }
                        }, "Allow public staff applications")
                    }
                }
            }
            if (applied.isEmpty()) Empty("No applications", if (publicOn) "Applications appear here as people apply." else "Turn on public applications to let people apply.", icon = Icons.people)
            else Section(header = "Applied") {
                applied.forEach { s ->
                    item(inset = 70.dp) {
                        Row(Modifier.padding(horizontal = 16.dp, vertical = 11.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            PersonAvatar(staffName(s), size = 42.dp, seed = s.uid)
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                              Column {
                                Text(staffName(s), style = Type.headline, color = c.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                val n = conferences[s.uid]
                                Text(listOfNotNull("Applied as ${roleLabel(s.role)}", n?.let { "$it conference${if (it == 1) "" else "s"}" }).joinToString(" · "),
                                    style = Type.footnote, color = c.label2)
                                Text(s.email, style = Type.footnote, color = c.label2, maxLines = 1, overflow = TextOverflow.Ellipsis)
                              }
                              Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Pill("Reject", {
                                scope.launch {
                                    if (!alerts.confirm("Reject ${staffName(s)}?", "Their application is removed.", "Reject", destructive = true)) return@launch
                                    runCatching { AppGraph.comms.rejectApplication(eventId, s) }.onFailure { alerts.show("Couldn't reject", TRY_AGAIN) }
                                }
                            }, tone = Tone.Destructive)
                            Pill("Accept", {
                                scope.launch {
                                    runCatching { AppGraph.comms.acceptApplication(eventId, e.title, s) }
                                        .fold(onSuccess = { alerts.show("${staffName(s)} is on the team", "They got an email. Assign their committee from Team.") }, onFailure = { alerts.show("Couldn't accept", TRY_AGAIN) })
                                }
                            }, filled = true)
                              }
                            }
                        }
                    }
                }
            }
        }
    }

    if (e != null) InviteSheet(inviting, { inviting = false }) { email, role ->
        runCatching { AppGraph.comms.invite(eventId, e.title, email, role) }.isSuccess.also { ok -> if (ok) inviting = false }
    }
    val open = staff?.firstOrNull { it.id == openId }
    if (open != null && e != null) StaffMemberSheet(e, open, scope) { openId = null }
}

private suspend fun refreshCommsEvent(eventId: String) {
    AppGraph.events.getEventById(eventId)?.let { AppGraph.saved.write("orgEventDoc:$eventId", EventData.serializer(), it) }
    com.munpro.app.data.Refresh.bump()
}

@Composable
private fun InviteSheet(visible: Boolean, onDismiss: () -> Unit, onSend: suspend (String, String) -> Boolean) {
    val c = palette
    val scope = rememberCoroutineScope()
    val navPad = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    var email by remember(visible) { mutableStateOf("") }
    var role by remember(visible) { mutableStateOf("chair") }
    var busy by remember { mutableStateOf(false) }
    var error by remember(visible) { mutableStateOf<String?>(null) }
    val valid = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$").matches(email.trim())
    PageSheet(visible, onDismiss) {
        SheetHeader("Invite", leading = "Cancel", onLeading = onDismiss, trailing = if (busy) "…" else "Send", trailingEnabled = valid && !busy, divider = true, onTrailing = {
            busy = true; error = null
            scope.launch { if (!onSend(email, role)) error = "Couldn't send the invite. $TRY_AGAIN"; busy = false }
        })
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 14.dp, bottom = navPad + 32.dp),
            verticalArrangement = Arrangement.spacedBy(Space.section)) {
            Section(header = "Email", footer = "They accept from their notifications in MUN Pilot or on the website.") {
                item { PlainInput(email, { email = it }, "name@example.com", maxLength = 200, modifier = Modifier.fillMaxWidth().padding(16.dp), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email)) }
            }
            Section(header = "Role") {
                STAFF_ROLES.forEach { (k, label, sub) ->
                    cell(label, subtitle = sub, trailing = if (role == k) ({ SfIcon(Icons.check, c.tint, size = 18.dp) }) else null, chevron = false, onClick = { role = k })
                }
            }
            ErrorText(error)
        }
    }
}

@Composable
private fun StaffMemberSheet(e: EventData, s: StaffDoc, scope: kotlinx.coroutines.CoroutineScope, onDismiss: () -> Unit) {
    val c = palette
    val alerts = LocalAlerts.current
    val navPad = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    var picking by remember { mutableStateOf<String?>(null) }
    fun save(fields: Map<String, Any?>) = scope.launch {
        runCatching { AppGraph.comms.update(e.id, s, fields) }.onFailure { alerts.show("Couldn't save", TRY_AGAIN) }
    }
    PageSheet(true, onDismiss) {
        SheetHeader(staffName(s), subtitle = s.email.takeIf { it != staffName(s) }, trailing = "Done", onTrailing = onDismiss, divider = true)
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 14.dp, bottom = navPad + 32.dp),
            verticalArrangement = Arrangement.spacedBy(Space.section)) {
            if (s.inviteStatus == "invited") Text(if (s.isRoleUpdate) "Waiting for them to accept the new role. Their access is paused until then." else "Invite pending: they haven't accepted yet.",
                style = Type.footnote, color = c.orange, modifier = Modifier.padding(horizontal = 4.dp))
            Section {
                cell("Role", value = roleLabel(s.role), onClick = { picking = "role" })
                if (takesCommittee(s.role)) cell("Committee", value = s.committeeId?.ifEmpty { null } ?: if (s.role in setOf("director", "usg", "eb")) "All committees" else "None", onClick = { picking = "committee" })
            }
            if (s.role == "vice-chair") Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionHeader("Vice chair powers")
                Segmented(listOf(false to "Standard", true to "+ Delegate power"), s.delegatePower, { on -> save(mapOf("delegatePower" to on)) })
                SectionFooter("Delegate power lets them act for absent delegations in the live session.")
            }
            Section(header = "Permissions", footer = "Chair and vice-chair marking is always scoped to their committee.") {
                STAFF_PERMISSIONS.forEach { (k, label) ->
                    val locked = k == "canViewFinancials" && s.role != "co-organizer"
                    item {
                        Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(label, style = Type.body, color = if (locked) c.label3 else c.label)
                                if (locked) Text("Co-organizers only", style = Type.footnote, color = c.label3)
                            }
                            Toggle(s.permissions[k] == true, { v -> if (!locked) save(mapOf("permissions" to s.permissions + (k to v))) }, label)
                        }
                    }
                }
            }
            Section {
                cell("Remove from Staff", destructive = true, chevron = false, onClick = {
                    scope.launch {
                        if (!alerts.confirm("Remove ${staffName(s)}?", "They lose all access to this event${if (s.role == "co-organizer") ", including co-organizer privileges" else ""}. You can invite them again later.", "Remove", destructive = true)) return@launch
                        runCatching { AppGraph.comms.remove(e.id, s) }.fold(onSuccess = { onDismiss() }, onFailure = { alerts.show("Couldn't remove", TRY_AGAIN) })
                    }
                })
            }
        }
    }
    ActionSheet(picking == "role", { picking = null }, title = "Role") {
        STAFF_ROLES.forEach { (k, label, _) ->
            SheetRow(label, {
                picking = null
                if (k == s.role) return@SheetRow
                scope.launch {
                    val accepted = s.inviteStatus == "accepted"
                    if (!alerts.confirm("Make ${staffName(s)} ${roleLabel(k)}?",
                            if (accepted) "They'll get an email and must accept the new role before it applies. Their access is paused until then." else "Their pending invite changes to the new role.",
                            "Change Role")) return@launch
                    runCatching { AppGraph.comms.changeRole(e.id, e.title, s, k) }.onFailure { alerts.show("Couldn't change the role", TRY_AGAIN) }
                }
            }, selected = k == s.role)
        }
    }
    ActionSheet(picking == "committee", { picking = null }, title = "Committee") {
        SheetRow(if (s.role in setOf("director", "usg", "eb")) "All committees" else "No committee", { picking = null; save(mapOf("committeeId" to null)) }, selected = s.committeeId.isNullOrEmpty())
        e.committees.forEach { cm -> SheetRow(cm.name, { picking = null; save(mapOf("committeeId" to cm.name)) }, selected = s.committeeId == cm.name) }
    }
}

/** "Join the staff" on a conference page while the organizer takes public staff applications. */
@Composable
fun StaffApplySection(e: EventData) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val user = AppGraph.auth.user ?: return
    if (e.allowPublicStaff != true || e.organizerId == user.uid) return
    var mine by remember(e.id) { mutableStateOf<StaffDoc?>(null) }
    var loaded by remember(e.id) { mutableStateOf(false) }
    var role by remember { mutableStateOf("chair") }
    var busy by remember { mutableStateOf(false) }
    LaunchedEffect(e.id) { mine = AppGraph.comms.myStaffDoc(e.id, user.uid); loaded = true }
    if (!loaded) return
    val m = mine
    if (m != null && m.inviteStatus != "applied") return
    Section(header = "Join the staff", footer = if (m != null) "The organizer reviews it and assigns your committee if you're accepted." else "The organizer is taking applications for the dais.") {
        if (m != null) {
            cell("Applied as ${roleLabel(m.role)}", subtitle = "Waiting for the organizer", tinted = true, chevron = false)
            cell(if (busy) "Withdrawing…" else "Withdraw Application", destructive = true, chevron = false, onClick = {
                if (busy) return@cell
                scope.launch {
                    if (!alerts.confirm("Withdraw your staff application?", null, "Withdraw", destructive = true)) return@launch
                    busy = true
                    runCatching { AppGraph.comms.withdrawStaffApplication(e.id, user.uid) }.fold(onSuccess = { mine = null }, onFailure = { alerts.show("Couldn't withdraw", TRY_AGAIN) })
                    busy = false
                }
            })
        } else {
            STAFF_APPLY_ROLES.forEach { r -> cell(roleLabel(r), trailing = if (role == r) ({ SfIcon(Icons.check, c.tint, size = 18.dp) }) else null, chevron = false, onClick = { role = r }) }
            item {
                Box(Modifier.padding(12.dp)) {
                    MunButton("Apply as ${roleLabel(role)}", {
                        val email = user.email
                        if (email.isNullOrBlank()) { alerts.show("Can't apply", "Your account needs an email address."); return@MunButton }
                        busy = true
                        scope.launch {
                            val name = AppGraph.auth.profile?.let { p -> listOfNotNull(p.firstName, p.lastName).joinToString(" ").trim() }.orEmpty().ifEmpty { AppGraph.chats.me()?.name.orEmpty() }
                            runCatching { AppGraph.comms.applyForStaff(e.id, user.uid, name, email, role); AppGraph.comms.myStaffDoc(e.id, user.uid) }
                                .fold(onSuccess = { mine = it }, onFailure = { alerts.show("Couldn't send your application", TRY_AGAIN) })
                            busy = false
                        }
                    }, loading = busy)
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// C4.6 – C4.8 · Schedule builder
// ---------------------------------------------------------------------------------------------

private val DAY_TAB = DateTimeFormatter.ofPattern("EEE d MMM", Locale.UK)
private val CLOCK = DateTimeFormatter.ofPattern("h:mm a", Locale.UK)

private fun parseAt(s: String): LocalDateTime? = runCatching { LocalDateTime.parse(s.take(16)) }.getOrNull()
private fun dayOf(i: ScheduleItem): String = parseAt(i.startTime)?.toLocalDate()?.toString() ?: ""

private fun typeColor(type: String, c: com.munpro.app.ui.kit.Palette): Color = when (type) {
    "main" -> c.tint; "break" -> c.orange; "social" -> c.gold; else -> c.info
}

@Composable
fun ScheduleBuilderScreen(eventId: String) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val ev = rememberCommsEvent(eventId)
    val e = ev.data
    var items by remember(e?.id) { mutableStateOf(e?.schedule.orEmpty()) }
    var day by rememberSaveable { mutableStateOf<String?>(null) }
    var editing by remember { mutableStateOf<Int?>(null) }
    var adding by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    val dirty = e != null && items != e.schedule
    val days = items.map(::dayOf).distinct().sortedWith(compareBy({ it.isEmpty() }, { it }))
    val current = day?.takeIf { it in days } ?: days.firstOrNull()

    fun save() {
        saving = true
        scope.launch {
            runCatching { AppGraph.comms.saveSchedule(eventId, items); refreshCommsEvent(eventId) }
                .fold(onSuccess = { alerts.show("Schedule saved", null) }, onFailure = { alerts.show("Couldn't save the schedule", TRY_AGAIN) })
            saving = false
        }
    }

    Screen(back = "Event", tabBar = false, title = "Schedule", overline = e?.title, savedAt = ev.savedAt,
        navRight = {
            if (e != null) Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                RoundButton(Icons.plus, "Add sessions", { adding = true })
                Pill(if (saving) "…" else "Save", ::save, filled = true, enabled = dirty && !saving)
            }
        }) {
        if (e == null) { if (ev.failed) Empty("Couldn't load the schedule", "Pull down to try again.", icon = Icons.cal) else Spinner(); return@Screen }
        if (items.isEmpty()) {
            Empty("No sessions yet", "Start from a template (times filled from your event date) or add sessions one by one.", icon = Icons.cal,
                action = { MunButton("Add Sessions", { adding = true }, icon = Icons.plus) })
            return@Screen
        }
        if (days.size > 1) Segmented(days.map { it to (runCatching { LocalDate.parse(it).format(DAY_TAB) }.getOrNull() ?: "No time") }, current ?: "", { day = it })
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell)) {
            val shown = items.withIndex().filter { dayOf(it.value) == current }.sortedBy { it.value.startTime }
            shown.forEachIndexed { n, (i, s) ->
                if (n > 0) Box(Modifier.padding(start = 92.dp).fillMaxWidth().height(Hairline).background(c.separator))
                Row(Modifier.fillMaxWidth().height(androidx.compose.foundation.layout.IntrinsicSize.Min).tap(rememberPress(), label = s.title.ifEmpty { "Session" }) { editing = i }
                    .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Column(Modifier.width(62.dp)) {
                        Text(parseAt(s.startTime)?.format(CLOCK) ?: "—", style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = c.label)
                        Text(parseAt(s.endTime)?.format(CLOCK) ?: "", style = Type.footnote, color = c.label2)
                    }
                    Box(Modifier.width(3.dp).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(typeColor(s.type, c)))
                    Column(Modifier.weight(1f)) {
                        Text(s.title.ifEmpty { "Untitled session" }, style = Type.headline, color = if (s.title.isEmpty()) c.label3 else c.label)
                        Text(listOfNotNull(s.location.ifEmpty { null }, SCHEDULE_TYPES.firstOrNull { it.first == s.type }?.second).joinToString(" · "), style = Type.footnote, color = c.label2)
                    }
                }
            }
        }
        SectionFooter(if (dirty) "Unsaved changes: tap Save." else "Colour shows the session type. Tap a session to edit it.")
    }

    if (adding) TemplatesSheet(e, { adding = false }) { added ->
        adding = false
        val start = items.size
        items = items + added
        if (added.size == 1) editing = start
        added.firstOrNull()?.let { day = dayOf(it) }
    }
    val idx = editing
    if (idx != null && idx < items.size) SessionSheet(items[idx], { editing = null },
        onRemove = { items = items.filterIndexed { j, _ -> j != idx }; editing = null }) { out ->
        items = items.toMutableList().also { it[idx] = out }; editing = null; day = dayOf(out)
    }
}

@Composable
private fun TemplatesSheet(e: EventData?, onDismiss: () -> Unit, onAdd: (List<ScheduleItem>) -> Unit) {
    val c = palette
    val navPad = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    var picked by remember { mutableStateOf<String?>(null) }
    val hasDate = com.munpro.app.domain.resolveEventStartDate(e) != null
    PageSheet(true, onDismiss) {
        SheetHeader("Add Sessions", leading = "Cancel", onLeading = onDismiss, trailing = "Add", trailingEnabled = picked != null, divider = true, onTrailing = {
            val t = SCHEDULE_TEMPLATES.firstOrNull { it.id == picked }
            onAdd(if (t != null) buildTemplateSessions(t, e) else listOf(ScheduleItem("", "", "", "session", "")))
        })
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 14.dp, bottom = navPad + 32.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SectionHeader("Templates")
            SCHEDULE_TEMPLATES.forEach { t ->
                ChoiceCard(t.name, "${t.sessions.size} sessions${if (t.days > 1) " across ${t.days} days" else ""}", t.description, picked == t.id) { picked = t.id }
            }
            SectionFooter(if (hasDate) "Times are filled from the event date." else "Set the event date to have template times filled in.")
            SectionHeader("Or")
            ChoiceCard("Blank session", "One session", "Set the title, type, place and times yourself.", picked == "") { picked = "" }
        }
    }
}

@Composable
private fun ChoiceCard(name: String, meta: String, description: String, selected: Boolean, onClick: () -> Unit) {
    val c = palette
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell)
            .border(if (selected) 2.dp else Hairline, if (selected) c.tint else c.separator, RoundedCornerShape(Radius.cell))
            .tap(rememberPress(), label = name, onClick = onClick).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(name, style = Type.headline, color = c.label, modifier = Modifier.weight(1f))
            if (selected) SfIcon(Icons.check, c.tint, size = 18.dp)
        }
        Text(meta, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = c.tint)
        Text(description, style = Type.footnote, color = c.label2)
    }
}

@Composable
private fun SessionSheet(initial: ScheduleItem, onDismiss: () -> Unit, onRemove: () -> Unit, onDone: (ScheduleItem) -> Unit) {
    val c = palette
    val navPad = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    var s by remember { mutableStateOf(initial.copy(type = initial.type.ifEmpty { "session" })) }
    var picking by remember { mutableStateOf<String?>(null) }
    fun label(at: String) = parseAt(at)?.let { "${it.toLocalDate().format(DAY_TAB)} · ${it.format(CLOCK)}" } ?: "Choose"
    val bad = parseAt(s.startTime)?.let { st -> parseAt(s.endTime)?.let { it.isBefore(st) } } == true
    PageSheet(true, onDismiss) {
        SheetHeader("Session", leading = "Cancel", onLeading = onDismiss, trailing = "Done", trailingEnabled = !bad, divider = true, onTrailing = { onDone(s.copy(title = s.title.trim(), location = s.location.trim())) })
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 14.dp, bottom = navPad + 32.dp),
            verticalArrangement = Arrangement.spacedBy(Space.section)) {
            Section {
                item { PlainInput(s.title, { v -> s = s.copy(title = v) }, "Title, e.g. Opening Ceremony", maxLength = 120, modifier = Modifier.fillMaxWidth().padding(16.dp), keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words)) }
                item { PlainInput(s.location, { v -> s = s.copy(location = v) }, "Location, e.g. Main Hall", maxLength = 120, modifier = Modifier.fillMaxWidth().padding(16.dp), keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words)) }
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionHeader("Type")
                Segmented(SCHEDULE_TYPES, s.type, { v -> s = s.copy(type = v) })
            }
            Section(footer = if (bad) "The end is before the start." else null) {
                cell("Starts", value = label(s.startTime), onClick = { picking = "start" })
                cell("Ends", value = label(s.endTime), onClick = { picking = "end" })
            }
            Section { cell("Remove Session", destructive = true, chevron = false, onClick = onRemove) }
        }
    }
    when (picking) {
        "start" -> {
            val at = parseAt(s.startTime)
            DateTimeDialog(at?.toLocalDate()?.toString() ?: LocalDate.now().toString(), at?.toLocalTime()?.toString() ?: "09:00", { picking = null }, allowPast = true) { d, t ->
                picking = null
                // Keep the length when the start moves; a fresh session gets an hour.
                val old = parseAt(s.startTime); val oldEnd = parseAt(s.endTime)
                val start = LocalDateTime.parse("${d}T$t")
                val end = if (old != null && oldEnd != null) start.plus(java.time.Duration.between(old, oldEnd)) else oldEnd ?: start.plusHours(1)
                s = s.copy(startTime = start.toString().take(16), endTime = end.toString().take(16))
            }
        }
        "end" -> {
            val at = parseAt(s.endTime) ?: parseAt(s.startTime)?.plusHours(1)
            DateTimeDialog(at?.toLocalDate()?.toString() ?: LocalDate.now().toString(), at?.toLocalTime()?.toString() ?: "10:00", { picking = null }, allowPast = true) { d, t ->
                picking = null; s = s.copy(endTime = "${d}T$t")
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// C4.9 · Announcements
// ---------------------------------------------------------------------------------------------

private fun statusChip(a: OrgAnnouncement): Pair<String, Tone> = when (a.status) {
    "sent" -> "Sent" to Tone.Tint
    "partial" -> "Partial" to Tone.Warning
    "failed" -> "Failed" to Tone.Destructive
    "draft" -> "Draft" to Tone.Neutral
    "scheduled" -> "Scheduled" to Tone.Tint
    "queued", "sending" -> "Sending" to Tone.Tint
    else -> a.status.replaceFirstChar { it.uppercase() } to Tone.Neutral
}

@Composable
fun AnnouncementsScreen(eventId: String) {
    val c = palette
    val nav = LocalNav.current
    val ev = rememberCommsEvent(eventId)
    val flow = remember(eventId) { AppGraph.comms.announcements(eventId) }
    val list by flow.collectAsState(initial = null)
    var open by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    Screen(back = "Event", tabBar = false, title = "Announcements", overline = ev.data?.title,
        navRight = { RoundButton(Icons.compose, "New announcement", { nav.go(ComposeAnnouncementRoute(eventId)) }) }) {
        val l = list
        if (l == null) { Spinner(); return@Screen }
        if (l.isEmpty()) {
            Empty("No announcements yet", "Email your participants by role, committee or payment, or pick people.", icon = Icons.mega,
                action = { MunButton("New Announcement", { nav.go(ComposeAnnouncementRoute(eventId)) }, icon = Icons.compose) })
            return@Screen
        }
        Section(footer = "Tap one to see who got it, edit a draft or cancel a scheduled send.") {
            l.forEach { a ->
                val (label, tone) = statusChip(a)
                val failed = a.deliveryStats?.failed ?: 0
                cell(a.subject.ifEmpty { "No subject" },
                    subtitle = listOfNotNull(
                        audienceSummary(audienceOf(a)),
                        a.recipientCount?.let { "$it recipient${if (it == 1) "" else "s"}" },
                        if (failed > 0) "$failed bounced" else null,
                        if (a.status == "scheduled") a.scheduledAt?.let { Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("EEE d MMM, h:mm a", Locale.UK)) }
                        else ago(a.sentAt ?: a.createdAt).ifEmpty { null },
                    ).joinToString(" · "),
                    trailing = { Chip(label, tone) }, onClick = { open = a.id })
            }
        }
    }
    val a = list?.firstOrNull { it.id == open }
    if (a != null) AnnouncementSheet(eventId, a, scope) { open = null }
}

@Composable
private fun AnnouncementSheet(eventId: String, a: OrgAnnouncement, scope: kotlinx.coroutines.CoroutineScope, onDismiss: () -> Unit) {
    val c = palette
    val nav = LocalNav.current
    val alerts = LocalAlerts.current
    val navPad = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    var q by remember { mutableStateOf("") }
    val (label, tone) = statusChip(a)
    PageSheet(true, onDismiss) {
        SheetHeader("Announcement", trailing = "Done", onTrailing = onDismiss, divider = true)
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 14.dp, bottom = navPad + 32.dp),
            verticalArrangement = Arrangement.spacedBy(Space.section)) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(horizontal = 4.dp)) {
                Chip(label, tone)
                Text(a.subject, style = Type.title2, color = c.label)
                a.errorMessage?.takeIf { a.status == "failed" }?.let { Text(it, style = Type.footnote, color = c.red) }
            }
            Section(header = "Audience") {
                cell("To", value = audienceSummary(audienceOf(a)), chevron = false)
                a.recipientCount?.let { cell("Recipients", value = "$it", chevron = false) }
                a.deliveryStats?.let { d -> cell("Delivered", value = "${d.sent ?: 0}${if ((d.failed ?: 0) > 0) " · ${d.failed} failed" else ""}", chevron = false) }
            }
            if (a.status == "draft") Section {
                cell("Edit Draft", onClick = { onDismiss(); nav.go(ComposeAnnouncementRoute(eventId, a.id)) })
                cell("Delete Draft", destructive = true, chevron = false, onClick = {
                    scope.launch {
                        if (!alerts.confirm("Delete this draft?", null, "Delete", destructive = true)) return@launch
                        runCatching { AppGraph.comms.deleteAnnouncement(eventId, a.id) }.fold(onSuccess = { onDismiss() }, onFailure = { alerts.show("Couldn't delete", TRY_AGAIN) })
                    }
                })
            }
            if (a.status == "scheduled") Section(footer = "Scheduled sending isn't running on this server yet, so it hasn't gone out. Cancel it and send it now instead.") {
                cell("Cancel Scheduled Send", destructive = true, chevron = false, onClick = {
                    scope.launch {
                        if (!alerts.confirm("Cancel this scheduled announcement?", "It's deleted and won't be sent.", "Cancel Send", destructive = true)) return@launch
                        runCatching { AppGraph.comms.deleteAnnouncement(eventId, a.id) }.fold(onSuccess = { onDismiss() }, onFailure = { alerts.show("Couldn't cancel", TRY_AGAIN) })
                    }
                })
            }
            if (a.status !in setOf("draft", "scheduled")) Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionHeader("Recipients · ${a.recipients.size}")
                if (a.recipients.isEmpty()) SectionFooter("The recipient list wasn't recorded for this announcement.")
                else {
                    if (a.recipients.size > 8) SearchField(q, { q = it }, placeholder = "Search recipients")
                    Section {
                        a.recipients.filter { r -> q.isBlank() || "${r.name} ${r.email} ${r.role}".contains(q.trim(), true) }.take(200).forEach { r ->
                            cell(r.name.ifEmpty { "User" }, subtitle = r.email, value = r.role, chevron = false)
                        }
                    }
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionHeader("Message")
                Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp)) {
                    if (a.body.isBlank()) Text("No content", style = Type.body, color = c.label3) else Markdown(a.body)
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// C4.10 / C4.11 · Compose, audience
// ---------------------------------------------------------------------------------------------

@Composable
fun ComposeAnnouncementScreen(eventId: String, draftId: String) {
    val c = palette
    val goBack = LocalBack.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val ev = rememberCommsEvent(eventId)
    val apps = rememberCommsApps(eventId)
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val status = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    var subject by remember { mutableStateOf("") }
    var body by remember { mutableStateOf(TextFieldValue("")) }
    var audience by remember { mutableStateOf(AudienceFilter()) }
    var loaded by remember { mutableStateOf(draftId.isEmpty()) }
    var picking by remember { mutableStateOf(false) }
    var preview by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(draftId) {
        if (draftId.isEmpty()) return@LaunchedEffect
        val d = runCatching { AppGraph.comms.announcement(eventId, draftId) }.getOrNull()
        if (d != null) { subject = d.subject; body = TextFieldValue(d.body); audience = audienceOf(d) }
        loaded = true
    }
    val count = apps.data?.let { audienceRecipients(it, audience).size }
    // Big sends come with the event's plan (Plan.kt), not the sender.
    val pro = com.munpro.app.domain.resolvePlan(ev.data, null).has(com.munpro.app.domain.FEATURE_BULK_EMAIL)
    val overLimit = (count ?: 0) > FREE_RECIPIENT_LIMIT && !pro
    val canSend = subject.isNotBlank() && body.text.isNotBlank() && count != null && count > 0 && !overLimit && busy == null

    fun saveDraft() {
        busy = "draft"; error = null
        scope.launch {
            runCatching { AppGraph.comms.saveDraft(eventId, draftId.ifEmpty { null }, subject.trim(), body.text, audience, count ?: 0) }
                .fold(onSuccess = { goBack() }, onFailure = { error = "Couldn't save the draft. $TRY_AGAIN" })
            busy = null
        }
    }
    fun send() = scope.launch {
        if (!alerts.confirm("Send to $count ${if (count == 1) "person" else "people"}?", "It's emailed now and can't be unsent.", "Send")) return@launch
        busy = "send"; error = null
        val res = AppGraph.comms.send(eventId, draftId.ifEmpty { null }, subject.trim(), body.text, audience, count ?: 0)
        busy = null
        if (res.ok) {
            val o = res.body as? kotlinx.serialization.json.JsonObject
            fun n(k: String) = (o?.get(k) as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull() ?: 0
            val sent = n("sent"); val failed = n("failed")
            if (failed > 0 && sent == 0) alerts.show("Couldn't deliver it", "The mail server refused all $failed address${if (failed == 1) "" else "es"}. It's in the history as Failed.")
            else if (failed > 0) alerts.show("Sent to $sent", "$failed couldn't be delivered. See the history for who got it.")
            else alerts.show("Announcement sent", "It's in the history with who got it.")
            goBack()
        }
        else error = res.error ?: "Couldn't send. $TRY_AGAIN"
    }

    Column(Modifier.fillMaxSize().background(c.bg)) {
        Spacer(Modifier.height(status))
        Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = Space.gutter), verticalAlignment = Alignment.CenterVertically) {
            TextLink("Cancel", { goBack() })
            Text("Announcement", style = Type.headline, color = c.label, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.weight(1f))
            Pill(if (preview) "Edit" else "Preview", { preview = !preview })
        }
        Box(Modifier.fillMaxWidth().height(Hairline).background(c.separator))
        if (!loaded || ev.data == null) { Spinner(); return@Column }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 14.dp, bottom = navBottom + 32.dp),
            verticalArrangement = Arrangement.spacedBy(Space.section)) {
            if (preview) {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(ev.data?.title.orEmpty(), style = Type.footnote, color = c.label2)
                    Text(subject.ifBlank { "Subject line" }, style = Type.title2, color = c.label)
                    if (body.text.isBlank()) Text("Your message preview…", style = Type.body, color = c.label3) else Markdown(body.text)
                }
            } else {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    PlainInput(subject, { subject = it }, "Subject", style = Type.headline, maxLength = 150, modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
                    AiAssist("announcement_subject", subject, AiContext(subject = body.text.take(160)), { subject = it })
                }
                MarkdownBox(body, { body = it }, "Hi delegates,\n\nWrite your message here.", "announcement-email", mapOf("subject" to subject), minHeight = 220)
            }
            Section(header = "Audience") {
                cell(audienceSummary(audience), value = count?.toString() ?: "…", onClick = { picking = true })
            }
            if ((count ?: 0) > FREE_RECIPIENT_LIMIT) SectionFooter(if (pro) "Over $FREE_RECIPIENT_LIMIT recipients needs Pro · this event is Pro." else "Over $FREE_RECIPIENT_LIMIT recipients needs a Pro event. Narrow the audience, or upgrade under Event › Plan.")
            else if (count == 0) SectionFooter("Nobody matches this audience yet: only approved participants get announcements.")
            SectionFooter("Scheduling a send for later isn't available yet; send it now or save a draft.")
            ErrorText(error)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                MunButton("Save Draft", ::saveDraft, Modifier.weight(1f), variant = ButtonVariant.Tinted, loading = busy == "draft", enabled = subject.isNotBlank() && busy == null)
                MunButton("Send", { send() }, Modifier.weight(1f), loading = busy == "send", enabled = canSend)
            }
        }
    }
    val list = apps.data
    if (picking && list != null) AudienceSheet(ev.data!!, list, audience, { picking = false }) { audience = it; picking = false }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AudienceSheet(e: EventData, apps: List<ApplicationData>, initial: AudienceFilter, onDismiss: () -> Unit, onDone: (AudienceFilter) -> Unit) {
    val c = palette
    val navPad = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    var a by remember { mutableStateOf(initial) }
    var q by remember { mutableStateOf("") }
    val count = audienceRecipients(apps, a).size
    val people = apps.filter { it.status == "approved" && it.userId.isNotEmpty() }.distinctBy { it.userId }
    PageSheet(true, onDismiss) {
        SheetHeader("Audience", subtitle = "$count recipient${if (count == 1) "" else "s"}", leading = "Back", onLeading = onDismiss, trailing = "Done", onTrailing = { onDone(a) }, divider = true)
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 14.dp, bottom = navPad + 32.dp),
            verticalArrangement = Arrangement.spacedBy(Space.section)) {
            val specific = a.userIds.isNotEmpty()
            Section(header = "Roles", footer = if (specific) "Picking specific people below replaces these filters." else null) {
                AUDIENCE_ROLES.forEach { (k, label) ->
                    val on = k in a.roles
                    cell(label, value = "${roleCount(apps, k)}", dim = specific, chevron = false,
                        trailing = { Box(Modifier.size(22.dp).clip(CircleShape).background(if (on) c.tint else c.fillSoft), contentAlignment = Alignment.Center) { if (on) SfIcon(Icons.check, c.onTint, size = 13.dp) } },
                        onClick = { a = a.copy(roles = if (on) a.roles - k else a.roles + k) })
                }
            }
            if (e.committees.isNotEmpty()) Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionHeader("Committees · none = all")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    e.committees.forEach { cm ->
                        val on = cm.name in a.committees
                        Box(Modifier.clip(CircleShape).background(if (on) c.tintSoft else c.cell).border(Hairline, if (on) c.tint else c.separator, CircleShape)
                            .tap(rememberPress(), label = cm.name) { a = a.copy(committees = if (on) a.committees - cm.name else a.committees + cm.name) }
                            .padding(horizontal = 14.dp, vertical = 8.dp)) {
                            Text(cm.name, style = Type.subhead.copy(fontWeight = FontWeight.SemiBold), color = if (on) c.tint else c.label)
                        }
                    }
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionHeader("Payment")
                Segmented(listOf("all" to "All", "paid" to "Paid", "unpaid" to "Unpaid"), a.paymentStatus, { a = a.copy(paymentStatus = it) })
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.weight(1f)) { SectionHeader("Specific people${if (specific) " · ${a.userIds.size}" else ""}") }
                    if (specific) TextLink("Clear", { a = a.copy(userIds = emptyList()) }, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold))
                }
                SearchField(q, { q = it }, placeholder = "Search approved participants")
                val shown = people.filter { p -> p.userId in a.userIds || (q.isNotBlank() && "${p.applicantName.orEmpty()} ${p.applicantEmail.orEmpty()} ${p.role}".contains(q.trim(), true)) }.take(40)
                if (shown.isNotEmpty()) Section {
                    shown.forEach { p ->
                        val on = p.userId in a.userIds
                        cell(p.applicantName.orEmpty().ifEmpty { "User" }, subtitle = listOfNotNull(p.role.ifEmpty { null }, p.applicantEmail).joinToString(" · "), chevron = false,
                            trailing = { Box(Modifier.size(22.dp).clip(CircleShape).background(if (on) c.tint else c.fillSoft), contentAlignment = Alignment.Center) { if (on) SfIcon(Icons.check, c.onTint, size = 13.dp) } },
                            onClick = { a = a.copy(userIds = if (on) a.userIds - p.userId else a.userIds + p.userId) })
                    }
                }
            }
        }
    }
}

/** A Markdown text box with a format bar and AI writing help (the study guide editor's tools). */
@Composable
private fun MarkdownBox(body: TextFieldValue, onChange: (TextFieldValue) -> Unit, placeholder: String, surface: String, ctx: Map<String, String>, minHeight: Int = 320) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    var aiMenu by remember { mutableStateOf(false) }
    var aiBusy by remember { mutableStateOf<String?>(null) }
    var undo by remember { mutableStateOf<TextFieldValue?>(null) }
    var drafting by remember { mutableStateOf(false) }
    val sel = body.selection
    val selected = if (sel.collapsed) "" else body.text.substring(sel.min, sel.max)
    fun runOnSelection(action: String) {
        if (selected.isBlank() || aiBusy != null) return
        aiBusy = action
        val (s, e) = sel.min to sel.max
        scope.launch {
            val out = writingAssist(action, surface, selected, ctx)
            if (out == null) alerts.show("AI couldn't help this time", "Try again in a moment.")
            else { undo = body; val t = body.text.replaceRange(s, e, out); onChange(TextFieldValue(t, TextRange(s + out.length))) }
            aiBusy = null
        }
    }
    fun runWhole(action: String, instruction: String? = null) {
        if (aiBusy != null) return
        aiBusy = action
        scope.launch {
            val out = writingAssist(action, surface, body.text, ctx, instruction = instruction)
            if (out == null) alerts.show("AI couldn't help this time", "Try again in a moment.")
            else {
                undo = body
                val t = when (action) { "continue", "draft" -> if (body.text.isBlank()) out else body.text.trimEnd() + "\n\n" + out; else -> out }
                onChange(TextFieldValue(t, TextRange(t.length)))
            }
            aiBusy = null
        }
    }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell)) {
        if (selected.isNotBlank() && Api.available) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                SfIcon(Icons.sparkle, c.tint, size = 18.dp)
                listOf("improve" to "Improve", "grammar" to "Fix grammar").forEach { (k, label) -> Pill(if (aiBusy == k) "…" else label, { runOnSelection(k) }, enabled = aiBusy == null) }
            }
        } else Row(Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            FormatKey("H", "Heading", Type.headline) { onChange(prefixLine(body, "## ")) }
            FormatKey("B", "Bold", Type.headline) { onChange(wrap(body, "**")) }
            FormatKey("I", "Italic", Type.headline.copy(fontStyle = FontStyle.Italic, fontFamily = FontFamily.Serif)) { onChange(wrap(body, "_")) }
            FormatKey("•", "Bulleted list", Type.headline) { onChange(prefixLine(body, "- ")) }
            if (Api.available) FormatKey(if (aiBusy != null) "…" else "AI", "Writing help", Type.subhead.copy(fontWeight = FontWeight.Bold), tint = true) { aiMenu = true }
        }
        Box(Modifier.fillMaxWidth().height(Hairline).background(c.separator))
        BasicTextField(
            body, onChange,
            textStyle = Type.body.copy(fontSize = 16.sp, lineHeight = 25.sp, color = c.label),
            cursorBrush = SolidColor(c.tint),
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            modifier = Modifier.fillMaxWidth().heightIn(min = minHeight.dp).padding(16.dp),
            decorationBox = { inner -> Box { if (body.text.isEmpty()) Text(placeholder, style = Type.body.copy(fontSize = 16.sp), color = c.label3); inner() } },
        )
        if (undo != null) Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) { TextLink("Undo", { onChange(undo!!); undo = null }, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold)) }
    }
    ActionSheet(aiMenu, { aiMenu = false }, title = "Writing help", message = "Select text to improve or fix just that part.") {
        SheetRow("Continue writing", { aiMenu = false; runWhole("continue") }, enabled = body.text.isNotBlank(), icon = Icons.pen)
        SheetRow("Draft from notes…", { aiMenu = false; drafting = true }, icon = Icons.sparkle)
        SheetRow("Improve all of it", { aiMenu = false; runWhole("improve") }, enabled = body.text.isNotBlank(), icon = Icons.sparkle)
        SheetRow("Fix grammar everywhere", { aiMenu = false; runWhole("grammar") }, enabled = body.text.isNotBlank(), icon = Icons.check)
    }
    DraftNotesSheet(drafting, { drafting = false }) { notes -> runWhole("draft", notes) }
}

// ---------------------------------------------------------------------------------------------
// C4.12 · Rules & regulations
// ---------------------------------------------------------------------------------------------

private const val RULES_SKELETON = "# Rules & Regulations\n\n## Code of Conduct\n\n## Rules of Procedure\n\n## Awards & Recognition\n\n## Disciplinary Policy"

@Composable
fun RulesEditorScreen(eventId: String) {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    var server by remember { mutableStateOf<RulesGuide?>(null) }
    var loaded by remember { mutableStateOf(false) }
    var body by remember { mutableStateOf(TextFieldValue("")) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(eventId) {
        server = runCatching { AppGraph.content.getRulesGuide(eventId) }.getOrNull()
        body = TextFieldValue(server?.content.orEmpty())
        loaded = true
    }
    val dirty = loaded && body.text != server?.content.orEmpty()
    Screen(back = "Event", tabBar = false, title = "Rules", overline = when {
        !loaded -> null
        server == null -> "Not published yet"
        else -> listOfNotNull("Published", server?.updatedAt?.let { "updated ${ago(it)}" }).joinToString(" · ")
    }) {
        if (!loaded) { Spinner(); return@Screen }
        MarkdownBox(body, { body = it }, RULES_SKELETON, "rules-guide", emptyMap(), minHeight = 380)
        if (body.text.isEmpty()) TextLink("Start from the section outline", { body = TextFieldValue(RULES_SKELETON + "\n") }, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold))
        ErrorText(error)
        MunButton(if (server != null) "Update Rules" else "Publish Rules", {
            if (body.text.isBlank()) { error = "The rules are empty."; return@MunButton }
            saving = true; error = null
            scope.launch {
                runCatching { AppGraph.comms.saveRules(eventId, body.text) }.fold(
                    onSuccess = { server = RulesGuide(body.text, System.currentTimeMillis()); alerts.show("Rules published", "Everyone in the event reads them from Documents.") },
                    onFailure = { error = "Save failed: ${it.message ?: "permission or network error"}" },
                )
                saving = false
            }
        }, loading = saving, enabled = dirty || server == null)
        if (dirty && server != null) MunButton("Discard Changes", { body = TextFieldValue(server?.content.orEmpty()) }, variant = ButtonVariant.Plain)
        Text("Visible to every role: chairs, delegates and staff.", style = Type.footnote, color = c.label2, modifier = Modifier.padding(horizontal = 4.dp))
    }
}
