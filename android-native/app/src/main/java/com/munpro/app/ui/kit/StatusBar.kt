package com.munpro.app.ui.kit

import android.app.Activity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

/** White status-bar icons while this screen shows (a dark cover runs under the status bar). */
@Composable
fun LightStatusBarIcons() {
    val view = LocalView.current
    val dark = palette.dark
    DisposableEffect(view, dark) {
        val window = (view.context as? Activity)?.window
        val ctl = window?.let { WindowCompat.getInsetsController(it, view) }
        ctl?.isAppearanceLightStatusBars = false
        onDispose { ctl?.isAppearanceLightStatusBars = !dark }
    }
}
