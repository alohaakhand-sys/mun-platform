"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  Shield,
  Database,
  Cookie,
  Share2,
  Lock,
  Eye,
  Trash2,
  Baby,
  Globe2,
  Mail,
} from "lucide-react";

const LAST_UPDATED = "May 24, 2026";

const PRINCIPLES = [
  {
    icon: Lock,
    title: "Encrypted in transit & at rest",
    desc: "TLS everywhere, AES-256 storage. Your data stays sealed.",
  },
  {
    icon: Eye,
    title: "No selling. Ever.",
    desc: "We don&apos;t sell your data to advertisers or third parties.",
  },
  {
    icon: Trash2,
    title: "You own your data",
    desc: "Export it, delete it, control it — anytime from settings.",
  },
];

const SECTIONS = [
  {
    id: "collect",
    icon: Database,
    title: "Data We Collect",
    body: [
      "<strong>Account data:</strong> name, email, profile photo, role (delegate/chair/organizer), nationality, institution.",
      "<strong>Application data:</strong> position papers, country preferences, conference history, awards.",
      "<strong>Usage data:</strong> pages viewed, features used, device type, IP address (for security).",
      "<strong>Payment data:</strong> handled entirely by Stripe / PayPal — we only see transaction metadata.",
    ],
  },
  {
    id: "use",
    icon: Eye,
    title: "How We Use It",
    body: [
      "To operate the Service: matching delegates to committees, processing applications, displaying conferences.",
      "To improve the Service: aggregated analytics, debugging, security monitoring.",
      "To communicate with you: account alerts, conference updates (you control email frequency in Settings).",
      "To comply with legal obligations and enforce our Terms.",
    ],
  },
  {
    id: "cookies",
    icon: Cookie,
    title: "Cookies & Tracking",
    body: [
      "We use <strong>essential cookies</strong> for authentication and security (you cannot disable these).",
      "We use <strong>functional cookies</strong> to remember your theme preference and recent activity.",
      "We use <strong>analytics cookies</strong> (anonymized) to understand how the Service is used. You can opt out from settings.",
      "We do <strong>not</strong> use third-party advertising trackers.",
    ],
  },
  {
    id: "sharing",
    icon: Share2,
    title: "Sharing With Others",
    body: [
      "<strong>Organizers</strong> see application data for delegates who apply to their conferences.",
      "<strong>Chairs</strong> see position papers and scoring data for delegates in their committees.",
      "<strong>Service providers</strong> (Firebase, Stripe, email delivery) process data on our behalf under strict contracts.",
      "<strong>Legal requests</strong> — we disclose only what is legally required and notify you when permitted.",
    ],
  },
  {
    id: "dpa",
    icon: Globe2,
    title: "International Transfers & DPA",
    body: [
      "Data is processed primarily in US and EU data centers (Firebase). Standard Contractual Clauses cover EU/UK/Swiss transfers.",
      "Enterprise organizers can request a signed Data Processing Agreement (DPA) for GDPR / CCPA compliance.",
      "Contact <a href='mailto:privacy@munplatform.app' class='text-primary underline'>privacy@munplatform.app</a> to request a DPA.",
    ],
  },
  {
    id: "rights",
    icon: Shield,
    title: "Your Rights",
    body: [
      "<strong>Access:</strong> download a copy of your data from Settings.",
      "<strong>Correction:</strong> edit your profile and submissions anytime.",
      "<strong>Deletion:</strong> delete your account permanently from Settings → Security.",
      "<strong>Portability:</strong> export your data in JSON format.",
      "<strong>Objection:</strong> opt out of marketing emails and analytics from Settings.",
    ],
  },
  {
    id: "security",
    icon: Lock,
    title: "Security",
    body: [
      "We use industry-standard security: TLS 1.3, AES-256 at rest, OAuth via Google, role-based access controls.",
      "Firestore security rules enforce data access at the database layer — not just the application layer.",
      "We run regular security audits and respond to vulnerability reports promptly. Report concerns to <a href='mailto:security@munplatform.app' class='text-primary underline'>security@munplatform.app</a>.",
    ],
  },
  {
    id: "retention",
    icon: Trash2,
    title: "Data Retention",
    body: [
      "Active accounts: data is retained as long as your account is active.",
      "Deleted accounts: personal data is purged within 30 days. Anonymized analytics may be retained for aggregate reporting.",
      "Legal holds: data may be retained longer when required by law.",
    ],
  },
  {
    id: "children",
    icon: Baby,
    title: "Children&apos;s Privacy",
    body: [
      "The Service is not directed to children under 13. We do not knowingly collect data from children under 13.",
      "For users aged 13–17, we recommend guardian involvement during account creation.",
      "If we learn we have collected data from a child under 13, we will delete it promptly.",
    ],
  },
  {
    id: "contact",
    icon: Mail,
    title: "Contact Our DPO",
    body: [
      "Privacy questions, data requests, or complaints? Reach our Data Protection Officer at <a href='mailto:privacy@munplatform.app' class='text-primary underline'>privacy@munplatform.app</a>.",
      "EU residents can also contact your local supervisory authority.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="relative min-h-screen">
      <div className="fixed inset-0 -z-10 bg-background">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] opacity-20 bg-primary blur-[140px] rounded-full" />
        <div className="absolute top-[60%] left-0 w-[500px] h-[500px] opacity-15 bg-emerald-500 blur-[140px] rounded-full" />
      </div>

      {/* HERO */}
      <section className="relative pt-20 md:pt-28 pb-12">
        <div className="container mx-auto px-4 md:px-6 max-w-5xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-6"
          >
            <Shield className="h-3.5 w-3.5" />
            Privacy · Your data, your control
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl md:text-6xl font-bold tracking-tight"
          >
            Privacy <span className="text-gradient">Policy</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-5 text-muted-foreground md:text-lg max-w-2xl mx-auto"
          >
            What we collect, how we use it, and the controls you have. Written
            in plain English — no legal fog.
          </motion.p>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-6 text-xs text-muted-foreground"
          >
            Last updated: <span className="font-medium text-foreground">{LAST_UPDATED}</span>
          </motion.div>
        </div>
      </section>

      {/* PRINCIPLES STRIP */}
      <section className="relative pb-12">
        <div className="container mx-auto px-4 md:px-6 max-w-5xl">
          <div className="grid sm:grid-cols-3 gap-4">
            {PRINCIPLES.map((p, i) => {
              const Icon = p.icon;
              return (
                <motion.div
                  key={p.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="glass-card rounded-2xl p-5 text-center"
                >
                  <div className="h-11 w-11 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500/20 to-primary/20 ring-1 ring-emerald-500/30 flex items-center justify-center mb-3">
                    <Icon className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div className="font-semibold mb-1">{p.title}</div>
                  <p
                    className="text-xs text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: p.desc }}
                  />
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CONTENT */}
      <section className="relative pb-24">
        <div className="container mx-auto px-4 md:px-6 max-w-6xl">
          <div className="grid lg:grid-cols-[240px_1fr] gap-10">
            <aside className="hidden lg:block">
              <div className="sticky top-24 space-y-1">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-semibold">
                  On this page
                </div>
                {SECTIONS.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="block text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/40 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    {s.title.replace(/&apos;/g, "'")}
                  </a>
                ))}
              </div>
            </aside>

            <div className="space-y-6">
              {SECTIONS.map((s, i) => {
                const Icon = s.icon;
                return (
                  <motion.section
                    key={s.id}
                    id={s.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ delay: i * 0.04, duration: 0.5 }}
                    className="group relative glass-card rounded-3xl p-7 md:p-8 scroll-mt-24"
                  >
                    <div className="absolute -inset-px rounded-3xl bg-gradient-to-br from-emerald-500/10 via-transparent to-primary/10 opacity-0 group-hover:opacity-100 transition-opacity blur-sm pointer-events-none" />
                    <div className="relative flex items-start gap-4 mb-4">
                      <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-primary/20 ring-1 ring-emerald-500/30 flex items-center justify-center shrink-0">
                        <Icon className="h-5 w-5 text-emerald-500" />
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {String(i + 1).padStart(2, "0")}
                        </div>
                        <h2
                          className="text-2xl font-bold tracking-tight"
                          dangerouslySetInnerHTML={{ __html: s.title }}
                        />
                      </div>
                    </div>
                    <ul className="relative space-y-2.5 text-muted-foreground leading-relaxed pl-0 md:pl-[60px]">
                      {s.body.map((p, j) => (
                        <li key={j} className="flex gap-2.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary mt-2 shrink-0" />
                          <span dangerouslySetInnerHTML={{ __html: p }} />
                        </li>
                      ))}
                    </ul>
                  </motion.section>
                );
              })}

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mt-10 rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-background to-primary/10 p-8 text-center"
              >
                <h3 className="text-2xl font-bold mb-2">Want to exercise your rights?</h3>
                <p className="text-muted-foreground mb-5">
                  Download, edit, or delete your data from your account settings.
                </p>
                <Link
                  href="/dashboard/settings"
                  className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-6 py-2.5 text-sm font-semibold shadow-lg shadow-primary/10 hover:shadow-primary/10 transition-shadow"
                >
                  Open Settings
                </Link>
              </motion.div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
