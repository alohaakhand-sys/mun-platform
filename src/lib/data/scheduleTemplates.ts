// Premade Schedule Builder templates.
// Each session carries a day offset (0-based, from the event start date) plus clock
// start/end times. When a template is applied the times are anchored to the event's
// real start date (falling back to blank times if the event has no valid date).

import { ScheduleItem } from "@/lib/services/eventService";

export interface ScheduleTemplateSession {
  title: string;
  type: ScheduleItem["type"];
  location: string;
  /** Day offset from the event start date (0 = first day). */
  day: number;
  /** Clock start time, "HH:MM". */
  start: string;
  /** Clock end time, "HH:MM". */
  end: string;
}

export interface ScheduleTemplate {
  id: string;
  name: string;
  description: string;
  /** Number of days the template spans (for display). */
  days: number;
  sessions: ScheduleTemplateSession[];
}

/** Helper: build a template session row. */
function s(
  title: string,
  type: ScheduleItem["type"],
  location: string,
  day: number,
  start: string,
  end: string,
): ScheduleTemplateSession {
  return { title, type, location, day, start, end };
}

export const SCHEDULE_TEMPLATES: ScheduleTemplate[] = [
  {
    id: "standard-2day",
    name: "Standard 2-Day MUN",
    description: "Opening, four committee sessions across two days, a social night, and closing.",
    days: 2,
    sessions: [
      s("Registration & Check-in", "main", "Lobby", 0, "08:00", "09:00"),
      s("Opening Ceremony", "main", "Main Hall", 0, "09:00", "10:00"),
      s("Committee Session I", "session", "Committee Rooms", 0, "10:15", "12:30"),
      s("Lunch Break", "break", "Dining Hall", 0, "12:30", "13:30"),
      s("Committee Session II", "session", "Committee Rooms", 0, "13:30", "16:30"),
      s("Social Night", "social", "TBD", 0, "19:00", "22:00"),
      s("Committee Session III", "session", "Committee Rooms", 1, "09:30", "12:30"),
      s("Lunch Break", "break", "Dining Hall", 1, "12:30", "13:30"),
      s("Committee Session IV", "session", "Committee Rooms", 1, "13:30", "16:00"),
      s("Closing Ceremony & Awards", "main", "Main Hall", 1, "16:30", "18:00"),
    ],
  },
  {
    id: "single-day",
    name: "1-Day Conference",
    description: "A compact single-day itinerary: opening, two sessions, lunch, and awards.",
    days: 1,
    sessions: [
      s("Registration & Check-in", "main", "Lobby", 0, "08:00", "09:00"),
      s("Opening Ceremony", "main", "Main Hall", 0, "09:00", "10:00"),
      s("Committee Session I", "session", "Committee Rooms", 0, "10:15", "12:30"),
      s("Lunch Break", "break", "Dining Hall", 0, "12:30", "13:30"),
      s("Committee Session II", "session", "Committee Rooms", 0, "13:30", "16:00"),
      s("Awards & Closing", "main", "Main Hall", 0, "16:15", "17:30"),
    ],
  },
  {
    id: "opening-day",
    name: "Opening Day",
    description: "Just the day-one arrival block — registration, opening, keynote, and intros.",
    days: 1,
    sessions: [
      s("Registration & Check-in", "main", "Lobby", 0, "08:00", "09:00"),
      s("Opening Ceremony", "main", "Main Hall", 0, "09:00", "10:00"),
      s("Keynote Address", "main", "Main Hall", 0, "10:00", "11:00"),
      s("Committee Introductions", "session", "Committee Rooms", 0, "11:15", "13:00"),
    ],
  },
];

/**
 * Resolve the event's start date as a "YYYY-MM-DD" string, or null if unknown.
 * Mirrors CreateEventDialog: prefer decomposed `startDate`, else parse canonical `date`.
 */
export function resolveEventStartDate(event: { startDate?: string; date?: string } | null | undefined): string | null {
  if (!event) return null;
  if (event.startDate && /^\d{4}-\d{2}-\d{2}/.test(event.startDate)) return event.startDate.slice(0, 10);
  if (event.date) {
    const dt = new Date(event.date);
    if (!isNaN(dt.getTime())) {
      const tzMs = dt.getTimezoneOffset() * 60000;
      return new Date(dt.getTime() - tzMs).toISOString().slice(0, 10);
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(event.date)) return event.date.slice(0, 10);
  }
  return null;
}

/** Add `days` to a "YYYY-MM-DD" string, returning a new "YYYY-MM-DD" string. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  const tzMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzMs).toISOString().slice(0, 10);
}

/**
 * Materialize a template into concrete ScheduleItem rows. Times are anchored to the
 * event's start date; if no valid start date is known, start/end are left blank.
 */
export function buildTemplateSessions(
  tpl: ScheduleTemplate,
  event: { startDate?: string; date?: string } | null | undefined,
): ScheduleItem[] {
  const base = resolveEventStartDate(event);
  return tpl.sessions.map(sess => {
    if (!base) {
      return { title: sess.title, type: sess.type, location: sess.location, startTime: "", endTime: "" };
    }
    const day = addDays(base, sess.day);
    return {
      title: sess.title,
      type: sess.type,
      location: sess.location,
      startTime: `${day}T${sess.start}`,
      endTime: `${day}T${sess.end}`,
    };
  });
}
