/**
 * @react-pdf/renderer document for a Live MUN session report. Statically imports the
 * (heavy) renderer, so this module is only ever pulled in via the dynamic import in
 * `sessionReportPdf.ts` — never into the main bundle.
 */
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { PointType } from "@/lib/services/sessionService";

export interface ReportRowWithName {
  delegateId: string;
  name?: string;
  country: string;
  attendanceStatus?: string;
  speeches: number;
  speakingSeconds: number;
  caucusSpeeches: number;
  motions: number;
  votesCast: number;
  pointsByType: Record<PointType, number>;
  pointsTotal: number;
  yieldsGiven: { targetCountry: string }[];
}

export interface SessionReportData {
  mode: "full" | "own";
  eventTitle: string;
  committeeId: string;
  dateStr: string;
  present?: number;
  quorum?: number;
  totalSpeeches?: number;
  totalSpeakingSeconds?: number;
  rows: ReportRowWithName[];
  votes?: { motion: string; result: string; affirmative: number; negative: number; abstentions: number }[];
}

function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
function attLabel(a?: string) {
  return a === "present_and_voting" ? "P&V" : a === "present" ? "P" : a === "late" ? "Late" : a === "absent" ? "Abs" : "—";
}
function ptsBreakdown(b: Record<PointType, number>) {
  const parts: string[] = [];
  if (b.order) parts.push(`O${b.order}`);
  if (b.information) parts.push(`I${b.information}`);
  if (b.personal_privilege) parts.push(`PP${b.personal_privilege}`);
  if (b.parliamentary_inquiry) parts.push(`PI${b.parliamentary_inquiry}`);
  return parts.join(" ") || "—";
}

const C = {
  ink: "#1b1f2a", sub: "#6b7280", line: "#e5e7eb", head: "#f3f4f6",
  brand: "#4f46e5", soft: "#eef2ff",
};

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 36, paddingHorizontal: 32, fontSize: 9, color: C.ink, fontFamily: "Helvetica" },
  h1: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 9, color: C.sub, marginTop: 2 },
  band: { flexDirection: "row", gap: 10, marginTop: 12, marginBottom: 12 },
  stat: { borderWidth: 1, borderColor: C.line, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10, minWidth: 86 },
  statN: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.brand },
  statL: { fontSize: 7, color: C.sub, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 },
  secTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6 },
  tHead: { flexDirection: "row", backgroundColor: C.head, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line },
  tRow: { flexDirection: "row", borderBottomWidth: 1, borderColor: C.line, minHeight: 18, alignItems: "center" },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.sub, textTransform: "uppercase", paddingVertical: 5, paddingHorizontal: 4 },
  td: { paddingVertical: 4, paddingHorizontal: 4 },
  foot: { position: "absolute", bottom: 18, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: C.sub },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 14, marginTop: 8 },
  kv: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 1, borderColor: C.line },
  kvLast: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
});

// Column widths (full table) — flex weights
const COLS = [
  { k: "delegate", label: "Delegate", w: 150, a: "left" as const },
  { k: "att", label: "Att", w: 34, a: "center" as const },
  { k: "spk", label: "Spk", w: 30, a: "center" as const },
  { k: "time", label: "Time", w: 40, a: "center" as const },
  { k: "pts", label: "Points (O/I/PP/PI)", w: 90, a: "center" as const },
  { k: "mot", label: "Mot", w: 30, a: "center" as const },
  { k: "vot", label: "Votes", w: 34, a: "center" as const },
  { k: "yld", label: "Yields", w: 90, a: "left" as const },
];

function Header({ data }: { data: SessionReportData }) {
  return (
    <View>
      <Text style={s.h1}>{data.committeeId} — Session Report</Text>
      <Text style={s.sub}>{data.eventTitle} · {data.dateStr}{data.mode === "own" && data.rows[0] ? ` · ${data.rows[0].country}` : ""}</Text>
    </View>
  );
}

function FullReport({ data }: { data: SessionReportData }) {
  return (
    <Page size="A4" orientation="landscape" style={s.page}>
      <Header data={data} />
      <View style={s.band}>
        <View style={s.stat}><Text style={s.statN}>{data.rows.length}</Text><Text style={s.statL}>Delegates</Text></View>
        <View style={s.stat}><Text style={s.statN}>{data.present ?? 0}/{data.quorum ?? 0}</Text><Text style={s.statL}>Present / Quorum</Text></View>
        <View style={s.stat}><Text style={s.statN}>{data.totalSpeeches ?? 0}</Text><Text style={s.statL}>Speeches</Text></View>
        <View style={s.stat}><Text style={s.statN}>{fmtTime(data.totalSpeakingSeconds ?? 0)}</Text><Text style={s.statL}>Speaking time</Text></View>
        <View style={s.stat}><Text style={s.statN}>{data.votes?.length ?? 0}</Text><Text style={s.statL}>Votes</Text></View>
      </View>

      <View style={s.tHead}>
        {COLS.map((c) => (
          <Text key={c.k} style={[s.th, { width: c.w, textAlign: c.a }]}>{c.label}</Text>
        ))}
      </View>
      {data.rows.map((r) => (
        <View key={r.delegateId} style={s.tRow} wrap={false}>
          <View style={[s.td, { width: 150 }]}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{r.country || "—"}</Text>
            {r.name ? <Text style={{ fontSize: 7, color: C.sub }}>{r.name}</Text> : null}
          </View>
          <Text style={[s.td, { width: 34, textAlign: "center" }]}>{attLabel(r.attendanceStatus)}</Text>
          <Text style={[s.td, { width: 30, textAlign: "center" }]}>{r.speeches}</Text>
          <Text style={[s.td, { width: 40, textAlign: "center" }]}>{fmtTime(r.speakingSeconds)}</Text>
          <Text style={[s.td, { width: 90, textAlign: "center" }]}>{ptsBreakdown(r.pointsByType)}</Text>
          <Text style={[s.td, { width: 30, textAlign: "center" }]}>{r.motions}</Text>
          <Text style={[s.td, { width: 34, textAlign: "center" }]}>{r.votesCast}</Text>
          <Text style={[s.td, { width: 90 }]}>{r.yieldsGiven.map((y) => y.targetCountry).filter(Boolean).join(", ") || "—"}</Text>
        </View>
      ))}

      {data.votes && data.votes.length > 0 && (
        <View wrap={false}>
          <Text style={s.secTitle}>Voting record</Text>
          {data.votes.map((v, i) => (
            <View key={i} style={s.tRow}>
              <Text style={[s.td, { flex: 1 }]}>{v.motion}</Text>
              <Text style={[s.td, { width: 120, textAlign: "right" }]}>{v.affirmative}-{v.negative}-{v.abstentions}</Text>
              <Text style={[s.td, { width: 70, textAlign: "right", fontFamily: "Helvetica-Bold", textTransform: "uppercase" }]}>{v.result}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={s.foot} fixed>
        <Text>Generated from Live MUN participation data</Text>
        <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </View>
    </Page>
  );
}

function OwnReport({ data }: { data: SessionReportData }) {
  const r = data.rows[0];
  return (
    <Page size="A4" style={s.page}>
      <Header data={data} />
      {!r ? (
        <Text style={{ marginTop: 20, color: C.sub }}>No participation recorded for this session.</Text>
      ) : (
        <View style={s.card}>
          <View style={s.kv}><Text style={{ color: C.sub }}>Attendance</Text><Text>{attLabel(r.attendanceStatus)}</Text></View>
          <View style={s.kv}><Text style={{ color: C.sub }}>Speeches</Text><Text>{r.speeches}</Text></View>
          <View style={s.kv}><Text style={{ color: C.sub }}>Speaking time</Text><Text>{fmtTime(r.speakingSeconds)}</Text></View>
          <View style={s.kv}><Text style={{ color: C.sub }}>Caucus speeches</Text><Text>{r.caucusSpeeches}</Text></View>
          <View style={s.kv}><Text style={{ color: C.sub }}>Points of Order</Text><Text>{r.pointsByType.order}</Text></View>
          <View style={s.kv}><Text style={{ color: C.sub }}>Points of Information</Text><Text>{r.pointsByType.information}</Text></View>
          <View style={s.kv}><Text style={{ color: C.sub }}>Points of Personal Privilege</Text><Text>{r.pointsByType.personal_privilege}</Text></View>
          <View style={s.kv}><Text style={{ color: C.sub }}>Points of Parliamentary Inquiry</Text><Text>{r.pointsByType.parliamentary_inquiry}</Text></View>
          <View style={s.kv}><Text style={{ color: C.sub }}>Motions raised</Text><Text>{r.motions}</Text></View>
          <View style={s.kv}><Text style={{ color: C.sub }}>Votes cast</Text><Text>{r.votesCast}</Text></View>
          <View style={s.kvLast}><Text style={{ color: C.sub }}>Yields given</Text><Text>{r.yieldsGiven.map((y) => y.targetCountry).filter(Boolean).join(", ") || "—"}</Text></View>
        </View>
      )}
      <View style={s.foot} fixed>
        <Text>Your Live MUN participation summary</Text>
      </View>
    </Page>
  );
}

export function SessionReportDocument({ data }: { data: SessionReportData }) {
  return (
    <Document title={`${data.committeeId} session report`}>
      {data.mode === "full" ? <FullReport data={data} /> : <OwnReport data={data} />}
    </Document>
  );
}
