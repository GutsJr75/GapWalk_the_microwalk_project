package com.gapwalk.app.walk

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.gapwalk.app.MainActivity
import com.gapwalk.app.R
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

class WalkTrackingService : Service(), SensorEventListener {
  companion object {
    private const val TAG = "WalkTrackingService"
    const val CHANNEL_ID = "gapwalk-walk-session"
    const val NOTIFICATION_ID = 2026
    const val ACTION_SYNC = "com.gapwalk.app.walk.SYNC"
    const val ACTION_PAUSE = "com.gapwalk.app.walk.PAUSE"
    const val ACTION_RESUME = "com.gapwalk.app.walk.RESUME"
    const val ACTION_REQUEST_END_CONFIRMATION = "com.gapwalk.app.walk.REQUEST_END_CONFIRMATION"

    fun startOrSync(context: Context) {
      val intent = Intent(context, WalkTrackingService::class.java).apply {
        action = ACTION_SYNC
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, WalkTrackingService::class.java))
    }
  }

  private val mainHandler = Handler(Looper.getMainLooper())
  private val tickRunnable = object : Runnable {
    override fun run() {
      try {
        var snapshot = WalkTrackingSessionController.refreshTick(applicationContext)
        if (snapshot == null) {
          stopSelf()
          return
        }

        snapshot = syncSensors(snapshot)

        // Feed any detector timestamp that has not yet been applied to the session.
        val detectorMotionAtMs = accelDetector?.lastMotionDetectedAtMs
        if (!snapshot.paused && detectorMotionAtMs != null) {
          val lastAppliedAccelMotionAtMs = snapshot.lastAccelMotionAtMs
          if (lastAppliedAccelMotionAtMs == null || detectorMotionAtMs > lastAppliedAccelMotionAtMs) {
            val accelSnapshot = WalkTrackingSessionController.applyAccelMotion(
              context = applicationContext,
              nowMs = detectorMotionAtMs,
            )
            if (accelSnapshot != null) {
              snapshot = accelSnapshot
            }
          }
        }

        currentSnapshot = snapshot
        emitSnapshot(snapshot)
        updateNotification(snapshot)
        mainHandler.postDelayed(this, 1_000L)
      } catch (error: Throwable) {
        Log.e(TAG, "Walk tracking tick failed", error)
        stopSelf()
      }
    }
  }

  private lateinit var fusedLocationClient: FusedLocationProviderClient
  private lateinit var sensorManager: SensorManager
  private var stepCounterSensor: Sensor? = null
  private var locationCallback: LocationCallback? = null
  private var isLocationSubscribed = false
  private var isSensorSubscribed = false
  private var currentSnapshot: WalkTrackingSnapshot? = null
  private var accelDetector: AccelerometerMotionDetector? = null
  private var isAccelSubscribed = false

  override fun onCreate() {
    super.onCreate()
    fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
    sensorManager = getSystemService(SENSOR_SERVICE) as SensorManager
    stepCounterSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
    accelDetector = AccelerometerMotionDetector(sensorManager)
    ensureNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    return try {
      var snapshot = WalkTrackingSessionController.refreshTick(applicationContext)
      if (snapshot == null) {
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        START_NOT_STICKY
      } else {
        snapshot = syncSensors(snapshot)
        currentSnapshot = snapshot
        startForegroundCompat(buildNotification(snapshot))
        emitSnapshot(snapshot)
        mainHandler.removeCallbacks(tickRunnable)
        mainHandler.post(tickRunnable)
        START_STICKY
      }
    } catch (error: Throwable) {
      Log.e(TAG, "Walk tracking service failed to start", error)
      stopSelf()
      START_NOT_STICKY
    }
  }

  override fun onDestroy() {
    mainHandler.removeCallbacks(tickRunnable)
    unsubscribeLocation()
    unsubscribeStepSensor()
    unsubscribeAccelDetector()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onSensorChanged(event: SensorEvent?) {
    try {
      if (event?.sensor?.type != Sensor.TYPE_STEP_COUNTER) return
      val rawStepCount = event.values.firstOrNull() ?: return
      val snapshot = WalkTrackingSessionController.applyStepCounter(
        context = applicationContext,
        rawStepCount = rawStepCount,
      ) ?: return

      currentSnapshot = snapshot
      emitSnapshot(snapshot)
      updateNotification(snapshot)
    } catch (error: Throwable) {
      Log.e(TAG, "Step sensor update failed", error)
    }
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
    // No-op.
  }

  private fun syncSensors(snapshot: WalkTrackingSnapshot): WalkTrackingSnapshot {
    var next = snapshot

    if (snapshot.locationPermissionGranted) {
      subscribeLocation()
    } else {
      unsubscribeLocation()
    }

    if (snapshot.activityPermissionGranted && stepCounterSensor != null) {
      val registered = subscribeStepSensor()
      val registrationChanged = (snapshot.stepCounterAvailable != registered)
      if (registrationChanged) {
        next = WalkTrackingSessionController.updateStepSensorRegistration(
          context = applicationContext,
          sensorDetected = true,
          registrationSucceeded = registered,
        ) ?: snapshot
      }
    } else {
      unsubscribeStepSensor()
    }

    if (snapshot.paused) {
      unsubscribeAccelDetector()
    } else {
      subscribeAccelDetector()
    }

    return next
  }

  private fun subscribeLocation() {
    if (isLocationSubscribed) return

    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1_000L)
      .setMinUpdateIntervalMillis(1_000L)
      .setMinUpdateDistanceMeters(1f)
      .build()

    locationCallback = object : LocationCallback() {
      override fun onLocationResult(result: LocationResult) {
        result.locations.forEach { location ->
          val snapshot = WalkTrackingSessionController.applyLocationSample(
            context = applicationContext,
            latitude = location.latitude,
            longitude = location.longitude,
            timestampMs = location.time,
            speedMetersPerSecond = location.speed,
          ) ?: return@forEach

          currentSnapshot = snapshot
          emitSnapshot(snapshot)
          updateNotification(snapshot)
        }
      }
    }

    val callback = locationCallback ?: return
    runCatching {
      fusedLocationClient.requestLocationUpdates(request, callback, Looper.getMainLooper())
    }.onSuccess {
      isLocationSubscribed = true
    }.onFailure { error ->
      Log.e(TAG, "Location subscription failed", error)
      locationCallback = null
      isLocationSubscribed = false
    }
  }

  private fun unsubscribeLocation() {
    val callback = locationCallback ?: return
    runCatching {
      fusedLocationClient.removeLocationUpdates(callback)
    }.onFailure { error ->
      Log.w(TAG, "Location unsubscribe failed", error)
    }
    locationCallback = null
    isLocationSubscribed = false
  }

  private fun subscribeStepSensor(): Boolean {
    if (isSensorSubscribed) return true
    val sensor = stepCounterSensor ?: return false
    val registered = runCatching {
      sensorManager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL)
    }.getOrElse { error ->
      Log.e(TAG, "Step sensor registration failed", error)
      false
    }
    isSensorSubscribed = registered
    return registered
  }

  private fun unsubscribeStepSensor() {
    if (!isSensorSubscribed) return
    val sensor = stepCounterSensor
    if (sensor != null) {
      runCatching {
        sensorManager.unregisterListener(this, sensor)
      }.onFailure { error ->
        Log.w(TAG, "Step sensor unregister failed", error)
      }
    } else {
      runCatching {
        sensorManager.unregisterListener(this)
      }.onFailure { error ->
        Log.w(TAG, "Step sensor unregister failed", error)
      }
    }
    isSensorSubscribed = false
  }

  private fun subscribeAccelDetector() {
    if (isAccelSubscribed) {
      // Re-register if the detector has gone completely silent (sensor killed by OS power management).
      // Allow up to 10 seconds of silence before forcing a re-subscribe.
      val lastEventAt = accelDetector?.lastSensorEventAtMs
      val now = System.currentTimeMillis()
      val sensorSilent = lastEventAt == null || now - lastEventAt > 10_000L
      if (sensorSilent) {
        accelDetector?.stop()
        isAccelSubscribed = false
      } else {
        return
      }
    }
    val registered = runCatching {
      accelDetector?.start() ?: false
    }.getOrElse { error ->
      Log.e(TAG, "Accelerometer detector registration failed", error)
      false
    }
    isAccelSubscribed = registered
  }

  private fun unsubscribeAccelDetector() {
    if (!isAccelSubscribed) return
    runCatching {
      accelDetector?.stop()
    }.onFailure { error ->
      Log.w(TAG, "Accelerometer detector unregister failed", error)
    }
    isAccelSubscribed = false
  }

  private fun updateNotification(snapshot: WalkTrackingSnapshot) {
    runCatching {
      val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
      manager.notify(NOTIFICATION_ID, buildNotification(snapshot))
    }.onFailure { error ->
      Log.e(TAG, "Walk notification update failed", error)
    }
  }

  private fun emitSnapshot(snapshot: WalkTrackingSnapshot) {
    WalkTrackingModule.emitSnapshot(snapshot)
  }

  private fun buildNotification(snapshot: WalkTrackingSnapshot): Notification {
    val openAppIntent = PendingIntent.getActivity(
      this,
      1,
      Intent(this, MainActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        putExtra("walk_open", true)
        if (snapshot.prompt != null) {
          putExtra("walk_prompt", snapshot.prompt)
        }
      },
      PendingIntent.FLAG_UPDATE_CURRENT or pendingIntentImmutableFlag(),
    )

    val actionIntent = PendingIntent.getBroadcast(
      this,
      2,
      Intent(this, WalkTrackingNotificationReceiver::class.java).apply {
        action = if (snapshot.paused) ACTION_RESUME else ACTION_PAUSE
      },
      PendingIntent.FLAG_UPDATE_CURRENT or pendingIntentImmutableFlag(),
    )

    val endIntent = PendingIntent.getBroadcast(
      this,
      3,
      Intent(this, WalkTrackingNotificationReceiver::class.java).apply {
        action = ACTION_REQUEST_END_CONFIRMATION
      },
      PendingIntent.FLAG_UPDATE_CURRENT or pendingIntentImmutableFlag(),
    )

    val timerLine = WalkNotificationContent.resolveTimerLine(snapshot)
    val summaryLine = WalkNotificationContent.buildSummaryLine(snapshot)
    val notifTitle = "MicroWalk Session"
    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_notification_walk)
      .setColor(ContextCompat.getColor(this, R.color.gapwalk_accent))
      .setColorized(false)
      .setContentTitle(notifTitle)
      .setContentText(timerLine)
      .setStyle(NotificationCompat.BigTextStyle().bigText(summaryLine))
      .setContentIntent(openAppIntent)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .addAction(
        0,
        if (snapshot.paused) "Resume" else "Pause",
        actionIntent,
      )
      .addAction(0, "End walk", endIntent)
      .setUsesChronometer(false)

    return builder.build()
  }

  private fun startForegroundCompat(notification: Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      // Android 14+ requires each foreground service type to be declared separately.
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION or ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH,
      )
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Active walk session",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Live walk session tracking"
      setSound(null, null)
      enableVibration(false)
      setShowBadge(false)
    }

    manager.createNotificationChannel(channel)
  }

  private fun pendingIntentImmutableFlag(): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PendingIntent.FLAG_IMMUTABLE
    } else {
      0
    }
  }
}
