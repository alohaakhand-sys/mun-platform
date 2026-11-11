package com.munpro.app.nav

import org.junit.Assert.assertEquals
import org.junit.Test

// The link table the retired React Native app had (+native-intent.tsx): site paths and munpro:// links land on
// the matching screen, anything else on Home.
class DeepLinksTest {
    @Test fun `site event pages open the event and its apply step`() {
        assertEquals(EventRoute("ev1"), routeForLink("https://munpro.app/events/ev1"))
        assertEquals(ApplyRoute("ev1"), routeForLink("https://munpro.app/events/ev1/apply"))
        assertEquals(EventRoute("ev1"), routeForLink("https://munpro.app/events/ev1/?ref=mail#top"))
    }

    @Test fun `the app scheme's host is the first path segment`() {
        assertEquals(EventRoute("ev1"), routeForLink("munpro://event/ev1"))
        assertEquals(LiveRoute("ev1"), routeForLink("munpro://live/ev1"))
        assertEquals(NotificationsRoute, routeForLink("munpro://notifications"))
    }

    @Test fun `dashboard conference links open the conference home or the live floor`() {
        assertEquals(ConferenceRoute("ev1"), routeForLink("https://munpro.app/dashboard/conferences/ev1"))
        assertEquals(LiveRoute("ev1"), routeForLink("https://munpro.app/dashboard/conferences/ev1/live"))
        assertEquals(ConferenceRoute("ev1"), routeForLink("munpro://conference/ev1"))
    }

    @Test fun `profile links open that member's public profile`() {
        assertEquals(PublicProfileRoute("u1"), routeForLink("https://munpro.app/dashboard/profile/u1"))
        assertEquals(Tabs(TAB_PROFILE), routeForLink("https://munpro.app/dashboard/profile"))
    }

    @Test fun `list pages open the matching tab`() {
        assertEquals(Tabs(TAB_CONFERENCES), routeForLink("https://munpro.app/dashboard/conferences"))
        assertEquals(Tabs(TAB_CONFERENCES, CONF_BROWSE), routeForLink("https://munpro.app/events"))
        assertEquals(Tabs(TAB_NETWORK), routeForLink("https://munpro.app/dashboard/network"))
        assertEquals(Tabs(TAB_MESSAGES), routeForLink("https://munpro.app/dashboard/messages"))
        assertEquals(Tabs(TAB_HOME), routeForLink("https://munpro.app/dashboard"))
        assertEquals(Tabs(TAB_HOME), routeForLink("https://munpro.app"))
        assertEquals(Tabs(TAB_HOME), routeForLink("munpro://"))
    }

    @Test fun `the gateway's way back opens the confirming screen, a website link opens Payments`() {
        assertEquals(PaymentConfirmRoute("app_123"), routeForLink("munpro://payments?app=app_123&payment=success&gw=stripe"))
        assertEquals(PaymentConfirmRoute("abc"), routeForLink("munpro://payments?payment=cancelled&app=abc"))
        assertEquals(PaymentsRoute, routeForLink("https://munpilot.com/dashboard/payments?app=abc"))
        assertEquals(PaymentsRoute, routeForLink("munpro://payments"))
    }

    @Test fun `anything unknown opens Home, never a dead end`() {
        assertEquals(Tabs(TAB_HOME), routeForLink("https://munpro.app/dashboard/organizer/events/ev1/staff"))
        assertEquals(Tabs(TAB_HOME), routeForLink("munpro://nowhere/at/all"))
        assertEquals(Tabs(TAB_HOME), routeForLink(""))
    }
}
