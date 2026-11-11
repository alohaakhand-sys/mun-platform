package com.munpro.app.ui.settings

// Settings (board A6.7–A6.10; web dashboard/settings). Regrouped: Account (details, sign-in &
// security), Preferences (appearance, notifications, privacy), App (update, what's new, help).
// Notifications: the phone's own alerts plus the web's email preferences
// (users/{uid}.notificationPreferences). Privacy: the web's three switches and who sees your email
// and phone (privacySettings). Sign-in & security: change the password in the app (re-enter the
// current one, as the web does) and link Google.

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.data.Api
import com.munpro.app.data.UpdateState
import com.munpro.app.ui.profile.pending
import com.munpro.app.nav.AccountDetailsRoute
import com.munpro.app.nav.NotificationSettingsRoute
import com.munpro.app.nav.PrivacySettingsRoute
import com.munpro.app.nav.SecurityRoute
import com.munpro.app.nav.TAB_NETWORK
import com.munpro.app.notify.Notifier
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.kit.ActionSheet
import com.munpro.app.ui.kit.AlertButton
import com.munpro.app.ui.kit.AppearanceMode
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Field
import com.munpro.app.ui.kit.FieldKind
import com.munpro.app.ui.kit.IconTile
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.LocalAlerts
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SfIcon
import com.munpro.app.ui.kit.SheetRow
import com.munpro.app.ui.kit.Spinner
import com.munpro.app.ui.kit.SystemColors
import com.munpro.app.ui.kit.Toggle
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import com.munpro.app.data.toJsonElement
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.Serializable

/** "On" / "Off" beside a sign-in method. */
@Composable
private fun StatusChip(text: String, on: Boolean) {
    val c = palette
    Text(
        text, style = Type.caption.copy(fontWeight = FontWeight.SemiBold), color = if (on) c.tint else c.label2,
        modifier = Modifier.clip(CircleShape).background(if (on) c.tintSoft else c.fill).padding(horizontal = 9.dp, vertical = 4.dp),
    )
}

private fun appearanceLabel(m: AppearanceMode) = when (m) {
    AppearanceMode.System -> "Automatic"
    AppearanceMode.Light -> "Light"
    AppearanceMode.Dark -> "Dark"
}

// ---------------------------------------------------------------------------------------------
// A6.7 · Settings
// ---------------------------------------------------------------------------------------------

@Composable
fun SettingsScreen() {
    val c = palette
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val alerts = LocalAlerts.current
    val context = LocalContext.current
    val mode by AppGraph.appearance.collectAsStateWithLifecycle()
    val update by AppGraph.updates.state.collectAsStateWithLifecycle()
    var picking by remember { mutableStateOf(false) }

    Screen(back = "Profile", tabBar = false, title = "Settings") {
        Section(header = "Account") {
            cell("Account details", leading = { IconTile(SystemColors.blue, Icons.profile) }, inset = 58.dp, onClick = { nav.go(AccountDetailsRoute) })
            cell("Sign-in & security", leading = { IconTile(SystemColors.gray, Icons.key) }, inset = 58.dp, onClick = { nav.go(SecurityRoute) })
        }
        Section(header = "Preferences") {
            cell("Appearance", value = appearanceLabel(mode), leading = { IconTile(SystemColors.indigo, Icons.moon) }, inset = 58.dp, onClick = { picking = true })
            cell("Notifications", leading = { IconTile(SystemColors.red, Icons.bell) }, inset = 58.dp, onClick = { nav.go(NotificationSettingsRoute) })
            cell("Privacy", leading = { IconTile(SystemColors.green, Icons.lock) }, inset = 58.dp, onClick = { nav.go(PrivacySettingsRoute) })
        }
        Section(header = "App") {
            cell(
                "Software update", leading = { IconTile(SystemColors.gray, Icons.refresh) }, inset = 58.dp,
                value = when (update) {
                    is UpdateState.Available, is UpdateState.Ready -> null
                    is UpdateState.Downloading -> "Downloading…"
                    else -> AppGraph.updates.installedName
                },
                trailing = if (update is UpdateState.Available || update is UpdateState.Ready) ({ StatusChip("${update.pending?.versionName} available", on = true) }) else null,
                onClick = { nav.go(com.munpro.app.nav.UpdateRoute) },
            )
            cell("What's New", leading = { IconTile(SystemColors.purple, Icons.sparkle) }, inset = 58.dp, onClick = { nav.go(com.munpro.app.nav.WhatsNewRoute) })
            Api.site("/contact")?.let { url ->
                cell("Help & support", subtitle = "Contact the MUN Pilot team", leading = { IconTile(SystemColors.teal, Icons.info) }, inset = 58.dp,
                    onClick = { context.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url))) })
            }
        }
        Section {
            cell("Sign Out", destructive = true, chevron = false, onClick = {
                scope.launch { if (alerts.confirm("Sign out?", "Your saved copies on this phone are removed when you sign out.", "Sign Out", destructive = true)) AppGraph.auth.signOut() }
            })
            cell("Delete account", destructive = true, chevron = false, onClick = {
                alerts.show(
                    "Delete your account?",
                    "Account deletion isn't available in the app yet. Your applications, marks and messages belong to your conferences, so the organiser has to release them first. Contact the conference organiser or MUN Pilot support.",
                    AlertButton("OK", AlertButton.Style.Cancel),
                )
            })
        }
    }

    ActionSheet(picking, { picking = false }, title = "Appearance") {
        listOf(AppearanceMode.System, AppearanceMode.Light, AppearanceMode.Dark).forEach { m ->
            SheetRow(appearanceLabel(m), { AppGraph.setAppearance(m); picking = false }, selected = m == mode)
        }
    }
}

// ---------------------------------------------------------------------------------------------
// A6.8 · Notifications
// ---------------------------------------------------------------------------------------------

/** users/{uid}.notificationPreferences (web settings, Notifications tab): what gets emailed. */
@Serializable
private data class EmailPrefs(
    val emailOnApproval: Boolean? = null,
    val emailOnRejection: Boolean? = null,
    val emailOnNewEvent: Boolean? = null,
)

@Composable
fun NotificationSettingsScreen() {
    val c = palette
    val activity = LocalContext.current
    val scope = rememberCoroutineScope()
    val alerts = LocalAlerts.current
    val notifyUpdates by AppGraph.notifyUpdates.collectAsStateWithLifecycle()
    val notifyAlerts by AppGraph.notifyAlerts.collectAsStateWithLifecycle()
    val lockScreen by AppGraph.lockScreenFloor.collectAsStateWithLifecycle()
    val uid = AppGraph.auth.user?.uid
    var email by remember { mutableStateOf<EmailPrefs?>(null) }
    LaunchedEffect(uid) {
        if (uid == null) return@LaunchedEffect
        email = runCatching {
            com.google.firebase.firestore.FirebaseFirestore.getInstance().collection("users").document(uid).get(com.google.firebase.firestore.Source.DEFAULT).await()
                .get("notificationPreferences")?.let { com.munpro.app.data.decodeOrNull<EmailPrefs>(it.toJsonElement()) }
        }.getOrNull() ?: EmailPrefs()
    }

    // Re-read on return from Android's settings, where notifications may have been turned on.
    var notifyOn by remember { mutableStateOf(Notifier.enabled(activity)) }
    val lifecycle = androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
    androidx.compose.runtime.DisposableEffect(lifecycle) {
        val obs = androidx.lifecycle.LifecycleEventObserver { _, e -> if (e == androidx.lifecycle.Lifecycle.Event.ON_RESUME) notifyOn = Notifier.enabled(activity) }
        lifecycle.addObserver(obs)
        onDispose { lifecycle.removeObserver(obs) }
    }

    fun setEmail(key: String, on: Boolean, next: EmailPrefs) {
        val before = email
        email = next
        scope.launch {
            runCatching { AppGraph.people.update(uid ?: return@launch, mapOf("notificationPreferences.$key" to on)) }
                .onFailure { email = before; alerts.show("Didn't save", "Check your connection and try again.") }
        }
    }

    Screen(back = "Settings", tabBar = false, title = "Notifications") {
        if (!notifyOn) {
            com.munpro.app.ui.kit.Notice(
                "Notifications are off",
                "Turn them on to hear about updates, allocations and the live floor.",
                action = { com.munpro.app.ui.kit.Pill("Turn On", { activity.startActivity(Notifier.settingsIntent(activity)) }, filled = true) },
            )
        }
        Section(header = "On this phone", footer = "MUN Pilot checks every 15 minutes, even when closed. The live session shows who has the floor and when you speak, while you have a sitting open.") {
            cell("Conference alerts", subtitle = "Allocations, announcements, room alerts", chevron = false, trailing = { Toggle(notifyAlerts, AppGraph::setNotifyAlerts, "Conference alerts") })
            cell("Live session on lock screen", subtitle = "Who has the floor, when you speak", chevron = false, trailing = { Toggle(lockScreen, AppGraph::setLockScreenFloor, "Live session on lock screen") })
            cell("App updates", chevron = false, trailing = { Toggle(notifyUpdates, AppGraph::setNotifyUpdates, "App updates") })
        }
        val e = email
        if (e == null) Spinner()
        else Section(header = "Email", footer = "Updates always appear in the app. These switches only control email.") {
            cell("Application approved", chevron = false, trailing = {
                Toggle(e.emailOnApproval != false, { setEmail("emailOnApproval", it, e.copy(emailOnApproval = it)) }, "Application approved")
            })
            cell("Application rejected", chevron = false, trailing = {
                Toggle(e.emailOnRejection != false, { setEmail("emailOnRejection", it, e.copy(emailOnRejection = it)) }, "Application rejected")
            })
            cell("New events", subtitle = "When new conferences are published", chevron = false, trailing = {
                Toggle(e.emailOnNewEvent == true, { setEmail("emailOnNewEvent", it, e.copy(emailOnNewEvent = it)) }, "New events")
            })
        }
    }
}

// ---------------------------------------------------------------------------------------------
// A6.9 · Privacy
// ---------------------------------------------------------------------------------------------

@Composable
fun PrivacySettingsScreen() {
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val alerts = LocalAlerts.current
    val p = com.munpro.app.ui.profile.rememberOwnProfile()
    val uid = AppGraph.auth.user?.uid
    var blockedCount by remember { mutableStateOf<Int?>(null) }
    LaunchedEffect(uid) {
        if (uid == null) return@LaunchedEffect
        blockedCount = runCatching {
            com.google.firebase.firestore.FirebaseFirestore.getInstance().collection("users").document(uid).collection("blocks").get().await().size()
        }.getOrNull()
    }
    // Shown at once; the profile listener confirms (or reverts on failure).
    val pending = remember { mutableStateOf<Map<String, Any>>(emptyMap()) }

    fun set(key: String, value: Any) {
        pending.value = pending.value + (key to value)
        scope.launch {
            runCatching { AppGraph.people.update(uid ?: return@launch, mapOf("privacySettings.$key" to value)) }
                .onFailure { alerts.show("Didn't save", "Check your connection and try again.") }
            pending.value = pending.value - key
        }
    }

    Screen(back = "Settings", tabBar = false, title = "Privacy") {
        if (p == null) { Spinner(); return@Screen }
        val s = p.privacySettings
        val showProfile = pending.value["showProfile"] as? Boolean ?: (s?.showProfile != false)
        val showHistory = pending.value["showApplicationHistory"] as? Boolean ?: (s?.showApplicationHistory == true)
        val showStats = pending.value["showStats"] as? Boolean ?: (s?.showStats == true)
        val onlyConnections = (pending.value["contactVisibility"] as? String ?: s?.contactVisibility) == "connections"
        Section(footer = "Turning off Public profile hides you from people who aren't connected to you, and from Discover.") {
            cell("Public profile", subtitle = "Appear in Discover and search", chevron = false, trailing = { Toggle(showProfile, { set("showProfile", it) }, "Public profile") })
            cell("Application history", subtitle = "Show conferences you applied to", chevron = false, trailing = { Toggle(showHistory, { set("showApplicationHistory", it) }, "Application history") })
            cell("MUN stats", subtitle = "Conferences, blogs and awards counts", chevron = false, trailing = { Toggle(showStats, { set("showStats", it) }, "MUN stats") })
        }
        Section(footer = "When on, only your active connections can see your email and phone. Organizers still see the phone you gave on your applications.") {
            cell("Email & phone: connections only", chevron = false, trailing = {
                Toggle(onlyConnections, { set("contactVisibility", if (it) "connections" else "everyone") }, "Email and phone visible to connections only")
            })
        }
        Section {
            cell("Blocked people", value = blockedCount?.toString(), onClick = { nav.tab(TAB_NETWORK, "blocked") })
        }
    }
}

// ---------------------------------------------------------------------------------------------
// A6.10 · Sign-in & security
// ---------------------------------------------------------------------------------------------

@Composable
fun SecurityScreen() {
    val c = palette
    val scope = rememberCoroutineScope()
    val activity = LocalContext.current
    val user = AppGraph.auth.user
    var providers by remember { mutableStateOf(AppGraph.auth.providers()) }
    val hasPassword = "password" in providers
    var current by remember { mutableStateOf("") }
    var next by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var done by remember { mutableStateOf(false) }
    var resetSent by remember { mutableStateOf(false) }
    var linking by remember { mutableStateOf(false) }
    var linkError by remember { mutableStateOf<String?>(null) }

    fun change() {
        error = null
        done = false
        when {
            next != confirm -> { error = "New passwords do not match."; return }
            next.length < 6 -> { error = "Password must be at least 6 characters."; return }
        }
        busy = true
        scope.launch {
            runCatching { AppGraph.auth.changePassword(current, next) }
                .onSuccess { current = ""; next = ""; confirm = ""; done = true }
                .onFailure { e ->
                    val code = (e as? com.google.firebase.auth.FirebaseAuthException)?.errorCode.orEmpty()
                    error = when {
                        e is com.google.firebase.auth.FirebaseAuthInvalidCredentialsException || code == "ERROR_WRONG_PASSWORD" || code == "ERROR_INVALID_CREDENTIAL" -> "Current password is incorrect."
                        e is com.google.firebase.auth.FirebaseAuthWeakPasswordException -> "New password is too weak."
                        else -> com.munpro.app.data.authMessage(e)
                    }
                }
            busy = false
        }
    }

    Screen(back = "Settings", tabBar = false, title = "Sign-in & security") {
        if (hasPassword) {
            Section(header = "Change password", footer = if (done) "Password updated." else null) {
                item { Field("Current", current, { current = it }, "Your password", FieldKind.Password) }
                item { Field("New", next, { next = it }, "At least 6 characters", FieldKind.NewPassword) }
                item { Field("Confirm", confirm, { confirm = it }, "Type it again", FieldKind.NewPassword) }
            }
            ErrorText(error)
            MunButton("Update Password", ::change, loading = busy, enabled = !busy && current.isNotEmpty() && next.isNotEmpty() && confirm.isNotEmpty())
            com.munpro.app.ui.kit.TextLink(if (resetSent) "Reset link sent to ${user?.email}" else "Forgot your password? Email me a reset link", {
                val email = user?.email ?: return@TextLink
                scope.launch { runCatching { AppGraph.auth.sendPasswordReset(email); resetSent = true } }
            }, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), modifier = Modifier.padding(horizontal = 16.dp))
        } else {
            Section(header = "Password", footer = if (resetSent) "We sent a link to ${user?.email} to set your password." else "You sign in with Google. Set a password to sign in with your email too.") {
                cell("Set a password", onClick = {
                    val email = user?.email ?: return@cell
                    scope.launch { runCatching { AppGraph.auth.sendPasswordReset(email); resetSent = true } }
                })
            }
        }
        Section(header = "Sign-in methods", footer = linkError) {
            cell(
                "Email and password", subtitle = user?.email, leading = { SfIcon(Icons.mail, c.label2, size = 20.dp) }, inset = 48.dp, chevron = false,
                trailing = { StatusChip(if (hasPassword) "On" else "Off", on = hasPassword) },
            )
            if (AppGraph.auth.googleAvailable || "google.com" in providers) cell(
                "Google", subtitle = if ("google.com" in providers) "Connected" else "Not connected",
                leading = { com.munpro.app.ui.kit.GoogleG(20.dp) }, inset = 48.dp, chevron = false,
                trailing = {
                    if ("google.com" in providers) StatusChip("On", on = true)
                    else com.munpro.app.ui.kit.Pill(if (linking) "Connecting…" else "Connect", {
                        if (!linking) {
                            linking = true
                            linkError = null
                            scope.launch {
                                try { AppGraph.auth.linkGoogle(activity); providers = AppGraph.auth.providers() }
                                catch (e: Exception) { linkError = com.munpro.app.data.authMessage(e) }
                                finally { linking = false }
                            }
                        }
                    })
                },
            )
        }
    }
}

