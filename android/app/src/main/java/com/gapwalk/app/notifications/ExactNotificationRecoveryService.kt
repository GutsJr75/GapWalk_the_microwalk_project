package com.gapwalk.app.notifications

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Headless JS task service for notification recovery after reboot, timezone,
 * time, package, or exact-alarm permission changes.
 */
class ExactNotificationRecoveryService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig {
    val reason = intent?.getStringExtra(EXTRA_RECOVERY_REASON)
      ?: intent?.action
      ?: "unknown"

    val data = Arguments.createMap().apply {
      putString("reason", reason)
    }

    return HeadlessJsTaskConfig(
      RECOVERY_HEADLESS_TASK_NAME,
      data,
      45_000L,
      true,
    )
  }
}
