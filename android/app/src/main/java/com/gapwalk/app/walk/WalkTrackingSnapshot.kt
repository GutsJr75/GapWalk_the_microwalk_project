package com.gapwalk.app.walk

import kotlin.math.max

data class WalkTrackingSnapshot(
  val sessionId: String,
  val planId: String? = null,
  val startIso: String,
  val sessionStartMs: Long,
  val totalPausedMs: Long = 0L,
  val pauseStartedAtMs: Long? = null,
  val elapsedSeconds: Int = 0,
  val paused: Boolean = false,
  val motionState: String = "starting",
  val displayState: String = "calibrating",
  val pedometerHealth: String = "stale",
  val locationHealth: String = "stale",
  val motionConfidence: String = "low",
  val stepSource: String = "none",
  val statusReason: String? = null,
  val prompt: String? = null,
  val distanceMeters: Double = 0.0,
  val steps: Int = 0,
  val usedLocation: Boolean = false,
  val locationPermissionGranted: Boolean = false,
  val backgroundLocationGranted: Boolean = false,
  val activityPermissionGranted: Boolean = false,
  val hadWalkingSignal: Boolean = false,
  val lastActionSource: String? = null,
  val warning: String? = null,
  val lastMotionAtMs: Long? = null,
  val lastStepAtMs: Long? = null,
  val lastGpsMotionAtMs: Long? = null,
  val lastAcceptedLocationAtMs: Long? = null,
  val lastLatitude: Double? = null,
  val lastLongitude: Double? = null,
  val lastLocationTimestampMs: Long? = null,
  val gpsWalkingSinceAtMs: Long? = null,
  val stepFallbackBlockedUntilMs: Long? = null,
  val stepCounterAvailable: Boolean = false,
  val stepCounterDisabledForSession: Boolean = false,
  val stepCounterAnchor: Float? = null,
  val lastRawStepCounter: Float? = null,
) {
  fun computedElapsedSeconds(nowMs: Long = System.currentTimeMillis()): Int {
    val currentPauseMs = pauseStartedAtMs?.let { nowMs - it } ?: 0L
    val elapsedMs = max(0L, nowMs - sessionStartMs - totalPausedMs - currentPauseMs)
    return (elapsedMs / 1000L).toInt()
  }

  fun withElapsed(nowMs: Long = System.currentTimeMillis()): WalkTrackingSnapshot {
    return copy(elapsedSeconds = computedElapsedSeconds(nowMs))
  }
}
