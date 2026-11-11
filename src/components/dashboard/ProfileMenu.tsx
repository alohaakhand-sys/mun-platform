"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  trigger: React.ReactElement;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
};

export function ProfileMenu({ trigger, align = "end", side }: Props) {
  const { profile, logout } = useAuth();

  const isAppAdmin =
    profile?.role === "App Admin" || profile?.role === "admin" || (profile as any)?.isAdmin;

  // The App Admin's support address (Settings → General), else the Contact page.
  const openSupport = async () => {
    const email = await getDoc(doc(db, "systemSettings", "global")).then((d) => String(d.data()?.supportEmail || "")).catch(() => "");
    window.location.href = email && !email.endsWith("@example.com") ? `mailto:${email}` : "/contact";
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align={align} side={side} className="w-56 glass-card">
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-border/50" />
        {isAppAdmin ? (
          <>
            <DropdownMenuItem render={<Link href="/dashboard/admin" />}>Admin Dashboard</DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/dashboard/admin/settings" />}>System Settings</DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem render={<Link href="/dashboard/settings" />}>Settings</DropdownMenuItem>
            <DropdownMenuItem onClick={openSupport}>Support</DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator className="bg-border/50" />
        <DropdownMenuItem onClick={logout} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
