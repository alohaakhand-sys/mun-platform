package com.munpro.app.domain

// JavaScript's `new Date(string).getTime()`, which the web services use everywhere for event
// dates, schedule items and application windows. The rules that matter (ECMAScript Date parsing):
//   "2026-11-15"              date-only ISO   -> UTC midnight
//   "2026-11-15T10:00[:ss]"   no offset       -> LOCAL time
//   "...Z" / "...+06:00"      with offset     -> that instant
// Anything unparseable is NaN in JS; null here.

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

private val dateOnly = Regex("^\\d{4}-\\d{2}-\\d{2}$")
private val localDateTime = Regex("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(:\\d{2}(\\.\\d{1,9})?)?$")

fun jsDateMs(s: String?, zone: ZoneId = ZoneId.systemDefault()): Long? {
    val v = s?.trim().orEmpty()
    if (v.isEmpty()) return null
    return try {
        when {
            dateOnly.matches(v) -> LocalDate.parse(v).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
            localDateTime.matches(v) -> LocalDateTime.parse(v).atZone(zone).toInstant().toEpochMilli()
            else -> runCatching { OffsetDateTime.parse(v).toInstant().toEpochMilli() }
                .recoverCatching { Instant.parse(v).toEpochMilli() }
                .recoverCatching { ZonedDateTime.parse(v, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toEpochMilli() }
                .recoverCatching {
                    // "Sat Nov 15 2026 10:00:00 GMT+0600 (…)" — Date.prototype.toString output.
                    val core = v.substringBefore(" (")
                    ZonedDateTime.parse(core, DateTimeFormatter.ofPattern("EEE MMM dd yyyy HH:mm:ss 'GMT'Z", Locale.US)).toInstant().toEpochMilli()
                }
                .getOrNull()
        }
    } catch (_: Exception) {
        null
    }
}

/** A JS-style "is a finite number" check for the NaN-carrying web helpers. */
fun Long?.finite(): Boolean = this != null
