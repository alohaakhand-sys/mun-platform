"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  applyForStaff, withdrawStaffApplication, getMyStaffDoc, roleLabel, STAFF_APPLY_ROLES, StaffMember,
} from "@/lib/services/staffService";

// "Join the staff" on the public event page, shown while the organizer allows public staff
// applications (event.allowPublicStaff). Applying writes my own staff doc with status "applied";
// the organizer accepts or rejects it on the Staff page.
export function StaffApplyPanel({ eventId }: { eventId: string }) {
  const { user, profile } = useAuth();
  const [mine, setMine] = useState<StaffMember | null | undefined>(undefined);
  const [role, setRole] = useState<StaffMember["role"]>("chair");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getMyStaffDoc(eventId, user.uid).then(setMine);
  }, [eventId, user]);

  if (!user || mine === undefined) return null;
  // Already on the staff (or invited): the dashboard is where that lives.
  if (mine && mine.inviteStatus !== "applied") return null;

  const name = profile?.displayName
    || [profile?.firstName, profile?.lastName].filter(Boolean).join(" ")
    || "";

  const apply = async () => {
    if (!user.email) return setError("Your account needs an email address to apply.");
    setBusy(true); setError(null);
    const res = await applyForStaff(eventId, { uid: user.uid, name, email: user.email }, role);
    if (res.success) setMine(await getMyStaffDoc(eventId, user.uid));
    else setError("Couldn't send your application. Please try again.");
    setBusy(false);
  };

  const withdraw = async () => {
    setBusy(true); setError(null);
    const res = await withdrawStaffApplication(eventId, user.uid);
    if (res.success) setMine(null);
    else setError("Couldn't withdraw. Please try again.");
    setBusy(false);
  };

  return (
    <section className="mp-panel mp-rail-panel">
      <h2 className="mp-panel-kick">Join the staff</h2>
      <p className="mp-rail-lede">
        {mine ? "Your application is with the organizer." : "The organizer is taking applications for the dais."}
      </p>
      {mine ? (
        <>
          <span className="mp-pill mp-pill-ok" style={{ alignSelf: "flex-start" }}>
            Applied as {roleLabel(mine.role)}
          </span>
          <button type="button" className={`mp-btn mp-btn-block ${busy ? "mp-btn-off" : "mp-btn-sec"}`} onClick={withdraw} disabled={busy}>
            {busy ? "Withdrawing…" : "Withdraw application"}
          </button>
        </>
      ) : (
        <>
          <div className="mp-radios" role="radiogroup" aria-label="Role">
            {STAFF_APPLY_ROLES.map(r => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={role === r}
                className="mp-radio"
                onClick={() => setRole(r)}
              >
                <span className="mp-radio-dot" aria-hidden="true" />
                {roleLabel(r)}
                {role === r && <em>Selected</em>}
              </button>
            ))}
          </div>
          <button type="button" className={`mp-btn mp-btn-block ${busy ? "mp-btn-off" : "mp-btn-sec"}`} onClick={apply} disabled={busy}>
            {busy ? "Sending…" : `Apply as ${roleLabel(role)}`}
          </button>
          <p className="mp-rail-note">The organizer assigns your committee if you&apos;re accepted.</p>
        </>
      )}
      {error && <p className="mp-field-error" role="alert">{error}</p>}
    </section>
  );
}
