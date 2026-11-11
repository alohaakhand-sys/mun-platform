package com.munpro.app.data

// Signed-in user + their `users/{uid}` profile, the same pair the web's AuthContext exposes
// (port of mobile/src/lib/auth.tsx). One snapshot listener on the profile doc; nothing polls.

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.auth.GoogleAuthProvider
import com.munpro.app.BuildConfig
import com.google.firebase.FirebaseTooManyRequestsException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthException
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.userProfileChangeRequest
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.Serializable
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

@Serializable
data class Profile(
    val firstName: String? = null,
    val lastName: String? = null,
    val email: String? = null,
    val dob: String? = null,
    val phoneNumber: String? = null,
    val photoURL: String? = null,
    val displayName: String? = null,
    val role: String? = null,
    val onboardingComplete: Boolean? = null,
    // What the profile-strength bar checks (web ProfileView computeStrength) and Home's
    // recommendations read (address.country).
    val coverURL: String? = null,
    val headline: String? = null,
    val bio: String? = null,
    val city: String? = null,
    val country: String? = null,
    val nationality: String? = null,
    val skills: List<kotlinx.serialization.json.JsonElement>? = null,
    val experience: List<kotlinx.serialization.json.JsonElement>? = null,
    val education: List<kotlinx.serialization.json.JsonElement>? = null,
    val instagram: String? = null,
    val linkedin: String? = null,
    val tiktok: String? = null,
    val address: Address? = null,
    /** MUN Pilot Pro organizer membership: none | pending | active | rejected. */
    val proStatus: String? = null,
) {
    @Serializable
    data class Address(val country: String? = null)

    val fullName: String get() = listOfNotNull(firstName?.ifBlank { null }, lastName?.ifBlank { null }).joinToString(" ")
}

sealed interface AuthState {
    /** Until both the auth state and (when signed in) the profile have arrived. */
    data object Loading : AuthState
    data object SignedOut : AuthState
    data class SignedIn(val user: FirebaseUser, val profile: Profile?) : AuthState {
        val onboarded: Boolean get() = profile?.onboardingComplete == true
    }
}

class AuthRepo(private val saved: Saved) {
    private val auth = FirebaseAuth.getInstance()
    private val db = FirebaseFirestore.getInstance()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val _state = MutableStateFlow<AuthState>(AuthState.Loading)
    val state: StateFlow<AuthState> = _state.asStateFlow()

    val user: FirebaseUser? get() = auth.currentUser
    val profile: Profile? get() = (state.value as? AuthState.SignedIn)?.profile

    private var profileListener: ListenerRegistration? = null
    private var watching: String? = null

    init {
        auth.addAuthStateListener { fa ->
            val u = fa.currentUser
            if (u == null) {
                stopProfile()
                _state.value = AuthState.SignedOut
            } else if (watching != u.uid) {
                watchProfile(u)
            }
        }
    }

    private fun stopProfile() {
        profileListener?.remove()
        profileListener = null
        contactListener?.remove()
        contactListener = null
        _contact.value = null
        watching = null
    }

    // Your own email and phone (users/{uid}/private/contact): they no longer ride on the profile doc.
    private val _contact = MutableStateFlow<com.munpro.app.domain.UserContact?>(null)
    val contact: StateFlow<com.munpro.app.domain.UserContact?> = _contact.asStateFlow()
    private var contactListener: ListenerRegistration? = null

    private fun watchContact(u: FirebaseUser) {
        contactListener?.remove()
        contactListener = db.collection("users").document(u.uid).collection("private").document("contact")
            .addSnapshotListener { snap, _ -> if (watching == u.uid && snap != null) _contact.value = snap.decode<com.munpro.app.domain.UserContact>() ?: com.munpro.app.domain.UserContact() }
    }

    /** Your email / phone, written only to the private contact doc. */
    suspend fun saveContact(email: String? = null, phoneNumber: String? = null) {
        val u = auth.currentUser ?: throw IllegalStateException("Not signed in.")
        val fields = buildMap<String, Any> {
            email?.let { put("email", it.trim()) }
            phoneNumber?.let { put("phoneNumber", it.trim()) }
            put("updatedAt", com.google.firebase.firestore.FieldValue.serverTimestamp())
        }
        db.collection("users").document(u.uid).collection("private").document("contact").set(fields, SetOptions.merge()).await()
    }

    private fun watchProfile(u: FirebaseUser) {
        stopProfile()
        watching = u.uid
        watchContact(u)
        _state.value = AuthState.Loading
        val key = "profile:${u.uid}"
        var fromServer = false
        var savedCopy: Profile? = null
        var savedLoaded = false
        scope.launch {
            savedCopy = saved.read(key, Profile.serializer())
            savedLoaded = true
            // The saved profile, so a cold start with no signal still knows this account is onboarded.
            if (savedCopy != null && !fromServer && watching == u.uid && _state.value == AuthState.Loading) {
                _state.value = AuthState.SignedIn(u, savedCopy)
            }
        }
        profileListener = db.collection("users").document(u.uid).addSnapshotListener { snap, err ->
            if (watching != u.uid) return@addSnapshotListener
            if (err != null || snap == null) {
                scope.launch {
                    val p = if (savedLoaded) savedCopy else saved.read(key, Profile.serializer())
                    if (watching == u.uid) _state.value = AuthState.SignedIn(u, p)
                }
                return@addSnapshotListener
            }
            // Offline, a profile missing from the local cache is "don't know", not "not
            // onboarded": routing on it sent an offline delegate to the onboarding form.
            if (snap.metadata.isFromCache && !snap.exists()) {
                scope.launch {
                    val p = if (savedLoaded) savedCopy else saved.read(key, Profile.serializer())
                    if (watching == u.uid && !fromServer) _state.value = AuthState.SignedIn(u, p)
                }
                return@addSnapshotListener
            }
            fromServer = fromServer || !snap.metadata.isFromCache
            val p = snap.decode<Profile>()
            _state.value = AuthState.SignedIn(u, p)
            if (p != null && !snap.metadata.isFromCache) scope.launch { saved.write(key, Profile.serializer(), p) }
        }
    }

    suspend fun signIn(email: String, password: String) {
        auth.signInWithEmailAndPassword(email.trim(), password).await()
    }

    suspend fun signUp(email: String, password: String) {
        auth.createUserWithEmailAndPassword(email.trim(), password).await()
    }

    /** Settings → Sign-in & security (the web's Security tab): re-enter the current password, then set the new one. */
    suspend fun changePassword(current: String, next: String) {
        val u = auth.currentUser ?: throw IllegalStateException("Not signed in.")
        val email = u.email ?: throw IllegalStateException("This account has no email.")
        u.reauthenticate(com.google.firebase.auth.EmailAuthProvider.getCredential(email, current)).await()
        u.updatePassword(next).await()
    }

    suspend fun sendPasswordReset(email: String) {
        auth.sendPasswordResetEmail(email.trim()).await()
    }

    /** Google sign-in is configured for this build (README: GOOGLE_WEB_CLIENT_ID). */
    val googleAvailable: Boolean get() = BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotEmpty()

    /**
     * The Google account sheet (Credential Manager), then Firebase. The web's signInWithPopup:
     * a first-time account lands on About you, pre-filled from the Google name. False when the
     * person closed the sheet. [activity] must be an Activity context (the sheet needs a window).
     */
    suspend fun signInWithGoogle(activity: Context): Boolean {
        val token = googleIdToken(activity) ?: return false
        auth.signInWithCredential(GoogleAuthProvider.getCredential(token, null)).await()
        return true
    }

    /** Settings -> Sign-in methods: adds Google to an email-and-password account. */
    suspend fun linkGoogle(activity: Context): Boolean {
        val u = auth.currentUser ?: return false
        val token = googleIdToken(activity) ?: return false
        u.linkWithCredential(GoogleAuthProvider.getCredential(token, null)).await()
        u.reload().await()
        return true
    }

    /** "password", "google.com": how this account can sign in. */
    fun providers(): Set<String> = auth.currentUser?.providerData.orEmpty().map { it.providerId }.filter { it != "firebase" }.toSet()

    private suspend fun googleIdToken(activity: Context): String? {
        val option = GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_WEB_CLIENT_ID).build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        val result = try {
            CredentialManager.create(activity).getCredential(activity, request)
        } catch (_: GetCredentialCancellationException) {
            return null
        }
        val cred = result.credential
        if (cred !is CustomCredential || cred.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            throw IllegalStateException("Google didn't return an account.")
        }
        return GoogleIdTokenCredential.createFrom(cred.data).idToken
    }

    /** Saved copies belong to this account; the next one to sign in must not see them. */
    suspend fun signOut() {
        saved.clear()
        auth.signOut()
    }

    /**
     * Writes exactly the fields the web onboarding writes, so an account made on the phone is
     * indistinguishable on the web. Role is kept if already elevated (organizer, admin), else
     * "user" — the web's rule.
     */
    suspend fun completeOnboarding(firstName: String, lastName: String, dob: String, phoneNumber: String) {
        val u = auth.currentUser ?: throw IllegalStateException("Not signed in.")
        val current = profile
        val role = current?.role?.takeIf { it.isNotEmpty() && it != "delegate" && it != "user" } ?: "user"
        val iso = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC).format(Instant.now())
        db.collection("users").document(u.uid).set(
            mapOf(
                "firstName" to firstName.trim(),
                "lastName" to lastName.trim(),
                "dob" to dob,
                "photoURL" to (current?.photoURL?.ifEmpty { null } ?: u.photoUrl?.toString() ?: ""),
                "role" to role,
                "onboardingComplete" to true,
                "createdAt" to iso,
            ),
            SetOptions.merge(),
        ).await()
        // Email and phone are private (users/{uid}/private/contact), never on the profile doc.
        saveContact(email = u.email ?: "", phoneNumber = phoneNumber)
        // The web reads the greeting name from the auth profile; set it so a phone-made account
        // doesn't greet itself as "User".
        u.updateProfile(userProfileChangeRequest { displayName = "${firstName.trim()} ${lastName.trim()}".trim() }).await()
    }

    suspend fun idToken(): String? = runCatching { auth.currentUser?.getIdToken(false)?.await()?.token }.getOrNull()
}

/** Firebase errors, said the way a person needs to hear them. */
fun authMessage(err: Throwable): String {
    if (err is FirebaseNetworkException) return "No connection. Check your internet and try again."
    if (err is NoCredentialException) return "No Google account on this phone. Add one in Settings, then try again."
    if (err is GetCredentialException) return "Google sign-in didn't finish. Try again."
    // Firebase reports a dropped socket as an "internal error" carrying the connect failure.
    val text = generateSequence(err) { it.cause }.mapNotNull { it.message }.joinToString(" ")
    if (Regex("Failed to connect|Unable to resolve host|timeout|timed out|Network is unreachable", RegexOption.IGNORE_CASE).containsMatchIn(text)) {
        return "No connection. Check your internet and try again."
    }
    if (err is FirebaseTooManyRequestsException) return "Too many attempts. Wait a minute and try again."
    val code = (err as? FirebaseAuthException)?.errorCode ?: ""
    return when (code) {
        "ERROR_INVALID_EMAIL" -> "That email address isn't valid."
        "ERROR_INVALID_CREDENTIAL", "ERROR_WRONG_PASSWORD", "ERROR_USER_NOT_FOUND" -> "Email or password is incorrect."
        "ERROR_EMAIL_ALREADY_IN_USE" -> "An account with this email already exists. Sign in instead."
        "ERROR_CREDENTIAL_ALREADY_IN_USE" -> "That Google account already belongs to another MUN Pilot account."
        "ERROR_PROVIDER_ALREADY_LINKED" -> "Google is already connected to this account."
        "ERROR_ACCOUNT_EXISTS_WITH_DIFFERENT_CREDENTIAL" -> "This email already has an account. Sign in with your password, then connect Google in Settings."
        "ERROR_WEAK_PASSWORD" -> "Use a password with at least 6 characters."
        "ERROR_TOO_MANY_REQUESTS" -> "Too many attempts. Wait a minute and try again."
        "ERROR_NETWORK_REQUEST_FAILED" -> "No connection. Check your internet and try again."
        else -> err.message?.takeIf { it.isNotBlank() } ?: "Something went wrong. Try again."
    }
}
