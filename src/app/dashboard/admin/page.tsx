"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, query, where, getCountFromServer, getAggregateFromServer, sum } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAdminGuard } from "@/lib/hooks/useAdminGuard";
import { getRecentActivities, ActivityData } from "@/lib/services/activityService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Calendar, Globe2, TrendingUp, Activity, ShieldCheck, Crown, Wallet, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Stats { users: number; events: number; applications: number; revenue: number; }
interface Pending { organizers: number; pro: number; payouts: number; }

export default function AdminOverviewPage() {
  const { authorized } = useAdminGuard();
  const [stats, setStats] = useState<Stats>({ users: 0, events: 0, applications: 0, revenue: 0 });
  const [pending, setPending] = useState<Pending>({ organizers: 0, pro: 0, payouts: 0 });
  const [activities, setActivities] = useState<ActivityData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authorized) return;
    (async () => {
      try {
        // Counts and sums are aggregations (a read per 1,000 docs), never whole collections:
        // the Spark plan allows 50k reads a day.
        const count = async (q: any) => (await getCountFromServer(q)).data().count;
        const total = async (q: any, field: string) => Number((await getAggregateFromServer(q, { t: sum(field) })).data().t || 0);
        const apps = collection(db, "applications");
        const events = collection(db, "events");
        const [users, applications, live, orgs, upgrades, payouts, paid, devPaid, proPaid, proDev, recent] = await Promise.all([
          count(collection(db, "users")),
          count(apps),
          count(query(events, where("status", "==", "published"))),
          count(query(collection(db, "organizerApplications"), where("status", "==", "pending"))),
          count(query(collection(db, "upgradeRequests"), where("status", "==", "pending"))),
          count(query(collection(db, "payoutRequests"), where("status", "==", "pending"))),
          total(query(apps, where("paymentStatus", "==", "paid")), "paidAmount"),
          total(query(apps, where("paymentStatus", "==", "paid"), where("devPaid", "==", true)), "paidAmount"),
          total(query(events, where("plan.source", "==", "paid")), "plan.paidAmount"),
          total(query(events, where("plan.source", "==", "paid"), where("plan.provider", "==", "dev")), "plan.paidAmount"),
          getRecentActivities(6),
        ]);
        // Real money only: ticket payments plus paid Pro events, without Developer Payment Mode.
        const revenue = Math.round((paid - devPaid + proPaid - proDev) * 100) / 100;
        setStats({ users, events: live, applications, revenue });
        setPending({ organizers: orgs, pro: upgrades, payouts });
        setActivities(recent);
      } catch (err) {
        console.error("Error loading admin overview:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [authorized]);

  if (!authorized || loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <Skeleton className="h-[400px] rounded-2xl" />
      </div>
    );
  }

  const statCards = [
    { label: "Total Users", value: stats.users, Icon: Users, accent: "text-blue-500" },
    { label: "Live Events", value: stats.events, Icon: Calendar, accent: "text-primary" },
    { label: "Applications", value: stats.applications, Icon: Globe2, accent: "text-amber-500" },
    { label: "Revenue", value: `$${stats.revenue.toLocaleString()}`, Icon: TrendingUp, accent: "text-green-500" },
  ];

  const queue = [
    { label: "Organizer Applications", count: pending.organizers, href: "/dashboard/admin/applications", Icon: ShieldCheck },
    { label: "Upgrade Requests", count: pending.pro, href: "/dashboard/admin/applications", Icon: Crown },
    { label: "Payout Requests", count: pending.payouts, href: "/dashboard/admin/payments", Icon: Wallet },
  ];

  return (
    <div className="space-y-8 pb-20">
      <div>
        <Badge className="bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/10 mb-1">System Administrator</Badge>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-1">Platform health and pending work at a glance.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map(({ label, value, Icon, accent }) => (
          <Card key={label} className="border-border/60">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
                <p className="text-3xl font-bold mt-1">{value}</p>
              </div>
              <Icon className={`w-8 h-8 ${accent} opacity-80`} />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Activity feed */}
        <Card className="lg:col-span-2 border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest events from across the platform.</CardDescription>
            </div>
            <Activity className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3 mt-2">
              {activities.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">No recent activity.</p>
              ) : activities.map((act) => (
                <div key={act.id} className="flex items-start gap-4 p-3 rounded-xl bg-secondary border border-border/40">
                  <Avatar className="w-9 h-9 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {act.actorName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-medium text-primary">{act.actorName}</span> {act.action} <span className="font-medium">{act.targetTitle}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {act.actorRole} &bull; {act.createdAt ? formatDistanceToNow(act.createdAt.toDate(), { addSuffix: true }) : "just now"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pending work queue */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Needs Attention</CardTitle>
            <CardDescription>Items waiting on you.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {queue.map(({ label, count, href, Icon }) => (
              <Link
                key={label}
                href={href}
                className="flex items-center justify-between p-3 rounded-xl border border-border/40 hover:bg-secondary transition-colors group"
              >
                <span className="flex items-center gap-3 text-sm font-medium">
                  <Icon className="w-4 h-4 text-muted-foreground" /> {label}
                </span>
                <span className="flex items-center gap-2">
                  {count > 0
                    ? <Badge variant="destructive">{count}</Badge>
                    : <Badge variant="outline" className="text-muted-foreground">0</Badge>}
                  <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
