"use client";

import { useEffect, useState } from "react";
import { getAnnouncements, Announcement, isUserInAudience } from "@/lib/services/announcementService";
import { doc, updateDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Loader2, Megaphone, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { marked } from "marked";

// Only announcements that have actually been dispatched are visible in-app — drafts
// and future-scheduled ones stay hidden until sent.
const VISIBLE_STATUSES = new Set(["queued", "sending", "sent", "partial"]);

interface AnnouncementViewerProps {
  eventId: string;
  applicationId: string;
  onUnreadCount?: (count: number) => void;
  userRole?: string;
}

function safeHtml(html: string) {
  // Basic sanitization — strip script tags
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
}

export function AnnouncementViewer({ eventId, applicationId, onUnreadCount, userRole }: AnnouncementViewerProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastViewed, setLastViewed] = useState<Date | null>(null);

  useEffect(() => {
    // Load last viewed timestamp from localStorage
    const stored = localStorage.getItem(`announcements_viewed_${applicationId}`);
    const lastViewedDate = stored ? new Date(stored) : null;
    setLastViewed(lastViewedDate);

    const fetchRoleAndAnnouncements = async () => {
      let role = userRole;
      if (!role) {
        try {
          const appSnap = await getDoc(doc(db, "applications", applicationId));
          if (appSnap.exists()) {
            role = appSnap.data()?.role;
          }
        } catch (e) {
          console.error("Error fetching application role:", e);
        }
      }

      const data = await getAnnouncements(eventId);
      const visible = data.filter(a =>
        (!a.status || VISIBLE_STATUSES.has(a.status)) &&
        isUserInAudience(role || "Delegate", a.audience)
      );
      setAnnouncements(visible);

      if (onUnreadCount) {
        const unread = lastViewedDate
          ? visible.filter(a => a.createdAt?.toDate?.() > lastViewedDate).length
          : visible.length;
        onUnreadCount(unread);
      }

      // Mark as viewed now
      const now = new Date().toISOString();
      localStorage.setItem(`announcements_viewed_${applicationId}`, now);
      window.dispatchEvent(new CustomEvent("announcementsRead", { detail: { count: 0 } }));

      // Also persist to Firestore
      updateDoc(doc(db, "applications", applicationId), {
        lastAnnouncementsViewedAt: serverTimestamp()
      }).catch(() => {});

      setLoading(false);
    };

    fetchRoleAndAnnouncements();
  }, [eventId, applicationId, onUnreadCount, userRole]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (announcements.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center">
        <Megaphone className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-1">No announcements yet</h3>
        <p className="text-sm text-muted-foreground">Organizer announcements will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {announcements.map((ann) => {
        const createdDate = ann.createdAt?.toDate?.();
        const isUnread = lastViewed && createdDate ? createdDate > lastViewed : false;

        return (
          <div
            key={ann.id}
            className={`glass-card rounded-2xl p-6 border transition-colors ${
              isUnread ? "border-primary/30 bg-primary/5" : "border-border/40"
            }`}
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-2">
                {isUnread && (
                  <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                )}
                <h3 className="font-bold text-base">{ann.subject}</h3>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {createdDate
                  ? formatDistanceToNow(createdDate, { addSuffix: true })
                  : "Recently"
                }
              </span>
            </div>
            <div
              className="markdown-content text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: safeHtml(marked.parse(ann.body || "", { async: false }) as string) }}
            />
          </div>
        );
      })}
    </div>
  );
}
