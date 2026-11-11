"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  FileText,
  Shield,
  Scale,
  Users,
  CreditCard,
  AlertTriangle,
  Gavel,
  RefreshCw,
  Mail,
} from "lucide-react";

const LAST_UPDATED = "May 24, 2026";

const SECTIONS = [
  {
    id: "acceptance",
    icon: FileText,
    title: "Acceptance of Terms",
    body: [
      "By accessing or using MUN Platform (the &quot;Service&quot;), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the Service.",
      "We may update these Terms from time to time. Continued use after changes means you accept the revised Terms.",
    ],
  },
  {
    id: "accounts",
    icon: Users,
    title: "Accounts & Eligibility",
    body: [
      "You must be at least 13 years old to create an account. Delegates under 18 should have guardian consent where required by local law.",
      "You are responsible for safeguarding your password and for all activities under your account. Notify us immediately of unauthorized access.",
      "You agree to provide accurate, current, and complete information during registration and to update it as needed.",
    ],
  },
  {
    id: "use",
    icon: Shield,
    title: "Acceptable Use",
    body: [
      "You agree not to misuse the Service. This includes: harassing other users, uploading malicious content, scraping data without permission, attempting to breach security, or impersonating others.",
      "Organizers must not run conferences that violate applicable laws or platform community standards.",
      "We reserve the right to suspend or terminate accounts that violate these rules.",
    ],
  },
  {
    id: "content",
    icon: FileText,
    title: "User Content",
    body: [
      "You retain ownership of content you submit (articles, position papers, profile data). You grant us a worldwide, non-exclusive license to host, display, and distribute that content within the Service.",
      "You are responsible for ensuring you have the rights to any content you upload.",
      "We may remove content that violates these Terms or applicable law.",
    ],
  },
  {
    id: "payments",
    icon: CreditCard,
    title: "Payments & Refunds",
    body: [
      "Some features require payment (Pro organizer plans, premium conference registrations). Fees are listed at point of purchase.",
      "Refunds are handled per the specific conference&apos;s refund policy or Pro plan terms. Platform fees may be non-refundable.",
      "All payments are processed by third-party providers (Stripe / PayPal). Their terms apply to the payment transaction.",
    ],
  },
  {
    id: "ip",
    icon: Scale,
    title: "Intellectual Property",
    body: [
      "The Service, including its design, code, branding, and documentation, is owned by MUN Platform and protected by intellectual property laws.",
      "You may not copy, modify, or create derivative works of the Service without our written permission.",
    ],
  },
  {
    id: "disclaimers",
    icon: AlertTriangle,
    title: "Disclaimers & Liability",
    body: [
      "The Service is provided &quot;as is&quot; without warranties of any kind. We do not guarantee uninterrupted access or error-free operation.",
      "To the maximum extent permitted by law, MUN Platform is not liable for indirect, incidental, or consequential damages arising from your use of the Service.",
      "Our total liability for any claim is limited to the amount you paid us in the preceding 12 months.",
    ],
  },
  {
    id: "termination",
    icon: Gavel,
    title: "Termination",
    body: [
      "You may delete your account at any time from Settings. We may suspend or terminate accounts for violations of these Terms.",
      "Upon termination, your right to use the Service ends. Certain provisions (IP, liability, dispute resolution) survive termination.",
    ],
  },
  {
    id: "changes",
    icon: RefreshCw,
    title: "Changes to Terms",
    body: [
      "We may modify these Terms at any time. Material changes will be communicated via email or in-app notice at least 14 days before they take effect.",
      "Your continued use of the Service after changes take effect constitutes acceptance.",
    ],
  },
  {
    id: "contact",
    icon: Mail,
    title: "Contact",
    body: [
      "Questions about these Terms? Reach our legal team at <a href='mailto:legal@munplatform.app' class='text-primary underline'>legal@munplatform.app</a> or via the <a href='/contact' class='text-primary underline'>Contact page</a>.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="relative min-h-screen">
      {/* Ambient bg */}
      <div className="fixed inset-0 -z-10 bg-background">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] opacity-20 bg-primary blur-[140px] rounded-full" />
        <div className="absolute top-[60%] right-0 w-[500px] h-[500px] opacity-15 bg-purple-500 blur-[140px] rounded-full" />
      </div>

      {/* HERO */}
      <section className="relative pt-20 md:pt-28 pb-16">
        <div className="container mx-auto px-4 md:px-6 max-w-5xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-6"
          >
            <Scale className="h-3.5 w-3.5" />
            Legal · Terms of Service
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl md:text-6xl font-bold tracking-tight"
          >
            Terms of <span className="text-gradient">Service</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-5 text-muted-foreground md:text-lg max-w-2xl mx-auto"
          >
            The rules of engagement for delegates, chairs, and organizers using
            MUN Platform. Read carefully — using the Service means you agree.
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

      {/* CONTENT */}
      <section className="relative pb-24">
        <div className="container mx-auto px-4 md:px-6 max-w-6xl">
          <div className="grid lg:grid-cols-[240px_1fr] gap-10">
            {/* TOC */}
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
                    {s.title}
                  </a>
                ))}
              </div>
            </aside>

            {/* Sections */}
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
                    <div className="absolute -inset-px rounded-3xl bg-gradient-to-br from-primary/10 via-transparent to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity blur-sm pointer-events-none" />
                    <div className="relative flex items-start gap-4 mb-4">
                      <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 ring-1 ring-primary/30 flex items-center justify-center shrink-0">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {String(i + 1).padStart(2, "0")}
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight">
                          {s.title}
                        </h2>
                      </div>
                    </div>
                    <div className="relative space-y-3 text-muted-foreground leading-relaxed pl-0 md:pl-[60px]">
                      {s.body.map((p, j) => (
                        <p key={j} dangerouslySetInnerHTML={{ __html: p }} />
                      ))}
                    </div>
                  </motion.section>
                );
              })}

              {/* Footer CTA */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mt-10 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-purple-500/10 p-8 text-center"
              >
                <h3 className="text-2xl font-bold mb-2">Questions remain?</h3>
                <p className="text-muted-foreground mb-5">
                  Our legal team is happy to clarify anything in plain language.
                </p>
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-6 py-2.5 text-sm font-semibold shadow-lg shadow-primary/10 hover:shadow-primary/10 transition-shadow"
                >
                  Contact Us
                </Link>
              </motion.div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
