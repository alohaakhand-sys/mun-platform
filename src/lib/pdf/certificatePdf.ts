/**
 * Client-side certificate PDF (no Cloud Function: those aren't enabled on this project). The
 * renderer and the document load on demand, as with the session report.
 */
import { createElement } from "react";
import type { CertificateData } from "./CertificateDocument";

export type { CertificateData } from "./CertificateDocument";

export async function downloadCertificatePdf(data: CertificateData, filename: string): Promise<void> {
  const [{ pdf }, { CertificateDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./CertificateDocument"),
  ]);
  const blob = await pdf(createElement(CertificateDocument, { data }) as any).toBlob();
  saveBlob(blob, filename);
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
