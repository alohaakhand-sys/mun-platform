package com.munpro.app.ui.auth

// First run: Welcome, Sign in (+ Forgot password, from the mockup), Create account, About you.
// Ports of mobile/src/app/(auth)/* and onboarding.tsx. The root gate moves on by itself once the
// account state changes, so these screens never navigate after success.

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.layout.size
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.munpro.app.AppGraph
import com.munpro.app.data.authMessage
import com.munpro.app.domain.longDate
import com.munpro.app.nav.ForgotPassword
import com.munpro.app.nav.SignIn
import com.munpro.app.nav.SignUp
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.GoogleButton
import com.munpro.app.ui.kit.OrDivider
import com.munpro.app.ui.kit.Field
import com.munpro.app.ui.kit.FieldKind
import com.munpro.app.ui.kit.Inter
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.Space
import com.munpro.app.ui.kit.TextLink
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.pass.Pass
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/** One Google attempt at a time; the root gate moves on by itself after success. */
private class GoogleFlow(val busy: Boolean, val error: String?, val start: () -> Unit)

@Composable
private fun rememberGoogleFlow(): GoogleFlow {
    val activity = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    return GoogleFlow(busy, error) {
        if (!busy) {
            busy = true
            error = null
            scope.launch {
                try { AppGraph.auth.signInWithGoogle(activity) }
                catch (e: Exception) { error = authMessage(e) }
                finally { busy = false }
            }
        }
    }
}

// Three passes fanned like placards on a desk. Two ways in, nothing else.
@Composable
fun WelcomeScreen() {
    val c = palette
    val nav = LocalNav.current
    val top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    Column(
        Modifier
            .fillMaxSize()
            .background(c.bg)
            .padding(top = top + 24.dp, bottom = bottom + 20.dp, start = Space.gutter + 6.dp, end = Space.gutter + 6.dp),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(290.dp)
                .clearAndSetSemantics { },
        ) {
            Pass("jp", "Human Rights Council", Modifier.alpha(0.45f).rotate(-7f).offset(x = (-8).dp), conference = "Winter MUN Summit", delegate = "You", ghost = true)
            Pass("br", "Development Programme", Modifier.padding(top = 36.dp).alpha(0.75f).rotate(4f).offset(x = 10.dp), conference = "Sylhet Diplomacy Fest", delegate = "You", ghost = true)
            Pass("fr", "Security Council", Modifier.padding(top = 74.dp), conference = "Screens Model UN 2027", delegate = "You", seat = "4 of 15")
        }
        com.munpro.app.ui.kit.Wordmark(Modifier.padding(top = 4.dp), size = 26.sp)
        Text(
            "Your seat in every committee",
            fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 28.sp, lineHeight = 32.sp,
            letterSpacing = (-0.8f / 28f).em, color = c.label, modifier = Modifier.padding(top = 18.dp),
        )
        Text(
            "Find conferences, apply in minutes, and take part in session from your phone.",
            style = Type.subhead.copy(lineHeight = 21.sp), color = c.label2, modifier = Modifier.padding(top = 8.dp),
        )
        Spacer(Modifier.weight(1f))
        val google = rememberGoogleFlow()
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            ErrorText(google.error, center = true)
            if (AppGraph.auth.googleAvailable) GoogleButton("Continue with Google", google.start, loading = google.busy)
            MunButton("Create Account", { nav.go(SignUp) })
            MunButton("I already have an account", { nav.go(SignIn) }, variant = ButtonVariant.Plain, height = 44.dp)
        }
    }
}

@Composable
fun SignInScreen() {
    val c = palette
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun submit() {
        if (email.isBlank() || password.isEmpty() || busy) return
        error = null
        busy = true
        scope.launch {
            try { AppGraph.auth.signIn(email, password) } // the root gate moves on by itself
            catch (e: Exception) { error = authMessage(e) }
            finally { busy = false }
        }
    }

    val google = rememberGoogleFlow()
    Screen(title = "Sign in", back = "Welcome", tabBar = false) {
        Text("Use the account you use on MUN Pilot on the web.", style = Type.body, color = c.label2, modifier = Modifier.offset(y = (-12).dp))
        Section {
            item { Field("Email", email, { email = it }, "you@example.com", FieldKind.Email) }
            item { Field("Password", password, { password = it }, "Required", FieldKind.Password, ImeAction.Go, onSubmit = ::submit) }
        }
        ErrorText(error ?: google.error)
        MunButton("Sign In", ::submit, loading = busy, enabled = email.isNotBlank() && password.isNotEmpty())
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { TextLink("Forgot password?", { nav.go(ForgotPassword) }) }
        if (AppGraph.auth.googleAvailable) {
            OrDivider()
            GoogleButton("Sign in with Google", google.start, loading = google.busy)
        }
        Row(Modifier.fillMaxWidth().padding(top = 24.dp), horizontalArrangement = Arrangement.Center) {
            Text("New to MUN Pilot? ", style = Type.subhead, color = c.label2)
            TextLink("Create an account", { nav.go(SignUp) }, style = Type.subhead.copy(fontWeight = FontWeight.SemiBold))
        }
    }
}

@Composable
fun SignUpScreen() {
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun submit() {
        if (email.isBlank() || password.isEmpty() || confirm.isEmpty() || busy) return
        error = null
        if (password != confirm) { error = "The two passwords don't match."; return }
        busy = true
        scope.launch {
            try { AppGraph.auth.signUp(email, password) } // new account → the gate sends it to About you
            catch (e: Exception) { error = authMessage(e) }
            finally { busy = false }
        }
    }

    val google = rememberGoogleFlow()
    Screen(title = "Create account", back = "Welcome", tabBar = false) {
        Text("One account for the app and munpilot.com.", style = Type.body, color = palette.label2, modifier = Modifier.offset(y = (-12).dp))
        Section(footer = "At least 6 characters.") {
            item { Field("Email", email, { email = it }, "you@example.com", FieldKind.Email) }
            item { Field("Password", password, { password = it }, "Required", FieldKind.NewPassword) }
            item { Field("Confirm", confirm, { confirm = it }, "Repeat password", FieldKind.NewPassword, ImeAction.Go, onSubmit = ::submit) }
        }
        ErrorText(error ?: google.error)
        MunButton("Create Account", ::submit, loading = busy, enabled = email.isNotBlank() && password.isNotEmpty() && confirm.isNotEmpty())
        if (AppGraph.auth.googleAvailable) {
            OrDivider()
            GoogleButton("Sign up with Google", google.start, loading = google.busy)
        }
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            TextLink("I already have an account", { nav.back(); nav.go(SignIn) })
        }
    }
}

@Composable
fun ForgotPasswordScreen() {
    val c = palette
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var sent by remember { mutableStateOf<String?>(null) }

    fun submit() {
        if (email.isBlank() || busy) return
        error = null
        busy = true
        scope.launch {
            try { AppGraph.auth.sendPasswordReset(email); sent = email.trim() }
            catch (e: Exception) { error = authMessage(e) }
            finally { busy = false }
        }
    }

    Screen(title = "Reset password", back = "Sign in", tabBar = false) {
        androidx.compose.foundation.layout.Box(
            Modifier.offset(y = (-10).dp).size(48.dp).clip(androidx.compose.foundation.shape.RoundedCornerShape(14.dp)).background(c.tintSoft),
            contentAlignment = Alignment.Center,
        ) { com.munpro.app.ui.kit.SfIcon(com.munpro.app.ui.kit.Icons.key, c.tint, size = 22.dp) }
        Text("We'll email you a link to choose a new password.", style = Type.body, color = c.label2, modifier = Modifier.offset(y = (-12).dp))
        Section(footer = sent?.let { "If an account uses $it, a reset link is on its way. Check your inbox." }) {
            item { Field("Email", email, { email = it; sent = null }, "you@example.com", FieldKind.Email, ImeAction.Go, onSubmit = ::submit) }
        }
        ErrorText(error)
        MunButton("Send Link", ::submit, loading = busy, enabled = email.isNotBlank())
    }
}

// Same required fields as the web onboarding: first name, last name, date of birth.
@Composable
fun OnboardingScreen() {
    val c = palette
    val scope = rememberCoroutineScope()
    val user = AppGraph.auth.user
    // A Google account arrives with a name: pre-fill it (the web's onboarding does the same).
    val googleName = user?.displayName.orEmpty().trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    var first by remember { mutableStateOf(googleName.firstOrNull().orEmpty()) }
    var last by remember { mutableStateOf(googleName.drop(1).joinToString(" ")) }
    var phone by remember { mutableStateOf("") }
    var dob by remember { mutableStateOf<LocalDate?>(null) }
    var picking by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val valid = first.isNotBlank() && last.isNotBlank() && dob != null

    fun submit() {
        val d = dob ?: return
        if (!valid || busy) return
        error = null
        busy = true
        scope.launch {
            try { AppGraph.auth.completeOnboarding(first, last, d.toString(), phone) }
            catch (_: Exception) { error = "Your profile didn't save. Check your connection and try again." }
            finally { busy = false }
        }
    }

    Screen(title = "About you", overline = "STEP 1 OF 1", tabBar = false) {
        Text("Organisers see this when you apply to a conference.", style = Type.body, color = c.label2, modifier = Modifier.offset(y = (-12).dp))
        Section {
            item { Field("First name", first, { first = it }, "Required", FieldKind.GivenName) }
            item { Field("Last name", last, { last = it }, "Required", FieldKind.FamilyName) }
            cell("Date of birth", value = dob?.let(::longDate) ?: "Choose", onClick = { picking = true })
            item { Field("Phone", phone, { phone = it }, "Optional", FieldKind.Phone, ImeAction.Done) }
        }
        Section { cell("Email", value = user?.email.orEmpty()) }
        ErrorText(error)
        MunButton("Continue", ::submit, loading = busy, enabled = valid)
        MunButton("Sign Out", { scope.launch { AppGraph.auth.signOut() } }, variant = ButtonVariant.Plain, destructive = true, height = 44.dp)
    }

    if (picking) DobPicker(dob, { dob = it }, { picking = false })
}

/** Date of birth: no future dates, opens on 2005 when nothing is set yet. */
@Composable
fun DobPicker(dob: LocalDate?, onPick: (LocalDate) -> Unit, onDismiss: () -> Unit) {
    val c = palette
    run {
        val todayUtc = LocalDate.now().atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        val state = rememberDatePickerState(
            initialSelectedDateMillis = (dob ?: LocalDate.of(2005, 1, 1)).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long) = utcTimeMillis <= todayUtc
            },
        )
        val colors = DatePickerDefaults.colors(
            containerColor = c.cell,
            selectedDayContainerColor = c.tint, selectedDayContentColor = c.onTint,
            todayDateBorderColor = c.tint, todayContentColor = c.tint,
            selectedYearContainerColor = c.tint, selectedYearContentColor = c.onTint,
        )
        DatePickerDialog(
            onDismissRequest = onDismiss,
            confirmButton = {
                TextButton({
                    state.selectedDateMillis?.let { onPick(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()) }
                    onDismiss()
                }) { Text("Done", color = c.tint, style = Type.headline) }
            },
            dismissButton = { TextButton(onDismiss) { Text("Cancel", color = c.tint, style = Type.body) } },
            colors = colors,
        ) { DatePicker(state, colors = colors, showModeToggle = true) }
    }
}
