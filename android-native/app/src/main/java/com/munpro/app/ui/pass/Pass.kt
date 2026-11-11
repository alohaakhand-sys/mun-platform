package com.munpro.app.ui.pass

// The delegation pass: the delegate's placard, drawn like a Wallet pass (RN components/Pass.tsx,
// mockup .pass). Ink card, the country's colours as a thin top band, the flag, committee and
// conference, the country name as big as it fits, the delegate and their seat. Press and hold to
// raise it (spring lift + haptic); tap to lower it.

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.onLongClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.munpro.app.domain.countryName
import com.munpro.app.domain.flagEmoji
import com.munpro.app.ui.kit.Inter
import com.munpro.app.ui.kit.palette
import com.munpro.app.ui.kit.rememberHaptics

enum class PassSize { Full, Compact, Tiny }

@Composable
fun Pass(
    country: String, // ISO code
    committee: String,
    modifier: Modifier = Modifier,
    conference: String? = null,
    delegate: String? = null,
    /** "6 of 15" */
    seat: String? = null,
    size: PassSize = PassSize.Full,
    raisable: Boolean = false,
    /** Hold the pass up from outside (a vote stands, the placard is raised in the sheet). */
    raisedExternally: Boolean = false,
    onRaisedChange: ((Boolean) -> Unit)? = null,
    onClick: (() -> Unit)? = null,
    /** Card only, no text — the passes stacked behind the front one on Welcome. */
    ghost: Boolean = false,
) {
    val c = palette
    val haptics = rememberHaptics()
    var raisedSelf by remember { mutableStateOf(false) }
    val raised = raisedSelf || raisedExternally
    val lift by animateFloatAsState(
        if (raised) 1f else 0f,
        spring(dampingRatio = 0.55f, stiffness = Spring.StiffnessMediumLow),
        label = "lift",
    )
    val density = LocalDensity.current
    val currentOnClick by rememberUpdatedState(onClick)
    val currentRaised by rememberUpdatedState(raisedSelf)

    fun set(next: Boolean) {
        raisedSelf = next
        onRaisedChange?.invoke(next)
        if (next) haptics.medium() else haptics.light()
    }

    val name = countryName(country)
    val corner = when (size) { PassSize.Full -> 20.dp; PassSize.Compact -> 16.dp; PassSize.Tiny -> 14.dp }
    val shape = RoundedCornerShape(corner)

    Box(
        modifier
            .fillMaxWidth()
            .graphicsLayer {
                translationY = -14f * density.density * lift
                scaleX = 1f + 0.02f * lift
                scaleY = 1f + 0.02f * lift
            }
            .shadow((4 + 12 * lift).dp, shape, ambientColor = Color(0xFF0E1D2C).copy(alpha = 0.5f), spotColor = Color(0xFF0E1D2C).copy(alpha = 0.5f))
            .clip(shape)
            .background(c.pass)
            .then(
                if (ghost) Modifier
                else Modifier
                    .pointerInput(raisable) {
                        detectTapGestures(
                            onLongPress = if (raisable) ({ if (!currentRaised) set(true) }) else null,
                            onTap = { if (raisable && currentRaised) set(false) else currentOnClick?.invoke() },
                        )
                    }
                    .semantics(mergeDescendants = true) {
                        role = Role.Button
                        selected = raised
                        contentDescription = "$name delegation pass, $committee." + if (raisable) " Press and hold to raise your placard." else ""
                        if (raisable) onLongClick("Raise your placard") { if (!raisedSelf) set(true); true }
                        onClick { if (raisable && raisedSelf) set(false) else onClick?.invoke(); true }
                    },
            ),
    ) {
        // The country's colours as a thin band across the top.
        Row(
            Modifier
                .fillMaxWidth()
                .height(if (size == PassSize.Tiny) 3.dp else 4.dp),
        ) {
            flagBand(country).forEach { s -> Box(Modifier.weight(s.weight).height(4.dp).background(s.color)) }
        }
        // A ghost keeps its content (invisible) so it is as tall as a real pass, like the RN one.
        Box(Modifier.alpha(if (ghost) 0f else 1f)) { when (size) {
            PassSize.Tiny -> Row(
                Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(name, color = Color.White, fontFamily = Inter, fontWeight = FontWeight.ExtraBold, fontSize = 22.sp, letterSpacing = (-0.045).em, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Text(committee, color = Color.White.copy(alpha = 0.6f), fontFamily = Inter, fontSize = 11.5.sp, maxLines = 1)
            }
            else -> {
                val compact = size == PassSize.Compact
                Column(Modifier.padding(start = if (compact) 14.dp else 18.dp, end = if (compact) 14.dp else 18.dp, top = if (compact) 12.dp else 16.dp, bottom = if (compact) 14.dp else 18.dp)) {
                    Row(verticalAlignment = Alignment.Top) {
                        Column(Modifier.weight(1f)) {
                            if (conference != null && !compact) {
                                Text(conference.uppercase(), color = Color.White.copy(alpha = 0.62f), fontFamily = Inter, fontWeight = FontWeight.SemiBold, fontSize = 10.sp, letterSpacing = 0.06.em, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            Text(committee, color = Color.White, fontFamily = Inter, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
                        }
                        com.munpro.app.ui.kit.Flag(country, if (compact) 16f else 19f)
                    }
                    Spacer(Modifier.height(if (compact) 8.dp else 16.dp))
                    FitText(name, maxSize = if (compact) 26f else 40f)
                    if (!compact && (delegate != null || seat != null)) {
                        Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                            if (delegate != null) PassField("Delegate", delegate)
                            if (seat != null) PassField("Seat", seat)
                        }
                    }
                }
            }
        } }
    }
}

@Composable
private fun PassField(label: String, value: String) {
    Column {
        Text(label.uppercase(), color = Color.White.copy(alpha = 0.55f), fontFamily = Inter, fontWeight = FontWeight.SemiBold, fontSize = 9.5.sp, letterSpacing = 0.06.em)
        Text(value, color = Color.White, fontFamily = Inter, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, modifier = Modifier.padding(top = 1.dp), maxLines = 1)
    }
}

/** The country name, shrunk until it fits on one line (RN adjustsFontSizeToFit). */
@Composable
private fun FitText(text: String, maxSize: Float) {
    val measurer = rememberTextMeasurer()
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val maxPx = constraints.maxWidth
        var size = maxSize
        val base = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Bold, color = Color.White, letterSpacing = (-0.035).em)
        while (size > 14f && measurer.measure(text, base.copy(fontSize = size.sp), maxLines = 1, softWrap = false).size.width > maxPx) size -= 1f
        Text(text, style = base.copy(fontSize = size.sp, lineHeight = (size * 1.05f).sp), maxLines = 1, softWrap = false, modifier = Modifier.alpha(1f))
    }
}
