/**
 * One publish path for a committee study guide.
 *
 * There are two authoring surfaces — the committee hub's Study Guide tab and the
 * standalone editor in the Documents hub — and they had drifted: the hub emailed the
 * committee's delegates and dropped a room alert, the Documents one only dropped the
 * alert. Same button, same wording, different consequences depending on which screen the
 * chair happened to be on. Both call this now.
 *
 * Notifications are best-effort and deliberately not awaited into the result: a failed
 * email must never make a successfully saved guide report failure.
 */
import { saveStudyGuide, StudyGuide } from "./optionalModulesService";
import { notifyDelegatesStudyGuide } from "./notifyService";
import { sendRoomNotification } from "./roomNotificationService";
import { getEventById } from "./eventService";

export async function publishStudyGuide(params: {
  eventId: string;
  committee: string;
  data: StudyGuide;
  /** Drives "updated" vs "published" wording in both the email and the room alert. */
  isUpdate: boolean;
  chairUid: string;
  chairName?: string;
  /** Skips a fetch when the caller already holds it (the committee hub does). */
  eventTitle?: string;
}): Promise<{ success: boolean; error?: { message?: string; code?: string } }> {
  const { eventId, committee, data, isUpdate, chairUid, chairName } = params;

  const res = await saveStudyGuide(eventId, committee, data);
  if (!res.success) return res;

  // Fan-out only after the write lands, so a delegate is never told to read a guide
  // that failed to save.
  (async () => {
    const eventTitle = params.eventTitle ?? (await getEventById(eventId))?.title;

    // The server works out the committee's delegates and checks I run it.
    notifyDelegatesStudyGuide({
      eventId,
      committee,
      eventTitle,
      chairName: chairName || "Your chair",
      isUpdate,
    });

    // In-app alert too, for delegates who never open the email. Visible for a week.
    sendRoomNotification(eventId, committee, {
      message: `📚 Study guide ${isUpdate ? "updated" : "published"} for ${committee} — open Documents → Study Guide.`,
      type: "info",
      expiryMinutes: 7 * 24 * 60,
      createdBy: chairUid,
    });
  })().catch((err) => console.error("publishStudyGuide notifications:", err));

  return { success: true };
}
