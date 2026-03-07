package com.gapwalk.app.walk

import org.junit.Assert.assertEquals
import org.junit.Test

class WalkNotificationContentTest {
  @Test
  fun smartModeUsesElapsedForManualWalks() {
    val snapshot = WalkTrackingSnapshot(
      sessionId = "session-smart-manual",
      startIso = "2026-02-28T10:00:00.000Z",
      sessionStartMs = 1_000L,
      elapsedSeconds = 7 * 60,
      startedFromNotification = false,
      targetDurationMinutes = 20,
      notificationTimerMode = WalkNotificationContent.TIMER_MODE_SMART,
    )

    assertEquals("7 min walked", WalkNotificationContent.resolveTimerLine(snapshot))
  }

  @Test
  fun smartModeUsesRemainingForNotificationStartedWalks() {
    val snapshot = WalkTrackingSnapshot(
      sessionId = "session-smart-notification",
      startIso = "2026-02-28T10:00:00.000Z",
      sessionStartMs = 1_000L,
      elapsedSeconds = 9 * 60,
      startedFromNotification = true,
      targetDurationMinutes = 20,
      notificationTimerMode = WalkNotificationContent.TIMER_MODE_SMART,
    )

    assertEquals("11 min left", WalkNotificationContent.resolveTimerLine(snapshot))
  }

  @Test
  fun remainingModeFallsBackToElapsedWhenTargetMissing() {
    val snapshot = WalkTrackingSnapshot(
      sessionId = "session-remaining-fallback",
      startIso = "2026-02-28T10:00:00.000Z",
      sessionStartMs = 1_000L,
      elapsedSeconds = 4 * 60,
      startedFromNotification = true,
      targetDurationMinutes = null,
      notificationTimerMode = WalkNotificationContent.TIMER_MODE_REMAINING,
    )

    assertEquals("4 min walked", WalkNotificationContent.resolveTimerLine(snapshot))
  }
}
