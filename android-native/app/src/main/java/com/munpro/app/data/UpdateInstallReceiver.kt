package com.munpro.app.data

// The system installer's answer to Updates.install(): first "needs the user's OK" (we open its
// confirmation screen), then success, a cancel, or a refusal (e.g. a different signing key).

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import androidx.core.content.IntentCompat
import com.munpro.app.AppGraph

class UpdateInstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                val confirm = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_INTENT, Intent::class.java) ?: return
                runCatching { context.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                    .onFailure { AppGraph.updates.installFinished(false, "Couldn't open the installer. Try again.") }
            }
            PackageInstaller.STATUS_SUCCESS -> AppGraph.updates.installFinished(true, null)
            PackageInstaller.STATUS_FAILURE_ABORTED -> AppGraph.updates.installFinished(false, null)
            PackageInstaller.STATUS_FAILURE_CONFLICT, PackageInstaller.STATUS_FAILURE_INCOMPATIBLE ->
                AppGraph.updates.installFinished(false, "This update doesn't match the installed app. Download it again from munpilot.com.")
            PackageInstaller.STATUS_FAILURE_STORAGE -> AppGraph.updates.installFinished(false, "Not enough space on the phone for the update.")
            else -> AppGraph.updates.installFinished(false, "The update wasn't installed. Try again.")
        }
    }
}
