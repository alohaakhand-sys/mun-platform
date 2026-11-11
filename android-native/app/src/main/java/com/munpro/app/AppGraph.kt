package com.munpro.app

import android.content.Context
import com.munpro.app.data.ApplicationRepo
import com.munpro.app.data.AuthRepo
import com.munpro.app.data.ConferencesStore
import com.munpro.app.data.ContentRepo
import com.munpro.app.data.EventRepo
import com.munpro.app.data.MessagesHub
import com.munpro.app.data.NetworkMonitor
import com.munpro.app.data.PaperRepo
import com.munpro.app.data.Saved
import com.munpro.app.data.Updates
import com.munpro.app.data.live.MarkingRepo
import com.munpro.app.data.live.PaperDesk
import com.munpro.app.data.live.SessionRepo
import com.munpro.app.notify.BackgroundCheck
import com.munpro.app.ui.kit.AppearanceMode
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** App-wide singletons. No DI framework: everything is created once, on first use. */
object AppGraph {
    lateinit var context: Context
        private set

    /** For work that outlives a screen (cache writes, sign-out). */
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    val network: NetworkMonitor by lazy { NetworkMonitor(context) }
    val saved: Saved by lazy { Saved(context) }
    val auth: AuthRepo by lazy { AuthRepo(saved) }
    val events: EventRepo by lazy { EventRepo() }
    val applications: ApplicationRepo by lazy { ApplicationRepo() }
    val conferences: ConferencesStore by lazy { ConferencesStore(auth, saved, applications, events) }
    val content: ContentRepo by lazy { ContentRepo(events) }
    val papers: PaperRepo by lazy { PaperRepo(context) }
    val sessions: SessionRepo by lazy { SessionRepo() }
    val markings: MarkingRepo by lazy { MarkingRepo() }
    val paperDesk: PaperDesk by lazy { PaperDesk() }
    val messages: MessagesHub by lazy { MessagesHub(auth, conferences, content, sessions, saved) }
    val updates: Updates by lazy { Updates(context, saved) }
    val home: com.munpro.app.data.HomeRepo by lazy { com.munpro.app.data.HomeRepo(auth, events, scope) }
    val people: com.munpro.app.data.PeopleRepo by lazy { com.munpro.app.data.PeopleRepo() }
    val chairHub: com.munpro.app.data.ChairHubRepo by lazy { com.munpro.app.data.ChairHubRepo() }
    val organizer: com.munpro.app.data.OrganizerRepo by lazy { com.munpro.app.data.OrganizerRepo() }
    val allocation: com.munpro.app.data.AllocationRepo by lazy { com.munpro.app.data.AllocationRepo() }
    val setup: com.munpro.app.data.SetupRepo by lazy { com.munpro.app.data.SetupRepo() }
    val comms: com.munpro.app.data.CommsRepo by lazy { com.munpro.app.data.CommsRepo() }
    val tools: com.munpro.app.data.ToolsRepo by lazy { com.munpro.app.data.ToolsRepo() }
    val finance: com.munpro.app.data.FinanceRepo by lazy { com.munpro.app.data.FinanceRepo() }
    val oversight: com.munpro.app.data.OversightRepo by lazy { com.munpro.app.data.OversightRepo() }
    val modules: com.munpro.app.data.ModulesRepo by lazy { com.munpro.app.data.ModulesRepo() }
    val requests: com.munpro.app.data.RequestsRepo by lazy { com.munpro.app.data.RequestsRepo() }
    val gate: com.munpro.app.data.GateRepo by lazy { com.munpro.app.data.GateRepo() }
    val payments: com.munpro.app.data.PaymentsRepo by lazy { com.munpro.app.data.PaymentsRepo() }
    val blogs: com.munpro.app.data.BlogRepo by lazy { com.munpro.app.data.BlogRepo(saved) }
    val chats: com.munpro.app.data.ChatsRepo by lazy { com.munpro.app.data.ChatsRepo(auth) }
    val online: com.munpro.app.data.Online by lazy { com.munpro.app.data.Online(auth, people) }
    val inbox: com.munpro.app.data.Inbox by lazy { com.munpro.app.data.Inbox(auth, conferences, content, saved, scope) }

    // Automatic / Light / Dark, remembered on the device (RN lib/appearance.tsx, same key).
    private const val APPEARANCE = "munpro.appearance"
    private val _appearance = MutableStateFlow(AppearanceMode.System)
    val appearance: StateFlow<AppearanceMode> = _appearance.asStateFlow()

    fun setAppearance(mode: AppearanceMode) {
        _appearance.value = mode
        scope.launch {
            saved.putString(APPEARANCE, when (mode) { AppearanceMode.Light -> "light"; AppearanceMode.Dark -> "dark"; else -> "system" })
        }
    }

    // The chair console's own Light / Dark (board 05 session menu), apart from the app's appearance.
    private const val CONSOLE_APPEARANCE = "munpro.consoleAppearance"
    private val _consoleAppearance = MutableStateFlow(AppearanceMode.System)
    val consoleAppearance: StateFlow<AppearanceMode> = _consoleAppearance.asStateFlow()

    fun setConsoleAppearance(mode: AppearanceMode) {
        _consoleAppearance.value = mode
        scope.launch { saved.putString(CONSOLE_APPEARANCE, when (mode) { AppearanceMode.Light -> "light"; AppearanceMode.Dark -> "dark"; else -> null }) }
    }

    // The live floor on the lock screen during a sitting (Settings → Notifications). On unless turned off.
    private const val LOCK_SCREEN_FLOOR = "munpro.lockScreenFloor"
    private val _lockScreenFloor = MutableStateFlow(true)
    val lockScreenFloor: StateFlow<Boolean> = _lockScreenFloor.asStateFlow()

    fun setLockScreenFloor(on: Boolean) {
        _lockScreenFloor.value = on
        scope.launch { saved.putString(LOCK_SCREEN_FLOOR, if (on) null else "off") }
    }

    // Phone notifications for new versions and for conference alerts (Settings -> Notifications),
    // read by notify/BackgroundCheck. On unless turned off.
    private val _notifyUpdates = MutableStateFlow(true)
    val notifyUpdates: StateFlow<Boolean> = _notifyUpdates.asStateFlow()
    private val _notifyAlerts = MutableStateFlow(true)
    val notifyAlerts: StateFlow<Boolean> = _notifyAlerts.asStateFlow()

    fun setNotifyUpdates(on: Boolean) {
        _notifyUpdates.value = on
        scope.launch { saved.putString(BackgroundCheck.UPDATES_PREF, if (on) null else "off") }
    }

    fun setNotifyAlerts(on: Boolean) {
        _notifyAlerts.value = on
        scope.launch { saved.putString(BackgroundCheck.ALERTS_PREF, if (on) null else "off") }
    }

    /**
     * Every process start, including the background check's (no screen): only the context and
     * device preferences. The stores that read Firestore start with the UI ([startUi]), so a
     * background wake-up every 15 minutes costs no conference or chat reads.
     */
    fun init(app: Context) {
        context = app.applicationContext
        // Saved copies moved from DataStore to the account's SQLite file; free the old space.
        scope.launch { saved.dropLegacyCopies() }
        scope.launch {
            _appearance.value = when (saved.getString(APPEARANCE)) {
                "light" -> AppearanceMode.Light
                "dark" -> AppearanceMode.Dark
                else -> AppearanceMode.System
            }
            _lockScreenFloor.value = saved.getString(LOCK_SCREEN_FLOOR) != "off"
            _consoleAppearance.value = when (saved.getString(CONSOLE_APPEARANCE)) { "light" -> AppearanceMode.Light; "dark" -> AppearanceMode.Dark; else -> AppearanceMode.System }
            _notifyUpdates.value = saved.getString(BackgroundCheck.UPDATES_PREF) != "off"
            _notifyAlerts.value = saved.getString(BackgroundCheck.ALERTS_PREF) != "off"
        }
    }

    private var uiStarted = false

    /** MainActivity: the signed-in user, their conferences and chats, and the update check on open. */
    fun startUi() {
        if (uiStarted) return
        uiStarted = true
        auth // start listening for the signed-in user at launch
        conferences
        messages
        chats
        online
        inbox
        scope.launch { runCatching { updates.checkIfDue() } }
    }
}
