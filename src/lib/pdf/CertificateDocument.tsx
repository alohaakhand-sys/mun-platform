/**
 * @react-pdf/renderer certificate in the event's template (Classic Diploma, Modern Minimal,
 * Ornate Gold). Loaded only through the dynamic import in `certificatePdf.ts`.
 */
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { CertificateTemplateId } from "@/lib/data/eventLook";

export interface CertificateData {
  template: CertificateTemplateId;
  title: string;
  name: string;
  line: string;
  conference: string;
  date: string;
}

const LOOK: Record<CertificateTemplateId, { page: any; frame: any; align: "center" | "left"; font: string; accent: string }> = {
  diploma: { page: { backgroundColor: "#fdfbf7" }, frame: { borderWidth: 6, borderColor: "#1e293b", borderStyle: "solid", padding: 6 }, align: "center", font: "Times-Roman", accent: "#1e293b" },
  modern: { page: { backgroundColor: "#ffffff" }, frame: { borderLeftWidth: 14, borderLeftColor: "#7c3aed", borderLeftStyle: "solid", paddingLeft: 40 }, align: "left", font: "Helvetica", accent: "#7c3aed" },
  ornate: { page: { backgroundColor: "#ffffff" }, frame: { borderWidth: 16, borderColor: "#d4af37", borderStyle: "solid", padding: 4 }, align: "center", font: "Times-Roman", accent: "#b08d2e" },
};

const s = StyleSheet.create({
  page: { padding: 28 },
  inner: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 48, paddingVertical: 32 },
  kicker: { fontSize: 11, letterSpacing: 3, color: "#64748b", fontFamily: "Helvetica" },
  title: { fontSize: 34, marginTop: 10 },
  small: { fontSize: 12, color: "#64748b", marginTop: 14, fontStyle: "italic" },
  name: { fontSize: 32, marginTop: 8 },
  line: { fontSize: 13, color: "#334155", marginTop: 10, lineHeight: 1.4 },
  conf: { fontSize: 20, marginTop: 8 },
  sigs: { flexDirection: "row", justifyContent: "space-between", marginTop: 42 },
  sig: { width: 170, borderTopWidth: 1, borderTopColor: "#94a3b8", borderTopStyle: "solid", paddingTop: 5, fontSize: 9, color: "#64748b", fontFamily: "Helvetica", textAlign: "center" },
});

export function CertificateDocument({ data }: { data: CertificateData }) {
  const look = LOOK[data.template];
  const ta = { textAlign: look.align } as const;
  return (
    <Document title={`${data.title} - ${data.name}`}>
      <Page size="A4" orientation="landscape" style={[s.page, look.page]}>
        <View style={[{ flexGrow: 1 }, look.frame]}>
          <View style={[s.inner, look.frame.borderWidth ? { borderWidth: 1, borderColor: look.accent, borderStyle: "solid" } : {}]}>
            <Text style={[s.kicker, ta]}>{data.conference.toUpperCase()}</Text>
            <Text style={[s.title, ta, { fontFamily: look.font, color: look.accent }]}>{data.title}</Text>
            <Text style={[s.small, ta]}>This is to certify that</Text>
            <Text style={[s.name, ta, { fontFamily: look.font }]}>{data.name}</Text>
            <Text style={[s.line, ta]}>{data.line}</Text>
            <Text style={[s.conf, ta, { fontFamily: look.font, color: look.accent }]}>{data.conference}</Text>
            <Text style={[s.small, ta]}>{data.date}</Text>
            <View style={s.sigs}>
              <Text style={s.sig}>Secretary-General</Text>
              <Text style={s.sig}>Organizing Chair</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
