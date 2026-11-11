"use client";

import * as React from "react";
import { Popover } from "@base-ui/react/popover";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getMonth,
  getYear,
  isSameDay,
  isSameMonth,
  isToday,
  parse,
  setMonth,
  setYear,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  Calendar as CalendarIcon,
  Clock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const popupClass =
  "z-[60] rounded-2xl border border-border/60 bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/5 p-3 origin-(--transform-origin) data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 duration-100";

const fieldClass =
  "group w-full text-left rounded-xl border bg-secondary/10 px-3 py-2 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:border-primary/60 data-[popup-open]:border-primary/60";

/* ------------------------------- Date field ------------------------------ */

interface DateFieldProps {
  /** Optional. When set, renders a stacked field with a small inline label.
   *  When omitted, renders a compact single-line input-style trigger. */
  label?: string;
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  /** Minimum selectable date, YYYY-MM-DD */
  min?: string;
  /** Maximum selectable date, YYYY-MM-DD */
  max?: string;
  /** Placeholder when empty (single-line mode). */
  placeholder?: string;
  invalid?: boolean;
  /** Extra classes for the trigger (e.g. height) in single-line mode. */
  className?: string;
  /** date-fns format for the displayed value. Defaults to "MMM d, yyyy". */
  displayFormat?: string;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
type CalView = "days" | "months" | "years";

export function DateField({ label, value, onChange, min, max, placeholder = "Select date", invalid, className, displayFormat = "MMM d, yyyy" }: DateFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<CalView>("days");
  const selected = value ? parse(value, "yyyy-MM-dd", new Date()) : null;
  const minDate = min ? startOfDay(parse(min, "yyyy-MM-dd", new Date())) : null;
  const maxDate = max ? startOfDay(parse(max, "yyyy-MM-dd", new Date())) : null;
  const [cursor, setCursor] = React.useState<Date>(selected || new Date());

  React.useEffect(() => {
    if (open) {
      setCursor(selected || new Date());
      setView("days");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const days = React.useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const pick = (d: Date) => {
    onChange(format(d, "yyyy-MM-dd"));
    setOpen(false);
  };

  const disabled = (d: Date) => {
    const day = startOfDay(d);
    return (!!minDate && day < minDate) || (!!maxDate && day > maxDate);
  };

  const cursorYear = getYear(cursor);
  const yearStart = Math.floor(cursorYear / 12) * 12;
  const years = Array.from({ length: 12 }, (_, i) => yearStart + i);
  const months = Array.from({ length: 12 }, (_, i) => i);

  const headerNav = (dir: -1 | 1) => {
    setCursor((c) => {
      if (view === "days") return dir === -1 ? subMonths(c, 1) : addMonths(c, 1);
      if (view === "months") return setYear(c, getYear(c) + dir);
      return setYear(c, getYear(c) + dir * 12);
    });
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className={
          label
            ? cn(fieldClass, invalid && "border-destructive", !invalid && (value ? "border-primary/30" : "border-border/40"))
            : cn(
                "group flex h-8 w-full items-center gap-2 rounded-lg border bg-transparent px-2.5 text-sm transition-colors outline-none hover:border-primary/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-[popup-open]:border-primary/60 dark:bg-input/30",
                invalid ? "border-destructive" : "border-input",
                className
              )
        }
      >
        {label ? (
          <>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <CalendarIcon className="w-3 h-3" /> {label}
            </span>
            <span className={cn("block h-8 leading-8 text-sm font-semibold truncate", !value && "text-muted-foreground/60")}>
              {selected ? format(selected, displayFormat) : placeholder}
            </span>
          </>
        ) : (
          <>
            <CalendarIcon className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className={cn("truncate", !value && "text-muted-foreground")}>
              {selected ? format(selected, displayFormat) : placeholder}
            </span>
          </>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} className="isolate z-[60]">
          <Popover.Popup className={popupClass}>
            {/* Header */}
            <div className="flex items-center justify-between px-1 pb-2">
              <button
                type="button"
                onClick={() => headerNav(-1)}
                className="p-1.5 rounded-lg hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Previous"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setView((v) => (v === "days" ? "months" : v === "months" ? "years" : "days"))}
                className="text-sm font-semibold px-2 py-1 rounded-lg hover:bg-secondary/60 transition-colors"
              >
                {view === "days" && format(cursor, "MMMM yyyy")}
                {view === "months" && format(cursor, "yyyy")}
                {view === "years" && `${yearStart} – ${yearStart + 11}`}
              </button>
              <button
                type="button"
                onClick={() => headerNav(1)}
                className="p-1.5 rounded-lg hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Next"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* DAYS VIEW */}
            {view === "days" && (
              <>
                <div className="grid grid-cols-7 mb-1">
                  {WEEKDAYS.map((w) => (
                    <div key={w} className="text-center text-[11px] font-medium text-muted-foreground py-1">
                      {w}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {days.map((d) => {
                    const isSel = selected && isSameDay(d, selected);
                    const dimmed = !isSameMonth(d, cursor);
                    const isDisabled = disabled(d);
                    return (
                      <button
                        key={d.toISOString()}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => pick(d)}
                        className={cn(
                          "h-9 w-9 flex items-center justify-center rounded-lg text-sm transition-colors",
                          isDisabled && "opacity-30 cursor-not-allowed",
                          !isDisabled && "hover:bg-secondary/60",
                          dimmed && !isSel && "text-muted-foreground/50",
                          isToday(d) && !isSel && "ring-1 ring-primary/40 font-semibold",
                          isSel && "bg-primary text-primary-foreground font-bold hover:bg-primary"
                        )}
                      >
                        {format(d, "d")}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* MONTHS VIEW */}
            {view === "months" && (
              <div className="grid grid-cols-3 gap-1.5 py-1">
                {months.map((m) => {
                  const isSel = selected && getYear(selected) === cursorYear && getMonth(selected) === m;
                  const isCur = getMonth(cursor) === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setCursor((c) => setMonth(c, m));
                        setView("days");
                      }}
                      className={cn(
                        "h-10 rounded-lg text-sm transition-colors",
                        isSel
                          ? "bg-primary text-primary-foreground font-bold"
                          : cn("hover:bg-secondary/60", isCur && "ring-1 ring-primary/40 font-semibold")
                      )}
                    >
                      {format(setMonth(new Date(), m), "MMM")}
                    </button>
                  );
                })}
              </div>
            )}

            {/* YEARS VIEW */}
            {view === "years" && (
              <div className="grid grid-cols-3 gap-1.5 py-1">
                {years.map((y) => {
                  const isSel = selected && getYear(selected) === y;
                  const isCur = cursorYear === y;
                  return (
                    <button
                      key={y}
                      type="button"
                      onClick={() => {
                        setCursor((c) => setYear(c, y));
                        setView("months");
                      }}
                      className={cn(
                        "h-10 rounded-lg text-sm transition-colors",
                        isSel
                          ? "bg-primary text-primary-foreground font-bold"
                          : cn("hover:bg-secondary/60", isCur && "ring-1 ring-primary/40 font-semibold")
                      )}
                    >
                      {y}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 mt-1 border-t border-border/40">
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground px-1"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  const t = new Date();
                  if (!disabled(t)) pick(t);
                  else setCursor(t);
                }}
                className="text-xs font-semibold text-primary hover:underline px-1"
              >
                Today
              </button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/* ------------------------------- Time field ------------------------------ */

interface TimeFieldProps {
  label: string;
  value: string; // HH:mm (24h)
  onChange: (value: string) => void;
  invalid?: boolean;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,..55

function parseTime(value: string): { h12: number; min: number; period: "AM" | "PM" } | null {
  if (!value) return null;
  const [hStr, mStr] = value.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { h12, min: m, period };
}

function compose(h12: number, min: number, period: "AM" | "PM"): string {
  let h = h12 % 12;
  if (period === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function TimeField({ label, value, onChange, invalid }: TimeFieldProps) {
  const [open, setOpen] = React.useState(false);
  const parsed = parseTime(value);
  const h12 = parsed?.h12 ?? 9;
  const min = parsed?.min ?? 0;
  const period = parsed?.period ?? "AM";

  const set = (next: Partial<{ h12: number; min: number; period: "AM" | "PM" }>) => {
    onChange(compose(next.h12 ?? h12, next.min ?? min, next.period ?? period));
  };

  const colBtn = (active: boolean) =>
    cn(
      "w-full px-3 py-1.5 rounded-lg text-sm text-center transition-colors",
      active ? "bg-primary text-primary-foreground font-bold" : "hover:bg-secondary/60"
    );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className={cn(fieldClass, invalid && "border-destructive", !invalid && (value ? "border-primary/30" : "border-border/40"))}
      >
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Clock className="w-3 h-3" /> {label}
        </span>
        <span className={cn("block h-8 leading-8 text-sm font-semibold truncate", !value && "text-muted-foreground/60")}>
          {parsed ? `${parsed.h12}:${String(parsed.min).padStart(2, "0")} ${parsed.period}` : "Select time"}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} className="isolate z-[60]">
          <Popover.Popup className={cn(popupClass, "w-56")}>
            <div className="grid grid-cols-3 gap-2">
              {/* Hours */}
              <div className="flex flex-col">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground text-center pb-1">Hr</p>
                <div className="max-h-44 overflow-y-auto pr-0.5 space-y-0.5">
                  {HOURS.map((h) => (
                    <button key={h} type="button" onClick={() => set({ h12: h })} className={colBtn(h === h12)}>
                      {h}
                    </button>
                  ))}
                </div>
              </div>
              {/* Minutes */}
              <div className="flex flex-col">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground text-center pb-1">Min</p>
                <div className="max-h-44 overflow-y-auto pr-0.5 space-y-0.5">
                  {MINUTES.map((m) => (
                    <button key={m} type="button" onClick={() => set({ min: m })} className={colBtn(m === min)}>
                      {String(m).padStart(2, "0")}
                    </button>
                  ))}
                </div>
              </div>
              {/* AM/PM */}
              <div className="flex flex-col">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground text-center pb-1">&nbsp;</p>
                <div className="space-y-0.5">
                  {(["AM", "PM"] as const).map((p) => (
                    <button key={p} type="button" onClick={() => set({ period: p })} className={colBtn(p === period)}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 mt-2 border-t border-border/40">
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground px-1"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs font-semibold text-primary hover:underline px-1"
              >
                Done
              </button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
