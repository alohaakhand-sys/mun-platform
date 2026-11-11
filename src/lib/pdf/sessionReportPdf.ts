/**
 * Client-side session-report PDF download. Both the @react-pdf renderer and the document
 * module are loaded via dynamic import, so the heavy PDF lib stays out of the main bundle
 * and is only fetched when a user actually clicks "Download PDF". No Firebase Storage,
 * no Cloud Function (Storage is not provisioned on this project).
 */
import { createElement } from "react";
import type { SessionReportData } from "./SessionReportDocument";

export type { SessionReportData } from "./SessionReportDocument";

export async function downloadSessionReportPdf(data: SessionReportData, filename: string): Promise<void> {
  const [{ pdf }, { SessionReportDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./SessionReportDocument"),
  ]);
  // SessionReportDocument renders a <Document>; cast through `any` since pdf() types its
  // root as ReactElement<DocumentProps> and our wrapper component doesn't expose that.
  const blob = await pdf(createElement(SessionReportDocument, { data }) as any).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
