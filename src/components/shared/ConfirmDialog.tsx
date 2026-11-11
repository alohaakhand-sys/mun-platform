"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InlineError } from "./InlineError";

/**
 * Replacement for `window.confirm()`. The confirm button shows a busy verb while
 * `onConfirm` runs ("Deleting…"), the dialog stays open on failure and shows the error
 * inline, and closes itself on success. On phones it opens as a bottom sheet (globals.css).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = "Confirm",
  busyLabel,
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Extra body content between the description and the buttons. */
  children?: React.ReactNode;
  confirmLabel?: string;
  /** Verb shown while working, e.g. "Deleting…". Defaults to "Working…". */
  busyLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setOpen = (o: boolean) => {
    if (busy) return;
    if (!o) setError(null);
    onOpenChange(o);
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setBusy(false);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {error && <InlineError>{error}</InlineError>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "danger" ? "danger" : "default"} onClick={run} disabled={busy}>
            {busy ? busyLabel || "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Replacement for `window.prompt()`: a labelled textarea + Cancel / submit. `belowField`
 * is a slot for helpers such as <AiTextareaAssist> (Results "Revise", DECISIONS #16).
 */
export function PromptDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  initialValue = "",
  required = true,
  submitLabel = "Send",
  busyLabel,
  cancelLabel = "Cancel",
  belowField,
  value: controlledValue,
  onValueChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  label: string;
  placeholder?: string;
  initialValue?: string;
  required?: boolean;
  submitLabel?: string;
  busyLabel?: string;
  cancelLabel?: string;
  belowField?: React.ReactNode;
  /** Optional controlled value (lets an AI helper write into the field). */
  value?: string;
  onValueChange?: (v: string) => void;
  onSubmit: (value: string) => void | Promise<void>;
}) {
  const fieldId = useId();
  const [inner, setInner] = useState(initialValue);
  const value = controlledValue ?? inner;
  const setValue = (v: string) => (onValueChange ? onValueChange(v) : setInner(v));

  // Reset the field each time the dialog opens (derived during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open && controlledValue === undefined) setInner(initialValue);
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      confirmLabel={submitLabel}
      busyLabel={busyLabel}
      cancelLabel={cancelLabel}
      onConfirm={async () => {
        if (required && !value.trim()) throw new Error("Please write something first.");
        await onSubmit(value.trim());
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor={fieldId}>{label}</Label>
        <Textarea
          id={fieldId}
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          rows={4}
        />
        {belowField}
      </div>
    </ConfirmDialog>
  );
}
