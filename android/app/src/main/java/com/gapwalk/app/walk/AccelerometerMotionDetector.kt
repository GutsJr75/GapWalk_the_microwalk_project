package com.gapwalk.app.walk

import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import kotlin.math.sqrt

/**
 * Detects walking motion using the device accelerometer.
 *
 * Uses TYPE_LINEAR_ACCELERATION (gravity removed by system) when available,
 * falls back to TYPE_ACCELEROMETER with a low-pass gravity filter.
 *
 * Walking produces a characteristic periodic acceleration pattern. We detect
 * this by computing the variance of acceleration magnitudes over a sliding
 * window. Walking variance is typically >1.2 m²/s⁴, while stationary is <0.4.
 */
class AccelerometerMotionDetector(
  private val sensorManager: SensorManager,
) : SensorEventListener {

  companion object {
    private const val WALKING_VARIANCE_THRESHOLD = 1.2
    private const val WINDOW_SIZE = 30
    private const val MIN_SAMPLES = 10
    private const val GRAVITY_FILTER_ALPHA = 0.8f
  }

  private var sensor: Sensor? = null
  private var useGravityFilter = false
  private var isRegistered = false

  /** Timestamp of the last time walking motion was detected. */
  var lastMotionDetectedAtMs: Long? = null
    private set

  /** Whether the detector currently considers the device to be in walking motion. */
  var isWalkingMotion: Boolean = false
    private set

  // Sliding window of acceleration magnitudes.
  private val magnitudeWindow = FloatArray(WINDOW_SIZE)
  private var windowIndex = 0
  private var sampleCount = 0

  // Gravity estimate for fallback filter.
  private val gravity = FloatArray(3)

  fun start(): Boolean {
    if (isRegistered) return true

    // Prefer linear acceleration (gravity already removed).
    val linearSensor = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)
    if (linearSensor != null) {
      sensor = linearSensor
      useGravityFilter = false
    } else {
      // Fall back to raw accelerometer with gravity filter.
      val accelSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
      if (accelSensor != null) {
        sensor = accelSensor
        useGravityFilter = true
        gravity[0] = 0f; gravity[1] = 0f; gravity[2] = 0f
      } else {
        return false
      }
    }

    val registered = sensorManager.registerListener(
      this,
      sensor,
      SensorManager.SENSOR_DELAY_GAME,
    )
    isRegistered = registered
    return registered
  }

  fun stop() {
    if (!isRegistered) return
    sensorManager.unregisterListener(this)
    isRegistered = false
    sampleCount = 0
    windowIndex = 0
    isWalkingMotion = false
    lastMotionDetectedAtMs = null
  }

  override fun onSensorChanged(event: SensorEvent?) {
    if (event == null) return

    val x: Float
    val y: Float
    val z: Float

    if (useGravityFilter) {
      // Low-pass filter to isolate gravity, then subtract.
      gravity[0] = GRAVITY_FILTER_ALPHA * gravity[0] + (1 - GRAVITY_FILTER_ALPHA) * event.values[0]
      gravity[1] = GRAVITY_FILTER_ALPHA * gravity[1] + (1 - GRAVITY_FILTER_ALPHA) * event.values[1]
      gravity[2] = GRAVITY_FILTER_ALPHA * gravity[2] + (1 - GRAVITY_FILTER_ALPHA) * event.values[2]
      x = event.values[0] - gravity[0]
      y = event.values[1] - gravity[1]
      z = event.values[2] - gravity[2]
    } else {
      x = event.values[0]
      y = event.values[1]
      z = event.values[2]
    }

    val magnitude = sqrt((x * x + y * y + z * z).toDouble()).toFloat()

    magnitudeWindow[windowIndex] = magnitude
    windowIndex = (windowIndex + 1) % WINDOW_SIZE
    if (sampleCount < WINDOW_SIZE) sampleCount++

    if (sampleCount >= MIN_SAMPLES) {
      val variance = computeVariance()
      val walking = variance >= WALKING_VARIANCE_THRESHOLD
      isWalkingMotion = walking
      if (walking) {
        lastMotionDetectedAtMs = System.currentTimeMillis()
      }
    }
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
    // No-op.
  }

  private fun computeVariance(): Double {
    val count = sampleCount.coerceAtMost(WINDOW_SIZE)
    var sum = 0.0
    var sumSq = 0.0
    for (i in 0 until count) {
      val v = magnitudeWindow[i].toDouble()
      sum += v
      sumSq += v * v
    }
    val mean = sum / count
    return (sumSq / count) - (mean * mean)
  }
}
