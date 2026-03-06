package com.gapwalk.app.walk

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WalkTrackingClassifierTest {
  @Test
  fun classifyReturnsCalibratingDuringInitialWindow() {
    val classification = WalkTrackingClassifier.classify(
      WalkTrackingSnapshot(
        sessionId = "session-1",
        startIso = "2026-02-28T10:00:00.000Z",
        sessionStartMs = 1_000L,
        locationPermissionGranted = true,
        backgroundLocationGranted = true,
        activityPermissionGranted = true,
        stepCounterAvailable = true,
      ),
      6_500L,
    )

    assertEquals("starting", classification.motionState)
    assertEquals("calibrating", classification.displayState)
    assertEquals("Detecting movement...", classification.statusReason)
  }

  @Test
  fun classifyReturnsLocationOffWhenForegroundLocationAndStepPathAreUnavailable() {
    val classification = WalkTrackingClassifier.classify(
      WalkTrackingSnapshot(
        sessionId = "session-location-off",
        startIso = "2026-02-28T10:00:00.000Z",
        sessionStartMs = 1_000L,
        locationPermissionGranted = false,
        backgroundLocationGranted = false,
        activityPermissionGranted = false,
        stepCounterAvailable = false,
      ),
      9_000L,
    )

    assertEquals("location_off", classification.motionState)
    assertEquals("location_off", classification.displayState)
    assertEquals("Location needed", classification.statusReason)
  }

  @Test
  fun classifyKeepsForegroundTrackingActiveWhenBackgroundLocationIsMissing() {
    val classification = WalkTrackingClassifier.classify(
      WalkTrackingSnapshot(
        sessionId = "session-foreground-only",
        startIso = "2026-02-28T10:00:00.000Z",
        sessionStartMs = 1_000L,
        locationPermissionGranted = true,
        backgroundLocationGranted = false,
        activityPermissionGranted = true,
        stepCounterAvailable = true,
      ),
      6_500L,
    )

    assertEquals("starting", classification.motionState)
    assertEquals("calibrating", classification.displayState)
    assertEquals("stale", classification.locationHealth)
  }

  @Test
  fun classifyReturnsSensorIssueAfterCalibrationWithoutSignals() {
    val classification = WalkTrackingClassifier.classify(
      WalkTrackingSnapshot(
        sessionId = "session-2",
        startIso = "2026-02-28T10:00:00.000Z",
        sessionStartMs = 1_000L,
        locationPermissionGranted = true,
        backgroundLocationGranted = true,
        activityPermissionGranted = true,
        stepCounterAvailable = true,
      ),
      9_000L,
    )

    assertEquals("sensor_issue", classification.displayState)
    assertEquals("Step sensor not responding", classification.statusReason)
    assertEquals("stale", classification.pedometerHealth)
    assertEquals("stale", classification.locationHealth)
  }

  @Test
  fun classifyReturnsWalkingWhenOnlyStepsAreRecent() {
    val classification = WalkTrackingClassifier.classify(
      WalkTrackingSnapshot(
        sessionId = "session-3",
        startIso = "2026-02-28T10:00:00.000Z",
        sessionStartMs = 1_000L,
        locationPermissionGranted = true,
        backgroundLocationGranted = true,
        activityPermissionGranted = true,
        stepCounterAvailable = true,
        hadWalkingSignal = true,
        stepSource = "sensor",
        lastStepAtMs = 12_000L,
        lastMotionAtMs = 12_000L,
      ),
      16_000L,
    )

    assertEquals("walking", classification.motionState)
    assertEquals("walking", classification.displayState)
    assertEquals("active", classification.pedometerHealth)
    assertEquals("medium", classification.motionConfidence)
  }

  @Test
  fun classifyReturnsWalkingWhenOnlyGpsMotionIsRecent() {
    val classification = WalkTrackingClassifier.classify(
      WalkTrackingSnapshot(
        sessionId = "session-4",
        startIso = "2026-02-28T10:00:00.000Z",
        sessionStartMs = 1_000L,
        locationPermissionGranted = true,
        backgroundLocationGranted = true,
        activityPermissionGranted = true,
        stepCounterAvailable = true,
        hadWalkingSignal = true,
        lastGpsMotionAtMs = 14_000L,
        lastMotionAtMs = 14_000L,
        lastAcceptedLocationAtMs = 14_000L,
      ),
      18_000L,
    )

    assertEquals("walking", classification.displayState)
    assertEquals("active", classification.locationHealth)
    assertEquals("stale", classification.pedometerHealth)
    assertEquals("Step sensor waiting", classification.statusReason)
  }

  @Test
  fun classifyReturnsWalkingWhenOnlyAccelMotionIsRecent() {
    val classification = WalkTrackingClassifier.classify(
      WalkTrackingSnapshot(
        sessionId = "session-accel",
        startIso = "2026-02-28T10:00:00.000Z",
        sessionStartMs = 1_000L,
        locationPermissionGranted = true,
        backgroundLocationGranted = true,
        activityPermissionGranted = true,
        stepCounterAvailable = true,
        hadWalkingSignal = true,
        lastAccelMotionAtMs = 14_000L,
        lastMotionAtMs = 14_000L,
      ),
      18_000L,
    )

    assertEquals("walking", classification.motionState)
    assertEquals("walking", classification.displayState)
    assertEquals("medium", classification.motionConfidence)
    assertEquals("Detecting motion...", classification.statusReason)
  }

  @Test
  fun classifyUsesGpsFallbackReasonWhenFallbackIsActive() {
    val classification = WalkTrackingClassifier.classify(
      WalkTrackingSnapshot(
        sessionId = "session-5",
        startIso = "2026-02-28T10:00:00.000Z",
        sessionStartMs = 1_000L,
        locationPermissionGranted = true,
        backgroundLocationGranted = true,
        activityPermissionGranted = true,
        stepCounterAvailable = true,
        hadWalkingSignal = true,
        stepSource = "gps_fallback",
        lastGpsMotionAtMs = 20_000L,
        lastMotionAtMs = 20_000L,
        gpsWalkingSinceAtMs = 8_000L,
      ),
      22_000L,
    )

    assertEquals("walking", classification.displayState)
    assertEquals("Using GPS step backup", classification.statusReason)
  }

  @Test
  fun classifyReturnsNotMovingOnlyAfterPriorWalkingSignalGoesStale() {
    val classification = WalkTrackingClassifier.classify(
      WalkTrackingSnapshot(
        sessionId = "session-6",
        startIso = "2026-02-28T10:00:00.000Z",
        sessionStartMs = 1_000L,
        locationPermissionGranted = true,
        backgroundLocationGranted = true,
        activityPermissionGranted = true,
        stepCounterAvailable = true,
        hadWalkingSignal = true,
        lastStepAtMs = 8_000L,
        lastGpsMotionAtMs = 8_000L,
        lastMotionAtMs = 8_000L,
        lastAcceptedLocationAtMs = 8_000L,
      ),
      8_000L + WalkTrackingClassifier.WALKING_LATCH_MS + 2L,
    )

    assertEquals("not_moving", classification.motionState)
    assertEquals("not_moving", classification.displayState)
    assertFalse(classification.displayState == "walking")
  }

  @Test
  fun classifyDoesNotReportWalkingWithoutWalkingDisplayState() {
    val classification = WalkTrackingClassifier.classify(
      WalkTrackingSnapshot(
        sessionId = "session-7",
        startIso = "2026-02-28T10:00:00.000Z",
        sessionStartMs = 1_000L,
        paused = true,
        locationPermissionGranted = true,
        backgroundLocationGranted = true,
        activityPermissionGranted = true,
        stepCounterAvailable = true,
      ),
      30_000L,
    )

    assertEquals("paused", classification.motionState)
    assertEquals("paused", classification.displayState)
  }

  @Test
  fun gpsFallbackDoesNotActivateDuringInitialBlockWindow() {
    val snapshot = WalkTrackingSnapshot(
      sessionId = "session-8",
      startIso = "2026-02-28T10:00:00.000Z",
      sessionStartMs = 1_000L,
      locationPermissionGranted = true,
      backgroundLocationGranted = true,
      activityPermissionGranted = true,
      stepCounterAvailable = true,
      gpsWalkingSinceAtMs = 3_000L,
      stepFallbackBlockedUntilMs = 9_000L,
    )

    assertFalse(WalkTrackingClassifier.shouldUseGpsStepFallback(snapshot, 8_500L))
  }

  @Test
  fun gpsFallbackActivatesAfterSustainedGpsWalkingWithNoSteps() {
    val snapshot = WalkTrackingSnapshot(
      sessionId = "session-9",
      startIso = "2026-02-28T10:00:00.000Z",
      sessionStartMs = 1_000L,
      locationPermissionGranted = true,
      backgroundLocationGranted = true,
      activityPermissionGranted = true,
      stepCounterAvailable = true,
      gpsWalkingSinceAtMs = 10_000L,
      stepFallbackBlockedUntilMs = 12_000L,
    )

    assertTrue(WalkTrackingClassifier.shouldUseGpsStepFallback(snapshot, 20_500L))
  }

  @Test
  fun unsupportedStepSensorAllowsGpsFallbackAfterBlock() {
    val snapshot = WalkTrackingSnapshot(
      sessionId = "session-10",
      startIso = "2026-02-28T10:00:00.000Z",
      sessionStartMs = 1_000L,
      locationPermissionGranted = true,
      backgroundLocationGranted = true,
      activityPermissionGranted = true,
      stepCounterAvailable = false,
      gpsWalkingSinceAtMs = 15_000L,
      stepFallbackBlockedUntilMs = 12_000L,
    )

    assertTrue(WalkTrackingClassifier.shouldUseGpsStepFallback(snapshot, 15_100L))
  }

  @Test
  fun autoPauseTriggersAfterThirtySecondsWithoutMotion() {
    val snapshot = WalkTrackingSnapshot(
      sessionId = "session-11",
      startIso = "2026-02-28T10:00:00.000Z",
      sessionStartMs = 1_000L,
      lastMotionAtMs = 10_000L,
      hadWalkingSignal = true,
      locationPermissionGranted = true,
    )

    assertTrue(
      WalkTrackingClassifier.shouldAutoPause(
        snapshot,
        10_000L + WalkTrackingClassifier.AUTO_PAUSE_MS,
      ),
    )
    assertFalse(
      WalkTrackingClassifier.shouldAutoPause(
        snapshot,
        10_000L + WalkTrackingClassifier.AUTO_PAUSE_MS - 1L,
      ),
    )
  }

  @Test
  fun computedElapsedSecondsSubtractsCompletedPauses() {
    val snapshot = WalkTrackingSnapshot(
      sessionId = "session-12",
      startIso = "2026-02-28T10:00:00.000Z",
      sessionStartMs = 1_000L,
      totalPausedMs = 7_000L,
    )

    assertEquals(12, snapshot.computedElapsedSeconds(20_000L))
  }

  @Test
  fun computedElapsedSecondsStopsWhileCurrentlyPaused() {
    val snapshot = WalkTrackingSnapshot(
      sessionId = "session-13",
      startIso = "2026-02-28T10:00:00.000Z",
      sessionStartMs = 1_000L,
      totalPausedMs = 4_000L,
      pauseStartedAtMs = 15_000L,
      paused = true,
    )

    assertEquals(10, snapshot.computedElapsedSeconds(20_000L))
  }
}
