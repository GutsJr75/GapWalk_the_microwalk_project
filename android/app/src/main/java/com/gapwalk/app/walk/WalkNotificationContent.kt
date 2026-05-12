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
  const val STATS_MODE_ALL = "all"
  const val STATS_MODE_STEPS = "steps"
  const val STATS_MODE_DISTANCE = "distance"
  const val STATS_MODE_NONE = "none"

  fun normalizeTimerMode(value: String?): String {
    return when (value) {
      TIMER_MODE_ELAPSED -> TIMER_MODE_ELAPSED
      TIMER_MODE_REMAINING -> TIMER_MODE_REMAINING
      else -> TIMER_MODE_SMART
    }
  }

  fun normalizeStatsMode(value: String?): String {
    return when (value) {
      STATS_MODE_STEPS -> STATS_MODE_STEPS
      STATS_MODE_DISTANCE -> STATS_MODE_DISTANCE
      STATS_MODE_NONE -> STATS_MODE_NONE
      else -> STATS_MODE_ALL
    }
  }

  fun normalizeDistanceUnit(value: String?): String {
    return when (value) {
      DISTANCE_UNIT_MI -> DISTANCE_UNIT_MI
      else -> DISTANCE_UNIT_KM
    }
  }

  private fun formatCompactTimer(totalSeconds: Int): String {
    val safeSeconds = max(0, totalSeconds)
    val minutes = safeSeconds / SECONDS_PER_MINUTE
    val secondsRemainder = safeSeconds % SECONDS_PER_MINUTE
    return String.format(Locale.US, "%d:%02d", minutes, secondsRemainder)
  }

  fun resolveTimerLine(snapshot: WalkTrackingSnapshot): String {
    val mode = normalizeTimerMode(snapshot.notificationTimerMode)
    val targetSeconds = (snapshot.targetDurationMinutes ?: 0) * SECONDS_PER_MINUTE

    val showRemaining = when (mode) {
      TIMER_MODE_REMAINING -> snapshot.targetDurationMinutes != null && snapshot.elapsedSeconds < targetSeconds
      TIMER_MODE_SMART -> snapshot.targetDurationMinutes != null && snapshot.elapsedSeconds < targetSeconds
      else -> false
    }

    if (showRemaining) {
      val remainingSecondsTotal = max(0, targetSeconds - snapshot.elapsedSeconds)
      return "${formatCompactTimer(remainingSecondsTotal)} left"
    }

    return "${formatCompactTimer(snapshot.elapsedSeconds)} walked"
  }

  fun buildDistanceLine(snapshot: WalkTrackingSnapshot): String {
    val unit = normalizeDistanceUnit(snapshot.distanceUnit)
    val distanceValue = if (unit == DISTANCE_UNIT_MI) {
      snapshot.distanceMeters / METERS_PER_MILE
    } else {
      snapshot.distanceMeters / METERS_PER_KILOMETER
    }
    return String.format(Locale.US, "%.2f %s", distanceValue, unit)
  }

  fun buildStepsLine(snapshot: WalkTrackingSnapshot): String {
    val stepsLabel = String.format(Locale.US, "%,d", snapshot.steps)
    return "$stepsLabel steps"
  }

  fun buildSummaryLine(snapshot: WalkTrackingSnapshot): String {
    val timerLine = resolveTimerLine(snapshot)
    val statsMode = normalizeStatsMode(snapshot.notificationStatsMode)
    if (statsMode == STATS_MODE_NONE) {
      return timerLine
    }

    val statParts = mutableListOf<String>()

    if (statsMode == STATS_MODE_ALL || statsMode == STATS_MODE_STEPS) {
      statParts.add(buildStepsLine(snapshot))
    }

    if (statsMode == STATS_MODE_ALL || statsMode == STATS_MODE_DISTANCE) {
      statParts.add(buildDistanceLine(snapshot))
    }

    if (statParts.isEmpty()) {
      return timerLine
    }

    return "$timerLine\n${statParts.joinToString(", ")}"
  }
}
