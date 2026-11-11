/**
 * ZiniPay REST client (server-only — the API key must never reach the browser).
 *
 * Two endpoints carry the whole flow:
 *   POST /v1/payment/create  → hosted invoice, returns `payment_url`
 *   POST /v1/payment/verify  → authoritative status for an invoice
 *
 * ZiniPay's webhook body is `{ invoice_id, status }` with NO signature, so it is only a
 * hint — nothing is ever marked paid from the webhook body alone. Both the webhook and
 * the browser redirect funnel into verifyInvoice(), which is the only thing we trust.
 */

const DEFAULT_BASE = "https://api.zinipay.com";

const baseUrl = () => (process.env.ZINIPAY_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "");
const apiKey = () => (process.env.ZINIPAY_API_KEY || "").trim();

export const isZiniPayConfigured = () => apiKey().length > 0;

/** Sandbox keys are prefixed `sandbox_` — surfaced in the admin panel so nobody ships a test key. */
export const ziniPayMode = (): "sandbox" | "live" | "unknown" => {
  const k = apiKey();
  if (!k) return "unknown";
  return k.startsWith("sandbox") ? "sandbox" : "live";
};

export type ZiniPayStatus = "PENDING" | "COMPLETED" | "FAILED";

export interface ZiniPayInvoice {
  invoiceId: string;
  paymentUrl: string;
}

export interface ZiniPayVerification {
  invoiceId: string;
  status: ZiniPayStatus;
  amount: number;
  transactionId?: string;
  paymentMethod?: string;
  raw: any;
}

async function call(path: string, body: Record<string, unknown>): Promise<any> {
  const key = apiKey();
  if (!key) throw new Error("ZINIPAY_API_KEY is not set");

  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "zini-api-key": key },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    throw new Error(data?.message || `ZiniPay ${path} failed (HTTP ${res.status})`);
  }
  return data;
}

/**
 * The create response documents only `payment_url`; the invoice id is the last URL
 * segment. Some deployments also echo it as a field, so those are preferred when present.
 */
function invoiceIdFrom(data: any): string {
  const direct = data?.invoice_id || data?.invoiceId || data?.data?.invoice_id;
  if (direct) return String(direct);
  const url = String(data?.payment_url || data?.paymentUrl || "");
  const seg = url.split("?")[0].split("/").filter(Boolean).pop();
  return seg || "";
}

export async function createInvoice(input: {
  amount: number;
  redirectUrl: string;
  cancelUrl?: string;
  webhookUrl?: string;
  customerName?: string;
  customerEmail?: string;
  /** Must stay under 1 KB of JSON — keep it to ids. */
  metadata?: Record<string, string>;
}): Promise<ZiniPayInvoice> {
  if (!(input.amount > 0)) throw new Error("ZiniPay amount must be greater than 0");

  const data = await call("/v1/payment/create", {
    cus_name: input.customerName || undefined,
    cus_email: input.customerEmail || undefined,
    amount: input.amount,
    metadata: input.metadata || undefined,
    redirect_url: input.redirectUrl,
    cancel_url: input.cancelUrl || undefined,
    webhook_url: input.webhookUrl || undefined,
  });

  const paymentUrl = String(data?.payment_url || data?.paymentUrl || "");
  if (data?.status === false || !paymentUrl) {
    throw new Error(data?.message || "ZiniPay did not return a payment URL");
  }
  return { invoiceId: invoiceIdFrom(data), paymentUrl };
}

export async function verifyInvoice(invoiceId: string): Promise<ZiniPayVerification> {
  const data = await call("/v1/payment/verify", { invoice_id: invoiceId });
  // Tolerate both a flat body and a `{ data: {...} }` envelope.
  const d = data?.data && typeof data.data === "object" ? data.data : data;
  const rawStatus = String(d?.status ?? "").toUpperCase();
  const status: ZiniPayStatus =
    rawStatus === "COMPLETED" || rawStatus === "SUCCESS" || rawStatus === "TRUE"
      ? "COMPLETED"
      : rawStatus === "FAILED" || rawStatus === "CANCELLED"
      ? "FAILED"
      : "PENDING";

  return {
    invoiceId: String(d?.invoice_id || d?.invoiceId || invoiceId),
    status,
    amount: Number(d?.amount ?? 0),
    transactionId: d?.transaction_id || d?.transactionId || undefined,
    paymentMethod: d?.payment_method || d?.paymentMethod || undefined,
    raw: data,
  };
}
