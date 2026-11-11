package com.munpro.app.ui.live.video

// The live video stage on a phone (the web's LiveVideoRoom, reduced to what fits a phone): one
// hero tile for whoever has the floor, a filmstrip of the other broadcasters (the dais), your own
// preview while you're on air, and mic / camera toggles. Always dark, like the web stage.

import android.Manifest
import android.content.pm.PackageManager
import android.view.TextureView
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.munpro.app.ui.kit.Icons
import com.munpro.app.ui.kit.SfIcon
import com.munpro.app.ui.kit.Type
import com.munpro.app.ui.kit.rememberPress
import com.munpro.app.ui.kit.tap

private val StageBg = Color(0xFF0B1219) // the stage token: dark in both themes
private val TileBg = Color(0xFF0B1219)
private val Ink = Color.White
private val Ink2 = Color(0xB3FFFFFF)

/**
 * The engine for [room] while this screen shows it. Joins once, follows [amHost] / [onStage]
 * (promote / demote), leaves on [ended] or when the screen goes, goes quiet in the background,
 * and asks for camera + mic the first time this phone is about to broadcast.
 */
@Composable
fun rememberLiveVideo(room: VideoRoom?, amHost: Boolean, onStage: Boolean, ended: Boolean): LiveVideo? {
    val context = LocalContext.current
    fun granted(p: String) = ContextCompat.checkSelfPermission(context, p) == PackageManager.PERMISSION_GRANTED
    val active = room != null && !ended
    val video = remember(room, active) { if (active) LiveVideo(context, room!!) else null }
    DisposableEffect(video) {
        video?.start(granted(Manifest.permission.CAMERA), granted(Manifest.permission.RECORD_AUDIO))
        onDispose { video?.leave() }
    }

    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        video?.permissionsChanged(granted(Manifest.permission.CAMERA), granted(Manifest.permission.RECORD_AUDIO))
    }
    val wantsAir = video != null && room?.observer == false && (amHost || onStage)
    var asked by remember(video) { mutableStateOf(false) }
    LaunchedEffect(wantsAir) {
        if (wantsAir && !asked && !(granted(Manifest.permission.CAMERA) && granted(Manifest.permission.RECORD_AUDIO))) {
            asked = true
            ask.launch(arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO))
        }
    }
    LaunchedEffect(video, amHost, onStage) { video?.setDesired(amHost, onStage) }

    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner, video) {
        val obs = LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_STOP -> video?.setBackgrounded(true)
                Lifecycle.Event.ON_START -> video?.setBackgrounded(false)
                else -> Unit
            }
        }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs) }
    }
    return video
}

/**
 * [focus] = the Firebase uid whose video should be the hero (the floor holder, else the one on
 * the stage). [label] names a uid ("France", "Chair"). [me] is this phone's uid.
 */
@Composable
fun VideoStage(
    video: LiveVideo, focus: String?, me: String, label: (String) -> String,
    modifier: Modifier = Modifier, presence: List<com.munpro.app.ui.live.PresenceEvent> = emptyList(),
    /** Controls drawn over the hero tile (the chair's "Room sees … / Put on air", board 05). */
    overlay: (@Composable androidx.compose.foundation.layout.BoxScope.() -> Unit)? = null,
) {
    val remotes by video.remotes.collectAsState()
    val joined by video.joined.collectAsState()
    val connecting by video.connecting.collectAsState()
    val publishing by video.publishing.collectAsState()
    val camOn by video.camOn.collectAsState()
    val micOn by video.micOn.collectAsState()
    val error by video.error.collectAsState()

    val withVideo = remotes.filter { it.hasVideo }
    val hero = withVideo.firstOrNull { focus != null && it.account == focus } ?: withVideo.firstOrNull()
    val strip = withVideo.filter { it.uid != hero?.uid }
    val selfHero = hero == null && publishing && camOn

    Column(modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(StageBg), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.fillMaxWidth().aspectRatio(16f / 10f).background(TileBg)) {
            when {
                hero != null -> {
                    RemoteSurface(video, hero.uid, Modifier.fillMaxSize())
                    NameTag(label(hero.account), hero.audioMuted, Modifier.align(Alignment.BottomStart))
                }
                selfHero -> {
                    LocalSurface(video, Modifier.fillMaxSize())
                    NameTag("You", !micOn, Modifier.align(Alignment.BottomStart))
                }
                else -> Centered(
                    when {
                        error != null && !joined -> error!!
                        connecting || !joined -> "Connecting to the room…"
                        else -> "No one is on camera right now."
                    },
                )
            }
            com.munpro.app.ui.live.PresencePills(presence, Modifier.align(Alignment.TopStart).padding(top = if (overlay != null) 44.dp else 0.dp))
            overlay?.invoke(this)
            // Your own preview in the corner while someone else holds the hero tile.
            if (publishing && camOn && !selfHero) {
                Box(Modifier.align(Alignment.TopEnd).padding(8.dp).size(84.dp, 112.dp).clip(RoundedCornerShape(12.dp)).background(TileBg)) {
                    LocalSurface(video, Modifier.fillMaxSize())
                }
            }
        }
        if (strip.isNotEmpty()) {
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                strip.forEach { r ->
                    Box(Modifier.size(96.dp, 72.dp).clip(RoundedCornerShape(10.dp)).background(TileBg)) {
                        RemoteSurface(video, r.uid, Modifier.fillMaxSize())
                        Text(label(r.account), style = Type.caption, color = Ink, modifier = Modifier.align(Alignment.BottomStart).padding(5.dp))
                    }
                }
            }
        }
        if (publishing) OnAirControls(video)
        val err = error
        if (err != null && joined) Text(err, style = Type.footnote, color = Color(0xFFFFC266), textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp))
    }
}

@Composable
private fun OnAirControls(video: LiveVideo) {
    val micOn by video.micOn.collectAsState()
    val camOn by video.camOn.collectAsState()
    Row(Modifier.fillMaxWidth().padding(start = 14.dp, end = 10.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(Color(0xFFFF453A)))
        Text("You're on air", style = Type.subhead.copy(fontWeight = FontWeight.SemiBold), color = Ink, modifier = Modifier.weight(1f))
        StageButton(if (micOn) Icons.mic else Icons.micOff, if (micOn) "Mute" else "Unmute", danger = !micOn) { video.toggleMic() }
        StageButton(if (camOn) Icons.video else Icons.videoOff, if (camOn) "Turn off camera" else "Turn on camera", danger = !camOn) { video.toggleCam() }
    }
}

@Composable
private fun StageButton(icon: com.munpro.app.ui.kit.SfIconSpec, label: String, danger: Boolean, onClick: () -> Unit) {
    val press = rememberPress()
    Box(
        Modifier.size(40.dp).clip(CircleShape).background(if (danger) Color(0xFFFF453A) else Color(0x33FFFFFF)).tap(press, label = label, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { SfIcon(icon, Ink, 20.dp) }
}

@Composable
private fun NameTag(name: String, muted: Boolean, modifier: Modifier) {
    Row(modifier.padding(10.dp).clip(RoundedCornerShape(12.dp)).background(Color(0x99000000)).padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        if (muted) SfIcon(Icons.micOff, Color(0xFFFF6961), 13.dp)
        Text(name, style = Type.footnote.copy(fontWeight = FontWeight.SemiBold), color = Ink)
    }
}

@Composable
private fun BoxScope.Centered(text: String) {
    Text(text, style = Type.subhead, color = Ink2, textAlign = TextAlign.Center, modifier = Modifier.align(Alignment.Center).padding(24.dp))
}

@Composable
private fun RemoteSurface(video: LiveVideo, uid: Int, modifier: Modifier) {
    // Keyed by uid: a different broadcaster gets a fresh view, bound once.
    key(uid) {
        AndroidView(
            factory = { ctx -> TextureView(ctx).also { video.bindRemote(uid, it) } },
            onRelease = { video.unbindRemote(uid, it) },
            modifier = modifier,
        )
    }
}

@Composable
private fun LocalSurface(video: LiveVideo, modifier: Modifier) {
    AndroidView(
        factory = { ctx -> TextureView(ctx).also { video.bindLocal(it) } },
        onRelease = { video.unbindLocal(it) },
        modifier = modifier,
    )
}
