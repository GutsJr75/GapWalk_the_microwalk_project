package com.gapwalk.app.walk

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorManager
import android.os.Build
import androidx.core.content.ContextCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt

object WalkTrackingSessionController {
  private const val BACKGROUND_WARNING =
    "Background location is off. Distance updates may pause when the app is not visible."

  fun startSession(context: Context, planId: String?): WalkTrackingSnapshot {
    val nowMs = System.currentTimeMillis()
    val existing = WalkTrackingStorage.load(context)
    val snapshot = refreshPermissions(
      existing ?: WalkTrackingSnapshot(
        sessionId = "s-$nowMs",
        planId = planId,
        startIso = isoTimestamp(nowMs),
        sessionStartMs = nowMs,
        stepFallbackBlockedUntilMs = WalkTrackingClassifier.fallbackBlockedUntilMs(nowMs),
      ),
      context,
    )

    return refreshAndSave(
      context,
      snapshot.copy(
        planId = snapshot.planId ?: planId,
        stepFallbackBlockedUntilMs = snapshot.stepFallbackBlockedUntilMs ?: WalkTrackingClassifier.fallbackBlockedUntilMs(nowMs),
      ),
      nowMs,
    )
  }

  fun pause(context: Context, source: String): WalkTrackingSnapshot? {
    val snapshot = WalkTrackingStorage.load(context) ?: return null
    if (snapshot.paused) return refreshAndSave(context, snapshot)

    val nowMs = System.currentTimeMillis()
    return refreshAndSave(
      context,
      snapshot.copy(
        paused = true,
        pauseStartedAtMs = nowMs,
        prompt = null,
        lastActionSource = source,
        gpsWalkingSinceAtMs = null,
      ),
      nowMs,
    )
  }

  fun resume(context: Context, source: String): WalkTrackingSnapshot? {
    val snapshot = WalkTrackingStorage.load(context) ?: return null
    if (!snapshot.paused) return refreshAndSave(context, snapshot)

    return refreshAndSave(
      context,
      applyResumeState(snapshot, System.currentTimeMillis(), source),
    )
  }

  fun requestEndConfirmation(context: Context): WalkTrackingSnapshot? {
    val snapshot = WalkTrackingStorage.load(context) ?: return null
    return refreshAndSave(context, snapshot.copy(prompt = "end_confirmation"))
  }

  fun cancelEndConfirmation(context: Context): WalkTrackingSnapshot? {
    val snapshot = WalkTrackingStorage.load(context) ?: return null
    return refreshAndSave(context, snapshot.copy(prompt = null))
  }

  fun confirmEndSession(context: Context): WalkTrackingSnapshot? {
    val snapshot = WalkTrackingStorage.load(context) ?: return null
    val finalSnapshot = hydrateSnapshot(
      refreshPermissions(snapshot, context).copy(prompt = null),
      nowMs = System.currentTimeMillis(),
    )
    WalkTrackingStorage.clear(context)
    return finalSnapshot
  }

  fun refreshTick(context: Context, nowMs: Long = System.currentTimeMillis()): WalkTrackingSnapshot? {
    val snapshot = WalkTrackingStorage.load(context) ?: return null
    var next = refreshPermissions(snapshot, context)

    if (WalkTrackingClassifier.shouldAutoPause(next, nowMs)) {
      next = next.copy(
        paused = true,
        pauseStartedAtMs = nowMs,
        prompt = null,
        lastActionSource = "auto_pause",
        gpsWalkingSinceAtMs = null,
      )
    }

    return refreshAndSave(context, next, nowMs)
  }

  fun applyStepCounter(
    context: Context,
    rawStepCount: Float,
    nowMs: Long = System.currentTimeMillis(),
  ): WalkTrackingSnapshot? {
    val snapshot = WalkTrackingStorage.load(context) ?: return null
    val refreshed = refreshPermissions(snapshot, context)
    val anchor = resolveStepCounterAnchor(
      existingSteps = refreshed.steps,
      rawStepCount = rawStepCount,
      currentAnchor = refreshed.stepCounterAnchor,
    )

    val next = if (refreshed.paused) {
      refreshed.copy(
        stepCounterAnchor = anchor,
        lastRawStepCounter = rawStepCount,
      )
    } else {
      val sensorEventReceived = refreshed.lastRawStepCounter == null || rawStepCount > refreshed.lastRawStepCounter
      val resolvedSteps = resolveSessionSteps(
        existingSteps = refreshed.steps,
        rawStepCount = rawStepCount,
        anchor = anchor,
      )

      refreshed.copy(
        stepCounterAnchor = anchor,
        lastRawStepCounter = rawStepCount,
        steps = resolvedSteps,
        stepSource = if (sensorEventReceived) "sensor" else refreshed.stepSource,
        hadWalkingSignal = sensorEventReceived || refreshed.hadWalkingSignal,
        lastStepAtMs = if (sensorEventReceived) nowMs else refreshed.lastStepAtMs,
        lastMotionAtMs = if (sensorEventReceived) nowMs else refreshed.lastMotionAtMs,
        gpsWalkingSinceAtMs = if (sensorEventReceived) null else refreshed.gpsWalkingSinceAtMs,
      )
    }

    return refreshAndSave(context, next, nowMs)
  }

  fun applyLocationSample(
    context: Context,
    latitude: Double,
    longitude: Double,
    timestampMs: Long,
    speedMetersPerSecond: Float?,
  ): WalkTrackingSnapshot? {
    val snapshot = WalkTrackingStorage.load(context) ?: return null
    val refreshed = refreshPermissions(snapshot, context)
    var next = refreshed.copy(
      lastLatitude = latitude,
      lastLongitude = longitude,
      lastLocationTimestampMs = timestampMs,
    )

    val previousLat = refreshed.lastLatitude
    val previousLon = refreshed.lastLongitude
    val previousTimestamp = refreshed.lastLocationTimestampMs

    if (previousLat != null && previousLon != null && previousTimestamp != null) {
      val segmentMeters = haversineMeters(previousLat, previousLon, latitude, longitude)
      val dtSeconds = max(1L, timestampMs - previousTimestamp).toDouble() / 1000.0
      val speedValue = speedMetersPerSecond?.takeIf { it >= 0f }?.toDouble()
      val moving = !refreshed.paused && WalkTrackingClassifier.isWalkingGpsSignal(segmentMeters, dtSeconds, speedValue)

      next = next.copy(
        gpsWalkingSinceAtMs = when {
          refreshed.paused || !moving -> null
          refreshed.lastGpsMotionAtMs != null &&
            timestampMs - refreshed.lastGpsMotionAtMs <= WalkTrackingClassifier.WALKING_LATCH_MS ->
            refreshed.gpsWalkingSinceAtMs ?: timestampMs
          else -> timestampMs
        },
      )

      if (!refreshed.paused && WalkTrackingClassifier.shouldAcceptDistanceSegment(segmentMeters)) {
        var locationNext = next.copy(
          distanceMeters = refreshed.distanceMeters + segmentMeters,
          usedLocation = true,
          lastAcceptedLocationAtMs = timestampMs,
        )

        if (moving) {
          locationNext = locationNext.copy(
            hadWalkingSignal = true,
            lastGpsMotionAtMs = timestampMs,
            lastMotionAtMs = timestampMs,
          )
        }

        if (WalkTrackingClassifier.shouldUseGpsStepFallback(locationNext, timestampMs)) {
          locationNext = locationNext.copy(
            steps = max(
              refreshed.steps,
              WalkTrackingClassifier.estimateStepsFromDistance(locationNext.distanceMeters),
            ),
            stepSource = "gps_fallback",
          )
        }

        next = locationNext
      } else if (moving) {
        next = next.copy(
          hadWalkingSignal = true,
          lastGpsMotionAtMs = timestampMs,
          lastMotionAtMs = timestampMs,
        )
      }
    }

    return refreshAndSave(context, next, timestampMs)
  }

  fun applyAccelMotion(
    context: Context,
    nowMs: Long = System.currentTimeMillis(),
  ): WalkTrackingSnapshot? {
    val snapshot = WalkTrackingStorage.load(context) ?: return null
    if (snapshot.paused) return null

    val next = snapshot.copy(
      lastAccelMotionAtMs = nowMs,
      hadWalkingSignal = true,
      lastMotionAtMs = nowMs,
    )
    return refreshAndSave(context, next, nowMs)
  }

  fun updateStepSensorRegistration(
    context: Context,
    sensorDetected: Boolean,
    registrationSucceeded: Boolean,
  ): WalkTrackingSnapshot? {
    val snapshot = WalkTrackingStorage.load(context) ?: return null
    return refreshAndSave(
      context,
      snapshot.copy(
        stepCounterDisabledForSession = sensorDetected && !registrationSucceeded,
      ),
    )
  }

  internal fun resolveStepCounterAnchor(
    existingSteps: Int,
    rawStepCount: Float,
    currentAnchor: Float?,
  ): Float {
    return currentAnchor ?: (rawStepCount - existingSteps.toFloat())
  }

  internal fun resolveSessionSteps(
    existingSteps: Int,
    rawStepCount: Float,
    anchor: Float,
  ): Int {
    val sessionStepCount = floor(max(0f, rawStepCount - anchor).toDouble()).toInt()
    return max(existingSteps, sessionStepCount)
  }

  internal fun applyResumeState(
    snapshot: WalkTrackingSnapshot,
    nowMs: Long,
    source: String,
  ): WalkTrackingSnapshot {
    val pauseStartedAtMs = snapshot.pauseStartedAtMs ?: nowMs
    return snapshot.copy(
      paused = false,
      pauseStartedAtMs = null,
      totalPausedMs = snapshot.totalPausedMs + max(0L, nowMs - pauseStartedAtMs),
      prompt = null,
      lastActionSource = source,
      lastMotionAtMs = null,
      lastStepAtMs = null,
      lastGpsMotionAtMs = null,
      lastAccelMotionAtMs = null,
      gpsWalkingSinceAtMs = null,
      stepFallbackBlockedUntilMs = WalkTrackingClassifier.fallbackBlockedUntilMs(nowMs),
      stepCounterAnchor = reanchorAfterResume(
        existingSteps = snapshot.steps,
        lastRawStepCounter = snapshot.lastRawStepCounter,
        currentAnchor = snapshot.stepCounterAnchor,
      ),
      stepSource = "none",
    )
  }

  internal fun reanchorAfterResume(
    existingSteps: Int,
    lastRawStepCounter: Float?,
    currentAnchor: Float?,
  ): Float? {
    return lastRawStepCounter?.minus(existingSteps.toFloat()) ?: currentAnchor
  }

  private fun refreshAndSave(
    context: Context,
    snapshot: WalkTrackingSnapshot,
    nowMs: Long = System.currentTimeMillis(),
  ): WalkTrackingSnapshot {
    val next = hydrateSnapshot(refreshPermissions(snapshot, context), nowMs)

    WalkTrackingStorage.save(context, next)
    return next
  }

  private fun hydrateSnapshot(
    snapshot: WalkTrackingSnapshot,
    nowMs: Long = System.currentTimeMillis(),
  ): WalkTrackingSnapshot {
    val classification = WalkTrackingClassifier.classify(snapshot, nowMs)
    return snapshot.copy(
      elapsedSeconds = snapshot.computedElapsedSeconds(nowMs),
      motionState = classification.motionState,
      displayState = classification.displayState,
      pedometerHealth = classification.pedometerHealth,
      locationHealth = classification.locationHealth,
      motionConfidence = classification.motionConfidence,
      statusReason = classification.statusReason,
    )
  }

  private fun refreshPermissions(snapshot: WalkTrackingSnapshot, context: Context): WalkTrackingSnapshot {
    val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    val sensorDetected = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null
    val hasLocationPermission = hasAnyPermission(
      context,
      Manifest.permission.ACCESS_FINE_LOCATION,
      Manifest.permission.ACCESS_COARSE_LOCATION,
    )
    val hasBackgroundLocation = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      hasPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
    } else {
      hasLocationPermission
    }
    val hasActivityPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      hasPermission(context, Manifest.permission.ACTIVITY_RECOGNITION)
    } else {
      true
    }

    return snapshot.copy(
      locationPermissionGranted = hasLocationPermission,
      backgroundLocationGranted = hasBackgroundLocation,
      activityPermissionGranted = hasActivityPermission,
      warning = if (hasLocationPermission && !hasBackgroundLocation) BACKGROUND_WARNING else null,
      usedLocation = snapshot.usedLocation || (hasLocationPermission && snapshot.lastAcceptedLocationAtMs != null),
      stepCounterAvailable = sensorDetected && !snapshot.stepCounterDisabledForSession,
    )
  }

  private fun hasAnyPermission(context: Context, vararg permissions: String): Boolean {
    return permissions.any { hasPermission(context, it) }
  }

  private fun hasPermission(context: Context, permission: String): Boolean {
    return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
  }

  private fun isoTimestamp(nowMs: Long): String {
    val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    formatter.timeZone = TimeZone.getTimeZone("UTC")
    return formatter.format(Date(nowMs))
  }

  private fun haversineMeters(
    startLat: Double,
    startLon: Double,
    endLat: Double,
    endLon: Double,
  ): Double {
    val earthRadius = 6_371_000.0
    val lat1 = Math.toRadians(startLat)
    val lat2 = Math.toRadians(endLat)
    val dLat = Math.toRadians(endLat - startLat)
    val dLon = Math.toRadians(endLon - startLon)
    val a = sin(dLat / 2) * sin(dLat / 2) +
      cos(lat1) * cos(lat2) * sin(dLon / 2) * sin(dLon / 2)
    val c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return earthRadius * c
  }
}
