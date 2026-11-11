package com.munpro.app.ui.payments

// Payments (board A6.3–A6.6; web dashboard/payments). Totals, what's due with Pay Now, history
// with receipts; a checkout summary that hands off to the platform's gateway; "Confirming
// payment" when the gateway sends you back (munpilot.com/app-return → munpro://payments); and a
// receipt you can share or save as PDF. Fees come from the event's role tiers (getPaymentGate),
// the same numbers the server charges.

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.munpro.app.AppGraph
import com.munpro.app.data.CheckoutResult
import com.munpro.app.domain.Conference
import com.munpro.app.domain.PaymentGate
import com.munpro.app.domain.formatDueLabel
import com.munpro.app.domain.formatFee
import com.munpro.app.domain.getPaymentGate
import com.munpro.app.domain.longDate
import com.munpro.app.nav.ConferenceRoute
import com.munpro.app.nav.PaymentConfirmRoute
import com.munpro.app.nav.ReceiptRoute
import com.munpro.app.ui.LocalNav
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.ErrorText
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.Inter
import com.munpro.app.ui.kit.LocalBack
import com.munpro.app.ui.kit.MunButton
import com.munpro.app.ui.kit.ButtonVariant
import com.munpro.app.ui.kit.PageSheet
import com.munpro.app.ui.kit.Pill
import com.munpro.app.ui.kit.Radius
import com.munpro.app.ui.kit.Screen
import com.munpro.app.ui.kit.Section
import com.munpro.app.ui.kit.SectionFooter
import com.munpro.app.ui.kit.SfIcon
import com.munpro.app.ui.kit.SheetHeader
import com.munpro.app.ui.kit.Space
import com.munpro.app.ui.kit.Spinner
import com.munpro.app.ui.kit.SystemColors
import com.munpro.app.ui.kit.Tone
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.palette
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId

/** One conference's fee, as the payments page shows it. */
private data class FeeRow(val c: Conference, val gate: PaymentGate) {
    val amount: Double get() = c.app.paidAmount?.takeIf { it > 0 } ?: gate.amount
    val free: Boolean get() = !gate.required
    val paid: Boolean get() = c.app.paymentStatus == "paid"
    val refunded: Boolean get() = c.app.paymentStatus == "refunded"
    val due: Boolean get() = gate.status == "due"
}

private fun day(ms: Long) = longDate(Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault()).toLocalDate())

/**
 * The web counts every rejected application as "refunded" even when nothing was paid; here only
 * a real refund (paymentStatus "refunded") is, and an unpaid rejected or withdrawn one isn't listed.
 */
@Composable
private fun rememberFeeRows(): List<FeeRow>? {
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()
    return confs.conferences?.filter { !it.app.fromStaffSeat }?.map { FeeRow(it, getPaymentGate(it.app, it.event)) }
        ?.filter { r -> r.paid || r.refunded || (r.app.status != "rejected" && r.app.status != "withdrawn") }
}

private val FeeRow.app get() = c.app

// ---------------------------------------------------------------------------------------------
// A6.3 · Payments
// ---------------------------------------------------------------------------------------------

@Composable
fun PaymentsScreen() {
    val c = palette
    val nav = LocalNav.current
    val rows = rememberFeeRows()
    var paying by remember { mutableStateOf<FeeRow?>(null) }

    Screen(back = "Profile", tabBar = false, title = "Payments", onRefresh = { AppGraph.conferences.reload() }) {
        if (rows == null) { Spinner(); return@Screen }
        if (rows.isEmpty()) { Empty("Nothing to pay", "Conference fees appear here once you apply to a conference.", icon = Icons.card); return@Screen }
        val spent = rows.filter { it.paid }.sumOf { it.amount }
        val pending = rows.filter { it.due }.sumOf { it.amount }
        val refunded = rows.filter { it.refunded }.sumOf { it.amount }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Tile(formatFee(spent), "Total spent", SystemColors.green, Modifier.weight(1f))
            Tile(formatFee(pending), "Pending", SystemColors.orange, Modifier.weight(1f))
            Tile(formatFee(refunded), "Refunded", SystemColors.blue, Modifier.weight(1f))
        }

        val due = rows.filter { it.due }
        if (due.isNotEmpty()) Section(header = "Due") {
            due.forEach { r ->
                item {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(verticalAlignment = Alignment.Top) {
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(r.c.event.title, style = Type.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = c.label)
                                Text(listOfNotNull(r.app.role.ifEmpty { null }, r.gate.tierLabel.takeIf { it != r.app.role }, r.gate.dueAt?.let { "pay by ${day(it)}" }).joinToString(" · "),
                                    style = Type.footnote, color = c.label2)
                                formatDueLabel(r.gate)?.let { Text(it, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = if (r.gate.overdue) c.red else c.orange) }
                            }
                            Text(formatFee(r.amount), style = Type.headline, color = c.label)
                        }
                        MunButton("Pay Now", { paying = r }, height = 44.dp, modifier = Modifier.padding(top = 6.dp))
                    }
                }
            }
        }

        val history = rows.filter { !it.due }
        if (history.isNotEmpty()) Section(header = "History") {
            history.forEach { r ->
                cell(
                    r.c.event.title,
                    subtitle = listOfNotNull(r.app.role.ifEmpty { null }, (r.app.paidAt ?: r.app.createdAt)?.let(::day)).joinToString(" · "),
                    value = when { r.free -> "Free"; r.refunded -> "Refunded ${formatFee(r.amount)}"; else -> formatFee(r.amount) },
                    trailing = if (r.paid || r.refunded) ({ Pill("Receipt", { nav.go(ReceiptRoute(r.app.id)) }) }) else null,
                    chevron = false,
                    onClick = { nav.go(ConferenceRoute(r.c.event.id)) },
                )
            }
        }
        SectionFooter("Paying opens the platform's secure checkout; you'll come straight back here.")
    }

    paying?.let { r -> CheckoutSheet(r, { paying = null }) }
}

@Composable
private fun Tile(value: String, label: String, color: Color, modifier: Modifier) {
    val c = palette
    Column(modifier.clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(14.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(value, fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 22.sp, letterSpacing = (-0.6).sp, color = color, maxLines = 1)
        Text(label, style = Type.footnote, color = c.label2)
    }
}

// ---------------------------------------------------------------------------------------------
// A6.4 · Checkout
// ---------------------------------------------------------------------------------------------

private fun methodFor(mode: String?): Pair<String, String>? = when (mode) {
    "stripe" -> "Card" to "Visa, Mastercard, Amex"
    "zinipay" -> "Mobile wallet" to "bKash, Nagad and more"
    "dev" -> "Test payment" to "This server marks the fee paid without charging"
    else -> null
}

/** Pay Now from anywhere the fee shows (a conference card, the portal's payment lock). */
@Composable
fun PayFeeSheet(conf: Conference, onClose: () -> Unit) = CheckoutSheet(FeeRow(conf, getPaymentGate(conf.app, conf.event)), onClose)

@Composable
private fun CheckoutSheet(r: FeeRow, onClose: () -> Unit) {
    val c = palette
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val gateway by produceState<com.munpro.app.data.Gateway?>(null) { value = AppGraph.payments.gateway() }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun go() {
        busy = true
        error = null
        scope.launch {
            when (val res = AppGraph.payments.checkout(r.app.id, r.c.event.id)) {
                is CheckoutResult.Open -> {
                    onClose()
                    nav.go(PaymentConfirmRoute(r.app.id))
                    if (res.provider != "dev") context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(res.url)))
                }
                is CheckoutResult.Failed -> error = res.message
            }
            busy = false
        }
    }

    PageSheet(true, onClose) {
        SheetHeader("Pay ${formatFee(r.amount)}", leading = "Cancel", onLeading = onClose)
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = Space.gutter, end = Space.gutter, top = 8.dp, bottom = navBottom + 24.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(r.c.event.title, style = Type.headline, color = c.label)
                Text("${r.app.role.ifEmpty { "Participant" }} registration", style = Type.footnote, color = c.label2)
                Box(Modifier.fillMaxWidth().height(com.munpro.app.ui.kit.Hairline).background(c.separator))
                Row {
                    Column(Modifier.weight(1f)) {
                        Text(r.gate.tierLabel, style = Type.subhead, color = c.label)
                        r.gate.dueAt?.let { Text("Until ${day(it)}", style = Type.footnote, color = c.label2) }
                    }
                    Text(formatFee(r.amount), style = Type.subhead, color = c.label)
                }
                Row {
                    Text("Total", style = Type.headline, color = c.label, modifier = Modifier.weight(1f))
                    Text(formatFee(r.amount), style = Type.headline, color = c.label)
                }
            }
            val method = methodFor(gateway?.mode)
            Section(header = "Pay with", footer = "The method depends on the gateway the platform uses.") {
                when {
                    gateway == null -> item { Box(Modifier.padding(16.dp)) { Text("Checking the gateway…", style = Type.footnote, color = c.label2) } }
                    method == null -> cell("Secure checkout", subtitle = "Chosen by the platform", chevron = false, leading = { SfIcon(Icons.lock, c.tint, size = 20.dp) }, inset = 52.dp)
                    else -> cell(method.first, subtitle = method.second, chevron = false, leading = { SfIcon(Icons.card, c.tint, size = 20.dp) }, inset = 52.dp,
                        trailing = { SfIcon(Icons.check, c.tint, size = 18.dp) })
                }
            }
            ErrorText(error)
            MunButton("Continue to Secure Checkout", ::go, loading = busy, enabled = !busy)
        }
    }
}

// ---------------------------------------------------------------------------------------------
// A6.5 · Confirming payment
// ---------------------------------------------------------------------------------------------

private const val CONFIRM_WINDOW_MS = 90_000L

@Composable
fun PaymentConfirmScreen(appId: String) {
    val c = palette
    val nav = LocalNav.current
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()
    val conf = confs.conferences?.firstOrNull { it.app.id == appId }
    val status by remember(appId) { AppGraph.payments.paymentStatus(appId) }.collectAsStateWithLifecycle(null)
    var waitedOut by remember { mutableStateOf(false) }
    val paid = status == "paid"

    // ZiniPay's return trip is verified here (no signed webhook); Stripe's webhook flips the doc.
    LaunchedEffect(appId) {
        val until = System.currentTimeMillis() + CONFIRM_WINDOW_MS
        while (System.currentTimeMillis() < until) {
            if (AppGraph.payments.verify(appId) == "paid") break
            delay(5_000)
        }
        waitedOut = true
    }
    LaunchedEffect(paid) { if (paid) AppGraph.conferences.reload() }

    val gate = conf?.let { getPaymentGate(it.app, it.event) }
    Screen(back = "Payments", tabBar = false, gap = 20.dp) {
        Column(Modifier.fillMaxWidth().padding(top = 24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.size(84.dp).clip(CircleShape).background(if (paid) c.tintSoft else c.fillSoft), contentAlignment = Alignment.Center) {
                if (paid) SfIcon(Icons.check, c.tint, size = 40.dp)
                else CircularProgressIndicator(color = c.tint, strokeWidth = 3.dp, modifier = Modifier.size(40.dp))
            }
            Text(
                when { paid -> "Payment received"; waitedOut -> "Still waiting for the payment"; else -> "Confirming your payment" },
                style = Type.title2, color = c.label, textAlign = TextAlign.Center,
            )
            Text(
                when {
                    paid -> "Your conference portal is unlocked: committee, country, documents and live sessions."
                    waitedOut -> "If you finished paying, it can take a few minutes to clear. Pull down on Payments to check again. If you cancelled, nothing was charged."
                    else -> "Finish paying in the browser. This usually takes a few seconds once you're done; you can leave this screen."
                },
                style = Type.subhead, color = c.label2, textAlign = TextAlign.Center,
            )
        }
        if (conf != null && gate != null) Section {
            cell(conf.event.title, subtitle = listOf(conf.app.role, gate.tierLabel).filter { it.isNotEmpty() }.distinct().joinToString(" · "),
                value = formatFee(conf.app.paidAmount?.takeIf { it > 0 } ?: gate.amount), chevron = false)
        }
        if (paid) {
            MunButton("Open the conference", { nav.go(ConferenceRoute(conf?.event?.id ?: return@MunButton)) })
            MunButton("View receipt", { nav.go(ReceiptRoute(appId)) }, variant = ButtonVariant.Tinted)
        } else if (waitedOut) {
            MunButton("Back to Payments", { nav.back() }, variant = ButtonVariant.Tinted)
        }
    }
}

// ---------------------------------------------------------------------------------------------
// A6.6 · Receipt
// ---------------------------------------------------------------------------------------------

@Composable
fun ReceiptScreen(appId: String) {
    val c = palette
    val context = LocalContext.current
    val goBack = LocalBack.current
    val confs by AppGraph.conferences.state.collectAsStateWithLifecycle()
    val conf = confs.conferences?.firstOrNull { it.app.id == appId }
    val me = com.munpro.app.ui.profile.rememberOwnProfile()

    Screen(back = "Payments", tabBar = false, navTitle = "Receipt", navRight = {
        if (conf != null) com.munpro.app.ui.kit.TextLink("Share", { share(context, receiptOf(conf, me)) }, style = Type.body.copy(fontWeight = FontWeight.SemiBold))
    }) {
        if (conf == null) { Spinner(); return@Screen }
        val r = receiptOf(conf, me)
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.cell)).background(c.cell).padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            com.munpro.app.ui.kit.Chip(r.status, if (r.refunded) Tone.Info else Tone.Tint, dot = true)
            Text("Receipt · #${r.number}", style = Type.footnote, color = c.label2)
            Text(formatFee(r.amount), fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 34.sp, letterSpacing = (-1.2).sp, color = c.label)
            Text(listOfNotNull(r.status, r.paidOn, r.method).joinToString(" · "), style = Type.footnote, color = c.label2)
        }
        Section {
            cell("Event", value = r.event, chevron = false)
            cell("Role · tier", value = listOf(r.role, r.tier).filter { it.isNotEmpty() }.distinct().joinToString(" · "), chevron = false)
            r.eventDate?.let { cell("Event date", value = it, chevron = false) }
            cell("Billed to", value = r.billedTo, chevron = false)
            r.address?.let { cell("Address", subtitle = it, chevron = false) }
            cell("Total", value = formatFee(r.amount), chevron = false)
        }
        MunButton("Save as PDF", { printReceipt(context, r) }, variant = ButtonVariant.Tinted)
        MunButton("Done", goBack)
    }
}

/** What the web's printable receipt says, plus the paid date, method and billing address. */
private data class Receipt(
    val number: String, val status: String, val refunded: Boolean, val amount: Double,
    val event: String, val role: String, val tier: String, val eventDate: String?,
    val billedTo: String, val address: String?, val paidOn: String?, val method: String?, val issued: String,
)

private fun receiptOf(conf: Conference, me: com.munpro.app.domain.PublicProfile?): Receipt {
    val app = conf.app
    val gate = getPaymentGate(app, conf.event)
    val refunded = app.paymentStatus == "refunded"
    val address = me?.let { p -> listOf(p.street, p.city, p.postalCode, p.state, p.country).mapNotNull { it?.trim()?.ifEmpty { null } }.joinToString(", ").ifEmpty { null } }
    return Receipt(
        number = app.id.take(8).uppercase(),
        status = if (refunded) "Refunded" else "Paid",
        refunded = refunded,
        amount = app.paidAmount?.takeIf { it > 0 } ?: gate.amount,
        event = conf.event.title,
        role = app.role,
        tier = gate.tierLabel,
        eventDate = com.munpro.app.domain.getEventStartMs(conf.event)?.let(::day),
        billedTo = app.applicantName?.ifEmpty { null } ?: me?.name ?: AppGraph.auth.user?.email.orEmpty(),
        address = address,
        paidOn = app.paidAt?.let(::day),
        method = when (app.paymentProvider) {
            "stripe" -> "Card"
            "zinipay" -> app.paymentMethod?.ifEmpty { null } ?: "Mobile wallet"
            "dev" -> "Test payment"
            else -> null
        },
        issued = day(System.currentTimeMillis()),
    )
}

private fun share(context: Context, r: Receipt) {
    val text = buildString {
        appendLine("MUN Pilot receipt #${r.number}")
        appendLine("${r.event} · ${listOf(r.role, r.tier).filter { it.isNotEmpty() }.distinct().joinToString(" · ")}")
        appendLine("${r.status}: ${formatFee(r.amount)}" + (r.paidOn?.let { " on $it" } ?: "") + (r.method?.let { " · $it" } ?: ""))
        append("Billed to ${r.billedTo}")
    }
    context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), "Share receipt"))
}

private fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

/** Held until the print job has its adapter; a WebView nobody references can be collected first. */
private var printing: WebView? = null

/** The web's printable receipt, through Android's print dialog (which offers Save as PDF). */
private fun printReceipt(context: Context, r: Receipt) {
    val rows = listOfNotNull(
        "Receipt No." to "#${r.number}", "Status" to r.status, "Billed to" to r.billedTo,
        r.address?.let { "Address" to it }, "Role" to listOf(r.role, r.tier).filter { it.isNotEmpty() }.distinct().joinToString(" · "),
        r.eventDate?.let { "Event date" to it }, r.paidOn?.let { "Paid" to (it + (r.method?.let { m -> " · $m" } ?: "")) }, "Issued" to r.issued,
    )
    val html = """
        <!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body{font-family:sans-serif;color:#1e293b;margin:32px}
        h1{font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#0B6E4F;margin:0}
        h2{font-size:22px;margin:4px 0 24px}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 24px;margin-bottom:28px}
        .l{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;font-weight:600}
        .v{font-size:15px;font-weight:600;margin-top:3px}
        table{width:100%;border-collapse:collapse}td{padding:14px 0;border-bottom:1px solid #f1f5f9}
        td:last-child{text-align:right}.t td{font-weight:700;font-size:18px;border:none}
        .f{margin-top:32px;font-size:12px;color:#94a3b8}
        </style></head><body>
        <h1>Payment receipt</h1><h2>${esc(r.event)}</h2>
        <div class="grid">${rows.joinToString("") { (l, v) -> "<div><div class=\"l\">${esc(l)}</div><div class=\"v\">${esc(v)}</div></div>" }}</div>
        <table><tr><td>${esc(r.tier.ifEmpty { r.role })} registration</td><td>${esc(formatFee(r.amount))}</td></tr>
        <tr class="t"><td>Total ${if (r.refunded) "refunded" else "paid"}</td><td>${esc(formatFee(r.amount))}</td></tr></table>
        <div class="f">Generated by MUN Pilot · ${esc(r.issued)}</div>
        </body></html>
    """.trimIndent()
    val view = WebView(context)
    printing = view
    view.webViewClient = object : WebViewClient() {
        override fun onPageFinished(v: WebView, url: String?) {
            val pm = context.getSystemService(Context.PRINT_SERVICE) as PrintManager
            pm.print("MUN Pilot receipt ${r.number}", v.createPrintDocumentAdapter("receipt-${r.number}"), PrintAttributes.Builder().build())
            printing = null
        }
    }
    view.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
}
