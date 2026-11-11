"use client";

/**
 * Full-page paywall for the delegate conference portal.
 *
 * A registration is not secured until the fee is received — so an unpaid delegate gets
 * this screen instead of the portal, with the amount, the deadline, exactly what is
 * being held back, and one button that goes to Payments. Financial-aid cases are handled
 * by the organizer marking the application paid, which is why the contact line is here.
 */

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  CreditCard, Lock, AlertTriangle, CalendarClock, ArrowLeft,
  FileText, Users, Radio, Utensils, Award, RefreshCw,
} from "lucide-react";
import {
  PaymentGate, formatFee, formatDueDate, formatDueLabel, paymentsHref,
} from "@/lib/services/paymentGate";

const LOCKED = [
  { icon: Users, label: "Committee & country confirmation" },
  { icon: FileText, label: "Study guides, position papers & documents" },
  { icon: Radio, label: "Live committee sessions" },
  { icon: Utensils, label: "Food, transport & accommodation modules" },
  { icon: Award, label: "Marks, results & certificates" },
];

export function PaymentRequiredGate({
  gate,
  eventTitle,
  role,
  applicationId,
  eventId,
  organizerEmail,
}: {
  gate: PaymentGate;
  eventTitle: string;
  role?: string;
  applicationId?: string;
  eventId?: string;
  organizerEmail?: string;
}) {
  const overdue = gate.overdue;
  const accent = overdue
    ? { text: "text-red-600", bg: "bg-red-500/10", border: "border-red-500/30", btn: "bg-red-600 hover:bg-red-700" }
    : { text: "text-amber-600", bg: "bg-amber-500/10", border: "border-amber-500/30", btn: "bg-amber-600 hover:bg-amber-700" };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-3xl mx-auto py-10"
    >
      <Link
        href="/dashboard/conferences"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> My Conferences
      </Link>

      <div className={`glass-card rounded-2xl border ${accent.border} overflow-hidden`}>
        <div className={`${accent.bg} px-6 py-5 border-b ${accent.border}`}>
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl ${accent.bg} border ${accent.border} flex items-center justify-center shrink-0`}>
              {overdue ? <AlertTriangle className={`w-5 h-5 ${accent.text}`} /> : <Lock className={`w-5 h-5 ${accent.text}`} />}
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                {overdue ? "Your registration payment is overdue" : "Complete your registration payment"}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {eventTitle}{role ? ` — ${role}` : ""}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">{gate.tierLabel} fee</p>
              <p className="text-4xl font-bold tracking-tight">{formatFee(gate.amount)}</p>
            </div>
            {formatDueDate(gate) && (
              <div className={`flex items-center gap-2 rounded-xl border ${accent.border} ${accent.bg} px-3 py-2`}>
                <CalendarClock className={`w-4 h-4 ${accent.text}`} />
                <div>
                  <p className="text-xs text-muted-foreground leading-tight">Pay by {formatDueDate(gate)}</p>
                  <p className={`text-sm font-semibold leading-tight ${accent.text}`}>{formatDueLabel(gate)}</p>
                </div>
              </div>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            {overdue
              ? "The payment window has closed. Pay now to keep your place — unpaid seats are released to waitlisted delegates, and the fee may have moved to a later pricing tier."
              : "Your seat is held but not confirmed. The fee is fixed by the pricing window your payment lands in, so paying earlier keeps the current rate."}
          </p>

          <div className="rounded-xl border border-border/50 bg-secondary p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Unlocks the moment payment clears
            </p>
            <ul className="grid sm:grid-cols-2 gap-2.5">
              {LOCKED.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon className="w-4 h-4 shrink-0 text-muted-foreground/70" />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              className={`${accent.btn} text-white shadow-sm`}
              render={<Link href={paymentsHref(applicationId, eventId)} />}
              nativeButton={false}
            >
              <CreditCard className="w-4 h-4 mr-1.5" />
              Pay {formatFee(gate.amount)}
            </Button>
            <Button
              variant="outline"
              className="bg-transparent border-border/60"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Already paid? Refresh
            </Button>
          </div>

          <p className="text-xs text-muted-foreground border-t border-border/40 pt-4">
            Payments confirm within a minute of checkout. Need a fee waiver or financial aid, or
            paid by another method?{" "}
            {organizerEmail ? (
              <a href={`mailto:${organizerEmail}`} className="text-primary hover:underline">
                Contact the organizer
              </a>
            ) : (
              "Contact the conference organizer"
            )}{" "}
            — they can mark your registration as paid.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
