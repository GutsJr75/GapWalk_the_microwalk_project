package com.gapwalk.app.walk

import java.util.Locale
import kotlin.math.max

internal object WalkNotificationContent {
  private const val METERS_PER_MILE = 1609.34
  private const val METERS_PER_KILOMETER = 1000.0
  private const val SECONDS_PER_MINUTE = 60

  const val TIMER_MODE_SMART = "smart"
  const val TIMER_MODE_ELAPSED = "elapsed"
  const val TIMER_MODE_REMAINING = "remaining"
  const val DISTANCE_UNIT_MI = "mi"
  const val DISTANCE_UNIT_KM = "km"

  fun normalizeTimerMode(value: String?): String {
    return when (value) {
      TIMER_MODE_ELAPSED -> TIMER_MODE_ELAPSED
      TIMER_MODE_REMAINING -> TIMER_MODE_REMAINING
      else -> TIMER_MODE_SMART
    }
  }

  fun normalizeDistanceUnit(value: String?): String {
    return when (value) {
      DISTANCE_UNIT_MI -> DISTANCE_UNIT_MI
      else -> DISTANCE_UNIT_KM
    }
  }

  fun resolveTimerLine(snapshot: WalkTrackingSnapshot): String {
    val elapsedMinutes = max(0, snapshot.elapsedSeconds / SECONDS_PER_MINUTE)
    val elapsedSecondsRemainder = max(0, snapshot.elapsedSeconds % SECONDS_PER_MINUTE)
    return "$elapsedMinutes min $elapsedSecondsRemainder seconds walked, Keep it up!"
  }

  fun buildDistanceLine(snapshot: WalkTrackingSnapshot): String {
    val unit = normalizeDistanceUnit(snapshot.distanceUnit)
    val distanceValue = if (unit == DISTANCE_UNIT_MI) {
      snapshot.distanceMeters / METERS_PER_MILE
    } else {
      snapshot.distanceMeters / METERS_PER_KILOMETER
    }
    val distanceLabel = String.format(Locale.US, "%.2f %s", distanceValue, unit)
    return "Distance: $distanceLabel"
  }

  fun buildStepsLine(snapshot: WalkTrackingSnapshot): String {
    val stepsLabel = String.format(Locale.US, "%,d", snapshot.steps)
    return "Steps: $stepsLabel"
  }

  fun buildSummaryLine(snapshot: WalkTrackingSnapshot): String {
    val timerLine = resolveTimerLine(snapshot)
    val stepsLine = buildStepsLine(snapshot)
    val distanceLine = buildDistanceLine(snapshot)
    return "$timerLine\n$stepsLine\n$distanceLine"
  }
}
