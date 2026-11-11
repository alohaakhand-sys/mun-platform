package com.munpro.app.ui

// Every pushed screen, in one place, so the route table reads like RN's app/_layout.tsx.

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import androidx.navigation.toRoute
import com.munpro.app.nav.AchievementsRoute
import com.munpro.app.nav.AnnouncementsRoute
import com.munpro.app.nav.ApplyRoute
import com.munpro.app.nav.CeremonyRoute
import com.munpro.app.nav.ChairRoute
import com.munpro.app.nav.CommitteeRoute
import com.munpro.app.nav.ConferenceRoute
import com.munpro.app.nav.DocumentsRoute
import com.munpro.app.nav.EventRoute
import com.munpro.app.nav.LiveRoute
import com.munpro.app.nav.MembersRoute
import com.munpro.app.nav.MyConferencesRoute
import com.munpro.app.nav.NotificationsRoute
import com.munpro.app.nav.PaymentsRoute
import com.munpro.app.nav.PositionPaperRoute
import com.munpro.app.nav.ReaderRoute
import com.munpro.app.nav.SessionDetailRoute
import com.munpro.app.nav.SettingsRoute
import com.munpro.app.nav.routeForLink
import com.munpro.app.ui.apply.ApplyScreen
import com.munpro.app.ui.event.CommitteeScreen
import com.munpro.app.ui.event.EventScreen
import com.munpro.app.ui.conference.AnnouncementsScreen
import com.munpro.app.ui.conference.ConferenceHome
import com.munpro.app.ui.conference.ReaderScreen
import com.munpro.app.ui.notifications.NotificationsScreen
import com.munpro.app.ui.profile.AchievementsScreen
import com.munpro.app.ui.profile.MyConferencesScreen
import com.munpro.app.ui.payments.PaymentsScreen
import com.munpro.app.ui.settings.SettingsScreen
import com.munpro.app.ui.schedule.SessionDetailScreen
import com.munpro.app.ui.documents.DocumentsScreen
import com.munpro.app.ui.documents.PositionPaperScreen
import com.munpro.app.ui.live.LiveScreen
import com.munpro.app.ui.chair.ChairScreen
import com.munpro.app.ui.kit.Empty
import com.munpro.app.ui.kit.Screen

fun NavGraphBuilder.screens() {
    composable<EventRoute> { EventScreen(it.toRoute<EventRoute>().id) }
    composable<CommitteeRoute> { val r = it.toRoute<CommitteeRoute>(); CommitteeScreen(r.eventId, r.name) }
    composable<ApplyRoute> { ApplyScreen(it.toRoute<ApplyRoute>().id) }
    composable<ConferenceRoute> { ConferenceHome(it.toRoute<ConferenceRoute>().id) }
    composable<AnnouncementsRoute> { val r = it.toRoute<AnnouncementsRoute>(); AnnouncementsScreen(r.eventId, r.role, r.committee) }
    composable<ReaderRoute> { val r = it.toRoute<ReaderRoute>(); ReaderScreen(r.kind, r.eventId, r.id, r.committee) }
    composable<DocumentsRoute> { DocumentsScreen(it.toRoute<DocumentsRoute>().appId) }
    composable<PositionPaperRoute> { PositionPaperScreen(it.toRoute<PositionPaperRoute>().appId) }
    composable<MembersRoute> { com.munpro.app.ui.conference.PortalScreen(it.toRoute<MembersRoute>().appId) { c -> com.munpro.app.ui.conference.PeopleScreen(c) } }
    composable<com.munpro.app.nav.RequestsRoute> { com.munpro.app.ui.conference.PortalScreen(it.toRoute<com.munpro.app.nav.RequestsRoute>().appId) { c -> com.munpro.app.ui.conference.RequestsScreen(c) } }
    composable<com.munpro.app.nav.ModuleRoute> {
        val r = it.toRoute<com.munpro.app.nav.ModuleRoute>()
        com.munpro.app.ui.conference.PortalScreen(r.appId) { c ->
            when (r.kind) {
                com.munpro.app.ui.conference.Modules.FOOD -> com.munpro.app.ui.conference.FoodScreen(c)
                com.munpro.app.ui.conference.Modules.TRANSPORT -> com.munpro.app.ui.conference.TransportScreen(c)
                com.munpro.app.ui.conference.Modules.ACCOMMODATION -> com.munpro.app.ui.conference.AccommodationScreen(c)
                else -> com.munpro.app.ui.conference.DressCodeScreen(c)
            }
        }
    }
    composable<com.munpro.app.nav.ResultsRoute> { com.munpro.app.ui.conference.PortalScreen(it.toRoute<com.munpro.app.nav.ResultsRoute>().appId) { c -> com.munpro.app.ui.conference.ResultsScreen(c) } }
    composable<com.munpro.app.nav.CertificateRoute> { com.munpro.app.ui.conference.PortalScreen(it.toRoute<com.munpro.app.nav.CertificateRoute>().appId) { c -> com.munpro.app.ui.conference.CertificateScreen(c) } }
    composable<com.munpro.app.nav.ChairHubRoute> { com.munpro.app.ui.chair.ChairHubScreen() }
    composable<com.munpro.app.nav.CommitteeHubRoute> { val r = it.toRoute<com.munpro.app.nav.CommitteeHubRoute>(); com.munpro.app.ui.chair.CommitteeHubScreen(r.eventId, r.committee) }
    composable<com.munpro.app.nav.RequestInboxRoute> { val r = it.toRoute<com.munpro.app.nav.RequestInboxRoute>(); com.munpro.app.ui.chair.RequestInboxScreen(r.eventId, r.committee) }
    composable<com.munpro.app.nav.StudyGuideEditRoute> { val r = it.toRoute<com.munpro.app.nav.StudyGuideEditRoute>(); com.munpro.app.ui.chair.StudyGuideEditorScreen(r.eventId, r.committee) }
    composable<com.munpro.app.nav.AwardsRoute> { val r = it.toRoute<com.munpro.app.nav.AwardsRoute>(); com.munpro.app.ui.chair.AwardsResultsScreen(r.eventId, r.committee) }
    composable<com.munpro.app.nav.ExecBoardRoute> { com.munpro.app.ui.chair.ExecBoardScreen() }
    composable<com.munpro.app.nav.ObserverRoute> { com.munpro.app.ui.chair.ObserverScreen() }
    composable<com.munpro.app.nav.OrganizerHomeRoute> { com.munpro.app.ui.organizer.OrganizerHomeScreen() }
    composable<com.munpro.app.nav.OrgEventsRoute> { com.munpro.app.ui.organizer.OrgEventsScreen() }
    composable<com.munpro.app.nav.EventEditorRoute> { com.munpro.app.ui.organizer.EventEditorScreen(it.toRoute<com.munpro.app.nav.EventEditorRoute>().eventId) }
    composable<com.munpro.app.nav.OrgEventRoute> { com.munpro.app.ui.organizer.OrgEventScreen(it.toRoute<com.munpro.app.nav.OrgEventRoute>().eventId) }
    composable<com.munpro.app.nav.AllocationRoute> { val r = it.toRoute<com.munpro.app.nav.AllocationRoute>(); com.munpro.app.ui.organizer.AllocationScreen(r.eventId, r.tab) }
    composable<com.munpro.app.nav.OrgApplicationRoute> { val r = it.toRoute<com.munpro.app.nav.OrgApplicationRoute>(); com.munpro.app.ui.organizer.OrgApplicationScreen(r.eventId, r.appId) }
    composable<com.munpro.app.nav.EventMenuRoute> { com.munpro.app.ui.organizer.EventMenuScreen(it.toRoute<com.munpro.app.nav.EventMenuRoute>().eventId) }
    composable<com.munpro.app.nav.CommitteesRoute> { com.munpro.app.ui.organizer.CommitteesScreen(it.toRoute<com.munpro.app.nav.CommitteesRoute>().eventId) }
    composable<com.munpro.app.nav.CommitteeEditorRoute> { val r = it.toRoute<com.munpro.app.nav.CommitteeEditorRoute>(); com.munpro.app.ui.organizer.CommitteeEditorScreen(r.eventId, r.index, r.template) }
    composable<com.munpro.app.nav.EventDetailsRoute> { com.munpro.app.ui.organizer.EventDetailsScreen(it.toRoute<com.munpro.app.nav.EventDetailsRoute>().eventId) }
    composable<com.munpro.app.nav.ModulesSetupRoute> { com.munpro.app.ui.organizer.ModulesSetupScreen(it.toRoute<com.munpro.app.nav.ModulesSetupRoute>().eventId) }
    composable<com.munpro.app.nav.MarkingSetupRoute> { com.munpro.app.ui.organizer.MarkingSetupScreen(it.toRoute<com.munpro.app.nav.MarkingSetupRoute>().eventId) }
    composable<com.munpro.app.nav.FinalScoringRoute> { com.munpro.app.ui.organizer.FinalScoringScreen(it.toRoute<com.munpro.app.nav.FinalScoringRoute>().eventId) }
    composable<com.munpro.app.nav.PartnersRoute> { com.munpro.app.ui.organizer.PartnersScreen(it.toRoute<com.munpro.app.nav.PartnersRoute>().eventId) }
    composable<com.munpro.app.nav.StaffRoute> { com.munpro.app.ui.organizer.StaffScreen(it.toRoute<com.munpro.app.nav.StaffRoute>().eventId) }
    composable<com.munpro.app.nav.ScheduleBuilderRoute> { com.munpro.app.ui.organizer.ScheduleBuilderScreen(it.toRoute<com.munpro.app.nav.ScheduleBuilderRoute>().eventId) }
    composable<com.munpro.app.nav.OrgAnnouncementsRoute> { com.munpro.app.ui.organizer.AnnouncementsScreen(it.toRoute<com.munpro.app.nav.OrgAnnouncementsRoute>().eventId) }
    composable<com.munpro.app.nav.ComposeAnnouncementRoute> { val r = it.toRoute<com.munpro.app.nav.ComposeAnnouncementRoute>(); com.munpro.app.ui.organizer.ComposeAnnouncementScreen(r.eventId, r.draftId) }
    composable<com.munpro.app.nav.RulesEditorRoute> { com.munpro.app.ui.organizer.RulesEditorScreen(it.toRoute<com.munpro.app.nav.RulesEditorRoute>().eventId) }
    composable<com.munpro.app.nav.ToolsRoute> { com.munpro.app.ui.organizer.ToolsScreen(it.toRoute<com.munpro.app.nav.ToolsRoute>().eventId) }
    composable<com.munpro.app.nav.FoodSlotsRoute> { com.munpro.app.ui.organizer.FoodSlotsScreen(it.toRoute<com.munpro.app.nav.FoodSlotsRoute>().eventId) }
    composable<com.munpro.app.nav.ScanRoute> { com.munpro.app.ui.passes.ScanScreen(it.toRoute<com.munpro.app.nav.ScanRoute>().eventId) }
    composable<com.munpro.app.nav.CouponsRoute> { com.munpro.app.ui.organizer.CouponsScreen(it.toRoute<com.munpro.app.nav.CouponsRoute>().eventId) }
    composable<com.munpro.app.nav.TransportRoutesRoute> { com.munpro.app.ui.organizer.TransportRoutesScreen(it.toRoute<com.munpro.app.nav.TransportRoutesRoute>().eventId) }
    composable<com.munpro.app.nav.AccommodationSetupRoute> { com.munpro.app.ui.organizer.AccommodationSetupScreen(it.toRoute<com.munpro.app.nav.AccommodationSetupRoute>().eventId) }
    composable<com.munpro.app.nav.DressCodeSetupRoute> { com.munpro.app.ui.organizer.DressCodeSetupScreen(it.toRoute<com.munpro.app.nav.DressCodeSetupRoute>().eventId) }
    composable<com.munpro.app.nav.OrgComplaintsRoute> { com.munpro.app.ui.organizer.OrgComplaintsScreen(it.toRoute<com.munpro.app.nav.OrgComplaintsRoute>().eventId) }
    composable<com.munpro.app.nav.ResultsApprovalRoute> { com.munpro.app.ui.organizer.ResultsApprovalScreen(it.toRoute<com.munpro.app.nav.ResultsApprovalRoute>().eventId) }
    composable<com.munpro.app.nav.CertificatesSetupRoute> { com.munpro.app.ui.organizer.CertificatesSetupScreen(it.toRoute<com.munpro.app.nav.CertificatesSetupRoute>().eventId) }
    composable<com.munpro.app.nav.IdCardsRoute> { com.munpro.app.ui.organizer.IdCardsScreen(it.toRoute<com.munpro.app.nav.IdCardsRoute>().eventId) }
    composable<com.munpro.app.nav.ThemeSetupRoute> { com.munpro.app.ui.organizer.ThemeSetupScreen(it.toRoute<com.munpro.app.nav.ThemeSetupRoute>().eventId) }
    composable<com.munpro.app.nav.FinancialsRoute> { com.munpro.app.ui.organizer.FinancialsScreen(it.toRoute<com.munpro.app.nav.FinancialsRoute>().eventId) }
    composable<com.munpro.app.nav.EventPlanRoute> { it.toRoute<com.munpro.app.nav.EventPlanRoute>().let { r -> com.munpro.app.ui.organizer.EventPlanScreen(r.eventId, r.confirm) } }
    composable<com.munpro.app.nav.WalletRoute> { com.munpro.app.ui.organizer.WalletScreen() }
    composable<com.munpro.app.nav.ProRoute> { com.munpro.app.ui.organizer.ProScreen() }
    composable<com.munpro.app.nav.HubMarkingRoute> { val r = it.toRoute<com.munpro.app.nav.HubMarkingRoute>(); com.munpro.app.ui.chair.HubMarkingScreen(r.eventId, r.committee) }
    composable<com.munpro.app.nav.MotionLogRoute> { val r = it.toRoute<com.munpro.app.nav.MotionLogRoute>(); com.munpro.app.ui.chair.MotionLogScreen(r.eventId, r.committee) }
    composable<com.munpro.app.nav.PapersRoute> { val r = it.toRoute<com.munpro.app.nav.PapersRoute>(); com.munpro.app.ui.chair.PapersScreen(r.eventId, r.committee) }
    composable<com.munpro.app.nav.GradePaperRoute> { val r = it.toRoute<com.munpro.app.nav.GradePaperRoute>(); com.munpro.app.ui.chair.GradePaperScreen(r.eventId, r.committee, r.appId) }
    composable<com.munpro.app.nav.RequestDetailRoute> { com.munpro.app.ui.conference.RequestDetailScreen(it.toRoute<com.munpro.app.nav.RequestDetailRoute>().id) }
    composable<SessionDetailRoute> { val r = it.toRoute<SessionDetailRoute>(); SessionDetailScreen(r.eventId, r.index) }
    composable<LiveRoute> { val r = it.toRoute<LiveRoute>(); LiveScreen(r.id, r.chat) }
    composable<ChairRoute> { val r = it.toRoute<ChairRoute>(); ConsoleTheme { ChairScreen(r.id, r.committee) } }
    composable<com.munpro.app.nav.LiveControlRoute> { com.munpro.app.ui.organizer.LiveControlScreen(it.toRoute<com.munpro.app.nav.LiveControlRoute>().eventId) }
    composable<com.munpro.app.nav.AdminLiveRoute> { com.munpro.app.ui.admin.AdminLiveScreen() }
    composable<com.munpro.app.nav.AdminObserveRoute> { val r = it.toRoute<com.munpro.app.nav.AdminObserveRoute>(); com.munpro.app.ui.admin.AdminObserveScreen(r.eventId, r.sessionId, r.committee, r.dateStr) }
    composable<com.munpro.app.nav.RoomBoardRoute> { val r = it.toRoute<com.munpro.app.nav.RoomBoardRoute>(); com.munpro.app.ui.live.RoomBoardScreen(r.eventId, r.committee) }
    composable<CeremonyRoute> { val r = it.toRoute<CeremonyRoute>(); com.munpro.app.ui.live.CeremonyScreen(r.eventId, r.kind) }
    composable<NotificationsRoute> { NotificationsScreen() }
    composable<AchievementsRoute> { AchievementsScreen() }
    composable<PaymentsRoute> { PaymentsScreen() }
    composable<com.munpro.app.nav.DocumentsHubRoute> { com.munpro.app.ui.documents.DocumentsHubScreen() }
    composable<com.munpro.app.nav.CommitteePapersRoute> { com.munpro.app.ui.documents.CommitteePapersScreen(it.toRoute<com.munpro.app.nav.CommitteePapersRoute>().appId) }
    composable<com.munpro.app.nav.PaymentConfirmRoute> { com.munpro.app.ui.payments.PaymentConfirmScreen(it.toRoute<com.munpro.app.nav.PaymentConfirmRoute>().appId) }
    composable<com.munpro.app.nav.ReceiptRoute> { com.munpro.app.ui.payments.ReceiptScreen(it.toRoute<com.munpro.app.nav.ReceiptRoute>().appId) }
    composable<SettingsRoute> { SettingsScreen() }
    composable<com.munpro.app.nav.NotificationSettingsRoute> { com.munpro.app.ui.settings.NotificationSettingsScreen() }
    composable<com.munpro.app.nav.PrivacySettingsRoute> { com.munpro.app.ui.settings.PrivacySettingsScreen() }
    composable<com.munpro.app.nav.SecurityRoute> { com.munpro.app.ui.settings.SecurityScreen() }
    composable<com.munpro.app.nav.UpdateRoute> { com.munpro.app.ui.profile.UpdateScreen() }
    composable<com.munpro.app.nav.WhatsNewRoute> { com.munpro.app.ui.profile.WhatsNewScreen() }
    composable<MyConferencesRoute> { MyConferencesScreen() }
    // Board A1: the old Today and Schedule tabs, now opened from Home and Conferences; Activity; Search.
    composable<com.munpro.app.nav.TodayRoute> { com.munpro.app.ui.today.TodayScreen() }
    composable<com.munpro.app.nav.ScheduleRoute> { com.munpro.app.ui.schedule.ScheduleScreen() }
    composable<com.munpro.app.nav.ActivityRoute> { com.munpro.app.ui.home.ActivityScreen() }
    composable<com.munpro.app.nav.SearchRoute> { com.munpro.app.ui.home.SearchScreen() }
    composable<com.munpro.app.nav.PublicProfileRoute> { val r = it.toRoute<com.munpro.app.nav.PublicProfileRoute>(); com.munpro.app.ui.network.PublicProfileScreen(r.uid, r.preview) }
    composable<com.munpro.app.nav.EditProfileRoute> { com.munpro.app.ui.profile.EditProfileScreen() }
    composable<com.munpro.app.nav.AccountDetailsRoute> { com.munpro.app.ui.profile.AccountDetailsScreen() }
    composable<com.munpro.app.nav.MyRecommendationsRoute> { com.munpro.app.ui.profile.MyRecommendationsScreen() }
    composable<com.munpro.app.nav.DaisThreadRoute> { val r = it.toRoute<com.munpro.app.nav.DaisThreadRoute>(); com.munpro.app.ui.messages.DaisThreadScreen(r.lineKey, r.threadKey) }
    composable<com.munpro.app.nav.ChatRoute> { val r = it.toRoute<com.munpro.app.nav.ChatRoute>(); com.munpro.app.ui.messages.ChatScreen(r.convId, r.otherUid) }
    composable<com.munpro.app.nav.BlogsRoute> { com.munpro.app.ui.blogs.BlogsScreen() }
    composable<com.munpro.app.nav.BlogRoute> { com.munpro.app.ui.blogs.BlogReaderScreen(it.toRoute<com.munpro.app.nav.BlogRoute>().id) }
    composable<com.munpro.app.nav.MyBlogsRoute> { com.munpro.app.ui.blogs.MyBlogsScreen() }
    composable<com.munpro.app.nav.BlogEditorRoute> { com.munpro.app.ui.blogs.BlogEditorScreen(it.toRoute<com.munpro.app.nav.BlogEditorRoute>().id) }
    composable<com.munpro.app.nav.GroupInfoRoute> { com.munpro.app.ui.messages.GroupInfoScreen(it.toRoute<com.munpro.app.nav.GroupInfoRoute>().convId) }
    composable<com.munpro.app.nav.DaisInboxRoute> { com.munpro.app.ui.messages.DaisInboxScreen(it.toRoute<com.munpro.app.nav.DaisInboxRoute>().lineKey) }
}

/** The chair console under its own Light / Dark when one is chosen; otherwise the app's. */
@Composable
private fun ConsoleTheme(content: @Composable () -> Unit) {
    val mode by com.munpro.app.AppGraph.consoleAppearance.collectAsState()
    if (mode == com.munpro.app.ui.kit.AppearanceMode.System) content() else com.munpro.app.ui.kit.MunTheme(mode, content)
}

/** A screen not built yet in this phase of the rebuild (see android-native/PLAN.md). */
@Composable
private fun Pending(title: String) {
    Screen(title = title, back = "Back", tabBar = false) {
        Empty("Coming in a later phase", "This screen is part of the Kotlin rebuild plan and hasn't been built yet.")
    }
}

/** Opens a link that arrived from outside (cold start or while running), once. */
@Composable
fun DeepLinkEffect(nav: Navigator, link: String?, onHandled: () -> Unit) {
    LaunchedEffect(link) {
        if (link == null) return@LaunchedEffect
        nav.go(routeForLink(link))
        onHandled()
    }
}
