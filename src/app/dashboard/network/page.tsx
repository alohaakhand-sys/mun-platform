"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import {
  getConnectionsRealtime, connectManually, disconnect, blockUser, unblockUser,
  Connection, Block,
} from "@/lib/services/connectionService";
import { getUserProfile, getAllUsers, UserProfile } from "@/lib/services/userService";
import { createOrGetDirectConversation } from "@/lib/services/messageService";
import { getDocs, collection } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Avatar as UIAvatar,
  AvatarImage as UIAvatarImage,
  AvatarFallback as UIAvatarFallback,
} from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Users2, UserMinus, Ban, MessageSquare, UserPlus, UserCheck, ExternalLink, Sparkles,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

type ConfirmAction = {
  label: string;
  description: string;
  onConfirm: () => Promise<void>;
};

type DiscoverCandidate = { uid: string; name: string; photo: string; role: string };

/** Never surface a raw email as a name. displayName → "First Last" → email handle. */
function deriveName(u: any, fallback = "Member"): string {
  const dn = String(u?.displayName || "").trim();
  if (dn && !dn.includes("@")) return dn;
  const fl = `${u?.firstName || ""} ${u?.lastName || ""}`.trim();
  if (fl) return fl;
  if (dn) return dn;
  if (u?.email) return String(u.email).split("@")[0];
  return fallback;
}

const gridV = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const cardV = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };

function EmptyState({
  icon: Icon, title, desc, action,
}: {
  icon: React.ElementType; title: string; desc: string; action?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35 }}
      className="glass-card rounded-2xl flex flex-col items-center justify-center py-16 px-6 text-center gap-3"
    >
      <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center">
        <Icon className="w-7 h-7 text-muted-foreground" />
      </div>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">{desc}</p>
      </div>
      {action}
    </motion.div>
  );
}

function StatChip({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-secondary text-muted-foreground">
      <Icon className="w-3.5 h-3.5" /> {label}
    </span>
  );
}

export default function NetworkPage() {
  const { user, profile } = useAuth();
  const router = useRouter();

  const [connections, setConnections] = useState<Connection[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [discoverUsers, setDiscoverUsers] = useState<DiscoverCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [confirming, setConfirming] = useState(false);


  useEffect(() => {
    if (!user) return;
    const unsub = getConnectionsRealtime(user.uid, (conns) => {
      setConnections(conns);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const snap = await getDocs(collection(db, "users", user.uid, "blocks"));
      setBlocks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Block)));
    })();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const connectedUids = new Set(connections.map((c) => c.otherUid));
    (async () => {
      const users = await getAllUsers();
      const isAdminUser = (u: UserProfile) => {
        const role = String((u as any).role || "").toLowerCase();
        return role === "app admin" || role === "admin" || (u as any).isAdmin === true;
      };
      const candidates: DiscoverCandidate[] = users
        .filter((u) => u.uid !== user.uid && !connectedUids.has(u.uid))
        .filter((u) => u.privacySettings?.showProfile !== false)
        .filter((u) => !isAdminUser(u))
        .slice(0, 30)
        .map((u) => ({
          uid: u.uid,
          name: deriveName(u),
          photo: u.photoURL || "",
          role: u.role || "Delegate",
        }));
      setDiscoverUsers(candidates);
    })();
  }, [user, connections]);

  const openProfile = (uid: string) => router.push(`/dashboard/profile/${uid}`);

  const runConfirm = async () => {
    if (!confirm) return;
    setConfirming(true);
    await confirm.onConfirm();
    setConfirm(null);
    setConfirming(false);
  };

  const handleMessage = async (conn: Connection) => {
    if (!user || !profile) return;
    const names = {
      [user.uid]: profile.displayName || user.email || "You",
      [conn.otherUid]: conn.displayName,
    };
    const photos = { [user.uid]: profile.photoURL || "", [conn.otherUid]: conn.photoURL };
    const result = await createOrGetDirectConversation(user.uid, conn.otherUid, names, photos);
    router.push(`/dashboard/messages?conv=${result.id}`);
  };

  const handleMessageUser = async (targetUid: string, targetName: string, targetPhoto: string) => {
    if (!user || !profile) return;
    const names = {
      [user.uid]: profile.displayName || user.email || "You",
      [targetUid]: targetName,
    };
    const photos = { [user.uid]: profile.photoURL || "", [targetUid]: targetPhoto };
    const result = await createOrGetDirectConversation(user.uid, targetUid, names, photos);
    router.push(`/dashboard/messages?conv=${result.id}`);
  };

  const handleDisconnect = (conn: Connection) =>
    setConfirm({
      label: "Disconnect",
      description: `Remove ${conn.displayName} from your connections?`,
      onConfirm: () => disconnect(user!.uid, conn.otherUid),
    });

  const handleBlock = (otherUid: string, name: string) =>
    setConfirm({
      label: "Block user",
      description: `Block ${name}? They won't be able to message you and your connection will be removed.`,
      onConfirm: () => blockUser(user!.uid, otherUid),
    });

  const handleUnblock = (targetUid: string, name: string) =>
    setConfirm({
      label: "Unblock",
      description: `Unblock ${name}?`,
      onConfirm: async () => {
        await unblockUser(user!.uid, targetUid);
        setBlocks((prev) => prev.filter((b) => b.blockedUid !== targetUid));
      },
    });

  const handleConnect = async (candidate: DiscoverCandidate) => {
    if (!user || !profile) return;
    try {
      const fresh = await getUserProfile(candidate.uid);
      const targetName = fresh?.displayName || candidate.name;
      const targetPhoto = fresh?.photoURL || candidate.photo;
      const targetRole = fresh?.role || candidate.role || "Delegate";
      await connectManually(
        user.uid, candidate.uid,
        profile.displayName || user.email || "User", profile.photoURL || "", (profile as any).role || "Delegate",
        targetName, targetPhoto, targetRole
      );
    } catch {
      // silently handle "Cannot connect" (blocked)
    }
  };

  const activeConnections = connections.filter((c) => c.status === "active");

  const Avatar = ({ name, photo, size = "md" }: { name: string; photo?: string; size?: "sm" | "md" | "lg" }) => {
    const cls = size === "sm" ? "w-8 h-8 text-xs" : size === "lg" ? "w-16 h-16 text-xl" : "w-10 h-10 text-sm";
    return (
      <UIAvatar className={`${cls} shrink-0`}>
        <UIAvatarImage src={photo || ""} alt={name} className="object-cover" />
        <UIAvatarFallback className="bg-primary/10 text-primary font-bold">
          {name?.[0]?.toUpperCase() || "?"}
        </UIAvatarFallback>
      </UIAvatar>
    );
  };

  type CardAction = { icon: React.ElementType; label: string; onClick: () => void; danger?: boolean };

  const IconBtn = ({ icon: Icon, label, onClick, danger }: CardAction) => (
    <Tooltip>
      <TooltipTrigger
        render={
          <motion.button
            type="button"
            whileHover={{ scale: 1.14 }}
            whileTap={{ scale: 0.9 }}
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center border transition-colors",
              danger
                ? "border-destructive/25 text-destructive hover:bg-destructive hover:text-white hover:border-destructive"
                : "border-border/60 text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary"
            )}
          />
        }
      >
        <Icon className="w-4 h-4" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );

  // Person card. Click body → open full profile. Icons always visible, animate on hover.
  const PersonCard = ({
    uid, name, photo, subtitle, actions,
  }: {
    uid: string; name: string; photo: string; role: string;
    subtitle?: React.ReactNode; actions: CardAction[];
  }) => (
    <motion.div
      variants={cardV}
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      onClick={() => openProfile(uid)}
      className="group relative glass-card rounded-2xl border border-border/50 cursor-pointer overflow-hidden"
    >
      {/* soft depth accent */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-20 bg-secondary" />
      <div className="relative px-4 pt-6 pb-4 flex flex-col items-center text-center">
        <div className="rounded-full p-[2px] bg-border transition-colors group-hover:bg-foreground">
          <div className="rounded-full ring-2 ring-card">
            <Avatar name={name} photo={photo} size="lg" />
          </div>
        </div>
        <p className="font-semibold text-sm mt-3 leading-tight line-clamp-1 w-full">{name}</p>
        {subtitle && <div className="mt-1 text-xs text-muted-foreground line-clamp-1 w-full">{subtitle}</div>}
        <div className="mt-3 flex items-center justify-center gap-2">
          {actions.map((a) => <IconBtn key={a.label} {...a} />)}
        </div>
      </div>
    </motion.div>
  );

  return (
    <TooltipProvider delay={200}>
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="text-3xl font-bold tracking-tight">Network</h1>
        <p className="text-muted-foreground mt-1">Your connections from conferences and manual follows.</p>
        {!loading && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <StatChip icon={UserCheck} label={`${activeConnections.length} connection${activeConnections.length === 1 ? "" : "s"}`} />
            <StatChip icon={UserPlus} label={`${discoverUsers.length} to discover`} />
          </div>
        )}
      </motion.div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}
        </div>
      ) : (
        <Tabs defaultValue="discover">
          <TabsList className="mb-5">
            <TabsTrigger value="discover" className="gap-1.5">
              <UserPlus className="w-3.5 h-3.5" /> Discover
            </TabsTrigger>
            <TabsTrigger value="connections" className="gap-1.5">
              <UserCheck className="w-3.5 h-3.5" /> Connections ({activeConnections.length})
            </TabsTrigger>
            <TabsTrigger value="blocked" className="gap-1.5">
              <Ban className="w-3.5 h-3.5" /> Blocked ({blocks.length})
            </TabsTrigger>
          </TabsList>

          {/* Discover */}
          <TabsContent value="discover">
            {discoverUsers.length === 0 ? (
              <EmptyState
                icon={UserPlus}
                title="No suggestions yet"
                desc="Participate in more conferences to discover delegates you may know."
                action={
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => router.push("/dashboard/conferences?tab=browse")}>
                    <Sparkles className="w-3.5 h-3.5" /> Browse events
                  </Button>
                }
              />
            ) : (
              <>
                <h2 className="text-sm font-semibold text-muted-foreground mb-3 px-1">People You May Know</h2>
                <motion.div
                  variants={gridV}
                  initial="hidden"
                  animate="show"
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                >
                  {discoverUsers.map((u) => (
                    <PersonCard
                      key={u.uid}
                      uid={u.uid} name={u.name} photo={u.photo} role={u.role}
                      actions={[
                        { icon: UserPlus, label: "Connect", onClick: () => handleConnect(u) },
                        { icon: MessageSquare, label: "Message", onClick: () => handleMessageUser(u.uid, u.name, u.photo) },
                        { icon: ExternalLink, label: "Visit profile", onClick: () => router.push(`/dashboard/profile/${u.uid}`) },
                      ]}
                    />
                  ))}
                </motion.div>
              </>
            )}
          </TabsContent>

          {/* Connections */}
          <TabsContent value="connections">
            {activeConnections.length === 0 ? (
              <EmptyState
                icon={Users2}
                title="No connections yet"
                desc="Head to Discover to find and connect with fellow delegates."
              />
            ) : (
              <div className="space-y-6">
                {["auto", "manual"].map((src) => {
                  const group = activeConnections.filter((c) => c.source === src);
                  if (!group.length) return null;
                  return (
                    <div key={src}>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1 pb-3">
                        {src === "auto" ? "From Conferences" : "Manually Connected"}
                      </p>
                      <motion.div
                        variants={gridV}
                        initial="hidden"
                        animate="show"
                        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                      >
                        {group.map((conn) => (
                          <PersonCard
                            key={conn.otherUid}
                            uid={conn.otherUid} name={conn.displayName} photo={conn.photoURL || ""} role={conn.role}
                            subtitle={conn.source === "auto" && conn.sourceEventId ? "Met via conference" : undefined}
                            actions={[
                              { icon: MessageSquare, label: "Message", onClick: () => handleMessage(conn) },
                              { icon: ExternalLink, label: "Visit profile", onClick: () => router.push(`/dashboard/profile/${conn.otherUid}`) },
                              { icon: UserMinus, label: "Disconnect", danger: true, onClick: () => handleDisconnect(conn) },
                              { icon: Ban, label: "Block", danger: true, onClick: () => handleBlock(conn.otherUid, conn.displayName) },
                            ]}
                          />
                        ))}
                      </motion.div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Blocked */}
          <TabsContent value="blocked">
            {blocks.length === 0 ? (
              <EmptyState icon={Ban} title="No blocked users" desc="People you block will appear here. You can unblock them anytime." />
            ) : (
              <motion.div variants={gridV} initial="hidden" animate="show" className="space-y-2">
                {blocks.map((b) => (
                  <motion.div
                    key={b.blockedUid}
                    variants={cardV}
                    className="flex items-center justify-between p-3 rounded-xl glass-card border border-border/40"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                        <Ban className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{b.blockedUid}</p>
                        {b.blockedAt?.toDate && (
                          <p className="text-xs text-muted-foreground">
                            Blocked {formatDistanceToNow(b.blockedAt.toDate(), { addSuffix: true })}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleUnblock(b.blockedUid, b.blockedUid)}>
                      Unblock
                    </Button>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Confirm dialog */}
      <Dialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm?.label}</DialogTitle>
            <DialogDescription>{confirm?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={runConfirm} disabled={confirming}>
              {confirming ? "Working..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}
