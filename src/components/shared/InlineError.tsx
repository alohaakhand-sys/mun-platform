import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "error" | "warn" | "info" | "ok";

const ICONS = { error: AlertCircle, warn: AlertTriangle, info: Info, ok: CheckCircle2 } as const;

/**
 * Inline notice — the redesign's replacement for `window.alert()`. Sits where the
 * problem happened (above the form's submit row, inside the card that failed to load),
 * never as a floating toast. `tone="error"` is announced to screen readers immediately.
 */
export function InlineError({
  children,
  title,
  tone = "error",
  action,
  className,
}: {
  children?: React.ReactNode;
  title?: React.ReactNode;
  tone?: Tone;
  /** Optional one-click recovery, e.g. { label: "Try again", onClick: retry }. */
  action?: { label: string; onClick: () => void };
  className?: string;
}) {
  const Icon = ICONS[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("mp-alert", `mp-alert-${tone}`, className)}
    >
      <Icon className="size-4" aria-hidden="true" />
      <div className="mp-alert-body">
        {title && <span className="mp-alert-title">{title}</span>}
        {children}
      </div>
      {action && (
        <button type="button" className="mp-alert-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

/** Red helper line under a field. Pair with `aria-invalid` + `aria-describedby` on the input. */
export function FieldError({ id, children, className }: { id?: string; children?: React.ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <p id={id} className={cn("mp-field-error", className)}>
      {children}
    </p>
  );
}
