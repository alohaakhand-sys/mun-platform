"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Loader2, AlertCircle, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { useNotifications, typeConfig } from "@/contexts/NotificationsContext";
import { cn } from "@/lib/utils";

type Props = {
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
};

export function NotificationBell({ align = "end", side, className }: Props) {
  const {
    notifications,
    roomNotifications,
    appNotifications,
    readIds,
    loading,
    unreadCount,
    fetchNotifications,
    markRoomNotifsRead,
    markAppNotifRead,
    markAllAppNotifsRead,
    handleAcceptInvite,
    handleRejectInvite,
  } = useNotifications();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const runInviteAction = async (notif: any, action: (n: any) => Promise<void>) => {
    setBusyId(notif.id);
    setActionError(null);
    try {
      await action(notif);
    } catch (err: any) {
      setActionError(err?.message || "Action failed. Check your access and try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          fetchNotifications();
          markRoomNotifsRead();
        }
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className={cn("relative text-muted-foreground hover:text-foreground", className)}
          />
        }
      >
        <span className="sr-only">View notifications</span>
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 block h-2 w-2 rounded-full bg-primary ring-2 ring-background animate-pulse" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="w-80 glass-card p-4 space-y-3 z-50">
        <div className="flex items-center justify-between border-b pb-2 border-border/50">
          <span className="font-semibold text-sm">Notifications</span>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 text-[10px] font-bold bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary rounded-full animate-pulse">
              {unreadCount} new
            </span>
          )}
        </div>

        {actionError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-600">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : notifications.length === 0 && roomNotifications.length === 0 && appNotifications.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No new notifications</div>
        ) : (
          <div className="max-h-80 overflow-y-auto space-y-4 pr-1">
            {/* Updates (migration + general) */}
            {appNotifications.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Updates ({appNotifications.length})
                  </span>
                  {appNotifications.some((n) => !n.read) && (
                    <button
                      onClick={markAllAppNotifsRead}
                      className="text-[10px] font-semibold text-primary hover:underline"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {appNotifications.map((n) => {
                    const createdDate = n.createdAt?.toDate?.() ||
                      (n.createdAt?.seconds ? new Date(n.createdAt.seconds * 1000) : null);
                    return (
                      <button
                        key={n.id}
                        onClick={() => {
                          markAppNotifRead(n.id);
                          if (n.href) { setOpen(false); router.push(n.href); }
                        }}
                        className={cn(
                          "w-full text-left p-3 rounded-xl border border-border/40 bg-secondary transition-all",
                          !n.read && "border-l-4 border-l-primary dark:border-l-primary bg-primary/5"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <ArrowRightLeft className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold leading-snug break-words">{n.title}</p>
                            <p className="text-xs text-muted-foreground leading-snug break-words mt-0.5">{n.body}</p>
                            {createdDate && (
                              <span className="text-[10px] text-muted-foreground block mt-1">
                                {formatDistanceToNow(createdDate, { addSuffix: true })}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Staff Invitations */}
            {notifications.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">
                  Invitations ({notifications.length})
                </div>
                <div className="space-y-2">
                  {notifications.map((notif) => (
                    <div key={notif.id} className="p-3 rounded-xl border border-border/40 bg-secondary space-y-2 text-xs">
                      <div>
                        {notif.isRoleUpdate ? (
                          <>
                            Your role in <strong>{notif.eventTitle}</strong> has been updated to{" "}
                            <span className="capitalize font-semibold text-primary dark:text-primary">{notif.role}</span>.
                            Accept to apply the change.
                          </>
                        ) : (
                          <>
                            You are invited to join <strong>{notif.eventTitle}</strong> as a{" "}
                            <span className="capitalize font-semibold text-primary dark:text-primary">{notif.role}</span>.
                          </>
                        )}
                      </div>
                      <div className="flex gap-2 justify-end pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === notif.id}
                          className="h-7 text-[10px] px-2 text-destructive border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => runInviteAction(notif, handleRejectInvite)}
                        >
                          {notif.isRoleUpdate ? "Decline" : "Reject"}
                        </Button>
                        <Button
                          size="sm"
                          disabled={busyId === notif.id}
                          className="h-7 text-[10px] px-2 bg-primary hover:bg-primary text-white"
                          onClick={() => runInviteAction(notif, handleAcceptInvite)}
                        >
                          {busyId === notif.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Accept"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Room Alerts */}
            {roomNotifications.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">
                  Room Alerts ({roomNotifications.length})
                </div>
                <div className="space-y-2">
                  {roomNotifications.map((notif) => {
                    const cfg = typeConfig[notif.type as "info" | "warning" | "urgent"] || typeConfig.info;
                    const Icon = cfg.icon;
                    const createdDate = notif.createdAt?.toDate?.() ||
                      (notif.createdAt?.seconds ? new Date(notif.createdAt.seconds * 1000) : null);
                    const isUnread = notif.id && !readIds.has(notif.id);

                    return (
                      <div
                        key={notif.id}
                        className={cn(
                          "p-3 rounded-xl border border-border/40 bg-secondary relative overflow-hidden transition-all duration-200",
                          isUnread && "border-l-4 border-l-primary dark:border-l-primary bg-primary/5"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", cfg.color)} />
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center gap-2 mb-1">
                              <span className="text-[10px] font-bold text-muted-foreground truncate max-w-[120px]">
                                {notif.eventTitle} — {notif.committeeId}
                              </span>
                              <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded", cfg.bg, cfg.color)}>
                                {cfg.label}
                              </span>
                            </div>
                            <p className="text-xs text-foreground font-medium leading-snug break-words">
                              {notif.message}
                            </p>
                            {createdDate && (
                              <span className="text-[10px] text-muted-foreground block mt-1">
                                {formatDistanceToNow(createdDate, { addSuffix: true })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
