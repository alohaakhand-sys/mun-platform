package com.munpro.app.ui.profile

// Your profile, edited on the phone (board A3; web dashboard/settings Profile + ProfileView's
// owner editors, ProfileEditDialogs, SkillsSection, RecommendationsSection). Every write is the
// web's: only the fields being changed, on your own users/{uid}. Photos go through the site's
// /api/upload and are saved as photoURL / coverURL.

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.data.Api
import com.munpro.app.data.prepareImage
import com.munpro.app.domain.AwardEntry
import com.munpro.app.domain.DelegateResult
import com.munpro.app.domain.EducationEntry
import com.munpro.app.domain.ExperienceEntry
import com.munpro.app.domain.PublicProfile
import com.munpro.app.domain.awardLabel
import com.munpro.app.domain.profileStrength
import com.munpro.app.nav.AccountDetailsRoute
import com.munpro.app.nav.MyRecommendationsRoute
import com.munpro.app.nav.PublicProfileRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.home.HeaderWithLink
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.Capsule
import com.munpro.app.ui.kit.Chip
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Essay
import com.munpro.app.ui.kit.Field
import com.munpro.app.ui.kit.IconTile
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.Inter
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.PersonAvatar
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.RemoteImage
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SectionFooter
import com.munpro.app.ui.kit.SfIcon
import com.munpro.app.ui.kit.SheetHeader
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
import java.util.UUID

/** The signed-in user's profile doc, live while the screen is open. */
@Composable
fun rememberOwnProfile(): PublicProfile? {
    val uid = AppGraph.auth.user?.uid ?: return null
    val p by remember(uid) { AppGraph.people.own(uid) }.collectAsStateWithLifecycle(null)
    return p
}

/** Saves [fields] on your profile; a failure says so in an alert. True when it saved. */
private suspend fun saveMine(fields: Map<String, Any?>, alerts: com.munpro.app.ui.kit.AlertController): Boolean {
    val uid = AppGraph.auth.user?.uid ?: return false
    return runCatching { AppGraph.people.update(uid, fields) }
        .onFailure { alerts.show("Didn't save", "Check your connection and try again.") }.isSuccess
}

private enum class Sheet { Intro, OpenTo, Experience, Education, Award, Skills, Contact }

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun EditProfileScreen() {
    val c = palette
    val nav = LocalNav.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val uid = AppGraph.auth.user?.uid.orEmpty()
    val p = rememberOwnProfile()
    var results by remember { mutableStateOf<List<DelegateResult>>(emptyList()) }
    var pending by remember { mutableStateOf(0) }
    var sheet by remember { mutableStateOf<Sheet?>(null) }
    var editingExp by remember { mutableStateOf<ExperienceEntry?>(null) }
    var editingEdu by remember { mutableStateOf<EducationEntry?>(null) }
    var editingAward by remember { mutableStateOf<AwardEntry?>(null) }

    LaunchedEffect(p != null) {
        val me = p ?: return@LaunchedEffect
        results = AppGraph.content.getUserAchievements(uid)
        pending = AppGraph.people.pendingRecommendations(uid).size
        AppGraph.people.syncPublicStats(uid, me)
    }

    Screen(
        back = "Profile", tabBar = false, navTitle = "Edit profile", gap = 20.dp,
        navRight = { Capsule("Preview", { nav.go(PublicProfileRoute(uid, preview = true)) }, surface = true) },
    ) {
        if (p == null) { Spinner(); return@Screen }
        Photos(p)

        // ---- strength ----
        val strength = profileStrength(p)
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row {
                Text("Profile strength · ${strength.pct}%", style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = c.label, modifier = Modifier.weight(1f))
                Text(strength.label, style = Type.footnote, color = c.label2)
            }
            Box(Modifier.fillMaxWidth().height(6.dp).clip(CircleShape).background(c.fillSoft)) {
                Box(Modifier.fillMaxWidth(strength.pct / 100f).height(6.dp).clip(CircleShape).background(c.tint))
            }
            strength.next?.let { Text("Next: $it.", style = Type.footnote, color = c.label2) }
        }

        // ---- intro ----
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            HeaderWithLink("Intro", "Edit") { sheet = Sheet.Intro }
            val press = rememberPress()
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).tap(press) { sheet = Sheet.Intro }.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(p.name, style = Type.headline, color = c.label)
                Text(p.headline?.ifBlank { null } ?: "Add a headline", style = Type.subhead, color = if (p.headline.isNullOrBlank()) c.tint else c.label)
                listOf(listOf(p.city, p.country).filter { !it.isNullOrBlank() }.joinToString(", "), p.nationality.orEmpty())
                    .filter { it.isNotBlank() }.joinToString(" · ").ifEmpty { null }?.let { Text(it, style = Type.footnote, color = c.label2) }
                Text(p.bio?.ifBlank { null } ?: "Write a short bio", style = Type.subhead, color = if (p.bio.isNullOrBlank()) c.tint else c.label2, maxLines = 4)
            }
        }

        // ---- open to invitations ----
        Section(footer = "Shows a badge on your public profile.") {
            item {
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Open to delegate & chair invitations", style = Type.bodyMedium, color = c.label, modifier = Modifier.weight(1f))
                    Toggle(p.openToWork, { on -> scope.launch { saveMine(mapOf("openToWork" to on), alerts) } }, "Open to invitations")
                }
            }
            if (p.openToWork) cell("Open to", value = p.openToRoles?.ifBlank { null } ?: "Add", onClick = { sheet = Sheet.OpenTo })
        }

        // ---- experience ----
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            HeaderWithLink("MUN experience", "Add") { editingExp = null; sheet = Sheet.Experience }
            Section {
                if (p.experience.isEmpty()) cell("Add MUN experience", tinted = true, onClick = { editingExp = null; sheet = Sheet.Experience })
                p.experience.forEach { ex ->
                    cell(
                        ex.roleTitle.ifBlank { ex.org }, inset = 58.dp,
                        subtitle = listOfNotNull(ex.org.ifBlank { null }, listOfNotNull(ex.startDate.ifBlank { null }, if (ex.current) "Present" else ex.endDate?.ifBlank { null }).joinToString(" – ").ifEmpty { null }).joinToString(" · "),
                        leading = { IconTile(SystemColors.navy, Icons.gavel) },
                        onClick = { editingExp = ex; sheet = Sheet.Experience },
                    )
                }
            }
        }

        // ---- education ----
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            HeaderWithLink("Education", "Add") { editingEdu = null; sheet = Sheet.Education }
            Section(footer = if (p.education.isEmpty()) "Add your school or university: +10% profile strength." else null) {
                if (p.education.isEmpty()) cell("Add education", tinted = true, onClick = { editingEdu = null; sheet = Sheet.Education })
                p.education.forEach { ed ->
                    cell(
                        ed.school, inset = 58.dp,
                        subtitle = listOfNotNull(listOfNotNull(ed.degree?.ifBlank { null }, ed.field?.ifBlank { null }).joinToString(", ").ifEmpty { null },
                            listOfNotNull(ed.startYear?.ifBlank { null }, ed.endYear?.ifBlank { null }).joinToString("–").ifEmpty { null }).joinToString(" · "),
                        leading = { IconTile(SystemColors.green, Icons.book) },
                        onClick = { editingEdu = ed; sheet = Sheet.Education },
                    )
                }
            }
        }

        // ---- awards: conference results (fixed) and your own ----
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            HeaderWithLink("Awards", "Add") { editingAward = null; sheet = Sheet.Award }
            Section(footer = "Awards your chairs give you appear automatically and can't be edited.") {
                if (results.isEmpty() && p.awards.isEmpty()) cell("Add an award", tinted = true, onClick = { editingAward = null; sheet = Sheet.Award })
                results.forEach { r ->
                    cell("${awardLabel(r.awardType)} — ${r.committeeName}", subtitle = "MUN result", inset = 58.dp,
                        leading = { IconTile(SystemColors.gold, Icons.trophy) }, trailing = { Chip("Verified", Tone.Tint) })
                }
                p.awards.forEach { a ->
                    cell(a.title, subtitle = listOfNotNull(a.issuer?.ifBlank { null }, a.date?.ifBlank { null }, "added by you").joinToString(" · "), inset = 58.dp,
                        leading = { IconTile(SystemColors.gold, Icons.trophy) }, onClick = { editingAward = a; sheet = Sheet.Award })
                }
            }
        }

        // ---- skills & interests ----
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            HeaderWithLink("Skills & interests", "Edit") { sheet = Sheet.Skills }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (p.skills.isEmpty() && p.interests.isEmpty()) TextLink("Add skills and interests", { sheet = Sheet.Skills })
                if (p.skills.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { p.skills.forEach { Chip(it, Tone.Tint) } }
                if (p.interests.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { p.interests.forEach { Chip(it) } }
            }
        }

        // ---- MUN stats visibility (web Privacy → MUN Stats) ----
        Section(footer = "Your conferences, blogs and awards counts on your public profile.") {
            item {
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Show MUN stats publicly", style = Type.bodyMedium, color = c.label, modifier = Modifier.weight(1f))
                    Toggle(p.privacySettings?.showStats == true, { on -> scope.launch { saveMine(mapOf("privacySettings.showStats" to on), alerts) } }, "Show MUN stats publicly")
                }
            }
        }

        Section {
            cell("Recommendations", leading = { IconTile(SystemColors.blue, Icons.people) }, inset = 58.dp,
                trailing = if (pending > 0) ({ Chip("$pending waiting", Tone.Warning) }) else null, onClick = { nav.go(MyRecommendationsRoute) })
            cell("Contact & social", leading = { IconTile(SystemColors.teal, Icons.mail) }, inset = 58.dp, onClick = { sheet = Sheet.Contact })
            cell("Account details", subtitle = "Personal, professional and billing", leading = { IconTile(SystemColors.gray, Icons.profile) }, inset = 58.dp, onClick = { nav.go(AccountDetailsRoute) })
        }
    }

    if (p != null) {
        IntroSheet(sheet == Sheet.Intro, p) { sheet = null }
        OpenToSheet(sheet == Sheet.OpenTo, p) { sheet = null }
        ExperienceSheet(sheet == Sheet.Experience, p, editingExp) { sheet = null }
        EducationSheet(sheet == Sheet.Education, p, editingEdu) { sheet = null }
        AwardSheet(sheet == Sheet.Award, p, editingAward) { sheet = null }
        SkillsSheet(sheet == Sheet.Skills, p) { sheet = null }
        ContactSheet(sheet == Sheet.Contact, p) { sheet = null }
    }
}

// ---- cover and photo ---------------------------------------------------------------------------

@Composable
private fun Photos(p: PublicProfile) {
    val c = palette
    val context = LocalContext.current
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf<String?>(null) }

    // The web's limits: photo 5 MB, cover 8 MB; scaled on the phone so a camera photo fits.
    fun upload(kind: String, uri: Uri?) {
        if (uri == null) return
        busy = kind
        scope.launch {
            runCatching {
                val bytes = prepareImage(context, uri, if (kind == "photoURL") 800 else 1600)
                val url = Api.uploadImage(bytes)
                saveMine(mapOf(kind to url), alerts)
            }.onFailure { alerts.show("Upload failed", it.message ?: "Try another image.") }
            busy = null
        }
    }
    val pickPhoto = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { upload("photoURL", it) }
    val pickCover = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { upload("coverURL", it) }
    val image = PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)

    Box(Modifier.fillMaxWidth().height(170.dp)) {
        Box(Modifier.fillMaxWidth().height(120.dp).clip(RoundedCornerShape(Radius.cell)).background(SystemColors.navy)) {
            p.coverURL?.ifBlank { null }?.let { RemoteImage(it, Modifier.fillMaxSize(), "Cover image") }
            CameraButton(if (busy == "coverURL") "…" else null, "Change cover", Modifier.align(Alignment.BottomEnd).padding(10.dp)) { pickCover.launch(image) }
        }
        Box(Modifier.align(Alignment.BottomStart).padding(start = 16.dp)) {
            Box(Modifier.size(96.dp).clip(CircleShape).background(c.bg).padding(4.dp)) { PersonAvatar(p.name, size = 88.dp, seed = p.id, photo = p.photoURL) }
            CameraButton(if (busy == "photoURL") "…" else null, "Change photo", Modifier.align(Alignment.BottomEnd)) { pickPhoto.launch(image) }
        }
    }
}

@Composable
private fun CameraButton(busyText: String?, label: String, modifier: Modifier, onClick: () -> Unit) {
    val c = palette
    val press = rememberPress()
    Box(
        modifier.size(34.dp).clip(CircleShape).background(c.tabBar).tap(press, enabled = busyText == null, label = label, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (busyText != null) Text(busyText, fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = c.label)
        else SfIcon(Icons.camera, c.label, size = 18.dp)
    }
}

// ---- sheets ------------------------------------------------------------------------------------

/** A form over the editor: Cancel, a title, Save (or Add), the fields, an optional Delete. */
@Composable
private fun FormSheet(
    visible: Boolean, title: String, action: String, onClose: () -> Unit, canSave: Boolean, onSave: suspend () -> Boolean,
    onDelete: (suspend () -> Boolean)? = null, content: @Composable () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    fun run(block: suspend () -> Boolean) {
        if (busy) return
        busy = true
        scope.launch { if (block()) onClose(); busy = false }
    }
    PageSheet(visible, onClose) {
        SheetHeader(title, leading = "Cancel", onLeading = onClose, trailing = action, onTrailing = { run(onSave) }, trailingEnabled = canSave && !busy)
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            content()
            if (onDelete != null) MunButton("Delete", { run(onDelete) }, variant = ButtonVariant.Plain, destructive = true, height = 44.dp, enabled = !busy)
        }
    }
}

@Composable
private fun IntroSheet(visible: Boolean, p: PublicProfile, onClose: () -> Unit) {
    val alerts = LocalAlerts.current
    var first by remember(visible) { mutableStateOf(p.firstName.orEmpty()) }
    var last by remember(visible) { mutableStateOf(p.lastName.orEmpty()) }
    var headline by remember(visible) { mutableStateOf(p.headline.orEmpty()) }
    var city by remember(visible) { mutableStateOf(p.city.orEmpty()) }
    var country by remember(visible) { mutableStateOf(p.country.orEmpty()) }
    var nationality by remember(visible) { mutableStateOf(p.nationality.orEmpty()) }
    var bio by remember(visible) { mutableStateOf(p.bio.orEmpty()) }
    FormSheet(visible, "Intro", "Save", onClose, first.isNotBlank() && last.isNotBlank(), {
        saveMine(mapOf("firstName" to first.trim(), "lastName" to last.trim(), "headline" to headline.trim(), "city" to city.trim(),
            "country" to country.trim(), "nationality" to nationality.trim(), "bio" to bio.trim()), alerts)
    }) {
        Section {
            item { Field("First name", first, { first = it }, "Required", com.munpro.app.ui.kit.FieldKind.GivenName) }
            item { Field("Last name", last, { last = it }, "Required", com.munpro.app.ui.kit.FieldKind.FamilyName) }
            item { Field("Headline", headline, { headline = it }, "Delegate · aspiring chair") }
        }
        Section {
            item { Field("City", city, { city = it }, "Dhaka") }
            item { Field("Country", country, { country = it }, "Bangladesh") }
            item { Field("Nationality", nationality, { nationality = it }, "Bangladeshi") }
        }
        Essay("Bio · Markdown works", bio, { bio = it }, "A few lines about you and your MUN journey", maxLength = 2000)
    }
}

@Composable
private fun OpenToSheet(visible: Boolean, p: PublicProfile, onClose: () -> Unit) {
    val alerts = LocalAlerts.current
    var roles by remember(visible) { mutableStateOf(p.openToRoles.orEmpty()) }
    FormSheet(visible, "Open to", "Save", onClose, true, { saveMine(mapOf("openToRoles" to roles.trim()), alerts) }) {
        Section(footer = "What you're open to: UNSC, DISEC, Crisis, chairing…") {
            item { Field("Open to", roles, { roles = it }, "Chair, Director") }
        }
    }
}

private fun newId() = UUID.randomUUID().toString()

@Composable
private fun ExperienceSheet(visible: Boolean, p: PublicProfile, entry: ExperienceEntry?, onClose: () -> Unit) {
    val c = palette
    val alerts = LocalAlerts.current
    var role by remember(visible) { mutableStateOf(entry?.roleTitle.orEmpty()) }
    var org by remember(visible) { mutableStateOf(entry?.org.orEmpty()) }
    var location by remember(visible) { mutableStateOf(entry?.location.orEmpty()) }
    var start by remember(visible) { mutableStateOf(entry?.startDate.orEmpty()) }
    var end by remember(visible) { mutableStateOf(entry?.endDate.orEmpty()) }
    var current by remember(visible) { mutableStateOf(entry?.current == true) }
    var desc by remember(visible) { mutableStateOf(entry?.description.orEmpty()) }
    fun list(next: ExperienceEntry?) = (p.experience.filter { it.id != entry?.id } + listOfNotNull(next)).let { l ->
        // Keep the edited entry in its place.
        if (entry != null && next != null) p.experience.map { if (it.id == entry.id) next else it } else l
    }
    fun asMaps(l: List<ExperienceEntry>) = l.map { e ->
        buildMap<String, Any> {
            put("id", e.id); put("org", e.org); put("roleTitle", e.roleTitle); put("startDate", e.startDate)
            e.orgShort?.let { put("orgShort", it) }; e.location?.ifBlank { null }?.let { put("location", it) }
            if (!e.current) e.endDate?.ifBlank { null }?.let { put("endDate", it) }
            if (e.current) put("current", true)
            e.description?.ifBlank { null }?.let { put("description", it) }
        }
    }
    FormSheet(
        visible, "Experience", if (entry == null) "Add" else "Save", onClose, role.isNotBlank() || org.isNotBlank(),
        onSave = {
            val next = ExperienceEntry(entry?.id ?: newId(), org.trim(), entry?.orgShort, role.trim(), location.trim(), start.trim(), end.trim(), current, desc.trim())
            saveMine(mapOf("experience" to asMaps(list(next))), alerts)
        },
        onDelete = entry?.let { { saveMine(mapOf("experience" to asMaps(list(null))), alerts) } },
    ) {
        Section {
            item { Field("Role", role, { role = it }, "Head Delegate") }
            item { Field("Conference", org, { org = it }, "Screens Model UN 2027") }
            item { Field("Location", location, { location = it }, "Dhaka") }
        }
        Section {
            item { Field("Start", start, { start = it }, "Oct 2024") }
            if (!current) item { Field("End", end, { end = it }, "Dec 2024") }
            item {
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("I currently hold this role", style = Type.bodyMedium, color = c.label, modifier = Modifier.weight(1f))
                    Toggle(current, { current = it }, "I currently hold this role")
                }
            }
        }
        Essay("Description", desc, { desc = it }, "What you did in this role…", maxLength = 1000)
    }
}

@Composable
private fun EducationSheet(visible: Boolean, p: PublicProfile, entry: EducationEntry?, onClose: () -> Unit) {
    val alerts = LocalAlerts.current
    var school by remember(visible) { mutableStateOf(entry?.school.orEmpty()) }
    var degree by remember(visible) { mutableStateOf(entry?.degree.orEmpty()) }
    var field by remember(visible) { mutableStateOf(entry?.field.orEmpty()) }
    var start by remember(visible) { mutableStateOf(entry?.startYear.orEmpty()) }
    var end by remember(visible) { mutableStateOf(entry?.endYear.orEmpty()) }
    var activities by remember(visible) { mutableStateOf(entry?.activities.orEmpty()) }
    fun asMaps(l: List<EducationEntry>) = l.map { e ->
        buildMap<String, Any> {
            put("id", e.id); put("school", e.school)
            e.degree?.ifBlank { null }?.let { put("degree", it) }; e.field?.ifBlank { null }?.let { put("field", it) }
            e.startYear?.ifBlank { null }?.let { put("startYear", it) }; e.endYear?.ifBlank { null }?.let { put("endYear", it) }
            e.activities?.ifBlank { null }?.let { put("activities", it) }
        }
    }
    FormSheet(
        visible, "Education", if (entry == null) "Add" else "Save", onClose, school.isNotBlank(),
        onSave = {
            val next = EducationEntry(entry?.id ?: newId(), school.trim(), degree.trim(), field.trim(), start.trim(), end.trim(), activities.trim())
            saveMine(mapOf("education" to asMaps(if (entry == null) p.education + next else p.education.map { if (it.id == entry.id) next else it })), alerts)
        },
        onDelete = entry?.let { { saveMine(mapOf("education" to asMaps(p.education.filter { it.id != entry.id })), alerts) } },
    ) {
        Section {
            item { Field("School", school, { school = it }, "University name") }
            item { Field("Degree", degree, { degree = it }, "BSS") }
            item { Field("Field", field, { field = it }, "International Relations") }
        }
        Section {
            item { Field("Start year", start, { start = it.filter(Char::isDigit).take(4) }, "2025", com.munpro.app.ui.kit.FieldKind.Number) }
            item { Field("End year", end, { end = it.filter(Char::isDigit).take(4) }, "2029", com.munpro.app.ui.kit.FieldKind.Number) }
            item { Field("Activities", activities, { activities = it }, "MUN Society, Debate Club") }
        }
    }
}

@Composable
private fun AwardSheet(visible: Boolean, p: PublicProfile, entry: AwardEntry?, onClose: () -> Unit) {
    val alerts = LocalAlerts.current
    var title by remember(visible) { mutableStateOf(entry?.title.orEmpty()) }
    var issuer by remember(visible) { mutableStateOf(entry?.issuer.orEmpty()) }
    var date by remember(visible) { mutableStateOf(entry?.date.orEmpty()) }
    fun asMaps(l: List<AwardEntry>) = l.map { e ->
        buildMap<String, Any> {
            put("id", e.id); put("title", e.title)
            e.issuer?.ifBlank { null }?.let { put("issuer", it) }; e.date?.ifBlank { null }?.let { put("date", it) }
        }
    }
    FormSheet(
        visible, "Award", if (entry == null) "Add" else "Save", onClose, title.isNotBlank(),
        onSave = {
            val next = AwardEntry(entry?.id ?: newId(), title.trim(), issuer.trim(), date.trim())
            saveMine(mapOf("awards" to asMaps(if (entry == null) p.awards + next else p.awards.map { if (it.id == entry.id) next else it })), alerts)
        },
        onDelete = entry?.let { { saveMine(mapOf("awards" to asMaps(p.awards.filter { it.id != entry.id })), alerts) } },
    ) {
        Section(footer = "Shown without the Verified badge. Awards from conferences on MUN Pilot are added for you.") {
            item { Field("Title", title, { title = it }, "Best Delegate — UNSC") }
            item { Field("Issuer", issuer, { issuer = it }, "BUP MUN") }
            item { Field("Date", date, { date = it }, "Jan 2026") }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SkillsSheet(visible: Boolean, p: PublicProfile, onClose: () -> Unit) {
    val alerts = LocalAlerts.current
    var skills by remember(visible) { mutableStateOf(p.skills) }
    var interests by remember(visible) { mutableStateOf(p.interests) }
    FormSheet(visible, "Skills & interests", "Save", onClose, true, {
        saveMine(mapOf("skills" to skills, "interests" to interests), alerts)
    }) {
        TagEditor("Skills", skills, { skills = it }, "Add a skill", "Endorsements stay with a skill while you keep it.")
        TagEditor("Interests", interests, { interests = it }, "Add an interest", null)
    }
}

/** Chips you can remove, and a field that adds one when you press Done. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TagEditor(label: String, tags: List<String>, onChange: (List<String>) -> Unit, placeholder: String, footer: String?) {
    val c = palette
    var draft by remember { mutableStateOf("") }
    fun add() {
        val t = draft.trim()
        if (t.isNotEmpty() && tags.none { it.equals(t, ignoreCase = true) }) onChange(tags + t)
        draft = ""
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        com.munpro.app.ui.kit.SectionHeader(label)
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (tags.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                tags.forEach { t ->
                    val press = rememberPress()
                    Row(
                        Modifier.clip(CircleShape).background(c.tintSoft).tap(press, label = "Remove $t") { onChange(tags - t) }.padding(start = 12.dp, end = 8.dp, top = 6.dp, bottom = 6.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(t, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = c.tint)
                        SfIcon(Icons.close, c.tint, size = 12.dp)
                    }
                }
            }
            com.munpro.app.ui.kit.PlainInput(
                draft, { draft = it }, placeholder, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(imeAction = androidx.compose.ui.text.input.ImeAction.Done),
                keyboardActions = androidx.compose.foundation.text.KeyboardActions(onDone = { add() }),
            )
            if (draft.isNotBlank()) TextLink("Add \"${draft.trim()}\"", ::add, style = Type.subhead.copy(fontWeight = FontWeight.SemiBold))
        }
        if (footer != null) SectionFooter(footer)
    }
}

@Composable
private fun ContactSheet(visible: Boolean, p: PublicProfile, onClose: () -> Unit) {
    val c = palette
    val alerts = LocalAlerts.current
    val contact by AppGraph.auth.contact.collectAsStateWithLifecycle()
    var phone by remember(visible) { mutableStateOf(contact?.phoneNumber.orEmpty()) }
    var ig by remember(visible) { mutableStateOf(p.instagram.orEmpty()) }
    var li by remember(visible) { mutableStateOf(p.linkedin.orEmpty()) }
    var tt by remember(visible) { mutableStateOf(p.tiktok.orEmpty()) }
    var onlyConnections by remember(visible) { mutableStateOf(p.privacySettings?.contactVisibility == "connections") }
    FormSheet(visible, "Contact & social", "Save", onClose, true, {
        // Phone goes to users/{uid}/private/contact; who may read it is the profile's setting.
        val ok = runCatching { AppGraph.auth.saveContact(phoneNumber = phone) }.isSuccess
        if (!ok) { alerts.show("Didn't save", "Check your connection and try again."); false }
        else saveMine(mapOf(
            "instagram" to ig.trim(), "linkedin" to li.trim(), "tiktok" to tt.trim(),
            "privacySettings.contactVisibility" to if (onlyConnections) "connections" else "everyone",
        ), alerts)
    }) {
        Section(footer = if (onlyConnections) "Only people you're connected to see your email and phone. Organizers of conferences you apply to always see them on your application."
            else "Every signed-in member can see your email and phone on your profile.") {
            cell("Email", value = AppGraph.auth.user?.email.orEmpty())
            item { Field("Phone", phone, { phone = it }, "Optional", com.munpro.app.ui.kit.FieldKind.Phone) }
            item {
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Show email & phone only to my connections", style = Type.bodyMedium, color = c.label, modifier = Modifier.weight(1f))
                    Toggle(onlyConnections, { onlyConnections = it }, "Show email and phone only to my connections")
                }
            }
        }
        Section {
            item { Field("Instagram", ig, { ig = it }, "@handle") }
            item { Field("LinkedIn", li, { li = it }, "linkedin.com/in/…") }
            item { Field("TikTok", tt, { tt = it }, "@handle") }
        }
    }
}
