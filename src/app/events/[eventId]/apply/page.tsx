"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getEventById, EventData } from "@/lib/services/eventService";
import { hasUserAppliedToEvent } from "@/lib/services/applicationService";
import { ApplicationWizard } from "@/components/dashboard/wizard/ApplicationWizard";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

export default function ApplyPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [alreadyApplied, setAlreadyApplied] = useState(false);

  useEffect(() => {
    // Redirect if not logged in
    if (!authLoading && !user) {
      router.push(`/login?redirect=/events/${eventId}/apply`);
      return;
    }

    async function fetchEvent() {
      if (eventId && user) {
        // Block duplicate applications: if already applied, don't load the wizard.
        const [data, applied] = await Promise.all([
          getEventById(eventId),
          hasUserAppliedToEvent(user.uid, eventId),
        ]);
        setEvent(data);
        setAlreadyApplied(applied);
        setLoading(false);
      }
    }

    if (!authLoading && user) {
      fetchEvent();
    }
  }, [eventId, user, authLoading, router]);

  if (loading || authLoading) {
    return (
      <div className="mun-paper mp-page-end mp-apply" aria-busy="true">
        <div className="mp-apply-shell">
          <div className="mp-apply-skel">
            <div className="mp-skel" style={{ height: 14, width: 120 }} />
            <div className="mp-skel" style={{ height: 30, width: "66%" }} />
            <div className="mp-skel mp-apply-skel-card" />
          </div>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="mun-paper mp-page-end mp-apply">
        <div className="mp-apply-shell">
          <div className="mp-wiz-outcome">
            <h1 className="mp-wiz-outcome-title">Event Not Found</h1>
            <p>We couldn&apos;t find the event you&apos;re trying to apply for.</p>
            <button type="button" onClick={() => router.back()} className="mp-btn mp-btn-sec">
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (alreadyApplied) {
    return (
      <div className="mun-paper mp-page-end mp-apply">
        <div className="mp-apply-shell">
          <div className="mp-wiz-outcome">
            <span className="mp-wiz-outcome-icon is-mute" aria-hidden="true"><CheckCircle2 size={26} /></span>
            <h1 className="mp-wiz-outcome-title">Already Applied</h1>
            <p>
              You have already submitted an application for <b>{event.title}</b>. You can&apos;t apply twice.
            </p>
            <div className="mp-wiz-outcome-actions">
              <Link href="/dashboard/conferences" className="mp-btn mp-btn-solid">View your application</Link>
              <Link href={`/events/${eventId}`} className="mp-btn mp-btn-sec">Back to event</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mun-paper mp-page-end mp-apply">
      <div className="mp-apply-shell">
        <header className="mp-apply-head">
          <Link href={`/events/${eventId}`} className="mp-back mp-apply-back">
            <ArrowLeft size={16} aria-hidden="true" /> Back to event
          </Link>
          <h1>Application for {event.title}</h1>
          <p>
            Please fill out the details below carefully. Your preferences will be considered during the country assignment process.
          </p>
        </header>
        <ApplicationWizard event={event} userId={user?.uid || ""} />
      </div>
    </div>
  );
}
