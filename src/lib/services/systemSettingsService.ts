import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { PLAN_DEFAULTS, type PlanSettings } from "@/lib/data/eventPlan";

/** Payment gateway the whole platform checks out through. App Admin only. */
export type PaymentMode = "stripe" | "zinipay" | "dev";

/** Plan numbers (eventPlan.ts): Pro price, both fees, the Free caps and the AI quota. */
export interface SystemSettings extends PlanSettings {
  platformFeePercent: number;
  maxEventCapacity: number;
  allowGuestArticleComments: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  defaultEventTheme: string;
  supportEmail: string;
  termsLastUpdated: any;
  privacyLastUpdated: any;
  // ── Payments ───────────────────────────────────────────────────────────────
  // Only the CHOICE of gateway lives here. Credentials stay in server env vars
  // (STRIPE_SECRET_KEY, ZINIPAY_API_KEY …) and are never readable from Firestore.
  // The server resolves this in src/lib/payments/config.ts and falls back to a
  // configured gateway if the selected one has no keys.
  paymentMode?: PaymentMode;
  /** Fee units → ZiniPay charge units (BDT). 1 = the tier price is already the BDT amount. */
  zinipayMultiplier?: number;
  /** Display label for the ZiniPay charge currency. */
  zinipayCurrency?: string;
}

const DEFAULT_SETTINGS: SystemSettings = {
  ...PLAN_DEFAULTS,
  platformFeePercent: 7,
  maxEventCapacity: 5000,
  allowGuestArticleComments: false,
  maintenanceMode: false,
  maintenanceMessage: "System is under maintenance. Please check back later.",
  defaultEventTheme: "light",
  supportEmail: "support@example.com",
  termsLastUpdated: serverTimestamp(),
  privacyLastUpdated: serverTimestamp(),
  paymentMode: "stripe",
  zinipayMultiplier: 1,
  zinipayCurrency: "BDT",
};

const SETTINGS_DOC_REF = "systemSettings/global";

export async function getSystemSettings(): Promise<SystemSettings> {
  const docRef = doc(db, SETTINGS_DOC_REF);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    // Merged over the defaults so fields added later (e.g. paymentMode) read sensibly
    // on documents written before they existed — no migration needed.
    return { ...DEFAULT_SETTINGS, ...(snap.data() as SystemSettings) };
  }
  // Initialize default if not exists
  await setDoc(docRef, DEFAULT_SETTINGS);
  const newSnap = await getDoc(docRef);
  return newSnap.data() as SystemSettings;
}

export async function updateSystemSettings(updates: Partial<SystemSettings>): Promise<void> {
  const docRef = doc(db, SETTINGS_DOC_REF);
  await updateDoc(docRef, updates);
}
