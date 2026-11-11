package com.munpro.app.domain

// Date and fee wording (port of mobile/src/lib/format.ts) and schedule helpers (lib/session.ts).
// Fees come from the web's own pricing helpers, so the phone and the website never disagree
// about what a conference costs.

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToLong

private val zone: ZoneId get() = ZoneId.systemDefault()
private fun fmt(pattern: String, locale: Locale = Locale.UK) = DateTimeFormatter.ofPattern(pattern, locale)

data class CalTile(val month: String, val day: String)

/** `{ month: "NOV", day: "15" }` for the Calendar-style date tile. */
fun calTile(ms: Long?): CalTile {
    if (ms == null) return CalTile("TBA", "–")
    val d = Instant.ofEpochMilli(ms).atZone(zone)
    return CalTile(d.format(fmt("MMM")).uppercase().removeSuffix("."), d.dayOfMonth.toString())
}

/** `Sat, 15 November, 10:00 AM` */
fun whenText(ms: Long?, raw: String? = null): String {
    if (ms == null) return raw?.ifEmpty { null } ?: "Date to be announced"
    val d = Instant.ofEpochMilli(ms).atZone(zone)
    return "${d.format(fmt("EEE, d MMMM"))}, ${clock(ms)}"
}

/** `Free`, `$25`, or null when the organiser hasn't priced any role yet. */
fun fromPrice(event: EventData): String? {
    val tiers = getEnabledRoleTiers(event)
    if (tiers.isEmpty()) return null
    val min = tiers.minOf { getEffectiveRoleUnitPrice(event, it).price }
    return if (min <= 0) "Free" else formatFee(min)
}

fun place(event: EventData): String {
    val l = (event.locationName?.ifEmpty { null } ?: event.location).split(",")[0].trim()
    return l.ifEmpty { if (event.format == "online") "Online" else "Venue to be announced" }
}

fun formatLabel(event: EventData): String = when (event.format) {
    "online" -> "Online"
    "hybrid" -> "Hybrid"
    else -> "In person"
}

// ---- schedule (event.schedule items carry "YYYY-MM-DDTHH:mm" local times) ----

data class Sitting(val item: ScheduleItem, val start: Long, val end: Long?) {
    /** The RN app assumes an hour when an item has no end. */
    val endOrHour: Long get() = end ?: (start + 3_600_000)
}

fun sessions(event: EventData): List<Sitting> =
    event.schedule
        .mapNotNull { s -> jsDateMs(s.startTime)?.let { Sitting(s, it, jsDateMs(s.endTime)) } }
        .sortedBy { it.start }

/** The session happening now, else the next one to start. */
fun nextSession(event: EventData, now: Long = System.currentTimeMillis()): Sitting? {
    val list = sessions(event)
    return list.firstOrNull { it.start <= now && it.endOrHour > now } ?: list.firstOrNull { it.start > now }
}

fun untilLabel(start: Long, now: Long = System.currentTimeMillis()): String {
    val m = ((start - now) / 60000.0).roundToLong()
    if (m <= 0) return "Now"
    if (m < 60) return "In $m min"
    val h = m / 60
    val r = m % 60
    if (h < 24) return if (r > 0) "In $h hr $r min" else "In $h hr"
    val d = (h / 24.0).roundToLong()
    return "In $d day${if (d == 1L) "" else "s"}"
}

/** `2:00 PM` */
fun clock(t: Long): String = Instant.ofEpochMilli(t).atZone(zone).format(fmt("h:mm a", Locale.US))

fun dayKey(t: Long): LocalDate = Instant.ofEpochMilli(t).atZone(zone).toLocalDate()

/** `Sat 15 Nov` */
fun dayLabel(d: LocalDate): String = d.format(fmt("EEE d MMM"))

/** `15 November 2005` */
fun longDate(d: LocalDate): String = d.format(fmt("d MMMM yyyy"))

/** `Saturday 15 November` (Today's overline) */
fun todayOverline(now: Long = System.currentTimeMillis()): String =
    Instant.ofEpochMilli(now).atZone(zone).format(fmt("EEEE d MMMM"))

/** `15 Nov` or a time if today (Announcements list). */
fun shortWhen(t: Long?): String {
    if (t == null || t <= 0) return ""
    val d = Instant.ofEpochMilli(t).atZone(zone)
    return if (d.toLocalDate() == LocalDate.now(zone)) clock(t) else d.format(fmt("d MMM"))
}

/** `Sat 15 November, 11:04 AM` */
fun readerMeta(t: Long): String {
    val d = Instant.ofEpochMilli(t).atZone(zone)
    return "${d.format(fmt("EEE d MMMM"))}, ${clock(t)}"
}

/** "now", "5m", "3h", or "15 Nov" (Notifications). */
fun ago(t: Long, now: Long = System.currentTimeMillis()): String {
    val m = ((now - t) / 60000.0).roundToLong()
    if (m < 1) return "now"
    if (m < 60) return "${m}m"
    if (m < 1440) return "${(m / 60.0).roundToLong()}h"
    return Instant.ofEpochMilli(t).atZone(zone).format(fmt("d MMM"))
}

/** `M:SS` (RN fmtClock). */
fun fmtClock(ms: Long): String {
    val s = maxOf(0L, (ms / 1000.0).roundToLong())
    return "${s / 60}:${(s % 60).toString().padStart(2, '0')}"
}

/** "just now", "12 min ago", "2 hr ago", "Yesterday", "15 Nov" (Today's announcement row). */
fun relativeAgo(t: Long, now: Long = System.currentTimeMillis()): String {
    val m = ((now - t) / 60000.0).roundToLong()
    if (m < 1) return "just now"
    if (m < 60) return "$m min ago"
    if (m < 1440) return "${(m / 60.0).roundToLong()} hr ago"
    if (dayKey(t) == dayKey(now).minusDays(1)) return "Yesterday"
    return Instant.ofEpochMilli(t).atZone(zone).format(fmt("d MMM"))
}

/** `Fri 7 November` */
fun dayMonth(t: Long): String = Instant.ofEpochMilli(t).atZone(zone).format(fmt("EEE d MMMM"))

/** `2:00 – 4:00 PM` */
fun timeRange(start: Long, end: Long?): String {
    if (end == null) return clock(start)
    val a = Instant.ofEpochMilli(start).atZone(zone)
    val b = Instant.ofEpochMilli(end).atZone(zone)
    val sameHalf = (a.hour < 12) == (b.hour < 12)
    val left = if (sameHalf) a.format(fmt("h:mm", Locale.US)) else clock(start)
    return "$left – ${clock(end)}"
}
