"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { ChatSidebar } from "@/components/dashboard/ChatSidebar";
import { ChatWindow } from "@/components/dashboard/ChatWindow";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";

export default function MessagesPage() {
  const { user, profile } = useAuth();
  const searchParams = useSearchParams();
  const convFromUrl = searchParams.get("conv");

  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [selectedChatName, setSelectedChatName] = useState<string>("");
  const [tempConvData, setTempConvData] = useState<any>(undefined);

  useEffect(() => {
    if (!convFromUrl || !user) return;
    if (selectedChatId === convFromUrl) return;
    setSelectedChatId(convFromUrl);

    (async () => {
      const snap = await getDoc(doc(db, "conversations", convFromUrl));
      if (snap.exists()) {
        const data: any = snap.data();
        if (data.type === "group") {
          setSelectedChatName(data.groupName || "Group");
        } else {
          const otherId = (data.participants || []).find((p: string) => p !== user.uid);
          setSelectedChatName((otherId && data.participantNames?.[otherId]) || "User");
        }
        setTempConvData(undefined);
      } else {
        // Conversation doc not yet created — derive name from direct convId pattern (uid1_uid2)
        const ids = convFromUrl.split("_");
        const otherUid = ids.length === 2 ? (ids[0] === user.uid ? ids[1] : ids[0]) : null;
        if (otherUid) {
          const userSnap = await getDoc(doc(db, "users", otherUid));
          const otherName = userSnap.exists() ? (userSnap.data().displayName || "User") : "User";
          const otherPhoto = userSnap.exists() ? (userSnap.data().photoURL || "") : "";
          setSelectedChatName(otherName);
          setTempConvData({
            participants: [user.uid, otherUid],
            participantNames: {
              [user.uid]: profile?.displayName || user.email || "You",
              [otherUid]: otherName,
            },
            participantPhotos: {
              [user.uid]: profile?.photoURL || "",
              [otherUid]: otherPhoto,
            },
            type: "direct",
            lastMessage: "",
            lastMessageSenderId: "",
            unreadCount: { [user.uid]: 0, [otherUid]: 0 },
          });
        }
      }
    })();
  }, [convFromUrl, user, profile, selectedChatId]);

  if (!user) return null;

  const userName = profile?.displayName || user.displayName || user.email || "Me";
  const userPhoto = profile?.photoURL || user.photoURL || undefined;

  function handleSelect(id: string, name: string, temp?: any) {
    setSelectedChatId(id);
    setSelectedChatName(name);
    setTempConvData(temp);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="h-[calc(100vh-10rem)] w-full max-w-6xl mx-auto glass-card rounded-3xl overflow-hidden flex border border-border/50 shadow-sm"
    >
      <div className="hidden md:flex h-full w-80 shrink-0">
        <ChatSidebar
          uid={user.uid}
          userName={userName}
          userPhoto={userPhoto}
          selectedId={selectedChatId}
          onSelect={handleSelect}
        />
      </div>

      <div className="flex-1 h-full min-w-0">
        <ChatWindow
          conversationId={selectedChatId}
          conversationName={selectedChatName}
          uid={user.uid}
          userName={userName}
          initialConvData={tempConvData}
        />
      </div>
    </motion.div>
  );
}
