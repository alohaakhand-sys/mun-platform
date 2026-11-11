"use client";

import { motion } from "framer-motion";
import { Calendar, MapPin, Users, ChevronRight, CheckCircle2, Clock, XCircle, Ban, Hourglass, CreditCard, Lock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PaymentGate, formatFee, formatDueDate, formatDueLabel, paymentsHref } from "@/lib/services/paymentGate";

export type ConferenceStatus =
  | "pending" | "approved" | "rejected" | "past"
  | "withdrawn" | "completed" | "waitlisted" | "active";

interface ConferenceCardProps {
  id: string;
  name: string;
  date: string;
  location: string;
  role: string;
  committee: string;
  country?: string;
  status: ConferenceStatus;
  delay?: number;
  /** Registration-fee state. When the fee is outstanding the card leads with it. */
  payment?: PaymentGate;
  /** Application + event ids — deep-link the Pay CTA to this row on the Payments page.
      (`id` above is whatever the portal route accepts, which may be either one.) */
  applicationId?: string;
  eventId?: string;
}

export function ConferenceCard({
  id,
  name,
  date,
  location,
  role,
  committee,
  country,
  status,
  delay = 0,
  payment,
  applicationId,
  eventId,
}: ConferenceCardProps) {
  // An unpaid seat isn't a normal "Pending" application — the delegate's next action is
  // to pay, not to wait. The card says so instead of offering the portal.
  const unpaid = payment?.blocksPortal === true;
  const getStatusConfig = () => {
    switch (status) {
      case "approved":
        return { icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10", label: "Approved", border: "border-green-500/20" };
      case "pending":
        return { icon: Clock, color: "text-yellow-500", bg: "bg-yellow-500/10", label: "Pending", border: "border-yellow-500/20" };
      case "rejected":
        return { icon: XCircle, color: "text-red-500", bg: "bg-red-500/10", label: "Waitlisted/Rejected", border: "border-red-500/20" };
      case "waitlisted":
        return { icon: Hourglass, color: "text-blue-500", bg: "bg-blue-500/10", label: "Waitlisted", border: "border-blue-500/20" };
      case "active":
        return { icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10", label: "Active", border: "border-green-500/20" };
      case "withdrawn":
        return { icon: Ban, color: "text-muted-foreground", bg: "bg-muted/50", label: "Withdrawn", border: "border-border/50" };
      case "completed":
      case "past":
        return { icon: CheckCircle2, color: "text-muted-foreground", bg: "bg-muted/50", label: "Completed", border: "border-border/50" };
      default:
        return { icon: Clock, color: "text-muted-foreground", bg: "bg-muted/50", label: String(status || "Unknown"), border: "border-border/50" };
    }
  };

  const config = unpaid
    ? payment!.overdue
      ? { icon: AlertTriangle, color: "text-red-600", bg: "bg-red-500/10", label: "Payment Overdue", border: "border-red-500/30" }
      : { icon: CreditCard, color: "text-amber-600", bg: "bg-amber-500/10", label: "Payment Required", border: "border-amber-500/30" }
    : getStatusConfig();
  const StatusIcon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="glass-card rounded-2xl overflow-hidden hover:border-primary/30 transition-all group"
    >
      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors mb-1">
              {name}
            </h3>
            <div className="flex items-center text-sm text-muted-foreground gap-4">
              <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {date}</span>
              <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {location}</span>
            </div>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${config.bg} ${config.color} ${config.border}`}>
            <StatusIcon className="w-3.5 h-3.5" />
            {config.label}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 my-6">
          <div className="bg-secondary dark:bg-black/10 rounded-xl p-3 border border-border/40">
            <p className="text-xs text-muted-foreground mb-1">Role & Committee</p>
            <p className="font-medium text-sm text-foreground flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              {role} • {committee}
            </p>
          </div>
          <div className="bg-secondary dark:bg-black/10 rounded-xl p-3 border border-border/40">
            <p className="text-xs text-muted-foreground mb-1">Assigned Country</p>
            <p className="font-medium text-sm text-foreground">
              {country || "Pending Assignment"}
            </p>
          </div>
        </div>
        
        {/* Outstanding registration fee — amount, deadline, and the one action that
            clears it. Replaces the review tracker: nothing is "under review" until the
            seat is paid for. */}
        {unpaid && (
          <div
            className={`mb-6 rounded-xl border p-4 ${
              payment!.overdue
                ? "border-red-500/30 bg-red-500/5"
                : "border-amber-500/30 bg-amber-500/5"
            }`}
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">
                  {payment!.tierLabel} fee — registration is not confirmed until this is paid
                </p>
                <p className="text-2xl font-bold tracking-tight text-foreground">
                  {formatFee(payment!.amount)}
                </p>
              </div>
              {formatDueDate(payment!) && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground mb-0.5">Pay by</p>
                  <p className="text-sm font-semibold text-foreground">{formatDueDate(payment!)}</p>
                  <p className={`text-xs font-medium ${payment!.overdue ? "text-red-600" : "text-amber-600"}`}>
                    {formatDueLabel(payment!)}
                  </p>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {payment!.overdue
                ? "The deadline has passed — pay now or contact the organizer before your seat is released."
                : "Your committee, country and conference portal unlock as soon as payment clears."}
            </p>
          </div>
        )}

        {/* Status Tracker */}
        {!unpaid && status !== "past" && (
          <div className="mb-6 relative">
            <div className="absolute top-2 left-0 w-full h-1 bg-secondary rounded-full overflow-hidden">
              <div 
                className={`h-full ${status === 'approved' ? 'bg-green-500 w-full' : status === 'pending' ? 'bg-yellow-500 w-1/2' : 'bg-red-500 w-full'}`}
              />
            </div>
            <div className="flex justify-between relative z-10 pt-4 text-xs text-muted-foreground">
              <span>Applied</span>
              <span className="text-center">Under Review</span>
              <span className="text-right">Decision</span>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-border/40">
          {unpaid ? (
            <>
              {/* The portal is behind the paywall, so it reads as locked rather than
                  quietly vanishing — a delegate who expected it should know why. */}
              <Button
                variant="outline"
                disabled
                className="bg-transparent border-border/60 text-muted-foreground"
                title="Available once your registration fee is paid"
              >
                <Lock className="w-4 h-4 mr-1.5" />
                Portal Locked
              </Button>
              <Button
                className={payment!.overdue
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-amber-600 hover:bg-amber-700 text-white"}
                render={<Link href={paymentsHref(applicationId, eventId)} />}
                nativeButton={false}
              >
                <CreditCard className="w-4 h-4 mr-1.5" />
                Pay {formatFee(payment!.amount)}
                <ChevronRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="bg-transparent border-border/60 hover:bg-secondary" render={<Link href={`/dashboard/conferences/${id}`} />} nativeButton={false}>
                View Details
              </Button>
              <Button render={<Link href={`/dashboard/conferences/${id}`} />} nativeButton={false}>
                Go to Portal
                <ChevronRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
              </Button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
