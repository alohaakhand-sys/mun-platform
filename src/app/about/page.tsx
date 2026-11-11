"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowRight,
  Compass,
  Heart,
  Globe2,
  Rocket,
  Award,
  Users,
  Sparkles,
  Target,
  Zap,
  Shield,
} from "lucide-react";

const VALUES = [
  {
    icon: Compass,
    title: "Diplomacy first",
    desc: "Every feature is shaped by real delegates, chairs, and organizers — never by guesswork.",
    color: "from-sky-500/20 to-blue-500/5",
    ring: "ring-sky-500/30",
    text: "text-sky-500",
  },
  {
    icon: Heart,
    title: "Craft over scale",
    desc: "We&apos;d rather ship one polished feature than ten half-baked ones.",
    color: "from-rose-500/20 to-pink-500/5",
    ring: "ring-rose-500/30",
    text: "text-rose-500",
  },
  {
    icon: Shield,
    title: "Trust by default",
    desc: "Privacy, security, and transparency aren&apos;t add-ons. They&apos;re the foundation.",
    color: "from-emerald-500/20 to-teal-500/5",
    ring: "ring-emerald-500/30",
    text: "text-emerald-500",
  },
  {
    icon: Zap,
    title: "Move with purpose",
    desc: "Fast where speed matters. Slow where craft matters. Always intentional.",
    color: "from-amber-500/20 to-orange-500/5",
    ring: "ring-amber-500/30",
    text: "text-amber-500",
  },
];

const TIMELINE = [
  { year: "2023", title: "First gavel", desc: "Founder team meets at a university MUN — frustrated by spreadsheets and broken portals." },
  { year: "2024", title: "Private beta", desc: "Six pilot conferences. 800 delegates. First chair tools shipped." },
  { year: "2025", title: "Public launch", desc: "Self-serve organizer suite, ticketing, allocations, position papers." },
  { year: "2026", title: "Global rollout", desc: "12K+ delegates across 85 countries. Pro tier and AI assignments shipping." },
];

const STATS = [
  { value: "12K+", label: "Active delegates", icon: Users },
  { value: "340+", label: "Conferences run", icon: Award },
  { value: "85", label: "Countries served", icon: Globe2 },
  { value: "99.9%", label: "Platform uptime", icon: Rocket },
];

const TEAM = [
  { name: "Shuvo", role: "Founder & Engineer", grad: "from-primary to-purple-500" },
  { name: "Ari", role: "Design Lead", grad: "from-sky-500 to-cyan-500" },
  { name: "Mira", role: "Head of Delegate Success", grad: "from-rose-500 to-pink-500" },
  { name: "Kenji", role: "Chair Tools", grad: "from-emerald-500 to-teal-500" },
  { name: "Lara", role: "Organizer Partnerships", grad: "from-amber-500 to-orange-500" },
  { name: "Yusuf", role: "Infrastructure", grad: "from-indigo-500 to-violet-500" },
];

export default function AboutPage() {
  return (
    <div className="relative overflow-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 -z-10 bg-background">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1100px] h-[600px] opacity-25 bg-primary blur-[140px] rounded-full" />
        <div className="absolute top-[40%] right-0 w-[600px] h-[600px] opacity-20 bg-purple-500 blur-[140px] rounded-full" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[400px] opacity-15 bg-sky-500 blur-[140px] rounded-full" />
      </div>

      {/* HERO */}
      <section className="relative pt-20 md:pt-32 pb-20">
        <div className="container mx-auto px-4 md:px-6 max-w-6xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-6"
          >
            <Sparkles className="h-3.5 w-3.5" />
            About MUN Platform
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05]"
          >
            We&apos;re building the{" "}
            <span className="text-gradient">operating system</span> for Model UN
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mt-6 max-w-2xl mx-auto text-muted-foreground md:text-xl leading-relaxed"
          >
            One workspace where delegates discover conferences, chairs run debate,
            and organizers orchestrate the world&apos;s most ambitious MUN events.
          </motion.p>

          {/* Floating chips */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-12 flex flex-wrap items-center justify-center gap-3"
          >
            {["Built by delegates", "Trusted by 340+ conferences", "Open roadmap", "Privacy-first"].map((c, i) => (
              <motion.span
                key={c}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 + i * 0.08 }}
                className="rounded-full border border-border/60 bg-background/60 backdrop-blur px-4 py-1.5 text-sm text-muted-foreground"
              >
                {c}
              </motion.span>
            ))}
          </motion.div>
        </div>
      </section>

      {/* STATS */}
      <section className="relative pb-20">
        <div className="container mx-auto px-4 md:px-6 max-w-6xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {STATS.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="glass-card rounded-2xl p-5 md:p-6 text-center group hover:border-primary/30 transition-colors"
                >
                  <Icon className="h-5 w-5 mx-auto text-primary mb-3 group-hover:scale-110 transition-transform" />
                  <div className="text-3xl md:text-4xl font-bold text-gradient">{s.value}</div>
                  <div className="text-xs md:text-sm text-muted-foreground mt-1 uppercase tracking-wider">
                    {s.label}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* MISSION */}
      <section className="relative py-20 border-y border-border/40 bg-background/40 backdrop-blur-xl">
        <div className="container mx-auto px-4 md:px-6 max-w-5xl">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground mb-4">
                <Target className="h-3.5 w-3.5 text-primary" />
                Our Mission
              </div>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-5">
                Make great MUN <span className="text-gradient">accessible everywhere</span>
              </h2>
              <p className="text-muted-foreground md:text-lg leading-relaxed">
                Model UN should not be gatekept by tooling. We&apos;re building
                infrastructure so any school, university, or independent organizer
                can run a world-class conference — and any delegate, from anywhere,
                can find their next debate.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/events"
                  className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold shadow-lg shadow-primary/10 hover:shadow-primary/10 transition-shadow group"
                >
                  Explore conferences
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 backdrop-blur px-5 py-2.5 text-sm font-semibold hover:border-primary/40 transition-colors"
                >
                  Talk to us
                </Link>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="relative"
            >
              <div className="absolute -inset-4 bg-gradient-to-tr from-primary/30 via-indigo-500/20 to-purple-500/30 rounded-[2rem] blur-2xl opacity-70" />
              <div className="relative glass-card rounded-3xl p-8 border border-white/10">
                <div className="space-y-5">
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-sky-500/30 to-blue-500/30 ring-1 ring-sky-500/40 flex items-center justify-center shrink-0">
                      <Globe2 className="h-6 w-6 text-sky-400" />
                    </div>
                    <div>
                      <div className="font-semibold">Global reach</div>
                      <p className="text-sm text-muted-foreground">From Dhaka to Buenos Aires — one platform.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500/30 to-purple-500/30 ring-1 ring-violet-500/40 flex items-center justify-center shrink-0">
                      <Sparkles className="h-6 w-6 text-violet-400" />
                    </div>
                    <div>
                      <div className="font-semibold">Built with delegates</div>
                      <p className="text-sm text-muted-foreground">Every feature road-tested at real conferences.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-500/30 to-teal-500/30 ring-1 ring-emerald-500/40 flex items-center justify-center shrink-0">
                      <Shield className="h-6 w-6 text-emerald-400" />
                    </div>
                    <div>
                      <div className="font-semibold">Privacy as a principle</div>
                      <p className="text-sm text-muted-foreground">Your data is never sold. Period.</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* VALUES */}
      <section className="relative py-24">
        <div className="container mx-auto px-4 md:px-6 max-w-6xl">
          <div className="text-center mb-14">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-4xl md:text-5xl font-bold tracking-tight"
            >
              What we <span className="text-gradient">stand for</span>
            </motion.h2>
            <p className="mt-4 text-muted-foreground md:text-lg max-w-2xl mx-auto">
              Four principles that shape every decision we make.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {VALUES.map((v, i) => {
              const Icon = v.icon;
              return (
                <motion.div
                  key={v.title}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  whileHover={{ y: -4 }}
                  className="group relative glass-card rounded-3xl p-7 cursor-default"
                >
                  <div
                    className={`absolute -inset-px rounded-3xl bg-gradient-to-br ${v.color} opacity-60 group-hover:opacity-100 transition-opacity blur-sm pointer-events-none`}
                  />
                  <div className="relative">
                    <div
                      className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${v.color} ring-1 ${v.ring} flex items-center justify-center mb-4`}
                    >
                      <Icon className={`h-6 w-6 ${v.text}`} />
                    </div>
                    <h3 className="text-xl font-bold mb-2">{v.title}</h3>
                    <p
                      className="text-sm text-muted-foreground leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: v.desc }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* TIMELINE */}
      <section className="relative py-24 border-t border-border/40 bg-background/40 backdrop-blur-xl">
        <div className="container mx-auto px-4 md:px-6 max-w-5xl">
          <div className="text-center mb-16">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-4xl md:text-5xl font-bold tracking-tight"
            >
              The <span className="text-gradient">journey</span>
            </motion.h2>
          </div>

          <div className="relative">
            <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-primary/40 to-transparent md:-translate-x-px" />
            <div className="space-y-10">
              {TIMELINE.map((t, i) => {
                const isLeft = i % 2 === 0;
                return (
                  <motion.div
                    key={t.year}
                    initial={{ opacity: 0, x: isLeft ? -30 : 30 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className={`relative flex md:items-center gap-6 ${
                      isLeft ? "md:flex-row" : "md:flex-row-reverse"
                    }`}
                  >
                    <div className="absolute left-4 md:left-1/2 top-3 -translate-x-1/2 h-3 w-3 rounded-full bg-primary ring-4 ring-background shadow-lg shadow-primary/10" />
                    <div className="pl-12 md:pl-0 md:w-1/2">
                      <div
                        className={`glass-card rounded-2xl p-6 ${
                          isLeft ? "md:mr-8 md:text-right" : "md:ml-8"
                        }`}
                      >
                        <div className="text-xs font-mono text-primary font-semibold mb-1">
                          {t.year}
                        </div>
                        <h3 className="text-xl font-bold mb-2">{t.title}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {t.desc}
                        </p>
                      </div>
                    </div>
                    <div className="hidden md:block md:w-1/2" />
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* TEAM */}
      <section id="careers" className="relative py-24">
        <div className="container mx-auto px-4 md:px-6 max-w-6xl">
          <div className="text-center mb-14">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-4xl md:text-5xl font-bold tracking-tight"
            >
              The <span className="text-gradient">crew</span>
            </motion.h2>
            <p className="mt-4 text-muted-foreground md:text-lg max-w-2xl mx-auto">
              A small, senior team of ex-delegates and engineers — distributed across five timezones.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
            {TEAM.map((m, i) => (
              <motion.div
                key={m.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                whileHover={{ y: -4 }}
                className="glass-card rounded-3xl p-6 text-center"
              >
                <div
                  className={`h-20 w-20 mx-auto rounded-2xl bg-gradient-to-br ${m.grad} flex items-center justify-center text-2xl font-bold text-white shadow-lg mb-4`}
                >
                  {m.name.charAt(0)}
                </div>
                <div className="font-semibold">{m.name}</div>
                <div className="text-xs text-muted-foreground">{m.role}</div>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-12 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-purple-500/10 p-8 md:p-10 text-center"
          >
            <h3 className="text-2xl md:text-3xl font-bold mb-2">Want to join the crew?</h3>
            <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
              We hire diplomats first, engineers second. If you&apos;ve gaveled a committee and shipped code, we want to talk.
            </p>
            <Link
              href="mailto:careers@munplatform.app"
              className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-6 py-3 text-sm font-semibold shadow-lg shadow-primary/10 hover:shadow-primary/10 transition-shadow group"
            >
              See open roles
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
