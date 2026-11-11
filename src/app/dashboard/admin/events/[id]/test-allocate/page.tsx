"use client";

/**
 * App Admin test tool: place any user into a committee + country of one event without the
 * normal application review (DevAllocatePanel). It lives under /dashboard/admin because it
 * writes applications on other people's behalf, which the rules allow an App Admin only
 * (firestore.rules, applications create). Reached from the Events table's row menu.
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { Loader2, ArrowLeft } from "lucide-react";
import { useAdminGuard } from "@/lib/hooks/useAdminGuard";
import { DevAllocatePanel } from "@/components/features/organizer/DevAllocatePanel";

export default function AdminTestAllocatePage() {
  const { authorized, loading } = useAdminGuard();
  const params = useParams();
  const eventId = params.id as string;

  if (loading || !authorized) {
    return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/admin/events" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Events
        </Link>
        <h1 className="text-3xl font-bold tracking-tight mt-2">Test allocation</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Place a user straight into a committee and country for testing. Event {eventId}.
        </p>
      </div>
      <DevAllocatePanel />
    </div>
  );
}
