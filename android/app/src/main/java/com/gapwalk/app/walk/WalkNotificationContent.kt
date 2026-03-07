package com.gapwalk.app.walk

import java.util.Locale
import kotlin.math.ceil
import kotlin.math.max

internal object WalkNotificationContent {
  private const val METERS_PER_MILE = 1609.34
  private const val SECONDS_PER_MINUTE = 60

  const val TIMER_MODE_SMART = "smart"
  const val TIMER_MODE_ELAPSED = "elapsed"
  const val TIMER_MODE_REMAINING = "remaining"

  fun normalizeTimerMode(value: String?): String {
    return when (value) {
      TIMER_MODE_ELAPSED -> TIMER_MODE_ELAPSED
      TIMER_MODE_REMAINING -> TIMER_MODE_REMAINING
      else -> TIMER_MODE_SMART
    }
  }

  fun resolveTimerLine(snapshot: WalkTrackingSnapshot): String {
    val mode = normalizeTimerMode(snapshot.notificationTimerMode)
    val shouldUseRemaining = when (mode) {
      TIMER_MODE_REMAINING -> true
      TIMER_MODE_ELAPSED -> false
      else -> snapshot.startedFromNotification && (snapshot.targetDurationMinutes ?: 0) > 0
    }
    if (shouldUseRemaining) {
      val targetMinutes = snapshot.targetDurationMinutes ?: 0
      if (targetMinutes > 0) {
        val remainingSeconds = max(0, targetMinutes * SECONDS_PER_MINUTE - snapshot.elapsedSeconds)
        val remainingMinutes = max(0, ceil(remainingSeconds / SECONDS_PER_MINUTE.toDouble()).toInt())
        return "$remainingMinutes min left"
      }
    }
    val elapsedMinutes = max(0, snapshot.elapsedSeconds / SECONDS_PER_MINUTE)
    return "$elapsedMinutes min walked"
  }

  fun buildStatsLine(snapshot: WalkTrackingSnapshot): String {
    val distanceMiles = snapshot.distanceMeters / METERS_PER_MILE
    val distanceLabel = String.format(Locale.US, "%.2f mi", distanceMiles)
    val stepsLabel = String.format(Locale.US, "%,d", snapshot.steps)
    return "$stepsLabel steps, $distanceLabel"
  }

  fun buildSummaryLine(snapshot: WalkTrackingSnapshot): String {
    val timerLine = resolveTimerLine(snapshot)
    val statsLine = buildStatsLine(snapshot)
    val reason = snapshot.statusReason?.takeIf {
      it.isNotBlank() &&
        it != "Detecting movement..." &&
        it != "Detecting movement…" &&
        it != "Checking movement..."
    }
    return if (reason != null) {
      "$timerLine\n$statsLine\n$reason"
    } else {
      "$timerLine\n$statsLine"
    }
  }
}
