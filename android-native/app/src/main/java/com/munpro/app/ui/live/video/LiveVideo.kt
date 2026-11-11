package com.munpro.app.ui.live.video

// Live MUN video on the phone: port of src/lib/agora/useAgoraLive.ts on the Agora Android SDK
// (Interactive Live Streaming, the web's `mode: "live"`).
//
// Everyone joins the committee's channel. The dais (organizer level, Executive Board in scope,
// the committee's chair tier) gets a publisher token and broadcasts camera + mic. Delegates join
// as ultra-low-latency audience and broadcast only while their uid is on `session.live.stage`
// (the chair gave them the floor). The token server is authoritative: a promotion re-asks it,
// and if it says subscriber the phone stays audience. An observer (App Admin ghost, watch-only
// viewers) never asks to be host at all, because a role switch after joining is what tells the
// room someone arrived.
//
// Identities: the token is minted for the Firebase uid as an Agora USER ACCOUNT. Remote users
// arrive as int uids; `onUserInfoUpdated` maps them back to accounts (= Firebase uids), which is
// how a tile knows it is France.

import android.content.Context
import android.view.View
import com.munpro.app.data.live.fetchVideoToken
import io.agora.rtc2.ChannelMediaOptions
import io.agora.rtc2.ClientRoleOptions
import io.agora.rtc2.Constants
import io.agora.rtc2.IRtcEngineEventHandler
import io.agora.rtc2.RtcEngine
import io.agora.rtc2.RtcEngineConfig
import io.agora.rtc2.UserInfo
import io.agora.rtc2.video.VideoCanvas
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** A remote broadcaster. Audience members are never reported in live mode. */
data class RemoteVideo(
    val uid: Int,
    /** The Firebase uid behind it, once Agora has told us (onUserInfoUpdated). */
    val account: String = "",
    val hasVideo: Boolean = false,
    val audioMuted: Boolean = false,
)

data class VideoRoom(
    val eventId: String,
    val committeeId: String,
    val dateStr: String,
    val myUid: String,
    /** "opening" / "closing": the event-wide ceremony channel instead of a sitting. */
    val ceremony: String? = null,
    /** Never broadcast, never switch role (ghost observer and watch-only viewers). */
    val observer: Boolean = false,
)

class LiveVideo(private val context: Context, val room: VideoRoom) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val mutex = Mutex()
    private var engine: RtcEngine? = null

    private val _joined = MutableStateFlow(false)
    val joined: StateFlow<Boolean> = _joined.asStateFlow()
    private val _connecting = MutableStateFlow(false)
    val connecting: StateFlow<Boolean> = _connecting.asStateFlow()
    private val _publishing = MutableStateFlow(false)
    val publishing: StateFlow<Boolean> = _publishing.asStateFlow()
    /** The token server's last answer: true may broadcast, false audience only, null not asked yet. */
    private val _hostGranted = MutableStateFlow<Boolean?>(null)
    val hostGranted: StateFlow<Boolean?> = _hostGranted.asStateFlow()
    private val _remotes = MutableStateFlow<List<RemoteVideo>>(emptyList())
    val remotes: StateFlow<List<RemoteVideo>> = _remotes.asStateFlow()
    private val _micOn = MutableStateFlow(true)
    val micOn: StateFlow<Boolean> = _micOn.asStateFlow()
    private val _camOn = MutableStateFlow(true)
    val camOn: StateFlow<Boolean> = _camOn.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    /** Intent: should this phone be broadcasting right now (dais by role, or on the stage)? */
    private var desired = false
    /** Intent we last acted on, so a missing camera doesn't read as "not broadcasting". */
    private var broadcasting = false
    private var hasCam = false
    private var hasMic = false
    private var backgrounded = false
    private var left = false

    private val handler = object : IRtcEngineEventHandler() {
        override fun onJoinChannelSuccess(channel: String?, uid: Int, elapsed: Int) {
            _joined.value = true
            _connecting.value = false
            scope.launch { applyPublishState() }
        }
        override fun onUserJoined(uid: Int, elapsed: Int) {
            upsert(uid) { it.copy(account = it.account.ifEmpty { accountOf(uid) }) }
        }
        override fun onUserInfoUpdated(uid: Int, userInfo: UserInfo?) {
            val acct = userInfo?.userAccount.orEmpty()
            if (acct.isNotEmpty()) upsert(uid) { it.copy(account = acct) }
        }
        override fun onUserOffline(uid: Int, reason: Int) {
            _remotes.update { list -> list.filterNot { it.uid == uid } }
        }
        override fun onRemoteVideoStateChanged(uid: Int, state: Int, reason: Int, elapsed: Int) {
            val on = state == Constants.REMOTE_VIDEO_STATE_DECODING || state == Constants.REMOTE_VIDEO_STATE_STARTING
            upsert(uid) { it.copy(hasVideo = on) }
        }
        override fun onUserMuteAudio(uid: Int, muted: Boolean) {
            upsert(uid) { it.copy(audioMuted = muted) }
        }
        override fun onTokenPrivilegeWillExpire(token: String?) {
            scope.launch {
                fetchVideoToken(room.eventId, room.committeeId, room.dateStr, room.ceremony)?.let { engine?.renewToken(it.token) }
            }
        }
        override fun onError(err: Int) {
            if (err == Constants.ERR_TOKEN_EXPIRED) _error.value = "The video pass expired. Leave and come back."
        }
    }

    private fun accountOf(uid: Int): String {
        val info = UserInfo()
        return if (engine?.getUserInfoByUid(uid, info) == 0) info.userAccount.orEmpty() else ""
    }

    private fun upsert(uid: Int, change: (RemoteVideo) -> RemoteVideo) {
        _remotes.update { list ->
            val i = list.indexOfFirst { it.uid == uid }
            if (i < 0) list + change(RemoteVideo(uid)) else list.toMutableList().also { it[i] = change(it[i]) }
        }
    }

    /** Join the room. [hasCamera]/[hasMicrophone] are the granted runtime permissions. */
    fun start(hasCamera: Boolean, hasMicrophone: Boolean) {
        hasCam = hasCamera; hasMic = hasMicrophone
        scope.launch {
            ENGINE_LOCK.withLock {
            mutex.withLock {
                if (engine != null || left) return@launch
                _connecting.value = true
                _error.value = null
                val tok = fetchVideoToken(room.eventId, room.committeeId, room.dateStr, room.ceremony)
                if (tok == null) {
                    _connecting.value = false
                    _error.value = "Live video isn't available here."
                    return@launch
                }
                if (left) return@launch
                // Captured outside apply{}: inside it `context` is RtcEngineConfig's own (null) getter.
                val appContext = context.applicationContext
                val e = try {
                    RtcEngine.create(RtcEngineConfig().apply {
                        mContext = appContext
                        mAppId = tok.appId
                        mEventHandler = handler
                        mChannelProfile = Constants.CHANNEL_PROFILE_LIVE_BROADCASTING
                    })
                } catch (ex: Throwable) {
                    android.util.Log.w("LiveVideo", "RtcEngine.create failed", ex)
                    _connecting.value = false
                    _error.value = "Couldn't start live video on this phone."
                    return@launch
                }
                engine = e
                e.enableVideo()
                val host = !room.observer && tok.publisher
                _hostGranted.value = host
                e.joinChannelWithUserAccount(tok.token, tok.channel, room.myUid, ChannelMediaOptions().apply {
                    channelProfile = Constants.CHANNEL_PROFILE_LIVE_BROADCASTING
                    clientRoleType = if (host) Constants.CLIENT_ROLE_BROADCASTER else Constants.CLIENT_ROLE_AUDIENCE
                    if (!host) audienceLatencyLevel = Constants.AUDIENCE_LATENCY_LEVEL_ULTRA_LOW_LATENCY
                    autoSubscribeAudio = true
                    autoSubscribeVideo = true
                    publishCameraTrack = false
                    publishMicrophoneTrack = false
                })
            }
            }
        }
    }

    /** The dais by role, or our uid on the stage. Observers never broadcast. */
    fun setDesired(amHost: Boolean, onStage: Boolean) {
        val want = !room.observer && (amHost || onStage)
        if (want == desired) return
        desired = want
        scope.launch { applyPublishState() }
    }

    /** Camera / mic permission came back from the system dialog. */
    fun permissionsChanged(hasCamera: Boolean, hasMicrophone: Boolean) {
        val changed = hasCamera != hasCam || hasMicrophone != hasMic
        hasCam = hasCamera; hasMic = hasMicrophone
        if (changed && broadcasting) scope.launch { mutex.withLock { publishTracks() } }
    }

    /** Serialized, converging on the latest intent (useAgoraLive.applyPublishState). */
    private suspend fun applyPublishState() {
        if (room.observer) return
        val before = broadcasting
        mutex.withLock {
            val e = engine ?: return
            if (!_joined.value || desired == broadcasting) return
            if (desired) {
                val tok = fetchVideoToken(room.eventId, room.committeeId, room.dateStr, room.ceremony) ?: return
                _hostGranted.value = tok.publisher
                if (!tok.publisher) return
                e.renewToken(tok.token)
                e.setClientRole(Constants.CLIENT_ROLE_BROADCASTER)
                broadcasting = true
                _error.value = null
                publishTracks()
            } else {
                broadcasting = false
                e.updateChannelMediaOptions(ChannelMediaOptions().apply {
                    publishCameraTrack = false
                    publishMicrophoneTrack = false
                    clientRoleType = Constants.CLIENT_ROLE_AUDIENCE
                    audienceLatencyLevel = Constants.AUDIENCE_LATENCY_LEVEL_ULTRA_LOW_LATENCY
                })
                e.stopPreview()
                _publishing.value = false
                _error.value = null
                fetchVideoToken(room.eventId, room.committeeId, room.dateStr, room.ceremony)?.let { e.renewToken(it.token) }
                e.setClientRole(Constants.CLIENT_ROLE_AUDIENCE, ClientRoleOptions().apply {
                    audienceLatencyLevel = Constants.AUDIENCE_LATENCY_LEVEL_ULTRA_LOW_LATENCY
                })
            }
        }
        // Converge only if THIS run made a transition and the intent has flipped again since.
        // A no-progress return (token said subscriber, not joined yet) must not retry, or it
        // would spin forever with the same inputs.
        if (broadcasting != before && desired != broadcasting && _joined.value) applyPublishState()
    }

    /** Publish whatever the permissions allow; a missing camera still lets the phone be heard. */
    private fun publishTracks() {
        val e = engine ?: return
        if (hasCam) e.startPreview()
        e.updateChannelMediaOptions(ChannelMediaOptions().apply {
            clientRoleType = Constants.CLIENT_ROLE_BROADCASTER
            publishCameraTrack = hasCam && !backgrounded
            publishMicrophoneTrack = hasMic && !backgrounded
        })
        _camOn.value = hasCam
        _micOn.value = hasMic
        _publishing.value = true
        _error.value = when {
            !hasCam && !hasMic -> "Camera and microphone are off for MUN Pilot. Allow them in Settings to be seen and heard."
            !hasCam -> "Camera is off for MUN Pilot, so you're on audio only."
            !hasMic -> "Microphone is off for MUN Pilot. Allow it in Settings to be heard."
            else -> null
        }
    }

    fun toggleMic() {
        val e = engine ?: return
        if (!_publishing.value || !hasMic) return
        val next = !_micOn.value
        e.muteLocalAudioStream(!next)
        _micOn.value = next
    }

    fun toggleCam() {
        val e = engine ?: return
        if (!_publishing.value || !hasCam) return
        val next = !_camOn.value
        e.enableLocalVideo(next)
        e.muteLocalVideoStream(!next)
        _camOn.value = next
    }

    /**
     * The app went to the background (or came back). A phone can't keep its camera in the
     * background and shouldn't keep a live mic either: both go quiet until it returns. Received
     * audio keeps playing.
     */
    fun setBackgrounded(value: Boolean) {
        if (backgrounded == value) return
        backgrounded = value
        val e = engine ?: return
        if (!_publishing.value) return
        e.updateChannelMediaOptions(ChannelMediaOptions().apply {
            publishCameraTrack = hasCam && !value && _camOn.value
            publishMicrophoneTrack = hasMic && !value
        })
        if (hasCam) { if (value) e.stopPreview() else e.startPreview() }
    }

    // The view each stream is drawn into. Releasing a tile only unbinds it if it is still the
    // current one: when the hero swaps, the new tile binds BEFORE the old one is released, and a
    // blind unbind would blank the stream that just moved.
    private val remoteViews = mutableMapOf<Int, View>()
    private var localView: View? = null

    fun bindRemote(uid: Int, view: View) {
        remoteViews[uid] = view
        engine?.setupRemoteVideo(VideoCanvas(view, Constants.RENDER_MODE_HIDDEN, uid))
    }

    fun unbindRemote(uid: Int, view: View) {
        if (remoteViews[uid] !== view) return
        remoteViews.remove(uid)
        engine?.setupRemoteVideo(VideoCanvas(null, Constants.RENDER_MODE_HIDDEN, uid))
    }

    fun bindLocal(view: View) {
        localView = view
        engine?.setupLocalVideo(VideoCanvas(view, Constants.RENDER_MODE_HIDDEN, 0))
    }

    fun unbindLocal(view: View) {
        if (localView !== view) return
        localView = null
        engine?.setupLocalVideo(VideoCanvas(null, Constants.RENDER_MODE_HIDDEN, 0))
    }

    /** Leave the channel and release the engine (there is one per process). */
    fun leave() {
        left = true
        val e = engine
        engine = null
        _joined.value = false
        _publishing.value = false
        _remotes.value = emptyList()
        scope.cancel()
        if (e != null) {
            // Off the main thread (destroy blocks), and under the same lock a new screen's
            // start() takes, so the next engine is never created while this one is going away.
            RELEASE_SCOPE.launch {
                ENGINE_LOCK.withLock {
                    runCatching { e.stopPreview(); e.leaveChannel() }
                    runCatching { RtcEngine.destroy() }
                }
            }
        }
    }

    private companion object {
        /** RtcEngine is one per process: create and destroy never overlap. */
        val ENGINE_LOCK = Mutex()
        val RELEASE_SCOPE = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    }
}
