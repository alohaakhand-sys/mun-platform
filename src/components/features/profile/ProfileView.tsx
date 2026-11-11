"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { formatDistanceToNow } from "date-fns";
import { marked } from "marked";
import {
  Pencil, Camera, MapPin, Globe, Mail, Phone, MessageSquare, Plus, Loader2,
  Trophy, GraduationCap, Briefcase, Sparkles, FileText, CalendarDays, BadgeCheck,
  Users, ArrowRight, Award, Star,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { updateUserProfile, saveMyContact, getUserContact, UserProfile } from "@/lib/services/userService";
import { getUserAchievements, DelegateResult, AwardType } from "@/lib/services/resultService";
import { ActivityData } from "@/lib/services/activityService";
import { createOrGetDirectConversation } from "@/lib/services/messageService";
import { uploadImage } from "@/lib/uploadImage";
import {
  ExperienceDialog, EducationDialog, AwardsDialog,
} from "@/components/features/profile/ProfileEditDialogs";
import { Reveal, SectionCard, StarDisplay } from "./_shared";
import { InlineText } from "./InlineEdit";
import { SkillsSection } from "./SkillsSection";
import { RecommendationsSection } from "./RecommendationsSection";
import { RateDialog } from "./RateRecommendDialogs";
import { checkEligibility, getMyRatingFor, rateUser } from "@/lib/services/reputationService";

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

const AWARD_LABEL: Record<AwardType, string> = {
  best_delegate: "Best Delegate",
  outstanding: "Outstanding Delegate",
  honorable: "Honorable Mention",
  verbal_mention: "Verbal Mention",
  none: "Participant",
};

export function ProfileView({ profile, editable, embedded }: { profile: UserProfile; editable: boolean; embedded?: boolean }) {
  const { user, profile: myProfile, refreshProfile } = useAuth();
  const router = useRouter();

  const [p, setP] = useState<UserProfile>(profile);
  // Render-phase sync so external prop changes (e.g. refreshProfile) flow in.
  const [seenProfile, setSeenProfile] = useState(profile);
  if (seenProfile !== profile) {
    setSeenProfile(profile);
    setP(profile);
  }

  const [dlg, setDlg] = useState<null | "experience" | "education" | "awards">(null);

  const avatarInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [stats, setStats] = useState({ conferences: 0, articles: 0, awards: 0 });
  const [achievements, setAchievements] = useState<(DelegateResult & { eventId?: string })[]>([]);
  const [activities, setActivities] = useState<ActivityData[]>([]);
  const [connections, setConnections] = useState(0);
  const [messaging, setMessaging] = useState(false);

  // Peer reputation (viewer perspective)
  const [eligible, setEligible] = useState(false);
  const [myRating, setMyRating] = useState(0);
  const [showRate, setShowRate] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const uid = profile.uid;

      const achv = await getUserAchievements(uid).catch(() => [] as (DelegateResult & { eventId?: string })[]);
      if (!alive) return;
      setAchievements(achv);
      setStats((s) => ({ ...s, awards: achv.length }));

      if (!editable) {
        // Viewer: fetch eligibility + my existing rating for this person.
        if (user && user.uid !== uid) {
          const [el, mine] = await Promise.all([
            checkEligibility(uid),
            getMyRatingFor(user.uid, uid),
          ]);
          if (!alive) return;
          setEligible(!!el.eligible);
          setMyRating(mine?.stars || 0);
        }
        return;
      }

      // Owner-private aggregates.
      const [conferences, articleCount, connCount] = await Promise.all([
        getDocs(query(collection(db, "applications"), where("userId", "==", uid), where("status", "==", "approved")))
          .then((sn) => sn.size).catch(() => 0),
        getDocs(query(collection(db, "articles"), where("authorId", "==", uid)))
          .then((sn) => sn.size).catch(() => 0),
        getDocs(collection(db, "users", uid, "connections")).then((sn) => sn.size).catch(() => 0),
      ]);
      if (!alive) return;
      setStats((s) => ({ ...s, conferences, articles: articleCount }));
      setConnections(connCount);

      // Persist counts to the user doc so visitors can read them (they can't query
      // the owner's applications/articles). Only write when something changed.
      const cur = profile.publicStats;
      if (!cur || cur.conferences !== conferences || cur.blogs !== articleCount || cur.awards !== achv.length) {
        updateUserProfile(uid, { publicStats: { conferences, blogs: articleCount, awards: achv.length } }).catch(() => {});
      }

      try {
        const actSnap = await getDocs(query(
          collection(db, "activities"),
          where("userId", "==", uid),
          orderBy("createdAt", "desc"),
          limit(6),
        ));
        if (!alive) return;
        setActivities(actSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ActivityData)));
      } catch {
        /* index missing → skip */
      }
    })();
    return () => { alive = false; };
  }, [profile.uid, editable, user]);

  /** Optimistic save with rollback — used by every inline field. */
  async function handleSave(patch: Partial<UserProfile>) {
    const prev = p;
    setP((cur) => ({ ...cur, ...patch }));
    try {
      await updateUserProfile(profile.uid, patch);
      if (editable) await refreshProfile();
    } catch (e) {
      setP(prev);
      throw e;
    }
  }
  const saveField = (field: keyof UserProfile) => async (v: string) => {
    await handleSave({ [field]: v } as Partial<UserProfile>);
  };
  /** Phone lives in users/{uid}/private/contact, not on the profile doc. */
  async function savePhone(v: string) {
    const prev = p;
    setP((cur) => ({ ...cur, phoneNumber: v }));
    try {
      await saveMyContact(profile.uid, { phoneNumber: v });
      if (editable) await refreshProfile();
    } catch (e) {
      setP(prev);
      throw e;
    }
  }

  // Someone else's email/phone: readable only when their contactVisibility allows it.
  useEffect(() => {
    if (editable) return;
    let alive = true;
    getUserContact(profile.uid).then((c) => {
      if (alive) setP((cur) => ({ ...cur, email: c?.email || "", phoneNumber: c?.phoneNumber || "" }));
    });
    return () => { alive = false; };
  }, [profile.uid, editable]);

  async function onPickImage(kind: "avatar" | "cover", e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const setBusy = kind === "avatar" ? setUploadingAvatar : setUploadingCover;
      setBusy(true);
      try {
        const url = await uploadImage(file, { maxBytes: kind === "avatar" ? 5 * 1024 * 1024 : 8 * 1024 * 1024 });
        await handleSave(kind === "avatar" ? { photoURL: url } : { coverURL: url });
      } catch (err) {
        console.error(err);
      } finally {
        setBusy(false);
      }
    }
    e.target.value = "";
  }

  async function handleMessage() {
    if (!user || !myProfile) return;
    setMessaging(true);
    try {
      const targetName = p.displayName || `${p.firstName || ""} ${p.lastName || ""}`.trim() || p.email || "User";
      const names = { [user.uid]: myProfile.displayName || user.email || "You", [p.uid]: targetName };
      const photos = { [user.uid]: myProfile.photoURL || "", [p.uid]: p.photoURL || "" };
      const result = await createOrGetDirectConversation(user.uid, p.uid, names, photos);
      router.push(`/dashboard/messages?conv=${result.id}`);
    } finally {
      setMessaging(false);
    }
  }

  async function submitRate(stars: number) {
    await rateUser(profile.uid, stars);
    const wasNew = !myRating;
    setP((cur) => ({
      ...cur,
      ratingSum: (cur.ratingSum || 0) + (wasNew ? stars : stars - myRating),
      ratingCount: (cur.ratingCount || 0) + (wasNew ? 1 : 0),
    }));
    setMyRating(stars);
  }

  const fullName = p.displayName || `${p.firstName || ""} ${p.lastName || ""}`.trim() || p.email || "Unknown";
  const initial = fullName.charAt(0).toUpperCase();
  // Verified organizer: owns a Pro event (server-set, eventPlan.ts). Person-level Pro is retired.
  const isPro = (p as any).verifiedOrganizer === true;
  const roleLabel = p.role && p.role.toLowerCase() !== "user" ? p.role : "Delegate";
  const ratingAvg = p.ratingCount ? (p.ratingSum || 0) / p.ratingCount : 0;

  const socials = [
    p.instagram && { key: "ig", href: `https://instagram.com/${String(p.instagram).replace(/^@/, "")}`, icon: <InstagramIcon className="w-5 h-5" />, label: "Instagram", tint: "hover:bg-pink-500 hover:border-pink-500" },
    p.linkedin && { key: "li", href: String(p.linkedin).startsWith("http") ? p.linkedin : `https://${p.linkedin}`, icon: <LinkedinIcon className="w-5 h-5" />, label: "LinkedIn", tint: "hover:bg-blue-600 hover:border-blue-600" },
    p.tiktok && { key: "tt", href: `https://tiktok.com/@${String(p.tiktok).replace(/^@/, "")}`, icon: <span className="font-bold text-sm">T</span>, label: "TikTok", tint: "hover:bg-foreground hover:border-foreground" },
  ].filter(Boolean) as { key: string; href: string; icon: React.ReactNode; label: string; tint: string }[];

  const strength = useMemo(() => computeStrength(p), [p]);

  return (
    <div className={embedded ? "w-full" : "max-w-5xl mx-auto pb-24"}>
      {editable && (
        <>
          <input ref={avatarInput} type="file" accept="image/*" hidden onChange={(e) => onPickImage("avatar", e)} />
          <input ref={coverInput} type="file" accept="image/*" hidden onChange={(e) => onPickImage("cover", e)} />
        </>
      )}

      {/* ---------- PROFILE STRENGTH (owner, top) ---------- */}
      {editable && (
        <Reveal>
          <div className="mb-4">
            <SectionCard title="Profile strength">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${strength.pct}%` }} />
                </div>
                <span className="text-sm font-semibold">{strength.label}</span>
              </div>
              {strength.next && <p className="text-xs text-muted-foreground mt-3">{strength.next}</p>}
            </SectionCard>
          </div>
        </Reveal>
      )}

      <div>
        {/* ============ MAIN COLUMN ============ */}
        <div className="space-y-4">
          {/* ---------- HERO ---------- */}
          <Reveal>
            <section className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
              <div className="relative h-44 sm:h-52 bg-[var(--h-slab)]">
                {p.coverURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.coverURL} alt="cover" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 opacity-[0.07] bg-[repeating-linear-gradient(135deg,#fff_0_14px,transparent_14px_28px)]" />
                )}
                {editable && (
                  <button
                    type="button"
                    onClick={() => coverInput.current?.click()}
                    disabled={uploadingCover}
                    className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/85 hover:bg-white text-slate-700 shadow-sm flex items-center justify-center"
                    aria-label="Change cover"
                  >
                    {uploadingCover ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                  </button>
                )}
              </div>

              <div className="px-5 pb-6 sm:px-8">
                {/* avatar + primary action */}
                <div className="flex items-end justify-between -mt-16 mb-3">
                  <div className="relative">
                    <Avatar className="w-32 h-32 rounded-full border-4 border-background shadow-sm bg-background">
                      <AvatarImage src={p.photoURL || ""} className="object-cover" alt={fullName} />
                      <AvatarFallback className="text-4xl font-bold bg-primary/10 text-primary">{initial}</AvatarFallback>
                    </Avatar>
                    {editable && (
                      <button
                        type="button"
                        onClick={() => avatarInput.current?.click()}
                        disabled={uploadingAvatar}
                        className="absolute bottom-1 right-1 w-8 h-8 rounded-full bg-primary text-primary-foreground shadow flex items-center justify-center"
                        aria-label="Change photo"
                      >
                        {uploadingAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                      </button>
                    )}
                    {p.openToWork && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-background bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold text-white">
                        OPEN TO DELEGATE
                      </span>
                    )}
                  </div>

                  <div className="pb-1 flex items-center gap-2">
                    {!editable && (
                      <>
                        {eligible && (
                          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                            <Button variant="outline" onClick={() => setShowRate(true)} className="gap-1.5">
                              <Star className={cn("w-4 h-4", myRating && "text-amber-400 fill-amber-400")} />
                              {myRating ? "Update rating" : "Rate"}
                            </Button>
                          </motion.div>
                        )}
                        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                          <Button onClick={handleMessage} disabled={messaging} className="gap-1.5">
                            {messaging ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />} Message
                          </Button>
                        </motion.div>
                      </>
                    )}
                  </div>
                </div>

                {/* name row */}
                <div className="flex items-center gap-2 flex-wrap">
                  {editable ? (
                    <InlineText
                      value={fullName === "Unknown" ? "" : fullName}
                      onSave={saveField("displayName")}
                      editable
                      placeholder="Add your name"
                      className="text-2xl sm:text-[26px] font-bold tracking-tight"
                      ariaLabel="Edit name"
                    />
                  ) : (
                    <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight">{fullName}</h1>
                  )}
                  {isPro && (
                    <span title="Verified organizer" className="inline-flex items-center justify-center">
                      <BadgeCheck className="w-5 h-5 text-primary" />
                    </span>
                  )}
                </div>

                {/* headline */}
                <div className="mt-1.5 text-[15px] text-foreground/80 leading-relaxed max-w-xl">
                  <InlineText
                    value={p.headline}
                    onSave={saveField("headline")}
                    editable={editable}
                    multiline
                    placeholder="Add a headline"
                    emptyText=""
                    ariaLabel="Edit headline"
                  />
                </div>

                {/* meta row */}
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
                  <Badge variant="outline" className="capitalize text-primary border-primary/20 bg-primary/5">{roleLabel}</Badge>
                  {ratingAvg > 0 && <StarDisplay value={ratingAvg} count={p.ratingCount} />}
                  {(p.city || p.country || editable) && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {editable ? (
                        <span className="flex items-center gap-1">
                          <InlineText value={p.city} onSave={saveField("city")} editable placeholder="City" emptyText="" ariaLabel="Edit city" />
                          <span>,</span>
                          <InlineText value={p.country} onSave={saveField("country")} editable placeholder="Country" emptyText="" ariaLabel="Edit country" />
                        </span>
                      ) : (
                        [p.city, p.country].filter(Boolean).join(", ")
                      )}
                    </span>
                  )}
                  {(p.nationality || editable) && (
                    <span className="flex items-center gap-1">
                      <Globe className="w-4 h-4" />
                      <InlineText value={p.nationality} onSave={saveField("nationality")} editable={editable} placeholder="Nationality" emptyText="" ariaLabel="Edit nationality" />
                    </span>
                  )}
                  {connections > 0 && (
                    <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {connections} connection{connections === 1 ? "" : "s"}</span>
                  )}
                  <a href="#contact" className="font-medium text-primary hover:underline">Contact info</a>
                </div>

                {/* open-to controls (owner) / banner (viewer) */}
                {editable ? (
                  <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border/60 p-3">
                    <label className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">Open to delegate &amp; chair invitations</span>
                      <Switch checked={!!p.openToWork} onCheckedChange={(v) => handleSave({ openToWork: !!v })} />
                    </label>
                    {p.openToWork && (
                      <div className="text-sm text-foreground/80">
                        <InlineText value={p.openToRoles} onSave={saveField("openToRoles")} editable placeholder="What you're open to — UNSC, DISEC, Crisis…" emptyText="" ariaLabel="Edit open to roles" />
                      </div>
                    )}
                  </div>
                ) : (
                  p.openToWork && p.openToRoles && (
                    <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                      <Briefcase className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
                      <p className="text-sm text-foreground/80"><span className="font-semibold text-foreground">Open to:</span> {p.openToRoles}</p>
                    </div>
                  )
                )}
              </div>
            </section>
          </Reveal>

          {/* ---------- STATS (owner) ---------- */}
          {editable && (
            <Reveal delay={0.05}>
              <SectionCard
                title="MUN Stats"
                subtitle={p.privacySettings?.showStats ? "Visible on your public profile" : "Private to you"}
                action={
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    Show publicly
                    <Switch
                      checked={!!p.privacySettings?.showStats}
                      onCheckedChange={(v) =>
                        handleSave({
                          privacySettings: {
                            showProfile: true,
                            showApplicationHistory: false,
                            ...(p.privacySettings || {}),
                            showStats: !!v,
                          },
                        })
                      }
                    />
                  </label>
                }
              >
                <div className="grid grid-cols-3 gap-2">
                  <Stat icon={CalendarDays} value={stats.conferences} label="Conferences" />
                  <Stat icon={FileText} value={stats.articles} label="Blogs" bordered />
                  <Stat icon={Trophy} value={stats.awards} label="Awards" bordered />
                </div>
              </SectionCard>
            </Reveal>
          )}

          {/* ---------- ABOUT ---------- */}
          <Reveal delay={0.08}>
            <SectionCard title="About">
              <div className="text-foreground/80">
                <InlineText
                  value={p.bio}
                  onSave={saveField("bio")}
                  editable={editable}
                  multiline
                  placeholder="Write a bio to introduce yourself"
                  emptyText={editable ? "Add a bio to introduce yourself." : "No bio yet."}
                  renderDisplay={<div className="markdown-content" dangerouslySetInnerHTML={{ __html: bioHtml(p.bio || "") }} />}
                  ariaLabel="Edit bio"
                  aiSurface="profile-bio"
                />
              </div>
              {(p.skills?.length ?? 0) > 0 && (
                <div className="mt-4 pt-4 border-t border-border/50 flex flex-wrap gap-2">
                  {(p.skills || []).slice(0, 8).map((s) => (
                    <Badge key={s} variant="secondary" className="gap-1"><Sparkles className="w-3 h-3 text-primary" />{s}</Badge>
                  ))}
                  {(p.skills?.length ?? 0) > 8 && <Badge variant="secondary">+{(p.skills!.length - 8)} more</Badge>}
                </div>
              )}
            </SectionCard>
          </Reveal>

          {/* ---------- EXPERIENCE ---------- */}
          {(editable || (p.experience?.length ?? 0) > 0) && (
            <Reveal delay={0.1}>
              <SectionCard
                title="MUN Experience"
                onEdit={editable ? () => setDlg("experience") : undefined}
                editLabel={(p.experience?.length ?? 0) > 0 ? "Edit" : "Add"}
              >
                {(p.experience?.length ?? 0) > 0 ? (
                  <div className="space-y-5">
                    {p.experience!.map((ex) => (
                      <div key={ex.id} className="flex gap-3.5">
                        <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center font-bold text-sm text-primary shrink-0">
                          {(ex.orgShort || ex.org || "?").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold leading-tight">{ex.roleTitle}</p>
                          <p className="text-sm text-foreground/70">{ex.org}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {[ex.startDate, ex.current ? "Present" : ex.endDate].filter(Boolean).join(" – ")}
                            {ex.location ? ` · ${ex.location}` : ""}
                          </p>
                          {ex.description && <p className="text-sm text-foreground/75 mt-1.5 leading-relaxed">{ex.description}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Add conferences chaired, delegations led, society roles.</p>
                )}
              </SectionCard>
            </Reveal>
          )}

          {/* ---------- HONORS & AWARDS ---------- */}
          {(editable || achievements.length > 0 || (p.awards?.length ?? 0) > 0) && (
            <Reveal delay={0.12}>
              <SectionCard
                title="Honors & Awards"
                onEdit={editable ? () => setDlg("awards") : undefined}
                editLabel={(p.awards?.length ?? 0) > 0 ? "Edit" : "Add"}
              >
                {(achievements.length > 0 || (p.awards?.length ?? 0) > 0) ? (
                  <div className="space-y-3">
                    {achievements.map((a) => (
                      <AwardRow key={`r-${a.id}`} title={`${AWARD_LABEL[a.awardType]} — ${a.committeeName}`} sub="MUN result · verified" />
                    ))}
                    {(p.awards || []).map((a) => (
                      <AwardRow key={`m-${a.id}`} title={a.title} sub={[a.issuer, a.date].filter(Boolean).join(" · ")} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Awards you win in events appear here automatically. Add others manually.</p>
                )}
              </SectionCard>
            </Reveal>
          )}

          {/* ---------- EDUCATION ---------- */}
          {(editable || (p.education?.length ?? 0) > 0) && (
            <Reveal delay={0.14}>
              <SectionCard
                title="Education"
                onEdit={editable ? () => setDlg("education") : undefined}
                editLabel={(p.education?.length ?? 0) > 0 ? "Edit" : "Add"}
              >
                {(p.education?.length ?? 0) > 0 ? (
                  <div className="space-y-4">
                    {p.education!.map((ed) => (
                      <div key={ed.id} className="flex gap-3.5">
                        <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                          <GraduationCap className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold leading-tight">{ed.school}</p>
                          {(ed.degree || ed.field) && <p className="text-sm text-foreground/70">{[ed.degree, ed.field].filter(Boolean).join(", ")}</p>}
                          {(ed.startYear || ed.endYear) && <p className="text-xs text-muted-foreground mt-0.5">{[ed.startYear, ed.endYear].filter(Boolean).join(" – ")}</p>}
                          {ed.activities && <p className="text-sm text-foreground/75 mt-1"><span className="font-medium">Activities:</span> {ed.activities}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Add your school, degree and activities.</p>
                )}
              </SectionCard>
            </Reveal>
          )}

          {/* ---------- SKILLS & ENDORSEMENTS ---------- */}
          <Reveal delay={0.15}>
            <SkillsSection
              profile={p}
              editable={editable}
              viewerUid={user?.uid}
              canEndorse={!editable && eligible}
              onSave={handleSave}
            />
          </Reveal>

          {/* ---------- RECOMMENDATIONS ---------- */}
          <Reveal delay={0.16}>
            <RecommendationsSection
              ownerUid={profile.uid}
              ownerName={fullName}
              editable={editable}
              canRecommend={!editable && eligible}
            />
          </Reveal>

          {/* ---------- ACTIVITY (owner) ---------- */}
          {activities.length > 0 && (
            <Reveal delay={0.17}>
              <SectionCard title="Recent Activity">
                <div className="space-y-3">
                  {activities.map((act) => (
                    <div key={act.id} className="flex gap-3 p-3 rounded-xl bg-secondary border border-border/40">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <CalendarDays className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm">{act.action} <span className="font-semibold">{act.targetTitle}</span></p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {act.createdAt?.toDate ? formatDistanceToNow(act.createdAt.toDate(), { addSuffix: true }) : "recently"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </Reveal>
          )}

          {/* ---------- CONTACT & SOCIAL ---------- */}
          <Reveal delay={0.18}>
            <SectionCard title="Contact & Social" id="contact">
              <div className="grid sm:grid-cols-2 gap-3">
                <ContactRow icon={Mail} label="Email" value={p.email || "—"} />
                <div className="flex items-center gap-3 p-2 rounded-lg">
                  <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground block leading-tight">Phone</span>
                    <span className="text-sm font-medium block">
                      <InlineText value={p.phoneNumber} onSave={savePhone} editable={editable} placeholder="Add phone" emptyText="Not shared" ariaLabel="Edit phone" />
                    </span>
                  </div>
                </div>
              </div>

              {editable ? (
                <div className="mt-4 pt-4 border-t border-border/50 grid sm:grid-cols-3 gap-3">
                  <SocialEdit label="Instagram" value={p.instagram} onSave={saveField("instagram")} placeholder="@handle" />
                  <SocialEdit label="LinkedIn" value={p.linkedin} onSave={saveField("linkedin")} placeholder="in/username" />
                  <SocialEdit label="TikTok" value={p.tiktok} onSave={saveField("tiktok")} placeholder="@handle" />
                </div>
              ) : socials.length > 0 ? (
                <div className="mt-4 pt-4 border-t border-border/50 flex flex-wrap gap-2.5">
                  {socials.map((s) => (
                    <motion.a
                      key={s.key} href={s.href} target="_blank" rel="noopener noreferrer" title={s.label}
                      whileHover={{ scale: 1.1, y: -2 }} whileTap={{ scale: 0.92 }}
                      className={cn("w-11 h-11 rounded-full border border-border/60 flex items-center justify-center text-muted-foreground hover:text-white transition-colors", s.tint)}
                    >
                      {s.icon}
                    </motion.a>
                  ))}
                </div>
              ) : null}
            </SectionCard>
          </Reveal>
        </div>
      </div>

      {/* ---------- Owner list dialogs (mounted only while open) ---------- */}
      {editable && dlg === "experience" && <ExperienceDialog profile={p} onSave={handleSave} onClose={() => setDlg(null)} />}
      {editable && dlg === "education" && <EducationDialog profile={p} onSave={handleSave} onClose={() => setDlg(null)} />}
      {editable && dlg === "awards" && <AwardsDialog profile={p} onSave={handleSave} onClose={() => setDlg(null)} />}

      {/* ---------- Viewer rate dialog ---------- */}
      {!editable && showRate && (
        <RateDialog targetName={fullName} initialStars={myRating} onSubmit={submitRate} onClose={() => setShowRate(false)} />
      )}
    </div>
  );
}

function Stat({ icon: Icon, value, label, bordered }: { icon: React.ElementType; value: number; label: string; bordered?: boolean }) {
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

function AwardRow({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-yellow-500/10 flex items-center justify-center shrink-0">
        <Award className="w-4 h-4 text-yellow-600" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-tight truncate">{title}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function ContactRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg">
      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground block leading-tight">{label}</span>
        <span className="text-sm font-medium truncate block">{value}</span>
      </div>
    </div>
  );
}

function SocialEdit({ label, value, onSave, placeholder }: { label: string; value?: string; onSave: (v: string) => Promise<void>; placeholder: string }) {
  return (
    <div className="min-w-0">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground block leading-tight mb-0.5">{label}</span>
      <span className="text-sm font-medium block">
        <InlineText value={value} onSave={onSave} editable placeholder={placeholder} emptyText="Not linked" ariaLabel={`Edit ${label}`} />
      </span>
    </div>
  );
}

function computeStrength(p: UserProfile): { pct: number; label: string; next?: string } {
  const checks: [boolean, string][] = [
    [!!p.photoURL, "Add a profile photo"],
    [!!p.coverURL, "Add a cover image"],
    [!!p.headline, "Add a headline"],
    [!!p.bio, "Write a bio"],
    [!!(p.city && p.country), "Add your location"],
    [!!p.nationality, "Add your nationality"],
    [!!(p.skills?.length), "Add a few skills"],
    [!!(p.experience?.length), "Add MUN experience"],
    [!!(p.education?.length), "Add your education"],
    [!!(p.instagram || p.linkedin || p.tiktok), "Link a social profile"],
  ];
  const done = checks.filter(([ok]) => ok).length;
  const pct = Math.round((done / checks.length) * 100);
  const label = pct >= 100 ? "All-Star" : pct >= 70 ? "Advanced" : pct >= 40 ? "Intermediate" : "Beginner";
  const next = checks.find(([ok]) => !ok)?.[1];
  return { pct, label, next: next ? `Next: ${next}.` : undefined };
}

/** Render the markdown bio to HTML (same pattern as AnnouncementViewer). */
function bioHtml(md: string): string {
  const html = marked.parse(md || "", { async: false }) as string;
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
}
