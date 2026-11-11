"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getUserApplications, ApplicationData } from "@/lib/services/applicationService";
import { getEventById, EventData } from "@/lib/services/eventService";
import { getStudyGuide } from "@/lib/services/optionalModulesService";
import { isChairTierRole } from "@/lib/services/staffService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  Calendar, 
  MapPin, 
  Gavel, 
  BookOpen, 
  ChevronRight,
  ShieldCheck
} from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/firebase/client";
import { collectionGroup, query, where, getDocs } from "firebase/firestore";

interface ChairConference {
  event: EventData;
  application: ApplicationData;
  hasStudyGuide: boolean;
}

export default function ChairDashboardPage() {
  const { user, profile } = useAuth();
  const [conferences, setConferences] = useState<ChairConference[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadChairData() {
      if (!user) return;

      const userApps = await getUserApplications(user.uid);
      // Chair dashboard is for the chair tier only (chair / vice-chair).
      // Director & USG are Executive Board roles — they use /dashboard/eb.
      const chairApps = userApps.filter(app =>
        isChairTierRole(app.role) && app.status === "approved"
      );

      const conferenceMap = new Map<string, ChairConference>();

      await Promise.all(
        chairApps.map(async (app) => {
          const event = await getEventById(app.eventId);
          if (event) {
            conferenceMap.set(app.eventId, { event, application: app, hasStudyGuide: false });
          }
        })
      );

      try {
        const staffQuery = query(
          collectionGroup(db, "staff"),
          where("uid", "==", user.uid),
          where("inviteStatus", "==", "accepted")
        );
        const staffSnap = await getDocs(staffQuery);
        
        await Promise.all(
          staffSnap.docs.map(async (staffDoc) => {
            const data = staffDoc.data();
            // Only the chair tier (chair / vice-chair) belongs here.
            // Co-organizer, director and USG are excluded (they have their own dashboards).
            if (isChairTierRole(data.role)) {
              const pathSegments = staffDoc.ref.path.split("/");
              const eventId = pathSegments[1];
              
              if (!conferenceMap.has(eventId)) {
                const event = await getEventById(eventId);
                if (event) {
                  const appData: ApplicationData = {
                    id: staffDoc.id,
                    eventId,
                    userId: user.uid,
                    applicantName: user.displayName || "Staff Member",
                    applicantEmail: user.email || "",
                    role: data.role ? (data.role.charAt(0).toUpperCase() + data.role.slice(1)) : "Chair",
                    status: "approved",
                    assignedCommittee: data.committeeId || "",
                    choices: {
                      primary: { committee: data.committeeId || "", country: "" },
                      secondary: { committee: "", country: "" },
                      tertiary: { committee: "", country: "" }
                    },
                    experience: "",
                    motivation: "",
                    createdAt: data.addedAt || new Date()
                  };
                  conferenceMap.set(eventId, { event, application: appData, hasStudyGuide: false });
                }
              }
            }
          })
        );
      } catch (err) {
        console.error("Error fetching staff events in chair page:", err);
      }

      const confList = Array.from(conferenceMap.values());

      // Resolve real study-guide status per assigned committee
      await Promise.all(
        confList.map(async (conf) => {
          const committee = conf.application.assignedCommittee || conf.application.choices.primary.committee;
          if (!committee) return;
          try {
            const guide = await getStudyGuide(conf.event.id, committee);
            conf.hasStudyGuide = !!guide;
          } catch {
            conf.hasStudyGuide = false;
          }
        })
      );

      setConferences(confList);
      setLoading(false);
    }

    loadChairData();
  }, [user]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Chair Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Manage your assigned committees and evaluate delegate performance.
          </p>
        </div>
      </div>

      {conferences.length === 0 ? (
        <Card className="glass-card flex flex-col items-center justify-center py-20 text-center border-dashed">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Gavel className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-xl mb-2">No Committees Assigned</CardTitle>
          <CardDescription className="max-w-md mx-auto mb-6">
            You don't have any approved Chair or Executive Board assignments yet. Once an organizer approves your application, your committees will appear here.
          </CardDescription>
          <Link href="/dashboard/conferences">
            <Button>Browse Conferences</Button>
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {conferences.map(({ event, application, hasStudyGuide }, i) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className="glass-card hover:border-primary/50 transition-all group overflow-hidden">
                <div className="h-2 w-full bg-primary" />
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <Badge variant="outline" className="mb-2 bg-primary/5 text-primary border-primary/20">
                        {application.role}
                      </Badge>
                      <CardTitle className="text-xl">{event.title}</CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <Calendar className="w-3.5 h-3.5" /> {event.date}
                      </CardDescription>
                    </div>
                    <div className="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Gavel className="w-6 h-6 text-primary" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 rounded-xl bg-secondary border border-border/40">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center">
                        <ShieldCheck className="w-5 h-5 text-green-500" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Assigned Committee</p>
                        <p className="text-base font-semibold">{application.assignedCommittee || application.choices.primary.committee}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="w-4 h-4" />
                      <span>{event.committees.find(c => c.name === (application.assignedCommittee || application.choices.primary.committee))?.capacity || "N/A"} Delegates</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <BookOpen className="w-4 h-4" />
                      <span>Study Guide: {hasStudyGuide ? "Uploaded" : "Pending"}</span>
                    </div>
                  </div>

                  <Link href={`/dashboard/chair/committee/${event.id}`}>
                    <Button className="w-full mt-2 gap-2 group">
                      Manage Committee
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
