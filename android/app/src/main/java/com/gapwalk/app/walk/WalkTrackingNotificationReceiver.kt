package com.gapwalk.app.walk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
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
        WalkTrackingModule.emitSnapshot(
          WalkTrackingSessionController.requestEndConfirmation(context),
        )
        WalkTrackingService.startOrSync(context)
        launchApp(context)
      }
    }
  }

  private fun launchApp(context: Context) {
    val launchIntent = Intent(context, MainActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      putExtra("walk_prompt", "end_confirmation")
      putExtra("walk_open", true)
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      context.startActivity(launchIntent)
    } else {
      context.startActivity(launchIntent)
    }
  }
}
