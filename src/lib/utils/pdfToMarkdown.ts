"use client";

export async function pdfToMarkdown(file: File): Promise<string> {
  // @ts-ignore - no types for direct mjs path
  const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
  // Set worker
  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.mjs",
      import.meta.url
    ).toString();
  }

  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let lineBuf: string[] = [];
    const lines: string[] = [];

    for (const item of content.items as any[]) {
      const str: string = item.str ?? "";
      const y: number = item.transform?.[5] ?? 0;
      if (lastY !== null && Math.abs(lastY - y) > 2) {
        lines.push(lineBuf.join(" ").trim());
        lineBuf = [];
      }
      if (str) lineBuf.push(str);
      lastY = y;
    }
    if (lineBuf.length) lines.push(lineBuf.join(" ").trim());

    const pageMd = lines
      .filter(l => l.length > 0)
      .map(l => {
        // Heuristic: ALL CAPS short line → heading
        if (l.length < 80 && l === l.toUpperCase() && /[A-Z]/.test(l)) {
          return `## ${l}`;
        }
        return l;
      })
      .join("\n\n");

    pages.push(pageMd);
  }

  return pages.join("\n\n---\n\n").trim();
}
