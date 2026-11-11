"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

// The applications workflow moved into the unified Allocation tab. Redirect any
// old /applications deep links (and the optional ?tab=) there.
export default function ApplicationsRedirect() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  useEffect(() => {
    const query = typeof window !== "undefined" ? window.location.search : "";
    router.replace(`/dashboard/organizer/events/${eventId}/allocation${query}`);
  }, [eventId, router]);

  return null;
}
