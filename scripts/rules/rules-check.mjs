// Firestore rules check against the local emulator: seeds a tiny world with the admin SDK
// (rules bypassed), then tries each case as a signed-in user through the client SDK and
// compares allow/deny with what the rules should say.
//
//   npm run test:rules
//
// (= firebase emulators:exec --only firestore --project demo-rules "node scripts/rules/rules-check.mjs").
// A `demo-` project id keeps the emulator offline; no real project is touched. Needs Java on
// PATH (Android Studio's jbr works). Add a case to CASES for every rules change.

import { initializeApp as adminInit } from "firebase-admin/app";
import { getFirestore as adminDb } from "firebase-admin/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, writeBatch, arrayUnion, serverTimestamp, getDocs, increment, query, where } from "firebase/firestore";

const PROJECT = "demo-rules";
const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
const FUTURE = Date.now() + 30 * 86_400_000;

// ── The world ───────────────────────────────────────────────────────────────────────────
const SEED = {
  "users/admin": { role: "App Admin" },
  "users/org": { role: "user" },
  "users/del": { role: "user" },
  "users/lead": { role: "user" },
  "users/other": { role: "user" },
  "events/ev1": { organizerId: "org", title: "Test MUN", applicationCloseAt: FUTURE },
  // Public staff applications: ev2 takes them (allowPublicStaff), ev1 doesn't. `sapp2` already applied.
  "events/ev2": { organizerId: "org", title: "Open Staff MUN", allowPublicStaff: true },
  "users/sapp": { role: "user" }, "users/sapp2": { role: "user" },
  "events/ev2/staff/sapp2": { uid: "sapp2", name: "S2", email: "sapp2@t.test", role: "chair", committeeId: null, permissions: { canViewApplications: false }, inviteStatus: "applied" },
  "applications/delApp": { eventId: "ev1", userId: "del", role: "Delegate", status: "pending" },
  "applications/leadApp": { eventId: "ev1", userId: "lead", role: "Delegate", status: "pending" },

  // Live MUN: staff, the organizer's switch, two committee sittings and a private chat note.
  "users/chair": { role: "user" }, "users/usgUN": { role: "user" }, "users/usgAll": { role: "user" },
  "users/dirGA": { role: "user" }, "users/ebOld": { role: "user" },
  "events/ev1/staff/chair": { uid: "chair", role: "chair", inviteStatus: "accepted", committeeId: "UNSC" },
  "events/ev1/staff/usgUN": { uid: "usgUN", role: "usg", inviteStatus: "accepted", committeeId: "UNSC" },
  "events/ev1/staff/usgAll": { uid: "usgAll", role: "usg", inviteStatus: "accepted", committeeId: "" },
  "events/ev1/staff/dirGA": { uid: "dirGA", role: "director", inviteStatus: "accepted", committeeId: "GA" },
  "events/ev1/staff/ebOld": { uid: "ebOld", role: "usg", inviteStatus: "pending", committeeId: "" },
  "events/ev1/liveControl/state": { sessionsOpen: true },
  "events/ev1/sessions/UNSC__2026-10-25": { committeeId: "UNSC", eventId: "ev1", dateStr: "2026-10-25", phase: "gsl", attendance: { del: { status: "present" } } },
  "events/ev1/sessions/GA__2026-10-25": { committeeId: "GA", eventId: "ev1", dateStr: "2026-10-25", phase: "gsl", attendance: {} },
  // Staff self-writes: an open invite (auto-id, by email), a role change awaiting re-accept, and
  // chair applications for the committee hub's self-register fallback.
  "users/vc": { role: "user" }, "users/ru": { role: "user" }, "users/capp": { role: "user" }, "users/capp2": { role: "user" },
  "events/ev1/staff/inv1": { email: "vc@t.test", role: "vice-chair", committeeId: "UNSC", permissions: { canMarkDelegates: false }, inviteStatus: "invited", delegatePower: true },
  "events/ev1/staff/ru": { uid: "ru", email: "ru@t.test", role: "chair", committeeId: "UNSC", permissions: {}, inviteStatus: "invited", isRoleUpdate: true, previousRole: "observer", previousPermissions: {} },
  "applications/chairApp": { eventId: "ev1", userId: "capp", role: "Chair", status: "approved", assignedCommittee: "UNSC" },
  "applications/pendChairApp": { eventId: "ev1", userId: "capp2", role: "Chair", status: "pending", assignedCommittee: "UNSC" },
  // Phase 1 read tightening: a member marker for `del`, a delegate on the roll with no marker
  // (`rollie`), a point, and papers circulating vs. a stranger's own.
  "users/rollie": { role: "user" },
  "events/ev1/members/del": { uid: "del", role: "Delegate", committee: "UNSC", kind: "applicant" },
  "events/ev1/sessions/GA__2026-10-26": { committeeId: "GA", eventId: "ev1", dateStr: "2026-10-26", phase: "gsl", attendance: { rollie: { status: "present" } } },
  "events/ev1/sessions/GA__2026-10-26/points/p1": { delegateId: "rollie", type: "order", status: "pending" },
  "events/ev1/sessions/UNSC__2026-10-25/points/p2": { delegateId: "del", type: "order", status: "pending" },
  "events/ev1/committeeDocs/d1": { committee: "UNSC", status: "approved", submittedBy: "del", type: "working-paper", format: "markdown", title: "WP" },
  "events/ev1/committeeDocs/d2": { committee: "UNSC", status: "submitted", submittedBy: "other", type: "working-paper", format: "markdown", title: "Mine" },
  "events/ev1/sessions/UNSC__2026-10-25/chat/m1": { threadKey: "del", fromRole: "delegate", fromUid: "del", text: "private", sentAt: new Date() },
  // Private contact: `pub` shares with everyone (default), `priv` only with connections; `con` is
  // connected to `priv`, `blk` was connected but is blocked. `legacy` still has email on the doc.
  "users/pub": { role: "user" },
  "users/pub/private/contact": { email: "pub@t.test", phoneNumber: "111" },
  "users/priv": { role: "user", privacySettings: { contactVisibility: "connections" } },
  "users/priv/private/contact": { email: "priv@t.test", phoneNumber: "222" },
  "users/priv/connections/con": { otherUid: "con", status: "active" },
  "users/priv/connections/blk": { otherUid: "blk", status: "blocked" },
  "users/con": { role: "user" }, "users/blk": { role: "user" },
  "users/legacy": { role: "user", email: "legacy@t.test", phoneNumber: "333", firstName: "Leg" },
  // Direct messages: pub and con talk; m1 is con's message pub hasn't read yet.
  "conversations/con_pub": { type: "direct", participants: ["con", "pub"], lastMessage: "hi", unreadCount: { pub: 1, con: 0 } },
  "conversations/con_pub/messages/m1": { senderId: "con", senderName: "Con", text: "hi", readBy: ["con"], readAt: {} },
  // A position paper's marking doc and a private dais note on it.
  "markings/paperDel": { eventId: "ev1", committeeId: "UNSC", delegateId: "del", applicationId: "delApp", paperStatus: "review" },
  "markings/paperDel/comments/n1": { text: "Thin sources", authorId: "chair", authorName: "Chair" },
  // Privilege fields on users/{uid}: an expired and a current Pro, a legacy delegate role, an
  // organizer, and a pending Pro applicant.
  "users/proOld": { role: "user", proStatus: "active", proExpiresAt: new Date(Date.now() - 86_400_000) },
  "users/proNow": { role: "user", proStatus: "active", proExpiresAt: new Date(FUTURE) },
  "users/oldDel": { role: "delegate" },
  "users/orgR": { role: "Organizer", firstName: "Org" },
  "users/proP": { role: "user", proStatus: "pending" },
  "proApplications/proP": { userId: "proP", orgName: "P", status: "pending" },
  // Event plans: a full Free event, a Pro event, and a Free event where `del` holds a seat.
  "events/evF": { organizerId: "org", title: "Full Free", approvedCount: 50, applicationCloseAt: FUTURE },
  "applications/fApp": { eventId: "evF", userId: "other", role: "Delegate", status: "pending" },
  "events/evP": { organizerId: "org", title: "Pro MUN", plan: { tier: "pro", source: "paid" }, applicationCloseAt: FUTURE },
  "applications/pApp": { eventId: "evP", userId: "other", role: "Delegate", status: "pending" },
  "events/evS": { organizerId: "org", title: "Seated", approvedCount: 3, applicationCloseAt: FUTURE },
  "applications/sApp": { eventId: "evS", userId: "del", role: "Delegate", status: "approved" },
  "applications/chairPend": { eventId: "ev1", userId: "capp", role: "Chair", status: "pending" },
  "auditLogs/log1": { action: "role_changed", actorUid: "admin" },
  "articles/hid": { authorId: "del", title: "Hidden", published: false, hiddenByAdmin: true },
  "articles/ok": { authorId: "del", title: "Fine", published: false },
  "users/banned": { role: "user", disabled: true },
  // QR passes: `del`'s pass version and one used meal; a scanner with the permission.
  "events/ev1/passes/del": { version: 1 },
  "events/ev1/redemptions/meal:s1__del": { holderUid: "del", target: "meal:s1", count: 1 },
  "users/scan": { role: "user" },
  "events/ev1/staff/scan": { uid: "scan", role: "volunteer", inviteStatus: "accepted", permissions: { canScanPasses: true } },
  // Custom coupons need the plan feature `passes`: evP is Pro, ev1 is Free.
  "events/evP/coupons/c1": { title: "Welcome kit", audience: { groups: ["delegate"] }, usesPerPerson: 1, active: true },
};

const pending = (userId, extra = {}) => ({ eventId: "ev1", userId, role: "Delegate", status: "pending", ...extra });

// The bell's accept: delete the invite, write the uid-keyed copy (NotificationsContext).
const acceptInvite = (db, uid, over = {}) => {
  const b = writeBatch(db);
  b.delete(doc(db, "events/ev1/staff/inv1"));
  b.set(doc(db, `events/ev1/staff/${uid}`), {
    uid, email: `${uid}@t.test`, name: "VC", role: "vice-chair", committeeId: "UNSC",
    permissions: { canMarkDelegates: false }, delegatePower: true, inviteStatus: "accepted", sourceId: "inv1", ...over,
  });
  return b.commit();
};
const NO_PERMS = { canViewApplications: false, canMarkDelegates: false, canSendAnnouncements: false, canManageSchedule: false, canViewFinancials: false, canApproveResults: false };
const staffApply = (eventId, uid, over = {}) => (db) => setDoc(doc(db, `events/${eventId}/staff/${uid}`), {
  uid, name: "Applicant", email: `${uid}@t.test`, role: "chair", committeeId: null, permissions: NO_PERMS,
  inviteStatus: "applied", addedAt: serverTimestamp(), ...over,
});
const chairSelf = (uid, appId, over = {}) => (db) => setDoc(doc(db, `events/ev1/staff/${uid}`), {
  uid, email: `${uid}@t.test`, name: "Chair", role: "chair", committeeId: "UNSC", permissions: NO_PERMS,
  inviteStatus: "accepted", sourceApplicationId: appId, ...over,
}, { merge: true });

// An application change plus the event's seat counter in one batch (the approve flow).
const seatWrite = (eventId, appId, delta, data) => async (db) => {
  const b = writeBatch(db);
  b.update(doc(db, `applications/${appId}`), data);
  b.update(doc(db, `events/${eventId}`), { approvedCount: increment(delta), seatTx: appId });
  return b.commit();
};

// [who, description, expected "allow" | "deny", (db) => Promise]
const coupon = (over = {}) => ({ title: "Welcome kit", kind: "kit", audience: { groups: ["delegate"] }, usesPerPerson: 1, active: true, createdBy: "org", ...over });

const CASES = [
  // Applications: create
  ["del", "create own pending application", "allow", (db) => addDoc(collection(db, "applications"), pending("del"))],
  ["del", "create own pending, unpaid", "allow", (db) => addDoc(collection(db, "applications"), pending("del", { paymentStatus: "unpaid" }))],
  ["del", "create own APPROVED application", "deny", (db) => addDoc(collection(db, "applications"), pending("del", { status: "approved" }))],
  ["del", "create own pending with assignedCommittee", "deny", (db) => addDoc(collection(db, "applications"), pending("del", { assignedCommittee: "UNSC" }))],
  ["del", "create own pending marked PAID", "deny", (db) => addDoc(collection(db, "applications"), pending("del", { paymentStatus: "paid" }))],
  ["del", "create an application for someone else", "deny", (db) => addDoc(collection(db, "applications"), pending("other"))],
  ["lead", "create teammate under own team application", "allow", (db) => addDoc(collection(db, "applications"), pending("mate@example.com", { teamApplicationParentId: "leadApp" }))],
  ["del", "create teammate under someone else's team", "deny", (db) => addDoc(collection(db, "applications"), pending("mate@example.com", { teamApplicationParentId: "leadApp" }))],
  ["org", "organizer creates an approved app for a delegate (old dev rule)", "deny", (db) => addDoc(collection(db, "applications"), pending("other", { status: "approved", assignedCommittee: "UNSC" }))],
  ["admin", "App Admin creates an approved app for a delegate", "allow", (db) => addDoc(collection(db, "applications"), pending("other", { status: "approved", assignedCommittee: "UNSC", paymentStatus: "paid" }))],

  // Applications: update by the applicant
  ["del", "edit own position paper", "allow", (db) => updateDoc(doc(db, "applications/delApp"), { positionPaperContent: "x", positionPaperFormat: "markdown" })],
  ["del", "stamp own announcements read", "allow", (db) => updateDoc(doc(db, "applications/delApp"), { lastAnnouncementsViewedAt: new Date() })],
  ["del", "withdraw own application", "allow", (db) => updateDoc(doc(db, "applications/delApp"), { status: "withdrawn" })],
  ["del", "approve own application", "deny", (db) => updateDoc(doc(db, "applications/delApp"), { status: "approved" })],
  ["del", "mark own application paid", "deny", (db) => updateDoc(doc(db, "applications/delApp"), { paymentStatus: "paid" })],
  ["del", "assign self a country", "deny", (db) => updateDoc(doc(db, "applications/delApp"), { assignedCountry: "fr" })],
  ["del", "change own role", "deny", (db) => updateDoc(doc(db, "applications/delApp"), { role: "Chair" })],
  ["other", "edit someone else's application", "deny", (db) => updateDoc(doc(db, "applications/delApp"), { positionPaperContent: "x" })],

  // Applications: update by the organizer
  ["org", "organizer approves and places an application", "allow", seatWrite("ev1", "leadApp", 1, { status: "approved", assignedCommittee: "UNSC", assignedCountry: "fr" })],

  // Live MUN: who runs a sitting (0.3 — Executive Board inside its scope)
  ["chair", "chair runs own committee's sitting", "allow", (db) => updateDoc(doc(db, "events/ev1/sessions/UNSC__2026-10-25"), { phase: "voting" })],
  ["chair", "chair runs another committee's sitting", "deny", (db) => updateDoc(doc(db, "events/ev1/sessions/GA__2026-10-25"), { phase: "voting" })],
  ["usgUN", "USG scoped to UNSC runs UNSC", "allow", (db) => updateDoc(doc(db, "events/ev1/sessions/UNSC__2026-10-25"), { phase: "voting" })],
  ["usgUN", "USG scoped to UNSC runs GA", "deny", (db) => updateDoc(doc(db, "events/ev1/sessions/GA__2026-10-25"), { phase: "voting" })],
  ["usgAll", "event-wide USG (committeeId \"\") runs GA", "allow", (db) => updateDoc(doc(db, "events/ev1/sessions/GA__2026-10-25"), { phase: "voting" })],
  ["dirGA", "Director scoped to GA runs GA", "allow", (db) => updateDoc(doc(db, "events/ev1/sessions/GA__2026-10-25"), { phase: "voting" })],
  ["dirGA", "Director scoped to GA runs UNSC", "deny", (db) => updateDoc(doc(db, "events/ev1/sessions/UNSC__2026-10-25"), { phase: "voting" })],
  ["ebOld", "USG whose invite is not accepted runs GA", "deny", (db) => updateDoc(doc(db, "events/ev1/sessions/GA__2026-10-25"), { phase: "voting" })],
  ["usgUN", "scoped USG opens a new UNSC sitting", "allow", (db) => setDoc(doc(db, "events/ev1/sessions/UNSC__2026-10-26"), { committeeId: "UNSC", eventId: "ev1", dateStr: "2026-10-26", phase: "lobby" })],
  ["usgUN", "scoped USG raises a motion-queue entry in UNSC", "allow", (db) => setDoc(doc(db, "events/ev1/sessions/UNSC__2026-10-25/motionQueue/mq1"), { type: "mod_caucus", status: "pending", byDelegateId: "del" })],
  ["usgUN", "scoped USG marks a UNSC delegate", "allow", (db) => setDoc(doc(db, "markings/UNSC_del_2026-10-25"), { eventId: "ev1", committeeId: "UNSC", delegateId: "del", dateStr: "2026-10-25" })],
  ["usgUN", "scoped USG marks a GA delegate", "deny", (db) => setDoc(doc(db, "markings/GA_x_2026-10-25"), { eventId: "ev1", committeeId: "GA", delegateId: "x", dateStr: "2026-10-25" })],
  ["usgUN", "EB reads a delegate's private dais note", "deny", (db) => getDoc(doc(db, "events/ev1/sessions/UNSC__2026-10-25/chat/m1"))],
  ["chair", "chair reads a delegate's private dais note", "allow", (db) => getDoc(doc(db, "events/ev1/sessions/UNSC__2026-10-25/chat/m1"))],
  ["del", "delegate rewrites the sitting's phase", "deny", (db) => updateDoc(doc(db, "events/ev1/sessions/UNSC__2026-10-25"), { phase: "closed" })],

  // Staff: self-writes may copy a grant, never mint one
  ["other", "self-create staff doc as co-organizer, no grant (the old hole)", "deny", (db) => setDoc(doc(db, "events/ev1/staff/other"), { uid: "other", role: "co-organizer", permissions: {}, inviteStatus: "accepted" })],
  ["vc", "accept own invite (bell: delete invite + uid-keyed copy)", "allow", (db) => acceptInvite(db, "vc")],
  ["vc", "accept own invite but as co-organizer", "deny", (db) => acceptInvite(db, "vc", { role: "co-organizer" })],
  ["vc", "accept own invite with extra permissions", "deny", (db) => acceptInvite(db, "vc", { permissions: { canViewFinancials: true } })],
  ["vc", "accept own invite into another committee", "deny", (db) => acceptInvite(db, "vc", { committeeId: "GA" })],
  ["other", "copy someone else's invite", "deny", (db) => acceptInvite(db, "other")],
  ["ru", "re-accept a role change as set", "allow", (db) => updateDoc(doc(db, "events/ev1/staff/ru"), { inviteStatus: "accepted", isRoleUpdate: false })],
  ["ru", "re-accept a role change as co-organizer", "deny", (db) => updateDoc(doc(db, "events/ev1/staff/ru"), { inviteStatus: "accepted", role: "co-organizer" })],
  ["ru", "decline a role change (restore previous)", "allow", (db) => updateDoc(doc(db, "events/ev1/staff/ru"), { role: "observer", permissions: {}, inviteStatus: "accepted", isRoleUpdate: false, previousRole: null, previousPermissions: null })],
  ["chair", "accepted chair promotes self to co-organizer", "deny", (db) => updateDoc(doc(db, "events/ev1/staff/chair"), { role: "co-organizer", inviteStatus: "accepted" })],
  ["chair", "accepted chair grants self financials", "deny", (db) => updateDoc(doc(db, "events/ev1/staff/chair"), { permissions: { canViewFinancials: true }, inviteStatus: "accepted" })],
  ["capp", "approved chair app self-registers as chair", "allow", chairSelf("capp", "chairApp")],
  ["capp", "approved chair app self-registers with financials", "deny", chairSelf("capp", "chairApp", { permissions: { ...NO_PERMS, canViewFinancials: true } })],
  ["capp", "approved chair app self-registers into another committee", "deny", chairSelf("capp", "chairApp", { committeeId: "GA" })],
  ["capp2", "PENDING chair app self-registers", "deny", chairSelf("capp2", "pendChairApp")],
  ["other", "self-registers citing someone else's chair app", "deny", chairSelf("other", "chairApp")],

  // Phase 1: live data is for the event's members, staff, organizer and admins
  ["other", "stranger reads a sitting", "deny", (db) => getDoc(doc(db, "events/ev1/sessions/UNSC__2026-10-25"))],
  ["del", "member reads a sitting", "allow", (db) => getDoc(doc(db, "events/ev1/sessions/UNSC__2026-10-25"))],
  ["rollie", "delegate on the roll (no marker) reads that sitting", "allow", (db) => getDoc(doc(db, "events/ev1/sessions/GA__2026-10-26"))],
  ["rollie", "delegate on the roll reads that sitting's points", "allow", (db) => getDoc(doc(db, "events/ev1/sessions/GA__2026-10-26/points/p1"))],
  ["rollie", "...but not another sitting's points", "deny", (db) => getDoc(doc(db, "events/ev1/sessions/UNSC__2026-10-25/points/p2"))],
  ["other", "stranger reads a sitting's points", "deny", (db) => getDoc(doc(db, "events/ev1/sessions/UNSC__2026-10-25/points/p2"))],
  ["del", "member reads a sitting's points", "allow", (db) => getDoc(doc(db, "events/ev1/sessions/UNSC__2026-10-25/points/p2"))],
  ["chair", "staff reads a sitting", "allow", (db) => getDoc(doc(db, "events/ev1/sessions/GA__2026-10-26"))],
  ["org", "organizer reads a sitting", "allow", (db) => getDoc(doc(db, "events/ev1/sessions/GA__2026-10-26"))],
  ["other", "stranger reads a circulating paper", "deny", (db) => getDoc(doc(db, "events/ev1/committeeDocs/d1"))],
  ["del", "member reads a circulating paper", "allow", (db) => getDoc(doc(db, "events/ev1/committeeDocs/d1"))],
  ["other", "author reads their own paper without a marker", "allow", (db) => getDoc(doc(db, "events/ev1/committeeDocs/d2"))],
  ["del", "member writes their own marker", "deny", (db) => setDoc(doc(db, "events/ev1/members/del"), { uid: "del", role: "organizer" })],
  ["other", "stranger mints a marker", "deny", (db) => setDoc(doc(db, "events/ev1/members/other"), { uid: "other", role: "Delegate" })],
  ["del", "member reads own marker", "allow", (db) => getDoc(doc(db, "events/ev1/members/del"))],
  ["other", "stranger reads someone's marker", "deny", (db) => getDoc(doc(db, "events/ev1/members/del"))],

  // Private contact (users/{uid}/private/contact) and the profile doc without email/phone
  ["other", "anyone reads an everyone-visible contact", "allow", (db) => getDoc(doc(db, "users/pub/private/contact"))],
  ["other", "stranger reads a connections-only contact", "deny", (db) => getDoc(doc(db, "users/priv/private/contact"))],
  ["con", "active connection reads a connections-only contact", "allow", (db) => getDoc(doc(db, "users/priv/private/contact"))],
  ["blk", "blocked connection reads a connections-only contact", "deny", (db) => getDoc(doc(db, "users/priv/private/contact"))],
  ["priv", "owner reads own contact", "allow", (db) => getDoc(doc(db, "users/priv/private/contact"))],
  ["admin", "App Admin reads a connections-only contact", "allow", (db) => getDoc(doc(db, "users/priv/private/contact"))],
  ["priv", "owner writes own contact", "allow", (db) => setDoc(doc(db, "users/priv/private/contact"), { phoneNumber: "999" }, { merge: true })],
  ["other", "someone writes another's contact", "deny", (db) => setDoc(doc(db, "users/pub/private/contact"), { phoneNumber: "999" }, { merge: true })],
  ["pub", "owner writes another private doc name", "deny", (db) => setDoc(doc(db, "users/pub/private/secrets"), { x: 1 })],
  ["pub", "owner puts phone back on the profile doc", "deny", (db) => updateDoc(doc(db, "users/pub"), { phoneNumber: "111" })],
  ["pub", "owner puts email on the profile doc", "deny", (db) => updateDoc(doc(db, "users/pub"), { email: "pub@t.test" })],
  ["pub", "owner edits other profile fields", "allow", (db) => updateDoc(doc(db, "users/pub"), { headline: "Hi" })],
  ["legacy", "unmigrated owner edits other fields (email stays)", "allow", (db) => updateDoc(doc(db, "users/legacy"), { headline: "Hi" })],
  ["legacy", "unmigrated owner changes the old phone field", "deny", (db) => updateDoc(doc(db, "users/legacy"), { phoneNumber: "444" })],
  ["newbie", "new account created with an email field", "deny", (db) => setDoc(doc(db, "users/newbie"), { firstName: "N", email: "n@t.test" })],
  ["newbie", "new account created without contact fields", "allow", (db) => setDoc(doc(db, "users/newbie"), { firstName: "N", onboardingComplete: true })],

  // ── Public staff applications (event.allowPublicStaff) ──
  ["sa1", "apply as chair while applications are open", "allow", staffApply("ev2", "sa1")],
  ["sapp3", "apply as director", "allow", staffApply("ev2", "sapp3", { role: "director" })],
  ["sa2", "apply while the organizer has them off", "deny", staffApply("ev1", "sa2")],
  ["sa3", "apply as co-organizer", "deny", staffApply("ev2", "sa3", { role: "co-organizer" })],
  ["sa4", "apply already accepted", "deny", staffApply("ev2", "sa4", { inviteStatus: "accepted" })],
  ["sa5", "apply with a permission switched on", "deny", staffApply("ev2", "sa5", { permissions: { ...NO_PERMS, canViewApplications: true } })],
  ["sa6", "apply with a committee", "deny", staffApply("ev2", "sa6", { committeeId: "UNSC" })],
  ["sa7", "apply with delegate power", "deny", staffApply("ev2", "sa7", { delegatePower: true })],
  ["sa8", "apply under someone else's email", "deny", staffApply("ev2", "sa8", { email: "org@t.test" })],
  ["sapp", "apply for another user", "deny", (db) => setDoc(doc(db, "events/ev2/staff/other"), { uid: "other", name: "O", email: "other@t.test", role: "chair", committeeId: null, permissions: NO_PERMS, inviteStatus: "applied", addedAt: serverTimestamp() })],
  ["sapp2", "applicant accepts their own application", "deny", (db) => updateDoc(doc(db, "events/ev2/staff/sapp2"), { inviteStatus: "accepted" })],
  ["sapp2", "applicant reads the staff roster", "deny", (db) => getDoc(doc(db, "events/ev1/staff/chair"))],
  ["sapp2", "applicant withdraws", "allow", (db) => deleteDoc(doc(db, "events/ev2/staff/sapp2"))],
  ["org", "organizer accepts an application", "allow", (db) => updateDoc(doc(db, "events/ev2/staff/sapp2"), { inviteStatus: "accepted" })],

  // ── Read receipts on direct messages ──
  ["pub", "participant marks a message read", "allow", (db) => updateDoc(doc(db, "conversations/con_pub/messages/m1"), { readBy: arrayUnion("pub"), "readAt.pub": serverTimestamp() })],
  ["other", "outsider marks a message read", "deny", (db) => updateDoc(doc(db, "conversations/con_pub/messages/m1"), { readBy: arrayUnion("other"), "readAt.other": serverTimestamp() })],
  ["pub", "participant adds someone else to readBy", "deny", (db) => updateDoc(doc(db, "conversations/con_pub/messages/m1"), { readBy: arrayUnion("pub", "con2") })],
  ["pub", "participant removes the sender from readBy", "deny", (db) => updateDoc(doc(db, "conversations/con_pub/messages/m1"), { readBy: ["pub"] })],
  ["pub", "participant stamps another's readAt", "deny", (db) => updateDoc(doc(db, "conversations/con_pub/messages/m1"), { "readAt.con": serverTimestamp() })],
  ["pub", "participant edits the message text", "deny", (db) => updateDoc(doc(db, "conversations/con_pub/messages/m1"), { text: "edited" })],

  // ── Chair notes on a paper (markings/{id}/comments) ──
  ["chair", "committee chair reads the dais notes", "allow", (db) => getDocs(collection(db, "markings/paperDel/comments"))],
  ["chair", "committee chair adds a note", "allow", (db) => addDoc(collection(db, "markings/paperDel/comments"), { text: "Agreed", authorId: "chair", authorName: "Chair" })],
  ["del", "the delegate reads notes on their own paper", "deny", (db) => getDocs(collection(db, "markings/paperDel/comments"))],
  ["other", "another member reads the dais notes", "deny", (db) => getDoc(doc(db, "markings/paperDel/comments/n1"))],

  // ── Privilege fields on users/{uid} (admin, organizer, Pro) ──
  ["del", "edit own name", "allow", (db) => updateDoc(doc(db, "users/del"), { firstName: "D" })],
  ["del", "make self App Admin", "deny", (db) => updateDoc(doc(db, "users/del"), { role: "App Admin" })],
  ["del", "make self organizer", "deny", (db) => updateDoc(doc(db, "users/del"), { role: "Organizer" })],
  ["del", "set own isAdmin", "deny", (db) => updateDoc(doc(db, "users/del"), { isAdmin: true })],
  ["del", "grant self Pro", "deny", (db) => updateDoc(doc(db, "users/del"), { proStatus: "active" })],
  ["del", "extend own Pro expiry", "deny", (db) => updateDoc(doc(db, "users/del"), { proExpiresAt: new Date(FUTURE) })],
  ["del", "approve own organizer application", "deny", (db) => updateDoc(doc(db, "users/del"), { organizerApplicationStatus: "approved" })],
  ["del", "apply for Pro (status pending)", "allow", (db) => updateDoc(doc(db, "users/del"), { proStatus: "pending", proAppliedAt: serverTimestamp() })],
  ["proOld", "re-apply after Pro expired", "allow", (db) => updateDoc(doc(db, "users/proOld"), { proStatus: "pending" })],
  ["proNow", "re-apply while Pro is current", "deny", (db) => updateDoc(doc(db, "users/proNow"), { proStatus: "pending" })],
  ["oldDel", "onboarding turns legacy delegate into user", "allow", (db) => setDoc(doc(db, "users/oldDel"), { role: "user", onboardingComplete: true }, { merge: true })],
  ["orgR", "organizer onboarding keeps its role", "allow", (db) => setDoc(doc(db, "users/orgR"), { role: "Organizer", firstName: "Org2" }, { merge: true })],
  ["nu1", "onboarding creates own profile as user", "allow", (db) => setDoc(doc(db, "users/nu1"), { role: "user", firstName: "N" }, { merge: true })],
  ["nu2", "create own profile as App Admin", "deny", (db) => setDoc(doc(db, "users/nu2"), { role: "App Admin" })],
  ["nu3", "create own profile with isAdmin", "deny", (db) => setDoc(doc(db, "users/nu3"), { role: "user", isAdmin: true })],
  ["nu4", "create own profile already Pro", "deny", (db) => setDoc(doc(db, "users/nu4"), { role: "user", proStatus: "active" })],
  ["admin", "App Admin grants Pro", "allow", (db) => updateDoc(doc(db, "users/del"), { proStatus: "active", proExpiresAt: new Date(FUTURE) })],
  ["pa1", "submit own Pro application", "allow", (db) => setDoc(doc(db, "proApplications/pa1"), { userId: "pa1", orgName: "X", status: "pending" })],
  ["pa2", "submit own Pro application as approved", "deny", (db) => setDoc(doc(db, "proApplications/pa2"), { userId: "pa2", orgName: "X", status: "approved" })],
  ["proP", "approve own Pro application", "deny", (db) => updateDoc(doc(db, "proApplications/proP"), { status: "approved" })],
  ["pa3", "submit a Pro application for someone else", "deny", (db) => setDoc(doc(db, "proApplications/other"), { userId: "other", orgName: "X", status: "pending" })],
  ["admin", "App Admin approves a Pro application", "allow", (db) => updateDoc(doc(db, "proApplications/proP"), { status: "approved" })],

  // ── Event plans: seats, caps, Pro looks, upgrade requests ──
  ["org", "approve on a Free event without the seat counter", "deny", (db) => updateDoc(doc(db, "applications/leadApp"), { status: "approved" })],
  ["org", "approve on a full Free event", "deny", seatWrite("evF", "fApp", 1, { status: "approved" })],
  ["org", "approve on a Pro event (no cap, no counter)", "allow", (db) => updateDoc(doc(db, "applications/pApp"), { status: "approved" })],
  ["org", "approve a chair application (no seat)", "allow", (db) => updateDoc(doc(db, "applications/chairPend"), { status: "approved" })],
  ["org", "reject a seated delegate, freeing the seat", "allow", seatWrite("evS", "sApp", -1, { status: "rejected" })],
  ["org", "reject a seated delegate, counter left", "deny", (db) => updateDoc(doc(db, "applications/sApp"), { status: "rejected" })],
  ["del", "withdraw own seat, freeing it", "allow", seatWrite("evS", "sApp", -1, { status: "withdrawn" })],
  ["del", "withdraw own seat, counter left", "deny", (db) => updateDoc(doc(db, "applications/sApp"), { status: "withdrawn" })],
  ["org", "lower the seat counter by hand", "deny", (db) => updateDoc(doc(db, "events/evS"), { approvedCount: 0, seatTx: "sApp" })],
  ["del", "lower someone's event counter by hand", "deny", (db) => updateDoc(doc(db, "events/evS"), { approvedCount: 2, seatTx: "sApp" })],
  ["org", "make own event Pro", "deny", (db) => updateDoc(doc(db, "events/ev1"), { plan: { tier: "pro" } })],
  ["admin", "App Admin makes an event Pro", "allow", (db) => updateDoc(doc(db, "events/ev1"), { plan: { tier: "pro", source: "admin" } })],
  ["org", "5 committees on a Free event", "allow", (db) => updateDoc(doc(db, "events/ev1"), { committees: [1, 2, 3, 4, 5].map((i) => ({ name: `C${i}` })) })],
  ["org", "6 committees on a Free event", "deny", (db) => updateDoc(doc(db, "events/ev1"), { committees: [1, 2, 3, 4, 5, 6].map((i) => ({ name: `C${i}` })) })],
  ["org", "6 committees on a Pro event", "allow", (db) => updateDoc(doc(db, "events/evP"), { committees: [1, 2, 3, 4, 5, 6].map((i) => ({ name: `C${i}` })) })],
  ["org", "custom theme colour on a Free event", "deny", (db) => updateDoc(doc(db, "events/ev1"), { theme: "#123456" })],
  ["org", "custom theme colour on a Pro event", "allow", (db) => updateDoc(doc(db, "events/evP"), { theme: "#123456" })],
  ["org", "preset theme on a Free event", "allow", (db) => updateDoc(doc(db, "events/ev1"), { theme: "emerald" })],
  ["org", "Ornate certificate on a Free event", "deny", (db) => updateDoc(doc(db, "events/ev1"), { certificateTemplate: "ornate" })],
  ["org", "Ornate certificate on a Pro event", "allow", (db) => updateDoc(doc(db, "events/evP"), { certificateTemplate: "ornate" })],
  ["org", "edit a Free event's title", "allow", (db) => updateDoc(doc(db, "events/ev1"), { title: "Renamed" })],
  ["org", "create an event already Pro", "deny", (db) => setDoc(doc(db, "events/newPro"), { organizerId: "org", title: "X", plan: { tier: "pro" } })],
  ["org", "create a Free event", "allow", (db) => setDoc(doc(db, "events/newFree"), { organizerId: "org", title: "X", committees: [] })],
  ["org", "create an event for someone else", "deny", (db) => setDoc(doc(db, "events/newOther"), { organizerId: "other", title: "X" })],
  ["org", "request Pro for own event", "allow", (db) => addDoc(collection(db, "upgradeRequests"), { eventId: "ev1", organizerId: "org", kind: "pro", message: "m", status: "pending" })],
  ["org", "request already approved", "deny", (db) => addDoc(collection(db, "upgradeRequests"), { eventId: "ev1", organizerId: "org", kind: "pro", message: "m", status: "approved" })],
  ["del", "request Pro for someone's event", "deny", (db) => addDoc(collection(db, "upgradeRequests"), { eventId: "ev1", organizerId: "del", kind: "pro", message: "m", status: "pending" })],
  // ── Payout requests and the audit log ──
  ["org", "request a payout", "allow", (db) => addDoc(collection(db, "payoutRequests"), { organizerId: "org", organizerName: "O", organizerEmail: "org@t.test", amount: 50, note: "", status: "pending", requestedAt: serverTimestamp() })],
  ["org", "request a payout of zero", "deny", (db) => addDoc(collection(db, "payoutRequests"), { organizerId: "org", organizerName: "O", organizerEmail: "", amount: 0, note: "", status: "pending", requestedAt: serverTimestamp() })],
  ["org", "request a payout already paid", "deny", (db) => addDoc(collection(db, "payoutRequests"), { organizerId: "org", organizerName: "O", organizerEmail: "", amount: 5, note: "", status: "paid", requestedAt: serverTimestamp() })],
  ["org", "request a payout with an extra field", "deny", (db) => addDoc(collection(db, "payoutRequests"), { organizerId: "org", organizerName: "O", organizerEmail: "", amount: 5, note: "", status: "pending", requestedAt: serverTimestamp(), reference: "x" })],
  ["admin", "App Admin adds an audit entry", "allow", (db) => setDoc(doc(db, "auditLogs/new1"), { action: "x", actorUid: "admin", timestamp: serverTimestamp() })],
  ["admin", "App Admin edits an audit entry", "deny", (db) => updateDoc(doc(db, "auditLogs/log1"), { action: "y" })],
  ["admin", "App Admin deletes an audit entry", "deny", (db) => deleteDoc(doc(db, "auditLogs/log1"))],
  ["org", "organizer adds an audit entry", "deny", (db) => setDoc(doc(db, "auditLogs/new2"), { action: "x", actorUid: "org" })],
  // ── Moderation: hidden articles, banned members ──
  ["del", "author publishes own article", "allow", (db) => updateDoc(doc(db, "articles/ok"), { published: true })],
  ["del", "author republishes an article the admin hid", "deny", (db) => updateDoc(doc(db, "articles/hid"), { published: true })],
  ["del", "author clears the hidden flag", "deny", (db) => updateDoc(doc(db, "articles/hid"), { hiddenByAdmin: false })],
  ["del", "author edits a hidden article's text", "allow", (db) => updateDoc(doc(db, "articles/hid"), { title: "Fixed" })],
  ["banned", "banned member lifts own ban", "deny", (db) => updateDoc(doc(db, "users/banned"), { disabled: false })],
  ["del", "give self more Free events", "deny", (db) => updateDoc(doc(db, "users/del"), { planOverrides: { freeEvents: 9 } })],
  // ── QR passes: server-only pass versions and redemptions ──
  ["del", "read own pass version", "deny", (db) => getDoc(doc(db, "events/ev1/passes/del"))],
  ["del", "bump own pass version", "deny", (db) => setDoc(doc(db, "events/ev1/passes/del"), { version: 2 })],
  ["del", "read own redemption", "allow", (db) => getDoc(doc(db, "events/ev1/redemptions/meal:s1__del"))],
  ["other", "read someone else's redemption", "deny", (db) => getDoc(doc(db, "events/ev1/redemptions/meal:s1__del"))],
  ["org", "organizer reads a redemption", "allow", (db) => getDoc(doc(db, "events/ev1/redemptions/meal:s1__del"))],
  ["scan", "scanner reads a redemption", "allow", (db) => getDoc(doc(db, "events/ev1/redemptions/meal:s1__del"))],
  ["chair", "staff without the scan permission reads a redemption", "deny", (db) => getDoc(doc(db, "events/ev1/redemptions/meal:s1__del"))],
  ["del", "list own redemptions (My coupons)", "allow", (db) => getDocs(query(collection(db, "events/ev1/redemptions"), where("holderUid", "==", "del")))],
  ["other", "list someone else's redemptions", "deny", (db) => getDocs(query(collection(db, "events/ev1/redemptions"), where("holderUid", "==", "del")))],
  ["scan", "scanner lists all redemptions (report)", "allow", (db) => getDocs(collection(db, "events/ev1/redemptions"))],
  ["del", "delegate lists all redemptions", "deny", (db) => getDocs(collection(db, "events/ev1/redemptions"))],
  ["org", "Pro event: add a coupon", "allow", (db) => setDoc(doc(db, "events/evP/coupons/c2"), coupon())],
  ["org", "Free event: add a coupon", "deny", (db) => setDoc(doc(db, "events/ev1/coupons/c2"), coupon())],
  ["org", "coupon with 50 uses", "deny", (db) => setDoc(doc(db, "events/evP/coupons/c3"), coupon({ usesPerPerson: 50 }))],
  ["org", "coupon with an unknown field", "deny", (db) => setDoc(doc(db, "events/evP/coupons/c3"), coupon({ price: 5 }))],
  ["other", "stranger adds a coupon", "deny", (db) => setDoc(doc(db, "events/evP/coupons/c4"), coupon())],
  ["org", "organizer pauses a coupon", "allow", (db) => updateDoc(doc(db, "events/evP/coupons/c1"), { active: false })],
  ["other", "non-member reads a coupon", "deny", (db) => getDoc(doc(db, "events/evP/coupons/c1"))],
  ["del", "mark own meal unused", "deny", (db) => updateDoc(doc(db, "events/ev1/redemptions/meal:s1__del"), { count: 0 })],
  ["org", "organizer writes a redemption directly", "deny", (db) => setDoc(doc(db, "events/ev1/redemptions/meal:s2__del"), { holderUid: "del", target: "meal:s2", count: 1 })],
];

// ── Run ─────────────────────────────────────────────────────────────────────────────────
adminInit({ projectId: PROJECT });
const seedDb = adminDb();

async function seed() {
  for (const [path, data] of Object.entries(SEED)) await seedDb.doc(path).set(data);
}

function clientFor(uid) {
  const app = initializeApp({ projectId: PROJECT, apiKey: "demo" }, `u-${uid}-${Math.random()}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, HOST, Number(PORT), { mockUserToken: { sub: uid, user_id: uid, email: `${uid}@t.test` } });
  return { app, db };
}

let failures = 0;
for (const [who, what, expected, run] of CASES) {
  await seed(); // every case starts from the same world
  const { app, db } = clientFor(who);
  let got;
  try { await run(db); got = "allow"; } catch (e) { got = /permission|PERMISSION_DENIED/i.test(String(e?.code || e?.message)) ? "deny" : `error: ${e?.message}`; }
  await deleteApp(app);
  const ok = got === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${who.padEnd(6)} ${what}  (expected ${expected}, got ${got})`);
}
console.log(failures ? `\n${failures} of ${CASES.length} cases FAILED` : `\nAll ${CASES.length} cases pass`);
process.exit(failures ? 1 : 0);
