import { redirect } from 'next/navigation';

// Person-level Pro applications were retired: Pro now belongs to an event, requested from that
// event's Plan page (src/lib/data/eventPlan.ts).
export default function ProApplicationPage() {
  redirect('/dashboard/organizer/pro');
}
