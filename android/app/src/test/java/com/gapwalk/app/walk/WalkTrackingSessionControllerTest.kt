package com.gapwalk.app.walk

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WalkTrackingSessionControllerTest {
  @Test
  fun firstSensorEventAnchorsAgainstExistingSessionSteps() {
    val anchor = WalkTrackingSessionController.resolveStepCounterAnchor(
      existingSteps = 12,
      rawStepCount = 245f,
      currentAnchor = null,
    )

    assertEquals(233f, anchor)
  }

  @Test
  fun sessionStepsNeverGoBackward() {
    val steps = WalkTrackingSessionController.resolveSessionSteps(
      existingSteps = 32,
      rawStepCount = 240f,
      anchor = 210f,
    )

    assertEquals(32, steps)
  }

  @Test
  fun reanchorAfterResumePreservesExistingSessionTotal() {
    val anchor = WalkTrackingSessionController.reanchorAfterResume(
      existingSteps = 120,
      lastRawStepCounter = 820f,
      currentAnchor = 700f,
    )

    assertEquals(700f, anchor)
  }

  @Test
  fun applyResumeStateClearsMotionSignalsAndResetsStepSource() {
    val resumed = WalkTrackingSessionController.applyResumeState(
      snapshot = WalkTrackingSnapshot(
        sessionId = "session-1",
        startIso = "2026-02-28T10:00:00.000Z",
        sessionStartMs = 1_000L,
        totalPausedMs = 4_000L,
        pauseStartedAtMs = 20_000L,
        paused = true,
        steps = 80,
        stepSource = "gps_fallback",
        lastMotionAtMs = 18_000L,
        lastStepAtMs = 18_000L,
        lastGpsMotionAtMs = 18_000L,
        lastRawStepCounter = 480f,
        stepCounterAnchor = 400f,
      ),
      nowMs = 27_000L,
      source = "screen",
    )

    assertEquals(false, resumed.paused)
    assertEquals("none", resumed.stepSource)
    assertNull(resumed.lastMotionAtMs)
    assertNull(resumed.lastStepAtMs)
    assertNull(resumed.lastGpsMotionAtMs)
    assertEquals(480f - 80f, resumed.stepCounterAnchor)
    assertEquals(WalkTrackingClassifier.fallbackBlockedUntilMs(27_000L), resumed.stepFallbackBlockedUntilMs)
  }
}
