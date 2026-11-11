"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EventData, getEnabledRoleTiers, getRolePrice, getRolePriceInfo, PricePhase, getCommitteeChoicesAllowed, isApplicationOpen, getApplicationTimeline, APPLICATION_ROLES, TEAM_ROLE } from "@/lib/services/eventService";
import { submitApplication, submitTeamApplication, submitFacultyApplication, buildLegacyChoices, CommitteePreference, ApplicationData } from "@/lib/services/applicationService";
import { logActivity } from "@/lib/services/activityService";
import { useAuth } from "@/contexts/AuthContext";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, FileUp, Info } from "lucide-react";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { AiTextareaAssist } from "@/components/shared/ai/AiTextareaAssist";
import { InlineError } from "@/components/shared/InlineError";
import { getCountryName } from "@/lib/data/countries";

interface ApplicationWizardProps {
  event: EventData;
  userId: string;
}

const STEPS = ["Role Selection", "Preferences", "Experience", "Review"];

const STEP_DESCRIPTIONS = [
  "Select your desired participation role.",
  "Choose your preferred committees and countries.",
  "Tell us about your MUN experience and why you chose these preferences.",
  "Review your application details before submitting.",
];

const ROLE_DESCRIPTIONS: Record<string, string> = {
  "Delegate": "Participate as a standard country representative.",
  "Head Delegate": "Lead a delegation from your institution.",
  "Observer": "Attend to watch and learn without voting rights.",
  "Faculty Advisor": "Accompany and supervise a delegation from your institution. No country preferences required.",
  "Team Delegation Lead": "Apply as a group of 3-15 delegates from one institution; one application covers all.",
};

const RANK_LABELS = ["1st choice", "2nd choice", "3rd choice"];

/** Country picked in a ranked slot — flag + name, or the committee's "any" fallback. */
function CountryLabel({ code, size = 16 }: { code: string; size?: number }) {
  if (code === "any") return <>Any Available Country</>;
  return (
    <span className="mp-wiz-country">
      <CountryFlag code={code} size={size} />
      <span>{getCountryName(code)}</span>
    </span>
  );
}

export function ApplicationWizard({ event, userId }: ApplicationWizardProps) {
  const { user, profile } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isRedirectingToPay, setIsRedirectingToPay] = useState(false);
  // Inline replacements for the old window.alert() calls (P09).
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** Payment couldn't start — the application is saved unpaid; shown on the success card. */
  const [payWarning, setPayWarning] = useState<string | null>(null);

  // Accepted roles + per-role pricing for this event (single source of truth).
  // Falls back to all roles, free, when the organizer hasn't configured any tiers.
  const enabledTiers = getEnabledRoleTiers(event);
  // Price shown is the EFFECTIVE price right now (early-bird / regular / late),
  // and `phase` lets us badge which window is active. Server re-verifies at checkout.
  // Application timing is the shared event schedule — open is the same for every role.
  const appOpen = isApplicationOpen(event);
  const roleOptions: { role: string; price: number; phase: PricePhase; label: string; open: boolean }[] =
    (enabledTiers.length > 0
      ? enabledTiers.map((t) => {
          const info = getRolePriceInfo(event, t.role);
          return { role: t.role, price: info.unitPrice, phase: info.phase, label: t.label || t.role };
        })
      : APPLICATION_ROLES.map((r) => ({ role: r, price: 0, phase: "regular" as PricePhase, label: r }))
    ).map((o) => ({ ...o, open: appOpen }));

  const firstOpenRole = roleOptions[0]?.role || "Delegate";
  const noRolesOpen = !appOpen;
  const closedLabel: string | null = appOpen
    ? null
    : (() => {
        const close = getApplicationTimeline(event).closeAt;
        if (Number.isNaN(close)) return "Closed";
        return `Closed ${new Date(close).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
      })();

  // How many committees this applicant may rank (organizer-configured, ≥1).
  const committeeChoicesAllowed = getCommitteeChoicesAllowed(event);
  const multiCommittee = committeeChoicesAllowed > 1;
  const emptyCommitteePrefs = () =>
    Array.from({ length: committeeChoicesAllowed }, () => ({ committee: "", countries: ["", "", ""] as string[] }));

  const [formData, setFormData] = useState({
    role: firstOpenRole,
    // Ranked committee choices, each with its own ranked countries. Length = allowed.
    committeePrefs: emptyCommitteePrefs(),
    experience: "",
    motivation: "",
    institutionName: "",
    studentsAccompanying: 0,
    facultyPosition: "",
    yearsTeaching: "",
    teamSize: 3,
    teamName: "",
    teamMembers: [] as { name: string; email: string }[]
  });

  const isTeam = formData.role === TEAM_ROLE;
  const isFacultyRole = formData.role === "Faculty Advisor";
  // Total fee for the selected role (team multiplies per member, server re-verifies).
  const totalFee = getRolePrice(event, formData.role, formData.teamSize);
  const perPersonFee = roleOptions.find((r) => r.role === formData.role)?.price ?? 0;

  // Per-committee seat availability (approved fills vs committee capacity), fetched
  // server-side since applicants can't read the applications collection.
  type Availability = { committees: Record<string, { capacity: number; approved: number; full: boolean }>; allFull: boolean };
  const [availability, setAvailability] = useState<Availability | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`/api/events/${event.id}/availability`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (active && data && data.committees) setAvailability(data); })
      .catch(() => {});
    return () => { active = false; };
  }, [event.id]);

  // Faculty Advisor picks no committee, so it's never capacity-gated.
  const isCommitteeRole = formData.role !== "Faculty Advisor";
  const committeeFull = (name: string) => !!availability?.committees[name]?.full;
  const registrationFull = isCommitteeRole && !!availability?.allFull;

  const updateFormData = (field: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Set a block's committee and reset its country ranking.
  const updateCommittee = (blockIdx: number, value: string) => {
    setFormData(prev => {
      const next = prev.committeePrefs.map((b, i) =>
        i === blockIdx ? { committee: value || "", countries: ["", "", ""] } : b
      );
      return { ...prev, committeePrefs: next };
    });
  };

  const updateCountryPref = (blockIdx: number, countryIdx: number, value: string) => {
    setFormData(prev => {
      const next = prev.committeePrefs.map((b, i) => {
        if (i !== blockIdx) return b;
        const countries = [...b.countries];
        countries[countryIdx] = value;
        return { ...b, countries };
      });
      return { ...prev, committeePrefs: next };
    });
  };

  const validateStep = () => {
    if (currentStep === 0) return !!formData.role && isApplicationOpen(event);
    if (currentStep === 1) {
      if (formData.role === "Faculty Advisor") {
        return !!formData.institutionName && !!formData.facultyPosition && !!formData.yearsTeaching && formData.studentsAccompanying > 0;
      }
      // Capacity gate: can't advance if the whole event is full.
      if (registrationFull) return false;
      const chosen = formData.committeePrefs.filter(b => b.committee);
      // No ranking a full committee.
      if (chosen.some(b => committeeFull(b.committee))) return false;
      // Top choice (committee + 1st country) required; same committee can't repeat.
      const first = formData.committeePrefs[0];
      const hasPrefs = !!first?.committee && !!first?.countries[0];
      const committees = chosen.map(b => b.committee);
      const noDupes = new Set(committees).size === committees.length;
      if (!noDupes) return false;
      if (isTeam) {
        return !!formData.institutionName && !!formData.teamName && formData.teamSize >= 3 && formData.teamSize <= 15 && hasPrefs;
      }
      return hasPrefs;
    }
    if (currentStep === 2) {
      return !!formData.experience && !!formData.motivation;
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep() && currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setSubmitError(null);
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;
    setSubmitError(null);
    // Re-check the window at submit time so a stale page can't slip past the deadline.
    if (!isApplicationOpen(event)) {
      setSubmitError("Applications are closed. Please refresh and check the application window.");
      return;
    }
    setIsSubmitting(true);

    const isFaculty = formData.role === "Faculty Advisor";
    // Canonical multi-committee prefs (drop empty blocks + blank countries).
    const committeePreferences: CommitteePreference[] = isFaculty
      ? []
      : formData.committeePrefs
          .filter(b => b.committee)
          .map(b => ({ committee: b.committee, countries: b.countries.filter(Boolean) }));
    // First choice mirrored into legacy fields so single-committee readers keep working.
    const firstCommittee = committeePreferences[0]?.committee || "";
    const firstCountries = committeePreferences[0]?.countries || [];
    const payload: ApplicationData = {
      eventId: event.id,
      userId,
      applicantName: profile?.displayName || user?.displayName || "Delegate",
      applicantEmail: profile?.email || user?.email || "",
      // The organizer sees the applicant's phone here; the profile keeps it private.
      ...(profile?.phoneNumber ? { applicantPhone: String(profile.phoneNumber) } : {}),
      role: formData.role,
      committeePreferences,
      preferredCommittee: firstCommittee,
      countryPreferences: firstCountries,
      // Legacy mirror so all existing readers keep working.
      choices: buildLegacyChoices(firstCommittee, firstCountries),
      experience: formData.experience,
      motivation: formData.motivation,
      status: "pending",
      ...(totalFee > 0 ? { paymentStatus: "unpaid" as const, tierName: formData.role } : {}),
      ...(formData.institutionName ? { institutionName: formData.institutionName } : {}),
    };

    let res;
    if (formData.role === "Faculty Advisor") {
      res = await submitFacultyApplication({
        ...payload,
        facultyPosition: formData.facultyPosition,
        yearsTeaching: formData.yearsTeaching,
        studentsAccompanying: formData.studentsAccompanying
      });
    } else if (formData.role === "Team Delegation Lead") {
      res = await submitTeamApplication({
        ...payload,
        teamName: formData.teamName,
        teamSize: formData.teamSize
      }, formData.teamMembers);
    } else {
      res = await submitApplication(payload);
    }

    setIsSubmitting(false);

    if (res.success) {
      logActivity({
        userId,
        actorName: profile?.displayName || "Delegate",
        actorRole: formData.role,
        type: "application_submitted",
        action: "submitted an application for",
        targetId: event.id,
        targetTitle: event.title,
        isPublic: true,
      });

      // Paid role → send the delegate straight to the active gateway's hosted checkout
      // (Stripe or ZiniPay — the App Admin decides which; the route returns the URL).
      if (totalFee > 0 && res.id) {
        setIsRedirectingToPay(true);
        try {
          const resp = await fetch("/api/payments/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ applicationId: res.id, eventId: event.id }),
          });
          const data = await resp.json();
          if (resp.ok && data.url) {
            window.location.href = data.url; // redirect to Stripe-hosted page
            return;
          }
          // Payment couldn't start — application is saved as unpaid; let them retry from Payments.
          setPayWarning(data.error || "Could not start payment. You can pay later from the Payments page.");
        } catch {
          setPayWarning("Could not reach payment service. You can pay later from the Payments page.");
        }
        setIsRedirectingToPay(false);
      }

      setIsSuccess(true);
    } else if (res.error === "already_applied") {
      setSubmitError("You have already applied to this event. You can't apply twice.");
    } else {
      setSubmitError("Failed to submit application. Please try again.");
    }
  };

  if (isSuccess) {
    return (
      <div className="mp-wiz-outcome">
        <span className="mp-wiz-outcome-icon" aria-hidden="true"><Check size={26} strokeWidth={2.2} /></span>
        <h2 className="mp-wiz-outcome-title">Application Submitted!</h2>
        <p>
          Your application for {event.title} has been successfully submitted. You can track its status in your dashboard.
        </p>
        {payWarning && (
          <div className="mp-alert mp-alert-warn mp-wiz-paywarn" role="status">
            <AlertTriangle className="size-4" aria-hidden="true" />
            <div className="mp-alert-body">
              {payWarning}
              <Link href="/dashboard/payments" className="mp-wiz-paylink">Go to Payments</Link>
            </div>
          </div>
        )}
        <Link href="/dashboard/conferences" className="mp-btn mp-btn-solid mp-btn-lg">
          Go to My Conferences
        </Link>
      </div>
    );
  }

  // Derived data for choices
  const getCountriesForCommittee = (committeeName: string) => {
    const committee = event.committees?.find(c => c.name === committeeName);
    return committee?.countries || [];
  };

  const canAdvance = validateStep();
  const isLast = currentStep === STEPS.length - 1;
  const busy = isSubmitting || isRedirectingToPay;

  const committeeHelp = "Pick a committee, then rank up to 3 countries within it. The same country can't be chosen twice.";

  return (
    <div className="mp-wiz">
      {/* Desktop: labelled stepper. Phone: four-segment bar + "Step N of 4 · Title". */}
      <ol className="mp-wiz-steps" aria-label="Application steps">
        {STEPS.map((label, i) => {
          const state = i < currentStep ? "is-done" : i === currentStep ? "is-on" : "";
          return (
            <li key={label} className={`mp-wiz-st ${state}`} aria-current={i === currentStep ? "step" : undefined}>
              <i aria-hidden="true">{i < currentStep ? <Check size={15} strokeWidth={2.6} /> : i + 1}</i>
              <span className="mp-wiz-st-label">{label}</span>
              {i < STEPS.length - 1 && <span className="mp-wiz-st-ln" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
      <div className="mp-wiz-mprog" aria-hidden="true">
        <div className="mp-wiz-mbar">
          {STEPS.map((label, i) => <i key={label} className={i <= currentStep ? "is-on" : ""} />)}
        </div>
        <span>Step {currentStep + 1} of {STEPS.length} · {STEPS[currentStep]}</span>
      </div>

      <div className="mp-wiz-body" key={currentStep}>
        <div className="mp-wiz-head">
          <h2>{STEPS[currentStep]}</h2>
          <p>{STEP_DESCRIPTIONS[currentStep]}</p>
        </div>

        {currentStep === 0 && (
          <>
            {noRolesOpen && (
              <InlineError tone="warn">
                Applications are currently closed for this event. Every role is outside its application window.
              </InlineError>
            )}
            <div className="mp-wiz-roles" role="radiogroup" aria-label="Participation role">
              {roleOptions.map((role) => {
                const teamRole = role.role === TEAM_ROLE;
                const closed = !role.open;
                const on = !closed && formData.role === role.role;
                return (
                  <label
                    key={role.role}
                    className={`mp-wiz-role${on ? " is-on" : ""}${closed ? " is-off" : ""}`}
                  >
                    <input
                      type="radio"
                      name="mp-wiz-role"
                      value={role.role}
                      checked={formData.role === role.role}
                      disabled={closed}
                      onChange={() => updateFormData("role", role.role)}
                      className="sr-only"
                    />
                    <span className="mp-wiz-dot" aria-hidden="true" />
                    <span className="mp-wiz-role-main">
                      <span className="mp-wiz-role-top">
                        <b>{role.label}</b>
                        {closed ? (
                          <span className="mp-pill mp-pill-mute">{closedLabel || "Closed"}</span>
                        ) : (
                          <span className="mp-wiz-role-price">
                            {role.phase === "early" && role.price > 0 && <span className="mp-pill mp-pill-ok">Early bird</span>}
                            {role.price > 0
                              ? <b>${role.price}{teamRole ? " / member" : ""}</b>
                              : <span className="mp-pill mp-pill-mute">Free</span>}
                            {role.phase === "late" && role.price > 0 && <span className="mp-pill mp-pill-wait">Late price</span>}
                          </span>
                        )}
                      </span>
                      <span className="mp-wiz-role-desc">{ROLE_DESCRIPTIONS[role.role] || ""}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {roleOptions.length === 0 && (
              <p className="mp-empty">No application roles are open for this event yet.</p>
            )}
          </>
        )}

        {currentStep === 1 && (
          <>
            {registrationFull && (
              <div className="mp-alert mp-alert-sig" role="status">
                <AlertTriangle className="size-4" aria-hidden="true" />
                <div className="mp-alert-body">
                  Registration is full for this event — all committees have reached capacity. Please check back later or contact the organizers.
                </div>
              </div>
            )}
            {isFacultyRole ? (
              <section className="mp-wiz-card" aria-label="Faculty Advisor">
                <h3>Faculty Advisor</h3>
                <div className="mp-wiz-fld">
                  <label htmlFor="wiz-inst">Institution Name <span className="mp-req">*</span></label>
                  <Input id="wiz-inst" placeholder="e.g., Harvard University" value={formData.institutionName} onChange={(e) => updateFormData("institutionName", e.target.value)} />
                </div>
                <div className="mp-wiz-grid2">
                  <div className="mp-wiz-fld">
                    <label htmlFor="wiz-students">Students Accompanying <span className="mp-req">*</span></label>
                    <Input id="wiz-students" type="number" min="1" value={formData.studentsAccompanying || ""} onChange={(e) => updateFormData("studentsAccompanying", parseInt(e.target.value))} />
                  </div>
                  <div className="mp-wiz-fld">
                    <label htmlFor="wiz-years">Years Teaching MUN <span className="mp-req">*</span></label>
                    <Input id="wiz-years" placeholder="e.g., 5 years" value={formData.yearsTeaching} onChange={(e) => updateFormData("yearsTeaching", e.target.value)} />
                  </div>
                </div>
                <div className="mp-wiz-fld">
                  <label htmlFor="wiz-position">Faculty Position <span className="mp-req">*</span></label>
                  <Input id="wiz-position" placeholder="e.g., History Teacher, Professor of Law" value={formData.facultyPosition} onChange={(e) => updateFormData("facultyPosition", e.target.value)} />
                </div>
              </section>
            ) : (
              <>
                {isTeam && (
                  <section className="mp-wiz-card" aria-label="Team Details">
                    <h3>Team Details</h3>
                    <div className="mp-wiz-fld">
                      <label htmlFor="wiz-team-inst">Institution Name <span className="mp-req">*</span></label>
                      <Input id="wiz-team-inst" placeholder="e.g., Harvard University" value={formData.institutionName} onChange={(e) => updateFormData("institutionName", e.target.value)} />
                    </div>
                    <div className="mp-wiz-grid2 mp-wiz-grid2-team">
                      <div className="mp-wiz-fld">
                        <label htmlFor="wiz-team-name">Team Name <span className="mp-req">*</span></label>
                        <Input id="wiz-team-name" placeholder="e.g., Harvard A" value={formData.teamName} onChange={(e) => updateFormData("teamName", e.target.value)} />
                      </div>
                      <div className="mp-wiz-fld">
                        <label htmlFor="wiz-team-size">Team Size (3-15) <span className="mp-req">*</span></label>
                        <Input id="wiz-team-size" type="number" min="3" max="15" value={formData.teamSize} onChange={(e) => updateFormData("teamSize", parseInt(e.target.value))} />
                      </div>
                    </div>
                    <div className="mp-wiz-fld">
                      <span className="mp-wiz-fl" id="wiz-csv-label">Upload Team Members (CSV)</span>
                      <label className="mp-wiz-drop">
                        <input
                          type="file"
                          accept=".csv"
                          className="sr-only"
                          aria-labelledby="wiz-csv-label"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                const text = event.target?.result as string;
                                const lines = text.split('\n').slice(1); // skip header
                                const parsedMembers = lines.filter(l => l.trim()).map(line => {
                                  const [name, email] = line.split(',');
                                  return { name: name?.trim() || '', email: email?.trim() || '' };
                                });
                                updateFormData("teamMembers", parsedMembers);
                              };
                              reader.readAsText(file);
                            }
                          }}
                        />
                        <FileUp size={20} aria-hidden="true" />
                        <span className="mp-wiz-drop-text">
                          <b>Choose a .csv file</b>
                          <span className="mp-wiz-help">Format: name, email</span>
                        </span>
                      </label>
                      {formData.teamMembers.length > 0 && (
                        <span className="mp-wiz-help mp-wiz-ok" role="status">
                          Loaded {formData.teamMembers.length} team members from CSV.
                        </span>
                      )}
                    </div>
                    <span className="mp-wiz-sub">Delegation Preferences (applies to all members)</span>
                  </section>
                )}
                {/* Ranked committee choices — each with its own ranked countries */}
                {multiCommittee && (
                  <div className="mp-alert mp-wiz-note">
                    <Info className="size-4" aria-hidden="true" />
                    <div className="mp-alert-body">
                      Rank up to {committeeChoicesAllowed} committees in order of preference. Only your 1st choice is required. {committeeHelp}
                    </div>
                  </div>
                )}
                {formData.committeePrefs.map((block, b) => {
                  const committeeCountries = getCountriesForCommittee(block.committee);
                  // Committees picked in OTHER blocks — can't rank the same committee twice.
                  const takenCommittees = formData.committeePrefs
                    .filter((_, i) => i !== b)
                    .map(x => x.committee)
                    .filter(Boolean);
                  const fields = (
                    <>
                      <div className="mp-wiz-fld">
                        <span className="mp-wiz-fl" id={`wiz-com-${b}`}>Committee {b === 0 && <span className="mp-req">*</span>}</span>
                        <Select
                          value={block.committee}
                          onValueChange={(val) => updateCommittee(b, val || "")}
                        >
                          <SelectTrigger className="w-full" aria-labelledby={`wiz-com-${b}`}>
                            <SelectValue placeholder="Select a committee" />
                          </SelectTrigger>
                          <SelectContent className="mun-paper">
                            {event.committees && event.committees.length > 0 ? (
                              event.committees.map(c => {
                                const full = committeeFull(c.name);
                                const dup = takenCommittees.includes(c.name);
                                return (
                                  <SelectItem key={c.name} value={c.name} disabled={full || dup}>
                                    {c.name}{full ? " — Full" : dup ? " — Already chosen" : ""}
                                  </SelectItem>
                                );
                              })
                            ) : (
                              <SelectItem value="none" disabled>No committees available</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        {!multiCommittee && <span className="mp-wiz-help">{committeeHelp}</span>}
                      </div>

                      <div className={multiCommittee ? "mp-wiz-grid3" : "mp-wiz-stack"}>
                        {[0, 1, 2].map((i) => {
                          const taken = block.countries.filter((c, idx) => idx !== i && c);
                          const available = committeeCountries.filter(c => !taken.includes(c));
                          const value = block.countries[i];
                          return (
                            <div key={i} className="mp-wiz-fld">
                              <span className="mp-wiz-fl" id={`wiz-c-${b}-${i}`}>
                                {RANK_LABELS[i]} {i === 0 && b === 0 && <span className="mp-req">*</span>}
                              </span>
                              <Select
                                value={value}
                                onValueChange={(val) => updateCountryPref(b, i, val || "")}
                                disabled={!block.committee}
                              >
                                <SelectTrigger className="w-full" aria-labelledby={`wiz-c-${b}-${i}`}>
                                  <SelectValue placeholder={i === 0 ? "Select a country" : "Optional"}>
                                    {value ? <CountryLabel code={value} /> : null}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent className="mun-paper">
                                  {committeeCountries.length > 0 ? (
                                    available.map(country => (
                                      <SelectItem key={country} value={country}>
                                        <CountryLabel code={country} />
                                      </SelectItem>
                                    ))
                                  ) : (
                                    <SelectItem value="any">Any Available Country</SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                  return multiCommittee ? (
                    <section key={b} className={`mp-wiz-pb${b === 0 ? " is-first" : ""}`} aria-label={`${RANK_LABELS[b] || `Choice ${b + 1}`} committee`}>
                      <div className="mp-wiz-pbh">
                        <span className="mp-wiz-rank">{b + 1}</span>
                        <b>{RANK_LABELS[b] || `Choice ${b + 1}`} committee</b>
                        {b > 0 && <span className="mp-wiz-opt">(optional)</span>}
                      </div>
                      {fields}
                    </section>
                  ) : (
                    <div key={b} className="mp-wiz-single">{fields}</div>
                  );
                })}
              </>
            )}
          </>
        )}

        {currentStep === 2 && (
          <>
            <div className="mp-wiz-fld">
              <label htmlFor="experience">
                {isFacultyRole ? "Supervisor Experience" : "Previous MUN Experience"} <span className="mp-req">*</span>
              </label>
              <span className="mp-wiz-help" id="experience-help">
                {isFacultyRole ? "Briefly list your experience accompanying or supervising student groups." : "Briefly list your previous conferences, roles, and any awards."}
              </span>
              <div className="mp-ta">
                <textarea
                  id="experience"
                  aria-describedby="experience-help"
                  placeholder={isFacultyRole ? "e.g., Supervised Harvard MUN delegations in 2022 and 2023..." : "e.g., Harvard MUN 2024 (Delegate of France, WHO) - Honorable Mention..."}
                  value={formData.experience}
                  onChange={(e) => updateFormData("experience", e.target.value)}
                />
                <AiTextareaAssist
                  value={formData.experience}
                  onPick={(t) => updateFormData("experience", t)}
                  surface="application-experience"
                  context={{ eventName: event.title }}
                />
              </div>
            </div>
            <div className="mp-wiz-fld">
              <label htmlFor="motivation">
                {isFacultyRole ? "Motivation for Participating" : "Motivation for Choices"} <span className="mp-req">*</span>
              </label>
              <span className="mp-wiz-help" id="motivation-help">
                {isFacultyRole ? "Why is your institution participating in this conference?" : "Why do you want to participate in this conference and represent your chosen countries?"}
              </span>
              <div className="mp-ta">
                <textarea
                  id="motivation"
                  aria-describedby="motivation-help"
                  placeholder="I am deeply interested in global health policies..."
                  value={formData.motivation}
                  onChange={(e) => updateFormData("motivation", e.target.value)}
                />
                <AiTextareaAssist
                  value={formData.motivation}
                  onPick={(t) => updateFormData("motivation", t)}
                  surface="application-motivation"
                  context={{ eventName: event.title }}
                />
              </div>
            </div>
          </>
        )}

        {currentStep === 3 && (
          <>
            <dl className="mp-wiz-rv">
              <dt>Applying As</dt>
              <dd><b>{formData.role}</b></dd>
              {!isFacultyRole && (
                <>
                  <dt>Your Preferences</dt>
                  <dd className="mp-wiz-rv-prefs">
                    {formData.committeePrefs.filter(b => b.committee).map((block, b) => (
                      <div key={b} className="mp-wiz-rv-pref">
                        <span>
                          <b>{multiCommittee ? `${RANK_LABELS[b] || `Choice ${b + 1}`} committee` : "Committee"}</b> · {block.committee || "—"}
                        </span>
                        <span className="mp-wiz-rv-countries">
                          {block.countries.filter(Boolean).map((country, idx) => (
                            <span key={idx}>{idx + 1}. <CountryLabel code={country} size={14} /></span>
                          ))}
                        </span>
                      </div>
                    ))}
                  </dd>
                </>
              )}
              <dt>Experience</dt>
              <dd className="mp-wiz-rv-text">{formData.experience}</dd>
              <dt>Motivation</dt>
              <dd className="mp-wiz-rv-text">{formData.motivation}</dd>
            </dl>

            {totalFee > 0 && (
              <div className="mp-wiz-fee">
                <div>
                  <b>Registration Fee — {formData.role}</b>
                  <span>
                    {isTeam
                      ? `$${perPersonFee} per member × ${formData.teamSize} members. You'll be redirected to secure Stripe checkout after submitting.`
                      : "You'll be redirected to secure Stripe checkout after submitting."}
                  </span>
                </div>
                <strong>${totalFee}</strong>
              </div>
            )}

            {submitError && <InlineError>{submitError}</InlineError>}
          </>
        )}
      </div>

      <div className="mp-wiz-foot">
        <button
          type="button"
          className="mp-btn mp-btn-sec mp-wiz-back"
          onClick={handleBack}
          disabled={currentStep === 0 || isSubmitting}
        >
          <ChevronLeft size={16} aria-hidden="true" /> Back
        </button>
        <span className="mp-wiz-count">Step {currentStep + 1} of {STEPS.length}</span>
        {!isLast ? (
          <button
            type="button"
            className={`mp-btn mp-wiz-next ${canAdvance ? "mp-btn-solid" : "mp-btn-off"}`}
            onClick={handleNext}
            disabled={!canAdvance}
          >
            Next <ChevronRight size={16} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            className={`mp-btn mp-btn-lg mp-wiz-next ${canAdvance || busy ? "mp-btn-solid" : "mp-btn-off"}`}
            onClick={handleSubmit}
            disabled={!canAdvance || busy}
          >
            {isRedirectingToPay
              ? "Redirecting to payment…"
              : isSubmitting
              ? "Submitting..."
              : totalFee > 0
              ? `Submit & Pay $${totalFee}`
              : "Submit Application"}
          </button>
        )}
      </div>
    </div>
  );
}
