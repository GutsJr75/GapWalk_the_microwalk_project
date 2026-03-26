package com.gapwalk.app.walk

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.max

object WalkTrackingStorage {
  private const val PREFS_NAME = "gapwalk_walk_tracking"
  private const val KEY_SNAPSHOT = "snapshot"
  private const val KEY_PENDING_QUICK_END_COMPLETION = "pending_quick_end_completion"

  fun load(context: Context): WalkTrackingSnapshot? {
    val jsonString = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getString(KEY_SNAPSHOT, null) ?: return null

    return runCatching {
      val json = JSONObject(jsonString)
      WalkTrackingSnapshot(
        sessionId = json.getString("sessionId"),
        planId = json.optStringOrNull("planId"),
        targetDurationMinutes = json.optIntOrNull("targetDurationMinutes"),
        startedFromNotification = json.optBoolean("startedFromNotification", false),
        notificationTimerMode = WalkNotificationContent.normalizeTimerMode(json.optStringOrNull("notificationTimerMode")),
        notificationStatsMode = WalkNotificationContent.normalizeStatsMode(json.optStringOrNull("notificationStatsMode")),
        distanceUnit = WalkNotificationContent.normalizeDistanceUnit(
          json.optStringOrNull("distanceUnit") ?: WalkNotificationContent.DISTANCE_UNIT_MI,
        ),
        startIso = json.getString("startIso"),
        sessionStartMs = json.getLong("sessionStartMs"),
        totalPausedMs = json.optLong("totalPausedMs", 0L),
        pauseStartedAtMs = json.optLongOrNull("pauseStartedAtMs"),
        elapsedSeconds = json.optInt("elapsedSeconds", 0),
        paused = json.optBoolean("paused", false),
        motionState = json.optString("motionState", "starting"),
        displayState = json.optString("displayState", "calibrating"),
        pedometerHealth = json.optString("pedometerHealth", "stale"),
        locationHealth = json.optString("locationHealth", "stale"),
        motionConfidence = json.optString("motionConfidence", "low"),
        stepSource = json.optString("stepSource", "none"),
        statusReason = json.optStringOrNull("statusReason"),
        prompt = json.optStringOrNull("prompt"),
        distanceMeters = json.optDouble("distanceMeters", 0.0),
        steps = json.optInt("steps", 0),
        usedLocation = json.optBoolean("usedLocation", false),
        locationPermissionGranted = json.optBoolean("locationPermissionGranted", false),
        backgroundLocationGranted = json.optBoolean("backgroundLocationGranted", false),
        activityPermissionGranted = json.optBoolean("activityPermissionGranted", false),
        hadWalkingSignal = json.optBoolean("hadWalkingSignal", false),
        lastActionSource = json.optStringOrNull("lastActionSource"),
        warning = json.optStringOrNull("warning"),
        lastMotionAtMs = json.optLongOrNull("lastMotionAtMs"),
        lastStepAtMs = json.optLongOrNull("lastStepAtMs"),
        lastGpsMotionAtMs = json.optLongOrNull("lastGpsMotionAtMs"),
        lastAcceptedLocationAtMs = json.optLongOrNull("lastAcceptedLocationAtMs"),
        lastLatitude = json.optDoubleOrNull("lastLatitude"),
        lastLongitude = json.optDoubleOrNull("lastLongitude"),
        lastLocationTimestampMs = json.optLongOrNull("lastLocationTimestampMs"),
        gpsWalkingSinceAtMs = json.optLongOrNull("gpsWalkingSinceAtMs"),
        stepFallbackBlockedUntilMs = json.optLongOrNull("stepFallbackBlockedUntilMs"),
        stepCounterAvailable = json.optBoolean("stepCounterAvailable", false),
        stepCounterDisabledForSession = json.optBoolean("stepCounterDisabledForSession", false),
        stepCounterAnchor = json.optDoubleOrNull("stepCounterAnchor")?.toFloat(),
        lastRawStepCounter = json.optDoubleOrNull("lastRawStepCounter")?.toFloat(),
        lastAccelMotionAtMs = json.optLongOrNull("lastAccelMotionAtMs"),
      )
    }.getOrNull()
  }

  fun save(context: Context, snapshot: WalkTrackingSnapshot) {
    val json = JSONObject()
      .put("sessionId", snapshot.sessionId)
      .put("startIso", snapshot.startIso)
      .put("sessionStartMs", snapshot.sessionStartMs)
      .put("totalPausedMs", snapshot.totalPausedMs)
      .put("elapsedSeconds", snapshot.elapsedSeconds)
      .put("paused", snapshot.paused)
      .put("motionState", snapshot.motionState)
      .put("displayState", snapshot.displayState)
      .put("pedometerHealth", snapshot.pedometerHealth)
      .put("locationHealth", snapshot.locationHealth)
      .put("motionConfidence", snapshot.motionConfidence)
      .put("stepSource", snapshot.stepSource)
      .put("distanceMeters", snapshot.distanceMeters)
      .put("steps", snapshot.steps)
      .put("usedLocation", snapshot.usedLocation)
      .put("locationPermissionGranted", snapshot.locationPermissionGranted)
      .put("backgroundLocationGranted", snapshot.backgroundLocationGranted)
      .put("activityPermissionGranted", snapshot.activityPermissionGranted)
      .put("hadWalkingSignal", snapshot.hadWalkingSignal)
      .put("startedFromNotification", snapshot.startedFromNotification)
      .put("notificationTimerMode", WalkNotificationContent.normalizeTimerMode(snapshot.notificationTimerMode))
      .put("notificationStatsMode", WalkNotificationContent.normalizeStatsMode(snapshot.notificationStatsMode))
      .put("distanceUnit", WalkNotificationContent.normalizeDistanceUnit(snapshot.distanceUnit))
      .put("stepCounterAvailable", snapshot.stepCounterAvailable)
      .put("stepCounterDisabledForSession", snapshot.stepCounterDisabledForSession)

    json.putNullable("planId", snapshot.planId)
    json.putNullable("targetDurationMinutes", snapshot.targetDurationMinutes)
    json.putNullable("lastActionSource", snapshot.lastActionSource)
    json.putNullable("pauseStartedAtMs", snapshot.pauseStartedAtMs)
    json.putNullable("prompt", snapshot.prompt)
    json.putNullable("warning", snapshot.warning)
    json.putNullable("statusReason", snapshot.statusReason)
    json.putNullable("lastMotionAtMs", snapshot.lastMotionAtMs)
    json.putNullable("lastStepAtMs", snapshot.lastStepAtMs)
    json.putNullable("lastGpsMotionAtMs", snapshot.lastGpsMotionAtMs)
    json.putNullable("lastAcceptedLocationAtMs", snapshot.lastAcceptedLocationAtMs)
    json.putNullable("lastLatitude", snapshot.lastLatitude)
    json.putNullable("lastLongitude", snapshot.lastLongitude)
    json.putNullable("lastLocationTimestampMs", snapshot.lastLocationTimestampMs)
    json.putNullable("gpsWalkingSinceAtMs", snapshot.gpsWalkingSinceAtMs)
    json.putNullable("stepFallbackBlockedUntilMs", snapshot.stepFallbackBlockedUntilMs)
    json.putNullable("stepCounterAnchor", snapshot.stepCounterAnchor?.toDouble())
    json.putNullable("lastRawStepCounter", snapshot.lastRawStepCounter?.toDouble())
    json.putNullable("lastAccelMotionAtMs", snapshot.lastAccelMotionAtMs)

    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_SNAPSHOT, json.toString())
      .apply()
  }

  fun clear(context: Context) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .remove(KEY_SNAPSHOT)
      .apply()
  }

  fun buildQuickEndCompletionPayload(
    snapshot: WalkTrackingSnapshot?,
    endedAtMs: Long = System.currentTimeMillis(),
  ): JSONObject? {
    if (snapshot == null) return null

    val currentPauseMs = snapshot.pauseStartedAtMs?.let { max(0L, endedAtMs - it) } ?: 0L
    val pausedSeconds = ((snapshot.totalPausedMs + currentPauseMs) / 1000L).toInt()

    return JSONObject().apply {
      put("sessionId", snapshot.sessionId)
      put("planId", snapshot.planId ?: JSONObject.NULL)
      put("startIso", snapshot.startIso)
      put("endIso", isoTimestamp(endedAtMs))
      put("activeSeconds", snapshot.computedElapsedSeconds(endedAtMs))
      put("pausedSeconds", pausedSeconds)
      put("distanceMeters", snapshot.distanceMeters)
      put("steps", snapshot.steps)
      put("usedLocation", snapshot.usedLocation)
      put("stepSource", snapshot.stepSource)
      put("motionConfidence", snapshot.motionConfidence)
      put("sensorHealthAtStart", snapshot.pedometerHealth)
      put("hadWalkingSignal", snapshot.hadWalkingSignal)
      put("distanceUnit", snapshot.distanceUnit)
    }
  }

  fun savePendingQuickEndCompletion(context: Context, payload: JSONObject?) {
    if (payload == null) return
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_PENDING_QUICK_END_COMPLETION, payload.toString())
      .apply()
  }

  fun takePendingQuickEndCompletion(context: Context): JSONObject? {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val raw = prefs.getString(KEY_PENDING_QUICK_END_COMPLETION, null) ?: return null
    prefs.edit().remove(KEY_PENDING_QUICK_END_COMPLETION).apply()
    return runCatching { JSONObject(raw) }.getOrNull()
  }

  fun toWritableMap(snapshot: WalkTrackingSnapshot?): WritableMap? {
    if (snapshot == null) return null

    return Arguments.createMap().apply {
      putString("sessionId", snapshot.sessionId)
      putString("planId", snapshot.planId)
      if (snapshot.targetDurationMinutes != null) {
        putDouble("targetDurationMinutes", snapshot.targetDurationMinutes.toDouble())
      } else {
        putNull("targetDurationMinutes")
      }
      putBoolean("startedFromNotification", snapshot.startedFromNotification)
      putString("notificationTimerMode", WalkNotificationContent.normalizeTimerMode(snapshot.notificationTimerMode))
      putString("notificationStatsMode", WalkNotificationContent.normalizeStatsMode(snapshot.notificationStatsMode))
      putString("distanceUnit", WalkNotificationContent.normalizeDistanceUnit(snapshot.distanceUnit))
      putString("startIso", snapshot.startIso)
      putDouble("sessionStartMs", snapshot.sessionStartMs.toDouble())
      putDouble("totalPausedMs", snapshot.totalPausedMs.toDouble())
      if (snapshot.pauseStartedAtMs != null) {
        putDouble("pauseStartedAtMs", snapshot.pauseStartedAtMs.toDouble())
      } else {
        putNull("pauseStartedAtMs")
      }
      putDouble("elapsedSeconds", snapshot.elapsedSeconds.toDouble())
      putBoolean("paused", snapshot.paused)
      putString("motionState", snapshot.motionState)
      putString("displayState", snapshot.displayState)
      putString("pedometerHealth", snapshot.pedometerHealth)
      putString("locationHealth", snapshot.locationHealth)
      putString("motionConfidence", snapshot.motionConfidence)
      putString("stepSource", snapshot.stepSource)
      putString("statusReason", snapshot.statusReason)
      putString("prompt", snapshot.prompt)
      putDouble("distanceMeters", snapshot.distanceMeters)
      putDouble("steps", snapshot.steps.toDouble())
      putBoolean("usedLocation", snapshot.usedLocation)
      putBoolean("locationPermissionGranted", snapshot.locationPermissionGranted)
      putBoolean("backgroundLocationGranted", snapshot.backgroundLocationGranted)
      putBoolean("activityPermissionGranted", snapshot.activityPermissionGranted)
      putBoolean("hadWalkingSignal", snapshot.hadWalkingSignal)
      putString("lastActionSource", snapshot.lastActionSource)
      putString("warning", snapshot.warning)
      putNullableDouble("lastMotionAtMs", snapshot.lastMotionAtMs)
      putNullableDouble("lastStepAtMs", snapshot.lastStepAtMs)
      putNullableDouble("lastGpsMotionAtMs", snapshot.lastGpsMotionAtMs)
      putNullableDouble("lastAcceptedLocationAtMs", snapshot.lastAcceptedLocationAtMs)
      putNullableDouble("lastAccelMotionAtMs", snapshot.lastAccelMotionAtMs)
    }
  }

  fun quickEndPayloadToWritableMap(payload: JSONObject?): WritableMap? {
    if (payload == null) return null

    return Arguments.createMap().apply {
      putString("sessionId", payload.optString("sessionId"))
      val planId = payload.optString("planId")
      if (planId.isNotEmpty()) putString("planId", planId)
      putString("startIso", payload.optString("startIso"))
      putString("endIso", payload.optString("endIso"))
      putInt("activeSeconds", payload.optInt("activeSeconds", 0))
      putInt("pausedSeconds", payload.optInt("pausedSeconds", 0))
      putDouble("distanceMeters", payload.optDouble("distanceMeters", 0.0))
      putInt("steps", payload.optInt("steps", 0))
      putBoolean("usedLocation", payload.optBoolean("usedLocation", false))
      putString("stepSource", payload.optString("stepSource", "none"))
      putString("motionConfidence", payload.optString("motionConfidence", "low"))
      putString("sensorHealthAtStart", payload.optString("sensorHealthAtStart", "stale"))
      putBoolean("hadWalkingSignal", payload.optBoolean("hadWalkingSignal", false))
      putString("distanceUnit", payload.optString("distanceUnit", "mi"))
    }
  }

  private fun isoTimestamp(nowMs: Long): String {
    val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    formatter.timeZone = TimeZone.getTimeZone("UTC")
    return formatter.format(Date(nowMs))
  }

  private fun JSONObject.putNullable(key: String, value: Any?) {
    put(key, value ?: JSONObject.NULL)
  }

  private fun WritableMap.putNullableDouble(key: String, value: Long?) {
    if (value != null) {
      putDouble(key, value.toDouble())
    } else {
      putNull(key)
    }
  }

  private fun JSONObject.optStringOrNull(key: String): String? {
    return if (has(key) && !isNull(key)) getString(key) else null
  }

  private fun JSONObject.optLongOrNull(key: String): Long? {
    return if (has(key) && !isNull(key)) getLong(key) else null
  }

  private fun JSONObject.optDoubleOrNull(key: String): Double? {
    return if (has(key) && !isNull(key)) getDouble(key) else null
  }

  private fun JSONObject.optIntOrNull(key: String): Int? {
    return if (has(key) && !isNull(key)) getInt(key) else null
  }
}
