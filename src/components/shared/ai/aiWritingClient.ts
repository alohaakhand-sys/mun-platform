"use client";

/**
 * Client half of /api/ai/writing-assist — the paragraph/document-scale sibling of
 * the session console's AiAssist. One probe, one caller, shared by the textarea
 * bar (AiTextareaAssist) and the rich-text editor AI menu (RichTextEditorAi).
 */
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase/client";
import type {
  WritingAction, WritingSurface, WritingAssistRequest,
} from "@/app/api/ai/writing-assist/route";
import { currentAiEventId } from "./aiEventScope";

export type { WritingAction, WritingSurface };

const ENDPOINT = "/api/ai/writing-assist";

// Module-level promise so every mounted instance shares ONE request per page load.
let enabledPromise: Promise<boolean> | null = null;

function probeEnabled(): Promise<boolean> {
  if (!enabledPromise) {
    enabledPromise = fetch(ENDPOINT)
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => !!d?.enabled)
      .catch(() => false);
  }
  return enabledPromise;
}

/** True once the server confirms an AI provider key is configured. Never throws. */
export function useAiWritingEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    probeEnabled().then((v) => { if (alive) setEnabled(v); });
    return () => { alive = false; };
  }, []);
  return enabled;
}

/** POST to the writing-assist route. Throws with the server's message on failure. */
export async function callWritingAssist(payload: WritingAssistRequest): Promise<string> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Not signed in");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ eventId: currentAiEventId(), ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `AI request failed (${res.status})`);
  return typeof data?.result === "string" ? data.result : "";
}
