import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;
  
  let uid = null;
  let initialStats = null;
  let initialRecommendations = null;
  let error = null;

  if (sessionCookie) {
    try {
      const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);
      uid = decodedClaims.uid;
      
      const [userAppsSnap, userSnap, allEventsSnap, achievementsSnap] = await Promise.all([
        adminDb.collection("applications").where("userId", "==", uid).get(),
        adminDb.collection("users").doc(uid).get(),
        // Get next 50 upcoming events
        adminDb.collection("events")
          .where("status", "==", "published")
          .where("date", ">=", new Date().toISOString().split("T")[0])
          .orderBy("date", "asc")
          .limit(50)
          .get(),
        adminDb.collectionGroup("results")
          .where("delegateUid", "==", uid)
          .where("status", "==", "approved")
          .get()
      ]);
      
      const userApps = userAppsSnap.docs.map(d => d.data());
      const userData = userSnap.data() || {};
      const achievements = achievementsSnap.docs.map(d => d.data()).filter(r => r.awardType && r.awardType !== "none");
      // Unlisted events open by link only, so they are never recommended.
      const events = allEventsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((e: any) => e.visibility !== "unlisted");

      const upcoming = userApps.filter(a => a.status !== "past").length;
      const past = userApps.filter(a => a.status === "past").length;
      // Real stat counts
      const papers = userApps.filter(a => a.positionPaperUrl != null).length;
      
      initialStats = {
        conferences: userApps.length,
        upcomingCount: upcoming,
        pastCount: past,
        papers: papers,
        achievements: achievements.length
      };

      // Recommendation Logic
      const appliedEventIds = new Set(userApps.map(a => a.eventId));
      
      const now = Date.now();
      const userCountry = userData.address?.country;
      // Gather past formats
      const pastFormats: Record<string, number> = {};
      userApps.forEach(a => {
        // We'd need to join event data for format. For simplicity, skip format scoring if we can't get it easily,
        // or just rely on what we have. We'll skip format scoring for now to avoid N+1.
      });

      const scoredEvents = events
        .filter((e: any) => !appliedEventIds.has(e.id))
        .map((e: any) => {
          let score = 0;
          const startStr = e.date;
          if (startStr) {
            const startDate = new Date(startStr).getTime();
            const diffDays = (startDate - now) / (1000 * 60 * 60 * 24);
            if (diffDays <= 60 && diffDays >= 0) score += 3;
            else if (diffDays <= 180 && diffDays >= 0) score += 2;
          }
          if (userCountry && e.location && typeof e.location === "string" && e.location.includes(userCountry)) score += 2;
          
          return { ...e, _score: score };
        });

      // Only the fields the card shows: a whole event doc carries Firestore Timestamps
      // (e.g. plan.activatedAt), which can't cross to a Client Component.
      initialRecommendations = scoredEvents
        .sort((a: any, b: any) => b._score - a._score || (a.date || "").localeCompare(b.date || ""))
        .slice(0, 3)
        .map((e: any) => ({
          id: e.id,
          title: e.title ?? "",
          coverUrl: e.coverUrl ?? null,
          date: typeof e.date === "string" ? e.date : null,
          startDate: e.startDate ?? null,
          startTime: e.startTime ?? null,
        }));
        
    } catch (err) {
      console.error("Error fetching dashboard data on server:", err);
      error = "Failed to load dashboard data.";
    }
  }

  return (
    <DashboardClient 
      initialStats={initialStats} 
      initialRecommendations={initialRecommendations} 
      serverError={error}
    />
  );
}
