"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { isAppAdminProfile } from "@/lib/utils/roles";

// Gate for every App Admin page. Returns `authorized` once the signed-in user is
// confirmed an admin; non-admins are bounced to the regular dashboard.
export function useAdminGuard() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  const isAppAdmin = isAppAdminProfile(profile as any);

  useEffect(() => {
    if (loading) return;
    if (!isAppAdmin) {
      router.replace("/dashboard");
      return;
    }
    setAuthorized(true);
  }, [loading, isAppAdmin, router]);

  return { authorized, profile, loading };
}
