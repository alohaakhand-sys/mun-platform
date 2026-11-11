package com.munpro.app.ui.kit

// Sheets and alerts in the iOS idiom: a page sheet that slides up over the screen (with a
// grabber, swipe down to close), an action sheet (grouped options + a separate Cancel), a
// searchable picker sheet, and the centred two-button alert that replaces RN's Alert.alert.
// Ports of PickerSheet.tsx, ActionSheet.tsx and the Modal presentationStyle="pageSheet" uses.

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.CompletableDeferred
import kotlin.math.roundToInt

private val fullScreen = DialogProperties(
    usePlatformDefaultWidth = false,
    decorFitsSystemWindows = false,
    dismissOnClickOutside = false,
)

/**
 * Keeps a dialog window up while its exit animation runs, so closing slides out instead of
 * vanishing. [content] gets the transition state to animate with.
 */
@Composable
private fun AnimatedDialog(
    visible: Boolean,
    onDismiss: () -> Unit,
    properties: DialogProperties = fullScreen,
    content: @Composable (MutableTransitionState<Boolean>) -> Unit,
) {
    val state = remember { MutableTransitionState(false) }
    LaunchedEffect(visible) { state.targetState = visible }
    if (!visible && state.isIdle && !state.currentState) return
    Dialog(onDismissRequest = onDismiss, properties = properties) { content(state) }
}

/** The surface a screen opens over itself: slides up, grabber on top, swipe down to close. */
@Composable
fun PageSheet(
    visible: Boolean,
    onDismiss: () -> Unit,
    background: Color = palette.bg,
    content: @Composable ColumnScope.() -> Unit,
) {
    val status = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    AnimatedDialog(visible, onDismiss) { state ->
        val c = palette
        var drag by remember { mutableFloatStateOf(0f) }
        val density = LocalDensity.current
        Box(Modifier.fillMaxSize()) {
            AnimatedVisibility(state, enter = fadeIn(tween(220)), exit = fadeOut(tween(200))) {
                Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.35f)))
            }
            AnimatedVisibility(
                state,
                enter = slideInVertically(tween(300)) { it },
                exit = slideOutVertically(tween(240)) { it },
                modifier = Modifier.padding(top = status + 10.dp),
            ) {
                Column(
                    Modifier
                        .fillMaxSize()
                        .offset { IntOffset(0, drag.roundToInt()) }
                        .clip(RoundedCornerShape(topStart = Radius.sheet, topEnd = Radius.sheet))
                        .background(background)
                        .imePadding(),
                ) {
                    // Grabber: drag it (or the header below it) down to close.
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .height(14.dp)
                            .pointerInput(Unit) {
                                detectVerticalDragGestures(
                                    onDragEnd = { if (drag > with(density) { 120.dp.toPx() }) onDismiss(); drag = 0f },
                                    onDragCancel = { drag = 0f },
                                ) { _, dy -> drag = (drag + dy).coerceAtLeast(0f) }
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Box(
                            Modifier
                                .padding(top = 6.dp)
                                .size(width = 38.dp, height = 5.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(c.fill),
                        )
                    }
                    content()
                }
            }
        }
    }
}

/** Header words that close or step aside rather than commit: drawn as a quiet white pill. */
private val QUIET = setOf("Done", "Close", "Share", "Skip", "Cancel", "Back", "Edit")

/** A sheet header's pill: Cancel (white), Done (white, tinted text), Send / Save / Start (filled). */
@Composable
private fun HeaderPill(label: String, onClick: () -> Unit, enabled: Boolean, leading: Boolean) {
    val c = palette
    val press = rememberPress()
    val pressed by press.pressed
    val quiet = leading || label in QUIET
    Box(
        Modifier
            .height(34.dp)
            .alpha(if (!enabled) 0.4f else if (pressed) 0.7f else 1f)
            .clip(RoundedCornerShape(17.dp))
            .background(if (quiet) (if (c.dark) c.fill else c.cell) else c.tint)
            .tap(press, enabled = enabled, onClick = onClick)
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label, maxLines = 1,
            style = Type.subhead.copy(fontWeight = FontWeight.SemiBold),
            color = when { !quiet -> c.onTint; leading -> c.label; else -> c.tint },
        )
    }
}

/** A sheet's header row: leading pill, centred title (+ subtitle), trailing pill. */
@Composable
fun SheetHeader(
    title: String,
    subtitle: String? = null,
    leading: String? = null,
    onLeading: (() -> Unit)? = null,
    trailing: String? = null,
    onTrailing: (() -> Unit)? = null,
    trailingEnabled: Boolean = true,
    divider: Boolean = false,
) {
    val c = palette
    Column {
        Row(
            Modifier
                .fillMaxWidth()
                .height(56.dp)
                .padding(horizontal = Space.gutter),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                if (leading != null && onLeading != null) HeaderPill(leading, onLeading, enabled = true, leading = true)
            }
            // At most 220dp, so a short title leaves the side buttons room for longer labels.
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.widthIn(max = 220.dp)) {
                Text(title, style = Type.headline, color = c.label, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis, textAlign = TextAlign.Center)
                if (subtitle != null) Text(subtitle, style = Type.caption.copy(fontWeight = FontWeight.Normal), color = c.label2, maxLines = 1)
            }
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) {
                if (trailing != null && onTrailing != null) HeaderPill(trailing, onTrailing, enabled = trailingEnabled, leading = false)
            }
        }
        if (divider) Box(Modifier.fillMaxWidth().height(Hairline).background(c.separator))
    }
}

// ---------------------------------------------------------------------------------------------
// Action sheet
// ---------------------------------------------------------------------------------------------

/** An iOS-style action sheet: a titled group of options and a separate Cancel, over a dimmed screen. */
@Composable
fun ActionSheet(
    visible: Boolean,
    onDismiss: () -> Unit,
    title: String,
    message: String? = null,
    error: String? = null,
    rows: @Composable ColumnScope.() -> Unit,
) {
    val nav = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    AnimatedDialog(visible, onDismiss) { state ->
        val c = palette
        Box(Modifier.fillMaxSize()) {
            AnimatedVisibility(state, enter = fadeIn(tween(200)), exit = fadeOut(tween(180))) {
                val press = rememberPress()
                Box(
                    Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.35f))
                        .tap(press, role = null, label = "Close", onClick = onDismiss),
                )
            }
            AnimatedVisibility(
                state,
                enter = slideInVertically(tween(260)) { it },
                exit = slideOutVertically(tween(200)) { it },
                modifier = Modifier.align(Alignment.BottomCenter),
            ) {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(start = 8.dp, end = 8.dp, bottom = nav + 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(max = 480.dp)
                            .clip(RoundedCornerShape(22.dp))
                            .background(c.cell),
                    ) {
                        Column(
                            Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalArrangement = Arrangement.spacedBy(3.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text(title, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = c.label2, textAlign = TextAlign.Center)
                            if (message != null) Text(message, style = Type.footnote, color = c.label2, textAlign = TextAlign.Center)
                            if (!error.isNullOrEmpty()) Text(error, style = Type.footnote, color = c.red, textAlign = TextAlign.Center)
                        }
                        Box(Modifier.fillMaxWidth().height(Hairline).background(c.separator))
                        Column(Modifier.verticalScroll(rememberScrollState())) { rows() }
                    }
                    val press = rememberPress()
                    val pressed by press.pressed
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .height(56.dp)
                            .clip(RoundedCornerShape(22.dp))
                            .background(if (pressed) c.fill else c.cell)
                            .tap(press, onClick = onDismiss),
                        contentAlignment = Alignment.Center,
                    ) { Text("Cancel", style = Type.headline, color = c.tint) }
                }
            }
        }
    }
}

@Composable
fun SheetRow(label: String, onClick: () -> Unit, enabled: Boolean = true, selected: Boolean = false, destructive: Boolean = false, icon: SfIconSpec? = null, flag: String? = null) {
    val c = palette
    val press = rememberPress()
    val pressed by press.pressed
    Column {
        Box(
            Modifier
                .fillMaxWidth()
                .height(56.dp)
                .background(if (pressed) c.fill else Color.Transparent)
                .tap(press, enabled = enabled, onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            val color = (if (destructive) c.red else c.tint).copy(alpha = if (enabled) 1f else 0.5f)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (selected) SfIcon(Icons.check, color, size = 17.dp)
                else if (icon != null) SfIcon(icon, color, size = 18.dp)
                else if (flag != null) Flag(flag, 17f)
                Text(label, style = Type.body.copy(fontSize = 17.sp, fontWeight = FontWeight.Medium), color = color)
            }
        }
        Box(Modifier.fillMaxWidth().height(Hairline).background(c.separator))
    }
}

// ---------------------------------------------------------------------------------------------
// Picker sheet
// ---------------------------------------------------------------------------------------------

data class PickerItem(val value: String, val label: String, val detail: String? = null, val leading: String? = null, val disabled: Boolean = false, val flag: String? = null)

/** A searchable list in a page sheet, for choosing a committee or a country. */
@Composable
fun PickerSheet(
    visible: Boolean,
    title: String,
    items: List<PickerItem>,
    onPick: (String) -> Unit,
    onDismiss: () -> Unit,
    searchable: Boolean = true,
) {
    PageSheet(visible, onDismiss) {
        val c = palette
        var q by remember { mutableStateOf("") }
        val t = q.trim().lowercase()
        val list = if (t.isEmpty()) items else items.filter { it.label.lowercase().contains(t) }
        val nav = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
        SheetHeader(title, leading = "Cancel", onLeading = onDismiss)
        if (searchable) {
            SearchField(q, { q = it }, Modifier.padding(horizontal = Space.gutter, vertical = 8.dp))
        }
        if (list.isEmpty()) {
            Text("No matches.", style = Type.body, color = c.label2, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 24.dp))
        }
        LazyColumn(
            Modifier
                .fillMaxWidth()
                .padding(top = 6.dp),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(start = Space.gutter, end = Space.gutter, bottom = nav + 24.dp),
        ) {
            itemsIndexed(list, key = { _, it -> it.value }) { i, item ->
                val first = i == 0
                val last = i == list.lastIndex
                val shape = RoundedCornerShape(
                    topStart = if (first) Radius.cell else 0.dp, topEnd = if (first) Radius.cell else 0.dp,
                    bottomStart = if (last) Radius.cell else 0.dp, bottomEnd = if (last) Radius.cell else 0.dp,
                )
                val press = rememberPress()
                val pressed by press.pressed
                Column(
                    Modifier
                        .clip(shape)
                        .background(if (pressed) c.fill else c.cell),
                ) {
                    if (!first) Box(Modifier.fillMaxWidth().height(Hairline).background(c.separator))
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .tap(press, enabled = !item.disabled) { onPick(item.value); q = "" }
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        if (item.flag != null) Flag(item.flag) else if (item.leading != null) Emoji(item.leading)
                        Column(Modifier.weight(1f)) {
                            Text(item.label, style = Type.bodyMedium, color = if (item.disabled) c.label3 else c.label)
                            if (item.detail != null) Text(item.detail, style = Type.subhead, color = if (item.disabled) c.label3 else c.label2)
                        }
                        if (!item.disabled && item.flag == null) Chevron(c.label3)
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------------------------

data class AlertButton(val label: String, val style: Style = Style.Default, val onClick: () -> Unit = {}) {
    enum class Style { Default, Cancel, Destructive }
}

data class AlertSpec(val title: String, val message: String? = null, val buttons: List<AlertButton>)

/** One alert at a time, app-wide (like UIAlertController). */
class AlertController {
    var current by mutableStateOf<AlertSpec?>(null)
        private set

    fun show(title: String, message: String? = null, vararg buttons: AlertButton) {
        current = AlertSpec(title, message, buttons.toList().ifEmpty { listOf(AlertButton("OK")) })
    }

    /** Cancel + one action; resolves true when the action is chosen. */
    suspend fun confirm(title: String, message: String?, action: String, destructive: Boolean = false): Boolean {
        val answer = CompletableDeferred<Boolean>()
        show(
            title, message,
            AlertButton("Cancel", AlertButton.Style.Cancel) { answer.complete(false) },
            AlertButton(action, if (destructive) AlertButton.Style.Destructive else AlertButton.Style.Default) { answer.complete(true) },
        )
        return answer.await()
    }

    internal fun dismiss() {
        current = null
    }
}

val LocalAlerts = staticCompositionLocalOf { AlertController() }

@Composable
fun AlertHost(controller: AlertController) {
    val spec = controller.current ?: return
    val c = palette
    val cancel = spec.buttons.firstOrNull { it.style == AlertButton.Style.Cancel }
    BackHandler { controller.dismiss(); cancel?.onClick?.invoke() }
    Dialog(
        onDismissRequest = { controller.dismiss(); cancel?.onClick?.invoke() },
        properties = DialogProperties(dismissOnClickOutside = false),
    ) {
        val state = remember { MutableTransitionState(false).apply { targetState = true } }
        AnimatedVisibility(state, enter = fadeIn(tween(150)) + scaleIn(tween(200), initialScale = 1.1f)) {
            Column(
                Modifier
                    .width(270.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(if (c.dark) Color(0xFF2C2C2E) else Color(0xFFF2F2F2)),
            ) {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 19.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(spec.title, style = Type.headline, color = c.label, textAlign = TextAlign.Center)
                    if (spec.message != null) Text(spec.message, style = Type.footnote, color = c.label, textAlign = TextAlign.Center)
                }
                Box(Modifier.fillMaxWidth().height(Hairline).background(c.separator))
                val row = spec.buttons.size == 2
                // Two buttons side by side (Cancel on the left); more stack, Cancel last.
                val ordered = if (row) spec.buttons else spec.buttons.sortedBy { if (it.style == AlertButton.Style.Cancel) 1 else 0 }
                val button: @Composable (AlertButton, Modifier) -> Unit = { b, m ->
                    val press = rememberPress()
                    val pressed by press.pressed
                    Box(
                        m
                            .height(44.dp)
                            .background(if (pressed) c.fill else Color.Transparent)
                            .tap(press) { controller.dismiss(); b.onClick() },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            b.label,
                            style = Type.body.copy(fontSize = 17.sp, fontWeight = if (b.style == AlertButton.Style.Cancel && row || b.style == AlertButton.Style.Default && !row && spec.buttons.size == 1) FontWeight.SemiBold else FontWeight.Normal),
                            color = if (b.style == AlertButton.Style.Destructive) c.red else if (c.dark) Color(0xFF0A84FF) else c.tint,
                        )
                    }
                }
                if (row) {
                    Row(Modifier.fillMaxWidth()) {
                        button(ordered[0], Modifier.weight(1f))
                        Box(Modifier.width(Hairline).height(44.dp).background(c.separator))
                        button(ordered[1], Modifier.weight(1f))
                    }
                } else {
                    ordered.forEachIndexed { i, b ->
                        if (i > 0) Box(Modifier.fillMaxWidth().height(Hairline).background(c.separator))
                        button(b, Modifier.fillMaxWidth())
                    }
                }
            }
        }
    }
}

/** Provides [LocalAlerts] and draws the one alert host. */
@Composable
fun WithAlerts(content: @Composable () -> Unit) {
    val controller = remember { AlertController() }
    CompositionLocalProvider(LocalAlerts provides controller) {
        content()
        AlertHost(controller)
    }
}
