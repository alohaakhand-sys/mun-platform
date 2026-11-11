"use client";

/**
 * A reorderable speaking order — drag, chevrons, remove — with no opinion about where it is stored.
 *
 * CONTROLLED ON PURPOSE. The caucus panel's copy edits `caucus.queue` live (every drag is a write);
 * the seat dialog edits a LOCAL draft the chair commits in one go. Same list, same gestures, two
 * different owners — so the component owns neither and takes `{value, onChange}`. Before this was
 * extracted there was exactly one implementation wired straight to `setCaucusQueue`, and the dialog
 * would have needed a second copy that drifts.
 *
 * Drag handle is the grip only, so the row's own buttons stay clickable; the chevrons remain as the
 * touch and keyboard fallback. Same `@hello-pangea/dnd` shape as the organizer partners page.
 */
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { QueueRow, SubCard, ProxyChip } from "./console/shared";
import type { SpeakerSlot } from "@/lib/services/sessionService";
import { ChevronUp, ChevronDown, X, Mic, GripVertical } from "lucide-react";

export function SpeakerOrderList({
  value, onChange, canControl, slots = 0, emptyLabel, droppableId = "speaker-order",
}: {
  value: SpeakerSlot[];
  /** Called with the WHOLE new order — reorder and remove alike. */
  onChange: (next: SpeakerSlot[]) => void;
  canControl: boolean;
  /** How many speeches there is time for; rows past it are flagged "over". 0 = don't flag. */
  slots?: number;
  emptyLabel?: string;
  /** Unique per mounted instance — two Droppables sharing an id break the drag context. */
  droppableId?: string;
}) {
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const q = [...value];
    [q[i], q[j]] = [q[j], q[i]];
    onChange(q);
  };
  const removeAt = (i: number) => onChange(value.filter((_, x) => x !== i));
  const onDragEnd = (result: DropResult) => {
    if (!canControl || !result.destination) return;
    const from = result.source.index, to = result.destination.index;
    if (from === to) return;
    const q = [...value];
    const [moved] = q.splice(from, 1);
    q.splice(to, 0, moved);
    onChange(q);
  };

  if (value.length === 0) {
    return (
      <SubCard className="px-3.5 py-5 text-center">
        <p className="text-[12.5px] text-muted-foreground">
          {emptyLabel || "No one queued yet."}
        </p>
      </SubCard>
    );
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId={droppableId}>
        {(dropProvided) => (
          <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="space-y-1.5">
            {value.map((s, i) => (
              <Draggable key={s.delegateId} draggableId={s.delegateId} index={i}
                isDragDisabled={!canControl}>
                {(dragProvided, snapshot) => (
                  // The library insists every Draggable applies its dragHandleProps somewhere; when
                  // the grip isn't rendered (read-only viewer) they land here, inert behind
                  // isDragDisabled.
                  <div ref={dragProvided.innerRef} {...dragProvided.draggableProps}
                    {...(!canControl ? dragProvided.dragHandleProps : {})}
                    className={snapshot.isDragging ? "opacity-90" : undefined}>
                    <QueueRow
                      tone={i === 0 ? "primary" : "muted"}
                      icon={i === 0 ? Mic : undefined}
                      flag={
                        <span className="flex items-center gap-1.5">
                          {canControl && (
                            <span {...dragProvided.dragHandleProps} title="Drag to reorder"
                              className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-foreground transition-colors -ml-1">
                              <GripVertical className="w-4 h-4" />
                            </span>
                          )}
                          {s.country ? <CountryFlag code={s.country} size={20} /> : null}
                        </span>
                      }
                      title={
                        <span className="flex items-center gap-1.5">
                          <span className="tabular-nums text-muted-foreground/70 font-mono text-xs">{i + 1}.</span>
                          {getCountryName(s.country) || s.country || "Delegate"}
                          {s.proxyBy && <ProxyChip name={s.proxyByName} />}
                        </span>
                      }
                      statusChip={i >= slots && slots > 0
                        ? <span className="text-[9px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">over</span>
                        : undefined}
                      actions={canControl ? (
                        <div className="flex items-center gap-0.5">
                          <IconBtn label="Move up" onClick={() => move(i, -1)} disabled={i === 0}><ChevronUp className="w-4 h-4" /></IconBtn>
                          <IconBtn label="Move down" onClick={() => move(i, 1)} disabled={i === value.length - 1}><ChevronDown className="w-4 h-4" /></IconBtn>
                          <IconBtn label="Remove" onClick={() => removeAt(i)}><X className="w-4 h-4" /></IconBtn>
                        </div>
                      ) : undefined}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {dropProvided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}

/** Square icon button — matches the polished GSL queue controls in ConsoleSpeakersPanel. */
export function IconBtn({ label, onClick, disabled, children }: {
  label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled}
      className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
    >
      {children}
    </button>
  );
}
