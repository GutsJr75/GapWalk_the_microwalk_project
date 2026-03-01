package com.gapwalk.app.walk

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import org.json.JSONObject

object WalkTrackingStorage {
  private const val PREFS_NAME = "gapwalk_walk_tracking"
  private const val KEY_SNAPSHOT = "snapshot"

  fun load(context: Context): WalkTrackingSnapshot? {
    val jsonString = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getString(KEY_SNAPSHOT, null) ?: return null

    return runCatching {
      val json = JSONObject(jsonString)
      WalkTrackingSnapshot(
        sessionId = json.getString("sessionId"),
        planId = json.optStringOrNull("planId"),
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
      .put("stepCounterAvailable", snapshot.stepCounterAvailable)
      .put("stepCounterDisabledForSession", snapshot.stepCounterDisabledForSession)

    json.putNullable("planId", snapshot.planId)
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

  fun toWritableMap(snapshot: WalkTrackingSnapshot?): WritableMap? {
    if (snapshot == null) return null

    return Arguments.createMap().apply {
      putString("sessionId", snapshot.sessionId)
      putString("planId", snapshot.planId)
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
}
