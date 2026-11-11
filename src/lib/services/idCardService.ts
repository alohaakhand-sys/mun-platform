import { functions } from "@/lib/firebase/client";
import { httpsCallable } from "firebase/functions";

/**
 * Triggers the generateBulkIdCards Cloud Function (organizer-only, enforced server-side)
 * which renders a printable PDF of all approved participants' ID cards and returns its URL.
 */
export async function generateBulkIdCards(eventId: string): Promise<{ url: string }> {
  const callable = httpsCallable<{ eventId: string }, { success: boolean; url: string }>(
    functions,
    "generateBulkIdCards"
  );
  const result = await callable({ eventId });
  if (!result.data?.success || !result.data?.url) {
    throw new Error("Failed to generate ID cards");
  }
  return { url: result.data.url };
}
