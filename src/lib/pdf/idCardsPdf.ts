/**
 * Client-side ID-card PDF, built in the browser with @react-pdf (the old Cloud Function needs
 * the Blaze plan, which this project doesn't have). Loaded on demand.
 */
import { createElement } from "react";
import type { IdCardsData } from "./IdCardsDocument";
import { saveBlob } from "./certificatePdf";

export type { IdCardsData, IdCardPerson, IdCardTemplate } from "./IdCardsDocument";

export async function downloadIdCardsPdf(data: IdCardsData, filename: string): Promise<void> {
  const [{ pdf }, { IdCardsDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./IdCardsDocument"),
  ]);
  const blob = await pdf(createElement(IdCardsDocument, { data }) as any).toBlob();
  saveBlob(blob, filename);
}
