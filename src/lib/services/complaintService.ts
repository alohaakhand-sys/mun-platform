import { auth, db } from "@/lib/firebase/client";
import { collection, addDoc, updateDoc, doc, getDoc, serverTimestamp, arrayUnion, query, where, getDocs } from "firebase/firestore";
import { logAudit } from "@/lib/services/auditService";

export interface HistoryEntry {
  action: string;
  actorUid: string;
  actorRole: string;
  message: string;
  timestamp: any;
}

export interface ComplaintData {
  id?: string;
  eventId: string;
  applicationId: string;
  userId: string;
  type: string;
  subject: string;
  description: string;
  status: "open" | "under_review" | "escalated" | "resolved" | "rejected" | "pending";
  escalationLevel: number;
  assignedTo: string | null;
  assignedRole: "chair" | "organizer" | "mainOrganizer" | "appAdmin";
  actorUids: string[];
  history: HistoryEntry[];
  resolution?: string;
  createdAt: any;
  escalatedAt?: any;
}

export async function submitComplaint(data: {
  eventId: string;
  applicationId: string;
  userId: string;
  type: string;
  subject: string;
  description: string;
  chairUid: string | null;
}) {
  const historyEntry: HistoryEntry = {
    action: "submitted",
    actorUid: data.userId,
    actorRole: "delegate",
    message: "Complaint submitted.",
    timestamp: new Date().toISOString()
  };

  const actorUids = [data.userId];
  if (data.chairUid) actorUids.push(data.chairUid);

  const newComplaint = {
    eventId: data.eventId,
    applicationId: data.applicationId,
    userId: data.userId,
    type: data.type,
    subject: data.subject,
    description: data.description,
    status: "open",
    escalationLevel: 0,
    assignedTo: data.chairUid,
    assignedRole: "chair",
    actorUids,
    history: [historyEntry],
    resolution: "",
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, "complaints"), newComplaint);
  return { id: docRef.id, ...newComplaint };
}

async function getAdminUid() {
  const q = query(collection(db, "users"), where("role", "in", ["App Admin", "admin"]));
  const snap = await getDocs(q);
  if (!snap.empty) {
    return snap.docs[0].id;
  }
  return null;
}

export async function escalateComplaint(complaintId: string, currentLevel: number, reason: string, actorUid: string, actorRole: string) {
  const complaintRef = doc(db, "complaints", complaintId);
  const complaintSnap = await getDoc(complaintRef);
  if (!complaintSnap.exists()) throw new Error("Complaint not found");
  
  const complaintData = complaintSnap.data() as ComplaintData;
  const eventRef = doc(db, "events", complaintData.eventId);
  const eventSnap = await getDoc(eventRef);
  const eventData = eventSnap.exists() ? eventSnap.data() : null;

  let nextLevel = currentLevel + 1;
  let nextAssignedRole = "";
  let nextAssignedTo: string | null = null;

  if (nextLevel === 1) {
    nextAssignedRole = "organizer";
    nextAssignedTo = eventData?.organizerId || null;
  } else if (nextLevel === 2) {
    if (eventData?.mainOrganizerId) {
      nextAssignedRole = "mainOrganizer";
      nextAssignedTo = eventData.mainOrganizerId;
    } else {
      nextLevel = 3;
      nextAssignedRole = "appAdmin";
      nextAssignedTo = await getAdminUid();
    }
  } else if (nextLevel >= 3) {
    nextLevel = 3;
    nextAssignedRole = "appAdmin";
    nextAssignedTo = await getAdminUid();
  }

  const entry: HistoryEntry = {
    action: "escalated",
    actorUid,
    actorRole,
    message: reason,
    timestamp: new Date().toISOString()
  };

  const newActorUids = [actorUid];
  if (nextAssignedTo) newActorUids.push(nextAssignedTo);

  await updateDoc(complaintRef, {
    status: "escalated",
    escalationLevel: nextLevel,
    assignedRole: nextAssignedRole,
    assignedTo: nextAssignedTo,
    escalatedAt: serverTimestamp(),
    history: arrayUnion(entry),
    // We cannot use arrayUnion with an array directly unless spreading, but Firebase arrayUnion takes spread args
    actorUids: arrayUnion(...newActorUids)
  });

  if (actorRole === "App Admin" || actorRole === "admin" || actorRole === "appAdmin") {
    await logAudit({
      actorUid,
      actorRole,
      action: "complaint_escalated_by_admin",
      targetType: "complaint",
      targetId: complaintId,
      targetName: complaintData.subject,
    });
  }

  // Email the new handler that a complaint now needs their attention.
  if (nextAssignedTo) {
    try {
      // The handler's email is private: the server looks it up and sends.
      const token = await auth.currentUser?.getIdToken();
      if (token) {
        await fetch("/api/notify/complaint-escalated", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ complaintId }),
        });
      }
    } catch (e) {
      console.error("Complaint escalation email failed:", e);
    }
  }
}

export async function resolveComplaint(complaintId: string, resolution: string, actorUid: string, actorRole: string) {
  const entry: HistoryEntry = {
    action: "resolved",
    actorUid,
    actorRole,
    message: resolution || `Resolved by ${actorRole}.`,
    timestamp: new Date().toISOString()
  };
  await updateDoc(doc(db, "complaints", complaintId), {
    status: "resolved",
    resolution,
    history: arrayUnion(entry),
    actorUids: arrayUnion(actorUid)
  });

  if (actorRole === "App Admin" || actorRole === "admin" || actorRole === "appAdmin") {
    await logAudit({
      actorUid,
      actorRole,
      action: "complaint_resolved_by_admin",
      targetType: "complaint",
      targetId: complaintId,
    });
  }
}

export async function rejectComplaint(complaintId: string, reason: string, actorUid: string, actorRole: string) {
  const entry: HistoryEntry = {
    action: "rejected",
    actorUid,
    actorRole,
    message: reason || `Rejected by ${actorRole}.`,
    timestamp: new Date().toISOString()
  };
  await updateDoc(doc(db, "complaints", complaintId), {
    status: "rejected",
    history: arrayUnion(entry),
    actorUids: arrayUnion(actorUid)
  });
}

export async function addAddendum(complaintId: string, message: string, actorUid: string) {
  const entry: HistoryEntry = {
    action: "addendum",
    actorUid,
    actorRole: "delegate",
    message,
    timestamp: new Date().toISOString()
  };
  await updateDoc(doc(db, "complaints", complaintId), {
    history: arrayUnion(entry),
    actorUids: arrayUnion(actorUid)
  });
}
