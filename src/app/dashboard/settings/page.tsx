"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { updateUserProfile, saveMyContact, NotificationPreferences, PrivacySettings, UserProfile } from "@/lib/services/userService";
import { ProfileView } from "@/components/features/profile/ProfileView";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { DateField } from "@/components/ui/DateTimePicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  User,
  Bell,
  Lock,
  Shield,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sun,
  Moon,
  Palette,
  Check,
  Sparkles,
  Flag,
  Utensils,
  Calendar,
  Briefcase,
  Building2,
  GraduationCap,
  CreditCard,
  MapPin,
  KeyRound,
  Eye,
  History,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";

type SaveState = "idle" | "saving" | "success" | "error";
type TabKey = "profile" | "appearance" | "notifications" | "privacy" | "security";

const OPTIONAL_FIELDS = [
  "bio", "phoneNumber", "nationality", "diet", "occupation", "institution",
  "fieldOfStudy", "invoiceType", "street", "city", "postalCode", "country",
  "instagram", "tiktok", "linkedin",
] as const;

const NAV: { key: TabKey; label: string; icon: React.ElementType; tint: string }[] = [
  { key: "profile", label: "Profile", icon: User, tint: "text-primary" },
  { key: "appearance", label: "Appearance", icon: Palette, tint: "text-primary" },
  { key: "notifications", label: "Notifications", icon: Bell, tint: "text-amber-500" },
  { key: "privacy", label: "Privacy", icon: Shield, tint: "text-emerald-500" },
  { key: "security", label: "Security", icon: Lock, tint: "text-rose-500" },
];

/* ---------- small building blocks ---------- */

function SectionCard({
  icon: Icon, tint, title, desc, filled, total, delay = 0, children,
}: {
  icon: React.ElementType; tint: string; title: string; desc: string;
  filled?: number; total?: number; delay?: number; children: React.ReactNode;
}) {
  const done = total !== undefined && filled === total && total > 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="glass-card overflow-hidden">
        <CardContent className="p-5 sm:p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", tint)}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold leading-tight">{title}</h3>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
            {total !== undefined && (
              <span
                className={cn(
                  "flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full shrink-0",
                  done ? "bg-emerald-500/10 text-emerald-600" : "bg-secondary text-muted-foreground"
                )}
              >
                {done ? <Check className="w-3 h-3" /> : null}
                {filled}/{total}
              </span>
            )}
          </div>
          {children}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function Field({
  label, icon: Icon, filled, hint, children,
}: {
  label: string; icon?: React.ElementType; filled?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
        <AnimatePresence>
          {filled && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="text-emerald-500"
            >
              <Check className="w-3 h-3" />
            </motion.span>
          )}
        </AnimatePresence>
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ToggleRow({
  icon: Icon, tint, label, desc, checked, onChange,
}: {
  icon: React.ElementType; tint: string; label: string; desc: string;
  checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onChange(!checked);
        }
      }}
      className="w-full flex items-center gap-3 p-4 rounded-xl border border-border/40 bg-secondary hover:bg-secondary transition-colors text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", tint)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm leading-tight">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
      <Switch checked={checked} className="shrink-0 pointer-events-none" tabIndex={-1} aria-hidden />
    </div>
  );
}

function SaveBar({
  state, onSave, label, sticky = false,
}: {
  state: SaveState; onSave: () => void; label: string; sticky?: boolean;
}) {
  return (
    <div className={cn(sticky && "sticky bottom-4 z-10")}>
      <div
        className={cn(
          "flex items-center justify-between gap-3 px-5 py-3.5 rounded-2xl border",
          sticky
            ? "glass-card border-primary/25"
            : "border-border/40 bg-secondary"
        )}
      >
        <div className="text-sm min-h-[20px] flex items-center">
          <AnimatePresence mode="wait">
            {state === "saving" && (
              <motion.span key="s" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="w-4 h-4 animate-spin" /> Saving…
              </motion.span>
            )}
            {state === "success" && (
              <motion.span key="ok" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-emerald-500 flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="w-4 h-4" /> Saved!
              </motion.span>
            )}
            {state === "error" && (
              <motion.span key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-destructive flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> Failed. Try again.
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <Button onClick={onSave} disabled={state === "saving"} size="lg" className="gap-2">
          {state === "saving" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {label}
        </Button>
      </div>
    </div>
  );
}

/* ---------- page ---------- */

export default function SettingsPage() {
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();
  const { theme, setTheme } = useTheme();

  const [tab, setTab] = useState<TabKey>("profile");

  // basic
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [bio, setBio] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [coverURL, setCoverURL] = useState("");
  const [phone, setPhone] = useState("");
  // personal
  const [nationality, setNationality] = useState("");
  const [dob, setDob] = useState("");
  const [diet, setDiet] = useState("");
  // professional
  const [occupation, setOccupation] = useState("");
  const [institution, setInstitution] = useState("");
  const [fieldOfStudy, setFieldOfStudy] = useState("");
  // billing
  const [invoiceType, setInvoiceType] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [stateField, setStateField] = useState("");
  const [country, setCountry] = useState("");
  // socials
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [linkedin, setLinkedin] = useState("");

  const [profileSave, setProfileSave] = useState<SaveState>("idle");

  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>({
    emailOnApproval: true,
    emailOnRejection: true,
    emailOnNewEvent: false,
    pushNotifications: false,
  });
  const [notifSave, setNotifSave] = useState<SaveState>("idle");

  const [privacy, setPrivacy] = useState<PrivacySettings>({
    showProfile: true,
    showApplicationHistory: false,
  });
  const [privacySave, setPrivacySave] = useState<SaveState>("idle");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [securitySave, setSecuritySave] = useState<SaveState>("idle");
  const [securityError, setSecurityError] = useState("");

  useEffect(() => {
    if (!profile) return;
    const p = profile as any;
    setFirstName(p.firstName || "");
    setLastName(p.lastName || "");
    setBio(p.bio || "");
    setPhotoURL(p.photoURL || "");
    setCoverURL(p.coverURL || "");
    setPhone(p.phoneNumber || "");
    setNationality(p.nationality || "");
    setDob(p.dob || "");
    setDiet(p.diet || "");
    setOccupation(p.occupation || "");
    setInstitution(p.institution || "");
    setFieldOfStudy(p.fieldOfStudy || "");
    setInvoiceType(p.invoiceType || "");
    setStreet(p.street || "");
    setCity(p.city || "");
    setPostalCode(p.postalCode || "");
    setStateField(p.state || "");
    setCountry(p.country || "");
    setInstagram(p.instagram || "");
    setTiktok(p.tiktok || "");
    setLinkedin(p.linkedin || "");
    if (p.notificationPreferences) setNotifPrefs(p.notificationPreferences);
    if (p.privacySettings) setPrivacy(p.privacySettings);
  }, [profile]);

  const f = (v: string) => (v || "").trim().length > 0;
  const filledOf = (arr: string[]) => arr.filter(f).length;

  const groups = useMemo(
    () => ({
      basic: [bio, phone],
      personal: [nationality, diet],
      professional: [occupation, institution, fieldOfStudy],
      billing: [invoiceType, street, city, postalCode, country],
      social: [instagram, tiktok, linkedin],
    }),
    [bio, phone, nationality, diet, occupation, institution, fieldOfStudy, invoiceType, street, city, postalCode, country, instagram, tiktok, linkedin]
  );

  const completion = useMemo(() => {
    const values: Record<string, string> = {
      bio, phoneNumber: phone, nationality, diet, occupation, institution,
      fieldOfStudy, invoiceType, street, city, postalCode, country, instagram, tiktok, linkedin,
    };
    const filled = OPTIONAL_FIELDS.filter((k) => (values[k] || "").trim().length > 0).length;
    return Math.round((filled / OPTIONAL_FIELDS.length) * 100);
  }, [bio, phone, nationality, diet, occupation, institution, fieldOfStudy, invoiceType, street, city, postalCode, country, instagram, tiktok, linkedin]);


  async function saveProfile() {
    if (!user) return;
    setProfileSave("saving");
    try {
      await updateUserProfile(user.uid, {
        firstName, lastName, bio, photoURL, coverURL, nationality, dob, diet,
        occupation, institution, fieldOfStudy, invoiceType, street, city, postalCode,
        state: stateField, country, instagram, tiktok, linkedin,
      } as any);
      // Phone is private (users/{uid}/private/contact), readable per privacySettings.contactVisibility.
      await saveMyContact(user.uid, { phoneNumber: phone });
      await refreshProfile();
      setProfileSave("success");
      setTimeout(() => setProfileSave("idle"), 3000);
    } catch {
      setProfileSave("error");
    }
  }

  async function saveNotifications() {
    if (!user) return;
    setNotifSave("saving");
    try {
      await updateUserProfile(user.uid, { notificationPreferences: notifPrefs } as any);
      setNotifSave("success");
      setTimeout(() => setNotifSave("idle"), 3000);
    } catch {
      setNotifSave("error");
    }
  }

  async function savePrivacy() {
    if (!user) return;
    setPrivacySave("saving");
    try {
      await updateUserProfile(user.uid, { privacySettings: privacy } as any);
      setPrivacySave("success");
      setTimeout(() => setPrivacySave("idle"), 3000);
    } catch {
      setPrivacySave("error");
    }
  }

  async function changePassword() {
    if (!user || !user.email) return;
    setSecurityError("");
    if (newPassword !== confirmPassword) {
      setSecurityError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setSecurityError("Password must be at least 6 characters.");
      return;
    }
    setSecuritySave("saving");
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSecuritySave("success");
      setTimeout(() => setSecuritySave("idle"), 3000);
    } catch (err: any) {
      setSecuritySave("error");
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setSecurityError("Current password is incorrect.");
      } else if (err.code === "auth/weak-password") {
        setSecurityError("New password is too weak.");
      } else {
        setSecurityError("Failed to update password. Try again.");
      }
    }
  }

  if (authLoading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="flex gap-6">
          <Skeleton className="h-[300px] w-56 rounded-2xl hidden lg:block" />
          <Skeleton className="h-[400px] flex-1 rounded-2xl" />
        </div>
      </div>
    );
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const isComplete = completion === 100;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account, preferences, and security.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* NAV */}
        <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible lg:w-56 shrink-0 lg:sticky lg:top-6 lg:self-start scrollbar-none pb-1">
          {NAV.map(({ key, label, icon: Icon, tint }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "relative shrink-0 lg:w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                {active && (
                  <motion.div
                    layoutId="settings-active-nav"
                    className="absolute inset-0 bg-secondary border border-border/50 rounded-xl"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                <Icon className={cn("w-4 h-4 relative z-10 shrink-0", active && tint)} />
                <span className="relative z-10 whitespace-nowrap">{label}</span>
                {key === "profile" && (
                  <span
                    className={cn(
                      "relative z-10 ml-auto hidden lg:inline text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                      isComplete ? "bg-emerald-500/15 text-emerald-600" : "bg-primary/15 text-primary"
                    )}
                  >
                    {completion}%
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* CONTENT */}
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              {/* ============ PROFILE ============ */}
              {tab === "profile" && (
                <div className="space-y-6">
                  {/* Rich profile — the full public profile, edited inline. Photo, cover, name,
                      headline, bio, location, nationality, phone, socials, experience, education,
                      awards, skills & recommendations all live here (single source of truth). */}
                  {profile && <ProfileView profile={profile as UserProfile} editable embedded />}

                  {/* Account — name & email (not covered by the rich profile's displayName). */}
                  <SectionCard icon={User} tint="bg-primary/10 text-primary" title="Account" desc="Your legal name and sign-in email." filled={filledOf([firstName, lastName])} total={2} delay={0.05}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="First Name" filled={f(firstName)}>
                        <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" />
                      </Field>
                      <Field label="Last Name" filled={f(lastName)}>
                        <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" />
                      </Field>
                    </div>
                    <Field label="Email" icon={Mail} hint="Email cannot be changed here.">
                      <Input value={user?.email || ""} disabled className="opacity-60" />
                    </Field>
                  </SectionCard>

                  {/* Personal */}
                  <SectionCard icon={Flag} tint="bg-rose-500/10 text-rose-500" title="Personal Details" desc="Helps organizers know you better." filled={filledOf(groups.personal)} total={groups.personal.length} delay={0.1}>
                    <Field label="Date of Birth" icon={Calendar} filled={f(dob)}>
                      <DateField value={dob} onChange={setDob} max={todayStr} placeholder="Select your date of birth" />
                    </Field>
                    <Field label="Dietary Preference" icon={Utensils} filled={f(diet)}>
                      <Select value={diet} onValueChange={(v) => setDiet(v || "")}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select dietary preference" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="vegetarian">Vegetarian</SelectItem>
                          <SelectItem value="vegan">Vegan</SelectItem>
                          <SelectItem value="halal">Halal</SelectItem>
                          <SelectItem value="kosher">Kosher</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </SectionCard>

                  {/* Professional */}
                  <SectionCard icon={Briefcase} tint="bg-amber-500/10 text-amber-600" title="Professional" desc="Your role, institution, and field." filled={filledOf(groups.professional)} total={groups.professional.length} delay={0.15}>
                    <Field label="Occupation" icon={Briefcase} filled={f(occupation)}>
                      <Select value={occupation} onValueChange={(v) => setOccupation(v || "")}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select occupation" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="student">Student</SelectItem>
                          <SelectItem value="professional">Professional</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Institution / Organization" icon={Building2} filled={f(institution)}>
                      <Input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="e.g. University of Oxford" />
                    </Field>
                    <Field label="Field of Study / Industry" icon={GraduationCap} filled={f(fieldOfStudy)}>
                      <Input value={fieldOfStudy} onChange={(e) => setFieldOfStudy(e.target.value)} placeholder="e.g. Computer Science" />
                    </Field>
                  </SectionCard>

                  {/* Billing */}
                  <SectionCard icon={CreditCard} tint="bg-emerald-500/10 text-emerald-600" title="Billing Address" desc="Used for invoices on paid events." filled={filledOf(groups.billing)} total={groups.billing.length} delay={0.2}>
                    <Field label="Invoice Type" icon={CreditCard} filled={f(invoiceType)}>
                      <Select value={invoiceType} onValueChange={(v) => setInvoiceType(v || "")}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select invoice type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="individual">Individual</SelectItem>
                          <SelectItem value="organization">Organization</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Street and Number" icon={MapPin} filled={f(street)}>
                      <Input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="123 Main St, Apt 4B" />
                    </Field>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="City" filled={f(city)}>
                        <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="New York" />
                      </Field>
                      <Field label="Postal Code" filled={f(postalCode)}>
                        <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="10001" />
                      </Field>
                      <Field label="State / Province" filled={f(stateField)}>
                        <Input value={stateField} onChange={(e) => setStateField(e.target.value)} placeholder="NY" />
                      </Field>
                      <Field label="Country" filled={f(country)}>
                        <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="United States" />
                      </Field>
                    </div>
                  </SectionCard>

                  <SaveBar state={profileSave} onSave={saveProfile} label="Save Profile" sticky />
                </div>
              )}

              {/* ============ APPEARANCE ============ */}
              {tab === "appearance" && (
                <SectionCard icon={Palette} tint="bg-primary/10 text-primary" title="Appearance" desc="Light is default; switch to dark anytime.">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {([
                      { val: "light", Icon: Sun, color: "text-amber-500", title: "Light", note: "Bright, airy interface. Recommended.", preview: <div className="h-full w-full bg-white relative"><div className="absolute top-2 left-2 right-2 h-3 rounded bg-slate-200" /><div className="absolute top-7 left-2 w-1/2 h-2 rounded bg-slate-200" /><div className="absolute bottom-2 left-2 right-2 h-8 rounded bg-primary/10 border border-primary" /></div> },
                      { val: "dark", Icon: Moon, color: "text-primary", title: "Dark", note: "Easier on the eyes in low light.", preview: <div className="h-full w-full bg-slate-900 relative"><div className="absolute top-2 left-2 right-2 h-3 rounded bg-slate-700" /><div className="absolute top-7 left-2 w-1/2 h-2 rounded bg-slate-700" /><div className="absolute bottom-2 left-2 right-2 h-8 rounded bg-primary/60 border border-primary/60" /></div> },
                    ] as const).map(({ val, Icon, color, title, note, preview }) => {
                      const active = theme === val;
                      return (
                        <motion.button
                          key={val}
                          type="button"
                          onClick={() => setTheme(val)}
                          aria-pressed={active}
                          whileHover={{ y: -3 }}
                          whileTap={{ scale: 0.98 }}
                          className={cn(
                            "relative rounded-2xl border p-5 text-left transition-colors",
                            active ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border/50 hover:border-primary/40"
                          )}
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <Icon className={cn("w-5 h-5", color)} />
                            <span className="font-semibold">{title}</span>
                            {active && <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />}
                          </div>
                          <div className="h-24 rounded-lg overflow-hidden border border-border/40">{preview}</div>
                          <p className="text-xs text-muted-foreground mt-3">{note}</p>
                        </motion.button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">Your preference is saved on this device.</p>
                </SectionCard>
              )}

              {/* ============ NOTIFICATIONS ============ */}
              {tab === "notifications" && (
                <div className="space-y-6">
                  <SectionCard icon={Bell} tint="bg-amber-500/10 text-amber-600" title="Notification Preferences" desc="Choose when to receive email alerts.">
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-sm text-blue-600">
                      <Bell className="w-4 h-4 mt-0.5 shrink-0" />
                      <p>You&apos;ll always see updates in your in-app activity feed. These toggles only control email.</p>
                    </div>
                    {([
                      { key: "emailOnApproval" as const, icon: CheckCircle2, tint: "bg-emerald-500/10 text-emerald-600", label: "Application Approved", desc: "Email when your application gets approved." },
                      { key: "emailOnRejection" as const, icon: AlertCircle, tint: "bg-rose-500/10 text-rose-500", label: "Application Rejected", desc: "Email when your application is rejected." },
                      { key: "emailOnNewEvent" as const, icon: Sparkles, tint: "bg-primary/10 text-primary", label: "New Events", desc: "Email when new conferences are published." },
                      { key: "pushNotifications" as const, icon: Bell, tint: "bg-amber-500/10 text-amber-600", label: "Push Notifications", desc: "Browser push notifications for key updates." },
                    ]).map(({ key, icon, tint, label, desc }) => (
                      <ToggleRow key={key} icon={icon} tint={tint} label={label} desc={desc} checked={notifPrefs[key]} onChange={(v) => setNotifPrefs((prev) => ({ ...prev, [key]: v }))} />
                    ))}
                    <SaveBar state={notifSave} onSave={saveNotifications} label="Save Preferences" />
                  </SectionCard>
                </div>
              )}

              {/* ============ PRIVACY ============ */}
              {tab === "privacy" && (
                <SectionCard icon={Shield} tint="bg-emerald-500/10 text-emerald-600" title="Privacy Settings" desc="Control what other users can see about you.">
                  {([
                    { key: "showProfile" as const, icon: Eye, tint: "bg-sky-500/10 text-sky-600", label: "Public Profile", desc: "Allow other delegates to view your profile." },
                    { key: "showApplicationHistory" as const, icon: History, tint: "bg-primary/10 text-primary", label: "Application History", desc: "Show your conference participation history publicly." },
                    { key: "showStats" as const, icon: Calendar, tint: "bg-amber-500/10 text-amber-600", label: "MUN Stats", desc: "Show your conferences, blogs & awards counts on your public profile." },
                  ]).map(({ key, icon, tint, label, desc }) => (
                    <ToggleRow key={key} icon={icon} tint={tint} label={label} desc={desc} checked={!!privacy[key]} onChange={(v) => setPrivacy((prev) => ({ ...prev, [key]: v }))} />
                  ))}
                  <ToggleRow
                    icon={Lock} tint="bg-rose-500/10 text-rose-500" label="Email & phone: only my connections"
                    desc="When on, only people you're connected to can see your email and phone. Organizers of conferences you apply to always see them on your application."
                    checked={privacy.contactVisibility === "connections"}
                    onChange={(v) => setPrivacy((prev) => ({ ...prev, contactVisibility: v ? "connections" : "everyone" }))}
                  />
                  <SaveBar state={privacySave} onSave={savePrivacy} label="Save Privacy" />
                </SectionCard>
              )}

              {/* ============ SECURITY ============ */}
              {tab === "security" && (
                <SectionCard icon={KeyRound} tint="bg-rose-500/10 text-rose-500" title="Change Password" desc="Requires current password to verify identity.">
                  <Field label="Current Password" icon={Lock}>
                    <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" />
                  </Field>
                  <Field label="New Password" icon={KeyRound}>
                    <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" />
                  </Field>
                  <Field label="Confirm New Password" icon={KeyRound}>
                    <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" />
                  </Field>
                  {securityError && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" /> {securityError}
                    </p>
                  )}
                  <SaveBar state={securitySave} onSave={changePassword} label="Update Password" />
                </SectionCard>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
