import { ref, onDisconnect, set, onValue, serverTimestamp as rtdbServerTimestamp } from "firebase/database";
import { doc, getDoc } from "firebase/firestore";
import { db, rtdb } from "@/lib/firebase/client";

export type PresenceState = "online" | "away" | "offline";

export interface PresenceData {
  state: PresenceState;
  lastChangedAt: any;
}

export function initPresence(uid: string): () => void {
  const userStatusRef = ref(rtdb, `/status/${uid}`);
  const connectedRef = ref(rtdb, ".info/connected");

  const unsubscribe = onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
      const con = onDisconnect(userStatusRef);
      con.set({
        state: "offline",
        lastChangedAt: rtdbServerTimestamp(),
      }).then(() => {
        set(userStatusRef, {
          state: "online",
          lastChangedAt: rtdbServerTimestamp(),
        });
      });
    }
  });

  return () => {
    unsubscribe();
    set(userStatusRef, {
      state: "offline",
      lastChangedAt: rtdbServerTimestamp(),
    });
  };
}

// Presence lives in RTDB /status/{uid}, written by initPresence above (and the app). It used to be
// read from a users/{uid}.presence mirror that nothing writes, so everyone looked offline. Members
// who hid their profile (privacySettings.showProfile === false) still show as offline.
function hidden(uid: string): Promise<boolean> {
  return getDoc(doc(db, "users", uid))
    .then((s) => s.exists() && s.data().privacySettings?.showProfile === false)
    .catch(() => false);
}

function toPresence(v: any): PresenceData {
  if (!v || typeof v.state !== "string") return { state: "offline", lastChangedAt: null };
  const at = typeof v.lastChangedAt === "number" ? v.lastChangedAt : null;
  // Callers read lastChangedAt.toDate(), as with the old Firestore Timestamp.
  return { state: v.state as PresenceState, lastChangedAt: at === null ? null : { toDate: () => new Date(at) } };
}

export function subscribeToPresence(
  uid: string,
  callback: (presence: PresenceData) => void
): () => void {
  let unsub = () => {};
  let closed = false;
  hidden(uid).then((isHidden) => {
    if (closed) return;
    if (isHidden) { callback({ state: "offline", lastChangedAt: null }); return; }
    unsub = onValue(ref(rtdb, `/status/${uid}`), (snap) => callback(toPresence(snap.val())), () => {});
  });
  return () => { closed = true; unsub(); };
}

export function subscribeToMultiplePresence(
  uids: string[],
  callback: (presenceMap: Record<string, PresenceData>) => void
): () => void {
  if (!uids || uids.length === 0) {
    callback({});
    return () => {};
  }
  const unsubscribes = uids.map((uid) => subscribeToPresence(uid, (p) => callback({ [uid]: p })));
  return () => unsubscribes.forEach((u) => u());
}
