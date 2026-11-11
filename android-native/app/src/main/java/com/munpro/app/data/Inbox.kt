package com.munpro.app.data

// The bell's three kinds (board A1.5–A1.9; web contexts/NotificationsContext.tsx): Updates (the
// `notifications` collection), staff Invitations (staff docs addressed to this email, still
// "invited") and Room alerts (each approved committee's `notifications`, until they expire).
//
// One store for the whole app, so the bell count is the same on every screen and a new room alert
// can drop in over whatever is showing. Updates only listen while a screen shows them; invitations
// and alerts listen while the app runs, as on the web dashboard.

import com.google.firebase.Timestamp
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.munpro.app.AppGraph
import com.munpro.app.domain.AppNotification
import com.munpro.app.domain.RoomAlert
import com.munpro.app.domain.StaffInvite
import com.munpro.app.domain.committeeOf
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@OptIn(ExperimentalCoroutinesApi::class)
class Inbox(private val auth: AuthRepo, private val conferences: ConferencesStore, private val content: ContentRepo, private val saved: Saved, private val scope: CoroutineScope) {
    private val db = FirebaseFirestore.getInstance()
    /** Only alerts created after this (less the web's 10 s grace) drop in as a banner. */
    private val started = System.currentTimeMillis()

    private val uid = auth.state.map { (it as? AuthState.SignedIn)?.user?.uid }.distinctUntilChanged()

    /** Updates, newest first; null until the first answer. */
    val updates: StateFlow<List<AppNotification>?> = uid
        .flatMapLatest { u -> if (u == null) flowOf(emptyList()) else content.myNotifications(u) }
        .stateIn(scope, SharingStarted.WhileSubscribed(5_000), null)

    private val _invites = MutableStateFlow<List<StaffInvite>?>(null)
    val invites: StateFlow<List<StaffInvite>?> = _invites.asStateFlow()

    private val _alerts = MutableStateFlow<List<RoomAlert>>(emptyList())
    val alerts: StateFlow<List<RoomAlert>> = _alerts.asStateFlow()

    /** Room alerts seen in the Alerts list (the web keeps the same set in localStorage). */
    private val _alertsRead = MutableStateFlow<Set<String>>(emptySet())
    val alertsRead: StateFlow<Set<String>> = _alertsRead.asStateFlow()

    private val _banner = MutableSharedFlow<RoomAlert>(extraBufferCapacity = 8)
    /** A room alert that just arrived, for the banner over any screen. */
    val banner: SharedFlow<RoomAlert> = _banner.asSharedFlow()

    /**
     * A new update (an allocation, a migration, an approval) means the user's conferences changed
     * on the server: reload them now instead of waiting out the saved copy's window.
     */
    private var newestUpdate: Long? = null

    /** The bell: every pending invitation, unread update and unread room alert (web unreadCount). */
    val unread: StateFlow<Int> = combine(updates, invites, alerts, alertsRead) { u, i, a, r ->
        i.orEmpty().size + a.count { it.id !in r } + u.orEmpty().count { !it.read }
    }.stateIn(scope, SharingStarted.WhileSubscribed(5_000), 0)

    private var inviteRegs: List<ListenerRegistration> = emptyList()
    private val inviteDocs = HashMap<String, List<com.google.firebase.firestore.DocumentSnapshot>>()
    private val titles = HashMap<String, String>()
    private var alertRegs: Map<String, ListenerRegistration> = emptyMap()
    private val alertsBy = HashMap<String, List<RoomAlert>>()
    private val bannered = HashSet<String>()

    init {
        scope.launch {
            auth.state.map { (it as? AuthState.SignedIn)?.user }.distinctUntilChanged { a, b -> a?.uid == b?.uid }.collect { u ->
                watchInvites(u?.email)
                _alertsRead.value = u?.let { saved.read(readKey(it.uid), ListSerializer(String.serializer()))?.toSet() }.orEmpty()
            }
        }
        scope.launch {
            updates.collect { list ->
                val newest = list?.maxOfOrNull { it.createdAt ?: 0L } ?: return@collect
                val before = newestUpdate
                newestUpdate = newest
                if (before != null && newest > before) conferences.reload()
            }
        }
        // Approved seats with a committee, read the way the web conference portal reads it
        // (assignedCommittee, else the committee applied to: allocation writes only the country).
        // Faculty advisors get no room bell there either.
        scope.launch {
            conferences.state
                .map { s -> s.conferences.orEmpty()
                    .filter { it.app.status == "approved" && !it.app.role.contains("faculty", ignoreCase = true) && committeeOf(it.app).isNotEmpty() }
                    .map { Triple(it.event.id, committeeOf(it.app), it.event.title) }.distinct() }
                .distinctUntilChanged()
                .collect(::watchAlerts)
        }
    }

    private fun readKey(uid: String) = "room_notifs_read_$uid"

    // ---- invitations ---------------------------------------------------------------------------

    private fun watchInvites(email: String?) {
        inviteRegs.forEach { it.remove() }
        inviteRegs = emptyList()
        inviteDocs.clear()
        if (email.isNullOrEmpty()) { _invites.value = emptyList(); return }
        // The raw auth email and its normalized form, so a casing mismatch on the invite can't hide it.
        val emails = linkedSetOf(email, email.trim().lowercase())
        inviteRegs = emails.map { e ->
            db.collectionGroup("staff").whereEqualTo("email", e).addSnapshotListener { snap, err ->
                inviteDocs[e] = if (err != null || snap == null) emptyList() else snap.documents
                scope.launch { rebuildInvites() }
            }
        }
    }

    private suspend fun rebuildInvites() {
        val seen = HashSet<String>()
        val list = mutableListOf<StaffInvite>()
        for (d in inviteDocs.values.flatten()) {
            if (!seen.add(d.reference.path) || d.getString("inviteStatus") != "invited") continue
            val eventId = d.reference.path.split("/")[1]
            list += StaffInvite(
                id = d.id, path = d.reference.path, eventId = eventId, eventTitle = titleOf(eventId),
                role = d.getString("role").orEmpty(), committeeId = d.getString("committeeId").orEmpty(),
                isRoleUpdate = d.getBoolean("isRoleUpdate") == true, previousRole = d.getString("previousRole"),
                raw = d.data.orEmpty(),
            )
        }
        _invites.value = list
    }

    /** Draft events aren't readable before accepting: the web's default title then. */
    private suspend fun titleOf(eventId: String): String =
        titles[eventId] ?: (AppGraph.events.getEventById(eventId)?.title?.ifEmpty { null } ?: "MUN Conference").also { titles[eventId] = it }

    /**
     * Accept (web handleAcceptInvite): one batch deletes the invite and writes the user's own
     * staff doc as a copy of it (the create rule checks `sourceId` against the invite), then the
     * membership recompute and the organizer's "accepted" notice. Throws when the write fails.
     */
    suspend fun accept(inv: StaffInvite) {
        val user = auth.user ?: return
        val raw = inv.raw
        val batch = db.batch()
        batch.delete(db.document(inv.path))
        batch.set(
            db.collection("events").document(inv.eventId).collection("staff").document(user.uid),
            buildMap {
                put("uid", user.uid)
                put("email", raw["email"])
                put("name", user.displayName?.ifEmpty { null } ?: (raw["name"] as? String)?.ifEmpty { null } ?: "Staff Member")
                put("role", inv.role)
                put("committeeId", inv.committeeId.ifEmpty { null })
                put("permissions", raw["permissions"] ?: emptyMap<String, Any>())
                // Rebuilt from the invite, so every organizer-set flag is carried over explicitly.
                if (raw["delegatePower"] == true) put("delegatePower", true)
                put("inviteStatus", "accepted")
                put("sourceId", inv.id)
                put("addedAt", raw["addedAt"] ?: FieldValue.serverTimestamp())
            },
        )
        batch.commit().await()
        _invites.value = _invites.value.orEmpty().filter { it.path != inv.path }
        // Best-effort, like the web: neither may undo the acceptance.
        scope.launch {
            Membership.refresh(user.uid, inv.eventId)
            saved.remove("sessionSeats:${user.uid}")
            Api.call("/api/notify/staff-accepted", "POST", buildJsonObject { put("eventId", inv.eventId) }.toString())
            conferences.reload()
        }
    }

    /** Decline (web handleRejectInvite): a declined role change keeps the previous role and access. */
    suspend fun decline(inv: StaffInvite) {
        val ref = db.document(inv.path)
        if (inv.isRoleUpdate && !inv.previousRole.isNullOrEmpty()) {
            ref.update(
                mapOf(
                    "role" to inv.previousRole,
                    "permissions" to (inv.raw["previousPermissions"] ?: emptyMap<String, Any>()),
                    "inviteStatus" to "accepted",
                    "isRoleUpdate" to false,
                    "previousRole" to null,
                    "previousPermissions" to null,
                ),
            ).await()
        } else {
            ref.update("inviteStatus", "rejected").await()
        }
        _invites.value = _invites.value.orEmpty().filter { it.path != inv.path }
    }

    // ---- room alerts ---------------------------------------------------------------------------

    private fun watchAlerts(committees: List<Triple<String, String, String>>) {
        val keys = committees.associateBy { "${it.first}__${it.second}" }
        alertRegs.filterKeys { it !in keys }.values.forEach { it.remove() }
        alertsBy.keys.retainAll(keys.keys)
        alertRegs = keys.mapValues { (k, t) ->
            alertRegs[k] ?: db.collection("events").document(t.first).collection("committees").document(t.second).collection("notifications")
                .whereGreaterThan("expiresAt", Timestamp.now())
                .addSnapshotListener { snap, err ->
                    if (err != null || snap == null) return@addSnapshotListener
                    val list = snap.documents.map { d ->
                        val j = d.toJson()
                        RoomAlert(
                            id = d.id, message = d.getString("message").orEmpty(), type = d.getString("type") ?: "info",
                            createdAt = millisOf(j?.get("createdAt")), expiresAt = millisOf(j?.get("expiresAt")),
                            eventId = t.first, committeeId = t.second, eventTitle = t.third,
                        )
                    }
                    alertsBy[k] = list
                    for (a in list) {
                        if (!bannered.add(a.id)) continue
                        if ((a.createdAt ?: System.currentTimeMillis()) > started - 10_000) _banner.tryEmit(a)
                    }
                    publishAlerts()
                }
        }
        publishAlerts()
    }

    private fun publishAlerts() {
        _alerts.value = alertsBy.values.flatten().sortedByDescending { it.createdAt ?: Long.MAX_VALUE }
    }

    /** Opening the Alerts list reads them all (web markRoomNotifsRead). */
    fun markAlertsRead() {
        val u = auth.user?.uid ?: return
        val next = _alertsRead.value + _alerts.value.map { it.id }
        if (next == _alertsRead.value) return
        _alertsRead.value = next
        scope.launch { saved.write(readKey(u), ListSerializer(String.serializer()), next.toList()) }
    }
}
