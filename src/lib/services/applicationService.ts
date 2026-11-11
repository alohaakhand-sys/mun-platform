import { collection, collectionGroup, addDoc, serverTimestamp, doc, query, where, getDocs, orderBy, updateDoc, getDoc, writeBatch, limit, increment } from "firebase/firestore";
import { seatDelta } from "@/lib/data/eventPlan";
import { syncMembers } from "./membershipService";
import { db, auth } from "@/lib/firebase/client";
import { createGroupConversation } from "./messageService";
import { getEnabledRoleTiers, getEffectiveRoleUnitPrice, type EventData } from "./eventService";

/** @deprecated Legacy per-choice shape. New apps use `preferredCommittee` + `countryPreferences`. */
export interface ApplicationChoice {
  committee: string;
  country: string;
}

/** One ranked committee choice with its own ranked countries (within that committee). */
export interface CommitteePreference {
  committee: string;
  countries: string[];
}

export interface ApplicationData {
  id?: string;
  eventId: string;
  userId: string;
  applicantName?: string;
  applicantEmail?: string;
  /** Copied at submit: the applicant's own phone stays private on their profile. */
  applicantPhone?: string;
  role: "Delegate" | "Observer" | "Head Delegate" | "Faculty Advisor" | "Team Delegation Lead" | string;
  // Preferences (canonical, multi-committee): ranked committee choices, each with its
  // own ranked countries. Index 0 is the top choice.
  committeePreferences?: CommitteePreference[];
  // First committee mirror — kept so single-committee readers (availability gate,
  // allocation, conference cards) keep working unchanged. Mirrors committeePreferences[0].
  preferredCommittee?: string;
  countryPreferences?: string[];
  // Legacy mirror of the above, always written for backward-compatible readers.
  // Each slot carries the same committee; countries are the ranked preferences.
  // Prefer `getAppPreferences` for new code.
  choices: {
    primary: ApplicationChoice;
    secondary: ApplicationChoice;
    tertiary: ApplicationChoice;
  };
  experience: string;
  motivation: string;
  status: "pending" | "approved" | "rejected" | "past";
  // Payment. Written only by a server route (gateway webhook / verify), never the browser.
  paymentStatus?: "unpaid" | "paid" | "refunded";
  /** Amount owed in the event's own fee units — the ledger figure receipts total. */
  paidAmount?: number;
  /** Gateway reference: Stripe session id, or the ZiniPay invoice id. */
  stripeSessionId?: string;
  paidAt?: any;
  /** Which gateway collected it: "stripe" | "zinipay" | "dev". */
  paymentProvider?: string;
  /** What the gateway actually charged, when it differs from paidAmount (ZiniPay bills BDT). */
  paidChargedAmount?: number;
  paidCurrency?: string;
  paymentTransactionId?: string;
  paymentMethod?: string;
  // ZiniPay handshake — written at checkout, before the redirect. The webhook and the
  // return-verify both look the application up by this invoice id.
  zinipayInvoiceId?: string;
  zinipayChargedAmount?: number;
  zinipayCurrency?: string;
  // DEV ONLY (remove before production): true when marked paid via Developer
  // Payment Mode instead of a real Stripe charge.
  devPaid?: boolean;
  tierName?: string;
  assignedCommittee?: string;
  assignedCountry?: string;
  createdAt?: any;
  institutionName?: string;
  studentsAccompanying?: number;
  facultyPosition?: string;
  yearsTeaching?: string;
  teamSize?: number;
  teamName?: string;
  teamMembers?: { name: string; email: string }[];
  teamApplicationParentId?: string;
  delegationId?: string;
  delegationName?: string;
}

/**
 * Builds the legacy 3-choice `choices` object from the new single-committee +
 * ranked-countries model, so every existing reader keeps working unchanged.
 * All three slots share the one committee; countries are the ranked preferences.
 */
export function buildLegacyChoices(
  committee: string,
  countries: string[]
): { primary: ApplicationChoice; secondary: ApplicationChoice; tertiary: ApplicationChoice } {
  const slot = (i: number): ApplicationChoice => ({
    committee: committee || "",
    country: countries[i] || "",
  });
  return { primary: slot(0), secondary: slot(1), tertiary: slot(2) };
}

/**
 * Normalizes an application's preferences to `{ committee, countries }`, reading the
 * new `preferredCommittee`/`countryPreferences` fields and falling back to the legacy
 * `choices.{primary,secondary,tertiary}` shape for old documents.
 */
export function getAppPreferences(
  app: Pick<ApplicationData, "preferredCommittee" | "countryPreferences" | "choices">
): { committee: string; countries: string[] } {
  if (app.preferredCommittee !== undefined || app.countryPreferences) {
    return {
      committee: app.preferredCommittee || "",
      countries: (app.countryPreferences || []).filter(Boolean),
    };
  }
  const c = app.choices;
  if (!c) return { committee: "", countries: [] };
  const committee = c.primary?.committee || "";
  // Legacy: each choice was a committee+country pair; surface countries that share
  // the primary committee (the new model is single-committee anyway).
  const countries = [c.primary, c.secondary, c.tertiary]
    .filter((ch) => ch && ch.country && (!committee || ch.committee === committee))
    .map((ch) => ch.country);
  return { committee, countries };
}

/**
 * Returns the applicant's ranked committee preferences. Reads the new
 * `committeePreferences` array, falling back to the single-committee
 * `preferredCommittee`/`countryPreferences` (or legacy `choices`) for older docs.
 */
export function getAppCommitteePreferences(
  app: Pick<ApplicationData, "committeePreferences" | "preferredCommittee" | "countryPreferences" | "choices">
): CommitteePreference[] {
  if (app.committeePreferences && app.committeePreferences.length > 0) {
    return app.committeePreferences
      .filter((p) => p && p.committee)
      .map((p) => ({ committee: p.committee, countries: (p.countries || []).filter(Boolean) }));
  }
  const single = getAppPreferences(app);
  return single.committee ? [{ committee: single.committee, countries: single.countries }] : [];
}

// True when the event charges a registration fee (any accepted role carries a fee
// in ANY pricing window — regular, early-bird, or late).
export function eventRequiresPayment(
  event?: Pick<EventData, "roleTiers" | "ticketingTiers"> | null
): boolean {
  return getEnabledRoleTiers(event).some(
    (t) => t.price > 0 || (t.earlyBirdPrice ?? 0) > 0 || (t.latePrice ?? 0) > 0
  );
}

// A paid-event application can't progress (be approved) until the Stripe webhook
// has marked it paid. Free events / free roles are never blocked.
export function isAwaitingPayment(
  app: { paymentStatus?: string | null; role?: string },
  event?: Pick<EventData, "roleTiers" | "ticketingTiers" | "applicationSchedule" | "applicationCloseAt" | "date"> | null
): boolean {
  if (app.paymentStatus === "paid") return false;
  const tiers = getEnabledRoleTiers(event);
  // If we know the role, only block when THAT role carries a fee at the current
  // pricing phase (early-bird / regular / late) from the shared schedule.
  if (app.role) {
    const tier = tiers.find((t) => t.role === app.role);
    return !!tier && getEffectiveRoleUnitPrice(event, tier).price > 0;
  }
  return tiers.some((t) => getEffectiveRoleUnitPrice(event, t).price > 0);
}

export async function submitApplication(application: ApplicationData): Promise<{ success: boolean; id?: string; error?: any }> {
  try {
    // Guard against duplicate applications (e.g. form open in two tabs).
    if (await hasUserAppliedToEvent(application.userId, application.eventId)) {
      return { success: false, error: "already_applied" };
    }
    const applicationsRef = collection(db, "applications");
    const docRef = await addDoc(applicationsRef, {
      ...application,
      createdAt: serverTimestamp()
    });

    // Fire-and-forget: notify applicant + organizer via email
    fetch('/api/notify/application', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: application.eventId,
        applicantName: application.applicantName,
        applicantEmail: application.applicantEmail,
        role: application.role,
      }),
    }).catch(err => console.error('Application notify error:', err));

    return { success: true, id: docRef.id };
  } catch (error) {
    console.error("Error submitting application:", error);
    return { success: false, error };
  }
}

export async function submitTeamApplication(parentAppData: ApplicationData, teamMembers: any[]): Promise<{ success: boolean; id?: string; error?: any }> {
  try {
    const applicationsRef = collection(db, "applications");
    const parentDocRef = await addDoc(applicationsRef, {
      ...parentAppData,
      createdAt: serverTimestamp()
    });

    const batch = writeBatch(db);
    teamMembers.forEach(member => {
      const newDocRef = doc(applicationsRef);
      batch.set(newDocRef, {
        eventId: parentAppData.eventId,
        userId: member.email, // using email as placeholder for unregistered members
        applicantName: member.name,
        applicantEmail: member.email,
        role: "Delegate",
        // Whole delegation shares the lead's committee + country preferences.
        committeePreferences: parentAppData.committeePreferences || [],
        preferredCommittee: parentAppData.preferredCommittee || "",
        countryPreferences: parentAppData.countryPreferences || [],
        choices: buildLegacyChoices(parentAppData.preferredCommittee || "", parentAppData.countryPreferences || []),
        experience: parentAppData.experience,
        motivation: parentAppData.motivation,
        status: "pending",
        teamApplicationParentId: parentDocRef.id,
        delegationId: parentDocRef.id,
        delegationName: parentAppData.teamName,
        institutionName: parentAppData.institutionName,
        createdAt: serverTimestamp()
      });
    });

    await batch.commit();

    // Notify organizer and parent applicant
    fetch('/api/notify/application', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: parentAppData.eventId,
        applicantName: parentAppData.applicantName,
        applicantEmail: parentAppData.applicantEmail,
        role: parentAppData.role,
      }),
    }).catch(err => console.error('Team application notify error:', err));

    return { success: true, id: parentDocRef.id };
  } catch (error) {
    console.error("Error submitting team application:", error);
    return { success: false, error };
  }
}

export async function submitFacultyApplication(parentAppData: ApplicationData): Promise<{ success: boolean; id?: string; error?: any }> {
  try {
    const applicationsRef = collection(db, "applications");
    const docRef = await addDoc(applicationsRef, {
      ...parentAppData,
      createdAt: serverTimestamp()
    });
    
    // Notify organizer and applicant
    fetch('/api/notify/application', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: parentAppData.eventId,
        applicantName: parentAppData.applicantName,
        applicantEmail: parentAppData.applicantEmail,
        role: parentAppData.role,
      }),
    }).catch(err => console.error('Faculty application notify error:', err));

    return { success: true, id: docRef.id };
  } catch (error) {
    console.error("Error submitting faculty application:", error);
    return { success: false, error };
  }
}

export async function getUserApplications(userId: string): Promise<ApplicationData[]> {
  if (!userId) return [];
  try {
    // 1. Fetch direct applications
    const applicationsRef = collection(db, "applications");
    const q = query(
      applicationsRef, 
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    const applications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as ApplicationData));

    // 2. Fetch accepted staff assignments
    const staffQuery = query(
      collectionGroup(db, "staff"),
      where("uid", "==", userId),
      where("inviteStatus", "==", "accepted")
    );
    const staffSnapshot = await getDocs(staffQuery);

    for (const staffDoc of staffSnapshot.docs) {
      const staffData = staffDoc.data();
      const pathSegments = staffDoc.ref.path.split("/");
      const eventId = pathSegments[1];

      // Auto-migrate legacy staff documents to be UID-keyed
      if (staffDoc.id !== userId) {
        try {
          const batch = writeBatch(db);
          batch.delete(staffDoc.ref);
          const newStaffRef = doc(db, "events", eventId, "staff", userId);
          batch.set(newStaffRef, {
            ...staffData,
            uid: userId,
            sourceId: staffDoc.id, // the create rule accepts only a copy of a named grant
          });
          await batch.commit();
          console.log(`Migrated staff document for event ${eventId} to UID-keyed.`);
        } catch (migrationErr) {
          console.error("Failed to migrate staff document:", migrationErr);
        }
      }

      const existingAppIdx = applications.findIndex(app => app.eventId === eventId);
      const mappedRole = staffData.role === "faculty-advisor" ? "Faculty Advisor" : 
                         staffData.role === "co-organizer" ? "Co-Organizer" :
                         staffData.role === "usg" ? "Under-Secretary-General" :
                         staffData.role.split("-").map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

      if (existingAppIdx !== -1) {
        // Override role to reflect accepted staff assignment
        applications[existingAppIdx] = {
          ...applications[existingAppIdx],
          role: mappedRole,
          status: "approved",
          assignedCommittee: staffData.committeeId || applications[existingAppIdx].assignedCommittee
        };
      } else {
        // Create virtual approved application
        applications.push({
          id: staffDoc.id,
          eventId,
          userId,
          role: mappedRole,
          status: "approved",
          assignedCommittee: staffData.committeeId || undefined,
          preferredCommittee: staffData.committeeId || "",
          countryPreferences: [],
          choices: buildLegacyChoices(staffData.committeeId || "", []),
          experience: "",
          motivation: ""
        });
      }
    }

    return applications;
  } catch (error) {
    console.error("Error fetching user applications:", error);
    return [];
  }
}

/**
 * True if this user already has a direct application for this event.
 * Used to block duplicate applications (button → "Already Applied", apply page guard).
 */
export async function hasUserAppliedToEvent(userId: string, eventId: string): Promise<boolean> {
  if (!userId || !eventId) return false;
  try {
    const applicationsRef = collection(db, "applications");
    const q = query(
      applicationsRef,
      where("userId", "==", userId),
      where("eventId", "==", eventId),
      limit(1)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    console.error("Error checking existing application:", error);
    return false;
  }
}

export async function getApplicationsByEvent(eventId: string): Promise<ApplicationData[]> {
  if (!eventId) return [];
  try {
    const applicationsRef = collection(db, "applications");
    const q = query(
      applicationsRef,
      where("eventId", "==", eventId),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as ApplicationData));
  } catch (error) {
    console.error("Error fetching applications by event:", error);
    return [];
  }
}

/** updateApplication's error when an approval would pass the event plan's participant cap. */
export const SEATS_FULL = "This event is full for its plan. Upgrade the event or ask for more room under Plan.";

export async function updateApplication(applicationId: string, data: Partial<ApplicationData>): Promise<{ success: boolean; error?: any }> {
  try {
    const appRef = doc(db, "applications", applicationId);
    const prevSnap = await getDoc(appRef);
    const prevData = prevSnap.exists() ? prevSnap.data() as ApplicationData : null;

    // An approval takes a participant seat and an un-approval frees one: the event's counter
    // moves in the same write, and the rules hold it to the plan's cap.
    const delta = prevData ? seatDelta(prevData, { role: data.role ?? prevData.role, status: data.status ?? prevData.status }) : 0;
    if (delta !== 0 && prevData?.eventId) {
      const batch = writeBatch(db);
      batch.update(appRef, data);
      batch.update(doc(db, "events", prevData.eventId), { approvedCount: increment(delta), seatTx: applicationId });
      try {
        await batch.commit();
      } catch (e: any) {
        // The rules refuse an approval past the plan's participant cap.
        if (delta > 0 && e?.code === "permission-denied") return { success: false, error: SEATS_FULL };
        throw e;
      }
    } else {
      await updateDoc(appRef, data);
    }
    
    // Check if transitioning to approved
    if (prevData && data.status === "approved" && data.assignedCommittee) {
      if (prevData.status !== "approved") {
        await handlePostApprovalTasks(prevData.eventId, data.assignedCommittee, prevData.userId, prevData.applicantName || "Delegate");
      }
    }
    
    // Membership marker (live read rules): approval, rejection and withdrawal all change it.
    if (prevData?.eventId && prevData.userId && data.status && data.status !== prevData.status) {
      void syncMembers(prevData.eventId, [prevData.userId]);
    }

    // Notify the applicant of a status change. Approval sends its own "You're in!" email
    // naming the seat (notifyApplicationApproved), so this note covers the other changes.
    // The route checks the caller organizes the event and mails the application's own address.
    if (prevData && data.status && data.status !== prevData.status && data.status !== "approved") {
      auth.currentUser?.getIdToken().then((token) =>
        fetch('/api/notify/application-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ applicationId, status: data.status }),
        })
      ).catch(err => console.error('Application update notify error:', err));
    }
    
    return { success: true };
  } catch (error) {
    console.error("Error updating application:", error);
    return { success: false, error };
  }
}

/**
 * DEV-ONLY. Force an approved delegate allocation for a user, creating an
 * application if one doesn't exist yet (e.g. a delegate that was invited via the
 * Staff/Invitation flow and therefore has no application). Fires the same
 * post-approval hooks as a normal approval. REMOVE BEFORE PRODUCTION together
 * with the Dev Allocate panel.
 */
export async function devUpsertAllocatedApplication(params: {
  eventId: string;
  userId: string;
  applicantName?: string;
  applicantEmail?: string;
  committee: string;
  country: string;
}): Promise<{ success: boolean; id?: string; error?: any }> {
  const { eventId, userId, applicantName, applicantEmail, committee, country } = params;
  if (!userId || !eventId) return { success: false, error: "missing userId/eventId" };
  try {
    const applicationsRef = collection(db, "applications");
    const existingSnap = await getDocs(
      query(applicationsRef, where("userId", "==", userId), where("eventId", "==", eventId), limit(1))
    );

    // Existing application → route through updateApplication so hooks/emails fire.
    if (!existingSnap.empty) {
      const id = existingSnap.docs[0].id;
      const res = await updateApplication(id, {
        status: "approved",
        assignedCommittee: committee,
        assignedCountry: country,
        paymentStatus: "paid",
        devPaid: true,
      });
      return { ...res, id };
    }

    // No application yet → create a fully-approved one, then run post-approval hooks.
    // Also stamped paid: the portal is paywalled for unpaid registrations, so a dev
    // allocation that skipped checkout would land on the "pay to continue" screen and
    // the panel could not test any delegate feature. Same devPaid marker the Developer
    // Payment Mode checkout writes.
    const docRef = await addDoc(applicationsRef, {
      eventId,
      userId,
      applicantName: applicantName || "Delegate",
      applicantEmail: applicantEmail || "",
      role: "Delegate",
      status: "approved",
      paymentStatus: "paid",
      devPaid: true,
      paidAt: serverTimestamp(),
      assignedCommittee: committee,
      assignedCountry: country,
      preferredCommittee: committee,
      countryPreferences: country ? [country] : [],
      choices: buildLegacyChoices(committee, country ? [country] : []),
      experience: "",
      motivation: "",
      createdAt: serverTimestamp(),
    });
    await handlePostApprovalTasks(eventId, committee, userId, applicantName || "Delegate");
    void syncMembers(eventId, [userId]);
    return { success: true, id: docRef.id };
  } catch (error) {
    console.error("Error in devUpsertAllocatedApplication:", error);
    return { success: false, error };
  }
}

async function handlePostApprovalTasks(eventId: string, committeeId: string, targetUid: string, targetName: string) {
  try {
    // 1. Auto-Follow
    const appsRef = collection(db, "applications");
    const q = query(appsRef, where("eventId", "==", eventId), where("assignedCommittee", "==", committeeId), where("status", "==", "approved"));
    const snap = await getDocs(q);
    
    const batch = writeBatch(db);
    
    // We need target user details
    const targetUserSnap = await getDoc(doc(db, "users", targetUid));
    const targetUser = targetUserSnap.data();
    const tPhoto = targetUser?.photoURL || "";
    
    snap.docs.forEach(async d => {
      const appData = d.data() as ApplicationData;
      if (appData.userId !== targetUid) {
        // Connect targetUid and appData.userId
        const otherUid = appData.userId;
        const otherName = appData.applicantName || "Delegate";
        // To be safe without awaiting inside loop, we'll just set it without their photo (or we could fetch it).
        // Since we are doing a client-side hook, we'll keep it simple:
        
        batch.set(doc(db, "users", targetUid, "connections", otherUid), {
          otherUid, displayName: otherName, photoURL: "", role: appData.role || "Delegate",
          source: "auto", sourceEventId: eventId, sourceCommitteeId: committeeId, connectedAt: serverTimestamp(), status: "active"
        }, { merge: true });
        
        batch.set(doc(db, "users", otherUid, "connections", targetUid), {
          otherUid: targetUid, displayName: targetName, photoURL: tPhoto, role: "Delegate",
          source: "auto", sourceEventId: eventId, sourceCommitteeId: committeeId, connectedAt: serverTimestamp(), status: "active"
        }, { merge: true });
      }
    });
    
    await batch.commit();

    // 2. Auto-Group
    // For V1, we skip fully robust auto-group if it's too complex here, 
    // but we can query if a group exists for this committee.
    // Spec: Look up or create the group conversation for {eventId, committeeId}
    const convQ = query(collection(db, "conversations"), where("type", "==", "group"), where("eventId", "==", eventId), where("committeeId", "==", committeeId));
    const convSnap = await getDocs(convQ);
    
    if (!convSnap.empty) {
      const convId = convSnap.docs[0].id;
      // Use arrayUnion directly or our service
      const { addGroupMember } = await import("./messageService");
      await addGroupMember(convId, "System", "System", targetUid, targetName, tPhoto);
    } else {
      // Create it
      const eventSnap = await getDoc(doc(db, "events", eventId));
      const eventName = eventSnap.data()?.shortName || "Conference";
      await createGroupConversation(
        targetUid, // Not ideal as creator, but works as a trigger
        `${eventName} - ${committeeId}`,
        [targetUid],
        { [targetUid]: targetName },
        { [targetUid]: tPhoto },
        { eventId, committeeId, autoGenerated: true }
      );
    }
  } catch (err) {
    console.error("Error in post approval tasks", err);
  }
}
