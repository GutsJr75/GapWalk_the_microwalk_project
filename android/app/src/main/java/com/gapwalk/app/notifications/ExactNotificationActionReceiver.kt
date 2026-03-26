package com.gapwalk.app.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle

/**
 * Receives Yes / Not Now button taps from walk_ready exact-alarm notifications.
 * Dismisses the notification immediately, then starts a HeadlessJsTaskService
 * so the existing JS plan logic can handle the action in the background.
 */
class ExactNotificationActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != EXACT_NOTIFICATION_ACTION_BUTTON) return

    val notificationId = intent.getStringExtra(EXTRA_NOTIFICATION_ID) ?: return
    val planId = intent.getStringExtra(EXTRA_PLAN_ID) ?: return
    val type = intent.getStringExtra(EXTRA_NOTIFICATION_TYPE) ?: return
    val actionIdentifier = intent.getStringExtra(EXTRA_ACTION_IDENTIFIER) ?: return

    // Dismiss the notification from the shade immediately
    cancelPresentedNotification(context, notificationId)

    // Also dismiss the Phase 1 alert notification if it's still around
    if (type == WALK_READY_NOTIFICATION_TYPE) {
      cancelPresentedNotification(context, getWalkAlertNotificationId(planId))
    }

    // Start the headless JS service to handle the action
    val serviceIntent = Intent(context, ExactNotificationActionService::class.java).apply {
      putExtras(Bundle().apply {
        putString("notificationId", notificationId)
        putString("planId", planId)
        putString("type", type)
        putString("actionIdentifier", actionIdentifier)
      })
    }

    try {
      context.startService(serviceIntent)
    } catch (e: Exception) {
      // On Android 12+ background start restrictions may block startService.
      // Fall back to saving a pending response so the app handles it on next foreground.
      val payload = org.json.JSONObject().apply {
        put("notificationId", notificationId)
        put("actionIdentifier", actionIdentifier)
        put("planId", planId)
        put("type", type)
      }
      savePendingResponse(context, payload)
    }
  }
}
