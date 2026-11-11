"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { getEventById, EventData, getMarkingMode } from "@/lib/services/eventService";
import { getUserApplications, ApplicationData } from "@/lib/services/applicationService";
import { getPaymentGate } from "@/lib/services/paymentGate";
import { PaymentRequiredGate } from "@/components/features/delegate/PaymentRequiredGate";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentsTab } from "@/components/features/delegate/DocumentsTab";
import { ScheduleViewer } from "@/components/features/delegate/ScheduleViewer";
import { ComplaintSystem } from "@/components/features/delegate/ComplaintSystem";
import { CertificateDownload } from "@/components/features/delegate/CertificateDownload";
import { AnnouncementViewer } from "@/components/features/delegate/AnnouncementViewer";
import { RoomNotifications } from "@/components/features/delegate/RoomNotifications";
import { FacultyAdvisorPanel } from "@/components/features/delegate/FacultyAdvisorPanel";
import { TeamDelegationPanel } from "@/components/features/delegate/TeamDelegationPanel";
import { MigrationPanel } from "@/components/features/delegate/MigrationPanel";
import { FoodCouponsModule } from "@/components/features/delegate/modules/FoodCouponsModule";
import { TransportModule } from "@/components/features/delegate/modules/TransportModule";
import { AccommodationModule } from "@/components/features/delegate/modules/AccommodationModule";
import { DressCodeModule } from "@/components/features/delegate/modules/DressCodeModule";
import { PassCard } from "@/components/features/passes/PassCard";
import { passesInUse } from "@/lib/hooks/useEventStaffRole";
import { ProGate } from "@/components/ProGate";
import { SessionReport } from "@/components/session/SessionReport";
import {
  Calendar, MapPin, Users, Globe2, FileText, Clock,
  AlertTriangle, Award, Trophy, Star, Megaphone, Utensils,
  Bus, Hotel, Shirt, ArrowRightLeft, Radio
} from "lucide-react";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { getDelegateEventMarkings, Marking } from "@/lib/services/markingService";
import { computeFinalScore, splitMarkings, deriveDays, DEFAULT_OVERALL_WEIGHT } from "@/lib/services/markingScore";
import { getStandings, myPlacement, type CommitteeStandings } from "@/lib/services/standingsService";
import { CommitteeLeaderboard } from "@/components/marking/Leaderboard";
import { getEventResults } from "@/lib/services/resultService";
import { isFacultyRole, isTeamLeadRole } from "@/lib/services/staffService";
import { getMyWaitlistEntries, acceptWaitlistOffer, declineWaitlistOffer, WaitlistEntry } from "@/lib/services/waitlistService";
import { db } from "@/lib/firebase/client";
import { doc, getDoc, collection, query, where, getDocs, writeBatch } from "firebase/firestore";
import { usePortalEvent } from "@/components/dashboard/delegate-portal/PortalEventContext";
import { useLiveMunGate } from "@/components/session/gate/LiveGateDialog";
import { CeremonyLiveBanner } from "@/components/session/ceremony/CeremonyLiveBanner";
import { sessionDateStr } from "@/lib/services/sessionDate";

export default function ConferencePortalPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  // Live MUN entry gate for the launch card below. `gate` is already taken here by the payment
  // gate, hence the rename.
  const { launch: launchLive, checking: liveChecking, gate: liveGate } = useLiveMunGate();
  const conferenceId = params.id as string;
  const activeTab = searchParams.get("tab") || "overview";
  const { user, loading: authLoading } = useAuth();
  const { setEvent: setPortalEvent } = usePortalEvent();

  const [event, setEvent] = useState<EventData | null>(null);
  const [application, setApplication] = useState<ApplicationData | null>(null);
  const [markings, setMarkings] = useState<Marking[] | undefined>(undefined);
  const [certUnlocked, setCertUnlocked] = useState<boolean>(false);
  const [waitlistOffer, setWaitlistOffer] = useState<WaitlistEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [announcementUnread, setAnnouncementUnread] = useState(0);
  const [reportDate, setReportDate] = useState(() => {
    const d = new Date();
    const z = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  });
  // The chair-published committee board. Null until (and unless) a chair publishes —
  // a delegate cannot read peers' markings, so this doc is the only source of a ranking.
  const [standings, setStandings] = useState<CommitteeStandings | null>(null);

  useEffect(() => {
    const evId = event?.id;
    const cid = application?.assignedCommittee || application?.choices?.primary?.committee;
    if (!evId || !cid) return;
    let alive = true;
    getStandings(evId, cid).then(s => { if (alive) setStandings(s); });
    return () => { alive = false; };
  }, [event?.id, application?.assignedCommittee, application?.choices?.primary?.committee]);

  useEffect(() => {
    async function loadPortalData() {
      if (!user || !conferenceId) return;

      const userApps = await getUserApplications(user.uid);
      const currentApp = userApps.find(
        app => (app as any).id === conferenceId || app.eventId === conferenceId
      );

      const targetEventId = currentApp ? currentApp.eventId : conferenceId;

      // Check if user is accepted staff of this event (with chair/eb/director role)
      const staffRef = collection(db, "events", targetEventId, "staff");
      let staffQuery = query(staffRef, where("uid", "==", user.uid));
      let staffSnap = await getDocs(staffQuery);

      if (staffSnap.empty && user.email) {
        staffQuery = query(staffRef, where("email", "==", user.email));
        staffSnap = await getDocs(staffQuery);
      }

      let isStaffChair = false;
      let staffDocToMigrate = null;

      if (!staffSnap.empty) {
        const staffDoc = staffSnap.docs[0];
        const staffData = staffDoc.data();
        if (staffData.inviteStatus === "accepted") {
          const lowerRole = (staffData.role || "").toLowerCase();
          if (lowerRole.includes("chair") || lowerRole.includes("director") || lowerRole.includes("eb") || lowerRole.includes("usg") || lowerRole.includes("co-organizer")) {
            isStaffChair = true;
            if (staffDoc.id !== user.uid) {
              staffDocToMigrate = staffDoc;
            }
          }
        }
      }

      if (staffDocToMigrate) {
        try {
          const batch = writeBatch(db);
          batch.delete(staffDocToMigrate.ref);
          batch.set(doc(db, "events", targetEventId, "staff", user.uid), {
            ...staffDocToMigrate.data(),
            uid: user.uid,
            inviteStatus: "accepted",
            sourceId: staffDocToMigrate.id, // the create rule accepts only a copy of a named grant
          });
          await batch.commit();
          console.log("On-the-fly staff doc migration completed on conference page.");
        } catch (err) {
          console.error("Failed to migrate staff doc on-the-fly on conference page:", err);
        }
      }

      if (isStaffChair) {
        router.replace(`/dashboard/chair/committee/${targetEventId}`);
        return;
      }

      if (currentApp) {
        const lowerRole = currentApp.role.toLowerCase();
        if (lowerRole.includes("chair") || lowerRole.includes("director") || lowerRole.includes("eb")) {
          router.replace(`/dashboard/chair/committee/${currentApp.eventId}`);
          return;
        }
      }

      const eventData = currentApp
        ? await getEventById(currentApp.eventId)
        : await getEventById(conferenceId);

      setEvent(eventData || null);
      setApplication(currentApp || null);

      if (currentApp) {
        const marks = await getDelegateEventMarkings(currentApp.eventId, user.uid);
        setMarkings(marks);
        // Certificate unlocks only once the organizer has APPROVED this delegate's result.
        try {
          const results = await getEventResults(currentApp.eventId);
          setCertUnlocked(results.some(r => r.delegateUid === user.uid && r.status === "approved"));
        } catch {
          setCertUnlocked(false);
        }
        // Surface a pending waitlist seat offer (if any) so the delegate can accept/decline.
        try {
          const entries = await getMyWaitlistEntries(currentApp.eventId, user.uid);
          setWaitlistOffer(entries.find(e => e.status === "offered") || null);
        } catch {
          setWaitlistOffer(null);
        }
      } else {
        setMarkings([]);
      }

      setLoading(false);
    }

    if (!authLoading && user) {
      loadPortalData();
    } else if (!authLoading && !user) {
      setLoading(false);
    }
  }, [user, authLoading, conferenceId]);

  // Publish the resolved event (id + title) up to the portal shell so its top bar and
  // right-rail roster can render/fetch by the real event id (the URL param may be an
  // applicationId). Cleared on unmount so the next portal visit starts blank.
  useEffect(() => {
    if (event?.id) {
      const committee = application?.assignedCommittee || application?.choices?.primary?.committee || "";
      setPortalEvent({ id: event.id, title: event.title, committeeId: committee });
    }
    return () => setPortalEvent(null);
  }, [event?.id, event?.title, application?.assignedCommittee]);

  if (loading || authLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-[400px] rounded-2xl" />
      </div>
    );
  }

  if (!event || !application) {
    return (
      <div className="py-20 text-center text-muted-foreground glass-card rounded-2xl border-dashed">
        <p className="text-xl font-medium mb-2">Conference not found</p>
        <p>We couldn't find the details for this conference.</p>
      </div>
    );
  }

  const appId = (application as any).id as string;

  // Paywall: an unpaid registration isn't confirmed, so it doesn't get the portal. Free
  // events, free roles and paid-up delegates fall straight through.
  const gate = getPaymentGate(application, event);
  if (gate.blocksPortal) {
    return (
      <PaymentRequiredGate
        gate={gate}
        eventTitle={event.title}
        role={application.role}
        applicationId={appId}
        eventId={event.id}
        organizerEmail={(event as any).contactEmail || (event as any).organizerEmail}
      />
    );
  }

  const optionalModules: string[] = (event as any).optionalModules || [];
  const committeeId = application.assignedCommittee || application.choices?.primary?.committee;
  const myStanding = myPlacement(standings, user?.uid || "");
  const isFacultyAdvisor = isFacultyRole(application.role);
  const isTeamLead = isTeamLeadRole(application.role);
  const hasDelegation = !!(application as any).delegationId || !!(application as any).teamApplicationParentId || isTeamLead;
  // Migration is only meaningful once a delegate holds an actual committee + country seat.
  const canMigrate =
    !isFacultyAdvisor &&
    !!committeeId &&
    !!(application.assignedCountry || application.choices?.primary?.country);

  return (
    <div className="space-y-8 pb-20">
      {/* Event cover — shown only on the Overview tab so it stops repeating everywhere */}
      {activeTab === "overview" && (
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass-card p-8 rounded-3xl relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -z-10 translate-x-1/2 -translate-y-1/2" />

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-full uppercase tracking-wider">
                {application.status}
              </span>
              <span className="px-3 py-1 bg-secondary text-secondary-foreground text-xs font-semibold rounded-full uppercase tracking-wider">
                {application.role}
              </span>
              {hasDelegation && (
                <span className="px-3 py-1 bg-blue-500/10 text-blue-600 text-xs font-semibold rounded-full uppercase tracking-wider">
                  Team
                </span>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">{event.title}</h1>
            <p className="text-muted-foreground max-w-2xl">{event.description}</p>
          </div>

          <div className="flex flex-col gap-3 min-w-[200px]">
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                <Calendar className="w-4 h-4 text-primary" />
              </div>
              <span>{event.date}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                <MapPin className="w-4 h-4 text-primary" />
              </div>
              <span>{event.location}</span>
            </div>
            {/* Room notification bell — only for non-faculty delegates */}
            {!isFacultyAdvisor && committeeId && (
              <RoomNotifications
                eventId={event.id!}
                committeeId={committeeId}
                applicationId={appId}
              />
            )}
          </div>
        </div>

        {/* Assigned details */}
        {!isFacultyAdvisor && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8 pt-8 border-t border-border/40">
            <div className="bg-background rounded-2xl p-5 flex items-center gap-4 border border-border/20 shadow-sm transition-all duration-300 hover:scale-[1.01] hover:bg-background hover:shadow-[0_0_20px_rgba(59,130,246,0.08)]">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Committee</p>
                <p className="text-lg font-semibold tracking-tight text-foreground">{committeeId}</p>
              </div>
            </div>
            <div className="bg-background rounded-2xl p-5 flex items-center gap-4 border border-border/20 shadow-sm transition-all duration-300 hover:scale-[1.01] hover:bg-background hover:shadow-[0_0_20px_rgba(34,197,94,0.08)]">
              <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                <Globe2 className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Country</p>
                <p className="text-lg font-semibold tracking-tight text-foreground inline-flex items-center gap-2">
                  {(application.assignedCountry || application.choices.primary.country) ? (
                    <>
                      <CountryFlag code={application.assignedCountry || application.choices.primary.country} size={20} />
                      {getCountryName(application.assignedCountry || application.choices.primary.country)}
                    </>
                  ) : (
                    "Pending Assignment"
                  )}
                </p>
              </div>
            </div>
          </div>
        )}
      </motion.div>
      )}

      {/* Faculty Advisor — completely different portal layout */}
      {isFacultyAdvisor ? (
        <FacultyAdvisorPanel
          event={event}
          myApplication={application}
          advisorUid={user!.uid}
        />
      ) : (
        <>
          {/* Waitlist seat offer — Overview only */}
          {activeTab === "overview" && waitlistOffer && (() => {
            const notifiedMs = waitlistOffer.notifiedAt?.toDate?.()?.getTime?.() ?? null;
            const hoursLeft = notifiedMs ? Math.max(0, 48 - Math.floor((Date.now() - notifiedMs) / 3600000)) : 48;
            const accept = async () => {
              if (!waitlistOffer.id) return;
              await acceptWaitlistOffer(event.id!, waitlistOffer.id);
              setWaitlistOffer(null);
            };
            const decline = async () => {
              if (!waitlistOffer.id) return;
              await declineWaitlistOffer(event.id!, waitlistOffer.id);
              setWaitlistOffer(null);
            };
            return (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-600" /> A seat has opened up{waitlistOffer.committeeId ? ` in ${waitlistOffer.committeeId}` : ""}!
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Accept within <strong>~{hoursLeft}h</strong> to claim it, or it passes to the next person.
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="outline" onClick={decline}>Decline</Button>
                    <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={accept}>Accept Seat</Button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Conference-wide ceremony, when one is on the air. Above the committee card on
              purpose: while a ceremony runs it is where the whole conference is. */}
          {activeTab === "overview" && <CeremonyLiveBanner eventId={event.id} />}

          {/* Live MUN launch — Overview only, once the delegate holds a committee seat */}
          {activeTab === "overview" && committeeId && (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                    <Radio className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold flex items-center gap-2">Live MUN</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Follow your committee in session live — speakers list, caucuses and voting, in real time.
                    </p>
                  </div>
                </div>
                <Button
                  className="gap-2 shrink-0"
                  disabled={liveChecking}
                  onClick={() => launchLive({
                    eventId: event.id,
                    href: `/dashboard/conferences/${conferenceId}/live`,
                    role: "delegate",
                    committee: committeeId,
                    // Must match what the console computes, or the gate checks the wrong day.
                    dateStr: sessionDateStr(event.timeZone),
                    eventTitle: event.title,
                  })}
                >
                  <Radio className="w-4 h-4" /> Launch Live MUN
                </Button>
                {liveGate}
              </div>
            </div>
          )}

          {/* Team section (if member of a delegation) — Overview only */}
          {activeTab === "overview" && hasDelegation && (
            <TeamDelegationPanel
              event={event}
              myApplication={application as ApplicationData & { id?: string }}
            />
          )}

          {/* Portal Tabs */}
          <Tabs value={activeTab} className="w-full">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              {/* Documents — position paper + study guide (sub-tabbed) */}
              <TabsContent value="documents" className="mt-0 outline-none">
                <DocumentsTab
                  application={application}
                  event={event}
                  committeeName={committeeId}
                  initialSub={(searchParams.get("doc") as "paper" | "guide" | "rules" | null) ?? undefined}
                />
              </TabsContent>

              {/* Announcements */}
              <TabsContent value="announcements" className="mt-0 outline-none">
                {appId && (
                  <AnnouncementViewer
                    eventId={event.id!}
                    applicationId={appId}
                    onUnreadCount={setAnnouncementUnread}
                    userRole={application?.role}
                  />
                )}
              </TabsContent>

              {/* Schedule */}
              <TabsContent value="schedule" className="mt-0 outline-none">
                <ScheduleViewer event={event} />
              </TabsContent>

              {/* Requests — seat migration + complaints */}
              <TabsContent value="complaints" className="mt-0 outline-none space-y-6">
                {canMigrate && (
                  <div className="glass-card rounded-2xl p-6">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <ArrowRightLeft className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-base">Change Committee or Country</h3>
                        <p className="text-sm text-muted-foreground">
                          Request to move your seat. The organizer reviews each request, and an
                          occupied seat can be offered to its current holder as a swap.
                        </p>
                      </div>
                    </div>
                    <MigrationPanel application={application as any} />
                  </div>
                )}
                <ComplaintSystem application={application} event={event} />
              </TabsContent>

              {/* Optional Modules */}
              {passesInUse(event) && (
                <TabsContent value="pass" className="mt-0 outline-none">
                  <PassCard eventId={event.id!} eventTitle={event.title} />
                </TabsContent>
              )}
              {optionalModules.includes("food") && (
                <TabsContent value="food" className="mt-0 outline-none">
                  <FoodCouponsModule eventId={event.id!} applicationId={appId} />
                </TabsContent>
              )}
              {optionalModules.includes("transport") && (
                <TabsContent value="transport" className="mt-0 outline-none">
                  <TransportModule eventId={event.id!} applicationId={appId} />
                </TabsContent>
              )}
              {optionalModules.includes("accommodation") && (
                <TabsContent value="accommodation" className="mt-0 outline-none">
                  <AccommodationModule eventId={event.id!} delegateUid={user!.uid} />
                </TabsContent>
              )}
              {optionalModules.includes("dresscode") && (
                <TabsContent value="dresscode" className="mt-0 outline-none">
                  <DressCodeModule eventId={event.id!} />
                </TabsContent>
              )}

              {/* Certificates — unlocked only after the organizer approves results */}
              <TabsContent value="certificate" className="mt-0 outline-none">
                {certUnlocked ? (
                  <CertificateDownload
                    eventId={event.id!}
                    delegateUid={user!.uid}
                    applicationId={appId}
                    delegateName={user?.displayName || "Delegate Name"}
                    conferenceName={event.title}
                    committeeName={committeeId}
                    countryName={application.assignedCountry || application.choices.primary.country}
                    date={event.date}
                    role={application.role}
                    template={event.certificateTemplate}
                  />
                ) : (
                  <div className="glass-card rounded-2xl p-12 text-center">
                    <Award className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold mb-2">Certificate Not Yet Available</h3>
                    <p className="text-muted-foreground text-sm">
                      Your certificate unlocks once the organizer approves the committee results. Check back
                      after the conference wraps up.
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* Results */}
              <TabsContent value="results" className="mt-0 outline-none">
                {markings === undefined ? (
                  <div className="glass-card rounded-2xl p-8 text-center">
                    <Skeleton className="h-8 w-1/3 mx-auto mb-4" />
                    <Skeleton className="h-4 w-1/2 mx-auto" />
                  </div>
                ) : markings.length === 0 ? (
                  <div className="glass-card rounded-2xl p-12 text-center">
                    <Trophy className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold mb-2">Results Not Yet Published</h3>
                    <p className="text-muted-foreground text-sm">
                      Your chair hasn't submitted scores yet. Check back after the conference.
                    </p>
                  </div>
                ) : (() => {
                  // Percentage-based marking: daily % = average of scored criteria (each -100..+100),
                  // final % = consistency-first average across every conference day, blended with the
                  // chair's manual overall. Prefer the chair's published final doc when present.
                  const templates = event?.markingTemplates || [];
                  const { daily, final } = splitMarkings(markings);
                  const published = final != null;
                  const days = (published && final!.days && final!.days.length)
                    ? final!.days
                    : deriveDays(daily, event?.scoringConfig?.markingDays);
                  const hasData = published || days.length > 0;
                  if (!hasData) {
                    return (
                      <div className="glass-card rounded-2xl p-12 text-center">
                        <Trophy className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold mb-2">Results Not Yet Published</h3>
                        <p className="text-muted-foreground text-sm">Your chair hasn&apos;t submitted scores yet. Check back after the conference.</p>
                      </div>
                    );
                  }
                  const overallWeight = final?.overallWeight ?? event?.scoringConfig?.overallWeight ?? DEFAULT_OVERALL_WEIGHT;
                  const markMode = final?.markMode ?? getMarkingMode(event);
                  const live = computeFinalScore(daily, templates, days, final?.chairOverall ?? null, overallWeight, markMode);
                  const finalScore = published ? (final!.finalScore ?? live.finalScore) : live.finalScore;
                  const computedPct = published ? (final!.computedPct ?? live.computedPct) : live.computedPct;
                  const chairOverall = published ? (final!.chairOverall ?? null) : null;
                  const dayCount = live.dayCount;
                  const presentDays = live.presentDays;
                  const perDay = live.daily;
                  // Per-criterion average across the days the delegate was scored on it,
                  // plus the individual ±100 marks (e.g. one per speech) flattened across days.
                  const perTemplate = templates.map(t => {
                    const vals: number[] = [];
                    for (const d of perDay) {
                      const row = d.rows.find(r => r.id === t.id);
                      if (row && row.value != null) vals.push(row.value);
                    }
                    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
                    const marks: number[] = [];
                    for (const dm of daily) {
                      const ent = dm.scoreEntries?.[t.id];
                      if (ent && ent.length) marks.push(...ent);
                    }
                    return { id: t.id, name: t.name, avg, marks };
                  });
                  const latestFeedback = daily.slice()
                    .sort((a, b) => (b.dateStr || "").localeCompare(a.dateStr || ""))
                    .find(m => m.feedback)?.feedback || "";
                  return (
                    <div className="space-y-6">
                      <div className="glass-card rounded-2xl p-6">
                        <div className="flex items-baseline justify-between mb-1 gap-3">
                          <h3 className="text-xl font-bold">Your Final Score</h3>
                          <span className={`text-xs shrink-0 px-2 py-0.5 rounded-full ${published ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"}`}>
                            {published ? "Published" : "Provisional"}
                          </span>
                        </div>
                        <p className="text-muted-foreground text-sm mb-6">
                          {published
                            ? "Graded by your committee chair."
                            : "Aggregate so far — your chair hasn't published the final yet."}
                        </p>
                        <div className="bg-primary/10 rounded-xl p-5 border border-primary/20 text-center mb-6">
                          <p className="text-sm text-muted-foreground mb-1">Final</p>
                          <p className="text-5xl font-bold text-primary">{finalScore}%</p>
                          <div className="mt-3 h-2 bg-secondary rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${finalScore}%` }} />
                          </div>
                          <p className="text-xs text-muted-foreground mt-3">
                            Computed {Math.round(computedPct)}%
                            {chairOverall != null && <> · Chair overall {Math.round(chairOverall)} · blended {Math.round(overallWeight * 100)}%</>}
                            {" · "}present {presentDays}/{dayCount} day{dayCount === 1 ? "" : "s"}
                          </p>
                        </div>
                        {perTemplate.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                            {perTemplate.map(t => (
                              <div key={t.id} className="bg-secondary rounded-xl p-4 border border-border/30 text-center">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 truncate">{t.name}</p>
                                <p className={`text-4xl font-bold ${t.avg == null ? "text-muted-foreground/40" : t.avg < 0 ? "text-red-600 dark:text-red-400" : "text-primary"}`}>
                                  {t.avg == null ? "—" : (t.avg > 0 ? `+${Math.round(t.avg)}` : Math.round(t.avg))}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  avg / day{t.marks.length > 0 ? ` · ${t.marks.length} mark${t.marks.length > 1 ? "s" : ""}` : ""}
                                </p>
                                {t.marks.length > 1 && (
                                  <details className="mt-1.5">
                                    <summary className="text-[11px] text-muted-foreground cursor-pointer select-none list-none hover:text-foreground">show marks</summary>
                                    <div className="flex flex-wrap gap-1 mt-1.5 justify-center">
                                      {t.marks.map((v, i) => (
                                        <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums ${v < 0 ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-primary/10 text-primary"}`}>
                                          {v > 0 ? `+${v}` : v}
                                        </span>
                                      ))}
                                    </div>
                                  </details>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {latestFeedback && (
                          <div className="bg-secondary rounded-xl p-4 border border-border/30">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                              <Star className="w-3.5 h-3.5" /> Chair Feedback
                            </p>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{latestFeedback}</p>
                          </div>
                        )}
                      </div>

                      <div className="glass-card rounded-2xl p-6">
                        <h4 className="text-sm font-semibold mb-3">Daily breakdown</h4>
                        <div className="space-y-2.5">
                          {perDay.map(d => (
                            <div key={d.dateStr} className="flex items-center gap-3 text-sm">
                              <span className="text-muted-foreground w-24 shrink-0 tabular-nums">{d.dateStr}</span>
                              <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                                {d.present && d.pct != null && (
                                  <div className="h-full bg-primary rounded-full" style={{ width: `${Math.round(d.pct)}%` }} />
                                )}
                              </div>
                              {/* Three states, not two: scored, absent, or attended-but-not-scored
                                  (which is left out of the average rather than counted as a zero). */}
                              <span className={`font-semibold w-20 text-right tabular-nums text-xs ${d.present ? "" : "text-muted-foreground/60"}`}>
                                {d.present && d.pct != null ? `${Math.round(d.pct)}%` : !d.counted ? "not counted" : "absent"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Where they placed — only ever from a board the chair chose to publish. */}
                      {myStanding && (
                        <div className="glass-card rounded-2xl p-6">
                          <div className="flex items-center justify-between gap-3 mb-4">
                            <h4 className="text-sm font-semibold flex items-center gap-1.5">
                              <Trophy className="w-4 h-4 text-amber-500" /> Committee Standing
                            </h4>
                            <span className="text-xs text-muted-foreground">
                              published by your chair
                            </span>
                          </div>
                          <div className="flex items-center gap-4 mb-4">
                            <div className="rounded-xl bg-primary/10 border border-primary/20 px-5 py-3 text-center">
                              <p className="text-3xl font-bold text-primary leading-none">#{myStanding.rank}</p>
                              <p className="text-[11px] text-muted-foreground mt-1">of {standings!.entries.length}</p>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {standings!.visibility === "rank_only"
                                ? "Your chair published placements only — other delegates' scores stay private."
                                : "Full committee board below."}
                            </p>
                          </div>
                          {standings!.visibility === "full" && (
                            <CommitteeLeaderboard
                              entries={standings!.entries}
                              markMode={standings!.markMode}
                              highlightUid={user!.uid}
                              showOverall={false}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </TabsContent>

              {/* Live MUN session report — the delegate's own participation summary */}
              <TabsContent value="session-report" className="mt-0 outline-none">
                <div className="space-y-4">
                  <div className="flex items-center justify-end gap-2">
                    <label className="text-sm text-muted-foreground">Session day</label>
                    <input
                      type="date"
                      value={reportDate}
                      onChange={(e) => setReportDate(e.target.value)}
                      className="h-9 rounded-md border border-border/50 bg-background px-3 text-sm"
                    />
                  </div>
                  <SessionReport
                    mode="own"
                    eventId={event.id!}
                    committeeId={committeeId}
                    dateStr={reportDate}
                    eventTitle={event.title}
                    viewer={{
                      delegateId: user!.uid,
                      country: application.assignedCountry || application.choices?.primary?.country || "",
                      applicationId: appId,
                    }}
                  />
                </div>
              </TabsContent>
            </motion.div>
          </Tabs>
        </>
      )}
    </div>
  );
}
