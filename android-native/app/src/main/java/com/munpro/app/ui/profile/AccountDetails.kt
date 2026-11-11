package com.munpro.app.ui.profile

// Account details (board A3.10–A3.11; web dashboard/settings → Profile tab's Account, Personal,
// Professional and Billing cards, saved together with one Save), and the recommendations others
// wrote about you (A3.8; web RecommendationsSection, owner side: approve or hide).

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.munpro.app.AppGraph
import com.munpro.app.domain.PublicProfile
import com.munpro.app.domain.Recommendation
import com.munpro.app.domain.longDate
import com.munpro.app.ui.kit.Chip
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.Field
import com.munpro.app.ui.kit.FieldKind
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.PersonAvatar
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SectionHeader
import com.munpro.app.ui.kit.Segmented
import com.munpro.app.ui.kit.Spinner
import com.munpro.app.ui.kit.Tone
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import kotlinx.coroutines.launch
import java.time.LocalDate

@Composable
fun AccountDetailsScreen() {
    val p = rememberOwnProfile()
    Screen(back = "Edit profile", tabBar = false, title = "Account details", gap = 20.dp) {
        if (p == null) Spinner() else AccountForm(p)
    }
}

/** The web's form, one Save for all four cards. Empty values save as empty, as on the web. */
@Composable
private fun AccountForm(p: PublicProfile) {
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    var first by remember { mutableStateOf(p.firstName.orEmpty()) }
    var last by remember { mutableStateOf(p.lastName.orEmpty()) }
    var dob by remember { mutableStateOf(p.dob?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }) }
    var diet by remember { mutableStateOf(p.diet.orEmpty()) }
    var occupation by remember { mutableStateOf(p.occupation.orEmpty()) }
    var institution by remember { mutableStateOf(p.institution.orEmpty()) }
    var field by remember { mutableStateOf(p.fieldOfStudy.orEmpty()) }
    var invoice by remember { mutableStateOf(p.invoiceType.orEmpty()) }
    var street by remember { mutableStateOf(p.street.orEmpty()) }
    var city by remember { mutableStateOf(p.city.orEmpty()) }
    var postal by remember { mutableStateOf(p.postalCode.orEmpty()) }
    var state by remember { mutableStateOf(p.state.orEmpty()) }
    var country by remember { mutableStateOf(p.country.orEmpty()) }
    var picking by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var savedTick by remember { mutableIntStateOf(0) }

    val values = mapOf(
        "firstName" to first.trim(), "lastName" to last.trim(), "dob" to (dob?.toString() ?: p.dob.orEmpty()), "diet" to diet,
        "occupation" to occupation, "institution" to institution.trim(), "fieldOfStudy" to field.trim(),
        "invoiceType" to invoice, "street" to street.trim(), "city" to city.trim(), "postalCode" to postal.trim(),
        "state" to state.trim(), "country" to country.trim(),
    )
    val original = mapOf(
        "firstName" to p.firstName.orEmpty(), "lastName" to p.lastName.orEmpty(), "dob" to p.dob.orEmpty(), "diet" to p.diet.orEmpty(),
        "occupation" to p.occupation.orEmpty(), "institution" to p.institution.orEmpty(), "fieldOfStudy" to p.fieldOfStudy.orEmpty(),
        "invoiceType" to p.invoiceType.orEmpty(), "street" to p.street.orEmpty(), "city" to p.city.orEmpty(), "postalCode" to p.postalCode.orEmpty(),
        "state" to p.state.orEmpty(), "country" to p.country.orEmpty(),
    )
    val dirty = values != original
    fun filled(vararg v: String) = "${v.count { it.isNotBlank() }}/${v.size}"

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        val email = AppGraph.auth.user?.email.orEmpty()
        SectionHeader("Account · ${filled(first, last, email)}")
        Section(footer = "Email can't be changed here.") {
            item { Field("First name", first, { first = it }, "Required", FieldKind.GivenName) }
            item { Field("Last name", last, { last = it }, "Required", FieldKind.FamilyName) }
            cell("Email", value = email)
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SectionHeader("Personal · ${filled(dob?.toString().orEmpty(), diet)}")
        Section {
            cell("Date of birth", value = dob?.let(::longDate) ?: "Choose", onClick = { picking = true })
        }
        Choice("Dietary preference", listOf("none" to "None", "vegetarian" to "Veg", "vegan" to "Vegan", "halal" to "Halal", "kosher" to "Kosher"), diet) { diet = it }
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SectionHeader("Professional · ${filled(occupation, institution, field)}")
        Choice("Occupation", listOf("student" to "Student", "professional" to "Professional", "other" to "Other"), occupation) { occupation = it }
        Section {
            item { Field("Institution", institution, { institution = it }, "University of Dhaka") }
            item { Field("Field", field, { field = it }, "Computer Science") }
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SectionHeader("Billing · ${filled(invoice, street, city, postal, country)}")
        Choice("Invoice type", listOf("individual" to "Individual", "organization" to "Organization"), invoice) { invoice = it }
        Section(footer = "Used for invoices on paid events. City and country are also your profile location.") {
            item { Field("Street", street, { street = it }, "Street and number") }
            item { Field("City", city, { city = it }, "Dhaka") }
            item { Field("Postal code", postal, { postal = it }, "1205") }
            item { Field("State", state, { state = it }, "State / Province") }
            item { Field("Country", country, { country = it }, "Bangladesh") }
        }
    }
    MunButton(
        if (dirty) "Save" else if (savedTick > 0) "All changes saved" else "Save",
        {
            busy = true
            scope.launch {
                val uid = AppGraph.auth.user?.uid
                if (uid != null) runCatching { AppGraph.people.update(uid, values) }
                    .onSuccess { savedTick++ }
                    .onFailure { alerts.show("Didn't save", "Check your connection and try again.") }
                busy = false
            }
        },
        enabled = dirty && first.isNotBlank() && last.isNotBlank(), loading = busy,
    )
    if (picking) com.munpro.app.ui.auth.DobPicker(dob, { dob = it }, { picking = false })
}

/** A labelled segmented choice (the web's selects, which have three to five options). */
@Composable
private fun <T> Choice(label: String, options: List<Pair<T, String>>, value: T, onChange: (T) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, style = Type.footnote, color = palette.label2, modifier = Modifier.padding(horizontal = 16.dp))
        Segmented(options, value, onChange)
    }
}

// ---- recommendations about you (A3.8) ----------------------------------------------------------

@Composable
fun MyRecommendationsScreen() {
    val c = palette
    val alerts = LocalAlerts.current
    val scope = rememberCoroutineScope()
    val uid = AppGraph.auth.user?.uid.orEmpty()
    var pending by remember { mutableStateOf<List<Recommendation>?>(null) }
    var shown by remember { mutableStateOf<List<Recommendation>>(emptyList()) }
    var busy by remember { mutableStateOf<String?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    LaunchedEffect(uid, reload) {
        pending = AppGraph.people.pendingRecommendations(uid)
        shown = AppGraph.people.recommendationsTo(uid)
    }
    fun decide(r: Recommendation, approve: Boolean) {
        busy = r.id
        scope.launch {
            runCatching { AppGraph.people.decide(r.id, approve) }
                .onSuccess { reload++ }
                .onFailure { alerts.show("Didn't save", it.message) }
            busy = null
        }
    }
    Screen(back = "Edit profile", tabBar = false, title = "Recommendations", gap = 16.dp, onRefresh = { reload++ }) {
        val list = pending
        when {
            list == null -> Spinner()
            list.isEmpty() && shown.isEmpty() -> Empty("No recommendations yet", "When someone recommends you, it waits here for you to approve it.", icon = Icons.people)
            else -> {
                if (list.isNotEmpty()) {
                    SectionHeader("Waiting for you · ${list.size}")
                    list.forEach { r -> RecCard(r, { Chip("Pending", Tone.Warning) }) {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Pill("Hide", { decide(r, false) }, tone = Tone.Neutral, enabled = busy == null, modifier = Modifier.weight(1f))
                            Pill(if (busy == r.id) "…" else "Approve", { decide(r, true) }, filled = true, enabled = busy == null, modifier = Modifier.weight(1f))
                        }
                    } }
                }
                if (shown.isNotEmpty()) {
                    SectionHeader("On your profile · ${shown.size}")
                    shown.forEach { r -> RecCard(r, { Chip("Shown", Tone.Tint) }, null) }
                }
                com.munpro.app.ui.kit.SectionFooter("Nothing shows on your profile until you approve it.")
            }
        }
    }
}

@Composable
private fun RecCard(r: Recommendation, badge: @Composable () -> Unit, actions: (@Composable () -> Unit)?) {
    val c = palette
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            PersonAvatar(r.authorName, size = 40.dp, seed = r.authorUid, photo = r.authorPhotoURL)
            Column(Modifier.weight(1f)) {
                Text(r.authorName.ifEmpty { "MUN Pilot member" }, style = Type.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = c.label)
                (r.relationship?.ifBlank { null } ?: r.authorHeadline?.ifBlank { null })?.let { Text(it, style = Type.footnote, color = c.label2) }
            }
            badge()
        }
        Text(r.body, style = Type.subhead.copy(lineHeight = 21.sp), color = c.label)
        actions?.invoke()
    }
}
