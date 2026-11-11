package com.munpro.app.nav

// Every screen of the app (RN app/_layout.tsx registers the same set). Type-safe routes:
// arguments travel in the route object.

import kotlinx.serialization.Serializable

// ---- signed out ----
@Serializable data object Welcome
@Serializable data object SignIn
@Serializable data object SignUp
@Serializable data object ForgotPassword

// ---- signed in ----
/** [segment]: the Conferences half to open on ([CONF_MINE] / [CONF_BROWSE]); empty keeps the last one. */
@Serializable data class Tabs(val tab: String = TAB_HOME, val segment: String = "")

// The five tabs (board A1): Home · Conferences · Messages · Network · Profile.
const val TAB_HOME = "home"
const val TAB_CONFERENCES = "conferences"
const val TAB_MESSAGES = "messages"
const val TAB_NETWORK = "network"
const val TAB_PROFILE = "profile"

/** The Conferences tab's two halves until the gate (board B1) replaces it. */
const val CONF_MINE = "mine"
const val CONF_BROWSE = "browse"

/** The current conference's Today (the delegation pass), opened from Home or Conferences. */
@Serializable data object TodayRoute
@Serializable data object ScheduleRoute
@Serializable data object ActivityRoute
@Serializable data object SearchRoute
/** Someone else's profile (board A2.6–A2.10). */
@Serializable data class PublicProfileRoute(val uid: String, val preview: Boolean = false)
/** Your own profile editor (board A3) and its pages. */
@Serializable data object EditProfileRoute
@Serializable data object AccountDetailsRoute
@Serializable data object MyRecommendationsRoute

@Serializable data class EventRoute(val id: String)
@Serializable data class CommitteeRoute(val eventId: String, val name: String)
@Serializable data class ApplyRoute(val id: String)
@Serializable data class ConferenceRoute(val id: String)
@Serializable data class AnnouncementsRoute(val eventId: String, val role: String = "", val committee: String = "")
/** kind: "announcement" | "rules" | "guide" */
@Serializable data class ReaderRoute(val kind: String, val eventId: String, val id: String? = null, val committee: String? = null)
@Serializable data class DocumentsRoute(val appId: String)
/** Every conference's documents (A6.1), and one committee's papers (A6.2). */
@Serializable data object DocumentsHubRoute
@Serializable data class CommitteePapersRoute(val appId: String)
@Serializable data class PositionPaperRoute(val appId: String)
@Serializable data class MembersRoute(val appId: String)
/** The portal's Requests (B2): seat moves, swap offers, help-desk requests; and one request. */
@Serializable data class RequestsRoute(val appId: String)
@Serializable data class RequestDetailRoute(val id: String)
/** The optional modules (B3): kind = food | transport | accommodation | dresscode. */
@Serializable data class ModuleRoute(val appId: String, val kind: String)
@Serializable data class ResultsRoute(val appId: String)
@Serializable data class CertificateRoute(val appId: String)
/** The chair hub between sittings (B4). */
@Serializable data object ChairHubRoute
@Serializable data class CommitteeHubRoute(val eventId: String, val committee: String)
@Serializable data class HubMarkingRoute(val eventId: String, val committee: String)
@Serializable data class MotionLogRoute(val eventId: String, val committee: String)
@Serializable data class PapersRoute(val eventId: String, val committee: String)
@Serializable data class GradePaperRoute(val eventId: String, val committee: String, val appId: String)
@Serializable data class RequestInboxRoute(val eventId: String, val committee: String)
@Serializable data class StudyGuideEditRoute(val eventId: String, val committee: String)
@Serializable data class AwardsRoute(val eventId: String, val committee: String)
@Serializable data object ExecBoardRoute
@Serializable data object ObserverRoute
@Serializable data object OrganizerHomeRoute
@Serializable data object OrgEventsRoute
@Serializable data class EventEditorRoute(val eventId: String = "")
@Serializable data class OrgEventRoute(val eventId: String)
@Serializable data class EventMenuRoute(val eventId: String)
@Serializable data class AllocationRoute(val eventId: String, val tab: String = "")
@Serializable data class OrgApplicationRoute(val eventId: String, val appId: String)
@Serializable data class CommitteesRoute(val eventId: String)
/** [index] -1 = a new committee, from [template] ("" = scratch). */
@Serializable data class CommitteeEditorRoute(val eventId: String, val index: Int = -1, val template: String = "")
@Serializable data class EventDetailsRoute(val eventId: String)
@Serializable data class ModulesSetupRoute(val eventId: String)
@Serializable data class MarkingSetupRoute(val eventId: String)
@Serializable data class FinalScoringRoute(val eventId: String)
@Serializable data class PartnersRoute(val eventId: String)
@Serializable data class StaffRoute(val eventId: String)
@Serializable data class ScheduleBuilderRoute(val eventId: String)
@Serializable data class OrgAnnouncementsRoute(val eventId: String)
/** [draftId] "" = a new announcement. */
@Serializable data class ComposeAnnouncementRoute(val eventId: String, val draftId: String = "")
@Serializable data class RulesEditorRoute(val eventId: String)
@Serializable data class ToolsRoute(val eventId: String)
@Serializable data class FoodSlotsRoute(val eventId: String)
/** The QR pass scanner (setup/qr-passes-plan.md): organizer, co-organizers, staff with Scan passes. */
@Serializable data class ScanRoute(val eventId: String)
/** Custom coupons (Pro). */
@Serializable data class CouponsRoute(val eventId: String)
@Serializable data class TransportRoutesRoute(val eventId: String)
@Serializable data class AccommodationSetupRoute(val eventId: String)
@Serializable data class DressCodeSetupRoute(val eventId: String)
@Serializable data class OrgComplaintsRoute(val eventId: String)
@Serializable data class ResultsApprovalRoute(val eventId: String)
@Serializable data class CertificatesSetupRoute(val eventId: String)
@Serializable data class IdCardsRoute(val eventId: String)
@Serializable data class ThemeSetupRoute(val eventId: String)
@Serializable data class FinancialsRoute(val eventId: String)
@Serializable data class EventPlanRoute(val eventId: String, val confirm: Boolean = false)
@Serializable data object WalletRoute
@Serializable data object ProRoute
@Serializable data class SessionDetailRoute(val eventId: String, val index: Int)
@Serializable data class LiveRoute(val id: String, val chat: Boolean = false)
@Serializable data class ChairRoute(val id: String, val committee: String)
@Serializable data class CeremonyRoute(val eventId: String, val kind: String)
@Serializable data class LiveControlRoute(val eventId: String)
@Serializable data object AdminLiveRoute
@Serializable data class AdminObserveRoute(val eventId: String, val sessionId: String, val committee: String, val dateStr: String)
@Serializable data class RoomBoardRoute(val eventId: String, val committee: String)
@Serializable data object NotificationsRoute
@Serializable data object AchievementsRoute
@Serializable data object PaymentsRoute
/** Back from the gateway (munpilot.com/app-return → munpro://payments?app=…): confirm, then unlock. */
@Serializable data class PaymentConfirmRoute(val appId: String)
@Serializable data class ReceiptRoute(val appId: String)
@Serializable data object SettingsRoute
@Serializable data object NotificationSettingsRoute
@Serializable data object PrivacySettingsRoute
@Serializable data object SecurityRoute
@Serializable data object UpdateRoute
@Serializable data object WhatsNewRoute
@Serializable data object MyConferencesRoute
/** A dais line's thread in Messages: [lineKey] = DaisLine.key, [threadKey] = a delegate's uid or "@all". */
@Serializable data class DaisThreadRoute(val lineKey: String, val threadKey: String)
/** Direct or group chat (A4). [otherUid] names the person when a direct chat hasn't started. */
@Serializable data class ChatRoute(val convId: String, val otherUid: String = "")
@Serializable data class GroupInfoRoute(val convId: String)
/** Blogs, the delegate handbook (A5). */
@Serializable data object BlogsRoute
@Serializable data class BlogRoute(val id: String)
@Serializable data object MyBlogsRoute
/** [id] empty = a new blog. */
@Serializable data class BlogEditorRoute(val id: String = "")
/** One committee's dais inbox: a thread per delegation (board 12, opened from Messages). */
@Serializable data class DaisInboxRoute(val lineKey: String)
