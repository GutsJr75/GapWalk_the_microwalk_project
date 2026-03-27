package com.gapwalk.app.notifications

import android.content.Intent
import android.os.Bundle
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * HeadlessJsTaskService that runs the ExactNotificationActionTask JS task.
 * This allows Yes / Not Now notification actions to be handled entirely in
 * background JS without foregrounding the app.
 */
class ExactNotificationActionService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras = intent?.extras ?: return null

    val data = Arguments.createMap().apply {
      putString("notificationId", extras.getString("notificationId"))
      putString("planId", extras.getString("planId"))
      putString("type", extras.getString("type"))
      putString("actionIdentifier", extras.getString("actionIdentifier"))
    }

    return HeadlessJsTaskConfig(
      HEADLESS_TASK_NAME,
      data,
      30_000L, // 30 second timeout
      true,    // allow in foreground
    )
  }
}
