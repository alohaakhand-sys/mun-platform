package com.munpro.app.ui.profile

// Profile and its pages (RN app/(tabs)/profile.tsx, app/account/* + the mockup's Profile set):
// who you are on the platform, your record in three numbers, your conferences, awards, payments
// and settings.

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.BuildConfig
import com.munpro.app.data.Api
import com.munpro.app.data.AuthState
import com.munpro.app.domain.DelegateResult
import com.munpro.app.domain.committeeOf
import com.munpro.app.domain.countryName
import com.munpro.app.domain.formatDueLabel
import com.munpro.app.domain.formatFee
import com.munpro.app.domain.getPaymentGate
import com.munpro.app.domain.longDate
import com.munpro.app.data.pickCurrent
import com.munpro.app.nav.AchievementsRoute
import com.munpro.app.nav.ConferenceRoute
import com.munpro.app.nav.MyConferencesRoute
import com.munpro.app.nav.PaymentsRoute
import com.munpro.app.nav.SettingsRoute
import com.munpro.app.notify.Notifier
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.conference.initials
import com.munpro.app.ui.kit.AlertButton
import com.munpro.app.ui.kit.AppearanceMode
import com.munpro.app.ui.kit.Capsule
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Field
import com.munpro.app.ui.kit.FieldKind
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.SfIcon
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.IconTile
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.Inter
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.Loading
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.Segmented
import com.munpro.app.ui.kit.SystemColors
import com.munpro.app.ui.kit.Toggle
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun rememberAwards(): List<DelegateResult>? {
    val uid = AppGraph.auth.user?.uid
    // Awards change only when a conference publishes results: the phone's copy for a few hours.
    return com.munpro.app.data.rememberCached(uid?.let { "awards:$it" }, kotlinx.serialization.builtins.ListSerializer(DelegateResult.serializer()), maxAgeMs = com.munpro.app.data.Fresh.LONG) {
        AppGraph.content.getUserAchievements(uid!!)
    }.let { if (it.has) it.data else null }
}

/**
 * The Profile tab (board A1.10): who you are, how complete your profile is (the web's strength
 * bar), then your pages: Documents, Blogs and the rest. Role hubs (Chair hub, Organize, EB, Observer) and the
 * documents hub join as their boards land; until then the committee consoles live in Conferences.
 */
@Composable
fun ProfileTab() {
    val c = palette
    val nav = LocalNav.current
    val auth by AppGraph.auth.state.collectAsStateWithLifecycle()
    val user = (auth as? AuthState.SignedIn)?.user
    val profile = (auth as? AuthState.SignedIn)?.profile
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()
    val name = profile?.fullName?.ifEmpty { null } ?: user?.email.orEmpty()
    val strength = com.munpro.app.domain.profileStrength(profile)
    val due = confs.conferences.orEmpty().count { getPaymentGate(it.app, it.event).status == "due" }

    Screen(title = "Profile", trailing = {
        Box(Modifier.padding(bottom = 4.dp)) { com.munpro.app.ui.kit.RoundButton(Icons.sliders, "Settings", { nav.go(SettingsRoute) }) }
    }) {
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Box(Modifier.size(72.dp).clip(CircleShape).background(c.tint), contentAlignment = Alignment.Center) {
                    Text(initials(name), fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 24.sp, color = c.onTint)
                    profile?.photoURL?.ifBlank { null }?.let { com.munpro.app.ui.kit.RemoteImage(it, Modifier.matchParentSize(), "Your photo") }
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(name, style = Type.title2.copy(fontSize = 20.sp, lineHeight = 25.sp), color = c.label, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                    Text(
                        listOfNotNull(roleName(profile?.role), profile?.headline?.ifBlank { null }).joinToString(" · "),
                        style = Type.footnote, color = c.label2, maxLines = 2, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                    )
                    Row(Modifier.padding(top = 2.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        com.munpro.app.ui.kit.TextLink("Edit profile", { nav.go(com.munpro.app.nav.EditProfileRoute) }, style = Type.subhead.copy(fontWeight = FontWeight.SemiBold, fontSize = 14.sp))
                        user?.uid?.let { uid -> com.munpro.app.ui.kit.TextLink("View public profile", { nav.go(com.munpro.app.nav.PublicProfileRoute(uid, preview = true)) }, style = Type.subhead.copy(fontWeight = FontWeight.SemiBold, fontSize = 14.sp)) }
                    }
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row {
                    Text("Profile strength · ${strength.pct}%", style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = c.label, modifier = Modifier.weight(1f))
                    Text(strength.label, style = Type.footnote, color = c.label2)
                }
                Box(Modifier.fillMaxWidth().height(6.dp).clip(CircleShape).background(c.fillSoft)) {
                    Box(Modifier.fillMaxWidth(strength.pct / 100f).height(6.dp).clip(CircleShape).background(c.tint))
                }
                strength.next?.let { Text("Next: $it.", style = Type.footnote, color = c.label2) }
            }
        }

        val update by AppGraph.updates.state.collectAsStateWithLifecycle()
        val daisSeats by AppGraph.messages.seats.collectAsStateWithLifecycle()
        val onDais = daisSeats.orEmpty().any { it.dais }
        val staffSeats = com.munpro.app.ui.chair.rememberStaffSeats().data.orEmpty()
        val onBoard = staffSeats.any { com.munpro.app.domain.isExecBoardRole(it.role) }
        val observing = staffSeats.any { com.munpro.app.data.isObserverSeatRole(it.role) }
        // Owners of at least one event (the Conferences tab's Organize list, from its cache).
        val organizes = AppGraph.auth.user?.uid?.let { uid ->
            com.munpro.app.data.rememberCached("organize:$uid", kotlinx.serialization.builtins.ListSerializer(com.munpro.app.data.OrganizedEvent.serializer()), com.munpro.app.data.Fresh.MEDIUM) { AppGraph.gate.organized(uid) }.data
        }.orEmpty().any { !it.coOrganizer }
        Section {
            cell("Achievements", leading = { IconTile(SystemColors.gold, Icons.star) }, inset = 58.dp, onClick = { nav.go(AchievementsRoute) })
            if (onDais) cell("Chair hub", subtitle = "Marking, motion log and position papers", leading = { IconTile(SystemColors.green, Icons.gavel) }, inset = 58.dp, onClick = { nav.go(com.munpro.app.nav.ChairHubRoute) })
            if (onBoard) cell("Executive Board", subtitle = "Committees in your scope, their chairs and grading", leading = { IconTile(SystemColors.indigo, Icons.gavel) }, inset = 58.dp, onClick = { nav.go(com.munpro.app.nav.ExecBoardRoute) })
            if (observing) cell("Read-only access", subtitle = "Conferences you observe", leading = { IconTile(SystemColors.teal, Icons.eye) }, inset = 58.dp, onClick = { nav.go(com.munpro.app.nav.ObserverRoute) })
            cell("Documents", subtitle = "Papers, guides and rules from every conference", leading = { IconTile(SystemColors.orange, Icons.folder) }, inset = 58.dp, onClick = { nav.go(com.munpro.app.nav.DocumentsHubRoute) })
            cell("Blogs", subtitle = "The handbook, and what you write", leading = { IconTile(SystemColors.purple, Icons.book) }, inset = 58.dp, onClick = { nav.go(com.munpro.app.nav.BlogsRoute) })
            if (organizes) {
                cell("Wallet & payouts", subtitle = "Ticket revenue across your events", leading = { IconTile(SystemColors.green, Icons.card) }, inset = 58.dp, onClick = { nav.go(com.munpro.app.nav.WalletRoute) })
                cell("MUN Pilot Pro", subtitle = "Upgrade an event", leading = { IconTile(SystemColors.gold, Icons.star) }, inset = 58.dp, onClick = { nav.go(com.munpro.app.nav.ProRoute) })
            }
            cell(
                "Payments", leading = { IconTile(SystemColors.blue, Icons.card) }, inset = 58.dp, onClick = { nav.go(PaymentsRoute) },
                trailing = if (due > 0) ({ com.munpro.app.ui.kit.Chip("$due due", com.munpro.app.ui.kit.Tone.Warning) }) else null,
            )
            cell(
                "Settings", leading = { IconTile(SystemColors.gray, Icons.gear) }, inset = 58.dp, onClick = { nav.go(SettingsRoute) },
                trailing = if (update is com.munpro.app.data.UpdateState.Available || update is com.munpro.app.data.UpdateState.Ready) ({ StatusChip("Update", on = true) }) else null,
            )
            if (com.munpro.app.ui.admin.isAppAdmin(AppGraph.auth.profile?.role)) {
                cell("Live Sessions", subtitle = "App Admin: every running sitting", leading = { IconTile(SystemColors.red, Icons.live) }, inset = 58.dp,
                    onClick = { nav.go(com.munpro.app.nav.AdminLiveRoute) })
            }
        }

        val contact by AppGraph.auth.contact.collectAsStateWithLifecycle()
        Section(footer = "MUN Pilot ${BuildConfig.VERSION_NAME}") {
            cell("Email", value = user?.email.orEmpty())
            cell("Date of birth", value = profile?.dob?.let { runCatching { longDate(LocalDate.parse(it)) }.getOrNull() } ?: "Not set", onClick = { nav.go(com.munpro.app.nav.AccountDetailsRoute) })
            cell("Phone", value = contact?.phoneNumber?.ifEmpty { null } ?: "Not set", onClick = { nav.go(com.munpro.app.nav.EditProfileRoute) })
        }
    }
}

private fun roleName(role: String?): String = when (role?.lowercase()) {
    null, "", "user" -> "Delegate"
    "organizer" -> "Organiser"
    "admin" -> "App Admin"
    else -> role.replaceFirstChar { it.uppercase() }
}

/** "On" / "Off" in a sign-in method row. */
@Composable
private fun StatusChip(text: String, on: Boolean) {
    val c = palette
    Text(
        text, style = Type.caption.copy(fontWeight = FontWeight.SemiBold), color = if (on) c.tint else c.label2,
        modifier = Modifier.clip(CircleShape).background(if (on) c.tintSoft else c.fill).padding(horizontal = 9.dp, vertical = 4.dp),
    )
}

@Composable
fun MyConferencesScreen() {
    val nav = LocalNav.current
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()
    val list = confs.conferences
    Screen(back = "Profile", tabBar = false, title = "My conferences", onRefresh = { AppGraph.conferences.reload() }) {
        when {
            list == null -> Loading()
            list.isEmpty() -> Empty("No conferences yet", "Conferences you apply to appear here, with where each application stands.")
            else -> {
                val accepted = list.count { it.app.status == "approved" }
                Section(footer = "$accepted of ${list.size} accepted.") {
                    list.forEach { x ->
                        cell(
                            x.event.title,
                            subtitle = listOfNotNull(committeeOf(x.app).ifEmpty { null }, x.app.assignedCountry?.let(::countryName)).joinToString(", ").ifEmpty { x.app.role },
                            value = when (x.app.status) { "approved" -> "Accepted"; "rejected" -> "Not accepted"; "pending" -> "Under review"; else -> x.app.status.replaceFirstChar { it.uppercase() } },
                            onClick = { nav.go(ConferenceRoute(x.app.id)) },
                        )
                    }
                }
            }
        }
    }
}

// Award tier colours carry meaning (gold outranks green), like the web's achievements page.
private val AWARD = mapOf(
    "best_delegate" to ("Best Delegate" to SystemColors.gold),
    "outstanding" to ("Outstanding Delegate" to SystemColors.blue),
    "honorable" to ("Honourable Mention" to SystemColors.green),
    "verbal_mention" to ("Verbal Mention" to SystemColors.purple),
)

@Composable
fun AchievementsScreen() {
    val c = palette
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()
    val awards = rememberAwards()
    fun titleOf(eventId: String) = confs.conferences?.firstOrNull { it.app.eventId == eventId }?.event?.title.orEmpty()
    val history = confs.conferences.orEmpty().filter { it.app.status == "approved" }
    val current = pickCurrent(confs.conferences)

    Screen(back = "Profile", tabBar = false, title = "Achievements") {
        when {
            awards == null -> Loading()
            awards.isEmpty() -> Empty("No awards yet", "Awards your chairs approve appear here, with the conference and committee they came from.")
            else -> Section(header = "Awards") {
                awards.forEach { a ->
                    val (label, color) = AWARD[a.awardType] ?: (a.awardType to SystemColors.gray)
                    cell(
                        label,
                        subtitle = listOf(titleOf(a.eventId), listOfNotNull(a.committeeName.ifEmpty { null }, a.country?.let(::countryName)).joinToString(", ")).filter { it.isNotEmpty() }.joinToString(" · "),
                        inset = 62.dp,
                        leading = { Box(Modifier.size(34.dp).clip(CircleShape).background(color), contentAlignment = Alignment.Center) { Text("★", color = androidx.compose.ui.graphics.Color.White, fontSize = 16.sp) } },
                    )
                }
            }
        }
        if (history.isNotEmpty()) {
            Section(header = "Conferences") {
                history.forEach { x ->
                    cell(
                        x.event.title,
                        subtitle = listOfNotNull(committeeOf(x.app).ifEmpty { null }, x.app.assignedCountry?.let(::countryName)).joinToString(", "),
                        value = if (current?.app?.id == x.app.id) "Now" else null,
                    )
                }
            }
        }
    }
}

