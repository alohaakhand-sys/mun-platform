package com.munpro.app.domain.live

// PORTED FROM src/components/session/gate/liveGate.ts and the model half of
// src/lib/services/liveControlService.ts. Nobody reaches a live console without passing through
// resolveLiveGate: the ORGANIZER must have opened committee sessions (liveControl.sessionsOpen)
// and, for a delegate, the CHAIR must have gavelled in today's session (the doc exists).

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

data class CeremonyState(val status: String = "idle", val title: String = "")

data class EventLiveControl(
    val eventId: String,
    val sessionsOpen: Boolean,
    val opening: CeremonyState,
    val closing: CeremonyState,
    val note: String = "",
)

fun ceremonyLabel(kind: String): String = if (kind == "opening") "Opening Ceremony" else "Closing Ceremony"

/** normalize() from liveControlService.ts: absent ceremonies read as idle with their default title. */
fun normalizeLiveControl(eventId: String, data: Map<String, Any?>?): EventLiveControl {
    fun ceremony(kind: String): CeremonyState {
        @Suppress("UNCHECKED_CAST") val m = data?.get(kind) as? Map<String, Any?>
        return CeremonyState(
            status = (m?.get("status") as? String) ?: "idle",
            title = (m?.get("title") as? String) ?: ceremonyLabel(kind),
        )
    }
    return EventLiveControl(
        eventId = eventId,
        sessionsOpen = data?.get("sessionsOpen") == true,
        opening = ceremony("opening"),
        closing = ceremony("closing"),
        note = (data?.get("note") as? String).orEmpty(),
    )
}

fun liveCeremony(control: EventLiveControl?): String? = when {
    control == null -> null
    control.opening.status == "live" -> "opening"
    control.closing.status == "live" -> "closing"
    else -> null
}

/** kind: "pass" | "loading" | "event_not_started" | "ceremony_only" | "committee_not_open" */
data class LiveGateVerdict(val kind: String, val ceremony: String? = null, val committee: String = "", val dateStr: String = "")

/** A value still loading (null here is "loaded, and absent"). */
sealed interface Loadable<out T> {
    data object Loading : Loadable<Nothing>
    data class Ready<T>(val value: T?) : Loadable<T>
}

fun resolveLiveGate(
    control: Loadable<EventLiveControl>,
    session: Loadable<LiveSession>,
    role: String,
    committee: String = "",
    dateStr: String = "",
    bypass: Boolean = false,
): LiveGateVerdict {
    if (bypass) return LiveGateVerdict("pass")
    if (control is Loadable.Loading) return LiveGateVerdict("loading")
    val c = (control as Loadable.Ready).value
    // Gate 1 — the organizer's master switch.
    if (c == null || !c.sessionsOpen) {
        val live = liveCeremony(c)
        return if (live != null) LiveGateVerdict("ceremony_only", ceremony = live) else LiveGateVerdict("event_not_started")
    }
    // Gate 2 — the chair. Only a delegate can be blocked by it.
    if (role == "delegate") {
        if (session is Loadable.Loading) return LiveGateVerdict("loading")
        if ((session as Loadable.Ready).value == null) {
            return LiveGateVerdict("committee_not_open", committee = committee.ifEmpty { "Your committee" }, dateStr = dateStr)
        }
    }
    return LiveGateVerdict("pass")
}

data class LiveGateCopy(val title: String, val body: String, val note: String? = null)

private fun prettyDate(dateStr: String): String {
    if (dateStr.isEmpty()) return "today"
    return runCatching { LocalDate.parse(dateStr).format(DateTimeFormatter.ofPattern("d MMMM", Locale.UK)) }.getOrDefault(dateStr)
}

fun liveGateCopy(verdict: LiveGateVerdict, eventTitle: String?, control: EventLiveControl?): LiveGateCopy? {
    val note = control?.note?.trim()?.ifEmpty { null }
    return when (verdict.kind) {
        "event_not_started" -> LiveGateCopy(
            "Live MUN hasn't opened yet",
            if (!eventTitle.isNullOrEmpty()) "The organizer hasn't opened Live MUN for $eventTitle yet. This unlocks the moment they do."
            else "The organizer hasn't opened Live MUN for this conference yet. This unlocks the moment they do.",
            note,
        )
        "ceremony_only" -> {
            val kind = verdict.ceremony ?: "opening"
            val label = (if (kind == "opening") control?.opening?.title else control?.closing?.title)?.ifEmpty { null } ?: ceremonyLabel(kind)
            // The screen offers "Join <ceremony>" under this copy.
            LiveGateCopy("Committee sessions aren't open yet", "$label is live right now. Committee sessions open after it.", note)
        }
        "committee_not_open" -> LiveGateCopy(
            "${verdict.committee} isn't in session yet",
            "Your chair hasn't gavelled in the sitting for ${prettyDate(verdict.dateStr)}. This opens by itself the moment they do.",
            note,
        )
        else -> null
    }
}
