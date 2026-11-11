"use client";

/**
 * Delegate controls for the "motion-first" pipeline.
 *
 * `ProposeMotionForm` renders the two-step flow directly (pick a motion type → fill its params →
 * submit into the session's `motionQueue` via `proposeMotion`). It is reused in two places:
 *   • inside the `ProposeMotionMenu` popover (the right-side "Points & Motions" tool), and
 *   • standalone inside the delegate console's propose-motion modal.
 *
 * The ≥3-pending soft anti-spam guard (via `subscribeMyMotions`) lives in the form.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  proposeMotion, subscribeMyMotions, cancelMotion, motionSummary, MOTION_META,
  DuplicateMotionError,
  type ParticipationIdentity, type MotionType, type MotionParams, type Motion,
  type MotionStatus, type ProxyAttribution, type LiveSession,
} from "@/lib/services/sessionService";
import { motionsInOrder, myLiveMotion, duplicateMotionNote } from "@/lib/services/motionFloor";
import { PROPOSABLE_MOTIONS, motionNeedsTotal, motionNeedsPerSpeaker, motionNeedsTopic } from "@/lib/services/proposableMotions";
import { ConsoleModal } from "./console/shared";
import { adviseMotions, motionBlurb } from "@/lib/services/motionAdvice";
import { getAgenda } from "./flow/flowModel";
import { cn } from "@/lib/utils";
import { AiAssistBar } from "./ai/AiAssist";
import {
  listMyCommitteeDocs, committeeDocTypeLabel, type CommitteeDoc,
} from "@/lib/services/committeeDocService";
import { Megaphone, ChevronLeft, X, PenLine, Lightbulb, CheckCircle2, Lock } from "lucide-react";

// The proposable list and its field predicates live in lib so the mobile app reads the same
// source. See proposableMotions.ts for the double-gate rule.
const PROPOSABLE = PROPOSABLE_MOTIONS;
const needsTotal = motionNeedsTotal;
const needsPerSpeaker = motionNeedsPerSpeaker;
const needsTopic = motionNeedsTopic;

/**
 * Bare two-step propose-motion form — no trigger button, no popover chrome.
 *
 * THIS IS THE MOTION GATE. Every delegate-facing way to propose a motion bottoms out here (the
 * control-bar button and the fallback strip open the modal that renders it; the panel, the
 * projector and the vice-chair proxy render it directly), so the admissibility check lives here
 * ONCE instead of being re-stated at each call site. `session` is REQUIRED for exactly that
 * reason — the compiler then proves no surface can skip the gate.
 */
export function ProposeMotionForm({
  eventId, sessionId, identity, onDone, proxy, session, agenda, committeeAgendas, allowedTypes,
  onWriteNew, inlineConfirm,
}: {
  eventId: string;
  sessionId: string;
  identity: ParticipationIdentity;
  onDone?: () => void;
  /** When set, the motion is proposed ON BEHALF of `identity`'s delegation by this vice-chair. */
  proxy?: ProxyAttribution;
  /**
   * The motion types the chair's floor gate currently admits (`capabilitiesFor().proposableMotionTypes`).
   * Omit on a pre-gate session to keep the full delegate-proposable list.
   *
   * Without this the gate leaks: a chair could open the floor for agenda motions only and the
   * delegate would still be shown all ten types here, which is the exact confusion the gate exists
   * to remove. One admitted type auto-selects, so the delegate lands straight on the form.
   */
  allowedTypes?: MotionType[];
  /** Committee.agendas[] — the fallback when `session.agenda` is absent (pre-agenda sessions). */
  committeeAgendas?: string[];
  /**
   * Live session doc. REQUIRED — this is what makes the motion gate work (and it still feeds the
   * AI assist its floor context). Do not loosen this back to optional: a call site that forgets it
   * is a motion surface with no gate.
   */
  session: LiveSession;
  /** Committee agenda line, if the parent page has it. Sharpens AI suggestions. */
  agenda?: string;
  /** Open the full draft composer (with formatting toolbar) — introduce_document only. */
  onWriteNew?: () => void;
  /**
   * Render the "motion moved" confirmation in place instead of as a dialog. For call sites whose
   * container is transformed (the popover) — see the note where it is read.
   */
  inlineConfirm?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Motion[]>([]);
  /**
   * The motion that just landed. Holds the MOTION, not a boolean: it is what the confirmation
   * reads back, and a delegate who moved a 10-minute caucus needs to see that it was the
   * ten-minute one that reached the chair.
   */
  const [proposed, setProposed] = useState<{ type: MotionType; params: MotionParams } | null>(null);
  /** A rejected submit. Cleared on every new attempt. */
  const [error, setError] = useState<string | null>(null);

  // What the gate admits. Computed before `selected` so a single admitted type can seed it.
  const choices = useMemo(
    () => (allowedTypes ? PROPOSABLE.filter((t) => allowedTypes.includes(t)) : PROPOSABLE),
    [allowedTypes],
  );
  const [selected, setSelected] = useState<MotionType | null>(
    () => (choices.length === 1 ? choices[0] : null),
  );

  /**
   * The committee's own agenda topics — what `set_agenda` moves between.
   *
   * A delegate does not invent an agenda item; they move to take up one the committee already has.
   * `getAgenda` is the ONLY reader of session.agenda and synthesizes from the committee config on
   * sessions that predate it, so this covers both. Empty means the committee configured no topics,
   * and the form falls back to free text rather than offering an empty picker.
   */
  const sessionAgenda = useMemo(
    () => getAgenda(session, committeeAgendas ?? []),
    [session, committeeAgendas],
  );
  const agendaChoices = useMemo(
    () => sessionAgenda.items.filter((i) => i.status !== "done"),
    [sessionAgenda],
  );

  /**
   * WHICH MOTION FITS RIGHT NOW — the delegate half of the flow advice the chair has had all along.
   *
   * Derived, not fetched: `adviseMotions` is pure and reads only the session doc the form already
   * holds, so this costs no listener and no Firestore read (see invariant 3 in `motionAdvice.ts` —
   * the delegate console deliberately does not subscribe to `motionQueue`, which is why `motions`
   * is omitted here).
   *
   * NO TICKER. The one time-sensitive row is the caucus endgame, and every surface that opens a
   * timed window already ticks the console at 1Hz (`useGateClock` / `useMotionFloor`), so the
   * advice refreshes with it. Adding a third interval to sharpen a suggestion is not worth the
   * renders on a 50k-reads/day tier.
   */
  const advice = useMemo(
    () => adviseMotions({ session, agenda: sessionAgenda, allowed: choices }),
    [session, sessionAgenda, choices],
  );
  // form fields
  const [totalMin, setTotalMin] = useState("10");
  const [perSpeakerSec, setPerSpeakerSec] = useState("45");
  const [topic, setTopic] = useState("");
  // introduce_document: link to one of the delegation's committeeDocs (optional — free-text
  // topic stays as the fallback for papers that only exist offline).
  const [docId, setDocId] = useState("");
  const [myDocs, setMyDocs] = useState<CommitteeDoc[]>([]);

  useEffect(
    () => subscribeMyMotions(eventId, sessionId, identity.delegateId, setMine),
    [eventId, sessionId, identity.delegateId]
  );

  // One-shot list, refreshed each time the delegate lands on the introduce step.
  useEffect(() => {
    if (selected !== "introduce_document") return;
    let cancelled = false;
    listMyCommitteeDocs(eventId, identity.delegateId, identity.committeeId).then((docs) => {
      if (!cancelled) setMyDocs(docs.filter((d) => d.status !== "rejected"));
    });
    return () => { cancelled = true; };
  }, [selected, eventId, identity.delegateId, identity.committeeId]);

  const pendingCount = useMemo(
    () => mine.filter((m) => ["pending", "recognized", "voting"].includes(m.status)).length,
    [mine]
  );
  const atLimit = pendingCount >= 3; // soft anti-spam

  /**
   * The delegation's own live motions, by type — the hard duplicate block.
   *
   * `mine` arrives from the same subscription the list below renders, so this is already in memory
   * and updates the instant the motion lands. That is deliberately the FIRST line of defence: the
   * service re-checks (see `DuplicateMotionError`), but a delegate should never get as far as a
   * button that is going to be refused.
   */
  const liveByType = useMemo(() => {
    const out = {} as Partial<Record<MotionType, Motion>>;
    for (const t of PROPOSABLE) {
      const live = myLiveMotion(mine, t);
      if (live) out[t] = live;
    }
    return out;
  }, [mine]);
  const duplicate = selected ? liveByType[selected] ?? null : null;

  // Floor context for the AI assist. Everything here is already in memory — `mine` comes
  // from the subscription above — so this adds no extra Firestore listener. Upgrading
  // `recentTopics` to committee-wide is a one-line swap to `subscribeMotionQueue`.
  const aiContext = useMemo(() => ({
    committee: identity.committeeId,
    country: identity.country,
    phase: session?.phase,
    agenda,
    motionType: selected ? MOTION_META[selected].label : undefined,
    caucusTopic: session?.caucus?.topic || undefined,
    recentTopics: mine.map((m) => m.params?.topic).filter((t): t is string => !!t).slice(0, 8),
  }), [identity.committeeId, identity.country, session?.phase, session?.caucus?.topic, agenda, selected, mine]);

  const reset = () => { setSelected(null); setTopic(""); setTotalMin("10"); setPerSpeakerSec("45"); setDocId(""); };

  // Is a motion admissible right now? Re-derives on every session snapshot. No ticker here — the
  // only clock-driven transition (an invite window lapsing) can never CLOSE the floor, it only
  // downgrades "invited" to "open", and both are in order.
  const floor = motionsInOrder(session);

  const submit = async () => {
    // `!floor.inOrder` and `duplicate` are belt-and-braces: the branches below mean the button
    // cannot render in either case, but a click already queued in the frame the floor closes — or
    // the frame the delegate's own motion lands — would still fire.
    if (busy || atLimit || !selected || !floor.inOrder || duplicate) return;
    const params: MotionParams = {};
    if (needsTotal(selected)) params.totalDurationSecs = Math.max(1, Math.round((parseFloat(totalMin) || 0) * 60));
    if (needsPerSpeaker(selected)) params.perSpeakerSecs = Math.max(1, parseInt(perSpeakerSec, 10) || 0);
    if (needsTopic(selected) && topic.trim()) params.topic = topic.trim();
    if (selected === "introduce_document" && docId) params.documentId = docId;
    setBusy(true);
    setError(null);
    try {
      await proposeMotion(eventId, sessionId, identity, selected, params, "", proxy);
      // NOT `onDone()` any more. Closing the surface on success is what left the delegate with no
      // evidence their motion had gone anywhere — and a delegate with no evidence taps again, which
      // is exactly how three identical motions reached one chair's queue. The confirmation owns the
      // dismissal now; `onDone` fires when the delegate closes IT.
      setProposed({ type: selected, params });
    } catch (e) {
      // The service's own sentence when it is a duplicate — it names the motion and where it got
      // to. Anything else is a network/permission failure, which needs the retry copy instead.
      setError(e instanceof DuplicateMotionError
        ? e.message
        : "That didn't go through. Try again, or ask the chair.");
      console.error("proposeMotion", e);
    } finally {
      setBusy(false);
    }
  };

  if (proposed) {
    const done = () => { setProposed(null); reset(); onDone?.(); };
    const body = (
      <MotionProposedBody
        eventId={eventId} sessionId={sessionId} delegateId={identity.delegateId}
        type={proposed.type} params={proposed.params} onClose={done}
      />
    );
    // INLINE INSIDE THE POPOVER, on purpose. `ConsoleModal` is `position: fixed`, and the
    // "Points & Motions" popover is an `animate-in` box — a transformed ancestor becomes the
    // containing block for a fixed descendant, so the dialog would centre itself on a 260px
    // popover instead of the screen. Same trap `FloorCard` documents for its drag wrapper.
    if (inlineConfirm) {
      return (
        <div className="rounded-xl border border-primary/25 bg-primary/[0.06] p-2.5">{body}</div>
      );
    }
    return (
      <ConsoleModal
        icon={CheckCircle2}
        title="Motion moved"
        subtitle={proxy ? "Logged on the delegation's behalf." : "The chair has it."}
        onClose={done}
      >
        {body}
      </ConsoleModal>
    );
  }

  // Out of order outranks the soft anti-spam limit — it's a harder fact, and stacking both
  // messages just muddles it. MyMotionsList stays in BOTH branches so the delegate never loses
  // sight of what the chair did with their earlier motions.
  if (!floor.inOrder) {
    return (
      <div className="space-y-2">
        <p className={cn(
          "px-2 py-3 text-[11px] text-center leading-relaxed",
          floor.code === "session_closed" ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400",
        )}>
          {floor.detail}
          {proxy && floor.code !== "session_closed" && (
            <> Log it from the Motions tool if the chair rules otherwise.</>
          )}
        </p>
        <MyMotionsList eventId={eventId} sessionId={sessionId} delegateId={identity.delegateId} />
      </div>
    );
  }

  if (atLimit) {
    return (
      <div className="space-y-2">
        <p className="px-2 py-3 text-[11px] text-amber-600 dark:text-amber-400 text-center">
          Several motions pending — wait for the chair before proposing more.
        </p>
        <MyMotionsList eventId={eventId} sessionId={sessionId} delegateId={identity.delegateId} />
      </div>
    );
  }

  if (!selected) {
    if (choices.length === 0) {
      return (
        <div className="space-y-2">
          <p className="px-2 py-3 text-[11px] text-amber-600 dark:text-amber-400 text-center leading-relaxed">
            The chair has not opened the floor for any motion right now.
          </p>
          <MyMotionsList eventId={eventId} sessionId={sessionId} delegateId={identity.delegateId} />
        </div>
      );
    }
    // The advised motions lead, the rest keep their order below. `advice.types` is already a subset
    // of `choices` (motionAdvice invariant 2), so this partition can never lose or duplicate a type.
    const lead = advice.types;
    const rest = choices.filter((t) => !lead.includes(t));
    return (
      <div className="space-y-1">
        {lead.length > 0 && (
          <>
            {/* A LIGHTBULB, NOT SPARKLES. Sparkles is this app's AI mark (see AiAssistBar, three
                lines down in this same form) and this is a pure derivation from the session doc —
                borrowing the AI icon would tell the delegate a model guessed for them when nothing
                did, and would make the real AI affordance below mean less. */}
            <p className="flex items-start gap-1.5 px-1.5 pt-0.5 pb-1 text-[11px] leading-snug text-muted-foreground">
              <Lightbulb className="w-3.5 h-3.5 mt-px shrink-0 text-amber-500" />
              <span className="min-w-0">{advice.because}</span>
            </p>
            {lead.map((t) => (
              <MotionChoice key={t} type={t} hint={advice.hint[t]} suggested
                live={liveByType[t]} onPick={setSelected} />
            ))}
            {rest.length > 0 && (
              <p className="pt-2.5 pb-0.5 px-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Other motions
              </p>
            )}
          </>
        )}
        {rest.map((t) => (
          <MotionChoice key={t} type={t} live={liveByType[t]} onPick={setSelected} />
        ))}
        <MyMotionsList eventId={eventId} sessionId={sessionId} delegateId={identity.delegateId} className="mt-1" />
      </div>
    );
  }

  // A picked agenda topic IS the motion for set_agenda — proposing without one is meaningless.
  const needsAgendaPick =
    selected === "set_agenda" && agendaChoices.length > 0 && !topic.trim();

  return (
    <div className="space-y-2.5">
      {/* No way back when the gate admits exactly one motion — "back" would only show a list of one. */}
      {choices.length > 1 ? (
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> {MOTION_META[selected].label}
        </button>
      ) : (
        <p className="text-[11px] font-semibold text-muted-foreground">{MOTION_META[selected].label}</p>
      )}
      {/* THE ONE PLACE THE PICKER CANNOT REACH. A gate admitting exactly one motion auto-selects it,
          so the delegate lands here having never seen the advice list — and that is precisely the
          case where the chair narrowed the floor to one motion for a reason worth reading. */}
      {advice.types.includes(selected) && (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
          <Lightbulb className="w-3.5 h-3.5 mt-px shrink-0 text-amber-500" />
          <span className="min-w-0">{advice.hint[selected] ?? advice.because}</span>
        </p>
      )}
      {needsTotal(selected) && (
        <label className="block">
          <span className="text-[11px] text-muted-foreground">
            {selected === "extend_caucus" ? "Extend by (minutes)" : "Total duration (minutes)"}
          </span>
          <input
            type="number" min={1} value={totalMin} onChange={(e) => setTotalMin(e.target.value)}
            className="mt-1 w-full h-9 px-2.5 rounded-lg border border-border/60 bg-background text-sm"
          />
        </label>
      )}
      {needsPerSpeaker(selected) && (
        <label className="block">
          <span className="text-[11px] text-muted-foreground">Speaking time (seconds/speaker)</span>
          <input
            type="number" min={1} value={perSpeakerSec} onChange={(e) => setPerSpeakerSec(e.target.value)}
            className="mt-1 w-full h-9 px-2.5 rounded-lg border border-border/60 bg-background text-sm"
          />
        </label>
      )}
      {selected === "introduce_document" && myDocs.length > 0 && (
        <label className="block">
          <span className="text-[11px] text-muted-foreground">Your document</span>
          <select
            value={docId}
            onChange={(e) => {
              const id = e.target.value;
              setDocId(id);
              // Auto-fill the topic with the title so queue labels / logs read the paper's name.
              const d = myDocs.find((x) => x.id === id);
              if (d) setTopic(d.title);
            }}
            className="mt-1 w-full h-9 px-2.5 rounded-lg border border-border/60 bg-background text-sm"
          >
            <option value="">— No linked document —</option>
            {myDocs.map((d) => (
              <option key={d.id} value={d.id}>
                {committeeDocTypeLabel(d.type)} — {d.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected === "introduce_document" && (
        onWriteNew ? (
          <button
            type="button"
            onClick={onWriteNew}
            className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border border-dashed border-primary/40 text-primary text-[12px] font-semibold hover:bg-primary/10 transition-colors"
          >
            <PenLine className="w-3.5 h-3.5" />
            {myDocs.length === 0 ? "Write a new draft — full editor" : "Or write a new draft — full editor"}
          </button>
        ) : myDocs.length === 0 ? (
          <p className="text-[11px] text-muted-foreground px-0.5">
            No document yet? Write one in the <b>Documents</b> tool, then introduce it from there.
          </p>
        ) : null
      )}
      {/* SET THE AGENDA IS A CHOICE, NOT AN ESSAY. The committee's topics are already configured;
          a delegate moves to take one up, they do not invent one. Free text here produced motions
          naming topics the committee did not have. Falls back to the textarea below only when the
          committee configured no topics at all. */}
      {selected === "set_agenda" && agendaChoices.length > 0 && (
        <div className="block">
          <span className="text-[11px] text-muted-foreground">Which topic do you move to take up?</span>
          <div className="mt-1.5 space-y-1">
            {agendaChoices.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTopic(item.title)}
                aria-pressed={topic === item.title}
                className={cn(
                  "w-full flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-colors",
                  topic === item.title
                    ? "border-primary bg-primary/10"
                    : "border-border/60 hover:border-primary/40 hover:bg-primary/5",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 w-3.5 h-3.5 rounded-full border-2 shrink-0",
                    topic === item.title
                      ? "border-primary bg-primary ring-2 ring-inset ring-background"
                      : "border-muted-foreground/50",
                  )}
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold leading-tight">{item.title}</span>
                  {item.status === "active" && (
                    <span className="block text-[11px] text-muted-foreground">Currently on the floor</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {needsTopic(selected) && !(selected === "set_agenda" && agendaChoices.length > 0) && (
        <div className="block">
          <span className="text-[11px] text-muted-foreground">
            {selected === "move_to_voting" || selected === "introduce_document" ? "Document / topic" : "Topic"}
            {selected === "custom" ? " (what are you moving?)" : ""}
          </span>
          <textarea
            value={topic} onChange={(e) => setTopic(e.target.value)} rows={2} maxLength={200}
            placeholder="e.g. Refugee resettlement funding"
            className="mt-1 w-full min-h-[60px] px-2.5 py-2 rounded-lg border border-border/60 bg-background text-sm resize-y"
          />
          <AiAssistBar
            className="mt-1.5"
            value={topic}
            onPick={setTopic}
            field="motion_topic"
            context={aiContext}
            suggestLabel="Motion ideas"
          />
        </div>
      )}
      {/* THE HARD BLOCK, at the moment it matters. A gate admitting exactly one motion auto-selects
          it, so this is the screen a delegate lands on when they tap "Move to …" a second time —
          and it has to answer them, not just refuse. */}
      {duplicate ? (
        <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5">
          <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-muted-foreground">
            <Lock className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden />
            <span>{duplicateMotionNote(duplicate)}</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Withdraw it below if you want to move something else.
          </p>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy || needsAgendaPick}
          onClick={submit}
          className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
        >
          <Megaphone className="w-4 h-4" /> {needsAgendaPick ? "Pick a topic first" : "Propose"}
        </button>
      )}
      {error && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-snug">{error}</p>
      )}
      {/* Reachable from the params step too — a blocked motion is withdrawn from here. */}
      <MyMotionsList eventId={eventId} sessionId={sessionId} delegateId={identity.delegateId} />
    </div>
  );
}

/**
 * "Your motion is with the chair" — the landing the propose flow never had.
 *
 * WHY THE FLOW NOW ENDS IN A CONFIRMATION. A motion is the delegate's one formal act in a sitting,
 * and before this the flow simply closed on success: the surface vanished, nothing named what had
 * been moved, and the queue it landed in is the CHAIR's screen, not theirs. A delegate with no
 * evidence taps again — which is how three identical motions reached one chair's queue. So the
 * confirmation is what dismisses the flow, and it carries the two facts that answer "did that
 * work": what was moved, and what happens to it next.
 *
 * It performs NO write. The write is what raised it.
 */
function MotionProposedBody({
  eventId, sessionId, delegateId, type, params, onClose,
}: {
  eventId: string;
  sessionId: string;
  delegateId: string;
  type: MotionType;
  params: MotionParams;
  onClose: () => void;
}) {
  const meta = MOTION_META[type];
  const summary = motionSummary({ params });
  return (
    <>
      <div className="flex items-start gap-2">
        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <span className="min-w-0">
          <span className="block text-[14px] font-bold leading-tight">{meta.label}</span>
          {summary && <span className="block text-[12px] text-muted-foreground mt-0.5">{summary}</span>}
        </span>
      </div>

      <p className="text-[12px] text-muted-foreground leading-snug mt-3">
        <span className="font-semibold text-foreground/80">Next: </span>
        {meta.needsVote
          ? "The chair recognizes it and puts it to the committee. You will see the vote open on this screen."
          : "The chair can act on it directly — watch the floor for their ruling."}
      </p>

      {/* One live motion of a type per delegation, said BEFORE they go looking for the button. */}
      <p className="text-[11.5px] text-muted-foreground leading-snug mt-2">
        You cannot move this again while it is on the floor. Withdraw it below if you change your mind.
      </p>

      <MyMotionsList eventId={eventId} sessionId={sessionId} delegateId={delegateId} className="mt-3" />

      <div className="flex justify-end mt-4">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[12.5px] font-bold
                     hover:bg-primary/90 transition-colors"
        >
          Done
        </button>
      </div>
    </>
  );
}

/**
 * One row of the motion picker.
 *
 * Extracted because the list is now two lists — advised and everything else — rendered from the
 * same markup with one flag between them. Inlining it twice is how the two drift.
 *
 * `suggested` uses AMBER on purpose: it is already this console's colour for "the chair has opened
 * the floor and you may move" (the trigger button below, `MotionFloorBar`, the control-bar
 * Megaphone), so the highlight reads as the same signal continued rather than a fourth vocabulary.
 */
function MotionChoice({
  type, hint, suggested, live, onPick,
}: {
  type: MotionType;
  /** From `advice.hint` — why THIS motion fits now. Falls back to the generic blurb. */
  hint?: string;
  suggested?: boolean;
  /**
   * The delegation's own live motion of this type. Present ⇒ the row is DEAD: the question is
   * already before the committee, and moving it again is out of order. Shown rather than hidden,
   * because "where did my motion go" is the question the delegate actually has — the row answers
   * it in place, and hiding it would read as the chair having closed the floor.
   */
  live?: Motion;
  onPick: (t: MotionType) => void;
}) {
  const meta = MOTION_META[type];
  // Kept, and kept SECOND: "goes to a vote" is the only thing on this row a delegate can act on
  // procedurally, but it is identical across seven of the ten types, so it cannot lead.
  const procedure = meta.needsVote ? "Goes to a procedural vote" : "Chair acts directly";
  const blurb = hint ?? motionBlurb(type);
  return (
    <button
      type="button"
      disabled={!!live}
      title={live ? duplicateMotionNote(live) : undefined}
      onClick={() => onPick(type)}
      className={cn(
        "flex items-start gap-2 w-full p-2.5 rounded-lg border text-left transition-colors",
        live
          ? "border-border/50 bg-muted/40 cursor-not-allowed"
          : suggested
            ? "border-amber-500/45 bg-amber-500/10 hover:bg-amber-500/20"
            : "border-transparent hover:border-primary/40 hover:bg-primary/5",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className={cn("text-[13px] font-semibold leading-tight", live && "text-muted-foreground")}>
            {meta.label}
          </span>
          {live ? (
            <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-px rounded-full bg-muted text-muted-foreground text-[9px] font-bold uppercase tracking-wide">
              <Lock className="w-2.5 h-2.5" /> Already moved
            </span>
          ) : suggested && (
            <span className="shrink-0 px-1.5 py-px rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[9px] font-bold uppercase tracking-wide">
              Suggested
            </span>
          )}
        </span>
        <span className="block text-[11px] text-muted-foreground">
          {live ? duplicateMotionNote(live) : blurb === procedure ? blurb : `${blurb} · ${procedure}`}
        </span>
      </span>
    </button>
  );
}

const MOTION_STATUS_CHIP: Record<MotionStatus, { label: string; cls: string }> = {
  pending:    { label: "Pending",    cls: "text-amber-600 dark:text-amber-400" },
  recognized: { label: "Recognized", cls: "text-primary" },
  voting:     { label: "In vote",    cls: "text-amber-600 dark:text-amber-400" },
  passed:     { label: "Passed",     cls: "text-emerald-600 dark:text-emerald-400" },
  executed:   { label: "Executed",   cls: "text-emerald-600 dark:text-emerald-400" },
  failed:     { label: "Failed",     cls: "text-muted-foreground" },
  // Stored as "dropped"; the chair's UI calls it Dismiss, so the delegate must read the same word.
  // An AUTO-FALLEN motion is also stored "dropped" but is not a dismissal — see chipFor below.
  dropped:    { label: "Dismissed",  cls: "text-muted-foreground" },
};

/**
 * "Dismissed" or "Out of order" — and it matters which.
 *
 * A dismissal is a chair's judgement of the motion. An auto-fall is the floor having already
 * answered the question: the agenda was set, a caucus replaced the one this would have extended.
 * Printing "Dismissed" for the second one credits a ruling no chair issued, which is precisely how
 * a delegate ends up arguing with their chair about a decision the chair never made.
 */
const chipFor = (m: Motion): { label: string; cls: string } =>
  m.status === "dropped" && m.autoResolved
    ? { label: "Out of order", cls: "text-muted-foreground" }
    : MOTION_STATUS_CHIP[m.status];

/**
 * The delegate's own motions and what the chair did with each — including the reason on a
 * dismissal. Before this, a proposed motion had NO delegate-facing status surface at all: it
 * simply disappeared from their view when resolved, with no way to learn why.
 *
 * Owns its own `subscribeMyMotions`; the SDK multiplexes the identical query the form already
 * runs onto a single stream, so mounting both costs nothing extra.
 */
export function MyMotionsList({
  eventId, sessionId, delegateId, className,
}: { eventId: string; sessionId: string; delegateId: string; className?: string }) {
  const [mine, setMine] = useState<Motion[]>([]);
  useEffect(
    () => subscribeMyMotions(eventId, sessionId, delegateId, setMine),
    [eventId, sessionId, delegateId]
  );
  if (mine.length === 0) return null;
  return (
    <div className={cn("pt-2 border-t border-border/40 space-y-1.5", className)}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Your motions</p>
      {mine.slice(0, 6).map((m) => {
        const chip = chipFor(m);
        return (
          <div key={m.id}>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium truncate">{MOTION_META[m.type].short}</span>
              <span className={cn("ml-auto font-semibold shrink-0", chip.cls)}>{chip.label}</span>
              {m.status === "pending" && (
                <button onClick={() => m.id && cancelMotion(eventId, sessionId, m.id)}
                  className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400 shrink-0" title="Withdraw">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {/* No "Chair:" on an auto-fall — nobody said it. The sentence states the fact that
                overtook the motion, so it stands on its own. */}
            {m.chairNote && (
              <p className="text-[11px] text-muted-foreground italic mt-0.5">
                {m.autoResolved ? m.chairNote : `Chair: “${m.chairNote}”`}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Popover trigger wrapping `ProposeMotionForm` — the right-panel "Points & Motions" surface. */
export function ProposeMotionMenu({
  eventId, sessionId, identity, className, session, agenda, committeeAgendas, allowedTypes,
  onWriteNew,
}: {
  eventId: string;
  sessionId: string;
  identity: ParticipationIdentity;
  className?: string;
  /** Forwarded to the form, where it drives the motion gate (and the AI assist). REQUIRED. */
  session: LiveSession;
  agenda?: string;
  /** Forwarded to the form — see its prop docs. */
  committeeAgendas?: string[];
  allowedTypes?: MotionType[];
  /** Open the full draft composer (introduce_document → "Write a new draft"). */
  onWriteNew?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<Motion[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(
    () => subscribeMyMotions(eventId, sessionId, identity.delegateId, setMine),
    [eventId, sessionId, identity.delegateId]
  );

  const pendingCount = useMemo(
    () => mine.filter((m) => ["pending", "recognized", "voting"].includes(m.status)).length,
    [mine]
  );

  // The trigger's own read of admissibility. It does NOT gate — the form below does, and the
  // trigger stays clickable on purpose so a delegate can still read the reason and their own motion
  // history when motions are out of order. This is purely the signal:
  //   invited      → amber, matching the control-bar Megaphone and MotionFloorBar
  //   out of order → muted, with the reason in the tooltip
  //
  // TWO WAYS TO BE INVITED, because there are two mechanisms. `motionsInOrder` sees only the legacy
  // `motionInvite`; on a gated session the chair's ask is a `floorGate` of kind "motions", which
  // reaches us as a non-empty `allowedTypes` (the console derives it from `capabilitiesFor`). Before
  // this the amber "Floor open" state could never fire on a gated session — the one kind of session
  // where the chair's invitation is binding.
  const floor = motionsInOrder(session);
  const gateAdmits = !!allowedTypes?.length;
  const invited = gateAdmits || (floor.inOrder && floor.code === "invited");

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        // `invited` first, so the tooltip can never contradict the amber fill: on a gated session
        // the gate is the authority, and `floor.title` describes a rule it has already answered.
        title={invited
          ? "The chair has opened the floor to motions"
          : floor.inOrder ? "Propose a motion" : floor.title}
        // NO `animate-flow-advice-glow` here, unlike the control-bar Megaphone. That button is
        // icon-only and floats over video, so movement is the only way it can be noticed; this one
        // says "Floor open — propose a motion" in words, and animating a labelled full-width button
        // in an open panel is the second pulse the attention ladder exists to prevent.
        className={cn(
          "w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition-colors",
          open ? "border-primary/40 bg-primary/10 text-primary"
            : invited ? "border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25"
            : !floor.inOrder ? "border-border/60 text-muted-foreground hover:bg-secondary/50"
            : "border-border/60 hover:bg-secondary/50",
        )}
      >
        <Megaphone className="w-4 h-4" />
        {invited ? "Floor open — propose a motion" : "Propose a motion"}
        {pendingCount > 0 && (
          <span className="ml-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-black text-[10px] font-bold inline-flex items-center justify-center">
            {pendingCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 right-0 bottom-[calc(100%+6px)] z-20 rounded-xl bg-card text-foreground border border-border/70 shadow-lg shadow-primary/10 dark:shadow-xl p-1.5 animate-in fade-in slide-in-from-bottom-1 duration-150 max-h-[60vh] overflow-y-auto">
          <ProposeMotionForm
            eventId={eventId} sessionId={sessionId} identity={identity}
            session={session} agenda={agenda}
            committeeAgendas={committeeAgendas} allowedTypes={allowedTypes}
            onDone={() => setOpen(false)}
            inlineConfirm
            onWriteNew={onWriteNew ? () => { setOpen(false); onWriteNew(); } : undefined}
          />
        </div>
      )}
    </div>
  );
}
