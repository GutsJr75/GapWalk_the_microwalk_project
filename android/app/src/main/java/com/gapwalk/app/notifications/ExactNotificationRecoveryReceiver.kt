package com.gapwalk.app.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.facebook.react.HeadlessJsTaskService

/**
 * Receives system lifecycle changes that can invalidate exact alarm schedules.
 * Always marks notification recovery as needed first, then attempts to launch
 * a Headless JS task so reminders can be re-seeded immediately.
 */
class ExactNotificationRecoveryReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val reason = intent.action ?: "unknown"
    markNotificationsRecoveryNeeded(context, reason)

    val serviceIntent = Intent(context, ExactNotificationRecoveryService::class.java).apply {
      action = EXACT_NOTIFICATION_ACTION_RECOVER
      putExtra(EXTRA_RECOVERY_REASON, reason)
    }

    try {
      context.startService(serviceIntent)
      HeadlessJsTaskService.acquireWakeLockNow(context)
    } catch (error: Exception) {
      Log.w(
        "GapWalkRecovery",
        "Unable to start notification recovery service for $reason; deferring to next foreground.",
        error,
      )
    }
  }
}
