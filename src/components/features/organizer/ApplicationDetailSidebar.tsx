"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserProfile, UserProfile } from "@/lib/services/userService";
import { updateApplication, isAwaitingPayment, eventRequiresPayment, getAppCommitteePreferences, ApplicationData } from "@/lib/services/applicationService";
import { EventData } from "@/lib/services/eventService";
import { notifyApplicationApproved } from "@/lib/services/notifyService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  X, Mail, Building2, BookOpen, Briefcase, User, CheckCircle, XCircle,
  Loader2, Phone, Calendar, MapPin, Users, Heart, Clock, Star
} from "lucide-react";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getCountryName } from "@/lib/data/countries";
import { sameCommittee } from "@/lib/utils/committee";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ApplicationDetailSidebarProps {
  application: (ApplicationData & { id: string }) | null;
  event?: EventData | null;
  // All applications for this event — used to grey out country seats already held
  // by another approved delegate in the selected committee.
  applications?: (ApplicationData & { id: string })[];
  onClose: () => void;
  onStatusUpdate?: (appId: string, newStatus: "approved" | "rejected", assignedCommittee?: string, assignedCountry?: string) => void;
}

export function ApplicationDetailSidebar({
  application,
  event,
  applications,
  onClose,
  onStatusUpdate
}: ApplicationDetailSidebarProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Committee & Country assignment state
  const [assignedCommittee, setAssignedCommittee] = useState<string>("");
  const [assignedCountry, setAssignedCountry] = useState<string>("");

  useEffect(() => {
    if (!application?.userId) {
      setProfile(null);
      return;
    }

    async function fetchProfile() {
      setLoadingProfile(true);
      const userProfile = await getUserProfile(application!.userId).catch(() => null);
      setProfile(userProfile);
      setLoadingProfile(false);
    }

    fetchProfile();

    // Default the assignment dropdowns to the applicant's top preference (when not
    // already assigned) so the organizer just confirms or overrides.
    const topPref = getAppCommitteePreferences(application)[0];
    setAssignedCommittee(application.assignedCommittee || topPref?.committee || "");
    setAssignedCountry(application.assignedCountry || (topPref?.countries[0] && topPref.countries[0] !== "any" ? topPref.countries[0] : ""));
  }, [application]);

  if (!application) return null;

  const statusColor = (s: string) => {
    switch (s) {
      case "approved": return "bg-green-500/10 text-green-500 hover:bg-green-500/20";
      case "rejected": return "bg-destructive/10 text-destructive hover:bg-destructive/20";
      default: return "bg-secondary text-secondary-foreground";
    }
  };

  const handleUpdateStatus = async (newStatus: "approved" | "rejected") => {
    // Guard: a paid-event application can't be approved until payment clears.
    if (newStatus === "approved" && isAwaitingPayment(application, event)) {
      alert("This applicant hasn't paid the registration fee yet. They can't be approved until payment is confirmed.");
      return;
    }
    setIsUpdating(true);
    try {
      const updateData: Partial<ApplicationData> = { status: newStatus };
      if (newStatus === "approved") {
        if (assignedCommittee) updateData.assignedCommittee = assignedCommittee;
        if (assignedCountry) updateData.assignedCountry = assignedCountry;
      }
      
      const res = await updateApplication(application.id, updateData);
      if (res.success && newStatus === "approved" && application.applicantEmail) {
        notifyApplicationApproved(application.applicantEmail, event?.title || "the conference", application.role, application.eventId,
          { committee: assignedCommittee || undefined, country: assignedCountry || undefined });
      }
      if (res.success) {
        if (onStatusUpdate) {
          onStatusUpdate(application.id, newStatus, assignedCommittee, assignedCountry);
        }
      } else {
        alert(typeof res.error === "string" ? res.error : "Failed to update application status.");
      }
    } catch (err) {
      console.error(err);
      alert("Error updating application.");
    } finally {
      setIsUpdating(false);
    }
  };

  const getCountriesForCommittee = (committeeName: string) => {
    if (!event) return [];
    const committee = event.committees?.find(c => c.name === committeeName);
    return committee?.countries || [];
  };

  // Applicant's own preferences — used to highlight the committee/country they asked
  // for inside the organizer's assignment dropdowns.
  const prefs = getAppCommitteePreferences(application);
  const committeePrefRank = (name: string) => prefs.findIndex(p => sameCommittee(p.committee, name));
  const selectedCommitteePref = prefs.find(p => sameCommittee(p.committee, assignedCommittee));
  const prefCountries = (selectedCommitteePref?.countries || []).filter(c => c && c !== "any");
  const countryPrefRank = (code: string) =>
    prefCountries.findIndex(c => c.toUpperCase() === (code || "").toUpperCase());

  // Country seats (committee + country) already held by ANOTHER approved delegate in
  // the currently-selected committee — greyed out so a seat can't be double-booked.
  const takenCountryCodes = new Set(
    (applications || [])
      .filter(a =>
        a.id !== application.id &&
        a.status === "approved" &&
        a.assignedCountry &&
        sameCommittee(a.assignedCommittee, assignedCommittee))
      .map(a => a.assignedCountry!.toLowerCase())
  );
  const isTaken = (code: string) => takenCountryCodes.has((code || "").toLowerCase());

  return (
    <Sheet open={!!application} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="overflow-y-auto w-full sm:max-w-md p-6 gap-6 flex flex-col bg-background border-l border-border/40">
        <SheetHeader className="p-0 border-b border-border/40 pb-4">
          <div className="flex justify-between items-start">
            <div>
              <SheetTitle className="text-xl font-bold font-heading">Applicant Profile</SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground mt-1">
                View submitted data and onboarding profile details.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {loadingProfile ? (
          <div className="space-y-4 flex-1">
            <div className="flex items-center gap-3">
              <Skeleton className="w-12 h-12 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
        ) : (
          <div className="space-y-6 flex-1 flex flex-col justify-between">
            <div className="space-y-6">
              {/* Header profile info */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xl border border-primary/20 shadow-inner">
                  {(profile?.displayName || application.applicantName || application.role || "?")[0]?.toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-base leading-snug">
                    {profile?.displayName || application.applicantName || "Unknown Delegate"}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="secondary" className="text-[10px] uppercase font-bold py-0">{application.role}</Badge>
                    <Badge className={statusColor(application.status)}>{application.status}</Badge>
                    {eventRequiresPayment(event) && (
                      application.paymentStatus === "paid" ? (
                        <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20 text-[10px]">Paid</Badge>
                      ) : application.paymentStatus === "refunded" ? (
                        <Badge className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 text-[10px]">Refunded</Badge>
                      ) : (
                        <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 text-[10px]">Unpaid</Badge>
                      )
                    )}
                  </div>
                </div>
              </div>

              {/* Basic user info */}
              <div className="bg-secondary rounded-2xl border border-border/40 p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">User Information</p>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="w-4 h-4 shrink-0 text-primary" />
                    <span className="truncate text-foreground font-medium">{application.applicantEmail || profile?.email || "No email"}</span>
                  </div>
                  {/* The applicant's contact travels on the application (their profile keeps it private). */}
                  {(application.applicantPhone || profile?.phoneNumber) && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="w-4 h-4 shrink-0 text-primary" />
                      <span className="text-foreground font-medium">{application.applicantPhone || profile?.phoneNumber}</span>
                    </div>
                  )}
                  {profile?.institution && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Building2 className="w-4 h-4 shrink-0 text-primary" />
                      <span className="text-foreground font-medium">{profile.institution}</span>
                    </div>
                  )}
                </div>
                {profile?.bio && (
                  <div className="border-t border-border/40 pt-3 mt-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Bio</p>
                    <p className="text-xs text-muted-foreground leading-relaxed italic">{profile.bio}</p>
                  </div>
                )}
              </div>

              {/* Ranked committee preferences (each with its own ranked countries) */}
              {application.role !== "Faculty Advisor" && (() => {
                const prefs = getAppCommitteePreferences(application);
                if (prefs.length === 0) return null;
                const multi = prefs.length > 1;
                return (
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {multi ? "Ranked Committee Choices" : "Preferred Choice"}
                    </p>
                    <div className="space-y-2">
                      {prefs.map((pref, idx) => (
                        <div key={idx} className="bg-secondary p-3 rounded-xl border border-border/20 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            {multi && (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold shrink-0">{idx + 1}</span>
                            )}
                            <p className="font-bold text-foreground flex-1 text-right">{pref.committee}</p>
                          </div>
                          <div className="flex flex-wrap gap-1.5 justify-end">
                            {pref.countries.length > 0 ? (
                              pref.countries.map((c, i) => (
                                <span key={i} className="inline-flex items-center gap-1 bg-background rounded-md px-1.5 py-0.5 text-[10px] border border-border/30">
                                  <span className="text-muted-foreground font-semibold">{i + 1}.</span>
                                  {c !== "any" ? (
                                    <>
                                      <CountryFlag code={c} size={12} />
                                      {getCountryName(c)}
                                    </>
                                  ) : "Any"}
                                </span>
                              ))
                            ) : (
                              <span className="text-muted-foreground text-[10px]">Any country</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Role-Specific details */}
              {application.role === "Faculty Advisor" && (
                <div className="bg-secondary rounded-2xl border border-border/40 p-4 space-y-3 text-xs">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Faculty Advisor Information</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-muted-foreground">Position</p>
                      <p className="font-bold text-foreground">{application.facultyPosition || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Teaching Experience</p>
                      <p className="font-bold text-foreground">{application.yearsTeaching || "N/A"}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Accompanying Students</p>
                      <p className="font-bold text-foreground">{application.studentsAccompanying || 0} delegates</p>
                    </div>
                  </div>
                </div>
              )}

              {application.role === "Team Delegation Lead" && (
                <div className="bg-secondary rounded-2xl border border-border/40 p-4 space-y-3 text-xs">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Team Details</p>
                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <div>
                      <p className="text-muted-foreground">Team Name</p>
                      <p className="font-bold text-foreground">{application.teamName || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Team Size</p>
                      <p className="font-bold text-foreground">{application.teamSize || 0} members</p>
                    </div>
                  </div>
                  {application.teamMembers && application.teamMembers.length > 0 && (
                    <div className="border-t border-border/40 pt-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Members List</p>
                      <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                        {application.teamMembers.map((m, i) => (
                          <div key={i} className="bg-background p-2 rounded-lg border border-border/20">
                            <p className="font-bold text-foreground text-[11px]">{m.name}</p>
                            <p className="text-muted-foreground text-[10px]">{m.email}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Experience and Motivation */}
              <div className="space-y-4">
                {application.experience && (
                  <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Briefcase className="w-3.5 h-3.5" />
                      {application.role === "Faculty Advisor" ? "Supervisor Experience" : "Previous MUN Experience"}
                    </p>
                    <p className="text-xs text-foreground bg-secondary p-3 rounded-xl border border-border/20 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                      {application.experience}
                    </p>
                  </div>
                )}
                {application.motivation && (
                  <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Heart className="w-3.5 h-3.5 text-rose-500" />
                      {application.role === "Faculty Advisor" ? "Motivation for Participating" : "Motivation for Choices"}
                    </p>
                    <p className="text-xs text-foreground bg-secondary p-3 rounded-xl border border-border/20 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                      {application.motivation}
                    </p>
                  </div>
                )}
              </div>

              {/* Assignments Display (if approved) */}
              {application.status === "approved" && (
                <div className="bg-green-500/5 rounded-2xl border border-green-500/20 p-4 space-y-2 text-xs">
                  <p className="text-xs font-bold uppercase tracking-wider text-green-600">Event Assignment</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-muted-foreground">Assigned Committee</p>
                      <p className="font-bold text-foreground">{application.assignedCommittee || "None"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Assigned Country</p>
                      {application.assignedCountry ? (
                        <p className="font-bold text-foreground inline-flex items-center gap-1.5">
                          <CountryFlag code={application.assignedCountry} size={16} />
                          {getCountryName(application.assignedCountry)}
                        </p>
                      ) : (
                        <p className="font-bold text-foreground">None</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions & Decision Panel */}
            <div className="border-t border-border/40 pt-4 mt-6 space-y-4">
              {isAwaitingPayment(application, event) && application.status !== "rejected" && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                  <Clock className="w-4 h-4 mt-0.5 shrink-0" />
                  <p>Registration fee unpaid. This applicant can&apos;t be approved until Stripe confirms payment.</p>
                </div>
              )}
              {application.status === "pending" && event && (
                <div className="space-y-3 bg-secondary p-4 rounded-2xl border border-border/30">
                  <p className="text-xs font-bold uppercase tracking-wider text-foreground">Approve Application Settings</p>
                  <div className="space-y-3 text-xs">
                    <div>
                      <Label htmlFor="assign-committee" className="text-[11px] font-semibold text-muted-foreground">Assign Committee</Label>
                      <Select value={assignedCommittee} onValueChange={(val) => {
                        setAssignedCommittee(val || "");
                        setAssignedCountry("");
                      }}>
                        <SelectTrigger className="mt-1 w-full">
                          <SelectValue placeholder="Select committee" />
                        </SelectTrigger>
                        <SelectContent>
                          {event.committees?.map(c => {
                            const rank = committeePrefRank(c.name);
                            const preferred = rank >= 0;
                            return (
                              <SelectItem
                                key={c.name}
                                value={c.name}
                                className={preferred ? "text-primary dark:text-primary" : ""}
                              >
                                <div className="flex items-center justify-between w-full gap-2 pr-2">
                                  <span className={cn("truncate min-w-0", preferred && "font-semibold")}>{c.name}</span>
                                  {preferred && (
                                    <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-0.5 text-[9px] font-bold text-primary dark:text-primary shrink-0">
                                      <Star className="w-2.5 h-2.5 fill-current" />
                                      {prefs.length > 1 ? `#${rank + 1}` : "Preferred"}
                                    </span>
                                  )}
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="assign-country" className="text-[11px] font-semibold text-muted-foreground">Assign Country</Label>
                      <Select 
                        value={assignedCountry} 
                        onValueChange={(val) => setAssignedCountry(val || "")}
                        disabled={!assignedCommittee}
                      >
                        <SelectTrigger className="mt-1 w-full">
                          <SelectValue placeholder="Select country">
                            {assignedCountry ? (
                              <span className="inline-flex items-center gap-2">
                                <CountryFlag code={assignedCountry} size={16} />
                                <span>{getCountryName(assignedCountry)}</span>
                              </span>
                            ) : null}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <TooltipProvider>
                          {getCountriesForCommittee(assignedCommittee).map(country => {
                            const rank = countryPrefRank(country);
                            const preferred = rank >= 0;
                            const taken = isTaken(country);
                            const inner = (
                              <>
                                <span className="inline-flex items-center gap-2 min-w-0">
                                  <CountryFlag code={country} size={16} />
                                  <span className={cn("truncate", preferred && !taken && "font-semibold")}>{getCountryName(country)}</span>
                                </span>
                                <span className="inline-flex items-center gap-1 shrink-0">
                                  {preferred && !taken && (
                                    <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-0.5 text-[9px] font-bold text-primary dark:text-primary">
                                      <Star className="w-2.5 h-2.5 fill-current" />
                                      {`#${rank + 1}`}
                                    </span>
                                  )}
                                  {taken && (
                                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Taken</span>
                                  )}
                                </span>
                              </>
                            );
                            return (
                              <SelectItem
                                key={country}
                                value={country}
                                disabled={taken}
                                className={cn(
                                  preferred && !taken && "text-primary dark:text-primary",
                                  taken && "opacity-50 cursor-not-allowed"
                                )}
                              >
                                {taken ? (
                                  <Tooltip>
                                    {/* pointer-events-auto re-enables hover that the disabled
                                        item's pointer-events-none would otherwise kill */}
                                    <TooltipTrigger render={<div className="flex items-center justify-between w-full gap-2 pr-2 pointer-events-auto cursor-not-allowed" />}>
                                      {inner}
                                    </TooltipTrigger>
                                    <TooltipContent>Already assigned for another delegate</TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <div className="flex items-center justify-between w-full gap-2 pr-2">{inner}</div>
                                )}
                              </SelectItem>
                            );
                          })}
                          </TooltipProvider>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                {application.status !== "approved" && (
                  <Button
                    className="flex-1 gap-2 bg-green-600 hover:bg-green-700 text-white font-bold"
                    onClick={() => handleUpdateStatus("approved")}
                    disabled={isUpdating || isAwaitingPayment(application, event)}
                    title={isAwaitingPayment(application, event) ? "Applicant must pay before approval" : undefined}
                  >
                    {isUpdating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isAwaitingPayment(application, event) ? (
                      <Clock className="w-4 h-4" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                    {isAwaitingPayment(application, event) ? "Unpaid" : "Approve"}
                  </Button>
                )}
                {application.status !== "rejected" && (
                  <Button
                    variant="outline"
                    className="flex-1 gap-2 text-destructive border-destructive/20 hover:bg-destructive/10 font-bold"
                    onClick={() => handleUpdateStatus("rejected")}
                    disabled={isUpdating}
                  >
                    {isUpdating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                    Reject
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
