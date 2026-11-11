"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import Link from "next/link";
import {
  Mail,
  MessageCircle,
  HelpCircle,
  Building2,
  Send,
  MapPin,
  Phone,
  Clock,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  AtSign,
  Briefcase,
  Code2,
  Camera,
} from "lucide-react";

const CHANNELS = [
  {
    icon: HelpCircle,
    title: "Help & Support",
    desc: "Trouble with your account, applications, or payments?",
    email: "support@munplatform.app",
    tint: "from-sky-500/20 to-blue-500/5",
    ring: "ring-sky-500/30",
    text: "text-sky-500",
    badge: "Avg. reply: 4 hrs",
  },
  {
    icon: Building2,
    title: "Conference Organizers",
    desc: "Run a conference? Pro plans, custom rollouts, partnerships.",
    email: "organizers@munplatform.app",
    tint: "from-violet-500/20 to-fuchsia-500/5",
    ring: "ring-violet-500/30",
    text: "text-violet-500",
    badge: "Avg. reply: same day",
  },
  {
    icon: MessageCircle,
    title: "Press & Media",
    desc: "Stories, quotes, interviews, press kit requests.",
    email: "press@munplatform.app",
    tint: "from-amber-500/20 to-orange-500/5",
    ring: "ring-amber-500/30",
    text: "text-amber-500",
    badge: "Press kit available",
  },
  {
    icon: Mail,
    title: "General Inquiries",
    desc: "Anything else? We read every email.",
    email: "hello@munplatform.app",
    tint: "from-emerald-500/20 to-teal-500/5",
    ring: "ring-emerald-500/30",
    text: "text-emerald-500",
    badge: "Personal reply",
  },
];

const FAQS = [
  {
    q: "How fast do you reply to support tickets?",
    a: "Average first response is under 4 hours during business hours (Mon–Fri, 9am–7pm GMT+6). Critical issues during live conferences are triaged within 30 minutes.",
  },
  {
    q: "Do you offer custom plans for large conferences?",
    a: "Yes. Conferences over 500 delegates qualify for our Enterprise tier with dedicated onboarding, SLA, and a signed DPA. Reach out to organizers@munplatform.app.",
  },
  {
    q: "Can I report a security vulnerability?",
    a: "Absolutely. Please email security@munplatform.app with details. We acknowledge reports within 24 hours and have a responsible-disclosure program.",
  },
  {
    q: "Where can I find press kit assets?",
    a: "Email press@munplatform.app and we&apos;ll send logos, screenshots, and founder bios within one business day.",
  },
];

const SOCIALS = [
  { icon: AtSign, label: "Twitter", href: "https://twitter.com" },
  { icon: Camera, label: "Instagram", href: "https://instagram.com" },
  { icon: Briefcase, label: "LinkedIn", href: "https://linkedin.com" },
  { icon: Code2, label: "GitHub", href: "https://github.com" },
];

export default function ContactPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    topic: "general",
    message: "",
  });
  const [sent, setSent] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.message) return;
    setSent(true);
    setForm({ name: "", email: "", topic: "general", message: "" });
    setTimeout(() => setSent(false), 4500);
  };

  return (
    <div className="relative overflow-hidden">
      {/* Ambient bg */}
      <div className="fixed inset-0 -z-10 bg-background">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1100px] h-[600px] opacity-25 bg-primary blur-[140px] rounded-full" />
        <div className="absolute top-[40%] right-0 w-[600px] h-[600px] opacity-20 bg-purple-500 blur-[140px] rounded-full" />
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
            <Sparkles className="h-3.5 w-3.5" />
            We&apos;d love to hear from you
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05]"
          >
            Get in <span className="text-gradient">touch</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mt-6 max-w-2xl mx-auto text-muted-foreground md:text-xl leading-relaxed"
          >
            Questions, partnerships, press, or just to say hi — pick a channel
            below or drop us a message. A human always replies.
          </motion.p>
        </div>
      </section>

      {/* CHANNELS */}
      <section className="relative pb-20">
        <div className="container mx-auto px-4 md:px-6 max-w-6xl">
          <div className="grid sm:grid-cols-2 gap-5">
            {CHANNELS.map((c, i) => {
              const Icon = c.icon;
              return (
                <motion.a
                  key={c.title}
                  href={`mailto:${c.email}`}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  whileHover={{ y: -4 }}
                  className="group relative glass-card rounded-3xl p-6 md:p-7 block"
                >
                  <div
                    className={`absolute -inset-px rounded-3xl bg-gradient-to-br ${c.tint} opacity-60 group-hover:opacity-100 transition-opacity blur-sm pointer-events-none`}
                  />
                  <div className="relative flex items-start gap-4">
                    <div
                      className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${c.tint} ring-1 ${c.ring} flex items-center justify-center shrink-0`}
                    >
                      <Icon className={`h-6 w-6 ${c.text}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <h3 className="text-lg font-bold">{c.title}</h3>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono shrink-0">
                          {c.badge}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                        {c.desc}
                      </p>
                      <div className={`inline-flex items-center gap-1.5 text-sm font-medium ${c.text} group-hover:gap-2.5 transition-all`}>
                        {c.email}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  </div>
                </motion.a>
              );
            })}
          </div>
        </div>
      </section>

      {/* FORM + SIDEBAR */}
      <section className="relative py-20 border-y border-border/40 bg-background/40 backdrop-blur-xl">
        <div className="container mx-auto px-4 md:px-6 max-w-6xl">
          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-10">
            {/* FORM */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="relative glass-card rounded-3xl p-7 md:p-10"
            >
              <div className="absolute -inset-px rounded-3xl bg-gradient-to-br from-primary/10 via-transparent to-purple-500/10 opacity-60 blur-sm pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <Send className="h-5 w-5 text-primary" />
                  <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
                    Send us a message
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground mb-6">
                  We typically reply within one business day.
                </p>

                <form onSubmit={onSubmit} className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                        Your name
                      </label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="Jane Delegate"
                        className="w-full rounded-xl border border-border/60 bg-background/60 backdrop-blur px-4 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                        Email
                      </label>
                      <input
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="jane@example.com"
                        className="w-full rounded-xl border border-border/60 bg-background/60 backdrop-blur px-4 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                      Topic
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: "general", label: "General" },
                        { id: "support", label: "Support" },
                        { id: "organizer", label: "Organizer" },
                        { id: "press", label: "Press" },
                      ].map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setForm({ ...form, topic: t.id })}
                          className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-all ${
                            form.topic === t.id
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/60 bg-background/60 text-muted-foreground hover:border-primary/40"
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                      Message
                    </label>
                    <textarea
                      required
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      placeholder="Tell us what&apos;s on your mind..."
                      rows={6}
                      className="w-full rounded-xl border border-border/60 bg-background/60 backdrop-blur px-4 py-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    {sent ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="inline-flex items-center gap-2 text-emerald-500 text-sm font-medium"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Thanks! We&apos;ll reply within one business day.
                      </motion.div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        By submitting, you agree to our{" "}
                        <Link href="/privacy" className="text-primary underline">
                          Privacy Policy
                        </Link>
                        .
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={sent}
                      className="group inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-6 py-3 text-sm font-semibold shadow-lg shadow-primary/10 hover:shadow-primary/10 transition-shadow disabled:opacity-60"
                    >
                      Send message
                      <Send className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>

            {/* SIDEBAR */}
            <div className="space-y-5">
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-card rounded-3xl p-6 space-y-5"
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center shrink-0">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                      Headquarters
                    </div>
                    <div className="font-semibold">Dhaka, Bangladesh</div>
                    <div className="text-sm text-muted-foreground">Remote-first · 5 timezones</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-violet-500/15 ring-1 ring-violet-500/30 flex items-center justify-center shrink-0">
                    <Phone className="h-5 w-5 text-violet-500" />
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                      Enterprise sales
                    </div>
                    <a
                      href="tel:+8801000000000"
                      className="font-semibold hover:text-primary transition-colors block"
                    >
                      +880 1000 000000
                    </a>
                    <div className="text-sm text-muted-foreground">Mon–Fri, business hours</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/30 flex items-center justify-center shrink-0">
                    <Clock className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                      Response time
                    </div>
                    <div className="font-semibold">Under 4 hours</div>
                    <div className="text-sm text-muted-foreground">During business hours</div>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-card rounded-3xl p-6"
              >
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
                  Follow along
                </div>
                <div className="flex flex-wrap gap-2">
                  {SOCIALS.map(({ icon: Icon, label, href }) => (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3.5 py-1.5 text-xs font-medium hover:border-primary/40 hover:text-primary transition-colors"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </a>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative py-24">
        <div className="container mx-auto px-4 md:px-6 max-w-3xl">
          <div className="text-center mb-12">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-4xl md:text-5xl font-bold tracking-tight"
            >
              Common <span className="text-gradient">questions</span>
            </motion.h2>
          </div>

          <div className="space-y-3">
            {FAQS.map((f, i) => {
              const open = openFaq === i;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-card rounded-2xl overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : i)}
                    className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-secondary/10 transition-colors"
                  >
                    <span className="font-semibold">{f.q}</span>
                    <span
                      className={`h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 transition-transform ${
                        open ? "rotate-45" : ""
                      }`}
                    >
                      +
                    </span>
                  </button>
                  <motion.div
                    initial={false}
                    animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <p
                      className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: f.a }}
                    />
                  </motion.div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
