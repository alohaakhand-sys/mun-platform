import { 
  collection, doc, setDoc, updateDoc, deleteDoc, 
  query, where, getDocs, getDoc, serverTimestamp, 
  onSnapshot, writeBatch, limit 
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export interface Connection {
  id: string; // otherUid
  otherUid: string;
  displayName: string;
  photoURL: string;
  role: string;
  source: "auto" | "manual";
  sourceEventId?: string;
  sourceCommitteeId?: string;
  connectedAt: any;
  status: "active" | "muted" | "blocked";
}

export interface Block {
  id: string; // blockedUid
  blockedUid: string;
  blockedAt: any;
  reason?: string;
}

export function getConnectionsRealtime(
  uid: string, 
  callback: (connections: Connection[]) => void
): () => void {
  const q = query(collection(db, "users", uid, "connections"));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Connection)));
  });
}

export async function connectManually(
  uid: string, otherUid: string, 
  myName: string, myPhoto: string, myRole: string,
  otherName: string, otherPhoto: string, otherRole: string
): Promise<void> {
  const batch = writeBatch(db);
  
  // Check if there is a block
  const blockSnap = await getDoc(doc(db, "users", otherUid, "blocks", uid));
  if (blockSnap.exists()) {
    throw new Error("Cannot connect"); // Keep it ambiguous
  }
  
  const myConnRef = doc(db, "users", uid, "connections", otherUid);
  batch.set(myConnRef, {
    otherUid,
    displayName: otherName,
    photoURL: otherPhoto,
    role: otherRole,
    source: "manual",
    connectedAt: serverTimestamp(),
    status: "active"
  });

  const otherConnRef = doc(db, "users", otherUid, "connections", uid);
  batch.set(otherConnRef, {
    otherUid: uid,
    displayName: myName,
    photoURL: myPhoto,
    role: myRole,
    source: "manual",
    connectedAt: serverTimestamp(),
    status: "active"
  });

  await batch.commit();
}

export async function disconnect(uid: string, otherUid: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, "users", uid, "connections", otherUid));
  batch.delete(doc(db, "users", otherUid, "connections", uid));
  await batch.commit();
}

export async function blockUser(uid: string, targetUid: string, reason?: string): Promise<void> {
  const batch = writeBatch(db);
  
  // 1. Write block doc
  batch.set(doc(db, "users", uid, "blocks", targetUid), {
    blockedUid: targetUid,
    blockedAt: serverTimestamp(),
    reason: reason || ""
  });

  // 2. Update connection status to "blocked"
  batch.set(doc(db, "users", uid, "connections", targetUid), { status: "blocked" }, { merge: true });
  batch.set(doc(db, "users", targetUid, "connections", uid), { status: "blocked" }, { merge: true });

  // 3. Mark direct conversation as blocked
  const convId = [uid, targetUid].sort().join("_");
  const convRef = doc(db, "conversations", convId);
  batch.set(convRef, {
    blockedBy: [uid] // In real app, arrayUnion(uid) but since we use set with merge, we can just do this if we fetch first, or just arrayUnion
  }, { merge: true }); // Actually arrayUnion is not directly available in basic set merge without FieldValue. Let's do it safely:

  await batch.commit();
  
  // Follow up to use arrayUnion properly for blockedBy
  const { arrayUnion } = await import("firebase/firestore");
  await updateDoc(convRef, {
    blockedBy: arrayUnion(uid)
  }).catch(() => {}); // Catch if it doesn't exist
}

export async function unblockUser(uid: string, targetUid: string): Promise<void> {
  const batch = writeBatch(db);
  
  batch.delete(doc(db, "users", uid, "blocks", targetUid));
  
  // Revert connection status (we just set it back to active for simplicity, or we could delete it)
  batch.set(doc(db, "users", uid, "connections", targetUid), { status: "active" }, { merge: true });
  batch.set(doc(db, "users", targetUid, "connections", uid), { status: "active" }, { merge: true });

  await batch.commit();

  const convId = [uid, targetUid].sort().join("_");
  const convRef = doc(db, "conversations", convId);
  const { arrayRemove } = await import("firebase/firestore");
  await updateDoc(convRef, {
    blockedBy: arrayRemove(uid)
  }).catch(() => {});
}

export async function isBlocked(uid: string, otherUid: string): Promise<boolean> {
  const [b1, b2] = await Promise.all([
    getDoc(doc(db, "users", uid, "blocks", otherUid)),
    getDoc(doc(db, "users", otherUid, "blocks", uid))
  ]);
  return b1.exists() || b2.exists();
}
