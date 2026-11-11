package com.munpro.app.nav

// Incoming links, from the site or a notification, mapped onto the app's own routes (port of
// mobile/src/app/+native-intent.tsx). The site and the app name things differently (/events/{id}
// vs the event screen, /dashboard/conferences/{eventId} vs the conference home), so a link copied
// from the website lands on the matching screen. Anything unknown opens Home, never a dead end.

private val RULES: List<Pair<Regex, (MatchResult) -> Any>> = listOf(
    Regex("^/?events?/([^/?#]+)/apply/?$") to { m -> ApplyRoute(m.groupValues[1]) },
    Regex("^/?events?/([^/?#]+)/?$") to { m -> EventRoute(m.groupValues[1]) },
    Regex("^/?(?:dashboard/)?conferences?/([^/?#]+)/live/?$") to { m -> LiveRoute(m.groupValues[1]) },
    Regex("^/?(?:dashboard/)?conferences?/([^/?#]+)/?$") to { m -> ConferenceRoute(m.groupValues[1]) },
    Regex("^/?live/([^/?#]+)/?$") to { m -> LiveRoute(m.groupValues[1]) },
    Regex("^/?(?:dashboard/)?notifications/?$") to { _ -> NotificationsRoute },
    // App update notification (notify/Notifier.kt) and Settings.
    Regex("^/?settings/update/?$") to { _ -> UpdateRoute },
    Regex("^/?settings/whats-new/?$") to { _ -> WhatsNewRoute },
    Regex("^/?settings/?$") to { _ -> SettingsRoute },
    Regex("^/?(?:dashboard/)?conferences/?$") to { _ -> Tabs(TAB_CONFERENCES) },
    Regex("^/?events/?$") to { _ -> Tabs(TAB_CONFERENCES, CONF_BROWSE) },
    Regex("^/?(?:dashboard/)?profile/([^/?#]+)/?$") to { m -> PublicProfileRoute(m.groupValues[1]) },
    Regex("^/?(?:dashboard/)?network/?$") to { _ -> Tabs(TAB_NETWORK) },
    Regex("^/?(?:dashboard/)?messages/?$") to { _ -> Tabs(TAB_MESSAGES) },
    Regex("^/?(?:dashboard/)?profile/?$") to { _ -> Tabs(TAB_PROFILE) },
    Regex("^/?(?:dashboard/)?payments/?$") to { _ -> PaymentsRoute },
    Regex("^/?(?:dashboard/)?$") to { _ -> Tabs(TAB_HOME) },
)

/** munpro://payments?app=<id>: the gateway's way back (munpilot.com/app-return) opens the confirming screen. */
private val PAYMENT_RETURN = Regex("^munpro://payments/?\\?(?:.*&)?app=([A-Za-z0-9_-]+)", RegexOption.IGNORE_CASE)

/** munpro://plan?event=<id>: back from paying for an event's Pro; the plan screen confirms it. */
private val PLAN_RETURN = Regex("^munpro://plan/?\\?(?:.*&)?event=([A-Za-z0-9_-]+)", RegexOption.IGNORE_CASE)

/** The route for a link, or Home. */
fun routeForLink(link: String): Any = try {
    PAYMENT_RETURN.find(link)?.let { return PaymentConfirmRoute(it.groupValues[1]) }
    PLAN_RETURN.find(link)?.let { return EventPlanRoute(it.groupValues[1], confirm = true) }
    // https://site/events/x → drop scheme AND host; munpro://events/x → the "host" IS the first
    // path segment, so drop only the scheme. Then drop any query or hash.
    val p = link
        .replace(Regex("^https?://[^/]*", RegexOption.IGNORE_CASE), "")
        .replace(Regex("^[a-z][a-z0-9+.-]*://", RegexOption.IGNORE_CASE), "/")
        .split(Regex("[?#]"))[0]
        .ifEmpty { "/" }
    RULES.firstNotNullOfOrNull { (re, to) -> re.find(p)?.let(to) } ?: Tabs(TAB_HOME)
} catch (_: Exception) {
    Tabs(TAB_HOME)
}
