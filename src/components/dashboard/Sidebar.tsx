"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard, FileText, Award, Settings,
  Users, Megaphone, Handshake, CreditCard, Crown,
  IdCard, Palette, CheckSquare, ArrowLeft, CalendarDays, Landmark, AlertTriangle,
  Users2, Wallet, Layers, Clock, Utensils, Bus, Hotel, Shirt, Trophy, Gavel,
  ShieldCheck, ScrollText, ShieldAlert, ClipboardList, Eye, BookOpen, Bell, FolderOpen, Radio
} from "lucide-react";
import { PanelLeftClose, PanelLeft, Wrench, QrCode, ScanLine, Ticket, ClipboardCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isOrganizerProfile } from "@/lib/utils/roles";
import { useSidebar } from "@/contexts/SidebarContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NotificationBell } from "./NotificationBell";
import { ProfileMenu } from "./ProfileMenu";
import { cn } from "@/lib/utils";
import { getUserApplications } from "@/lib/services/applicationService";
import { getEventById } from "@/lib/services/eventService";
import { getAnnouncements, isUserInAudience } from "@/lib/services/announcementService";
import { isChairTierRole, isExecBoardRole, isObserverRole, isFacultyStaffRole, isFacultyRole } from "@/lib/services/staffService";
import { useEventStaffRole, passesInUse } from "@/lib/hooks/useEventStaffRole";
import { db } from "@/lib/firebase/client";
import { collectionGroup, query, where, getDocs } from "firebase/firestore";

type NavItem = { name: string; href: string; icon: React.ElementType; exact?: boolean; badge?: number | string; badgeColor?: string };

const standardNavItems: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, exact: true },
  { name: "My Conferences", href: "/dashboard/conferences", icon: Users },
  { name: "Documents", href: "/dashboard/documents", icon: FolderOpen },
  { name: "My Blogs", href: "/dashboard/articles", icon: FileText },
  { name: "Achievements", href: "/dashboard/achievements", icon: Award },
  { name: "Network", href: "/dashboard/network", icon: Users2 },
  { name: "Payments", href: "/dashboard/payments", icon: Wallet },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

// App Admin runs a fully separate, admin-only dashboard — no delegate menu items
// (no "My Conferences", "Apply", payments, etc).
const adminNavItems: NavItem[] = [
  { name: "Overview", href: "/dashboard/admin", icon: LayoutDashboard, exact: true },
  { name: "Users", href: "/dashboard/admin/users", icon: Users },
  { name: "Events", href: "/dashboard/admin/events", icon: CalendarDays },
  { name: "Live Sessions", href: "/dashboard/admin/live-sessions", icon: Radio },
  { name: "Applications", href: "/dashboard/admin/applications", icon: ShieldCheck },
  { name: "Plans & Revenue", href: "/dashboard/admin/plans", icon: Crown },
  { name: "Payments", href: "/dashboard/admin/payments", icon: CreditCard },
  { name: "Complaints", href: "/dashboard/admin/complaints", icon: AlertTriangle },
  { name: "Moderation", href: "/dashboard/admin/moderation", icon: ShieldAlert },
  { name: "Tools", href: "/dashboard/admin/tools", icon: Wrench },
  { name: "Audit Logs", href: "/dashboard/admin/audit-logs", icon: ScrollText },
  { name: "Settings", href: "/dashboard/admin/settings", icon: Settings },
];

function NavItem({
  item,
  pathname,
  layoutId,
}: {
  item: NavItem;
  pathname: string;
  layoutId: string;
}) {
  const { collapsed } = useSidebar();
  const isActive = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + "/");

  return (
    <Link href={item.href} title={collapsed ? item.name : undefined} className="relative block">
      <motion.div
        className={cn(
          "flex items-center rounded-xl transition-colors relative z-10",
          collapsed ? "justify-center px-0 py-2.5" : "space-x-3 px-4 py-2.5",
          isActive
            ? "text-primary-foreground font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
        )}
      >
        <span className="relative shrink-0">
          <item.icon className="w-5 h-5" />
          {collapsed && item.badge !== undefined && (
            <span className={cn("absolute -top-1 -right-1 w-2 h-2 rounded-full ring-2 ring-background", item.badgeColor || "bg-primary")} />
          )}
        </span>
        {!collapsed && <span className="text-sm flex-1">{item.name}</span>}
        {!collapsed && item.badge !== undefined && (
          <span className={cn(
            "px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 z-20",
            isActive ? "bg-primary-foreground/90 text-primary" : cn("text-white", item.badgeColor || "bg-primary")
          )}>
            {item.badge}
          </span>
        )}
      </motion.div>
      {isActive && (
        <motion.div
          layoutId={layoutId}
          className="absolute inset-0 bg-primary rounded-md z-0"
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      )}
    </Link>
  );
}

function ConferenceNavItem({
  item,
  activeTab,
  layoutId,
}: {
  item: { name: string; href: string; icon: React.ElementType; tabValue: string; badge?: number };
  activeTab: string;
  layoutId: string;
}) {
  const { collapsed } = useSidebar();
  const isActive = activeTab === item.tabValue;
  const hasBadge = item.badge !== undefined && item.badge > 0;

  return (
    <Link href={item.href} title={collapsed ? item.name : undefined} className="relative block">
      <motion.div
        className={cn(
          "flex items-center rounded-xl transition-colors relative z-10",
          collapsed ? "justify-center px-0 py-2.5" : "justify-between px-4 py-2.5",
          isActive
            ? "text-primary-foreground font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
        )}
      >
        <div className={cn("flex items-center", !collapsed && "space-x-3")}>
          <span className="relative shrink-0">
            <item.icon className="w-5 h-5" />
            {collapsed && hasBadge && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-background" />
            )}
          </span>
          {!collapsed && <span className="text-sm">{item.name}</span>}
        </div>
        {!collapsed && hasBadge && (
          <span className={cn(
            "px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 z-20 transition-colors",
            isActive ? "bg-primary-foreground text-primary" : "bg-red-500 text-white"
          )}>
            {item.badge}
          </span>
        )}
      </motion.div>
      {isActive && (
        <motion.div
          layoutId={layoutId}
          className="absolute inset-0 bg-primary rounded-md z-0"
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      )}
    </Link>
  );
}

function SectionLabel({ label }: { label: string }) {
  const { collapsed } = useSidebar();
  if (collapsed) {
    return <div className="mx-auto my-3 h-px w-6 bg-border/60" />;
  }
  return (
    <h4 className="px-4 pt-5 pb-1.5 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-[0.12em]">
      {label}
    </h4>
  );
}

function SidebarCard({
  icon: Icon, title, subtitle, tone,
}: {
  icon: React.ElementType; title: string; subtitle: string;
  tone: { wrap: string; iconBg: string; icon: string; title: string };
}) {
  const { collapsed } = useSidebar();
  if (collapsed) {
    return (
      <div title={title} className={cn("mx-auto mb-3 w-9 h-9 rounded-lg flex items-center justify-center", tone.iconBg)}>
        <Icon className={cn("w-4 h-4", tone.icon)} />
      </div>
    );
  }
  return (
    <div className={cn("mb-4 mx-2 p-3 rounded-xl border flex items-center gap-3", tone.wrap)}>
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", tone.iconBg)}>
        <Icon className={cn("w-4 h-4", tone.icon)} />
      </div>
      <div>
        <p className={cn("text-xs font-bold", tone.title)}>{title}</p>
        <p className="text-[10px] text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

const ADMIN_TONE = { wrap: "bg-destructive/5 border-destructive/15", iconBg: "bg-destructive/10", icon: "text-destructive", title: "text-destructive" };

function BackLink({ href, label }: { href: string; label: string }) {
  const { collapsed } = useSidebar();
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-2 py-2 mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors",
        collapsed ? "justify-center px-0" : "px-4"
      )}
    >
      <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
      {!collapsed && label}
    </Link>
  );
}

function StandardSidebar({ pathname }: { pathname: string }) {
  const { profile, user } = useAuth();
  const [isChair, setIsChair] = useState(false);
  const [isCoOrg, setIsCoOrg] = useState(false);
  const [isEB, setIsEB] = useState(false);
  const [isReadonlyStaff, setIsReadonlyStaff] = useState(false);
  // Case-insensitive: the admin's approval writes "Organizer".
  const isOwnOrganizer = isOrganizerProfile(profile as any) || String(profile?.role || "").toLowerCase() === "admin";
  // Co-organizers get the same Organizer Tools entry as owners.
  const showOrganizerTools = isOwnOrganizer || isCoOrg;

  useEffect(() => {
    if (!user) return;

    const checkRoles = async () => {
      try {
        const apps = await getUserApplications(user.uid);
        const hasChairApp = apps.some(app => isChairTierRole(app.role));
        const hasEBApp = apps.some(app => isExecBoardRole(app.role));

        const staffRef = query(
          collectionGroup(db, "staff"),
          where("uid", "==", user.uid),
          where("inviteStatus", "==", "accepted")
        );
        const staffSnap = await getDocs(staffRef);
        const staffRoles = staffSnap.docs.map(doc => (doc.data().role || "").toLowerCase());

        // Co-organizer = organizer tier; director/usg = Executive Board; chair/vice = chair tier;
        // observer/faculty-advisor = read-only.
        setIsCoOrg(staffRoles.some(r => r === "co-organizer"));
        setIsEB(hasEBApp || staffRoles.some(r => isExecBoardRole(r)));
        setIsChair(hasChairApp || staffRoles.some(r => isChairTierRole(r)));
        setIsReadonlyStaff(staffRoles.some(r => isObserverRole(r) || isFacultyStaffRole(r)));
      } catch (err) {
        console.error("Error loading user apps/staff in sidebar:", err);
      }
    };

    checkRoles();
  }, [user]);

  return (
    <div className="flex-1 px-4 space-y-1 overflow-y-auto mt-2">
      <SectionLabel label="Menu" />
      {standardNavItems.map((item) => (
        <NavItem
          key={item.href}
          item={item}
          pathname={pathname}
          layoutId="active-std-sidebar"
        />
      ))}

      {isEB && (
        <>
          <SectionLabel label="Executive Board" />
          <NavItem
            item={{ name: "EB Dashboard", href: "/dashboard/eb", icon: ShieldCheck }}
            pathname={pathname}
            layoutId="active-std-sidebar"
          />
        </>
      )}

      {isChair && (
        <>
          <SectionLabel label="Chair Tools" />
          <NavItem
            item={{ name: "Chair Dashboard", href: "/dashboard/chair", icon: Gavel }}
            pathname={pathname}
            layoutId="active-std-sidebar"
          />
        </>
      )}

      {isReadonlyStaff && (
        <>
          <SectionLabel label="Read-only Access" />
          <NavItem
            item={{ name: "Observer Dashboard", href: "/dashboard/observer", icon: Eye }}
            pathname={pathname}
            layoutId="active-std-sidebar"
          />
        </>
      )}

      {showOrganizerTools && (
        <>
          <SectionLabel label={isCoOrg && !isOwnOrganizer ? "Co-organizer" : "Organizer Tools"} />
          <NavItem
            item={{ name: "Manage Events", href: "/dashboard/organizer/events", icon: CalendarDays }}
            pathname={pathname}
            layoutId="active-std-sidebar"
          />
        </>
      )}

    </div>
  );
}

function AdminSidebar({ pathname }: { pathname: string }) {
  return (
    <div className="flex-1 px-4 space-y-1 overflow-y-auto mt-4">
      <SidebarCard icon={ShieldAlert} title="System Admin" subtitle="Platform control" tone={ADMIN_TONE} />
      {adminNavItems.map((item) => (
        <NavItem key={item.href} item={item} pathname={pathname} layoutId="active-admin-sidebar" />
      ))}
    </div>
  );
}

function OrganizerSidebar({ pathname }: { pathname: string }) {
  const { profile } = useAuth();
  // Account-level Financials/Pro belong to an org owner, not a co-organizer.
  const isOwnOrganizer = isOrganizerProfile(profile as any) || String(profile?.role || "").toLowerCase() === "admin";
  return (
    <div className="flex-1 px-4 overflow-y-auto mt-4">
      <SectionLabel label="Organizer" />
      <NavItem item={{ name: "Manage Events", href: "/dashboard/organizer/events", icon: CalendarDays }} pathname={pathname} layoutId="active-org-sidebar" />
      {isOwnOrganizer && (
        <>
          <NavItem item={{ name: "Financials", href: "/dashboard/organizer/financials", icon: CreditCard }} pathname={pathname} layoutId="active-org-sidebar" />
          <NavItem item={{ name: "MUN Pilot Pro", href: "/dashboard/organizer/pro", icon: Crown }} pathname={pathname} layoutId="active-org-sidebar" />
        </>
      )}
      <BackLink href="/dashboard" label="Back to Dashboard" />
    </div>
  );
}

function EventSidebar({ eventId, pathname }: { eventId: string; pathname: string }) {
  const { user } = useAuth();
  // Owner sees Financials; co-organizers cannot change financial settings (plan D5).
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getEventById(eventId)
      .then(ev => { if (active) setIsOwner(!!ev && (ev as any).organizerId === user.uid); })
      .catch(() => {});
    return () => { active = false; };
  }, [eventId, user]);

  const base = `/dashboard/organizer/events/${eventId}`;
  return (
    <div className="flex-1 px-4 overflow-y-auto mt-4">
      {/* Setup = how the event is configured. Content = what participants actually read
          (schedule, announcements, the rulebook). Rules & Regs sat alone among config
          items before, which read as a stray setting rather than publishable content. */}
      <SectionLabel label="Setup" />
      <NavItem item={{ name: "Overview", href: base, icon: LayoutDashboard, exact: true }} pathname={pathname} layoutId="active-event-sidebar" />
      <NavItem item={{ name: "Details", href: `${base}/details`, icon: FileText }} pathname={pathname} layoutId="active-event-sidebar" />
      <NavItem item={{ name: "Allocation", href: `${base}/allocation`, icon: ClipboardList }} pathname={pathname} layoutId="active-event-sidebar" />
      <NavItem item={{ name: "Committees", href: `${base}/committees`, icon: Landmark }} pathname={pathname} layoutId="active-event-sidebar" />
      <NavItem item={{ name: "Partners", href: `${base}/partners`, icon: Handshake }} pathname={pathname} layoutId="active-event-sidebar" />
      <SectionLabel label="Content" />
      <NavItem item={{ name: "Schedule", href: `${base}/schedule`, icon: Clock }} pathname={pathname} layoutId="active-event-sidebar" />
      <NavItem item={{ name: "Announcements", href: `${base}/announcements`, icon: Megaphone }} pathname={pathname} layoutId="active-event-sidebar" />
      <NavItem item={{ name: "Rules & Regs", href: `${base}/rules`, icon: ScrollText }} pathname={pathname} layoutId="active-event-sidebar" />
      {/* Its own section: this is the switch that decides whether the conference is running
          live, not a configuration screen and not a report. */}
      <SectionLabel label="Live MUN" />
      <NavItem item={{ name: "Live Control", href: `${base}/live`, icon: Radio }} pathname={pathname} layoutId="active-event-sidebar" />
      <SectionLabel label="Tools" />
      <NavItem item={{ name: "Modules", href: `${base}/modules`, icon: Layers }} pathname={pathname} layoutId="active-event-sidebar" />
      <NavItem item={{ name: "Coupons", href: `${base}/coupons`, icon: Ticket }} pathname={pathname} layoutId="active-event-sidebar" />
      <NavItem item={{ name: "Scan Passes", href: `/dashboard/scan/${eventId}`, icon: ScanLine }} pathname={pathname} layoutId="active-event-sidebar" />
      <NavItem item={{ name: "Pass Report", href: `${base}/passes`, icon: ClipboardCheck }} pathname={pathname} layoutId="active-event-sidebar" />
      <NavItem item={{ name: "Complaints", href: `${base}/complaints`, icon: AlertTriangle }} pathname={pathname} layoutId="active-event-sidebar" />
      <NavItem item={{ name: "ID Cards", href: `${base}/tools/id-cards`, icon: IdCard }} pathname={pathname} layoutId="active-event-sidebar" />
      <NavItem item={{ name: "Certificates", href: `${base}/tools/certificates`, icon: Award }} pathname={pathname} layoutId="active-event-sidebar" />
      <NavItem item={{ name: "Theme", href: `${base}/tools/theme`, icon: Palette }} pathname={pathname} layoutId="active-event-sidebar" />
      <NavItem item={{ name: "Results", href: `${base}/tools/results`, icon: CheckSquare }} pathname={pathname} layoutId="active-event-sidebar" />
      {/* Co-organizers get the roles and schedule (prices locked); the money is the owner's. */}
      <SectionLabel label="Finances" />
      <NavItem item={{ name: isOwner ? "Financials" : "Roles & Schedule", href: `${base}/financials`, icon: CreditCard }} pathname={pathname} layoutId="active-event-sidebar" />
      <NavItem item={{ name: "Plan", href: `${base}/plan`, icon: Crown }} pathname={pathname} layoutId="active-event-sidebar" />
      <BackLink href="/dashboard/organizer/events" label="Back to Events" />
    </div>
  );
}

export function DelegateConferenceSidebar({ conferenceId, pathname }: { conferenceId: string; pathname: string }) {
  const { user } = useAuth();
  const { collapsed } = useSidebar();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "documents";

  const [loading, setLoading] = useState(true);
  const [optionalModules, setOptionalModules] = useState<string[]>([]);
  const [passesOn, setPassesOn] = useState(false);
  const [isFacultyAdvisor, setIsFacultyAdvisor] = useState(false);
  const [announcementUnread, setAnnouncementUnread] = useState(0);

  useEffect(() => {
    async function loadData() {
      if (!user || !conferenceId) return;
      try {
        const userApps = await getUserApplications(user.uid);
        const currentApp = userApps.find(
          app => (app as any).id === conferenceId || app.eventId === conferenceId
        );
        if (currentApp) {
          const isAdvisor = isFacultyRole(currentApp.role);
          setIsFacultyAdvisor(isAdvisor);

          const eventData = await getEventById(currentApp.eventId);
          if (eventData) {
            setOptionalModules((eventData as any).optionalModules || []);
            setPassesOn(passesInUse(eventData));

            // Fetch unread announcements count
            const stored = localStorage.getItem(`announcements_viewed_${(currentApp as any).id || conferenceId}`);
            const lastViewedDate = stored ? new Date(stored) : null;
            const annDocs = await getAnnouncements(currentApp.eventId);
            // Only count dispatched announcements — drafts/scheduled aren't visible yet.
            const dispatched = new Set(["queued", "sending", "sent", "partial"]);
            const visible = annDocs.filter(a =>
              (!a.status || dispatched.has(a.status)) &&
              isUserInAudience(currentApp.role || "Delegate", a.audience)
            );
            const unread = lastViewedDate
              ? visible.filter(a => a.createdAt?.toDate?.() > lastViewedDate).length
              : visible.length;
            setAnnouncementUnread(unread);
          }
        }
      } catch (err) {
        console.error("Error loading delegate sidebar data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [user, conferenceId]);

  useEffect(() => {
    const handleAnnouncementsRead = () => {
      setAnnouncementUnread(0);
    };
    window.addEventListener("announcementsRead", handleAnnouncementsRead);
    return () => {
      window.removeEventListener("announcementsRead", handleAnnouncementsRead);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex-1 px-4 space-y-4 mt-4">
        <div className="h-8 bg-secondary rounded-xl animate-pulse w-3/4" />
        <div className="space-y-2 pt-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-10 bg-secondary rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const baseHref = `/dashboard/conferences/${conferenceId}`;

  if (isFacultyAdvisor) {
    return (
      <div className="flex-1 px-4 overflow-y-auto mt-2">
        <Link
          href="/dashboard"
          title={collapsed ? "Back to Home" : undefined}
          className={cn(
            "flex items-center gap-2 py-3 mb-4 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors border-b border-border/40",
            collapsed ? "justify-center px-0" : "px-4"
          )}
        >
          <ArrowLeft className="w-4 h-4 text-primary shrink-0" />
          {!collapsed && "Back to Home"}
        </Link>
        <SectionLabel label="Faculty Advisor" />
        <ConferenceNavItem
          item={{ name: "Faculty Panel", href: `${baseHref}`, icon: Users, tabValue: "overview" }}
          activeTab="overview"
          layoutId="active-conf-sidebar"
        />
      </div>
    );
  }

  const navItems = [
    { name: "Overview", href: `${baseHref}?tab=overview`, icon: LayoutDashboard, tabValue: "overview" },
    { name: "Documents", href: `${baseHref}?tab=documents`, icon: FileText, tabValue: "documents" },
    {
      name: "Announcements",
      href: `${baseHref}?tab=announcements`,
      icon: Megaphone,
      tabValue: "announcements",
      badge: announcementUnread
    },
    { name: "Schedule", href: `${baseHref}?tab=schedule`, icon: Clock, tabValue: "schedule" },
    { name: "Requests", href: `${baseHref}?tab=complaints`, icon: AlertTriangle, tabValue: "complaints" },
  ];

  // One personal QR pass for meals, coupons and rides (setup/qr-passes-plan.md).
  if (passesOn) {
    navItems.push({ name: "My Pass", href: `${baseHref}?tab=pass`, icon: QrCode, tabValue: "pass" });
  }
  if (optionalModules.includes("food")) {
    navItems.push({ name: "Food", href: `${baseHref}?tab=food`, icon: Utensils, tabValue: "food" });
  }
  if (optionalModules.includes("transport")) {
    navItems.push({ name: "Transport", href: `${baseHref}?tab=transport`, icon: Bus, tabValue: "transport" });
  }
  if (optionalModules.includes("accommodation")) {
    navItems.push({ name: "Accommodation", href: `${baseHref}?tab=accommodation`, icon: Hotel, tabValue: "accommodation" });
  }
  if (optionalModules.includes("dresscode")) {
    navItems.push({ name: "Dress Code", href: `${baseHref}?tab=dresscode`, icon: Shirt, tabValue: "dresscode" });
  }

  navItems.push(
    { name: "Session Report", href: `${baseHref}?tab=session-report`, icon: ClipboardList, tabValue: "session-report" },
    { name: "Certificates", href: `${baseHref}?tab=certificate`, icon: Award, tabValue: "certificate" },
    { name: "Results", href: `${baseHref}?tab=results`, icon: Trophy, tabValue: "results" }
  );

  return (
    <div className="flex-1 px-4 overflow-y-auto mt-2">
      <Link
        href="/dashboard"
        className="flex items-center gap-2 px-4 py-3 mb-4 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors border-b border-border/40"
      >
        <ArrowLeft className="w-4 h-4 text-primary" />
        Back to Home
      </Link>

      <SectionLabel label="Conference Portal" />
      <div className="space-y-1">
        {navItems.map((item) => (
          <ConferenceNavItem
            key={item.tabValue}
            item={item}
            activeTab={activeTab}
            layoutId="active-conf-sidebar"
          />
        ))}
      </div>
    </div>
  );
}

// Chair committee-hub nav. Mirrors DelegateConferenceSidebar but drives the chair page's
// ?tab= views and gates the management tabs (Study Guide / Awards / Room Alert) behind the
// viewer's permissions — observers/faculty see only the read tabs.
export function ChairConferenceSidebar({ conferenceId, pathname }: { conferenceId: string; pathname: string }) {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "overview";
  const committeeParam = searchParams.get("committee");
  const staffRole = useEventStaffRole(conferenceId);

  const baseHref = `/dashboard/chair/committee/${conferenceId}`;
  // Oversight roles open a committee via ?committee= — keep it across tab switches.
  const hrefFor = (tab: string) =>
    committeeParam
      ? `${baseHref}?tab=${tab}&committee=${encodeURIComponent(committeeParam)}`
      : `${baseHref}?tab=${tab}`;

  const canMark = staffRole.isOrganizerLevel || staffRole.isExecBoard ||
    staffRole.isChairTier || staffRole.can("canMarkDelegates");
  const canManage = staffRole.isOrganizerLevel || staffRole.isExecBoard || staffRole.isChairTier;

  const navItems: { name: string; href: string; icon: React.ElementType; tabValue: string }[] = [
    { name: "Overview", href: hrefFor("overview"), icon: LayoutDashboard, tabValue: "overview" },
    { name: "Marking", href: hrefFor("marking"), icon: ClipboardList, tabValue: "marking" },
    // The day's procedural record — readable to every viewer of the committee hub, since
    // what the floor did is the committee's minutes, not privileged marking data.
    { name: "Motion Log", href: hrefFor("motionlog"), icon: Gavel, tabValue: "motionlog" },
    { name: "Papers", href: hrefFor("papers"), icon: FileText, tabValue: "papers" },
    { name: "Requests", href: hrefFor("requests"), icon: AlertTriangle, tabValue: "requests" },
  ];
  if (!staffRole.loading && canManage) {
    navItems.push({ name: "Study Guide", href: hrefFor("studyguide"), icon: BookOpen, tabValue: "studyguide" });
  }
  if (!staffRole.loading && canMark) {
    navItems.push({ name: "Awards & Results", href: hrefFor("awards"), icon: Trophy, tabValue: "awards" });
  }
  if (!staffRole.loading && canManage) {
    navItems.push({ name: "Room Alert", href: hrefFor("roomalert"), icon: Bell, tabValue: "roomalert" });
  }
  // Read-only for every viewer: chairs run rules of procedure from this screen, and the
  // rulebook used to be reachable only from the separate /dashboard/documents hub.
  navItems.push({ name: "Rules & Regs", href: hrefFor("rules"), icon: ScrollText, tabValue: "rules" });
  // Staff get their own QR pass too when the event uses passes (meals, transport, coupons).
  if (staffRole.passesOn) {
    navItems.push({ name: "My Pass", href: hrefFor("pass"), icon: QrCode, tabValue: "pass" });
  }
  // Staff the organizer allowed to scan meals and coupons at the counter.
  if (!staffRole.loading && staffRole.passesOn && staffRole.can("canScanPasses")) {
    navItems.push({ name: "Scan Passes", href: `/dashboard/scan/${conferenceId}`, icon: ScanLine, tabValue: "scan" });
  }

  return (
    <div className="flex-1 px-4 overflow-y-auto mt-2">
      <Link
        href="/dashboard/chair"
        className="flex items-center gap-2 px-4 py-3 mb-4 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors border-b border-border/40"
      >
        <ArrowLeft className="w-4 h-4 text-primary" />
        Back to Committees
      </Link>

      <SectionLabel label="Committee Hub" />
      <div className="space-y-1">
        {navItems.map((item) => (
          <ConferenceNavItem
            key={item.tabValue}
            item={item}
            activeTab={activeTab}
            layoutId="active-chair-sidebar"
          />
        ))}
      </div>
    </div>
  );
}

export function SidebarContent() {
  const pathname = usePathname();
  const { profile } = useAuth();

  // App Admin gets the admin-only sidebar everywhere — they have no delegate UI.
  const isAppAdmin =
    profile?.role === "App Admin" || profile?.role === "admin" || (profile as any)?.isAdmin;

  const isOrganizerPage = pathname.startsWith("/dashboard/organizer");
  const eventIdMatch = pathname.match(/\/dashboard\/organizer\/events\/([^/]+)/);
  const currentEventId =
    eventIdMatch && eventIdMatch[1] !== "create" ? eventIdMatch[1] : null;

  const isConferencePage = pathname.startsWith("/dashboard/conferences/");
  const confIdMatch = pathname.match(/\/dashboard\/conferences\/([^/]+)/);
  const currentConferenceId =
    confIdMatch && confIdMatch[1] !== "create" ? confIdMatch[1] : null;

  let content: React.ReactNode;
  if (isAppAdmin) {
    content = <AdminSidebar pathname={pathname} />;
  } else if (isConferencePage && currentConferenceId) {
    content = <DelegateConferenceSidebar conferenceId={currentConferenceId} pathname={pathname} />;
  } else if (isOrganizerPage && currentEventId) {
    content = <EventSidebar eventId={currentEventId} pathname={pathname} />;
  } else if (isOrganizerPage) {
    content = <OrganizerSidebar pathname={pathname} />;
  } else {
    content = <StandardSidebar pathname={pathname} />;
  }

  return content;
}

function UserCard() {
  const { user, profile } = useAuth();
  const { collapsed } = useSidebar();
  const name = profile?.displayName || user?.displayName || "User";
  const email = user?.email || "";
  const photo = profile?.photoURL || user?.photoURL || "";
  const initial = name.charAt(0).toUpperCase();

  if (collapsed) {
    return (
      <div className="p-3 mt-auto border-t border-border/40 flex flex-col items-center gap-2">
        <NotificationBell side="right" align="end" />
        <ProfileMenu
          side="right"
          align="end"
          trigger={
            <button title={name} className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              <Avatar className="h-9 w-9 ring-1 ring-border/50">
                <AvatarImage src={photo} alt={name} />
                <AvatarFallback className="bg-primary/15 text-primary text-sm font-semibold">{initial}</AvatarFallback>
              </Avatar>
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="p-3 mt-auto border-t border-border/40 space-y-2">
      <div className="flex justify-end">
        <NotificationBell side="top" align="end" />
      </div>
      <ProfileMenu
        side="top"
        align="start"
        trigger={
          <button className="w-full flex items-center gap-3 p-2 pr-2 rounded-2xl border border-border/50 bg-secondary hover:bg-secondary transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarImage src={photo} alt={name} />
              <AvatarFallback className="bg-primary/15 text-primary text-sm font-semibold">{initial}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate leading-tight">{name}</p>
              <p className="text-xs text-muted-foreground truncate">{email}</p>
            </div>
          </button>
        }
      />
    </div>
  );
}

export function Sidebar() {
  const { collapsed, toggle } = useSidebar();

  return (
    <div className={cn(
      "dash-rail hidden lg:flex flex-col fixed inset-y-0 z-50 transition-[width] duration-300 ease-in-out",
      collapsed ? "w-[76px]" : "w-64"
    )}>
      <div className={cn("h-16 flex items-center shrink-0 border-b border-border/40", collapsed ? "justify-center px-2" : "justify-between px-5")}>
        <Link href="/dashboard" className={cn("flex items-center min-w-0", !collapsed && "gap-2.5")}>
          <span className="mp-brand-mark shrink-0">MP</span>
          {!collapsed && <span className="mp-brand truncate" style={{ fontSize: "var(--h-md)" }}>MUN PRO</span>}
        </Link>
        {!collapsed && (
          <button onClick={toggle} title="Collapse sidebar" className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0">
            <PanelLeftClose className="w-5 h-5" />
          </button>
        )}
      </div>

      {collapsed && (
        <button onClick={toggle} title="Expand sidebar" className="mx-auto mt-2 w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <PanelLeft className="w-5 h-5" />
        </button>
      )}

      <SidebarContent />

      <UserCard />
    </div>
  );
}
