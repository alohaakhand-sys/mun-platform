"use client";

import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { getUserConversations, createOrGetDirectConversation, createGroupConversation, ConversationData } from "@/lib/services/messageService";
import { userLabel, getAllUsers, UserProfile } from "@/lib/services/userService";
import { formatDistanceToNow } from "date-fns";
import { subscribeToMultiplePresence, PresenceData } from "@/lib/services/presenceService";

interface ChatSidebarProps {
  uid: string;
  userName: string;
  userPhoto?: string;
  selectedId: string | null;
  onSelect: (id: string, name: string, tempConvData?: any) => void;
}

export function ChatSidebar({ uid, userName, userPhoto, selectedId, onSelect }: ChatSidebarProps) {
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNewMsg, setShowNewMsg] = useState(false);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [starting, setStarting] = useState<string | null>(null);
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceData>>({});
  
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  useEffect(() => {
    let presenceKey = "";
    let unsubPresence = () => {};
    const unsub = getUserConversations(
      uid,
      (data) => {
        setConversations(data);
        setLoading(false);

        const allUids = new Set<string>();
        data.forEach((c) => {
          if (c.type === "direct") {
            const otherId = c.participants.find((p) => p !== uid);
            if (otherId) allUids.add(otherId);
          }
        });
        // One presence subscription per partner set: drop the previous one on each snapshot.
        const key = Array.from(allUids).sort().join(",");
        if (key !== presenceKey) {
          presenceKey = key;
          unsubPresence();
          unsubPresence = subscribeToMultiplePresence(Array.from(allUids), (map) => {
            setPresenceMap((prev) => ({ ...prev, ...map }));
          });
        }
      },
      () => setLoading(false),
    );
    return () => { unsub(); unsubPresence(); };
  }, [uid]);

  async function openNewMessage() {
    setShowNewMsg(true);
    if (allUsers.length === 0) {
      const users = await getAllUsers();
      setAllUsers(users.filter(u => u.uid !== uid));
    }
  }

  async function startConversation(otherUser: UserProfile) {
    setStarting(otherUser.uid);
    const names: Record<string, string> = {
      [uid]: userName || "Me",
      [otherUser.uid]: userLabel(otherUser) || "Unknown User",
    };
    const photos: Record<string, string> = {};
    if (userPhoto) photos[uid] = userPhoto;
    if (otherUser.photoURL) photos[otherUser.uid] = otherUser.photoURL;
    const result = await createOrGetDirectConversation(uid, otherUser.uid, names, photos);
    const convName = userLabel(otherUser) || "Unknown User";
    setStarting(null);
    setShowNewMsg(false);
    onSelect(result.id, convName, result.isNew ? result.data : undefined);
  }

  function getDisplayName(conv: ConversationData): string {
    if (conv.type === "group") return conv.groupName || "Group";
    const otherId = conv.participants.find(p => p !== uid);
    return otherId ? (conv.participantNames[otherId] || "User") : "Unknown";
  }

  function getDisplayPhoto(conv: ConversationData): string {
    if (conv.type === "group") return conv.groupPhotoUrl || "";
    const otherId = conv.participants.find(p => p !== uid);
    return otherId ? (conv.participantPhotos?.[otherId] || "") : "";
  }

  function getInitials(name: string) {
    return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  }

  const filtered = conversations.filter(c => {
    // Hide if user is the blocker
    if (c.blockedBy?.includes(uid)) return false;
    return getDisplayName(c).toLowerCase().includes(search.toLowerCase());
  });

  async function handleCreateGroup() {
    if (!groupName.trim() || selectedUsers.length === 0) return;
    setStarting("group");
    try {
      if (allUsers.length === 0) {
        const users = await getAllUsers();
        setAllUsers(users.filter(u => u.uid !== uid));
      }
      // re-fetch or use existing
      const fullUsers = allUsers.length > 0 ? allUsers : await getAllUsers();
      const selectedProfiles = fullUsers.filter(u => selectedUsers.includes(u.uid));
      const names = { [uid]: "Me" };
      const photos = { [uid]: "" };
      selectedProfiles.forEach(p => {
        names[p.uid] = p.displayName || "User";
        photos[p.uid] = p.photoURL || "";
      });
      const convId = await createGroupConversation(uid, groupName.trim(), [uid, ...selectedUsers], names, photos);
      setIsGroupDialogOpen(false);
      setGroupName("");
      setSelectedUsers([]);
      // We don't necessarily need to onSelect right away, or we can fetch the newly created data
      onSelect(convId, groupName.trim());
    } catch (err) {
      console.error(err);
    }
    setStarting(null);
  }

  return (
    <div className="flex flex-col h-full w-full max-w-sm border-r border-border/40 bg-background">
      <div className="p-4 border-b border-border/40">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold tracking-tight">Messages</h2>
          <div className="flex gap-2">
            <Button size="icon" variant="ghost" onClick={openNewMessage} title="New message">
              <Plus className="w-5 h-5" />
            </Button>
            <Button size="icon" variant="ghost" onClick={async () => {
              setIsGroupDialogOpen(true);
              if (allUsers.length === 0) {
                const users = await getAllUsers();
                setAllUsers(users.filter(u => u.uid !== uid));
              }
            }} title="New group">
              <Users className="w-5 h-5" />
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-secondary border-border focus-visible:ring-primary/20"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-4 border-b border-border/20">
              <Skeleton className="w-12 h-12 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">
            {conversations.length === 0 ? "No conversations yet. Start one!" : "No matches."}
          </div>
        ) : (
          filtered.map(conv => {
            const name = getDisplayName(conv);
            const photo = getDisplayPhoto(conv);
            const unread = conv.unreadCount?.[uid] || 0;
            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id, name)}
                className={cn(
                  "w-full flex items-start gap-3 p-4 text-left transition-colors hover:bg-secondary border-b border-border/20",
                  selectedId === conv.id
                    ? "bg-secondary border-l-4 border-l-primary"
                    : "border-l-4 border-l-transparent"
                )}
              >
                <div className="relative shrink-0">
                  <Avatar className="w-12 h-12 border border-border/50">
                    {photo && <AvatarImage src={photo} alt={name} />}
                    <AvatarFallback className={conv.type === "group" ? "bg-primary/20 text-primary" : "bg-primary/20 text-primary"}>
                      {getInitials(name)}
                    </AvatarFallback>
                  </Avatar>
                  {conv.type === "direct" && presenceMap[conv.participants.find(p => p !== uid) || ""]?.state === "online" && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-background rounded-full" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-1">
                    <h3 className="font-semibold text-sm truncate pr-2">{name}</h3>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {conv.updatedAt ? formatDistanceToNow(conv.updatedAt.toDate(), { addSuffix: false }) : ""}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-muted-foreground truncate pr-2">{conv.lastMessage || "No messages yet"}</p>
                    {unread > 0 && (
                      <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                        {unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* New Message Dialog */}
      <Dialog open={showNewMsg} onOpenChange={setShowNewMsg}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {allUsers
                .filter(u => (userLabel(u) || "").toLowerCase().includes(userSearch.toLowerCase()))
                .map(u => (
                  <button
                    key={u.uid}
                    onClick={() => startConversation(u)}
                    disabled={starting === u.uid}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-secondary transition-colors text-left"
                  >
                    <Avatar className="w-9 h-9 shrink-0">
                      {u.photoURL && <AvatarImage src={u.photoURL} alt={u.displayName || ""} />}
                      <AvatarFallback className="bg-primary/20 text-primary text-sm">
                        {(userLabel(u) || "?").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{userLabel(u)}</p>
                      <p className="text-xs text-muted-foreground">{u.role}</p>
                    </div>
                    {starting === u.uid && <span className="ml-auto text-xs text-muted-foreground">Starting...</span>}
                  </button>
                ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Group Dialog */}
      <Dialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input placeholder="Group Name" value={groupName} onChange={e => setGroupName(e.target.value)} />
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="max-h-[250px] overflow-y-auto space-y-1 border border-border/50 rounded-md p-2">
              {allUsers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Loading users...</p>
              ) : (
                allUsers
                  .filter(u => u.uid !== uid)
                  .filter(u => (userLabel(u) || "").toLowerCase().includes(userSearch.toLowerCase()))
                  .map(u => {
                    const label = userLabel(u) || "Unnamed User";
                    return (
                      <label key={u.uid} className="flex items-center gap-3 p-2 hover:bg-secondary rounded-md cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedUsers.includes(u.uid)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedUsers([...selectedUsers, u.uid]);
                            else setSelectedUsers(selectedUsers.filter(id => id !== u.uid));
                          }}
                          className="rounded border-border/50"
                        />
                        <Avatar className="w-7 h-7">
                          {u.photoURL && <AvatarImage src={u.photoURL} alt={label} />}
                          <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                            {label.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{label}</p>
                          {u.role && <p className="text-[10px] text-muted-foreground truncate">{u.role}</p>}
                        </div>
                      </label>
                    );
                  })
              )}
            </div>
            {selectedUsers.length > 0 && (
              <p className="text-xs text-muted-foreground">{selectedUsers.length} selected</p>
            )}
            <Button onClick={handleCreateGroup} disabled={starting === "group" || !groupName || selectedUsers.length === 0} className="w-full">
              {starting === "group" ? "Creating..." : "Create Group"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
