import { describe, it, expect, vi } from "vitest";

// paymentGate pulls its pricing helpers from eventService, which reaches for the browser
// Firebase app at import time. The gate itself is pure, so stub the SDK handles out.
vi.mock("@/lib/firebase/client", () => ({
  app: {}, auth: {}, db: {}, storage: {}, rtdb: {}, functions: {},
}));

import { getPaymentGate, formatFee, formatDueLabel } from "./paymentGate";

// Mirrors the live DMUNC '26 config: $25 Delegate, $15 Head Delegate, early-bird window
// open with no separate early price (so the base price applies), free Observer.
const EVENT = {
  id: "evt1",
  date: "2026-08-15T09:00",
  applicationSchedule: { earlyBird: { enabled: true, endAt: "2026-08-01T11:55" } },
  roleTiers: [
    { role: "Delegate", enabled: true, price: 25, label: "Delegate" },
    { role: "Head Delegate", enabled: true, price: 15 },
    { role: "Observer", enabled: false, price: 0 },
    { role: "Team Delegation Lead", enabled: true, price: 40 },
  ],
} as any;

const FREE_EVENT = {
  id: "evt2",
  date: "2026-08-15T09:00",
  roleTiers: [{ role: "Delegate", enabled: true, price: 0 }],
} as any;

const NOW = new Date("2026-07-28T10:00:00Z");
const app = (over: Record<string, unknown> = {}) =>
  ({ role: "Delegate", status: "pending", ...over } as any);

describe("getPaymentGate", () => {
  it("blocks the portal for an unpaid delegate on a paid event", () => {
    const g = getPaymentGate(app(), EVENT, NOW);
    expect(g.required).toBe(true);
    expect(g.amount).toBe(25);
    expect(g.status).toBe("due");
    expect(g.blocksPortal).toBe(true);
    expect(g.overdue).toBe(false);
  });

  it("lets a paid delegate through", () => {
    const g = getPaymentGate(app({ paymentStatus: "paid" }), EVENT, NOW);
    expect(g.status).toBe("paid");
    expect(g.blocksPortal).toBe(false);
  });

  it("never gates a free event", () => {
    const g = getPaymentGate(app(), FREE_EVENT, NOW);
    expect(g.required).toBe(false);
    expect(g.blocksPortal).toBe(false);
  });

  it("never gates a free ROLE on a paid event", () => {
    // Observer is disabled → no tier → no fee, even though Delegate costs $25.
    const g = getPaymentGate(app({ role: "Observer" }), EVENT, NOW);
    expect(g.required).toBe(false);
    expect(g.blocksPortal).toBe(false);
  });

  it("prices each role from its own tier", () => {
    expect(getPaymentGate(app({ role: "Head Delegate" }), EVENT, NOW).amount).toBe(15);
  });

  it("multiplies a team role by member count", () => {
    const g = getPaymentGate(app({ role: "Team Delegation Lead", teamSize: 4 }), EVENT, NOW);
    expect(g.amount).toBe(160);
  });

  it("uses the active pricing window's deadline as the due date", () => {
    const g = getPaymentGate(app(), EVENT, NOW);
    expect(g.dueAt).toBe(new Date("2026-08-01T11:55").getTime());
    expect(g.daysLeft).toBeGreaterThan(0);
  });

  it("flags overdue once the window has passed", () => {
    const late = new Date("2026-08-14T10:00:00Z"); // past early-bird end, before event
    const g = getPaymentGate(app(), EVENT, late);
    expect(g.overdue).toBe(true);
    expect(g.blocksPortal).toBe(true);
    expect(formatDueLabel(g)).toMatch(/overdue/i);
  });

  it("says 'Overdue', never 'Due today', in the hours just past the deadline", () => {
    // Regular-phase deadline is event start - 1 day = 2026-08-14T09:00 local.
    const justPast = new Date("2026-08-14T09:00") ;
    justPast.setHours(justPast.getHours() + 1);
    const g = getPaymentGate(app(), EVENT, justPast);
    expect(g.overdue).toBe(true);
    expect(formatDueLabel(g)).toBe("Overdue");
  });

  it("stops demanding money from a rejected or withdrawn application", () => {
    expect(getPaymentGate(app({ status: "rejected" }), EVENT, NOW).blocksPortal).toBe(false);
    expect(getPaymentGate(app({ status: "withdrawn" }), EVENT, NOW).blocksPortal).toBe(false);
  });

  it("is inert without an application or event", () => {
    expect(getPaymentGate(null, EVENT, NOW).blocksPortal).toBe(false);
    expect(getPaymentGate(app(), null, NOW).blocksPortal).toBe(false);
  });
});

describe("formatting", () => {
  it("drops cents on whole amounts", () => {
    expect(formatFee(25)).toBe("$25");
    expect(formatFee(1250)).toBe("$1,250");
    expect(formatFee(12.5)).toBe("$12.50");
  });

  it("labels the countdown", () => {
    expect(formatDueLabel({ dueAt: 1, daysLeft: 0 } as any)).toBe("Due today");
    expect(formatDueLabel({ dueAt: 1, daysLeft: 1 } as any)).toBe("1 day left");
    expect(formatDueLabel({ dueAt: 1, daysLeft: 5 } as any)).toBe("5 days left");
    expect(formatDueLabel({ dueAt: 1, daysLeft: -2, overdue: true } as any)).toBe("2 days overdue");
    expect(formatDueLabel({ dueAt: 1, daysLeft: 0, overdue: true } as any)).toBe("Overdue");
  });
});
