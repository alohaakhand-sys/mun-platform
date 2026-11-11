"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserProfile, UserProfile } from "@/lib/services/userService";
import { PublicProfileView } from "@/components/features/profile/PublicProfileView";
import { ArrowLeft, User } from "lucide-react";

export default function PublicProfilePage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const uid = (params?.uid as string) || "";

  const [target, setTarget] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!uid) return;
    if (user && uid === user.uid) {
      router.replace("/dashboard/settings");
      return;
    }
    (async () => {
      setLoading(true);
      const data = await getUserProfile(uid);
      if (!data) setNotFound(true);
      else setTarget(data);
      setLoading(false);
    })();
  }, [uid, user, router]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-56 rounded-2xl" />
          </div>
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (notFound || !target) {
    return (
      <div className="max-w-5xl mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto">
          <User className="w-8 h-8 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold">Profile not found</h1>
        <p className="text-muted-foreground">This user doesn&apos;t exist, or their profile is private.</p>
        <Button variant="outline" onClick={() => router.back()} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-3">
      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
      </motion.div>
      <PublicProfileView profile={target} />
    </div>
  );
}
