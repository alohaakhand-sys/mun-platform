/**
 * @react-pdf/renderer ID cards: credit-card size (85.6 × 54 mm), ten to an A4 page, in one of
 * three templates (Modern, Classic, Bold) tinted with the event's theme colour. Loaded only
 * through the dynamic import in `idCardsPdf.ts`.
 */
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";

export type IdCardTemplate = "modern" | "classic" | "bold";

export interface IdCardPerson {
  name: string;
  /** "Delegate of Japan", "Chair", "Faculty Advisor" */
  role: string;
  committee?: string;
  /** The person's QR pass as a PNG data URL (Pro: setup/qr-passes-plan.md), drawn on the right. */
  qr?: string;
}

export interface IdCardsData {
  eventTitle: string;
  template: IdCardTemplate;
  /** The event's theme colour, or the platform green. */
  accent: string;
  /** Text on the accent colour. */
  ink: string;
  people: IdCardPerson[];
}

const W = 242.6, H = 153; // 85.6 × 54 mm in points

const s = StyleSheet.create({
  page: { paddingVertical: 14, paddingHorizontal: 40, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignContent: "flex-start" },
  card: { width: W, height: H, marginBottom: 7, borderRadius: 8, overflow: "hidden", borderWidth: 0.75, borderColor: "#cbd5e1", borderStyle: "solid" },
  band: { paddingHorizontal: 12, paddingVertical: 7 },
  event: { fontSize: 8, letterSpacing: 1.2, fontFamily: "Helvetica-Bold" },
  body: { flexGrow: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", marginRight: 10 },
  initials: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  name: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  role: { fontSize: 9, color: "#334155", marginTop: 3 },
  committee: { fontSize: 8, color: "#64748b", marginTop: 2 },
  foot: { paddingHorizontal: 12, paddingBottom: 7, fontSize: 6.5, color: "#94a3b8", letterSpacing: 1 },
  // White plate so the code scans on the Bold template's colour too.
  qr: { width: 64, height: 64, padding: 3, backgroundColor: "#ffffff", borderRadius: 3, marginLeft: "auto" },
});

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("") || "?";
}

function Card({ p, d }: { p: IdCardPerson; d: IdCardsData }) {
  const bold = d.template === "bold";
  const classic = d.template === "classic";
  const fg = bold ? d.ink : "#0f172a";
  const sub = bold ? d.ink : "#334155";
  return (
    <View style={[s.card, bold ? { backgroundColor: d.accent, borderColor: d.accent } : { backgroundColor: "#ffffff" }]} wrap={false}>
      <View style={[s.band, classic ? { borderBottomWidth: 1.5, borderBottomColor: d.accent, borderBottomStyle: "solid" } : bold ? {} : { backgroundColor: d.accent }]}>
        <Text style={[s.event, { color: classic ? d.accent : bold ? d.ink : d.ink, textAlign: classic ? "center" : "left" }]}>{d.eventTitle.toUpperCase()}</Text>
      </View>
      <View style={[s.body, classic ? { flexDirection: "column", justifyContent: "center" } : {}]}>
        {!classic && (
          <View style={[s.avatar, { backgroundColor: bold ? "rgba(255,255,255,0.18)" : "#eef2f0" }]}>
            <Text style={[s.initials, { color: bold ? d.ink : d.accent }]}>{initials(p.name)}</Text>
          </View>
        )}
        {/* Beside a QR the text gets a fixed width so a long committee wraps instead of running under it. */}
        <View style={classic ? { alignItems: "center" } : p.qr ? { flexShrink: 1, maxWidth: W - 24 - 56 - 70 } : { flexShrink: 1 }}>
          <Text style={[s.name, { color: fg, fontFamily: classic ? "Times-Bold" : "Helvetica-Bold" }]}>{p.name}</Text>
          <Text style={[s.role, { color: sub }]}>{p.role}</Text>
          {p.committee ? <Text style={[s.committee, { color: bold ? d.ink : "#64748b" }]}>{p.committee}</Text> : null}
        </View>
        {p.qr && !classic ? <Image src={p.qr} style={s.qr} /> : null}
      </View>
      {p.qr && classic ? <Image src={p.qr} style={[s.qr, { position: "absolute", right: 10, bottom: 18, width: 52, height: 52 }]} /> : null}
      <Text style={[s.foot, bold ? { color: d.ink } : {}, classic ? { textAlign: "center" } : {}]}>OFFICIAL CREDENTIAL</Text>
    </View>
  );
}

export function IdCardsDocument({ data }: { data: IdCardsData }) {
  return (
    <Document title={`${data.eventTitle} ID cards`}>
      <Page size="A4" style={s.page}>
        {data.people.map((p, i) => <Card key={i} p={p} d={data} />)}
      </Page>
    </Document>
  );
}
