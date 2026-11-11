"use client";

import { syncMembers, ensureMyMembership } from "@/lib/services/membershipService";
import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase/client";
import { collectionGroup, query, where, getDocs, getDoc, doc, updateDoc, writeBatch, serverTimestamp, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { Info, AlertTriangle, Siren } from "lucide-react";
import { getUserApplications } from "@/lib/services/applicationService";
import { subscribeRoomNotifications } from "@/lib/services/roomNotificationService";
import { subscribeMyNotifications, markNotificationRead, markAllNotificationsRead, AppNotification } from "@/lib/services/notificationService";
import {
  makeSessionId, subscribePoints, subscribeMotionQueue, subscribeRequests, subscribeSession,
  POINT_META, MOTION_META, FLOOR_REQUEST_META,
} from "@/lib/services/sessionService";
import { AnimatePresence, motion } from "framer-motion";
import { CountryFlag } from "@/components/ui/CountryFlag";

export const typeConfig = {
  info: { label: "Info", icon: Info, color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/20", toast: "bg-blue-500" },
  warning: { label: "Warning", icon: AlertTriangle, color: "text-yellow-500", bg: "bg-yellow-500/10 border-yellow-500/20", toast: "bg-yellow-500" },
  urgent: { label: "Urgent", icon: Siren, color: "text-red-500", bg: "bg-red-500/10 border-red-500/20", toast: "bg-red-500" },
};

type NotificationsContextValue = {
  notifications: any[];
  roomNotifications: any[];
  appNotifications: AppNotification[];
  readIds: Set<string>;
  loading: boolean;
  unreadCount: number;
  fetchNotifications: () => Promise<void>;
  markRoomNotifsRead: () => void;
  markAppNotifRead: (id: string) => void;
  markAllAppNotifsRead: () => void;
  handleAcceptInvite: (notif: any) => Promise<void>;
  handleRejectInvite: (notif: any) => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();

  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [approvedCommittees, setApprovedCommittees] = useState<any[]>([]);
  const [staffCommittees, setStaffCommittees] = useState<any[]>([]);
  const [roomNotifications, setRoomNotifications] = useState<any[]>([]);
  const [appNotifications, setAppNotifications] = useState<AppNotification[]>([]);
  const [toasts, setToasts] = useState<any[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const prevIds = useRef<Set<string>>(new Set());
  const pageLoadTime = useRef(Date.now());
  // Sessions whose activeVote we've already snapshotted once — so an already-open vote at load
  // never toasts; only a fresh vote opened afterwards does.
  const voteSeenSessions = useRef<Set<string>>(new Set());

  // Today (local YYYY-MM-DD) — the live session id is keyed by committee + date.
  const today = useMemo(() => {
    const d = new Date();
    const z = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      // Match both the raw auth email and a normalized (lowercase/trim) form so a
      // casing mismatch on the invite can't silently hide it. Dedupe by doc path.
      const emails = Array.from(new Set([user.email, user.email.trim().toLowerCase()]));
      const snaps = await Promise.all(
        emails.map(e => getDocs(query(collectionGroup(db, "staff"), where("email", "==", e))))
      );
      const seen = new Set<string>();
      const list: any[] = [];
      const staffComms: any[] = [];
      const titleCache = new Map<string, string>();
      const titleOf = async (eventId: string): Promise<string> => {
        if (titleCache.has(eventId)) return titleCache.get(eventId)!;
        let t = "MUN Conference";
        try {
          const eventSnap = await getDoc(doc(db, "events", eventId));
          if (eventSnap.exists()) t = eventSnap.data()?.title || "MUN Conference";
        } catch { /* draft events aren't readable pre-accept — keep default title */ }
        titleCache.set(eventId, t);
        return t;
      };

      for (const snap of snaps) {
        for (const d of snap.docs) {
          if (seen.has(d.ref.path)) continue;
          seen.add(d.ref.path);
          const data = d.data();
          const eventId = d.ref.path.split("/")[1];
          if (data.inviteStatus === "invited") {
            const eventTitle = await titleOf(eventId);
            list.push({ id: d.id, path: d.ref.path, ref: d.ref, eventId, eventTitle, role: data.role, ...data });
          } else if (data.inviteStatus === "accepted" && data.committeeId) {
            // Chair / committee-scoped EB: watch this committee's live session for raises.
            const eventTitle = await titleOf(eventId);
            staffComms.push({ eventId, committeeId: data.committeeId, eventTitle });
          }
        }
      }
      setNotifications(list);
      setStaffCommittees(staffComms);
    } catch (err) {
      console.error("Error fetching notifications:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Realtime: rebuild notifications whenever the user's staff docs change (new invite,
  // role update, accept/reject) — no manual refresh needed.
  useEffect(() => {
    if (!user?.email) return;
    fetchNotifications();
    const unsubs = Array.from(new Set([user.email, user.email.trim().toLowerCase()])).map(e =>
      onSnapshot(
        query(collectionGroup(db, "staff"), where("email", "==", e)),
        () => { fetchNotifications(); },
        (err) => console.error("Notification subscription error:", err)
      )
    );
    return () => unsubs.forEach(u => u());
  }, [user, fetchNotifications]);

  // Load read notifications from local storage on mount/user change
  useEffect(() => {
    if (!user) return;
    try {
      const stored = localStorage.getItem(`room_notifs_read_${user.uid}`);
      setReadIds(stored ? new Set(JSON.parse(stored)) : new Set());
    } catch (e) {
      console.error("Error reading notifications read state from localStorage:", e);
    }
  }, [user]);

  // Realtime generic in-app notifications (migration flow + future features).
  useEffect(() => {
    if (!user?.uid) { setAppNotifications([]); return; }
    const unsub = subscribeMyNotifications(user.uid, setAppNotifications);
    return () => unsub();
  }, [user]);

  const markAppNotifRead = useCallback((id: string) => {
    setAppNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
    markNotificationRead(id);
  }, []);

  const markAllAppNotifsRead = useCallback(() => {
    if (!user?.uid) return;
    setAppNotifications(prev => prev.map(n => ({ ...n, read: true })));
    markAllNotificationsRead(user.uid);
  }, [user]);

  // Load user's approved committees/events
  useEffect(() => {
    if (!user) {
      setApprovedCommittees([]);
      return;
    }

    let active = true;
    async function loadUserCommittees() {
      if (!user) return;
      try {
        const apps = await getUserApplications(user.uid);
        const approved = apps.filter(app => app.status === "approved" && app.assignedCommittee);

        const committeesWithTitles = await Promise.all(
          approved.map(async (app) => {
            let eventTitle = "MUN Conference";
            try {
              const eventSnap = await getDoc(doc(db, "events", app.eventId));
              if (eventSnap.exists()) {
                eventTitle = eventSnap.data()?.title || "MUN Conference";
              }
            } catch (err) {
              console.error("Error fetching event title for notification:", err);
            }
            return { eventId: app.eventId, committeeId: app.assignedCommittee, eventTitle };
          })
        );

        // Self-heal the membership marker the live read rules check, BEFORE the session
        // listeners below subscribe (a denied listener is never retried). Once per event.
        await Promise.all([...new Set(committeesWithTitles.map((c) => c.eventId))].map((id) => ensureMyMembership(id)));
        if (active) setApprovedCommittees(committeesWithTitles);
      } catch (err) {
        console.error("Error loading user committees for notifications:", err);
      }
    }

    loadUserCommittees();
    return () => {
      active = false;
    };
  }, [user]);

  // Subscribe to real-time room notifications for user's committees
  useEffect(() => {
    if (approvedCommittees.length === 0) {
      setRoomNotifications([]);
      return;
    }

    const unsubscribers = approvedCommittees.map(comm => {
      return subscribeRoomNotifications(comm.eventId, comm.committeeId!, (notifs) => {
        const enriched = notifs.map(n => ({
          ...n,
          eventId: comm.eventId,
          eventTitle: comm.eventTitle,
          committeeId: comm.committeeId,
        }));

        const newNotifs = enriched.filter(n => {
          if (!n.id || prevIds.current.has(n.id)) return false;
          prevIds.current.add(n.id);
          const createdTime = n.createdAt?.toMillis
            ? n.createdAt.toMillis()
            : (n.createdAt?.seconds ? n.createdAt.seconds * 1000 : Date.now());
          return createdTime > pageLoadTime.current - 10000;
        });

        if (newNotifs.length > 0) {
          setToasts(prev => [...prev, ...newNotifs]);
          setTimeout(() => {
            setToasts(prev => prev.filter(t => !newNotifs.some(nt => nt.id === t.id)));
          }, 5000);
        }

        setRoomNotifications(prev => {
          const filtered = prev.filter(n => !(n.eventId === comm.eventId && n.committeeId === comm.committeeId));
          const updated = [...filtered, ...enriched];
          return updated.sort((a, b) => {
            const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
            const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
            return timeB - timeA;
          });
        });
      });
    });

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [approvedCommittees]);

  // Union of committees to toast the viewer about — their delegate committees AND any
  // committee they chair / EB-oversee (chairs aren't in `applications`). Dedupe by key.
  const watchCommittees = useMemo(() => {
    const byKey = new Map<string, any>();
    for (const c of [...approvedCommittees, ...staffCommittees]) {
      if (!c?.eventId || !c?.committeeId) continue;
      byKey.set(`${c.eventId}__${c.committeeId}`, c);
    }
    return Array.from(byKey.values());
  }, [approvedCommittees, staffCommittees]);

  const isStaffOf = useCallback((eventId: string, committeeId: string) =>
    staffCommittees.some((c) => c.eventId === eventId && c.committeeId === committeeId),
  [staffCommittees]);

  // Committee-wide dashboard toast: pop when a delegate raises a Point / proposes a Motion /
  // raises a hand in that committee's live session today. Reads points / motionQueue / requests
  // (all signed-in-readable) — no writes, no rules change. Clicking a toast opens the live console.
  useEffect(() => {
    if (watchCommittees.length === 0 || !user?.uid) return;
    const uid = user.uid;

    const pushToast = (t: any) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 5000);
    };
    // Only toast docs seen for the first time AND created after page load (skip the initial
    // snapshot of already-pending raises).
    const fresh = (id: string, createdAt: any) => {
      if (!id || prevIds.current.has(id)) return false;
      prevIds.current.add(id);
      const ms = createdAt?.toMillis ? createdAt.toMillis()
        : (createdAt?.seconds ? createdAt.seconds * 1000 : Date.now());
      return ms > pageLoadTime.current - 10000;
    };

    const unsubs: Array<() => void> = [];
    for (const comm of watchCommittees) {
      const { eventId, committeeId, eventTitle } = comm;
      const sessionId = makeSessionId(committeeId, today);
      // Only chairs get a clickable toast that deep-links to the relevant tool.
      // Delegates get the same toast as info-only (no href → non-clickable).
      const isChair = isStaffOf(eventId, committeeId);
      const chairLink = (focus: "motions" | "requests" | "voting") =>
        isChair
          ? `/dashboard/chair/committee/${eventId}/live?committee=${encodeURIComponent(committeeId)}&focus=${focus}&t=${Date.now()}`
          : undefined;
      const base = { eventTitle, committeeId };

      unsubs.push(subscribePoints(eventId, sessionId, (points) => {
        for (const p of points) {
          if (p.status !== "pending" || p.delegateId === uid) continue;
          if (!fresh(`pt_${p.id}`, p.createdAt)) continue;
          const meta = POINT_META[p.type];
          // The delegate's own note, when they wrote one — a chair deciding whether to break into
          // a speech needs to know what the point is ABOUT, not just that one exists. Clamped so a
          // 160-char note cannot push the toast off its 5s read.
          const note = (p.note || "").trim();
          const gist = note ? ` — “${note.length > 70 ? `${note.slice(0, 70)}…` : note}”` : "";
          pushToast({
            ...base, id: `pt_${p.id}`, country: p.country,
            href: chairLink("motions"),
            type: meta?.canInterrupt ? "urgent" : "info",
            message: `${p.country || "A delegate"} raised a ${meta?.label || "point"}${gist}`,
          });
        }
      }));

      unsubs.push(subscribeMotionQueue(eventId, sessionId, (motions) => {
        for (const m of motions) {
          if (m.status !== "pending" || m.byDelegateId === uid) continue;
          if (!fresh(`mo_${m.id}`, m.createdAt)) continue;
          pushToast({
            ...base, id: `mo_${m.id}`, type: "warning", country: m.byCountry,
            href: chairLink("motions"),
            message: `${m.byCountry || "A delegate"} proposed: ${MOTION_META[m.type]?.label || "a motion"}`,
          });
        }
      }));

      unsubs.push(subscribeRequests(eventId, sessionId, (requests) => {
        for (const r of requests) {
          if (r.status !== "pending" || r.delegateId === uid) continue;
          if (!fresh(`rq_${r.id}`, r.createdAt)) continue;
          pushToast({
            ...base, id: `rq_${r.id}`, country: r.country,
            // A re-vote request has the vote clock running on it — louder than a raised hand. A
            // yield has the SPEECH clock running on it, which is shorter still. Both keep toasting
            // even though the chair console pins a yield card: this context watches every committee
            // the user staffs, so a chair who is on the dashboard or in another tab has no card.
            type: r.kind === "vote_change" || r.kind === "yield" ? "urgent" : "info",
            href: chairLink("requests"),
            message: `${r.country || "A delegate"} — ${FLOOR_REQUEST_META[r.kind]?.label || "raised a hand"}`,
          });
        }
      }));

      // Vote-open toast: pop when the chair opens a *new* vote. The session doc is a live snapshot,
      // so skip the first snapshot per session (an already-open vote at load must not re-toast) and
      // dedupe by voteId. The chair who opened it (`startedBy`) already knows — skip them.
      unsubs.push(subscribeSession(eventId, sessionId, (s) => {
        const vote = s?.activeVote;
        if (!voteSeenSessions.current.has(sessionId)) {
          voteSeenSessions.current.add(sessionId);
          if (vote?.voteId) prevIds.current.add(`vote_${vote.voteId}`);
          return;
        }
        if (!vote?.voteId || vote.startedBy === uid) return;
        if (prevIds.current.has(`vote_${vote.voteId}`)) return;
        prevIds.current.add(`vote_${vote.voteId}`);
        pushToast({
          ...base, id: `vote_${vote.voteId}`, type: "warning",
          message: `Voting opened${vote.motion ? ` — ${vote.motion}` : " — cast your vote"}`,
        });
      }));

      // "Publish the result" nudge. A vote can auto-close on its timer with no chair looking at
      // the Voting panel, and the result stays hidden from the room until someone publishes it —
      // so the prompt has to come from the session doc, not from the close call site.
      unsubs.push(subscribeSession(eventId, sessionId, (s) => {
        const pp = s?.pendingPublish;
        if (!isChair || !pp?.voteId) return;
        if (!fresh(`pub_${pp.voteId}`, null)) return;
        pushToast({
          ...base, id: `pub_${pp.voteId}`, type: "warning", href: chairLink("voting"),
          message: `Vote closed — publish the result: ${pp.motion}`,
        });
      }));
    }
    return () => unsubs.forEach((u) => u());
  }, [watchCommittees, user, today, isStaffOf]);

  const markRoomNotifsRead = useCallback(() => {
    if (!user || roomNotifications.length === 0) return;
    const newReadIds = new Set(readIds);
    roomNotifications.forEach(n => {
      if (n.id) newReadIds.add(n.id);
    });
    setReadIds(newReadIds);
    try {
      localStorage.setItem(`room_notifs_read_${user.uid}`, JSON.stringify([...newReadIds]));
    } catch (e) {
      console.error("Error setting notifications read state in localStorage:", e);
    }
  }, [user, roomNotifications, readIds]);

  const handleAcceptInvite = useCallback(async (notif: any) => {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      batch.delete(notif.ref);
      const newStaffRef = doc(db, "events", notif.eventId, "staff", user.uid);
      batch.set(newStaffRef, {
        uid: user.uid,
        email: notif.email,
        name: user.displayName || notif.name || "Staff Member",
        role: notif.role,
        committeeId: notif.committeeId || null,
        permissions: notif.permissions || {},
        // The doc is rebuilt from the invite, so every organizer-set flag must be carried over
        // explicitly — a vice-chair's delegate power was silently lost on every (re-)accept.
        ...(notif.delegatePower === true ? { delegatePower: true } : {}),
        inviteStatus: "accepted",
        // The create rule only accepts a self-written doc as a copy of the invite it names.
        sourceId: notif.id,
        addedAt: notif.addedAt || serverTimestamp(),
      });
      await batch.commit();
      void syncMembers(notif.eventId, [user.uid]);
      setNotifications(prev => prev.filter(n => n.id !== notif.id));

      // Notify the organizers (bell + email) that this invite was accepted — best-effort,
      // must never break the acceptance itself.
      try {
        const token = await user.getIdToken();
        await fetch("/api/notify/staff-accepted", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ eventId: notif.eventId }),
        });
      } catch (e) {
        console.error("notify organizer (staff accepted) failed:", e);
      }
    } catch (err) {
      console.error("Error accepting invite:", err);
      throw err;
    }
  }, [user]);

  const handleRejectInvite = useCallback(async (notif: any) => {
    try {
      if (notif.isRoleUpdate && notif.previousRole) {
        // Declining a role change: keep the member at their previous role/access.
        await updateDoc(notif.ref, {
          role: notif.previousRole,
          permissions: notif.previousPermissions || {},
          inviteStatus: "accepted",
          isRoleUpdate: false,
          previousRole: null,
          previousPermissions: null,
        });
      } else {
        await updateDoc(notif.ref, { inviteStatus: "rejected" });
      }
      setNotifications(prev => prev.filter(n => n.id !== notif.id));
    } catch (err) {
      console.error("Error rejecting invite:", err);
      throw err;
    }
  }, []);

  const unreadCount =
    notifications.length +
    roomNotifications.filter(n => n.id && !readIds.has(n.id)).length +
    appNotifications.filter(n => !n.read).length;

  return (
    <NotificationsContext.Provider
      value={{ notifications, roomNotifications, appNotifications, readIds, loading, unreadCount, fetchNotifications, markRoomNotifsRead, markAppNotifRead, markAllAppNotifsRead, handleAcceptInvite, handleRejectInvite }}
    >
      {children}

      {/* Global Toast Stack — rendered once */}
      <div className="fixed bottom-6 right-6 z-50 space-y-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map(toast => {
            const cfg = typeConfig[toast.type as "info" | "warning" | "urgent"] || typeConfig.info;
            const Icon = cfg.icon;
            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                onClick={() => { if (toast.href) router.push(toast.href); }}
                className={`${cfg.toast} text-white rounded-2xl px-4 py-3 shadow-sm max-w-sm flex items-start gap-3 pointer-events-auto border border-white/10 ${toast.href ? "cursor-pointer hover:brightness-110 transition" : ""}`}
              >
                {toast.country
                  ? <CountryFlag code={toast.country} size={18} rounded className="mt-0.5 shrink-0" />
                  : <Icon className="w-4 h-4 mt-0.5 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold uppercase mb-0.5">
                    {cfg.label} — {toast.eventTitle} ({toast.committeeId})
                  </p>
                  <p className="text-sm leading-snug">{toast.message}</p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </NotificationsContext.Provider>
  );
}
