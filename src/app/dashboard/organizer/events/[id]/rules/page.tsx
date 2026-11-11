"use client";

import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { RulesGuideEditor } from "@/components/features/shared/RulesGuideEditor";

// Organizer authoring surface for the event-wide Rules & Regulations guide.
// Everyone in the event reads it from the Documents hub; writes are gated to
// organizer/co-organizer/admin by the settings/{docId} firestore rule.
export default function RulesRegulationsPage() {
  const params = useParams();
  const eventId = params?.id as string;
  const { user } = useAuth();

  return (
    <div className="container mx-auto py-10 max-w-4xl space-y-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-3xl font-bold tracking-tight">Rules & Regulations</h1>
        <p className="text-muted-foreground mt-1">
          Publish the conference rulebook — code of conduct, rules of procedure, awards and disciplinary policy.
          It&apos;s visible to every role: chairs, delegates and staff.
        </p>
      </motion.div>

      {eventId && user && <RulesGuideEditor eventId={eventId} editorUid={user.uid} />}
    </div>
  );
}
