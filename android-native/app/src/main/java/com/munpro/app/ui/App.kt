package com.munpro.app.ui

// The root: three states, the same ones the web dashboard layout enforces (RN app/_layout.tsx):
// signed out → Welcome; signed in but not onboarded → About you; otherwise the app.

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import com.munpro.app.AppGraph
import com.munpro.app.data.AuthState
import com.munpro.app.nav.ForgotPassword
import com.munpro.app.nav.SignIn
import com.munpro.app.nav.SignUp
import com.munpro.app.nav.Tabs
import com.munpro.app.nav.Welcome
import com.munpro.app.ui.auth.ForgotPasswordScreen
import com.munpro.app.ui.auth.OnboardingScreen
import com.munpro.app.ui.auth.SignInScreen
import com.munpro.app.ui.auth.SignUpScreen
import com.munpro.app.ui.auth.WelcomeScreen
import com.munpro.app.ui.kit.LocalBack
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.tabs.TabsScreen
import com.munpro.app.ui.messages.MessageBanner
import com.munpro.app.ui.notifications.RoomAlertBanner

/** Navigation for the signed-in app. `back()` falls back to Home when nothing is behind. */
class Navigator(val controller: NavHostController) {
    fun go(route: Any) {
        if (route is Tabs) tab(route.tab, route.segment) else controller.navigate(route) { launchSingleTop = true }
    }

    /** Back to the tabs, on [key] (a link to a tab, "See all" from a pushed screen). */
    fun tab(key: String, segment: String = "") {
        com.munpro.app.ui.tabs.TabHost.select(key, segment)
        if (!controller.popBackStack<Tabs>(inclusive = false)) {
            controller.navigate(Tabs(key, segment)) { popUpTo(controller.graph.id) { inclusive = true } }
        }
    }

    fun back() {
        if (!controller.popBackStack()) {
            // A screen opened straight from a link is the only one on the stack: go to Home
            // rather than strand the delegate there.
            controller.navigate(Tabs()) { popUpTo(controller.graph.id) { inclusive = true } }
        }
    }

    /** Replace everything with [route] (e.g. "Done" after applying). */
    fun reset(route: Any) = controller.navigate(route) { popUpTo(controller.graph.id) { inclusive = true } }
}

val LocalNav = staticCompositionLocalOf<Navigator> { error("No navigator") }

@Composable
fun App(pendingLink: String? = null, onLinkHandled: () -> Unit = {}) {
    val state by AppGraph.auth.state.collectAsStateWithLifecycle()
    Box(Modifier.fillMaxSize().background(palette.bg)) {
        when (val s = state) {
            AuthState.Loading -> Unit // the splash screen stays up meanwhile
            AuthState.SignedOut -> AuthFlow()
            is AuthState.SignedIn ->
                if (!s.onboarded) OnboardingScreen()
                else MainFlow(pendingLink, onLinkHandled)
        }
    }
}

// iOS push: the new screen slides in from the right, the old one shifts a third left.
private val push: AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition =
    { slideInHorizontally(tween(320)) { it } + fadeIn(tween(1)) }
private val pushOut: AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition =
    { slideOutHorizontally(tween(320)) { -it / 3 } + fadeOut(tween(320), targetAlpha = 0.6f) }
private val pop: AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition =
    { slideInHorizontally(tween(320)) { -it / 3 } }
private val popOut: AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition =
    { slideOutHorizontally(tween(320)) { it } }

@Composable
private fun AuthFlow() {
    val controller = rememberNavController()
    val nav = remember(controller) { Navigator(controller) }
    CompositionLocalProvider(LocalNav provides nav, LocalBack provides { controller.popBackStack(); Unit }) {
        NavHost(controller, startDestination = Welcome, enterTransition = push, exitTransition = pushOut, popEnterTransition = pop, popExitTransition = popOut) {
            composable<Welcome> { WelcomeScreen() }
            composable<SignIn> { SignInScreen() }
            composable<SignUp> { SignUpScreen() }
            composable<ForgotPassword> { ForgotPasswordScreen() }
        }
    }
}

@Composable
private fun MainFlow(pendingLink: String?, onLinkHandled: () -> Unit) {
    val controller = rememberNavController()
    val nav = remember(controller) { Navigator(controller) }
    // The event on screen, for AI calls (AiScope): every event screen's route carries eventId.
    androidx.compose.runtime.DisposableEffect(controller) {
        val l = androidx.navigation.NavController.OnDestinationChangedListener { _, _, args ->
            com.munpro.app.data.AiScope.eventId = args?.getString("eventId")?.ifEmpty { null }
        }
        controller.addOnDestinationChangedListener(l)
        onDispose { controller.removeOnDestinationChangedListener(l) }
    }
    CompositionLocalProvider(LocalNav provides nav, LocalBack provides nav::back) {
        Box(Modifier.fillMaxSize()) {
            NavHost(
                controller,
                startDestination = Tabs(),
                enterTransition = push, exitTransition = pushOut, popEnterTransition = pop, popExitTransition = popOut,
            ) {
                composable<Tabs> { val r = it.toRoute<Tabs>(); TabsScreen(r.tab, r.segment) }
                mainScreens()
            }
            // A dais message drops in over whatever screen is up (Messages board, M3).
            MessageBanner()
            // Maintenance mode (App Admin → Settings): a full-screen notice for everyone else.
            val platform = com.munpro.app.ui.organizer.rememberPlanSettings().data
            if (platform?.maintenanceMode == true && !com.munpro.app.ui.admin.isAppAdmin(AppGraph.auth.profile?.role)) {
                Box(Modifier.fillMaxSize().background(com.munpro.app.ui.kit.palette.bg).padding(32.dp), contentAlignment = androidx.compose.ui.Alignment.Center) {
                    androidx.compose.foundation.layout.Column(horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally, verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(10.dp)) {
                        androidx.compose.material3.Text("We'll be right back", style = com.munpro.app.ui.kit.Type.title2, color = com.munpro.app.ui.kit.palette.label)
                        androidx.compose.material3.Text(platform.maintenanceMessage?.ifBlank { null } ?: "MUN Pilot is under maintenance. Please check back soon.",
                            style = com.munpro.app.ui.kit.Type.body, color = com.munpro.app.ui.kit.palette.label2, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                    }
                }
            }
            // A committee room alert drops in the same way (board A1.9).
            RoomAlertBanner()
        }
        com.munpro.app.ui.profile.UpdatePrompt()
        com.munpro.app.ui.profile.NotificationPermissionAsk()
        DeepLinkEffect(nav, pendingLink, onLinkHandled)
    }
}

/** The screens pushed over the tabs. Grows phase by phase (see PLAN.md). */
private fun NavGraphBuilder.mainScreens() {
    screens()
}
