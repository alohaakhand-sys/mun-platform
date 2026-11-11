package com.munpro.app.ui.kit

// The building blocks every screen uses, drawn to the MUN Pilot redesign (board 00): inset grouped
// lists (24 radius, 52 rows), capsule buttons (52 high, no elevation), 34 pills and status chips,
// fields, a segmented control, centred empty states.

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Hairline: iOS separators are one physical pixel. */
val Hairline: Dp = 0.5.dp

// ---------------------------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------------------------

/** Rows of a [Section]. Separators go BETWEEN rows, inset past the leading accessory like iOS. */
class SectionScope internal constructor() {
    internal val rows = mutableListOf<Pair<Dp, @Composable () -> Unit>>()

    /** Any row. [inset] is where the separator above THIS row starts (past its leading accessory). */
    fun item(inset: Dp = 16.dp, content: @Composable () -> Unit) {
        rows += inset to content
    }

    fun cell(
        title: String,
        subtitle: String? = null,
        value: String? = null,
        leading: (@Composable () -> Unit)? = null,
        trailing: (@Composable () -> Unit)? = null,
        onClick: (() -> Unit)? = null,
        chevron: Boolean = onClick != null,
        inset: Dp = 16.dp,
        destructive: Boolean = false,
        tinted: Boolean = false,
        dim: Boolean = false,
    ) = item(inset) {
        Cell(title, subtitle, value, leading, trailing, onClick, chevron, destructive, tinted, dim)
    }
}

@Composable
fun Section(
    header: String? = null,
    footer: String? = null,
    modifier: Modifier = Modifier,
    rows: SectionScope.() -> Unit,
) {
    val c = palette
    val scope = SectionScope().apply(rows)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (header != null) SectionHeader(header)
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(Radius.cell))
                .background(c.cell),
        ) {
            scope.rows.forEachIndexed { i, (inset, content) ->
                // Like the RN Section: the separator above a row is inset by THAT row's inset.
                if (i > 0) {
                    Box(
                        Modifier
                            .padding(start = inset)
                            .fillMaxWidth()
                            .height(Hairline)
                            .background(c.separator),
                    )
                }
                content()
            }
        }
        if (footer != null) SectionFooter(footer)
    }
}

@Composable
fun SectionHeader(text: String) {
    Text(
        text.uppercase(),
        style = Type.sectionLabel,
        color = palette.label2,
        modifier = Modifier.padding(horizontal = 16.dp),
    )
}

@Composable
fun SectionFooter(text: String) {
    Text(text, style = Type.footnote, color = palette.label2, modifier = Modifier.padding(horizontal = 16.dp))
}

/** A white rounded card, the body of a section without rows (an "About" paragraph, a tracker). */
@Composable
fun Card(modifier: Modifier = Modifier, padding: Dp = 16.dp, content: @Composable () -> Unit) {
    Box(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radius.cell))
            .background(palette.cell)
            .padding(padding),
    ) { content() }
}

// ---------------------------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------------------------

@Composable
fun Chevron(color: Color) {
    Canvas(Modifier.size(width = 8.dp, height = 13.dp)) {
        val k = size.width / 8f
        val w = 2.2f * k
        drawLine(color, Offset(1.5f * k, 1.5f * k), Offset(6.5f * k, 6.5f * k), w, StrokeCap.Round)
        drawLine(color, Offset(6.5f * k, 6.5f * k), Offset(1.5f * k, 11.5f * k), w, StrokeCap.Round)
    }
}

@Composable
fun Cell(
    title: String,
    subtitle: String? = null,
    value: String? = null,
    leading: (@Composable () -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
    onClick: (() -> Unit)? = null,
    chevron: Boolean = onClick != null,
    destructive: Boolean = false,
    tinted: Boolean = false,
    /** Greyed out: an action that exists but isn't available right now. */
    dim: Boolean = false,
    titleLines: Int = 2,
) {
    val c = palette
    val press = rememberPress()
    val pressed by press.pressed
    Row(
        Modifier
            .fillMaxWidth()
            .background(if (pressed) c.fill else Color.Transparent)
            .then(if (onClick != null) Modifier.tap(press, onClick = onClick) else Modifier)
            .heightIn(min = 52.dp)
            .padding(horizontal = 16.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        leading?.invoke()
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(
                title,
                style = Type.bodyMedium,
                color = when {
                    dim -> c.label3
                    destructive -> c.red
                    tinted -> c.tint
                    else -> c.label
                },
                maxLines = titleLines,
                overflow = TextOverflow.Ellipsis,
            )
            if (!subtitle.isNullOrEmpty()) {
                Text(subtitle, style = Type.footnote, color = c.label2, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        if (!value.isNullOrEmpty()) {
            BoxWithConstraints(Modifier.widthIn(max = 200.dp)) {
                Text(value, style = Type.subhead, color = c.label2, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        trailing?.invoke()
        if (chevron) Chevron(c.label3)
    }
}

/** The coloured rounded square with a white glyph (Profile, Conference home). */
@Composable
fun IconTile(color: Color, icon: SfIconSpec) {
    Box(
        Modifier
            .size(30.dp)
            .clip(RoundedCornerShape(Radius.tile))
            .background(color),
        contentAlignment = Alignment.Center,
    ) { SfIcon(icon, Color.White, size = 18.dp) }
}

/** An emoji flag in a leading slot, sized like the RN app's. */
@Composable
fun Emoji(text: String, size: Float = 22f) {
    Text(text, fontSize = size.sp, lineHeight = (size * 1.2f).sp)
}

/** The round count badge (unread). */
@Composable
fun CountBadge(n: Int) {
    val c = palette
    Box(
        Modifier
            .heightIn(min = 22.dp)
            .widthIn(min = 22.dp)
            .clip(CircleShape)
            .background(c.tint)
            .padding(horizontal = 6.dp),
        contentAlignment = Alignment.Center,
    ) { Text("$n", color = c.onTint, fontSize = 12.sp, fontWeight = FontWeight.Bold, fontFamily = Inter) }
}

/** A check mark in a trailing slot. */
@Composable
fun CheckMark(color: Color = palette.tint) {
    SfIcon(Icons.check, color, size = 18.dp)
}

/** A red word in a trailing slot ("Withdraw"). */
@Composable
fun TrailingAction(text: String, color: Color = palette.red) {
    Text(text, style = Type.body, color = color)
}

// ---------------------------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------------------------

/** Filled (primary), Tinted (secondary), Gray (neutral), Plain (text only). */
enum class ButtonVariant { Filled, Tinted, Gray, Plain }

@Composable
fun MunButton(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: ButtonVariant = ButtonVariant.Filled,
    loading: Boolean = false,
    enabled: Boolean = true,
    height: Dp = 52.dp,
    corner: Dp = height / 2,
    destructive: Boolean = false,
    /** A glyph before the title ("Raise Placard" carries a flag). */
    icon: SfIconSpec? = null,
) {
    val c = palette
    val haptics = rememberHaptics()
    val press = rememberPress()
    val pressed by press.pressed
    val accent = if (destructive) c.red else c.tint
    // Disabled reads as a quiet gray capsule, not a faded colour (board 00, "Disabled — Next").
    val off = !enabled && variant != ButtonVariant.Plain
    val bg = when {
        off -> c.fillSoft
        variant == ButtonVariant.Filled -> accent
        variant == ButtonVariant.Tinted -> if (destructive) c.redSoft else c.tintSoft
        variant == ButtonVariant.Gray -> c.fillSoft
        else -> Color.Transparent
    }
    val fg = when {
        off -> c.label3
        variant == ButtonVariant.Filled -> if (destructive) Color.White else c.onTint
        variant == ButtonVariant.Gray -> c.label
        else -> accent
    }
    Box(
        modifier
            .fillMaxWidth()
            .height(height)
            .alpha(if (!enabled && variant == ButtonVariant.Plain) 0.4f else if (pressed) 0.75f else 1f)
            .clip(RoundedCornerShape(corner))
            .background(bg)
            .tap(press, enabled = enabled && !loading) { haptics.selection(); onClick() },
        contentAlignment = Alignment.Center,
    ) {
        if (loading) CircularProgressIndicator(color = fg, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        else Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (icon != null) SfIcon(icon, fg, size = 18.dp)
            Text(title, style = Type.headline, color = fg, maxLines = 1)
        }
    }
}

/**
 * A tinted status banner (board 04 "Not marked present", board 03 "You're offline", board 06
 * "Session suspended"): an icon, a title in the tone, a line of detail, an optional action.
 */
@Composable
fun Notice(title: String, detail: String? = null, tone: Tone = Tone.Warning, icon: SfIconSpec = Icons.alert, action: (@Composable () -> Unit)? = null) {
    val (bg, fg) = toneColors(tone)
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(bg).padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SfIcon(icon, fg, size = 20.dp)
        Column(Modifier.weight(1f)) {
            Text(title, style = Type.subhead.copy(fontWeight = FontWeight.SemiBold), color = fg)
            if (!detail.isNullOrEmpty()) Text(detail, style = Type.footnote, color = palette.label2)
        }
        action?.invoke()
    }
}

/** A capsule button sized to its text (Event page "Apply", "Edit", "Join"). */
@Composable
fun Capsule(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    filled: Boolean = true,
    enabled: Boolean = true,
    /** White on the grouped background, label-coloured text ("Edit", "Mark all read"). */
    surface: Boolean = false,
    destructive: Boolean = false,
) {
    val c = palette
    val haptics = rememberHaptics()
    val press = rememberPress()
    val pressed by press.pressed
    val accent = if (destructive) c.red else c.tint
    Box(
        modifier
            .height(34.dp)
            .alpha(if (!enabled) 0.4f else if (pressed) 0.75f else 1f)
            .clip(CircleShape)
            .background(
                when {
                    surface -> c.cell
                    filled -> accent
                    destructive -> c.redSoft
                    else -> c.tintSoft
                },
            )
            .tap(press, enabled = enabled) { haptics.selection(); onClick() }
            .padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            title, style = Type.subhead.copy(fontWeight = FontWeight.SemiBold),
            color = when { surface -> c.label; filled -> if (destructive) Color.White else c.onTint; else -> accent },
        )
    }
}

/** What a pill or chip says with its colour. */
enum class Tone { Tint, Neutral, Warning, Destructive, Info }

/** A small status chip: Accepted, Pending, Live, Under review, 15 seats. */
@Composable
fun Chip(text: String, tone: Tone = Tone.Neutral, dot: Boolean = false, modifier: Modifier = Modifier) {
    val c = palette
    val (bg, fg) = toneColors(tone)
    Row(
        modifier.clip(CircleShape).background(bg).padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        if (dot) Box(Modifier.size(6.dp).clip(CircleShape).background(fg))
        Text(text, style = Type.caption.copy(fontSize = 11.sp, lineHeight = 14.sp), color = if (tone == Tone.Neutral) c.label2 else fg, maxLines = 1)
    }
}

@Composable
private fun toneColors(tone: Tone): Pair<Color, Color> {
    val c = palette
    return when (tone) {
        Tone.Tint -> c.tintSoft to c.tint
        Tone.Neutral -> c.fillSoft to c.label
        Tone.Warning -> c.orangeSoft to c.orange
        Tone.Destructive -> c.redSoft to c.red
        Tone.Info -> c.infoSoft to c.info
    }
}

/** The 34 pill: Approve, Read, On screen, Reject, -30s. */
@Composable
fun Pill(label: String, onClick: () -> Unit, filled: Boolean = false, enabled: Boolean = true, tone: Tone = Tone.Tint, modifier: Modifier = Modifier) {
    val c = palette
    val press = rememberPress()
    val pressed by press.pressed
    val (soft, strong) = toneColors(tone)
    Box(
        modifier
            .height(34.dp)
            .alpha(if (!enabled) 0.45f else if (pressed) 0.7f else 1f)
            .clip(CircleShape)
            .background(if (filled) strong else soft)
            .tap(press, enabled = enabled, onClick = onClick)
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label, style = Type.subhead.copy(fontWeight = FontWeight.SemiBold, fontSize = 14.sp),
            color = if (filled) (when (tone) { Tone.Neutral -> c.cell; Tone.Tint -> c.onTint; else -> Color.White }) else if (tone == Tone.Neutral) c.label else strong,
            maxLines = 1,
        )
    }
}

/** A text link ("Create an account"). */
@Composable
fun TextLink(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, style: TextStyle = Type.body) {
    val press = rememberPress()
    val pressed by press.pressed
    Text(
        text,
        style = style,
        color = palette.tint,
        modifier = modifier
            .alpha(if (pressed) 0.5f else 1f)
            .tap(press, onClick = onClick),
    )
}

// ---------------------------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------------------------

enum class FieldKind { Text, Email, Password, NewPassword, Phone, GivenName, FamilyName, Number }

/** A text field that lives inside a [Section], one row per field. */
@Composable
fun Field(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String = "",
    kind: FieldKind = FieldKind.Text,
    imeAction: ImeAction = ImeAction.Next,
    onSubmit: (() -> Unit)? = null,
    labelWidth: Dp = 96.dp,
) {
    val c = palette
    val keyboard = when (kind) {
        FieldKind.Email -> KeyboardType.Email
        FieldKind.Password, FieldKind.NewPassword -> KeyboardType.Password
        FieldKind.Phone -> KeyboardType.Phone
        FieldKind.Number -> KeyboardType.Number
        else -> KeyboardType.Text
    }
    val autofill = when (kind) {
        FieldKind.Email -> ContentType.EmailAddress
        FieldKind.Password -> ContentType.Password
        FieldKind.NewPassword -> ContentType.NewPassword
        FieldKind.Phone -> ContentType.PhoneNumber
        FieldKind.GivenName -> ContentType.PersonFirstName
        FieldKind.FamilyName -> ContentType.PersonLastName
        else -> null
    }
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .padding(horizontal = 16.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(label, style = Type.body, color = c.label, modifier = Modifier.width(labelWidth))
        PlainInput(
            value = value,
            onValueChange = onValueChange,
            placeholder = placeholder,
            modifier = Modifier
                .weight(1f)
                .then(if (autofill != null) Modifier.semantics { contentType = autofill } else Modifier),
            keyboardOptions = KeyboardOptions(
                keyboardType = keyboard,
                imeAction = imeAction,
                autoCorrectEnabled = kind == FieldKind.Text,
                capitalization = when (kind) {
                    FieldKind.GivenName, FieldKind.FamilyName -> androidx.compose.ui.text.input.KeyboardCapitalization.Words
                    else -> androidx.compose.ui.text.input.KeyboardCapitalization.None
                },
            ),
            keyboardActions = KeyboardActions(onAny = { onSubmit?.invoke() }),
            visualTransformation = if (kind == FieldKind.Password || kind == FieldKind.NewPassword) PasswordVisualTransformation() else VisualTransformation.None,
        )
    }
}

/** A bare single-line input with a placeholder, in the body style. */
@Composable
fun PlainInput(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    style: TextStyle = Type.body,
    placeholderColor: Color = palette.label3,
    singleLine: Boolean = true,
    minLines: Int = 1,
    maxLength: Int? = null,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
) {
    val c = palette
    BasicTextField(
        value = value,
        onValueChange = { v -> onValueChange(if (maxLength != null) v.take(maxLength) else v) },
        modifier = modifier,
        textStyle = style.copy(color = c.label),
        singleLine = singleLine,
        minLines = minLines,
        keyboardOptions = keyboardOptions,
        keyboardActions = keyboardActions,
        visualTransformation = visualTransformation,
        cursorBrush = SolidColor(c.tint),
        decorationBox = { inner ->
            Box {
                if (value.isEmpty()) Text(placeholder, style = style, color = placeholderColor)
                inner()
            }
        },
    )
}

/** A long answer with a character count (Apply → Experience). */
@Composable
fun Essay(label: String, value: String, onValueChange: (String) -> Unit, placeholder: String, maxLength: Int = 1500) {
    val c = palette
    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        SectionHeader(label)
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(Radius.cell))
                .background(c.cell),
        ) {
            PlainInput(
                value = value,
                onValueChange = onValueChange,
                placeholder = placeholder,
                singleLine = false,
                minLines = 4,
                maxLength = maxLength,
                style = Type.body.copy(lineHeight = 22.sp),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 110.dp)
                    .padding(14.dp),
                keyboardOptions = KeyboardOptions(capitalization = androidx.compose.ui.text.input.KeyboardCapitalization.Sentences),
            )
            Text(
                "${value.length} / $maxLength",
                style = Type.caption,
                color = c.label2,
                textAlign = TextAlign.End,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 14.dp, end = 14.dp, bottom = 10.dp),
            )
        }
    }
}

/** The grey search capsule (Discover, pickers). */
@Composable
fun SearchField(value: String, onValueChange: (String) -> Unit, modifier: Modifier = Modifier, placeholder: String = "Search", onSubmit: (() -> Unit)? = null) {
    val c = palette
    Row(
        modifier
            .fillMaxWidth()
            .height(38.dp)
            .clip(RoundedCornerShape(Radius.field))
            .background(c.fillSoft)
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        SfIcon(Icons.search, c.label2, size = 17.dp)
        PlainInput(
            value, onValueChange, placeholder,
            placeholderColor = c.label2,
            modifier = Modifier.weight(1f),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { onSubmit?.invoke() }),
        )
        if (value.isNotEmpty()) {
            val press = rememberPress()
            Box(
                Modifier
                    .size(18.dp)
                    .clip(CircleShape)
                    .background(c.label3)
                    .tap(press, label = "Clear") { onValueChange("") },
                contentAlignment = Alignment.Center,
            ) { SfIcon(Icons.close, c.cell, size = 10.dp) }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------------------------

@Composable
fun <T> Segmented(options: List<Pair<T, String>>, value: T, onChange: (T) -> Unit, modifier: Modifier = Modifier) {
    val c = palette
    val haptics = rememberHaptics()
    BoxWithConstraints(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(c.fillSoft)
            .padding(2.dp),
    ) {
        val n = options.size.coerceAtLeast(1)
        val w = maxWidth / n
        val found = options.indexOfFirst { it.first == value }
        val index = found.coerceAtLeast(0)
        val x by animateDpAsState(w * index, label = "segment")
        // The white thumb slides under the labels, as UISegmentedControl does; none while nothing is chosen.
        if (found >= 0) Box(
            Modifier
                .offset(x = x)
                .width(w)
                .height(32.dp)
                .shadow(1.dp, RoundedCornerShape(12.dp), clip = false, ambientColor = Color.Black.copy(alpha = 0.10f), spotColor = Color.Black.copy(alpha = 0.10f))
                .clip(RoundedCornerShape(12.dp))
                .background(if (c.dark) Color(0xFF39414B) else c.cell),
        )
        Row(Modifier.fillMaxWidth()) {
            options.forEach { (v, label) ->
                val on = v == value
                val press = rememberPress()
                Box(
                    Modifier
                        .weight(1f)
                        .height(32.dp)
                        .semantics { selected = on }
                        .tap(press, role = Role.Tab) { if (!on) { haptics.selection(); onChange(v) } },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        label,
                        style = Type.footnote.copy(fontWeight = if (on) FontWeight.SemiBold else FontWeight.Medium),
                        color = if (on) c.label else c.label2,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------------------------

/** Explains an empty screen and offers the next step: a tinted icon, a title, a line, a button. */
@Composable
fun Empty(title: String, message: String, action: (@Composable () -> Unit)? = null, icon: SfIconSpec? = null, iconTone: Tone = Tone.Tint) {
    val c = palette
    val (soft, strong) = toneColors(iconTone)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radius.cell))
            .background(c.cell)
            .padding(horizontal = 20.dp, vertical = 22.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (icon != null) {
            Box(Modifier.padding(bottom = 6.dp).size(44.dp).clip(RoundedCornerShape(13.dp)).background(soft), contentAlignment = Alignment.Center) {
                SfIcon(icon, strong, size = 22.dp)
            }
        }
        Text(title, style = Type.headline, color = c.label, textAlign = TextAlign.Center)
        Text(message, style = Type.footnote, color = c.label2, textAlign = TextAlign.Center)
        if (action != null) {
            Spacer(Modifier.height(10.dp))
            action()
        }
    }
}

@Composable
fun ErrorText(text: String?, modifier: Modifier = Modifier, center: Boolean = false) {
    if (text.isNullOrEmpty()) return
    Text(
        text,
        style = Type.footnote,
        color = palette.red,
        textAlign = if (center) TextAlign.Center else TextAlign.Start,
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
    )
}

@Composable
fun Loading(text: String = "Loading…") {
    Text(text, style = Type.body, color = palette.label2)
}

@Composable
fun Spinner(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().padding(top = 24.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = palette.tint, strokeWidth = 2.5.dp, modifier = Modifier.size(28.dp))
    }
}

/** A large title (screens without the [Screen] wrapper). */
@Composable
fun LargeTitle(text: String, modifier: Modifier = Modifier, size: Float = 32f) {
    Text(
        text,
        style = Type.largeTitle.copy(fontSize = size.sp, lineHeight = (size * 1.19f).sp),
        color = palette.label,
        modifier = modifier.semantics { heading() },
    )
}

/** A progress ring (Today: how close the next session is). */
@Composable
fun Ring(fraction: Float, size: Dp = 42.dp) {
    val c = palette
    Canvas(Modifier.size(size)) {
        val stroke = this.size.minDimension * 5f / 44f
        val inset = stroke / 2 + this.size.minDimension * 2f / 44f
        val arc = androidx.compose.ui.geometry.Size(this.size.width - inset * 2, this.size.height - inset * 2)
        val tl = Offset(inset, inset)
        drawArc(c.fill, 0f, 360f, false, tl, arc, style = Stroke(stroke))
        drawArc(c.tint, -90f, 360f * fraction.coerceIn(0f, 1f), false, tl, arc, style = Stroke(stroke, cap = StrokeCap.Round))
    }
}

/** The iOS switch (mockup `.toggle`): green when on. Sits in a cell's trailing slot. */
@Composable
fun Toggle(checked: Boolean, onChange: (Boolean) -> Unit, label: String) {
    val c = palette
    val x by animateDpAsState(if (checked) 22.dp else 2.dp, label = "toggle")
    Box(
        Modifier
            .size(50.dp, 30.dp)
            .clip(RoundedCornerShape(15.dp))
            .background(if (checked) c.tint else c.fill)
            .toggleable(checked, interactionSource = null, indication = null, role = Role.Switch, onValueChange = onChange)
            .semantics { contentDescription = label },
    ) {
        Box(Modifier.offset(x = x, y = 2.dp).size(26.dp).shadow(2.dp, CircleShape).clip(CircleShape).background(Color.White))
    }
}

/** A dot (unread, live, now). */
@Composable
fun Dot(color: Color, size: Dp = 8.dp) {
    Box(Modifier.size(size).clip(CircleShape).background(color))
}

/** Row helper: a centred horizontal row with a gap. */
@Composable
fun HRow(gap: Dp = 8.dp, modifier: Modifier = Modifier, content: @Composable RowScope.() -> Unit) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(gap), content = content)
}
