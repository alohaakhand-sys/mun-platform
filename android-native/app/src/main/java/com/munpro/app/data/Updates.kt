package com.munpro.app.data

// In-app updates. tools/release.mjs publishes each release to the Cloudflare R2 bucket as
// android/latest.json plus one APK per ABI. The phone reads that manifest (straight from the
// bucket, else the website's mirror at /api/app/latest), downloads the APK for its ABI, checks the
// SHA-256 and hands it to the system installer. Android keeps the app's data across the update;
// the APK must be signed with the same key as the installed app or the system refuses it.
//
// The changelog the app ships with (assets/changelog.json, also the source of versionCode and
// versionName in build.gradle.kts) is merged with the manifest's, so Settings -> What's New also
// shows what a pending update brings.

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import com.munpro.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

@Serializable
data class ReleaseApk(val url: String = "", val sha256: String = "", val size: Long = 0)

@Serializable
data class ChangelogEntry(
    val versionCode: Int = 0,
    val versionName: String = "",
    val date: String = "",
    val notes: List<String> = emptyList(),
)

@Serializable
data class Release(
    val versionCode: Int = 0,
    val versionName: String = "",
    val publishedAt: String = "",
    val minSdk: Int = 0,
    val apks: Map<String, ReleaseApk> = emptyMap(),
    val changelog: List<ChangelogEntry> = emptyList(),
)

sealed interface UpdateState {
    data object Idle : UpdateState
    data object Checking : UpdateState
    data class Current(val checkedAt: Long) : UpdateState
    data class Available(val release: Release, val apk: ReleaseApk) : UpdateState
    data class Downloading(val release: Release, val progress: Float) : UpdateState
    data class Ready(val release: Release, val file: File) : UpdateState
    /** The system installer has it; the app is replaced (and closed) when the user confirms. */
    data class Installing(val release: Release) : UpdateState
    data class Failed(val message: String, val release: Release? = null) : UpdateState
}

class Updates(private val context: Context, private val saved: Saved) {
    val installedCode: Int = BuildConfig.VERSION_CODE
    val installedName: String = BuildConfig.VERSION_NAME

    private val _state = MutableStateFlow<UpdateState>(UpdateState.Idle)
    val state: StateFlow<UpdateState> = _state.asStateFlow()

    private val bundled: List<ChangelogEntry> by lazy {
        runCatching {
            val raw = context.assets.open("changelog.json").bufferedReader().use { it.readText() }
            MunJson.decodeFromString(ListSerializer(ChangelogEntry.serializer()), raw)
        }.getOrDefault(emptyList())
    }
    private val _changelog = MutableStateFlow<List<ChangelogEntry>>(emptyList())
    /** Every version, newest first: the bundled notes plus any newer ones from the manifest. */
    val changelog: StateFlow<List<ChangelogEntry>> = _changelog.asStateFlow()

    private val lock = Mutex()
    private val dir get() = File(context.cacheDir, "updates").apply { mkdirs() }

    init {
        _changelog.value = bundled.sortedByDescending { it.versionCode }
    }

    /**
     * Opening the app: asks the server only if nobody (this or the 15-minute background check)
     * asked in the last [gapMs]; otherwise answers from the last manifest saved on the phone, so
     * opening the app again and again doesn't hit the server again and again.
     */
    suspend fun checkIfDue(gapMs: Long = CHECK_GAP_MS): Release? {
        val last = saved.getString(CHECKED_AT)?.toLongOrNull() ?: 0L
        if (System.currentTimeMillis() - last >= gapMs) return check()
        val release = saved.getString(LAST_RELEASE)?.let { raw -> runCatching { MunJson.decodeFromString(Release.serializer(), raw) }.getOrNull() }
            ?: return null
        return lock.withLock {
            if (_state.value !is UpdateState.Idle && _state.value !is UpdateState.Current) return@withLock null
            mergeChangelog(release.changelog)
            applyRelease(release, last)
        }
    }

    /** "Later" on the update prompt: not again for this version for [SNOOZE_MS]. */
    suspend fun snooze(release: Release) {
        saved.putString(SNOOZED, "${release.versionCode}:${System.currentTimeMillis()}")
    }

    /** Whether to show the update prompt for [release] now (not snoozed). */
    suspend fun shouldPrompt(release: Release): Boolean {
        val (code, at) = saved.getString(SNOOZED)?.split(":")?.let { it.getOrNull(0)?.toIntOrNull() to it.getOrNull(1)?.toLongOrNull() } ?: (null to null)
        return code != release.versionCode || at == null || System.currentTimeMillis() - at >= SNOOZE_MS
    }

    /** Fetches the manifest and returns the release if it is newer than this app and fits this phone. */
    suspend fun check(): Release? = lock.withLock {
        val busy = _state.value
        if (busy is UpdateState.Downloading || busy is UpdateState.Installing) return (busy as? UpdateState.Downloading)?.release
        _state.value = UpdateState.Checking
        // A failed try counts too: a server that's down isn't asked again on every app open.
        val now = System.currentTimeMillis()
        saved.putString(CHECKED_AT, now.toString())
        val release = fetchLatest()
        if (release == null) {
            _state.value = UpdateState.Failed("Couldn't reach the update server. Check your connection and try again.")
            return null
        }
        saved.putString(LAST_RELEASE, MunJson.encodeToString(Release.serializer(), release))
        mergeChangelog(release.changelog)
        val newer = applyRelease(release, now)
        cleanup(newer?.versionCode)
        newer
    }

    /** Sets the state for a known manifest; the release if it's an update for this phone. */
    private fun applyRelease(release: Release, checkedAt: Long): Release? {
        val apk = apkFor(release)
        val newer = release.versionCode > installedCode && apk != null && Build.VERSION.SDK_INT >= release.minSdk
        _state.value = when {
            !newer -> UpdateState.Current(checkedAt)
            else -> readyFile(release, apk)?.let { UpdateState.Ready(release, it) } ?: UpdateState.Available(release, apk)
        }
        return if (newer) release else null
    }

    /** Downloads the APK for this phone, verifying its SHA-256. */
    suspend fun download() {
        val (release, apk) = when (val s = _state.value) {
            is UpdateState.Available -> s.release to s.apk
            is UpdateState.Failed -> (s.release ?: return).let { r -> r to (apkFor(r) ?: return) }
            else -> return
        }
        _state.value = UpdateState.Downloading(release, 0f)
        val target = fileFor(release)
        val part = File(dir, target.name + ".part")
        val result = withContext(Dispatchers.IO) {
            runCatching {
                val conn = (URL(apk.url).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 15000
                    readTimeout = 30000
                }
                try {
                    if (conn.responseCode !in 200..299) error("HTTP ${conn.responseCode}")
                    val total = conn.contentLengthLong.takeIf { it > 0 } ?: apk.size
                    val digest = MessageDigest.getInstance("SHA-256")
                    var read = 0L
                    var lastShown = 0f
                    conn.inputStream.use { input ->
                        part.outputStream().use { out ->
                            val buf = ByteArray(64 * 1024)
                            while (true) {
                                val n = input.read(buf)
                                if (n < 0) break
                                out.write(buf, 0, n)
                                digest.update(buf, 0, n)
                                read += n
                                val p = if (total > 0) read.toFloat() / total else 0f
                                if (p - lastShown >= 0.01f) { lastShown = p; _state.value = UpdateState.Downloading(release, p) }
                            }
                        }
                    }
                    val sha = digest.digest().joinToString("") { "%02x".format(it) }
                    if (apk.sha256.isNotEmpty() && !sha.equals(apk.sha256, ignoreCase = true)) {
                        part.delete()
                        error("The download was damaged. Try again.")
                    }
                    target.delete()
                    if (!part.renameTo(target)) error("Couldn't save the update.")
                    target
                } finally {
                    conn.disconnect()
                }
            }
        }
        _state.value = result.fold(
            onSuccess = { UpdateState.Ready(release, it) },
            onFailure = { part.delete(); UpdateState.Failed(it.message?.takeIf { m -> !m.startsWith("HTTP") } ?: "The download failed. Try again.", release) },
        )
    }

    /** Whether Android lets this app install APKs (Settings -> Install unknown apps). */
    fun canInstall(): Boolean = context.packageManager.canRequestPackageInstalls()

    /** Hands the downloaded APK to the system installer; [UpdateInstallReceiver] gets the outcome. */
    suspend fun install() {
        val s = _state.value as? UpdateState.Ready ?: return
        val result = withContext(Dispatchers.IO) {
            runCatching {
                val installer = context.packageManager.packageInstaller
                val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
                    setAppPackageName(context.packageName)
                    setSize(s.file.length())
                    // Once this app installed itself, Android 12+ may update it without asking again.
                    if (Build.VERSION.SDK_INT >= 31) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
                }
                val id = installer.createSession(params)
                installer.openSession(id).use { session ->
                    s.file.inputStream().use { input ->
                        session.openWrite("munpilot.apk", 0, s.file.length()).use { out ->
                            input.copyTo(out)
                            session.fsync(out)
                        }
                    }
                    val status = PendingIntent.getBroadcast(
                        context, id,
                        Intent(context, UpdateInstallReceiver::class.java).setPackage(context.packageName),
                        // Mutable: the installer adds the status and the confirmation intent.
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
                    )
                    session.commit(status.intentSender)
                }
            }
        }
        _state.value = result.fold(
            onSuccess = { UpdateState.Installing(s.release) },
            onFailure = { UpdateState.Failed("Couldn't start the install. Try again.", s.release) },
        )
    }

    /** From [UpdateInstallReceiver]: the user cancelled, or the system refused the APK. */
    internal fun installFinished(ok: Boolean, message: String?) {
        val release = (_state.value as? UpdateState.Installing)?.release ?: return
        if (ok) return // the app is being replaced
        val file = fileFor(release)
        _state.value = if (message == null && file.exists()) UpdateState.Ready(release, file)
        else UpdateState.Failed(message ?: "The update wasn't installed.", release)
    }

    private companion object {
        const val CHECKED_AT = "munpro.update.checkedAt"
        const val LAST_RELEASE = "munpro.update.lastRelease"
        const val SNOOZED = "munpro.update.snoozed"
        /** Opening the app asks the server at most this often (the background check runs every 15). */
        const val CHECK_GAP_MS = 30 * 60_000L
        const val SNOOZE_MS = 12 * 60 * 60_000L
    }

    /** The download size of [r]'s APK for this phone, 0 if unknown. */
    fun sizeFor(r: Release): Long = apkFor(r)?.size ?: 0L

    private fun apkFor(r: Release): ReleaseApk? =
        Build.SUPPORTED_ABIS.firstNotNullOfOrNull { r.apks[it]?.takeIf { a -> a.url.isNotEmpty() } }

    private fun fileFor(r: Release) = File(dir, "munpilot-${r.versionCode}.apk")

    /** A finished download of this release, kept between checks so it isn't fetched twice. */
    private fun readyFile(r: Release, apk: ReleaseApk): File? =
        fileFor(r).takeIf { it.exists() && (apk.size <= 0 || it.length() == apk.size) }

    /** Drops downloads other than [keep] (installed or superseded releases). */
    private fun cleanup(keep: Int?) {
        dir.listFiles()?.forEach { if (keep == null || !it.name.startsWith("munpilot-$keep.apk")) it.delete() }
    }

    private fun mergeChangelog(remote: List<ChangelogEntry>) {
        val byCode = (bundled + remote).associateBy { it.versionCode } // the manifest wins a clash
        _changelog.value = byCode.values.sortedByDescending { it.versionCode }
    }

    private suspend fun fetchLatest(): Release? = withContext(Dispatchers.IO) {
        listOfNotNull(
            BuildConfig.UPDATE_BASE_URL.takeIf { it.isNotEmpty() }?.let { "$it/android/latest.json" },
            Api.base.takeIf { it.isNotEmpty() }?.let { "$it/api/app/latest" },
        ).firstNotNullOfOrNull { url -> runCatching { get(url) }.getOrNull() }
    }

    private fun get(url: String): Release? {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 10000
            readTimeout = 15000
            useCaches = false
            setRequestProperty("Cache-Control", "no-cache")
        }
        try {
            if (conn.responseCode !in 200..299) return null
            val text = conn.inputStream.bufferedReader().use { it.readText() }
            return MunJson.decodeFromString(Release.serializer(), text).takeIf { it.versionCode > 0 }
        } finally {
            conn.disconnect()
        }
    }
}
