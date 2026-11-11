import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs, startAfter, where, QueryConstraint } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export interface AuditLogEntry {
  id?: string;
  actorUid: string;
  actorEmail?: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  targetName?: string;
  before?: string; // JSON
  after?: string; // JSON
  ip?: string;
  timestamp: any;
}

export async function logAudit(data: Omit<AuditLogEntry, "timestamp">) {
  try {
    if (!data.actorUid) {
      console.warn("logAudit skipped: missing actorUid", data);
      return;
    }
    const clean: Record<string, unknown> = { timestamp: serverTimestamp() };
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) clean[k] = v;
    }
    const logsRef = collection(db, "auditLogs");
    await addDoc(logsRef, clean);
  } catch (error) {
    console.error("Error writing audit log:", error);
  }
}

interface GetAuditLogsOptions {
  pageSize: number;
  cursor?: any; // The last document snapshot from the previous page
  filterByActor?: string;
  filterByAction?: string;
  dateRange?: { start: Date; end: Date };
}

export async function getAuditLogs({
  pageSize = 50,
  cursor,
  filterByActor,
  filterByAction,
  dateRange,
}: GetAuditLogsOptions) {
  const logsRef = collection(db, "auditLogs");
  const constraints: QueryConstraint[] = [];

  if (filterByActor) constraints.push(where("actorUid", "==", filterByActor));
  if (filterByAction) constraints.push(where("action", "==", filterByAction));
  if (dateRange?.start) constraints.push(where("timestamp", ">=", dateRange.start));
  if (dateRange?.end) constraints.push(where("timestamp", "<=", dateRange.end));

  // Firebase requires order by inequality field first
  constraints.push(orderBy("timestamp", "desc"));
  
  if (cursor) constraints.push(startAfter(cursor));
  
  constraints.push(limit(pageSize));

  const q = query(logsRef, ...constraints);
  const snapshot = await getDocs(q);
  
  const lastVisible = snapshot.docs[snapshot.docs.length - 1];
  const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AuditLogEntry));

  return { logs, lastVisible };
}
