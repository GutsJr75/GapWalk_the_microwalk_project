package com.gapwalk.app.walk

import org.junit.Assert.assertEquals
import org.junit.Test

class WalkNotificationContentTest {
  @Test
  fun timerLineAlwaysShowsElapsedMinutesAndSeconds() {
    val snapshot = WalkTrackingSnapshot(
      sessionId = "session-elapsed",
      startIso = "2026-02-28T10:00:00.000Z",
      sessionStartMs = 1_000L,
      elapsedSeconds = 7 * 60 + 13,
      notificationTimerMode = WalkNotificationContent.TIMER_MODE_SMART,
    )

    assertEquals(
      "7 min 13 seconds walked, Keep it up!",
      WalkNotificationContent.resolveTimerLine(snapshot),
    )
  }

  @Test
  fun summaryLineUsesMilesWhenPreferred() {
    val snapshot = WalkTrackingSnapshot(
      sessionId = "session-miles",
      startIso = "2026-02-28T10:00:00.000Z",
      sessionStartMs = 1_000L,
      elapsedSeconds = 90,
      distanceMeters = 1609.34,
      steps = 1200,
      distanceUnit = WalkNotificationContent.DISTANCE_UNIT_MI,
    )

    assertEquals(
      "1 min 30 seconds walked, Keep it up!\nSteps: 1,200\nDistance: 1.00 mi",
      WalkNotificationContent.buildSummaryLine(snapshot),
    )
  }

  @Test
  fun summaryLineUsesKilometersWhenPreferred() {
    val snapshot = WalkTrackingSnapshot(
      sessionId = "session-km",
      startIso = "2026-02-28T10:00:00.000Z",
      sessionStartMs = 1_000L,
      elapsedSeconds = 240,
      distanceMeters = 1500.0,
      steps = 350,
      distanceUnit = WalkNotificationContent.DISTANCE_UNIT_KM,
    )

    assertEquals(
      "4 min 0 seconds walked, Keep it up!\nSteps: 350\nDistance: 1.50 km",
      WalkNotificationContent.buildSummaryLine(snapshot),
    )
  }
}
