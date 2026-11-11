package com.munpro.app.ui.kit

// Touch without Material ripples: iOS cells darken while pressed, buttons dim. Haptics follow the
// RN app's expo-haptics calls (selection on taps, impact on the placard, success after a send).

import android.os.Build
import android.view.HapticFeedbackConstants
import android.view.View
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics

class Haptics(private val view: View) {
    fun selection() = view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
    fun light() = view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
    fun medium() = view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
    fun success() = view.performHapticFeedback(
        if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.KEYBOARD_TAP,
    )
    fun error() = view.performHapticFeedback(
        if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS,
    )
}

@Composable
fun rememberHaptics(): Haptics {
    val view = LocalView.current
    return remember(view) { Haptics(view) }
}

/** A press source plus whether it is held down, for drawing pressed states by hand. */
class Press(val source: MutableInteractionSource, val pressed: State<Boolean>)

@Composable
fun rememberPress(): Press {
    val source = remember { MutableInteractionSource() }
    return Press(source, source.collectIsPressedAsState())
}

/** clickable with no ripple; draw the pressed state from [press]. */
fun Modifier.tap(
    press: Press,
    enabled: Boolean = true,
    role: Role? = Role.Button,
    label: String? = null,
    onClick: () -> Unit,
): Modifier = clickable(
    interactionSource = press.source,
    indication = null,
    enabled = enabled,
    role = role,
    onClickLabel = label,
    onClick = onClick,
).then(
    // An icon-only control has no text of its own: the label is what TalkBack (and the test
    // driver) reads.
    if (label != null) Modifier.semantics { contentDescription = label } else Modifier,
)
