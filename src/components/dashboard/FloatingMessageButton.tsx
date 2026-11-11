"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  getUserConversations,
  getConversationMessagesRealtime,
  sendMessage,
  markConversationRead,
  createOrGetDirectConversation,
  ConversationData,
  MessageData
} from "@/lib/services/messageService";
import { MessageSquare, X, ArrowLeft, Send, Search, Plus, Check, CheckCheck, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { subscribeToPresence, subscribeToMultiplePresence, PresenceData } from "@/lib/services/presenceService";
import { userLabel, getAllUsers, UserProfile } from "@/lib/services/userService";
import { formatDistanceToNow, format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

export function FloatingMessageButton({
  open,
  onOpenChange,
  openWith,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  openWith?: { uid: string; name: string; photo: string; nonce: number } | null;
} = {}) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  // Overlay state — controlled (header-driven in the delegate portal) or internal.
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isControlled ? !!open : internalOpen;
  const setIsOpen = (v: boolean) => {
    if (isControlled) onOpenChange?.(v);
    else setInternalOpen(v);
  };
  const [chatState, setChatState] = useState<'list' | 'chat' | 'new-chat'>('list');
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [selectedChatName, setSelectedChatName] = useState<string>("");
  const [tempConvData, setTempConvData] = useState<Partial<ConversationData> | undefined>(undefined);

  // Data state
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceData>>({});
  
  // Active chat state
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [presence, setPresence] = useState<PresenceData | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user?.uid) return;

    let presenceKey = "";
    let unsubPresence = () => {};
    const unsub = getUserConversations(
      user.uid,
      (convs: ConversationData[]) => {
        setConversations(convs);
        const totalUnread = convs.reduce((sum, conv) => {
          return sum + (conv.unreadCount?.[user.uid] || 0);
        }, 0);
        setUnreadCount(totalUnread);

        // Subscribe to presence for all direct message partners
        const otherUids = new Set<string>();
        convs.forEach((c) => {
          if (c.type === "direct") {
            const otherId = c.participants.find((p) => p !== user.uid);
            if (otherId) otherUids.add(otherId);
          }
        });
        // One presence subscription per partner set: drop the previous one on each snapshot.
        const key = Array.from(otherUids).sort().join(",");
        if (key !== presenceKey) {
          presenceKey = key;
          unsubPresence();
          unsubPresence = subscribeToMultiplePresence(Array.from(otherUids), (map) => {
            setPresenceMap((prev) => ({ ...prev, ...map }));
          });
        }
      },
      () => console.error("Error subscribing to unread counts")
    );

    return () => { unsub(); unsubPresence(); };
  }, [user?.uid]);

  useEffect(() => {
    if (!selectedChatId || !user?.uid) {
      const timer = setTimeout(() => {
        setMessages([]);
        setPresence(null);
      }, 0);
      return () => clearTimeout(timer);
    }

    // Extract other UID for direct chat presence
    const uids = selectedChatId.split("_");
    let unsubPresence = () => {};
    if (uids.length === 2 && (!tempConvData?.type || tempConvData?.type === "direct")) {
      const otherUid = uids[0] === user.uid ? uids[1] : uids[0];
      unsubPresence = subscribeToPresence(otherUid, data => setPresence(data));
    }

    markConversationRead(selectedChatId, user.uid).catch(() => {});
    const unsub = getConversationMessagesRealtime(selectedChatId, 50, (msgs) => {
      setMessages(msgs);
    });

    return () => {
      unsub();
      unsubPresence();
    };
  }, [selectedChatId, user?.uid, tempConvData]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, chatState]);

  // When the delegate portal requests a chat with a specific member, open (or create)
  // that direct conversation and jump straight into it. Keyed on a changing nonce so
  // clicking the same person again reopens reliably.
  useEffect(() => {
    if (!openWith || !user?.uid) return;
    let cancelled = false;
    (async () => {
      const names = {
        [user.uid]: userLabel(user) || "Me",
        [openWith.uid]: openWith.name,
      };
      const photos: Record<string, string> = {};
      if (user.photoURL) photos[user.uid] = user.photoURL;
      if (openWith.photo) photos[openWith.uid] = openWith.photo;
      const result = await createOrGetDirectConversation(user.uid, openWith.uid, names, photos);
      if (cancelled) return;
      setSelectedChatId(result.id);
      setSelectedChatName(openWith.name);
      setTempConvData(result.isNew ? result.data : undefined);
      setChatState("chat");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openWith?.nonce]);

  // Hide button on the messages page itself
  if (pathname === "/dashboard/messages" || !user) {
    return null;
  }

  async function handleSendMessage() {
    if (!selectedChatId || !inputText.trim() || !user || sending) return;
    const text = inputText.trim();
    setInputText("");
    setSending(true);

    const userName = userLabel(user) || "User";

    // Optimistic UI update
    const tempMsg: MessageData = {
      id: "temp_" + Date.now(),
      senderId: user.uid,
      senderName: userName,
      text,
      readBy: [],
      status: "sending"
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      await sendMessage(selectedChatId, user.uid, userName, text, tempConvData);
    } catch (err) {
      console.error("Failed to send overlay message:", err);
    }
    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  async function handleOpenNewChat() {
    setChatState('new-chat');
    if (allUsers.length === 0) {
      const users = await getAllUsers();
      setAllUsers(users.filter(u => u.uid !== user?.uid));
    }
  }

  async function handleSelectUserForChat(otherUser: UserProfile) {
    if (!user) return;
    setStarting(otherUser.uid);
    const names = {
      [user.uid]: userLabel(user) || "Me",
      [otherUser.uid]: userLabel(otherUser) || "User",
    };
    const photos: Record<string, string> = {};
    if (user.photoURL) photos[user.uid] = user.photoURL;
    if (otherUser.photoURL) photos[otherUser.uid] = otherUser.photoURL;

    const result = await createOrGetDirectConversation(user.uid, otherUser.uid, names, photos);
    setStarting(null);
    setSelectedChatId(result.id);
    setSelectedChatName(userLabel(otherUser) || "User");
    setTempConvData(result.isNew ? result.data : undefined);
    setChatState('chat');
  }

  function getInitials(name: string) {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  }

  function formatTime(msg: MessageData): string {
    if (!msg.timestamp) return "";
    try {
      return format(msg.timestamp.toDate(), "h:mm a");
    } catch {
      return "";
    }
  }

  function getDisplayName(conv: Partial<ConversationData>): string {
    if (conv.type === "group") return conv.groupName || "Group";
    const otherId = conv.participants?.find(p => p !== user?.uid);
    return otherId ? (conv.participantNames?.[otherId] || "User") : "Unknown";
  }

  function getDisplayPhoto(conv: Partial<ConversationData>): string {
    if (conv.type === "group") return conv.groupPhotoUrl || "";
    const otherId = conv.participants?.find(p => p !== user?.uid);
    return otherId ? (conv.participantPhotos?.[otherId] || "") : "";
  }

  const filteredConversations = conversations.filter(c => {
    if (c.blockedBy?.includes(user?.uid || "")) return false;
    const name = getDisplayName(c);
    return (name || "").toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed bottom-24 right-6 z-50 w-96 h-[500px] max-w-[calc(100vw-2rem)] bg-card border border-border shadow-sm rounded-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            {chatState === 'list' && (
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-secondary shrink-0">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  <span className="font-semibold text-sm text-foreground">Messages</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="w-8 h-8 rounded-full" onClick={handleOpenNewChat} title="New Chat">
                    <Plus className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                  </Button>
                  <Button size="icon" variant="ghost" className="w-8 h-8 rounded-full" onClick={() => setIsOpen(false)}>
                    <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                  </Button>
                </div>
              </div>
            )}

            {chatState === 'chat' && (
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-secondary shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Button size="icon" variant="ghost" className="w-8 h-8 rounded-full" onClick={() => setChatState('list')}>
                    <ArrowLeft className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                  </Button>
                  <div className="relative shrink-0">
                    <Avatar className="w-8 h-8 border border-border/50">
                      {(() => {
                        const photo = selectedChatId
                          ? getDisplayPhoto(conversations.find(c => c.id === selectedChatId) || tempConvData || { participants: [], participantPhotos: {} })
                          : "";
                        return photo ? <AvatarImage src={photo} alt={selectedChatName} /> : null;
                      })()}
                      <AvatarFallback className="bg-primary/20 text-primary text-xs">
                        {getInitials(selectedChatName)}
                      </AvatarFallback>
                    </Avatar>
                    {presence?.state === "online" && (
                      <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 border border-background rounded-full" />
                    )}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-foreground truncate max-w-[150px]">{selectedChatName}</span>
                    <span className="text-[9px] text-muted-foreground leading-none mt-0.5">
                      {presence?.state === "online" ? "Active now" : "Offline"}
                    </span>
                  </div>
                </div>
                <Button size="icon" variant="ghost" className="w-8 h-8 rounded-full shrink-0" onClick={() => setIsOpen(false)}>
                  <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </Button>
              </div>
            )}

            {chatState === 'new-chat' && (
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-secondary shrink-0">
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="ghost" className="w-8 h-8 rounded-full" onClick={() => setChatState('list')}>
                    <ArrowLeft className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                  </Button>
                  <span className="font-semibold text-sm text-foreground">New Message</span>
                </div>
                <Button size="icon" variant="ghost" className="w-8 h-8 rounded-full" onClick={() => setIsOpen(false)}>
                  <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </Button>
              </div>
            )}

            {/* Body */}
            {chatState === 'list' && (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Search */}
                <div className="p-2 border-b border-border/20 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search chats..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-8 h-8 text-xs bg-secondary border-border/50 focus-visible:ring-primary/20"
                    />
                  </div>
                </div>
                {/* Conversations List */}
                <div className="flex-1 overflow-y-auto divide-y divide-border/10">
                  {filteredConversations.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                      No conversations found.
                    </div>
                  ) : (
                    filteredConversations.map(conv => {
                      const name = getDisplayName(conv);
                      const photo = getDisplayPhoto(conv);
                      const unread = conv.unreadCount?.[user.uid] || 0;
                      const otherId = conv.participants.find(p => p !== user.uid);
                      const isOnline = conv.type === "direct" && otherId && presenceMap[otherId]?.state === "online";
                      
                      return (
                        <button
                          key={conv.id}
                          onClick={() => {
                            setSelectedChatId(conv.id);
                            setSelectedChatName(name);
                            setTempConvData(undefined);
                            setChatState('chat');
                          }}
                          className="w-full flex items-center gap-3 p-3 hover:bg-secondary dark:hover:bg-slate-800/40 transition-colors text-left"
                        >
                          <div className="relative shrink-0">
                            <Avatar className="w-10 h-10 border border-border/30">
                              {photo && <AvatarImage src={photo} alt={name} />}
                              <AvatarFallback className="bg-primary/20 text-primary text-xs">
                                {getInitials(name)}
                              </AvatarFallback>
                            </Avatar>
                            {isOnline && (
                              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-background rounded-full" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-baseline mb-0.5">
                              <h4 className="font-semibold text-xs text-foreground truncate pr-2">{name}</h4>
                              <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                                {conv.updatedAt ? formatDistanceToNow(conv.updatedAt.toDate(), { addSuffix: false }) : ""}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <p className="text-[11px] text-muted-foreground truncate pr-2">{conv.lastMessage || "No messages"}</p>
                              {unread > 0 && (
                                <span className="bg-primary text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
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
              </div>
            )}

            {chatState === 'chat' && (
              <div className="flex-1 flex flex-col min-h-0 bg-secondary">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.length === 0 ? (
                    <div className="text-center text-xs text-muted-foreground py-4">
                      No messages yet. Say hello!
                    </div>
                  ) : (
                    messages.map((msg, index) => {
                      if (msg.systemMessage) {
                        return (
                          <div key={msg.id} className="text-center my-2">
                            <span className="text-[9px] text-muted-foreground bg-background px-2 py-0.5 rounded-full border border-border/20">
                              {msg.text}
                            </span>
                          </div>
                        );
                      }

                      const isMe = msg.senderId === user.uid;
                      const isLastOfMine = isMe && index === messages.findLastIndex(m => m.senderId === user.uid);

                      return (
                        <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                          <div className={`flex max-w-[85%] gap-2 ${isMe ? "flex-row-reverse" : "flex-row"} items-end`}>
                            {!isMe && (
                              <Avatar className="w-6 h-6 shrink-0 border border-border/30 mb-0.5">
                                {tempConvData?.participantPhotos?.[msg.senderId] && (
                                  <AvatarImage src={tempConvData.participantPhotos[msg.senderId]} alt={msg.senderName} />
                                )}
                                <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                                  {getInitials(msg.senderName || "?")}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <div className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                              <div className={`px-3 py-1.5 rounded-xl text-xs ${
                                isMe 
                                  ? "bg-primary text-primary-foreground rounded-br-sm shadow-sm" 
                                  : "bg-secondary text-secondary-foreground rounded-bl-sm border border-border/30"
                              }`}>
                                <p className="leading-tight break-words">{msg.text}</p>
                              </div>
                              <div className="flex items-center gap-1 mt-0.5 px-1">
                                <span className="text-[8px] text-muted-foreground">{formatTime(msg)}</span>
                                {isLastOfMine && msg.status === "sending" && <Clock className="w-2.5 h-2.5 text-muted-foreground/70" />}
                                {isLastOfMine && msg.status !== "sending" && (
                                  msg.readBy && msg.readBy.some(id => id !== user.uid)
                                    ? <CheckCheck className="w-2.5 h-2.5 text-blue-400" />
                                    : <Check className="w-2.5 h-2.5 text-muted-foreground/70" />
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
                {/* Input Area */}
                <div className="p-2 border-t border-border/40 bg-background shrink-0">
                  <div className="flex items-center gap-1 bg-secondary border border-border/40 rounded-xl p-1 focus-within:border-primary/50 transition-all">
                    <Input
                      placeholder="Type message..."
                      value={inputText}
                      onChange={e => setInputText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-2 h-7 text-xs shadow-none flex-1"
                    />
                    <Button
                      size="icon"
                      className="w-7 h-7 rounded-lg shrink-0"
                      onClick={handleSendMessage}
                      disabled={!inputText.trim() || sending}
                    >
                      <Send className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {chatState === 'new-chat' && (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Search */}
                <div className="p-2 border-b border-border/20 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search users..."
                      value={userSearchQuery}
                      onChange={e => setUserSearchQuery(e.target.value)}
                      className="pl-8 h-8 text-xs bg-secondary border-border/50 focus-visible:ring-primary/20"
                    />
                  </div>
                </div>
                {/* Users List */}
                <div className="flex-1 overflow-y-auto divide-y divide-border/10">
                  {allUsers
                    .filter(u => (userLabel(u) || "").toLowerCase().includes(userSearchQuery.toLowerCase()))
                    .map(u => (
                      <button
                        key={u.uid}
                        onClick={() => handleSelectUserForChat(u)}
                        disabled={starting === u.uid}
                        className="w-full flex items-center gap-3 p-3 hover:bg-secondary dark:hover:bg-slate-800/40 transition-colors text-left"
                      >
                        <Avatar className="w-8 h-8 shrink-0 border border-border/30">
                          {u.photoURL && <AvatarImage src={u.photoURL} alt={u.displayName || ""} />}
                          <AvatarFallback className="bg-primary/20 text-primary text-xs">
                            {(userLabel(u) || "?").charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{userLabel(u)}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">{u.role}</p>
                        </div>
                        {starting === u.uid && <span className="text-[10px] text-muted-foreground shrink-0">Connecting...</span>}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* In controlled mode (delegate portal) the header Messages icon is the trigger,
          so the floating bubble is suppressed to avoid a duplicate control. */}
      {!isControlled && (
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-sm hover:scale-110 active:scale-95 transition-all duration-300 group border border-primary/20"
        title="Open Messages"
      >
        {/* Dynamic pulse ring */}
        {unreadCount > 0 && (
          <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping opacity-75" />
        )}
        
        {isOpen ? (
          <X className="w-6 h-6 transition-transform group-hover:rotate-90 duration-250" />
        ) : (
          <MessageSquare className="w-6 h-6 transition-transform group-hover:rotate-12" />
        )}
        
        {unreadCount > 0 && (
          <Badge 
            className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground hover:bg-destructive font-bold text-xs px-2 py-0.5 min-w-[20px] h-[20px] flex items-center justify-center rounded-full border-2 border-background animate-bounce"
          >
            {unreadCount}
          </Badge>
        )}
      </button>
      )}
    </>
  );
}
