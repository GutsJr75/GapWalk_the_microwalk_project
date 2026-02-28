package com.gapwalk.app.walk

object WalkTrackingClassifier {
  const val CALIBRATION_WINDOW_MS = 6_000L
  const val STEP_FALLBACK_BLOCK_MS = 8_000L
  const val GPS_FALLBACK_ACTIVATION_MS = 10_000L
  const val WALKING_SPEED_THRESHOLD_MPS = 0.45
  const val MIN_SEGMENT_METERS = 0.35
  const val GPS_MOTION_SEGMENT_METERS = 1.2
  const val GPS_MOTION_MAX_DT_SECONDS = 3.0
  const val MAX_VALID_JUMP_METERS = 80.0
  const val WALKING_LATCH_MS = 8_000L
  const val AUTO_PAUSE_MS = 30_000L
  private const val STEP_ESTIMATED_STRIDE_METERS = 0.78

  data class Classification(
    val motionState: String,
    val displayState: String,
    val pedometerHealth: String,
    val locationHealth: String,
    val motionConfidence: String,
    val statusReason: String?,
  )

  fun classify(snapshot: WalkTrackingSnapshot, nowMs: Long = System.currentTimeMillis()): Classification {
    val recentStep = isRecent(snapshot.lastStepAtMs, nowMs)
    val recentGpsMotion = isRecent(snapshot.lastGpsMotionAtMs, nowMs)
    val recentLocationSample = isRecent(snapshot.lastAcceptedLocationAtMs, nowMs)
    val hasUsableStepPath = snapshot.activityPermissionGranted && snapshot.stepCounterAvailable
    val isWalking = recentStep || recentGpsMotion
    val inCalibration = isInCalibrationWindow(snapshot, nowMs) && !snapshot.paused && !isWalking
    val noLocationAndNoStepPath = !snapshot.locationPermissionGranted && !hasUsableStepPath

    val pedometerHealth = when {
      !snapshot.activityPermissionGranted -> "denied"
      !snapshot.stepCounterAvailable -> "unsupported"
      recentStep -> "active"
      else -> "stale"
    }

    val locationHealth = when {
      !snapshot.locationPermissionGranted -> "denied"
      recentLocationSample -> "active"
      else -> "stale"
    }

    val motionState = when {
      snapshot.paused -> "paused"
      isWalking -> "walking"
      noLocationAndNoStepPath && !snapshot.hadWalkingSignal -> "location_off"
      snapshot.hadWalkingSignal -> "not_moving"
      else -> "starting"
    }

    val displayState = when {
      snapshot.paused -> "paused"
      isWalking -> "walking"
      noLocationAndNoStepPath && !snapshot.hadWalkingSignal -> "location_off"
      inCalibration -> "calibrating"
      snapshot.hadWalkingSignal -> "not_moving"
      hasUsableStepPath -> "sensor_issue"
      else -> "sensor_issue"
    }

    val motionConfidence = when {
      recentStep && recentGpsMotion -> "high"
      recentStep || recentGpsMotion -> "medium"
      else -> "low"
    }

    val statusReason = when {
      snapshot.stepSource == "gps_fallback" && snapshot.locationPermissionGranted -> "Using GPS step backup"
      displayState == "walking" && recentGpsMotion && !recentStep && hasUsableStepPath -> "Step sensor waiting"
      displayState == "sensor_issue" && hasUsableStepPath -> "Step sensor not responding"
      displayState == "location_off" -> "Location needed"
      displayState == "calibrating" -> "Detecting movement..."
      else -> null
    }

    return Classification(
      motionState = motionState,
      displayState = displayState,
      pedometerHealth = pedometerHealth,
      locationHealth = locationHealth,
      motionConfidence = motionConfidence,
      statusReason = statusReason,
    )
  }

  fun shouldAutoPause(snapshot: WalkTrackingSnapshot, nowMs: Long = System.currentTimeMillis()): Boolean {
    val lastMotionAtMs = snapshot.lastMotionAtMs ?: return false
    return !snapshot.paused &&
      snapshot.prompt == null &&
      snapshot.hadWalkingSignal &&
      nowMs - lastMotionAtMs >= AUTO_PAUSE_MS
  }

  fun shouldAcceptDistanceSegment(segmentMeters: Double): Boolean {
    return segmentMeters >= MIN_SEGMENT_METERS && segmentMeters <= MAX_VALID_JUMP_METERS
  }

  fun isWalkingGpsSignal(segmentMeters: Double, dtSeconds: Double, speedMetersPerSecond: Double?): Boolean {
    if (segmentMeters > MAX_VALID_JUMP_METERS) return false

    val estimatedSpeed = if (dtSeconds > 0) segmentMeters / dtSeconds else 0.0
    val effectiveSpeed = speedMetersPerSecond ?: estimatedSpeed
    val motionBySpeed = effectiveSpeed >= WALKING_SPEED_THRESHOLD_MPS
    val motionBySegment = segmentMeters >= GPS_MOTION_SEGMENT_METERS && dtSeconds <= GPS_MOTION_MAX_DT_SECONDS
    return motionBySpeed || motionBySegment
  }

  fun shouldUseGpsStepFallback(snapshot: WalkTrackingSnapshot, nowMs: Long = System.currentTimeMillis()): Boolean {
    if (snapshot.paused || !snapshot.locationPermissionGranted) return false

    val blockedUntilMs = snapshot.stepFallbackBlockedUntilMs
    if (blockedUntilMs != null && nowMs < blockedUntilMs) return false

    val gpsWalkingSinceAtMs = snapshot.gpsWalkingSinceAtMs ?: return false
    if (!snapshot.activityPermissionGranted || !snapshot.stepCounterAvailable) {
      return true
    }

    if (snapshot.lastStepAtMs != null) return false

    return nowMs - gpsWalkingSinceAtMs >= GPS_FALLBACK_ACTIVATION_MS
  }

  fun fallbackBlockedUntilMs(nowMs: Long): Long = nowMs + STEP_FALLBACK_BLOCK_MS

  fun estimateStepsFromDistance(distanceMeters: Double): Int {
    return kotlin.math.max(0, kotlin.math.round(distanceMeters / STEP_ESTIMATED_STRIDE_METERS).toInt())
  }

  private fun isInCalibrationWindow(snapshot: WalkTrackingSnapshot, nowMs: Long): Boolean {
    val blockedUntilMs = snapshot.stepFallbackBlockedUntilMs ?: return nowMs - snapshot.sessionStartMs < CALIBRATION_WINDOW_MS
    return nowMs < blockedUntilMs - (STEP_FALLBACK_BLOCK_MS - CALIBRATION_WINDOW_MS)
  }

  private fun isRecent(timestampMs: Long?, nowMs: Long): Boolean {
    return timestampMs != null && nowMs - timestampMs <= WALKING_LATCH_MS
  }
}
