package com.munpro.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.data.AuthState
import com.munpro.app.notify.Notifier
import com.munpro.app.ui.App
import com.munpro.app.ui.kit.AppearanceMode
import com.munpro.app.ui.kit.MunTheme
import com.munpro.app.ui.kit.WithAlerts
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    /** A link that opened (or re-opened) the app, until the signed-in app routes it. */
    private var pendingLink by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        AppGraph.startUi()
        val splash = installSplashScreen()
        // The splash screen stays up until we know who is signed in (RN SplashScreen.hideAsync).
        splash.setKeepOnScreenCondition { AppGraph.auth.state.value == AuthState.Loading }
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) {
            pendingLink = intent?.dataString
            markAlertRead(intent)
        }

        setContent {
            val mode by AppGraph.appearance.collectAsStateWithLifecycle()
            val dark = when (mode) {
                AppearanceMode.System -> isSystemInDarkTheme()
                AppearanceMode.Light -> false
                AppearanceMode.Dark -> true
            }
            DisposableEffect(dark) {
                val style = if (dark) SystemBarStyle.dark(android.graphics.Color.TRANSPARENT)
                else SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT)
                enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
                onDispose { }
            }
            MunTheme(mode) {
                WithAlerts {
                    App(pendingLink) { pendingLink = null }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.dataString?.let { pendingLink = it }
        markAlertRead(intent)
    }

    /** A tapped conference alert (notify/Notifier.kt) counts as reading it. */
    private fun markAlertRead(intent: Intent?) {
        val id = intent?.getStringExtra(Notifier.EXTRA_NOTIFICATION_ID) ?: return
        AppGraph.scope.launch { AppGraph.content.markNotificationRead(id) }
    }
}
