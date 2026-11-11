"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { isExecBoardRole, DEFAULT_PERMISSIONS, ROLE_PRESETS } from "@/lib/services/staffService";
import { useEventStaffRole } from "@/lib/hooks/useEventStaffRole";
import { getEventById, EventData, getMarkingMode } from "@/lib/services/eventService";
import { getApplicationsByEvent, getUserApplications, ApplicationData } from "@/lib/services/applicationService";
import { notifyDelegatesPaperReminder } from "@/lib/services/notifyService";
import { submitMarking, getMarkingsByCommittee, subscribeDailyMarkings, setCriterionScore, setScoreEntries, saveFinalScore, Marking } from "@/lib/services/markingService";
import { computeDailyScore, computeFinalScore, deriveDays, DEFAULT_OVERALL_WEIGHT, MARK_MIN, MARK_MAX, clamp } from "@/lib/services/markingScore";
import { BinaryScoreSelect } from "@/components/session/BinaryScoreSelect";
import { DailyMotionLog } from "@/components/session/DailyMotionLog";
import { AttendancePill, ParticipationChips, PctBar, cellTone, pctTone, scaleLabel } from "@/components/marking/markingUi";
import { DelegateMarkingDetail, type DetailDelegate } from "@/components/marking/DelegateMarkingDetail";
import { CommitteeLeaderboard, rankEntries, type LeaderboardEntry } from "@/components/marking/Leaderboard";
import {
  publishStandings, unpublishStandings, getStandings,
  type CommitteeStandings, type StandingsVisibility,
} from "@/lib/services/standingsService";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { getDailyParticipation, autoFillSuggestion, type ParticipationSummary } from "@/lib/services/sessionService";
import { belongsToCommittee } from "@/lib/utils/committee";
import { getStudyGuide, deleteStudyGuide, StudyGuide } from "@/lib/services/optionalModulesService";
import { publishStudyGuide } from "@/lib/services/studyGuidePublish";
import { resolveComplaint as resolveComplaintService, escalateComplaint as escalateComplaintService } from "@/lib/services/complaintService";
import { sendRoomNotification } from "@/lib/services/roomNotificationService";
import { submitResult } from "@/lib/services/resultService";
import { createGroupConversation } from "@/lib/services/messageService";
import { db } from "@/lib/firebase/client";
import {
  collection, query, where, getDocs, doc, updateDoc, arrayUnion, serverTimestamp, writeBatch, setDoc
} from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import {
  Users, FileText, Star, Award, CheckCircle2, Search,
  MessageSquare, Loader2, Trophy, UploadCloud, BookOpen, Trash2,
  Bell, AlertTriangle, ArrowUpCircle, XCircle, Clock, ExternalLink,
  ClipboardList, Calendar, MapPin, Lock, Radio, ChevronLeft, ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatDistanceToNow } from "date-fns";
import { PositionPaperViewer } from "@/components/features/chair/PositionPaperViewer";
import { MarkdownDocEditor } from "@/components/features/shared/MarkdownDocEditor";
import { PassCard } from "@/components/features/passes/PassCard";
import { RulesGuideViewer } from "@/components/features/shared/RulesGuideViewer";
import { usePortalEvent } from "@/components/dashboard/delegate-portal/PortalEventContext";
import { useLiveMunGate } from "@/components/session/gate/LiveGateDialog";
import { CeremonyLiveBanner } from "@/components/session/ceremony/CeremonyLiveBanner";

// ── Complaint types ───────────────────────────────────────────────────────────
interface HistoryEntry {
  action: string;
  actorUid: string;
  actorRole: string;
  message: string;
  timestamp: any;
}

interface Complaint {
  id: string;
  type: string;
  subject: string;
  description: string;
  status: "open" | "under_review" | "escalated" | "resolved" | "rejected";
  escalationLevel: number;
  assignedTo?: string;
  assignedRole?: string;
  history: HistoryEntry[];
  resolution?: string;
  createdAt: any;
  userId: string;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function CommitteeManagementPage() {
  const params = useParams();
  const eventId = params.id as string;
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const committeeParam = searchParams.get("committee");
  const activeTab = searchParams.get("tab") || "overview";
  const staffRole = useEventStaffRole(eventId);
  const { setEvent: setPortalEvent } = usePortalEvent();
  // Live MUN entry gate — a chair cannot open a sitting before the organizer opens Live MUN.
  const { launch: launchLive, checking: liveChecking, gate: liveGate } = useLiveMunGate();

  const [event, setEvent] = useState<EventData | null>(null);
  const [delegates, setDelegates] = useState<ApplicationData[]>([]);
  const [markings, setMarkings] = useState<Marking[]>([]);
  const [loading, setLoading] = useState(true);
  const [committeeName, setCommitteeName] = useState("");
  const [viewerRole, setViewerRole] = useState<string>("");
  const [delegateSearch, setDelegateSearch] = useState("");

  // Daily Marking Matrix
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dailyMarkings, setDailyMarkings] = useState<Marking[]>([]);
  const [dailyParticipation, setDailyParticipation] = useState<ParticipationSummary[]>([]);
  const [savingMatrix, setSavingMatrix] = useState(false);
  // Matrix view controls
  const [matrixSort, setMatrixSort] = useState<"country" | "daily" | "final" | "unscored">("country");
  const [unscoredOnly, setUnscoredOnly] = useState(false);
  // The delegate whose full record is open in the detail drawer
  const [detailUid, setDetailUid] = useState<string | null>(null);
  // Motion Log's own day — see the note on the tab.
  const [logDate, setLogDate] = useState(format(new Date(), "yyyy-MM-dd"));

  // Study guide
  const [studyGuide, setStudyGuide] = useState<StudyGuide | null | undefined>(undefined);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [studyGuideDialogOpen, setStudyGuideDialogOpen] = useState(false);
  const [sgContent, setSgContent] = useState<string>("");
  const [sgFileName, setSgFileName] = useState<string>("");
  const [sgSaving, setSgSaving] = useState(false);

  // Complaints
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [complaintsLoading, setComplaintsLoading] = useState(false);
  const [resolutionText, setResolutionText] = useState<Record<string, string>>({});
  const [complaintTab, setComplaintTab] = useState<"open" | "resolved">("open");

  // Room notifications
  const [notifMessage, setNotifMessage] = useState("");
  const [notifType, setNotifType] = useState<"info" | "warning" | "urgent">("info");
  const [notifExpiry, setNotifExpiry] = useState(30);
  const [sendingNotif, setSendingNotif] = useState(false);
  const [notifSent, setNotifSent] = useState(false);
  const [notifDialogOpen, setNotifDialogOpen] = useState(false);

  // Awards
  const [awardsDialogOpen, setAwardsDialogOpen] = useState(false);
  const [awards, setAwards] = useState({
    bestDelegate: "",
    outstandingDelegate: "",
    honorableMention: ""
  });

  // Published standings (the delegate/organizer-facing board)
  const [publishedStandings, setPublishedStandings] = useState<CommitteeStandings | null>(null);
  const [standingsVisibility, setStandingsVisibility] = useState<StandingsVisibility>("full");
  const [publishing, setPublishing] = useState(false);
  const [standingsPublished, setStandingsPublished] = useState(false);

  // Final scoring (committee-level rollup)
  const [overallInputs, setOverallInputs] = useState<Record<string, string>>({});
  const [savingFinals, setSavingFinals] = useState(false);
  const [finalsSaved, setFinalsSaved] = useState(false);

  // Paper Viewer
  const [selectedPaperApp, setSelectedPaperApp] = useState<ApplicationData | null>(null);

  useEffect(() => {
    async function loadData() {
      if (!user || !eventId) return;

      const staffRef = collection(db, "events", eventId, "staff");
      let staffQuery = query(staffRef, where("uid", "==", user.uid));
      let staffSnap = await getDocs(staffQuery);

      if (staffSnap.empty && user.email) {
        staffQuery = query(staffRef, where("email", "==", user.email));
        staffSnap = await getDocs(staffQuery);
      }

      if (!staffSnap.empty) {
        const staffDoc = staffSnap.docs[0];
        if (staffDoc.id !== user.uid) {
          try {
            const batch = writeBatch(db);
            batch.delete(staffDoc.ref);
            batch.set(doc(db, "events", eventId, "staff", user.uid), {
              ...staffDoc.data(),
              uid: user.uid,
              inviteStatus: "accepted",
              // The create rule accepts a self-written doc only as a copy of the doc it names.
              sourceId: staffDoc.id,
            });
            await batch.commit();

            // Re-fetch the staff doc to get the newly created UID-keyed document
            const newStaffSnap = await getDocs(query(staffRef, where("uid", "==", user.uid)));
            if (!newStaffSnap.empty) {
              staffSnap = newStaffSnap;
            }
          } catch (err) {
            console.error("Failed to migrate staff doc on-the-fly:", err);
          }
        } else if (staffDoc.data().inviteStatus !== "accepted") {
          // Already UID-keyed but not accepted — isEventStaff() requires 'accepted',
          // otherwise the chair is denied reads on markings/applications. Heal it.
          try {
            await updateDoc(staffDoc.ref, { inviteStatus: "accepted" });
            staffSnap = await getDocs(query(staffRef, where("uid", "==", user.uid)));
          } catch (err) {
            console.error("Failed to accept staff doc on-the-fly:", err);
          }
        }
      }

      // Application-based chairs (approved via an application, with no staff doc) cannot
      // list the event's applications under Firestore rules, so the delegate roster comes
      // back empty. Self-register an accepted, UID-keyed staff doc — the rules permit a
      // user to create their own staff doc with inviteStatus 'accepted' — so isEventStaff()
      // grants access on this and future loads.
      if (staffSnap.empty) {
        try {
          const myApps = await getUserApplications(user.uid);
          const chairApp = myApps.find(a =>
            a.eventId === eventId &&
            a.status === "approved" &&
            /chair/i.test(a.role || "") &&
            !/co-organizer/i.test(a.role || "")
          );
          if (chairApp) {
            const committee = chairApp.assignedCommittee || chairApp.choices?.primary?.committee || "";
            await setDoc(doc(db, "events", eventId, "staff", user.uid), {
              uid: user.uid,
              email: user.email || "",
              name: user.displayName || "Chair",
              role: "chair",
              committeeId: committee,
              permissions: { ...DEFAULT_PERMISSIONS, ...ROLE_PRESETS.chair },
              inviteStatus: "accepted",
              // The rule checks this approved chair application before letting the doc exist.
              sourceApplicationId: chairApp.id,
            }, { merge: true });
            staffSnap = await getDocs(query(staffRef, where("uid", "==", user.uid)));
          }
        } catch (err) {
          console.error("Failed to self-register chair staff doc:", err);
        }
      }

      const [eventData, allApps] = await Promise.all([
        getEventById(eventId),
        getApplicationsByEvent(eventId)
      ]);
      if (!eventData) { router.push("/dashboard/chair"); return; }

      const myStaffRole = !staffSnap.empty ? (staffSnap.docs[0].data().role || "") : "";
      // Oversight roles (director / USG / co-organizer / event owner) may open any
      // committee via ?committee=. Chairs are always pinned to their own committee.
      const canOversee =
        isExecBoardRole(myStaffRole) ||
        myStaffRole === "co-organizer" ||
        eventData.organizerId === user.uid;
      setViewerRole(
        eventData.organizerId === user.uid && !myStaffRole ? "organizer" : myStaffRole
      );

      let name = "";
      if (committeeParam && canOversee) {
        name = committeeParam;
      } else if (!staffSnap.empty) {
        name = staffSnap.docs[0].data().committeeId || "";
      }

      if (!name) {
        const myApp = allApps.find(app => app.userId === user.uid && app.status === "approved");
        name = myApp?.assignedCommittee || myApp?.choices.primary.committee || "";
      }
      setCommitteeName(name);

      const committeeDelegates = allApps.filter(app =>
        /delegate/i.test(app.role || "") &&
        app.status === "approved" &&
        belongsToCommittee(app, name)
      );
      const committeeMarkings = await getMarkingsByCommittee(eventId, name);

      setEvent(eventData);
      setDelegates(committeeDelegates);
      setMarkings(committeeMarkings);

      // Load study guide
      if (name) {
        const guide = await getStudyGuide(eventId, name);
        setStudyGuide(guide);
        if (guide?.content) setSgContent(guide.content);
        if (guide?.fileName) setSgFileName(guide.fileName);
      }

      setLoading(false);

      // Load complaints assigned to this chair
      if (user.uid && name) {
        setComplaintsLoading(true);
        const q = query(
          collection(db, "complaints"),
          where("eventId", "==", eventId),
          where("assignedTo", "==", user.uid)
        );
        const snap = await getDocs(q);
        setComplaints(snap.docs.map(d => ({ id: d.id, ...d.data() } as Complaint)));
        setComplaintsLoading(false);
      }
    }
    loadData();
  }, [user, eventId, router]);

  // The day's marks are a LIVE subscription, not a one-shot read: the same docs are being
  // written from the live console (per-speech marks on the speaker's tile, the quick-score
  // dialog, the post-speech scorer) while this page is open. A snapshot also keeps the
  // committee-wide cache — which drives the stats, the leaderboard and the finals — current.
  useEffect(() => {
    if (!eventId || !committeeName || !selectedDate) return;
    return subscribeDailyMarkings(eventId, committeeName, selectedDate, (rows) => {
      setDailyMarkings(rows);
      setMarkings((prev) => {
        const byId = new Map(prev.map((m) => [m.id, m] as const));
        for (const r of rows) byId.set(r.id, r);
        // Drop any cached doc for this day that no longer exists.
        const live = new Set(rows.map((r) => r.id));
        return Array.from(byId.values()).filter((m) => m.dateStr !== selectedDate || !m.id || live.has(m.id));
      });
    });
  }, [eventId, committeeName, selectedDate]);

  useEffect(() => {
    if (!eventId || !committeeName || !selectedDate) return;
    let alive = true;
    getDailyParticipation(eventId, committeeName, selectedDate)
      .then((p) => { if (alive) setDailyParticipation(p); });
    return () => { alive = false; };
  }, [eventId, committeeName, selectedDate]);

  // Publish the resolved event up to the portal shell so its top bar + right-rail roster
  // render/fetch by the real event id (mirrors the delegate conference page).
  useEffect(() => {
    if (event?.id) setPortalEvent({ id: event.id, title: event.title, committeeId: committeeName });
    return () => setPortalEvent(null);
  }, [event?.id, event?.title, committeeName]);

  // ── Marking ────────────────────────────────────────────────────────────────
  // The event's marking pattern: "decimal" (±100 numeric) or "binary" (−1/0/+1).
  // Stamped onto each saved doc so a later mode flip never misreads stored values.
  const markMode = getMarkingMode(event);

  const markingBase = (delegateId: string, applicationId: string) => ({
    eventId, committeeId: committeeName, delegateId, applicationId,
    dateStr: selectedDate, gradedBy: user?.uid || "", markMode,
  });

  // Each criterion is scored on a -100..+100 scale (decimal) or −1/0/+1 (binary).
  // A blank cell is *unscored* (excluded from the daily average) — distinct from a
  // scored 0 (which counts).
  //
  // Writes a SINGLE field path. It used to send the whole `scores` map rebuilt from this
  // page's state, which meant a cell typed here overwrote any criterion a live per-speech
  // mark had advanced since the page loaded — the mean and the entry list would silently
  // disagree. The subscription reconciles the optimistic patch below.
  const handleScoreChange = async (delegateId: string, templateId: string, scoreStr: string, applicationId: string) => {
    const trimmed = (scoreStr ?? "").trim();
    const isBlank = trimmed === "" || trimmed === "-";
    const parsed = isBlank ? NaN : parseFloat(trimmed);
    if (!isBlank && !Number.isFinite(parsed)) return; // ignore garbage mid-typing
    const lo = markMode === "binary" ? -1 : MARK_MIN;
    const hi = markMode === "binary" ? 1 : MARK_MAX;
    const score = isBlank ? null : clamp(parsed, lo, hi);

    setDailyMarkings(prev => {
      const found = prev.find(m => m.delegateId === delegateId);
      if (!found) {
        return [...prev, {
          id: `${committeeName}_${delegateId}_${selectedDate}`,
          eventId, committeeId: committeeName, delegateId, applicationId,
          dateStr: selectedDate, scores: score === null ? {} : { [templateId]: score },
          feedback: "", gradedBy: user!.uid, markMode,
        }];
      }
      return prev.map(m => {
        if (m.delegateId !== delegateId) return m;
        const scores = { ...(m.scores || {}) };
        const scoreEntries = { ...(m.scoreEntries || {}) };
        delete scoreEntries[templateId];
        if (score === null) delete scores[templateId]; else scores[templateId] = score;
        return { ...m, scores, scoreEntries };
      });
    });

    setSavingMatrix(true);
    await setCriterionScore(markingBase(delegateId, applicationId), templateId, score);
    setSavingMatrix(false);
  };

  // The criterion's mark list — explicit entries, or a legacy/quick single value as one entry.
  const entriesForChair = (m: Marking | undefined, id: string): number[] =>
    m?.scoreEntries?.[id] ?? (typeof m?.scores?.[id] === "number" ? [m!.scores[id]] : []);

  // Apply live-session participation as auto-fill suggestions into the matrix.
  // Chair-triggered; only templates with `autoFillFrom` set, and always through the
  // normal save path so it's a suggestion the chair can override — never a silent write.
  const applySuggestions = async () => {
    if (!canMark) return;
    setSavingMatrix(true);
    for (const d of delegates) {
      const p = dailyParticipation.find(x => x.delegateId === d.userId);
      const existing = dailyMarkings.find(m => m.delegateId === d.userId);
      for (const t of event?.markingTemplates || []) {
        const sug = autoFillSuggestion(t, p);
        if (sug == null) continue;
        // Binary can't carry a numeric magnitude — any participation ⇒ +1, else neutral.
        const val = markMode === "binary" ? (sug > 0 ? 1 : 0) : clamp(sug, MARK_MIN, MARK_MAX);
        // Append rather than replace when the criterion already carries a mark list, so a
        // suggestion never wipes marks the chair gave during the sitting.
        const ent = entriesForChair(existing, t.id);
        if (ent.length > 1) await setScoreEntries(markingBase(d.userId, d.id || ""), t.id, [...ent, val]);
        else await setCriterionScore(markingBase(d.userId, d.id || ""), t.id, val);
      }
    }
    setSavingMatrix(false);
  };

  // ── Final scoring (derived from the committee's daily marks) ─────────────────
  const overallWeight = event?.scoringConfig?.overallWeight ?? DEFAULT_OVERALL_WEIGHT;
  const committeeDailyMarkings = markings.filter(m => m.kind !== "final" && !m.id?.endsWith("__final"));
  const committeeFinalDocs = markings.filter(m => m.kind === "final" || m.id?.endsWith("__final"));
  const committeeDays = deriveDays(committeeDailyMarkings, event?.scoringConfig?.markingDays);

  const computeFinalFor = (uid: string) => {
    const mine = committeeDailyMarkings.filter(m => m.delegateId === uid);
    const s = (overallInputs[uid] ?? "").trim();
    const omin = markMode === "binary" ? -1 : MARK_MIN;
    const omax = markMode === "binary" ? 1 : MARK_MAX;
    const parsedOverall = s === "" ? null : clamp(parseFloat(s), omin, omax);
    const overall = parsedOverall != null && Number.isFinite(parsedOverall) ? parsedOverall : null;
    return computeFinalScore(mine, event?.markingTemplates || [], committeeDays, overall, overallWeight, markMode);
  };

  // Seed the overall inputs from any previously-saved final docs (chair edits win).
  useEffect(() => {
    const seed: Record<string, string> = {};
    for (const f of committeeFinalDocs) {
      if (f.chairOverall != null) seed[f.delegateId] = String(f.chairOverall);
    }
    if (Object.keys(seed).length) setOverallInputs(prev => ({ ...seed, ...prev }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markings]);

  const handleSaveFinals = async () => {
    if (!user || !committeeName || !canMark) return;
    setSavingFinals(true);
    const savedDocs: Marking[] = [];
    for (const d of delegates) {
      const fs = computeFinalFor(d.userId);
      const payload = {
        eventId, committeeId: committeeName, delegateId: d.userId, applicationId: d.id || "",
        gradedBy: user.uid,
        finalScore: fs.finalScore, computedPct: fs.computedPct, chairOverall: fs.chairOverall,
        overallWeight: fs.overallWeight, dayCount: fs.dayCount, presentDays: fs.presentDays,
        excludedDays: fs.excludedDays, days: committeeDays,
        markMode,
      };
      await saveFinalScore(payload);
      savedDocs.push({ id: `${committeeName}_${d.userId}__final`, kind: "final", scores: {}, feedback: "", ...payload });
    }
    // Replace final docs in the committee-wide markings cache
    setMarkings(prev => [...prev.filter(m => !(m.kind === "final" || m.id?.endsWith("__final"))), ...savedDocs]);
    setSavingFinals(false);
    setFinalsSaved(true);
    setTimeout(() => setFinalsSaved(false), 2000);
  };

  // ── Matrix derivations ──────────────────────────────────────────────────────
  const templates = event?.markingTemplates || [];

  /** One row per delegate, already filtered and sorted the way the toolbar asks. */
  const matrixRows = useMemo(() => {
    const q = delegateSearch.trim().toLowerCase();
    const rows = delegates
      .filter(d => !q || (d.assignedCountry || "").toLowerCase().includes(q) || (d.applicantName || "").toLowerCase().includes(q))
      .map(delegate => {
        const marking = dailyMarkings.find(m => m.delegateId === delegate.userId);
        return {
          delegate,
          marking,
          daily: computeDailyScore(marking, templates, markMode),
          participation: dailyParticipation.find(p => p.delegateId === delegate.userId),
        };
      })
      .filter(r => !unscoredOnly || !r.daily.present);
    const byCountry = (a: typeof rows[number], b: typeof rows[number]) =>
      (a.delegate.assignedCountry || "").localeCompare(b.delegate.assignedCountry || "");
    switch (matrixSort) {
      case "daily": return rows.sort((a, b) => (b.daily.pct ?? -1) - (a.daily.pct ?? -1) || byCountry(a, b));
      case "final": return rows.sort((a, b) => computeFinalFor(b.delegate.userId).finalScore - computeFinalFor(a.delegate.userId).finalScore || byCountry(a, b));
      case "unscored": return rows.sort((a, b) => Number(a.daily.present) - Number(b.daily.present) || byCountry(a, b));
      default: return rows.sort(byCountry);
    }
    // computeFinalFor closes over state that changes with `markings`/`overallInputs`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delegates, dailyMarkings, dailyParticipation, delegateSearch, matrixSort, unscoredOnly, templates, markMode, markings, overallInputs]);

  /** The day at a glance — what the chair would otherwise count by eye, column by column. */
  const matrixStats = useMemo(() => {
    const scoredRows = delegates
      .map(d => computeDailyScore(dailyMarkings.find(m => m.delegateId === d.userId), templates, markMode))
      .filter(s => s.present);
    const att = delegates.map(d =>
      dailyMarkings.find(m => m.delegateId === d.userId)?.attendanceStatus
      ?? dailyParticipation.find(p => p.delegateId === d.userId)?.attendanceStatus);
    const known = att.filter(Boolean);
    return {
      scored: scoredRows.length,
      avg: scoredRows.length ? scoredRows.reduce((a, s) => a + (s.pct ?? 0), 0) / scoredRows.length : null,
      attendanceKnown: known.length > 0,
      present: att.filter(s => s === "present" || s === "present_and_voting" || s === "late").length,
      absent: att.filter(s => s === "absent").length,
      cellsFilled: scoredRows.reduce((a, s) => a + s.scoredCount, 0),
      cellsTotal: delegates.length * templates.length,
    };
  }, [delegates, dailyMarkings, dailyParticipation, templates, markMode]);

  /** Delegates with at least one scored criterion on any day. */
  const gradedDelegateCount = useMemo(() => {
    const graded = new Set<string>();
    for (const m of committeeDailyMarkings) {
      if (computeDailyScore(m, templates, markMode).present) graded.add(m.delegateId);
    }
    return graded.size;
  }, [committeeDailyMarkings, templates, markMode]);

  /** Per-criterion committee mean for the day — the table's footer row. */
  const criterionMeans = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const t of templates) {
      const vals = dailyMarkings
        .map(m => m.scores?.[t.id])
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      out[t.id] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }
    return out;
  }, [dailyMarkings, templates]);

  /** Committee standings, computed from marks already in memory — no extra reads. */
  const leaderboardEntries: LeaderboardEntry[] = useMemo(() => delegates.map(d => {
    const fs = computeFinalFor(d.userId);
    return {
      delegateId: d.userId,
      country: d.assignedCountry || "",
      name: d.applicantName || "",
      finalScore: fs.finalScore,
      computedPct: fs.computedPct,
      chairOverall: fs.chairOverall,
      presentDays: fs.presentDays,
      dayCount: fs.totalDays,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [delegates, markings, overallInputs, templates, markMode, committeeDays, overallWeight]);

  // ── Published standings ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!eventId || !committeeName) return;
    let alive = true;
    getStandings(eventId, committeeName).then(s => {
      if (!alive) return;
      setPublishedStandings(s);
      if (s?.visibility) setStandingsVisibility(s.visibility);
    });
    return () => { alive = false; };
  }, [eventId, committeeName]);

  const handlePublishStandings = async () => {
    if (!user || !canMark || !committeeName) return;
    setPublishing(true);
    const entries = rankEntries(leaderboardEntries).map(e => ({
      delegateId: e.delegateId,
      applicationId: delegates.find(d => d.userId === e.delegateId)?.id || "",
      country: e.country, name: e.name, rank: e.rank,
      finalScore: e.finalScore, computedPct: e.computedPct,
      chairOverall: e.chairOverall ?? null,
      presentDays: e.presentDays, dayCount: e.dayCount,
    }));
    await publishStandings(eventId, committeeName, entries, {
      publishedBy: user.uid, visibility: standingsVisibility,
      dayCount: committeeDays.length, markMode,
    });
    const fresh = await getStandings(eventId, committeeName);
    setPublishedStandings(fresh);
    setPublishing(false);
    setStandingsPublished(true);
    setTimeout(() => setStandingsPublished(false), 2000);
  };

  const handleUnpublishStandings = async () => {
    if (!canMark || !committeeName) return;
    if (!confirm("Withdraw the published standings? Delegates will stop seeing their rank.")) return;
    setPublishing(true);
    await unpublishStandings(eventId, committeeName);
    setPublishedStandings(null);
    setPublishing(false);
  };

  const detailIndex = matrixRows.findIndex(r => r.delegate.userId === detailUid);
  const detailDelegate: DetailDelegate | null = detailIndex >= 0
    ? {
        userId: matrixRows[detailIndex].delegate.userId,
        applicationId: matrixRows[detailIndex].delegate.id || "",
        country: matrixRows[detailIndex].delegate.assignedCountry || "",
        name: matrixRows[detailIndex].delegate.applicantName || "",
      }
    : null;
  // Same ranking the leaderboard shows (ties share a rank) — the drawer must not invent a
  // different placement from the board sitting one tab over.
  const detailRank = detailUid
    ? (() => {
        const ranked = rankEntries(leaderboardEntries);
        const me = ranked.find(e => e.delegateId === detailUid);
        return me ? { position: me.rank, of: ranked.length } : null;
      })()
    : null;

  // ── Study Guide ───────────────────────────────────────────────────────────
  // .md / PDF import lives inside MarkdownDocEditor now — it owns the file pickers,
  // the extraction progress and its own error line.
  const handleSaveStudyGuide = async () => {
    if (!sgContent.trim()) { setUploadError("Study guide is empty."); return; }
    if (!committeeName) {
      setUploadError("No committee assigned to you. Ask the organizer to assign your committee in the event's Staff settings, then reload.");
      return;
    }
    setSgSaving(true);
    setUploadError(null);
    const data: StudyGuide = {
      content: sgContent,
      fileName: sgFileName || `${committeeName}-study-guide.md`,
      format: "markdown",
      uploadedAt: new Date(),
      uploadedBy: user!.uid
    };
    // Shared with the Documents-hub editor — save + delegate email + room alert.
    const res = await publishStudyGuide({
      eventId,
      committee: committeeName,
      data,
      isUpdate: !!studyGuide,
      chairUid: user!.uid,
      chairName: user?.displayName || "Your chair",
      eventTitle: event?.title,
    });
    if (res.success) {
      setStudyGuide(data);
      setStudyGuideDialogOpen(false);
    } else {
      setUploadError("Save failed: " + (res.error?.message || res.error?.code || "permission or network error"));
    }
    setSgSaving(false);
  };

  const handleDeleteStudyGuide = async () => {
    await deleteStudyGuide(eventId, committeeName);
    setStudyGuide(null);
    setSgContent("");
    setSgFileName("");
  };

  // ── Position Paper Reminders ────────────────────────────────────────────────
  const [remindingPapers, setRemindingPapers] = useState(false);
  const [reminderSent, setReminderSent] = useState<number | null>(null);

  const delegatesMissingPaper = delegates.filter(
    d => !(d as any).positionPaperContent && !(d as any).positionPaperUrl
  );

  const handleRemindMissingPapers = async () => {
    if (!delegatesMissingPaper.length) return;
    setRemindingPapers(true);
    const sent = await notifyDelegatesPaperReminder({
      eventId,
      committee: committeeName,
      eventTitle: event?.title,
    });
    setRemindingPapers(false);
    setReminderSent(sent);
    setTimeout(() => setReminderSent(null), 4000);
  };

  // ── Awards Save ───────────────────────────────────────────────────────────
  const [awardsSaving, setAwardsSaving] = useState(false);
  const [awardsSaved, setAwardsSaved] = useState(false);

  const handleSubmitAwards = async () => {
    if (!user || !committeeName) return;
    setAwardsSaving(true);
    const map: { uid: string; awardType: "best_delegate" | "outstanding" | "honorable" }[] = [];
    if (awards.bestDelegate) map.push({ uid: awards.bestDelegate, awardType: "best_delegate" });
    if (awards.outstandingDelegate) map.push({ uid: awards.outstandingDelegate, awardType: "outstanding" });
    if (awards.honorableMention) map.push({ uid: awards.honorableMention, awardType: "honorable" });

    for (const a of map) {
      const delegate = delegates.find(d => d.userId === a.uid);
      if (!delegate) continue;
      // Award the 0..100 blended final score (consistency-weighted daily %s + chair overall),
      // not a raw sum — matches what the delegate sees and what the /100 result views expect.
      const fs = computeFinalFor(a.uid);
      await submitResult(eventId, {
        delegateUid: a.uid,
        delegateName: delegate.applicantName || "Delegate",
        committeeId: committeeName,
        committeeName,
        awardType: a.awardType,
        score: fs.finalScore,
        computedPct: fs.computedPct,
        chairOverall: fs.chairOverall,
        scoreKind: "percent",
        notes: "",
        status: "pending",
        approvedBy: null,
        approvedAt: null,
        submittedBy: user.uid,
      });
    }
    setAwardsSaving(false);
    setAwardsSaved(true);
    setTimeout(() => { setAwardsSaved(false); setAwardsDialogOpen(false); }, 1500);
  };

  // ── Message Committee ─────────────────────────────────────────────────────
  const [creatingGroup, setCreatingGroup] = useState(false);
  const handleMessageCommittee = async () => {
    if (!user || delegates.length === 0) return;
    setCreatingGroup(true);
    try {
      const participantUids = delegates.map(d => d.userId).filter(Boolean);
      const names: Record<string, string> = { [user.uid]: user.displayName || "Chair" };
      const photos: Record<string, string> = {};
      delegates.forEach(d => {
        names[d.userId] = d.applicantName || "Delegate";
      });
      const convId = await createGroupConversation(
        user.uid,
        `${committeeName} — Committee`,
        participantUids,
        names,
        photos,
        { eventId, committeeId: committeeName, autoGenerated: true }
      );
      router.push(`/dashboard/messages?conv=${convId}`);
    } catch (err) {
      console.error("Failed to create committee group:", err);
    } finally {
      setCreatingGroup(false);
    }
  };

  // ── Complaint actions ──────────────────────────────────────────────────────
  const resolveComplaint = async (complaint: Complaint) => {
    const resolution = resolutionText[complaint.id] || "";
    await resolveComplaintService(complaint.id, resolution, user!.uid, "chair");

    const entry: HistoryEntry = {
      action: "resolved",
      actorUid: user!.uid,
      actorRole: "chair",
      message: resolution || "Resolved by chair.",
      timestamp: new Date().toISOString(),
    };

    setComplaints(prev => prev.map(c =>
      c.id === complaint.id ? { ...c, status: "resolved", resolution, history: [...(c.history || []), entry] } : c
    ));
  };

  const escalateComplaint = async (complaint: Complaint) => {
    await escalateComplaintService(complaint.id, complaint.escalationLevel, "Escalated to organizer.", user!.uid, "chair");

    const entry: HistoryEntry = {
      action: "escalated",
      actorUid: user!.uid,
      actorRole: "chair",
      message: "Escalated to organizer.",
      timestamp: new Date().toISOString(),
    };

    setComplaints(prev => prev.map(c =>
      c.id === complaint.id
        ? { ...c, status: "escalated", escalationLevel: complaint.escalationLevel + 1, history: [...(c.history || []), entry] }
        : c
    ));
  };

  // ── Room notification ──────────────────────────────────────────────────────
  const handleSendNotification = async () => {
    if (!notifMessage.trim() || !committeeName) return;
    setSendingNotif(true);
    const result = await sendRoomNotification(eventId, committeeName, {
      message: notifMessage.trim(),
      type: notifType,
      expiryMinutes: notifExpiry,
      createdBy: user!.uid,
    });
    setSendingNotif(false);
    if (result.success) {
      setNotifSent(true);
      setNotifMessage("");
      setTimeout(() => { setNotifSent(false); setNotifDialogOpen(false); }, 1500);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-[600px] lg:col-span-2 rounded-2xl" />
          <Skeleton className="h-[400px] rounded-2xl" />
        </div>
      </div>
    );
  }

  const openComplaints = complaints.filter(c => c.status !== "resolved" && c.status !== "rejected");
  const resolvedComplaints = complaints.filter(c => c.status === "resolved" || c.status === "rejected");

  const hubLabel = isExecBoardRole(viewerRole)
    ? "Executive Board — Oversight"
    : (viewerRole === "co-organizer" || viewerRole === "organizer")
      ? "Organizer Oversight"
      : "Chair Management Hub";

  // Permission gating (mirrors firestore.rules). Marking is committee-scoped for chairs.
  const canMark = staffRole.isOrganizerLevel || staffRole.isExecBoardOf(committeeName) ||
    staffRole.isChairOf(committeeName) || staffRole.can("canMarkDelegates");
  const canManageCommittee = staffRole.isOrganizerLevel || staffRole.isExecBoard ||
    staffRole.isChairOf(committeeName);
  const isReadOnly = !staffRole.loading && !canMark && !canManageCommittee;

  // Oversight roles open a committee via ?committee= — keep it across tab switches.
  const tabHref = (tab: string) =>
    committeeParam
      ? `/dashboard/chair/committee/${eventId}?tab=${tab}&committee=${encodeURIComponent(committeeParam)}`
      : `/dashboard/chair/committee/${eventId}?tab=${tab}`;

  // Inline notice for a management tab a read-only viewer reached by direct link.
  const lockedNotice = (label: string) => (
    <Card className="glass-card border-border/50">
      <CardContent className="flex flex-col items-center text-center gap-3 py-16">
        <Lock className="w-10 h-10 text-muted-foreground/40" />
        <div>
          <p className="font-semibold">{label} is restricted</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            You have read-only access to this committee. Ask the organizer to grant permissions if you need to act here.
          </p>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-8 pb-20">
      {/* Position Paper Viewer — mounted globally, opened from the Papers tab */}
      <Dialog open={!!selectedPaperApp} onOpenChange={(open) => !open && setSelectedPaperApp(null)}>
        <DialogContent className="max-w-[95vw] h-[95vh] p-0 border-0 bg-transparent shadow-none">
          <DialogTitle className="sr-only">Position Paper Viewer</DialogTitle>
          {selectedPaperApp && event && (
            <PositionPaperViewer
              application={selectedPaperApp}
              event={event}
              committeeName={committeeName}
              onClose={() => setSelectedPaperApp(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Hero — Overview tab only (matches the delegate portal cover) */}
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
                  {hubLabel}
                </span>
                {viewerRole && (
                  <span className="px-3 py-1 bg-secondary text-secondary-foreground text-xs font-semibold rounded-full uppercase tracking-wider">
                    {viewerRole}
                  </span>
                )}
              </div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
                {committeeName || "Committee"}
              </h1>
              <p className="text-muted-foreground max-w-2xl">{event?.title}</p>
            </div>

            <div className="flex flex-col gap-3 min-w-[200px]">
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                  <Users className="w-4 h-4 text-primary" />
                </div>
                <span>{delegates.length} Approved Delegates</span>
              </div>
              {event?.date && (
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                    <Calendar className="w-4 h-4 text-primary" />
                  </div>
                  <span>{event.date}</span>
                </div>
              )}
              {event?.location && (
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-primary" />
                  </div>
                  <span>{event.location}</span>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Status alerts — Overview tab only */}
      {activeTab === "overview" && !committeeName && (
        <Card className="glass-card border-orange-500/30 bg-orange-500/5">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold">No committee assigned to you yet</p>
              <p className="text-muted-foreground mt-0.5">
                You won't see delegates, position papers, or be able to publish a study guide until the
                organizer assigns your committee in the event's <span className="font-medium">Staff</span> settings. Reload this page after they do.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "overview" && isReadOnly && (
        <Card className="glass-card border-blue-500/30 bg-blue-500/5">
          <CardContent className="flex items-start gap-3 py-4">
            <BookOpen className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold">Read-only view</p>
              <p className="text-muted-foreground mt-0.5">
                You can review this committee's delegates, papers and scores, but not grade, publish study
                guides, or send alerts. Ask the organizer to grant permissions if you need to act.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabbed content — left rail (ChairConferenceSidebar) drives the active tab via ?tab= */}
      <Tabs value={activeTab} className="w-full">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* ── OVERVIEW: stats + quick actions ─────────────────────────────── */}
          <TabsContent value="overview" className="mt-0 outline-none">
            {/* A ceremony outranks committee business while it runs — chairs are participants
                there too, and may be called to the floor. */}
            <CeremonyLiveBanner eventId={eventId} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="glass-card">
                <CardHeader><CardTitle>Committee Stats</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {/* Distinct delegates who actually carry a score. `markings.length` counted
                      __final rollups and paper-grade docs too, so it overshot the roster. */}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Grading Progress</span>
                    <span className="font-semibold">{gradedDelegateCount} / {delegates.length}</span>
                  </div>
                  <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${Math.min(100, (gradedDelegateCount / (delegates.length || 1)) * 100)}%` }}
                    />
                  </div>
                  <div className="pt-4 space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-secondary">
                      <div className="flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-yellow-500" />
                        <span className="text-sm font-medium">Top Score</span>
                      </div>
                      <span className="text-sm font-bold">
                        {(() => {
                          if (committeeFinalDocs.length) return `${Math.max(...committeeFinalDocs.map(f => f.finalScore ?? 0))}%`;
                          const pcts = committeeDailyMarkings
                            .map(m => computeDailyScore(m, event?.markingTemplates || [], markMode).pct)
                            .filter((x): x is number => x != null);
                          return pcts.length ? `${Math.round(Math.max(...pcts))}%` : "N/A";
                        })()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-secondary">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-orange-500" />
                        <span className="text-sm font-medium">Open Complaints</span>
                      </div>
                      <span className="text-sm font-bold">{openComplaints.length}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    className="w-full justify-start gap-2"
                    disabled={!committeeName || liveChecking}
                    onClick={() => launchLive({
                      eventId,
                      href: committeeParam
                        ? `/dashboard/chair/committee/${eventId}/live?committee=${encodeURIComponent(committeeParam)}`
                        : `/dashboard/chair/committee/${eventId}/live`,
                      role: "chair",
                      committee: committeeName,
                      eventTitle: event?.title,
                      bypass: staffRole.isOrganizerLevel,
                    })}
                  >
                    <Radio className="w-4 h-4" /> Launch Live MUN
                  </Button>
                  {liveGate}
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    disabled={creatingGroup || delegates.length === 0}
                    onClick={handleMessageCommittee}
                  >
                    {creatingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />} Message Committee
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => router.push(tabHref("papers"))}
                  >
                    <FileText className="w-4 h-4" /> Review Position Papers
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => router.push(tabHref("marking"))}
                  >
                    <ClipboardList className="w-4 h-4" /> Open Marking Matrix
                  </Button>
                  {canManageCommittee && (
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={() => router.push(tabHref("roomalert"))}
                    >
                      <Bell className="w-4 h-4" /> Send Room Alert
                    </Button>
                  )}
                  {canManageCommittee && (
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={() => router.push(tabHref("studyguide"))}
                    >
                      <BookOpen className="w-4 h-4" /> {studyGuide ? "Manage" : "Upload"} Study Guide
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── MARKING: daily score matrix ─────────────────────────────────── */}
          <TabsContent value="marking" className="mt-0 outline-none space-y-4">
            {/* Where the committee stands today, before a single cell is read */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatTile label="Scored today" value={`${matrixStats.scored}/${delegates.length}`}
                hint={matrixStats.scored === delegates.length && delegates.length > 0 ? "everyone marked" : `${delegates.length - matrixStats.scored} left`} />
              <StatTile label="Committee average" value={matrixStats.avg == null ? "—" : `${Math.round(matrixStats.avg)}%`}
                hint="of the delegates scored today" tone={pctTone(matrixStats.avg)} />
              <StatTile label="Present" value={matrixStats.attendanceKnown ? `${matrixStats.present}/${delegates.length}` : "—"}
                hint={matrixStats.attendanceKnown ? `${matrixStats.absent} absent` : "no roll call recorded"} />
              <StatTile label="Criteria filled" value={`${matrixStats.cellsFilled}/${matrixStats.cellsTotal || 0}`}
                hint={`${(event?.markingTemplates || []).length} criteria × ${delegates.length} delegates`} />
            </div>

            <Card className="glass-card overflow-hidden">
              <CardHeader className="bg-secondary border-b border-border/50">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      Daily Marking Matrix
                      {savingMatrix && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Scoring on {scaleLabel(markMode)} · tap a delegate for their full record
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(event?.markingTemplates || []).some(t => t.autoFillFrom) && canMark && (
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={applySuggestions}>
                        <Star className="w-4 h-4" /> Apply suggestions
                      </Button>
                    )}
                    {/* Day stepper — a conference runs on consecutive days; typing a date for
                        each one is the slowest possible way to move between them. */}
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon-sm" title="Previous day"
                        onClick={() => setSelectedDate(shiftDay(selectedDate, -1))}>
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-auto h-9" />
                      <Button variant="outline" size="icon-sm" title="Next day"
                        onClick={() => setSelectedDate(shiftDay(selectedDate, 1))}>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                    <Select value={matrixSort} onValueChange={(v) => setMatrixSort(v as typeof matrixSort)}>
                      <SelectTrigger className="h-9 w-[142px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="country">Sort: country</SelectItem>
                        <SelectItem value="daily">Sort: daily %</SelectItem>
                        <SelectItem value="final">Sort: final %</SelectItem>
                        <SelectItem value="unscored">Sort: unscored first</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant={unscoredOnly ? "default" : "outline"} size="sm" onClick={() => setUnscoredOnly(v => !v)}>
                      Unscored only
                    </Button>
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search..."
                        className="pl-9 h-9 w-40 bg-background"
                        value={delegateSearch}
                        onChange={e => setDelegateSearch(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>

              {(!event?.markingTemplates || event.markingTemplates.length === 0) ? (
                <div className="p-8 text-center text-muted-foreground">
                  <p>No marking templates defined for this event.</p>
                  <p className="text-sm">The organizer needs to configure marking templates in the event settings.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-secondary text-xs uppercase tracking-wider font-semibold text-muted-foreground border-b border-border/50">
                      <tr>
                        <th className="px-4 py-4 min-w-[220px] sticky left-0 z-10 bg-card">Delegate / Country</th>
                        {event.markingTemplates.map(t => (
                          <th key={t.id} className="px-4 py-4 text-center min-w-[104px]">
                            {t.name}
                            <span className="block text-[10px] lowercase font-medium text-muted-foreground/70">{scaleLabel(markMode)}</span>
                          </th>
                        ))}
                        <th className="px-4 py-4 text-right min-w-[86px]">Daily&nbsp;%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {matrixRows.length === 0 ? (
                        <tr>
                          <td colSpan={(event.markingTemplates.length || 0) + 2} className="px-4 py-10 text-center text-sm text-muted-foreground">
                            {unscoredOnly ? "Every delegate has been scored today." : "No delegates match this search."}
                          </td>
                        </tr>
                      ) : matrixRows.map(({ delegate, marking, daily, participation }) => (
                        <tr key={delegate.userId} className="hover:bg-secondary transition-colors">
                          <td className="px-4 py-3 sticky left-0 z-10 bg-card">
                            <button type="button" onClick={() => setDetailUid(delegate.userId)}
                              className="flex items-center gap-3 text-left w-full group">
                              {delegate.assignedCountry
                                ? <CountryFlag code={delegate.assignedCountry} size={30} />
                                : <span className="w-[30px] h-[30px] rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xs shrink-0">?</span>}
                              <div className="min-w-0">
                                <p className="font-medium truncate text-sm flex items-center gap-1">
                                  {getCountryName(delegate.assignedCountry || "") || "Pending"}
                                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5" />
                                </p>
                                <p className="text-xs text-muted-foreground truncate">{delegate.applicantName}</p>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  <AttendancePill status={marking?.attendanceStatus ?? participation?.attendanceStatus} />
                                  <ParticipationChips p={participation} />
                                </div>
                              </div>
                            </button>
                          </td>
                          {event.markingTemplates!.map(t => {
                            const ent = marking?.scoreEntries?.[t.id];
                            const cell = marking?.scores?.[t.id];
                            return (
                              <td key={t.id} className="px-4 py-3 text-center">
                                {ent && ent.length ? (
                                  // A multi-mark criterion is read-only here — the list is edited
                                  // in the detail drawer, where every mark is visible.
                                  <button
                                    type="button" onClick={() => setDetailUid(delegate.userId)}
                                    title={`${ent.length} marks · open the full record to edit`}
                                    className={cn("mx-auto min-w-16 h-8 px-2 rounded-lg border text-sm font-semibold tabular-nums flex items-center justify-center gap-1 hover:brightness-95", cellTone(cell))}
                                  >
                                    {(() => { const v = markMode === "binary" ? Math.round((cell ?? 0) * 10) / 10 : Math.round(cell ?? 0); return v > 0 ? `+${v}` : `${v}`; })()}
                                    <span className="text-[9px] opacity-60 font-normal">·{ent.length}</span>
                                  </button>
                                ) : markMode === "binary" ? (
                                  <div className="flex justify-center">
                                    <BinaryScoreSelect
                                      value={typeof cell === "number" ? cell : null}
                                      disabled={!canMark}
                                      onChange={v => handleScoreChange(delegate.userId, t.id, v == null ? "" : String(v), delegate.id || "")}
                                    />
                                  </div>
                                ) : (
                                  <input
                                    type="number"
                                    className={cn("mx-auto w-16 h-8 rounded-lg border text-center font-mono text-[13px] font-bold tabular-nums outline-none transition-colors focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed placeholder:font-normal placeholder:text-muted-foreground/40", cellTone(typeof cell === "number" ? cell : null))}
                                    min={MARK_MIN}
                                    max={MARK_MAX}
                                    disabled={!canMark}
                                    placeholder="—"
                                    value={cell ?? ""}
                                    onChange={e => handleScoreChange(delegate.userId, t.id, e.target.value, delegate.id || "")}
                                  />
                                )}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3">
                            <PctBar pct={daily.pct} className="ml-auto w-16 text-right" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {matrixRows.length > 0 && (
                      <tfoot className="border-t border-border/60 bg-secondary text-xs">
                        <tr>
                          <td className="px-4 py-2.5 sticky left-0 z-10 bg-card font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                            Committee mean
                          </td>
                          {event.markingTemplates!.map(t => (
                            <td key={t.id} className="px-4 py-2.5 text-center font-mono font-bold tabular-nums text-muted-foreground">
                              {criterionMeans[t.id] == null
                                ? "—"
                                : (markMode === "binary" ? Math.round(criterionMeans[t.id]! * 10) / 10 : Math.round(criterionMeans[t.id]!))}
                            </td>
                          ))}
                          <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums text-muted-foreground">
                            {matrixStats.avg == null ? "—" : `${Math.round(matrixStats.avg)}%`}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* ── MOTION LOG: the day's procedural record ─────────────────────── */}
          {/* Its own date, deliberately not `selectedDate`: reading back day 1's motions
              while marking day 3 is a normal thing to want, and coupling the two would
              silently move the matrix under the chair. */}
          <TabsContent value="motionlog" className="mt-0 outline-none">
            <DailyMotionLog
              eventId={eventId}
              committeeId={committeeName}
              dateStr={logDate}
              onDateChange={setLogDate}
              delegates={delegates}
            />
          </TabsContent>

          {/* ── PAPERS: position papers + grade ─────────────────────────────── */}
          <TabsContent value="papers" className="mt-0 outline-none">
            <Card className="glass-card overflow-hidden">
              <CardHeader className="bg-secondary border-b border-border/50">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" /> Position Papers — {committeeName}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-secondary p-3">
                  <div className="text-sm">
                    <p className="font-semibold">
                      {delegates.length - delegatesMissingPaper.length}/{delegates.length} submitted
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {delegatesMissingPaper.length} delegate{delegatesMissingPaper.length === 1 ? "" : "s"} not submitted yet
                    </p>
                  </div>
                  {canManageCommittee && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2 shrink-0"
                      disabled={remindingPapers || delegatesMissingPaper.length === 0}
                      onClick={handleRemindMissingPapers}
                    >
                      {remindingPapers ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
                      Remind by email
                    </Button>
                  )}
                </div>
                {reminderSent !== null && (
                  <p className="mt-2 text-xs text-green-600 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Reminder emailed to {reminderSent} delegate{reminderSent === 1 ? "" : "s"}.
                  </p>
                )}

                <div className="mt-4 space-y-4">
                  {delegates.length === 0 && (
                    <div className="py-10 text-center text-muted-foreground">
                      <FileText className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
                      <p className="text-sm">No approved delegates in this committee yet.</p>
                    </div>
                  )}
                  {delegates.map(delegate => {
                    const paperUrl = (delegate as any).positionPaperUrl || (delegate as any).positionPaperContent;
                    return (
                      <div key={delegate.userId} className="flex items-center justify-between p-3 border rounded-lg bg-secondary">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                            {delegate.assignedCountry?.[0] || "?"}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{delegate.assignedCountry}</p>
                            <p className="text-xs text-muted-foreground">{delegate.applicantName}</p>
                          </div>
                        </div>
                        {paperUrl ? (
                          <Button size="sm" variant="outline" className="gap-2" onClick={() => setSelectedPaperApp(delegate)}>
                            <ExternalLink className="w-3.5 h-3.5" /> {canMark ? "Grade" : "View"}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Not submitted</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── REQUESTS: complaint inbox ───────────────────────────────────── */}
          <TabsContent value="requests" className="mt-0 outline-none">
            <Card className="glass-card overflow-hidden">
              <CardHeader className="bg-secondary border-b border-border/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-primary" /> Complaint Inbox
                    {openComplaints.length > 0 && (
                      <Badge className="bg-red-500/10 text-red-600 border-red-500/20 text-xs">{openComplaints.length}</Badge>
                    )}
                  </CardTitle>
                  <SegmentedTabs
                    layoutId="chairComplaintTab"
                    value={complaintTab}
                    onChange={(v) => setComplaintTab(v as "open" | "resolved")}
                    items={[
                      { id: "open", label: "Open", icon: AlertTriangle, count: openComplaints.length },
                      { id: "resolved", label: "Resolved", icon: CheckCircle2, count: resolvedComplaints.length },
                    ]}
                  />
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {complaintsLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                ) : (complaintTab === "open" ? openComplaints : resolvedComplaints).length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground">
                    <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
                    <p className="text-sm">No {complaintTab} complaints</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(complaintTab === "open" ? openComplaints : resolvedComplaints).map(complaint => (
                      <div key={complaint.id} className="border border-border/50 rounded-xl p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-secondary px-2 py-0.5 rounded-md mr-2">
                              {complaint.type}
                            </span>
                            <h4 className="font-bold mt-1">{complaint.subject}</h4>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {complaint.createdAt?.toDate?.() instanceof Date
                              ? complaint.createdAt.toDate().toLocaleDateString()
                              : ""}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground bg-secondary rounded-lg p-3">{complaint.description}</p>

                        {complaint.status === "open" && (
                          <div className="space-y-2">
                            <Input
                              placeholder="Resolution note (optional)"
                              value={resolutionText[complaint.id] || ""}
                              onChange={e => setResolutionText(prev => ({ ...prev, [complaint.id]: e.target.value }))}
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="flex-1 gap-2 bg-green-600 hover:bg-green-700"
                                onClick={() => resolveComplaint(complaint)}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" /> Resolve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 gap-2"
                                onClick={() => escalateComplaint(complaint)}
                              >
                                <ArrowUpCircle className="w-3.5 h-3.5" /> Escalate to Organizer
                              </Button>
                            </div>
                          </div>
                        )}

                        {complaint.resolution && (
                          <p className="text-xs text-green-600 bg-green-500/5 border border-green-500/20 rounded-lg p-2">
                            Resolution: {complaint.resolution}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── STUDY GUIDE: editor ─────────────────────────────────────────── */}
          <TabsContent value="studyguide" className="mt-0 outline-none">
            {!canManageCommittee ? lockedNotice("Study Guide") : (
              <Card className="glass-card overflow-hidden">
                <CardHeader className="bg-secondary border-b border-border/50">
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-primary" /> Study Guide — {committeeName}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Write it Word-style with full formatting and AI assistance, or import an .md file
                    or a PDF (text extracted, original not stored).
                  </p>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  {/* Same authoring surface as the organizer's Rules & Regulations guide
                      and the standalone chair StudyGuideEditor: WYSIWYG toolbar +
                      selection bubble + AI draft/rewrite, markdown under the hood, with
                      .md / PDF import built in. */}
                  <div className="space-y-1.5">
                    <Label>File name <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Input
                      placeholder={`${committeeName || "committee"}-study-guide.md`}
                      value={sgFileName}
                      onChange={e => setSgFileName(e.target.value)}
                    />
                  </div>

                  <MarkdownDocEditor
                    value={sgContent}
                    onChange={setSgContent}
                    placeholder={"# Study Guide\n\n## Topic Background\n\n## Past International Action\n\n## Key Questions to Consider\n\n## Questions a Resolution Must Answer\n\n## Further Reading"}
                    ai={{ surface: "study-guide", context: { committee: committeeName } }}
                  />

                  {uploadError && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-400">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> <span>{uploadError}</span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button className="flex-1 gap-2" onClick={handleSaveStudyGuide} disabled={sgSaving || !sgContent.trim()}>
                      {sgSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                      {studyGuide ? "Update Guide" : "Publish Guide"}
                    </Button>
                    {studyGuide && (
                      <Button variant="outline" className="gap-2 text-red-500 border-red-500/30 hover:bg-red-500/10" onClick={handleDeleteStudyGuide}>
                        <Trash2 className="w-4 h-4" /> Delete
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── RULES & REGULATIONS: read-only ──────────────────────────────── */}
          {/* The organizer's rulebook, in the room where the chair actually runs
              procedure. Read-only for everyone here — authoring stays with the
              organizer (event dashboard → Content → Rules & Regs). */}
          <TabsContent value="rules" className="mt-0 outline-none">
            <RulesGuideViewer eventId={eventId} />
          </TabsContent>

          {/* ── MY PASS: the staff member's own QR pass (setup/qr-passes-plan.md) ── */}
          <TabsContent value="pass" className="mt-0 outline-none">
            <PassCard eventId={eventId} eventTitle={event?.title} />
          </TabsContent>

          {/* ── AWARDS & RESULTS ────────────────────────────────────────────── */}
          <TabsContent value="awards" className="mt-0 outline-none">
            {!canMark ? lockedNotice("Awards & Results") : (
              <div className="space-y-6">
              {/* Standings — the ranked view of the same finals the table below edits */}
              <Card className="glass-card overflow-hidden">
                <CardHeader className="bg-secondary border-b border-border/50">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-amber-500" /> Committee Standings
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        Live ranking from the current marks. Publishing shows it to delegates —
                        it is not shared until you say so.
                        {publishedStandings?.publishedAt && (
                          <span className="ml-1 text-foreground font-medium">
                            Published ({publishedStandings.visibility === "rank_only" ? "rank only" : "full board"}).
                          </span>
                        )}
                      </p>
                    </div>
                    {committeeDays.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <Select value={standingsVisibility} onValueChange={(v) => setStandingsVisibility(v as StandingsVisibility)}>
                          <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="full">Show full board</SelectItem>
                            <SelectItem value="rank_only">Show rank only</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={handlePublishStandings} disabled={publishing}>
                          {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : standingsPublished ? <CheckCircle2 className="w-4 h-4" /> : <Award className="w-4 h-4" />}
                          {standingsPublished ? "Published" : publishedStandings ? "Update" : "Publish"}
                        </Button>
                        {publishedStandings && (
                          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={handleUnpublishStandings} disabled={publishing}>
                            Withdraw
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CommitteeLeaderboard
                  entries={leaderboardEntries}
                  markMode={markMode}
                  emptyHint="No daily marks yet — the board fills in from the Marking matrix."
                />
              </Card>

              {/* Final Scoring — consistency-weighted rollup + manual chair overall */}
              <Card className="glass-card overflow-hidden">
                <CardHeader className="bg-secondary border-b border-border/50">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <ClipboardList className="w-5 h-5 text-primary" /> Final Scoring
                        {savingFinals && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        Final&nbsp;% = average of each delegate&apos;s daily&nbsp;% across{" "}
                        <span className="font-medium text-foreground">{committeeDays.length}</span>{" "}
                        {committeeDays.length === 1 ? "day" : "days"} (absent day = 0%; a day they attended but you
                        never scored is left out, not zeroed), blended with your manual overall
                        at <span className="font-medium text-foreground">{Math.round(overallWeight * 100)}%</span>.
                      </p>
                    </div>
                    {committeeDays.length > 0 && (
                      <Button size="sm" className="gap-1.5 shrink-0" onClick={handleSaveFinals} disabled={savingFinals}>
                        {finalsSaved ? <CheckCircle2 className="w-4 h-4" /> : savingFinals ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
                        {finalsSaved ? "Saved" : "Compute & Save Final Scores"}
                      </Button>
                    )}
                  </div>
                  {committeeDays.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {committeeDays.map(d => (
                        <span key={d} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary text-muted-foreground tabular-nums">{d}</span>
                      ))}
                    </div>
                  )}
                </CardHeader>
                {committeeDays.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <p>No daily marks yet.</p>
                    <p className="text-sm">Score delegates in the Marking matrix first — final scores roll up from there.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-secondary text-xs uppercase tracking-wider font-semibold text-muted-foreground border-b border-border/50">
                        <tr>
                          <th className="px-4 py-3 min-w-[200px]">Delegate / Country</th>
                          <th className="px-4 py-3 text-center">Days</th>
                          <th className="px-4 py-3 text-center">Computed&nbsp;%</th>
                          <th className="px-4 py-3 text-center">Overall ({markMode === "binary" ? "−1 / 0 / +1" : "−100…+100"})</th>
                          <th className="px-4 py-3 text-right">Final&nbsp;%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {delegates.map(delegate => {
                          const fs = computeFinalFor(delegate.userId);
                          return (
                            <tr key={delegate.userId} className="hover:bg-secondary transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xs shrink-0">
                                    {delegate.assignedCountry?.[0] || "?"}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-medium truncate text-sm">{delegate.assignedCountry || "Pending"}</p>
                                    <p className="text-xs text-muted-foreground truncate">{delegate.applicantName}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center text-sm text-muted-foreground tabular-nums">{fs.presentDays}/{fs.dayCount}</td>
                              <td className="px-4 py-3 text-center text-sm font-medium tabular-nums">{Math.round(fs.computedPct)}%</td>
                              <td className="px-4 py-3 text-center">
                                {markMode === "binary" ? (
                                  <div className="flex justify-center">
                                    <BinaryScoreSelect
                                      value={(() => { const s = (overallInputs[delegate.userId] ?? "").trim(); if (s === "") return null; const n = parseFloat(s); return Number.isFinite(n) ? n : null; })()}
                                      onChange={v => setOverallInputs(prev => ({ ...prev, [delegate.userId]: v == null ? "" : String(v) }))}
                                    />
                                  </div>
                                ) : (
                                  <Input
                                    type="number" min={MARK_MIN} max={MARK_MAX}
                                    placeholder="—"
                                    className="w-20 h-8 text-center mx-auto"
                                    value={overallInputs[delegate.userId] ?? ""}
                                    onChange={e => setOverallInputs(prev => ({ ...prev, [delegate.userId]: e.target.value }))}
                                  />
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="font-bold tabular-nums text-primary">{fs.finalScore}%</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card className="glass-card overflow-hidden">
                <CardHeader className="bg-secondary border-b border-border/50">
                  <CardTitle className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-yellow-500" /> Final Awards
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Submit the final awards for {committeeName}. Each awarded delegate carries their blended final&nbsp;% (compute &amp; save above first).</p>
                </CardHeader>
                <CardContent className="pt-4 max-w-md space-y-4">
                  <div className="space-y-2">
                    <Label>Best Delegate</Label>
                    <Select value={awards.bestDelegate} onValueChange={v => setAwards({...awards, bestDelegate: v ?? ""})}>
                      <SelectTrigger><SelectValue placeholder="Select delegate..." /></SelectTrigger>
                      <SelectContent>
                        {delegates.map(d => (
                          <SelectItem key={d.userId} value={d.userId}>{d.assignedCountry || d.applicantName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Outstanding Delegate</Label>
                    <Select value={awards.outstandingDelegate} onValueChange={v => setAwards({...awards, outstandingDelegate: v ?? ""})}>
                      <SelectTrigger><SelectValue placeholder="Select delegate..." /></SelectTrigger>
                      <SelectContent>
                        {delegates.map(d => (
                          <SelectItem key={d.userId} value={d.userId}>{d.assignedCountry || d.applicantName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Honorable Mention</Label>
                    <Select value={awards.honorableMention} onValueChange={v => setAwards({...awards, honorableMention: v ?? ""})}>
                      <SelectTrigger><SelectValue placeholder="Select delegate..." /></SelectTrigger>
                      <SelectContent>
                        {delegates.map(d => (
                          <SelectItem key={d.userId} value={d.userId}>{d.assignedCountry || d.applicantName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {awardsSaved ? (
                    <div className="w-full text-center py-2 text-green-600 font-semibold flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-5 h-5" /> Awards submitted
                    </div>
                  ) : (
                    <Button className="w-full gap-2" onClick={handleSubmitAwards} disabled={awardsSaving || (!awards.bestDelegate && !awards.outstandingDelegate && !awards.honorableMention)}>
                      {awardsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Submit Awards
                    </Button>
                  )}
                </CardContent>
              </Card>
              </div>
            )}
          </TabsContent>

          {/* ── ROOM ALERT ──────────────────────────────────────────────────── */}
          <TabsContent value="roomalert" className="mt-0 outline-none">
            {!canManageCommittee ? lockedNotice("Room Alert") : (
              <Card className="glass-card overflow-hidden">
                <CardHeader className="bg-secondary border-b border-border/50">
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="w-5 h-5 text-primary" /> Send Room Notification
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Delegates in {committeeName} will see this immediately.</p>
                </CardHeader>
                <CardContent className="pt-4 max-w-md space-y-4">
                  {notifSent ? (
                    <div className="py-8 text-center">
                      <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
                      <p className="font-semibold">Notification sent!</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label>Message</Label>
                        <Textarea
                          placeholder="e.g. All delegates please report to committee room 3."
                          className="min-h-[80px]"
                          value={notifMessage}
                          onChange={e => setNotifMessage(e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Type</Label>
                          <Select value={notifType} onValueChange={(v) => setNotifType(v as any)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="info">Info</SelectItem>
                              <SelectItem value="warning">Warning</SelectItem>
                              <SelectItem value="urgent">Urgent</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Expires in</Label>
                          <Select value={String(notifExpiry)} onValueChange={(v) => setNotifExpiry(Number(v))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="15">15 min</SelectItem>
                              <SelectItem value="30">30 min</SelectItem>
                              <SelectItem value="60">1 hour</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <Button
                        className="w-full gap-2"
                        disabled={!notifMessage.trim() || sendingNotif}
                        onClick={handleSendNotification}
                      >
                        {sendingNotif ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : <><Bell className="w-4 h-4" /> Send Alert</>}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </motion.div>
      </Tabs>

      {/* One delegate's whole record — day by day, mark by mark, with the final's arithmetic
          spelled out. Mounted outside the tabs so it survives a tab switch. */}
      <DelegateMarkingDetail
        open={!!detailUid}
        onOpenChange={(v) => { if (!v) setDetailUid(null); }}
        eventId={eventId}
        committeeId={committeeName}
        delegate={detailDelegate}
        templates={templates}
        markMode={markMode}
        days={committeeDays}
        selectedDate={selectedDate}
        overallWeight={overallWeight}
        chairOverall={detailUid ? computeFinalFor(detailUid).chairOverall : null}
        canMark={canMark}
        gradedBy={user?.uid || ""}
        rank={detailRank}
        onPrev={detailIndex > 0 ? () => setDetailUid(matrixRows[detailIndex - 1].delegate.userId) : undefined}
        onNext={detailIndex >= 0 && detailIndex < matrixRows.length - 1 ? () => setDetailUid(matrixRows[detailIndex + 1].delegate.userId) : undefined}
      />
    </div>
  );
}

/** Shift a YYYY-MM-DD string by whole days without dragging in a date library. */
function shiftDay(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + delta);
  return format(d, "yyyy-MM-dd");
}

function StatTile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card px-3.5 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("font-mono text-xl font-extrabold tabular-nums leading-none mt-1", tone)}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-1 truncate">{hint}</p>}
    </div>
  );
}
