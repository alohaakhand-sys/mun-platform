"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoreVertical, Send } from "lucide-react";
import { motion } from "framer-motion";
import { getConversationMessagesRealtime, sendMessage, markConversationRead, MessageData, ConversationData } from "@/lib/services/messageService";
import { format, formatDistanceToNow } from "date-fns";
import { Check, CheckCheck, Clock } from "lucide-react";
import { subscribeToPresence, PresenceData } from "@/lib/services/presenceService";

interface ChatWindowProps {
  conversationId: string | null;
  conversationName: string;
  uid: string;
  userName: string;
  initialConvData?: Partial<ConversationData>;
}

export function ChatWindow({ conversationId, conversationName, uid, userName, initialConvData }: ChatWindowProps) {
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  
  const [presence, setPresence] = useState<PresenceData | null>(null);
  const [convData, setConvData] = useState<Partial<ConversationData> | null>(null);

  const [limitCount, setLimitCount] = useState(50);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setPresence(null);
      setConvData(null);
      return;
    }

    // Extract otherUid if direct
    const uids = conversationId.split("_");
    let unsubPresence = () => {};
    if (uids.length === 2 && !initialConvData?.type || initialConvData?.type === "direct") {
      const otherUid = uids[0] === uid ? uids[1] : uids[0];
      unsubPresence = subscribeToPresence(otherUid, data => setPresence(data));
    } else {
      setPresence(null);
    }

    setConvData(initialConvData || null);
    const unsubConv = onSnapshot(doc(db, "conversations", conversationId), (snap) => {
      if (snap.exists()) setConvData(snap.data() as ConversationData);
    });

    markConversationRead(conversationId, uid).catch(() => {});
    const unsub = getConversationMessagesRealtime(conversationId, limitCount, msgs => {
      setMessages(msgs);
    });
    return () => {
      unsub();
      unsubPresence();
      unsubConv();
    };
  }, [conversationId, uid, limitCount, initialConvData]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    if (e.currentTarget.scrollTop === 0) {
      setLimitCount(prev => prev + 50);
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!conversationId || !inputText.trim() || sending) return;
    setSending(true);
    const text = inputText.trim();
    setInputText("");
    
    // Optimistic UI
    const tempMsg: MessageData = {
      id: "temp_" + Date.now(),
      senderId: uid,
      senderName: userName,
      text,
      readBy: [],
      status: "sending"
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      await sendMessage(conversationId, uid, userName, text, initialConvData);
    } catch (err) {
      console.error(err);
      // We could mark tempMsg as failed here
    }
    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
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

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center text-muted-foreground">
          <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
            <Send className="w-8 h-8 text-muted-foreground/50" />
          </div>
          <p className="text-lg font-medium">Select a conversation</p>
          <p className="text-sm">Choose a chat from the sidebar or start a new one</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-background relative">
      {/* Header */}
      <div className="h-16 border-b border-border/40 px-6 flex items-center justify-between bg-background shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="w-10 h-10 border border-border/50">
              {(() => {
                const otherUid = conversationId?.split("_").find(p => p !== uid);
                const headerPhoto = convData?.type === "group"
                  ? convData?.groupPhotoUrl
                  : (otherUid ? convData?.participantPhotos?.[otherUid] : "");
                return headerPhoto ? <AvatarImage src={headerPhoto} alt={conversationName} /> : null;
              })()}
              <AvatarFallback className="bg-primary/20 text-primary">
                {getInitials(conversationName)}
              </AvatarFallback>
            </Avatar>
            {presence?.state === "online" && (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-background rounded-full" />
            )}
          </div>
          <div>
            <h2 className="font-semibold text-foreground leading-tight">{conversationName}</h2>
            {presence && (
              <p className="text-[11px] text-muted-foreground">
                {presence.state === "online" ? (
                  <span className="text-green-500 font-medium">Online</span>
                ) : presence.lastChangedAt ? (
                  `Active ${formatDistanceToNow(presence.lastChangedAt.toDate(), { addSuffix: true })}`
                ) : "Offline"}
              </p>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <MoreVertical className="w-5 h-5" />
        </Button>
      </div>

      {/* Messages */}
      <div 
        className="flex-1 overflow-y-auto p-6 space-y-4"
        onScroll={handleScroll}
      >
        {messages.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">
            No messages yet. Say hello!
          </div>
        ) : (
          messages.map((msg, index) => {
            if (msg.systemMessage) {
              return (
                <div key={msg.id} className="text-center my-4">
                  <span className="text-xs text-muted-foreground bg-background px-3 py-1 rounded-full border border-border/30">
                    {msg.text}
                  </span>
                </div>
              );
            }

            const isMe = msg.senderId === uid;
            const isLastOfMine = isMe && index === messages.findLastIndex(m => m.senderId === uid);
            
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.05, 0.3) }}
                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
              >
                <div className={`flex max-w-[75%] ${isMe ? "flex-row-reverse" : "flex-row"} items-end gap-2`}>
                  {!isMe && (
                    <Avatar className="w-8 h-8 shrink-0 mb-1 border border-border/50">
                      {convData?.participantPhotos?.[msg.senderId] && (
                        <AvatarImage src={convData.participantPhotos[msg.senderId]} alt={msg.senderName || ""} />
                      )}
                      <AvatarFallback className="bg-primary/20 text-primary text-xs">
                        {getInitials(msg.senderName || "?")}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                    {!isMe && (
                      <span className="text-xs text-muted-foreground mb-1 mx-1">{msg.senderName}</span>
                    )}
                    <div className={`px-4 py-2.5 rounded-2xl ${
                      isMe
                        ? "bg-primary text-primary-foreground rounded-br-sm shadow-sm"
                        : "bg-secondary text-secondary-foreground rounded-bl-sm border border-border/50"
                    }`}>
                      <p className="text-sm leading-relaxed">{msg.text}</p>
                    </div>
                    <div className="flex items-center gap-1 mt-1 mx-1">
                      <span className="text-[10px] text-muted-foreground">{formatTime(msg)}</span>
                      {isLastOfMine && msg.status === "sending" && <Clock className="w-3 h-3 text-muted-foreground/70" />}
                      {isLastOfMine && msg.status !== "sending" && (
                        msg.readBy && msg.readBy.some(id => id !== uid) 
                          ? <CheckCheck className="w-3 h-3 text-blue-400" />
                          : <Check className="w-3 h-3 text-muted-foreground/70" />
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border/40 bg-background shrink-0">
        <div className="flex items-end gap-2 bg-secondary border border-border/50 rounded-2xl p-2 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50 transition-all">
          <Input
            placeholder="Type your message..."
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-2 shadow-none"
          />
          <Button
            size="icon"
            className="shrink-0 rounded-xl shadow-sm"
            onClick={handleSend}
            disabled={!inputText.trim() || sending}
          >
            <Send className="w-4 h-4 ml-0.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
