package com.gapwalk.app.notifications

import android.app.ActivityManager
import android.app.Notification
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.gapwalk.app.R

class ExactAlarmNotificationReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != EXACT_NOTIFICATION_ACTION_SHOW) return

    val notificationId = intent.getStringExtra(EXTRA_NOTIFICATION_ID) ?: return
    val planId = intent.getStringExtra(EXTRA_PLAN_ID) ?: return
    val type = intent.getStringExtra(EXTRA_NOTIFICATION_TYPE) ?: return
    val title = intent.getStringExtra(EXTRA_NOTIFICATION_TITLE) ?: return
    val body = intent.getStringExtra(EXTRA_NOTIFICATION_BODY) ?: return

    ensureNotificationChannel(context)
    removeScheduledId(context, notificationId)
    ExactAlarmNotificationsModule.handleNotificationDelivered(context, notificationId, planId, type)

    if (type == WALK_MISSED_NOTIFICATION_TYPE) {
      cancelPresentedNotification(context, getWalkReadyNotificationId(planId))
      cancelPresentedNotification(context, getWalkAlertNotificationId(planId))
      // Backward compatibility: older builds used a single walk-nudge notification id.
      cancelPresentedNotification(context, getWalkNudgeNotificationId(planId))
    }
    if (type == WALK_READY_NOTIFICATION_TYPE) {
      cancelPresentedNotification(context, getWalkAlertNotificationId(planId))
      if (isAppInForeground()) {
        return
      }
    }

    NotificationManagerCompat.from(context).notify(
      notificationTag(notificationId),
      platformNotificationId(),
      buildNotification(context, notificationId, planId, type, title, body),
    )
  }

  private fun buildNotification(
    context: Context,
    notificationId: String,
    planId: String,
    type: String,
    title: String,
    body: String,
  ): Notification {
    val contentIntent = PendingIntent.getActivity(
      context,
      responseRequestCodeFor(notificationId, DEFAULT_NOTIFICATION_ACTION_IDENTIFIER),
      buildResponseIntent(
        context,
        notificationId,
        planId,
        type,
        DEFAULT_NOTIFICATION_ACTION_IDENTIFIER,
      ),
      PendingIntent.FLAG_UPDATE_CURRENT or pendingIntentImmutableFlag(),
    )

    val builder = NotificationCompat.Builder(context, EXACT_NOTIFICATION_CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_notification_walk)
      .setColor(ContextCompat.getColor(context, R.color.gapwalk_accent))
      .setColorized(false)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setAutoCancel(true)
      .setContentIntent(contentIntent)
      .setDefaults(Notification.DEFAULT_SOUND)

    if (type == WALK_NUDGE_NOTIFICATION_TYPE) {
      val startIntent = PendingIntent.getActivity(
        context,
        responseRequestCodeFor(notificationId, WALK_NUDGE_ACTION_START),
        buildResponseIntent(
          context,
          notificationId,
          planId,
          type,
          WALK_NUDGE_ACTION_START,
        ),
        PendingIntent.FLAG_UPDATE_CURRENT or pendingIntentImmutableFlag(),
      )

      val skipIntent = PendingIntent.getActivity(
        context,
        responseRequestCodeFor(notificationId, WALK_NUDGE_ACTION_SKIP),
        buildResponseIntent(
          context,
          notificationId,
          planId,
          type,
          WALK_NUDGE_ACTION_SKIP,
        ),
        PendingIntent.FLAG_UPDATE_CURRENT or pendingIntentImmutableFlag(),
      )

      builder
        .addAction(0, "Start walk", startIntent)
        .addAction(0, "Not right now", skipIntent)
    } else if (type == WALK_READY_NOTIFICATION_TYPE) {
      val yesIntent = PendingIntent.getBroadcast(
        context,
        responseRequestCodeFor(notificationId, WALK_READY_ACTION_YES),
        buildActionBroadcastIntent(context, notificationId, planId, type, WALK_READY_ACTION_YES),
        PendingIntent.FLAG_UPDATE_CURRENT or pendingIntentImmutableFlag(),
      )

      val notNowIntent = PendingIntent.getBroadcast(
        context,
        responseRequestCodeFor(notificationId, WALK_READY_ACTION_NOT_NOW),
        buildActionBroadcastIntent(context, notificationId, planId, type, WALK_READY_ACTION_NOT_NOW),
        PendingIntent.FLAG_UPDATE_CURRENT or pendingIntentImmutableFlag(),
      )

      builder
        .addAction(0, "Yes", yesIntent)
        .addAction(0, "Not Now", notNowIntent)
    }

    return builder.build()
  }

  private fun isAppInForeground(): Boolean {
    val appProcessInfo = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(appProcessInfo)
    return appProcessInfo.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
  }

  private fun pendingIntentImmutableFlag(): Int = PendingIntent.FLAG_IMMUTABLE
}
