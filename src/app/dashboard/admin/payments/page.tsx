"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminGuard } from "@/lib/hooks/useAdminGuard";
import { getSystemSettings, updateSystemSettings, PaymentMode } from "@/lib/services/systemSettingsService";
import { auth } from "@/lib/firebase/client";

// Payouts come from /api/admin/payouts with each pending organizer's wallet (server math).
type AdminPayout = {
  id: string; organizerId: string; organizerName: string; organizerEmail: string; amount: number;
  status: "pending" | "paid" | "rejected"; note: string; adminNote: string; reference: string;
  requestedAt: number | null; processedAt: number | null;
};
type Wallet = { gross: number; fees: number; earned: number; reserved: number; available: number };

async function adminFetch(path: string, body?: unknown) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}
import { logAudit } from "@/lib/services/auditService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CreditCard, CheckCircle2, AlertTriangle, XCircle, Clock, Loader2, Wallet, Smartphone, FlaskConical,
} from "lucide-react";

interface GatewayStatus {
  activeMode: PaymentMode;
  requestedMode: PaymentMode;
  zinipayMultiplier: number;
  zinipayCurrency: string;
  stripe: {
    configured: boolean; webhookConfigured: boolean; publishableConfigured: boolean;
    publishableKey: string | null; mode: string; ready: boolean;
  };
  zinipay: { configured: boolean; mode: string; ready: boolean };
  dev: { allowed: boolean };
}

const MODES: { id: PaymentMode; label: string; blurb: string; icon: typeof CreditCard }[] = [
  { id: "stripe", label: "Stripe", blurb: "Cards, USD. Hosted Checkout + signed webhook.", icon: CreditCard },
  { id: "zinipay", label: "ZiniPay", blurb: "bKash / Nagad, BDT. Hosted invoice + verify.", icon: Smartphone },
  { id: "dev", label: "Developer", blurb: "No gateway — marks registrations paid instantly.", icon: FlaskConical },
];

export default function AdminPaymentsPage() {
  const { authorized, profile } = useAdminGuard();
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [payouts, setPayouts] = useState<AdminPayout[]>([]);
  const [wallets, setWallets] = useState<Record<string, Wallet>>({});
  const [notes, setNotes] = useState<Record<string, { note: string; reference: string }>>({});
  const [payoutError, setPayoutError] = useState("");
  const [platformFee, setPlatformFee] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Draft gateway settings — nothing is written until "Save payment mode".
  const [mode, setMode] = useState<PaymentMode>("stripe");
  const [multiplier, setMultiplier] = useState("1");
  const [currency, setCurrency] = useState("BDT");
  const [savingMode, setSavingMode] = useState(false);
  const [savedMode, setSavedMode] = useState(false);

  // `syncDraft` only on the first load. The status route serves a 60s-cached config, so
  // re-syncing after a save would snap the selection back to the pre-save mode.
  const loadStatus = useCallback(async (syncDraft = true) => {
    try {
      const res = await fetch("/api/payments/status");
      if (res.ok) {
        const data: GatewayStatus = await res.json();
        setStatus(data);
        if (syncDraft) {
          setMode(data.requestedMode);
          setMultiplier(String(data.zinipayMultiplier ?? 1));
          setCurrency(data.zinipayCurrency || "BDT");
        }
      }
    } catch (err) {
      console.error("Failed to load payment status:", err);
    }
  }, []);

  useEffect(() => {
    if (!authorized) return;
    (async () => {
      await loadStatus();
      try {
        const settings = await getSystemSettings();
        setPlatformFee(settings.platformFeePercent);
      } catch (err) {
        console.error("Failed to load settings:", err);
      }
      await loadPayouts();
      setLoading(false);
    })();
  }, [authorized, loadStatus]);

  const saveMode = async () => {
    if (!profile) return;
    setSavingMode(true);
    try {
      const rate = parseFloat(multiplier);
      await updateSystemSettings({
        paymentMode: mode,
        zinipayMultiplier: rate > 0 ? rate : 1,
        zinipayCurrency: currency.trim().toUpperCase() || "BDT",
      });
      await logAudit({
        actorUid: profile.uid, actorEmail: profile.email || "", actorRole: profile.role,
        action: "payment_mode_updated",
        targetType: "systemSettings", targetId: "global",
        targetName: `Payment mode → ${mode}`,
      });
      await loadStatus(false);
      setSavedMode(true);
      setTimeout(() => setSavedMode(false), 2500);
    } catch (err) {
      console.error("Failed to save payment mode:", err);
    } finally {
      setSavingMode(false);
    }
  };

  async function loadPayouts() {
    try {
      const data = await adminFetch("/api/admin/payouts");
      setPayouts(data.payouts || []);
      setWallets(data.wallets || {});
    } catch (err: any) {
      setPayoutError(err.message);
    }
  }

  // The server settles it, notifies the organizer and writes the audit entry.
  const handlePayout = async (payout: AdminPayout, next: "paid" | "rejected") => {
    setProcessingId(payout.id);
    setPayoutError("");
    try {
      const n = notes[payout.id] || { note: "", reference: "" };
      await adminFetch("/api/admin/payouts/decide", { payoutId: payout.id, status: next, note: n.note, reference: n.reference });
      await loadPayouts();
    } catch (err: any) {
      setPayoutError(err.message);
    }
    setProcessingId(null);
  };

  if (!authorized) return null;

  const pendingPayouts = payouts.filter(p => p.status === "pending");
  const modeReady = (id: PaymentMode) =>
    id === "stripe" ? !!status?.stripe.configured
    : id === "zinipay" ? !!status?.zinipay.configured
    : !!status?.dev.allowed;
  // The server silently falls back when the chosen gateway has no credentials, so say so
  // rather than letting the panel claim a mode that isn't the one taking money.
  const fellBack = !!status && status.activeMode !== status.requestedMode;

  const KeyChip = ({ label, ok }: { label: string; ok: boolean }) => (
    <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
      <span>{label}</span>
      {ok
        ? <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3 mr-1" /> Set</Badge>
        : <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200"><XCircle className="w-3 h-3 mr-1" /> Missing</Badge>}
    </div>
  );

  return (
    <div className="space-y-8 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
        <p className="text-muted-foreground mt-1">Gateway mode, credentials and organizer payouts.</p>
      </div>

      {/* Gateway mode — platform-wide */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CreditCard className="w-5 h-5" /> Payment Mode</CardTitle>
          <CardDescription>
            Picks which gateway every registration fee is collected through, platform-wide. API keys
            are never editable here — they live in server environment variables
            (<code>STRIPE_SECRET_KEY</code>, <code>ZINIPAY_API_KEY</code>). A mode with missing keys
            can&apos;t be used; checkout falls back to whichever gateway is configured.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {loading || !status ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Checking gateways…</p>
          ) : (
            <>
              {fellBack && (
                <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                  <div>
                    <p className="font-medium">Selected mode isn&apos;t usable</p>
                    <p className="text-sm text-muted-foreground">
                      <span className="capitalize">{status.requestedMode}</span> has no credentials, so
                      checkout is running on <span className="capitalize font-medium">{status.activeMode}</span>.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {MODES.map(({ id, label, blurb, icon: Icon }) => {
                  const selected = mode === id;
                  const ready = modeReady(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setMode(id)}
                      className={`text-left rounded-xl border p-4 transition-colors ${
                        selected ? "border-primary bg-primary/5" : "border-border/60 hover:bg-secondary"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 font-medium"><Icon className="w-4 h-4" /> {label}</span>
                        {status.activeMode === id && (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px]">ACTIVE</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">{blurb}</p>
                      <p className={`text-[11px] mt-2 ${ready ? "text-green-600" : "text-amber-600"}`}>
                        {ready ? "Credentials present" : id === "dev" ? "ALLOW_DEV_PAYMENTS not enabled" : "API key missing"}
                      </p>
                    </button>
                  );
                })}
              </div>

              {mode === "zinipay" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border p-4">
                  <div className="space-y-2">
                    <Label>Amount multiplier</Label>
                    <Input
                      type="number" min="0.0001" step="0.01"
                      value={multiplier}
                      onChange={(e) => setMultiplier(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Role-tier price × this = the amount charged. Leave at <code>1</code> if tier prices
                      are already in {currency || "BDT"}; set it to the conversion rate if they aren&apos;t.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Charge currency</Label>
                    <Input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="BDT" />
                    <p className="text-xs text-muted-foreground">
                      Label recorded on paid registrations. ZiniPay settles in BDT.
                    </p>
                  </div>
                </div>
              )}

              {mode === "dev" && (
                <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                  <p className="text-sm text-muted-foreground">
                    Developer mode collects no money — every registration is marked paid on click. It is
                    ignored unless <code>ALLOW_DEV_PAYMENTS=true</code> and the Stripe key is not a live key.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button onClick={saveMode} disabled={savingMode}>
                  {savingMode ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save payment mode"}
                </Button>
                {savedMode && (
                  <span className="text-sm text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Saved — live within a minute
                  </span>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Credential status per gateway */}
      {!loading && status && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><CreditCard className="w-4 h-4" /> Stripe</CardTitle>
              <CardDescription>Single platform account. Keys are server-only.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className={`flex items-center gap-3 rounded-xl border p-4 ${status.stripe.ready ? "border-green-500/30 bg-green-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
                {status.stripe.ready
                  ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                  : <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />}
                <div>
                  <p className="font-medium">{status.stripe.ready ? "Ready end to end" : "Not fully configured"}</p>
                  <p className="text-sm text-muted-foreground">
                    {status.stripe.ready
                      ? `Key mode: ${status.stripe.mode}.`
                      : "Set the missing environment variables, then redeploy."}
                  </p>
                </div>
              </div>
              <KeyChip label="Secret Key" ok={status.stripe.configured} />
              <KeyChip label="Webhook Secret" ok={status.stripe.webhookConfigured} />
              <KeyChip label="Publishable Key" ok={status.stripe.publishableConfigured} />
              {status.stripe.publishableKey && (
                <p className="text-xs text-muted-foreground break-all">Publishable key: {status.stripe.publishableKey}</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Smartphone className="w-4 h-4" /> ZiniPay</CardTitle>
              <CardDescription>Hosted invoice; every payment is re-verified server-side.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className={`flex items-center gap-3 rounded-xl border p-4 ${status.zinipay.ready ? "border-green-500/30 bg-green-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
                {status.zinipay.ready
                  ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                  : <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />}
                <div>
                  <p className="font-medium">{status.zinipay.ready ? "Ready end to end" : "API key missing"}</p>
                  <p className="text-sm text-muted-foreground">
                    {status.zinipay.ready
                      ? `Key mode: ${status.zinipay.mode}.`
                      : "Set ZINIPAY_API_KEY in .env.local, then redeploy."}
                  </p>
                </div>
              </div>
              <KeyChip label="API Key (ZINIPAY_API_KEY)" ok={status.zinipay.configured} />
              {status.zinipay.mode === "sandbox" && (
                <p className="text-xs text-amber-600">Sandbox key detected — no real money moves.</p>
              )}
              <p className="text-xs text-muted-foreground">
                ZiniPay rejects a redirect URL whose domain doesn&apos;t match the brand&apos;s registered
                website, so <code>NEXT_PUBLIC_APP_URL</code> must be the deployed origin.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {platformFee !== null && (
        <p className="text-xs text-muted-foreground">Platform fee: {platformFee}% (configure in System Settings → Pricing).</p>
      )}

      {/* Payout queue */}
      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Wallet className="w-5 h-5" /> Organizer Payout Requests</CardTitle>
            <CardDescription>Review and fulfill payout requests, then mark them paid.</CardDescription>
          </div>
          {!loading && pendingPayouts.length > 0 && <Badge variant="destructive">{pendingPayouts.length} pending</Badge>}
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : payouts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No payout requests.</p>
          ) : (
            <div className="space-y-3">
              {payoutError && <p className="text-sm text-destructive">{payoutError}</p>}
              {payouts.map((p) => {
                const w = wallets[p.organizerId];
                // The wallet already counts this pending request as reserved: add it back to compare.
                const room = w ? w.available + p.amount : null;
                const over = p.status === "pending" && room != null && p.amount > room + 0.005;
                return (
                <div key={p.id} className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border rounded-xl p-4">
                  <div className="space-y-1">
                    <p className="font-medium">{p.organizerName} — ${p.amount.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.organizerEmail} · {p.requestedAt ? new Date(p.requestedAt).toLocaleDateString() : "—"}
                    </p>
                    {p.status === "pending" && w && (
                      <p className={`text-xs ${over ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                        Earned ${w.earned.toLocaleString()} (paid ${w.gross.toLocaleString()} − fees ${w.fees.toLocaleString()}) · available for this request ${room!.toLocaleString()}
                        {over ? " · MORE THAN EARNED" : ""}
                      </p>
                    )}
                    {p.status !== "pending" && (p.reference || p.adminNote) && (
                      <p className="text-xs text-muted-foreground">{[p.reference && `Ref ${p.reference}`, p.adminNote].filter(Boolean).join(" · ")}</p>
                    )}
                    {p.status === "pending" && (
                      <div className="flex flex-col sm:flex-row gap-2 pt-1">
                        <Input className="h-8 text-xs" placeholder="Transaction reference"
                          value={notes[p.id]?.reference || ""} onChange={(e) => setNotes((m) => ({ ...m, [p.id]: { note: m[p.id]?.note || "", reference: e.target.value } }))} />
                        <Input className="h-8 text-xs" placeholder="Note to the organizer"
                          value={notes[p.id]?.note || ""} onChange={(e) => setNotes((m) => ({ ...m, [p.id]: { reference: m[p.id]?.reference || "", note: e.target.value } }))} />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {p.status === "pending" ? (
                      <>
                        <Button size="sm" variant="outline" disabled={processingId === p.id} onClick={() => handlePayout(p, "rejected")}>
                          Reject
                        </Button>
                        <Button size="sm" disabled={processingId === p.id} onClick={() => handlePayout(p, "paid")}>
                          {processingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Mark Paid"}
                        </Button>
                      </>
                    ) : p.status === "paid" ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3 mr-1" /> Paid</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200"><Clock className="w-3 h-3 mr-1" /> Rejected</Badge>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
