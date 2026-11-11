"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { marked } from "marked";
import {
  MapPin, Globe, MessageSquare, UserPlus, UserCheck, Star, BadgeCheck, Briefcase,
  GraduationCap, Trophy, Mail, Phone, Loader2, Users, CalendarDays, FileText,
} from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { UserProfile, getUserContact } from "@/lib/services/userService";
import { getUserAchievements, DelegateResult, AwardType } from "@/lib/services/resultService";
import { createOrGetDirectConversation } from "@/lib/services/messageService";
import { connectManually } from "@/lib/services/connectionService";
import { checkEligibility, getMyRatingFor, rateUser } from "@/lib/services/reputationService";
import { Reveal, SectionCard, StarDisplay } from "./_shared";
import { SkillsSection } from "./SkillsSection";
import { RecommendationsSection } from "./RecommendationsSection";
import { PeopleYouMayKnow, SuggestedConferences } from "./SuggestionsRail";
import { RateDialog } from "./RateRecommendDialogs";

const InstagramIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);
const LinkedinIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect width="4" height="12" x="2" y="9" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);
const TiktokIcon = ({ className }: { className?: string }) => (
  <span className={cn("font-bold text-sm leading-none", className)}>T</span>
);

const AWARD_LABEL: Record<AwardType, string> = {
  best_delegate: "Best Delegate",
  outstanding: "Outstanding Delegate",
  honorable: "Honorable Mention",
  verbal_mention: "Verbal Mention",
  none: "Participant",
};

function StatItem({ icon: Icon, value, label, bordered }: { icon: React.ElementType; value: number; label: string; bordered?: boolean }) {
  return (
    <div className={cn("flex items-start gap-3 p-2", bordered && "border-l border-border/50")}>
      <Icon className="w-5 h-5 text-muted-foreground mt-0.5" />
      <div>
        <div className="text-xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground font-medium">{label}</div>
      </div>
    </div>
  );
}

/** Render markdown bio to sanitized HTML (same pattern as ProfileView). */
function bioHtml(md: string): string {
  const html = marked.parse(md || "", { async: false }) as string;
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
}

/**
 * Read-only, LinkedIn-style public profile shown when a delegate visits SOMEONE
 * ELSE's profile (/dashboard/profile/[uid]). Distinct from the owner-editable
 * ProfileView used inside Settings. Actions available to the viewer: Message,
 * Connect, Rate — plus Endorse (in Skills) and Recommend (in Recommendations)
 * when eligible (connected or shared a conference).
 */
export function PublicProfileView({ profile }: { profile: UserProfile }) {
  const { user, profile: myProfile } = useAuth();
  const router = useRouter();
  const uid = profile.uid;

  const [achievements, setAchievements] = useState<(DelegateResult & { eventId?: string })[]>([]);
  const [connections, setConnections] = useState(0);
  const [eligible, setEligible] = useState(false);
  const [myRating, setMyRating] = useState(0);
  const [connected, setConnected] = useState(false);

  const [showRate, setShowRate] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // local mirror so optimistic rating updates reflect immediately
  const [p, setP] = useState(profile);
  useEffect(() => setP(profile), [profile]);

  // Email and phone are in users/{uid}/private/contact; the rules only return them when their
  // owner's contactVisibility lets this viewer see them.
  useEffect(() => {
    let alive = true;
    getUserContact(profile.uid).then((c) => {
      if (alive) setP((cur) => ({ ...cur, email: c?.email || "", phoneNumber: c?.phoneNumber || "" }));
    });
    return () => { alive = false; };
  }, [profile.uid]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [achv, myConn] = await Promise.all([
        getUserAchievements(uid).catch(() => [] as (DelegateResult & { eventId?: string })[]),
        user ? getDoc(doc(db, "users", user.uid, "connections", uid)).catch(() => null) : Promise.resolve(null),
      ]);
      if (!alive) return;
      setAchievements(achv);
      setConnected(!!myConn?.exists());

      // viewer-specific: eligibility + my existing rating
      if (user && user.uid !== uid) {
        const [el, mine] = await Promise.all([
          checkEligibility(uid),
          getMyRatingFor(user.uid, uid),
        ]);
        if (!alive) return;
        setEligible(!!el.eligible);
        setMyRating(mine?.stars || 0);
      }
    })();
    return () => { alive = false; };
  }, [uid, user]);

  // connection count (target's own connections subcollection)
  useEffect(() => {
    let alive = true;
    (async () => {
      const { getDocs, collection } = await import("firebase/firestore");
      const snap = await getDocs(collection(db, "users", uid, "connections")).catch(() => null);
      if (alive && snap) setConnections(snap.size);
    })();
    return () => { alive = false; };
  }, [uid]);

  // MUN Stats — shown only when the owner opted in. Counts are denormalized onto the
  // user doc by the owner's own profile view (visitors can't query applications/articles).
  const showStats = !!p.privacySettings?.showStats && !!p.publicStats;
  const stats = p.publicStats ?? { conferences: 0, blogs: 0, awards: 0 };

  const fullName = p.displayName || `${p.firstName || ""} ${p.lastName || ""}`.trim() || p.email || "Delegate";
  const initial = fullName.charAt(0).toUpperCase();
  // Verified organizer: owns a Pro event (server-set, eventPlan.ts). Person-level Pro is retired.
  const isPro = (p as any).verifiedOrganizer === true;
  const roleLabel = p.role && p.role.toLowerCase() !== "user" ? p.role : "Delegate";
  const ratingAvg = p.ratingCount ? (p.ratingSum || 0) / p.ratingCount : 0;
  const location = [p.city, p.country].filter(Boolean).join(", ");

  const socials = useMemo(() => ([
    p.email && { key: "email", label: "Email", value: p.email, href: `mailto:${p.email}`, icon: Mail, tint: "bg-emerald-500/10 text-emerald-600", accent: false },
    p.phoneNumber && { key: "phone", label: "Phone", value: p.phoneNumber, href: `tel:${p.phoneNumber}`, icon: Phone, tint: "bg-sky-500/10 text-sky-600", accent: false },
    p.instagram && { key: "ig", label: "Instagram", value: `@${String(p.instagram).replace(/^@/, "")}`, href: `https://instagram.com/${String(p.instagram).replace(/^@/, "")}`, icon: InstagramIcon, tint: "bg-pink-500/10 text-pink-600", accent: true },
    p.linkedin && { key: "li", label: "LinkedIn", value: String(p.linkedin).replace(/^https?:\/\/(www\.)?linkedin\.com\//, ""), href: String(p.linkedin).startsWith("http") ? p.linkedin : `https://${p.linkedin}`, icon: LinkedinIcon, tint: "bg-blue-500/10 text-blue-600", accent: true },
    p.tiktok && { key: "tt", label: "TikTok", value: `@${String(p.tiktok).replace(/^@/, "")}`, href: `https://tiktok.com/@${String(p.tiktok).replace(/^@/, "")}`, icon: TiktokIcon, tint: "bg-foreground/10 text-foreground", accent: true },
  ].filter(Boolean) as { key: string; label: string; value: string; href: string; icon: React.ElementType; tint: string; accent: boolean }[]), [p]);

  const isSelf = user?.uid === uid;

  async function handleMessage() {
    if (!user || !myProfile) return;
    setMessaging(true);
    try {
      const names = { [user.uid]: myProfile.displayName || user.email || "You", [uid]: fullName };
      const photos = { [user.uid]: myProfile.photoURL || "", [uid]: p.photoURL || "" };
      const res = await createOrGetDirectConversation(user.uid, uid, names, photos);
      router.push(`/dashboard/messages?conv=${res.id}`);
    } finally {
      setMessaging(false);
    }
  }

  async function handleConnect() {
    if (!user || !myProfile || connected) return;
    setConnecting(true);
    try {
      await connectManually(
        user.uid, uid,
        myProfile.displayName || "Delegate", myProfile.photoURL || "", myProfile.role || "user",
        fullName, p.photoURL || "", p.role || "user",
      );
      setConnected(true);
      setConnections((n) => n + 1);
    } catch (e) {
      console.error(e);
    } finally {
      setConnecting(false);
    }
  }

  async function submitRate(stars: number) {
    await rateUser(uid, stars);
    const wasNew = !myRating;
    setP((cur) => ({
      ...cur,
      ratingSum: (cur.ratingSum || 0) + (wasNew ? stars : stars - myRating),
      ratingCount: (cur.ratingCount || 0) + (wasNew ? 1 : 0),
    }));
    setMyRating(stars);
  }

  const hasAwards = achievements.length > 0 || (p.awards?.length ?? 0) > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_312px] gap-5 items-start pb-16">
      {/* ============ MAIN COLUMN ============ */}
      <div className="min-w-0 space-y-3">
        {/* ---------- HERO ---------- */}
        <Reveal>
          <section className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
            {/* cover */}
            <div className="relative h-40 sm:h-52 bg-[var(--h-slab)]">
              {p.coverURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.coverURL} alt="cover" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 opacity-[0.07] bg-[repeating-linear-gradient(135deg,#fff_0_14px,transparent_14px_28px)]" />
              )}
            </div>

            <div className="px-5 pb-6 sm:px-8">
              {/* avatar */}
              <div className="flex items-end justify-between -mt-16 mb-3">
                <div className="relative">
                  <Avatar className={cn("w-32 h-32 rounded-full border-4 border-background shadow-sm bg-background", p.openToWork && "ring-2 ring-emerald-500 ring-offset-2 ring-offset-background")}>
                    <AvatarImage src={p.photoURL || ""} className="object-cover" alt={fullName} />
                    <AvatarFallback className="text-4xl font-bold bg-primary/10 text-primary">{initial}</AvatarFallback>
                  </Avatar>
                  {p.openToWork && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-background bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold text-white">
                      OPEN TO DELEGATE
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {/* name */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight">{fullName}</h1>
                    {isPro && (
                      <span title="Verified organizer" className="inline-flex items-center justify-center">
                        <BadgeCheck className="w-5 h-5 text-primary" />
                      </span>
                    )}
                  </div>

                  {/* headline */}
                  {p.headline && (
                    <p className="mt-1.5 text-[15px] text-foreground/80 leading-relaxed max-w-xl">{p.headline}</p>
                  )}

                  {/* meta row */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
                    <Badge variant="outline" className="capitalize text-primary border-primary/20 bg-primary/5">{roleLabel}</Badge>
                    {ratingAvg > 0 && <StarDisplay value={ratingAvg} count={p.ratingCount} />}
                    {location && (
                      <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {location}</span>
                    )}
                    {p.nationality && (
                      <span className="flex items-center gap-1"><Globe className="w-4 h-4" /> {p.nationality}</span>
                    )}
                    <a href="#contact" className="font-medium text-primary hover:underline">Contact info</a>
                  </div>

                  {connections > 0 && (
                    <p className="mt-2 text-sm">
                      <span className="font-semibold text-foreground">{connections}</span>
                      <span className="text-muted-foreground"> connection{connections === 1 ? "" : "s"}</span>
                    </p>
                  )}

                  {/* actions */}
                  {!isSelf && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                        <Button onClick={handleMessage} disabled={messaging} className="gap-1.5 rounded-full">
                          {messaging ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />} Message
                        </Button>
                      </motion.div>
                      <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                        <Button
                          variant="outline"
                          onClick={handleConnect}
                          disabled={connecting || connected}
                          className="gap-1.5 rounded-full"
                        >
                          {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : connected ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                          {connected ? "Connected" : "Connect"}
                        </Button>
                      </motion.div>
                      {eligible && (
                        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                          <Button variant="outline" onClick={() => setShowRate(true)} className="gap-1.5 rounded-full">
                            <Star className={cn("w-4 h-4", myRating && "text-amber-400 fill-amber-400")} />
                            {myRating ? "Update rating" : "Rate"}
                          </Button>
                        </motion.div>
                      )}
                    </div>
                  )}
                </div>

                {/* affiliation */}
                {p.institution && (
                  <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:text-right shrink-0 sm:max-w-[200px]">
                    <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center shrink-0">
                      <GraduationCap className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <span className="text-sm font-medium text-foreground/80 leading-tight">{p.institution}</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        </Reveal>

        {/* ---------- OPEN-TO BANNER ---------- */}
        {p.openToWork && p.openToRoles && (
          <Reveal delay={0.04}>
            <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                <Briefcase className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-foreground">Open to delegate &amp; chair invitations</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{p.openToRoles}</p>
              </div>
            </section>
          </Reveal>
        )}

        {/* ---------- MUN STATS (public, opt-in) ---------- */}
        {showStats && (
          <Reveal delay={0.05}>
            <SectionCard title="MUN Stats">
              <div className="grid grid-cols-3 gap-2">
                <StatItem icon={CalendarDays} value={stats.conferences} label="Conferences" />
                <StatItem icon={FileText} value={stats.blogs} label="Blogs" bordered />
                <StatItem icon={Trophy} value={stats.awards} label="Awards" bordered />
              </div>
            </SectionCard>
          </Reveal>
        )}

        {/* ---------- ABOUT ---------- */}
        {(p.bio || (p.skills?.length ?? 0) > 0) && (
          <Reveal delay={0.06}>
            <SectionCard title="About">
              {p.bio ? (
                <div className="markdown-content text-foreground/80 text-[15px] leading-relaxed" dangerouslySetInnerHTML={{ __html: bioHtml(p.bio) }} />
              ) : (
                <p className="text-sm text-muted-foreground italic">No bio yet.</p>
              )}
              {(p.skills?.length ?? 0) > 0 && (
                <div className="mt-4 pt-4 border-t border-border/50 flex flex-wrap gap-2">
                  {(p.skills || []).slice(0, 8).map((s) => (
                    <span key={s} className="text-[13px] font-medium text-foreground/75 bg-secondary rounded-full px-3 py-1.5">{s}</span>
                  ))}
                  {(p.skills?.length ?? 0) > 8 && (
                    <span className="text-[13px] font-medium text-muted-foreground bg-secondary rounded-full px-3 py-1.5">+{(p.skills!.length - 8)} more</span>
                  )}
                </div>
              )}
            </SectionCard>
          </Reveal>
        )}

        {/* ---------- EXPERIENCE ---------- */}
        {(p.experience?.length ?? 0) > 0 && (
          <Reveal delay={0.08}>
            <SectionCard title="MUN Experience">
              <div className="flex flex-col divide-y divide-border/50">
                {p.experience!.map((ex) => (
                  <div key={ex.id} className="flex gap-3.5 py-4 first:pt-0 last:pb-0">
                    <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center font-bold text-sm text-primary shrink-0">
                      {(ex.orgShort || ex.org || "?").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[15px] leading-tight">{ex.roleTitle}</p>
                      {ex.org && <p className="text-sm text-foreground/70">{ex.org}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[ex.startDate, ex.current ? "Present" : ex.endDate].filter(Boolean).join(" – ")}
                        {ex.location ? ` · ${ex.location}` : ""}
                      </p>
                      {ex.description && <p className="text-sm text-foreground/75 mt-1.5 leading-relaxed">{ex.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </Reveal>
        )}

        {/* ---------- HONORS & AWARDS ---------- */}
        {hasAwards && (
          <Reveal delay={0.1}>
            <SectionCard title="Honors & Awards">
              <div className="flex flex-col divide-y divide-border/50">
                {achievements.map((a) => (
                  <div key={`r-${a.id}`} className="flex items-center gap-3.5 py-3 first:pt-0">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                      <Trophy className="w-5 h-5 text-amber-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-[15px] leading-tight">{AWARD_LABEL[a.awardType]} — {a.committeeName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">MUN result · verified</p>
                    </div>
                  </div>
                ))}
                {(p.awards || []).map((a) => (
                  <div key={`m-${a.id}`} className="flex items-center gap-3.5 py-3 first:pt-0">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                      <Trophy className="w-5 h-5 text-amber-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-[15px] leading-tight">{a.title}</p>
                      {(a.issuer || a.date) && (
                        <p className="text-xs text-muted-foreground mt-0.5">{[a.issuer, a.date].filter(Boolean).join(" · ")}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </Reveal>
        )}

        {/* ---------- EDUCATION ---------- */}
        {(p.education?.length ?? 0) > 0 && (
          <Reveal delay={0.12}>
            <SectionCard title="Education">
              <div className="flex flex-col divide-y divide-border/50">
                {p.education!.map((ed) => (
                  <div key={ed.id} className="flex gap-3.5 py-4 first:pt-0 last:pb-0">
                    <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                      <GraduationCap className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-[15px] leading-tight">{ed.school}</p>
                      {(ed.degree || ed.field) && <p className="text-sm text-foreground/70">{[ed.degree, ed.field].filter(Boolean).join(", ")}</p>}
                      {(ed.startYear || ed.endYear) && <p className="text-xs text-muted-foreground mt-0.5">{[ed.startYear, ed.endYear].filter(Boolean).join(" – ")}</p>}
                      {ed.activities && <p className="text-sm text-foreground/75 mt-1"><span className="font-medium">Activities:</span> {ed.activities}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </Reveal>
        )}

        {/* ---------- SKILLS & ENDORSEMENTS ---------- */}
        <Reveal delay={0.14}>
          <SkillsSection
            profile={p}
            editable={false}
            viewerUid={user?.uid}
            canEndorse={eligible}
            onSave={async () => {}}
          />
        </Reveal>

        {/* ---------- RECOMMENDATIONS ---------- */}
        <Reveal delay={0.16}>
          <RecommendationsSection
            ownerUid={uid}
            ownerName={fullName}
            editable={false}
            canRecommend={eligible}
          />
        </Reveal>

        {/* ---------- CONTACT & SOCIAL ---------- */}
        <Reveal delay={0.18}>
          <SectionCard title="Contact & Social" id="contact">
            <div className="grid sm:grid-cols-2 gap-3">
              {socials.map((s) => {
                const Icon = s.icon;
                const inner = (
                  <>
                    <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", s.tint)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground block leading-tight">{s.label}</span>
                      <span className={cn("text-sm font-medium truncate block", s.accent && "text-primary")}>{s.value}</span>
                    </div>
                  </>
                );
                return s.accent || s.key === "email" || s.key === "phone" ? (
                  <a key={s.key} href={s.href} target={s.accent ? "_blank" : undefined} rel="noopener noreferrer" className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary transition-colors">
                    {inner}
                  </a>
                ) : (
                  <div key={s.key} className="flex items-center gap-3 p-2 rounded-lg">{inner}</div>
                );
              })}
            </div>
          </SectionCard>
        </Reveal>
      </div>

      {/* ============ RIGHT RAIL ============ */}
      <aside className="hidden lg:flex flex-col gap-3 lg:sticky lg:top-4">
        {user && !isSelf && (
          <Reveal delay={0.08}>
            <PeopleYouMayKnow ownerUid={user.uid} />
          </Reveal>
        )}
        <Reveal delay={0.1}>
          <SuggestedConferences />
        </Reveal>
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 text-xs text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground">Home</Link>
          <Link href="/dashboard/network" className="hover:text-foreground">Network</Link>
          <Link href="/dashboard/conferences" className="hover:text-foreground">Events</Link>
          <span className="w-full mt-1 flex items-center gap-1"><Users className="w-3 h-3" /> MUN Platform © 2026</span>
        </div>
      </aside>

      {/* ---------- Rate dialog ---------- */}
      {showRate && !isSelf && (
        <RateDialog targetName={fullName} initialStars={myRating} onSubmit={submitRate} onClose={() => setShowRate(false)} />
      )}
    </div>
  );
}
