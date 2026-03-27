package com.gapwalk.app.walk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.gapwalk.app.MainActivity

class WalkTrackingNotificationReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      WalkTrackingService.ACTION_PAUSE -> {
        WalkTrackingModule.emitSnapshot(
          WalkTrackingSessionController.pause(context, "notification"),
        )
        WalkTrackingService.startOrSync(context)
      }

      WalkTrackingService.ACTION_RESUME -> {
        WalkTrackingModule.emitSnapshot(
          WalkTrackingSessionController.resume(context, "notification"),
        )
        WalkTrackingService.startOrSync(context)
      }

      WalkTrackingService.ACTION_REQUEST_END_CONFIRMATION -> {
        // Always pause timer immediately when End Walk is pressed
        WalkTrackingSessionController.pause(context, "end_walk_notification")

        val endWalkMode = context.getSharedPreferences("gapwalk_settings", Context.MODE_PRIVATE)
          .getString("end_walk_mode", "quick")

        if (endWalkMode == "quick") {
          // Quick mode: end session directly without launching app
          val finalSnapshot = WalkTrackingSessionController.confirmEndSession(context)
          WalkTrackingModule.emitSnapshot(null)
          WalkTrackingService.stop(context)
          // Emit quick-end event so JS can show summary notification and persist session
          WalkTrackingModule.emitQuickEndEvent(context, finalSnapshot)
        } else {
          // Confirm mode: set prompt and launch app for confirmation
          WalkTrackingModule.emitSnapshot(
            WalkTrackingSessionController.requestEndConfirmation(context),
          )
          WalkTrackingService.startOrSync(context)
          launchApp(context)
        }
      }
    }
  }

  private fun launchApp(context: Context) {
    val launchIntent = Intent(context, MainActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      putExtra("walk_prompt", "end_confirmation")
      putExtra("walk_open", true)
    }

    context.startActivity(launchIntent)
  }
}
