package com.munpro.app.ui.kit

// MunPilotTheme (redesign board 00, "Compose mapping"): one CompositionLocal palette, Inter type,
// no Material colour roles on screen. Every colour has a light and a dark value; Settings ->
// Appearance picks Automatic / Light / Dark.

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.munpro.app.R

@Immutable
data class Palette(
    /** Grouped screen background. */
    val bg: Color,
    /** List groups, cards, sheet content. */
    val cell: Color,
    /** Segmented track, gray buttons, search. */
    val fill: Color,
    /** The lighter fill: disabled buttons, chips. */
    val fillSoft: Color,
    val label: Color,
    val label2: Color,
    val label3: Color,
    val separator: Color,
    val tint: Color,
    val tintSoft: Color,
    val onTint: Color,
    /** destructive: delete, end, live dot, Against. */
    val red: Color,
    val redSoft: Color,
    /** warning: pending, offline, waiting. */
    val orange: Color,
    val orangeSoft: Color,
    /** info: under review, informational banners. */
    val info: Color,
    val infoSoft: Color,
    /** navy: the delegation pass, conference hero. */
    val pass: Color,
    /** The video stage, dark in both themes. */
    val stage: Color,
    /** Raised surface on a card (segmented thumb, nested cards) — the board's card2. */
    val cell2: Color,
    /** Awards, Pro: the board's gold. */
    val gold: Color,
    val goldSoft: Color,
    /** glass: tab bar, nav buttons, bottom docks. */
    val tabBar: Color,
    val dark: Boolean,
)

private fun rgba(r: Int, g: Int, b: Int, a: Float) = Color(r, g, b, (a * 255).toInt())
private fun Color.a(alpha: Float) = copy(alpha = alpha)

// MUN Pilot colour tokens (redesign board 00): semantic names only, a light and a dark value each.
private val LightLabel = Color(0xFF0E1D2C)
private val DarkLabel = Color(0xFFEDF2F5)

val LightPalette = Palette(
    bg = Color(0xFFF2F2F7),
    cell = Color(0xFFFFFFFF),
    fill = rgba(0x78, 0x80, 0x8C, 0.18f),
    fillSoft = rgba(0x78, 0x80, 0x8C, 0.11f),
    label = LightLabel,
    label2 = Color(0xFF56677A),
    label3 = Color(0xFF66778A).a(0.75f),
    separator = LightLabel.a(0.10f),
    tint = Color(0xFF0B6E4F),
    tintSoft = Color(0xFFE1F0E9),
    onTint = Color(0xFFFFFFFF),
    red = Color(0xFFC42B1F),
    redSoft = Color(0xFFC42B1F).a(0.10f),
    orange = Color(0xFFB45309),
    orangeSoft = Color(0xFFB45309).a(0.10f),
    info = Color(0xFF0B5CD5),
    infoSoft = Color(0xFF0B5CD5).a(0.09f),
    pass = Color(0xFF0E1D2C),
    stage = Color(0xFF0B1219),
    cell2 = Color(0xFFFFFFFF),
    gold = Color(0xFF8A6400),
    goldSoft = Color(0xFFF8EFD6),
    tabBar = Color(0xFFFAFAFC).a(0.86f),
    dark = false,
)

val DarkPalette = Palette(
    bg = Color(0xFF000000),
    cell = Color(0xFF15191F),
    fill = rgba(0x96, 0xA5, 0xB4, 0.26f),
    fillSoft = rgba(0x96, 0xA5, 0xB4, 0.15f),
    label = DarkLabel,
    label2 = Color(0xFFA6B3BF),
    label3 = Color(0xFF8C9AA7).a(0.75f),
    separator = DarkLabel.a(0.12f),
    tint = Color(0xFF47A481),
    tintSoft = Color(0xFF47A481).a(0.18f),
    // Near-black on the lighter dark-mode green (board tokens, A1): better contrast than white.
    onTint = Color(0xFF03140C),
    red = Color(0xFFFF6A5C),
    redSoft = Color(0xFFFF6A5C).a(0.16f),
    orange = Color(0xFFF5A14B),
    orangeSoft = Color(0xFFF5A14B).a(0.16f),
    info = Color(0xFF6AA6FF),
    infoSoft = Color(0xFF6AA6FF).a(0.16f),
    pass = Color(0xFF0E1D2C),
    stage = Color(0xFF0B1219),
    cell2 = Color(0xFF252C35),
    gold = Color(0xFFE9C25A),
    goldSoft = Color(0xFFE9C25A).a(0.16f),
    tabBar = Color(0xFF20262E).a(0.82f),
    dark = true,
)

/** Icon-tile hues (not palette roles): the coloured squares on Profile, Conference home. */
object SystemColors {
    val blue = Color(0xFF2D6FE0)
    val orange = Color(0xFFE5820F)
    val gray = Color(0xFF7D8896)
    val indigo = Color(0xFF5653D4)
    val green = Color(0xFF1F9D6B)
    val purple = Color(0xFF8E55D9)
    val gold = Color(0xFFD69A00)
    val red = Color(0xFFDD3A2E)
    val teal = Color(0xFF14918F)
    val navy = Color(0xFF0E1D2C)
}

// Inter is shipped with the app: SF Pro may only be used on Apple platforms.
val Inter = FontFamily(
    Font(R.font.inter_regular, FontWeight.Normal),
    Font(R.font.inter_medium, FontWeight.Medium),
    Font(R.font.inter_semibold, FontWeight.SemiBold),
    Font(R.font.inter_bold, FontWeight.Bold),
    Font(R.font.inter_extrabold, FontWeight.ExtraBold),
)

private fun style(weight: FontWeight, size: Float, line: Float, tracking: Float = 0f) = TextStyle(
    fontFamily = Inter,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = line.sp,
    // RN letterSpacing is in px at that size; Compose wants em.
    letterSpacing = (tracking / size).em,
)

/** MUN Pilot type (board 00): Inter, the closest match to SF that can ship on Android. */
object Type {
    val largeTitle = style(FontWeight.Bold, 34f, 40f, -0.9f)
    val title = style(FontWeight.Bold, 28f, 33f, -0.7f)
    val title2 = style(FontWeight.Bold, 22f, 27f, -0.5f)
    val headline = style(FontWeight.SemiBold, 17f, 22f, -0.3f)
    val body = style(FontWeight.Normal, 16f, 21f, -0.2f)
    val bodyMedium = style(FontWeight.Medium, 16f, 21f, -0.2f)
    val subhead = style(FontWeight.Normal, 15f, 20f, -0.1f)
    val sectionLabel = style(FontWeight.SemiBold, 13f, 16f, 0.4f)
    val footnote = style(FontWeight.Normal, 13f, 17f)
    val caption = style(FontWeight.SemiBold, 12f, 15f)
    /** The big clock: tabular figures so it doesn't jitter as it counts. */
    val timer = style(FontWeight.SemiBold, 76f, 80f, -2.5f).copy(fontFeatureSettings = "tnum")
}

object Radius {
    /** Grouped list sections and cards. */
    val cell = 24.dp
    val button = 26.dp
    val pass = 22.dp
    val field = 12.dp
    val tile = 9.dp
    val sheet = 38.dp
    val tabBar = 31.dp
}

object Space {
    val gutter = 16.dp
    val section = 22.dp
}

val LocalPalette = staticCompositionLocalOf { LightPalette }

/** Automatic / Light / Dark (Settings → Appearance). */
enum class AppearanceMode { System, Light, Dark }

@Composable
fun MunTheme(mode: AppearanceMode = AppearanceMode.System, content: @Composable () -> Unit) {
    val dark = when (mode) {
        AppearanceMode.System -> isSystemInDarkTheme()
        AppearanceMode.Light -> false
        AppearanceMode.Dark -> true
    }
    val p = if (dark) DarkPalette else LightPalette
    // Material only supplies plumbing (text field cursor, ripple-free indication); colours follow
    // the palette so nothing Material-looking leaks through.
    val scheme = (if (dark) darkColorScheme() else lightColorScheme()).copy(
        primary = p.tint, onPrimary = p.onTint, background = p.bg, surface = p.cell,
        onBackground = p.label, onSurface = p.label, error = p.red,
    )
    CompositionLocalProvider(LocalPalette provides p) {
        MaterialTheme(colorScheme = scheme) {
            // Material's default text style carries 0.5sp tracking and Roboto; every Text here
            // starts from Inter at zero tracking instead.
            CompositionLocalProvider(
                LocalTextStyle provides TextStyle(fontFamily = Inter, letterSpacing = 0.sp, color = p.label),
                content = content,
            )
        }
    }
}

/** The palette in the current theme. */
val palette: Palette
    @Composable get() = LocalPalette.current
