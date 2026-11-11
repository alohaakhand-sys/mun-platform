"use client";

/**
 * The organizer's floor panel for a ceremony — who is on the microphone, and who to hand it to.
 *
 * TWO SOURCES, DELIBERATELY UNEQUAL.
 *
 * "In the room" is RTDB presence, and it is the primary list because a ceremony floor is handed
 * out live: the organizer looks for the guest speaker who has just joined, not for a name in a
 * roster. But only people who COULD be given the floor publish presence in a ceremony — the
 * Spark plan caps Realtime Database at 100 simultaneous connections and a ceremony holds the
 * whole conference, so an audience of 200 delegates joins silently ([[spark-plan-read-budget]]).
 *
 * "Everyone" is therefore the fallback, loaded ON DEMAND (one applications query, never on
 * mount) so a delegate can still be called up. Putting a uid on `live.stage` is what grants the
 * floor — presence has nothing to do with it — so an invisible delegate is promoted the same way
 * a visible chair is: their client sees the stage change and turns their camera on.
 */
import { useEffect, useMemo, useState } from "react";
import { Search, Mic, MicOff, Users, Loader2, X } from "lucide-react";
import { getApplicationsByEvent, type ApplicationData } from "@/lib/services/applicationService";
import { getEventStaff, roleLabel } from "@/lib/services/staffService";
import { CEREMONY_STAGE_MAX } from "@/lib/services/liveControlService";
import type { PresenceMember } from "@/components/session/useSessionPresence";
import { getCountryName } from "@/lib/data/countries";
import { getInitials, avatarGradient } from "@/lib/avatarColor";
import { CloseBtn } from "@/components/session/console/shared";
import { cn } from "@/lib/utils";

interface Candidate {
  uid: string;
  name: string;
  /** "Chair · Security Council", "Delegate of France" — one line under the name. */
  detail?: string;
  inRoom: boolean;
}

export function CeremonyFloorPanel({
  eventId, roster, stage, hostUid, onSetStage, onClose,
}: {
  eventId: string;
  /** Presence roster of the ceremony room. */
  roster: PresenceMember[];
  /** Current `live.stage` uids. */
  stage: string[];
  /** The organizer's own uid — they broadcast by role and are never listed here. */
  hostUid: string;
  /**
   * `labels` carries the display name of everyone being put on the floor. It is written onto the
   * ceremony doc with the stage array because this is the only moment the name is known — the
   * audience publishes no presence node to look it up from later.
   */
  onSetStage: (uids: string[], labels: Record<string, { name: string; role?: string }>) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [all, setAll] = useState<Candidate[] | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);

  const inRoom: Candidate[] = useMemo(
    () => roster
      .filter((m) => m.uid !== hostUid)
      .map((m) => ({
        uid: m.uid,
        name: m.name,
        detail: m.country
          ? `Delegate of ${getCountryName(m.country) || m.country}`
          : (m.role || undefined),
        inRoom: true,
      })),
    [roster, hostUid],
  );

  // One query, only if the organizer actually opens the full list.
  useEffect(() => {
    if (!showAll || all || loadingAll) return;
    setLoadingAll(true);
    (async () => {
      try {
        const [apps, staff] = await Promise.all([
          getApplicationsByEvent(eventId),
          getEventStaff(eventId),
        ]);
        const rows: Candidate[] = [];
        const seen = new Set<string>();
        for (const s of staff) {
          if (!s.uid || s.inviteStatus !== "accepted" || seen.has(s.uid)) continue;
          seen.add(s.uid);
          rows.push({
            uid: s.uid,
            name: s.name || s.email || "Staff",
            detail: [roleLabel(s.role), s.committeeId].filter(Boolean).join(" · "),
            inRoom: false,
          });
        }
        for (const a of apps as ApplicationData[]) {
          const uid = a.userId;
          if (!uid || a.status !== "approved" || seen.has(uid)) continue;
          seen.add(uid);
          const country = a.assignedCountry || a.choices?.primary?.country || "";
          rows.push({
            uid,
            name: a.applicantName || a.applicantEmail || "Delegate",
            detail: [
              country ? `Delegate of ${getCountryName(country) || country}` : a.role,
              a.assignedCommittee || a.choices?.primary?.committee,
            ].filter(Boolean).join(" · "),
            inRoom: false,
          });
        }
        rows.sort((a, b) => a.name.localeCompare(b.name));
        setAll(rows);
      } catch (e) {
        console.error("[ceremony] load candidates", e);
        setAll([]);
      } finally {
        setLoadingAll(false);
      }
    })();
  }, [showAll, all, loadingAll, eventId]);

  const source = showAll && all ? mergeRooms(all, inRoom) : inRoom;
  const needle = q.trim().toLowerCase();
  const list = needle
    ? source.filter((c) =>
        c.name.toLowerCase().includes(needle) || (c.detail || "").toLowerCase().includes(needle))
    : source;

  const full = stage.length >= CEREMONY_STAGE_MAX;
  const toggle = (uid: string) => {
    const next = stage.includes(uid)
      ? stage.filter((u) => u !== uid)
      : (full ? stage : [...stage, uid]);
    if (next === stage) return;
    // Label everyone on the resulting stage, not only the one just tapped — a name written on an
    // earlier grant is already on the doc, and re-sending it costs nothing.
    const known = new Map(source.map((c) => [c.uid, c]));
    const labels: Record<string, { name: string; role?: string }> = {};
    for (const u of next) {
      const c = known.get(u);
      if (c) labels[u] = { name: c.name, role: c.detail };
    }
    onSetStage(next, labels);
  };

  return (
    <aside className="w-full lg:w-[340px] shrink-0 flex flex-col border-l border-border/60 bg-background min-h-0">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/60">
        <span className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <Mic className="w-[18px] h-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold leading-tight">The floor</p>
          <p className="text-[11.5px] text-muted-foreground leading-tight">
            {stage.length} of {CEREMONY_STAGE_MAX} on the microphone
          </p>
        </div>
        <div className="flex-1" />
        <CloseBtn onClick={onClose} />
      </div>

      <div className="p-3 border-b border-border/60 space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={showAll ? "Search everyone…" : "Search the room…"}
            className="w-full h-9 pl-9 pr-8 rounded-lg bg-secondary/50 border border-border/60 text-sm outline-none focus:border-primary/50"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1.5"
        >
          {loadingAll && <Loader2 className="w-3 h-3 animate-spin" />}
          {showAll ? "Show only who's in the room" : "Search everyone in the conference"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {list.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-12">
            <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
            {showAll ? "Nobody matches that." : "Nobody else is in the room yet."}
          </div>
        ) : list.map((c) => {
          const on = stage.includes(c.uid);
          return (
            <div key={c.uid}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-2.5 py-2 border transition-colors",
                on ? "border-primary/40 bg-primary/10" : "border-transparent hover:bg-secondary/50",
              )}>
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                style={{ backgroundImage: avatarGradient(c.uid) }}
              >
                {getInitials(c.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{c.name}</p>
                {c.detail && <p className="text-[11.5px] text-muted-foreground truncate">{c.detail}</p>}
              </div>
              {c.inRoom && !on && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="In the room" />
              )}
              <button
                type="button"
                onClick={() => toggle(c.uid)}
                disabled={!on && full}
                title={on ? "Take the floor back" : full ? "The floor is full" : "Give the floor"}
                className={cn(
                  "h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors",
                  on
                    ? "bg-red-500/15 text-red-600 hover:bg-red-500/25"
                    : "bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed",
                )}
              >
                {on ? <><MicOff className="w-3.5 h-3.5" /> Take back</> : <><Mic className="w-3.5 h-3.5" /> Give</>}
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

/** Full list wins on identity, presence wins on "is in the room" + the live display name. */
function mergeRooms(all: Candidate[], inRoom: Candidate[]): Candidate[] {
  const present = new Map(inRoom.map((c) => [c.uid, c]));
  const merged = all.map((c) => (present.has(c.uid) ? { ...c, inRoom: true } : c));
  // Anyone in the room but not in the roster (an organizer's second account, a guest added as
  // staff after the query ran) must not silently vanish from the list.
  for (const c of inRoom) if (!merged.some((m) => m.uid === c.uid)) merged.push(c);
  return merged.sort((a, b) => Number(b.inRoom) - Number(a.inRoom) || a.name.localeCompare(b.name));
}
