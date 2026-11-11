"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeRoomNotifications, RoomNotification } from "@/lib/services/roomNotificationService";
import { Button } from "@/components/ui/button";
import { Bell, BellRing, X, Info, AlertTriangle, Siren } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

interface RoomNotificationsProps {
  eventId: string;
  committeeId: string;
  applicationId: string;
}

const typeConfig = {
  info: {
    label: "Info",
    icon: Info,
    color: "text-blue-500",
    bg: "bg-blue-500/10 border-blue-500/20",
    toast: "bg-blue-500",
  },
  warning: {
    label: "Warning",
    icon: AlertTriangle,
    color: "text-yellow-500",
    bg: "bg-yellow-500/10 border-yellow-500/20",
    toast: "bg-yellow-500",
  },
  urgent: {
    label: "Urgent",
    icon: Siren,
    color: "text-red-500",
    bg: "bg-red-500/10 border-red-500/20",
    toast: "bg-red-500",
  },
};

export function RoomNotifications({ eventId, committeeId, applicationId }: RoomNotificationsProps) {
  const [notifications, setNotifications] = useState<RoomNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<RoomNotification[]>([]);
  const prevIds = useRef<Set<string>>(new Set());
  const readKey = `room_notifs_read_${applicationId}_${committeeId}`;
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(readKey);
      return new Set(stored ? JSON.parse(stored) : []);
    } catch { return new Set(); }
  });

  useEffect(() => {
    if (!committeeId) return;
    const unsub = subscribeRoomNotifications(eventId, committeeId, (notifs) => {
      const newNotifs = notifs.filter(n => n.id && !prevIds.current.has(n.id!));
      newNotifs.forEach(n => prevIds.current.add(n.id!));
      if (newNotifs.length > 0) {
        setToasts(prev => [...prev, ...newNotifs]);
        setTimeout(() => setToasts(prev => prev.filter(t => !newNotifs.includes(t))), 5000);
      }
      setNotifications(notifs);
    });
    return () => unsub();
  }, [eventId, committeeId]);

  const unreadCount = notifications.filter(n => n.id && !readIds.has(n.id)).length;

  const markAllRead = () => {
    const ids = new Set(notifications.map(n => n.id!).filter(Boolean));
    setReadIds(ids);
    localStorage.setItem(readKey, JSON.stringify([...ids]));
  };

  const handleOpen = () => {
    setOpen(o => !o);
    if (!open) markAllRead();
  };

  return (
    <div className="relative">
      {/* Toast stack */}
      <div className="fixed bottom-6 right-6 z-50 space-y-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map(toast => {
            const cfg = typeConfig[toast.type] || typeConfig.info;
            const Icon = cfg.icon;
            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className={`${cfg.toast} text-white rounded-xl px-4 py-3 shadow-sm max-w-sm flex items-start gap-3 pointer-events-auto`}
              >
                <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold uppercase mb-0.5">{cfg.label} — Committee</p>
                  <p className="text-sm">{toast.message}</p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Bell button */}
      <Button
        variant="outline"
        size="sm"
        className="relative gap-2"
        onClick={handleOpen}
      >
        {unreadCount > 0 ? <BellRing className="w-4 h-4 text-primary animate-bounce" /> : <Bell className="w-4 h-4" />}
        Room Alerts
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            className="absolute right-0 top-full mt-2 w-80 glass-card rounded-2xl border border-border/50 shadow-sm z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between p-4 border-b border-border/50">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">Room Notifications</span>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-border/30">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  <Bell className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                  <p className="text-sm">No active notifications</p>
                </div>
              ) : (
                notifications.map(notif => {
                  const cfg = typeConfig[notif.type] || typeConfig.info;
                  const Icon = cfg.icon;
                  const createdDate = notif.createdAt?.toDate?.();
                  return (
                    <div key={notif.id} className={`p-4 ${cfg.bg} border-l-4`}>
                      <div className="flex items-start gap-2">
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.color}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-bold uppercase mb-0.5 ${cfg.color}`}>{cfg.label}</p>
                          <p className="text-sm text-foreground leading-snug">{notif.message}</p>
                          {createdDate && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDistanceToNow(createdDate, { addSuffix: true })}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
