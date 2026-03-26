package com.gapwalk.app.notifications

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class ExactAlarmNotificationsModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    private var instance: ExactAlarmNotificationsModule? = null

    fun handleLaunchIntent(context: Context, intent: Intent?) {
      val payload = parseResponsePayload(intent) ?: return
      savePendingResponse(context, payload)
      instance?.emitResponse(payload)
    }

    fun handleNotificationDelivered(
      context: Context,
      notificationId: String,
      planId: String?,
      type: String,
    ) {
      val payload = buildDeliveredPayload(notificationId, planId, type)
      savePendingDelivery(context, payload)
      instance?.emitDelivered(payload)
    }
  }

  override fun getName(): String = EXACT_ALARM_MODULE_NAME

  override fun initialize() {
    super.initialize()
    instance = this
    ensureNotificationChannel(reactApplicationContext)
  }

  override fun invalidate() {
    instance = null
    super.invalidate()
  }

  @ReactMethod
  fun canScheduleExactAlarms(promise: Promise) {
    promise.resolve(canScheduleExactAlarmsInternal())
  }

  @ReactMethod
  fun setReminderVibrationEnabled(enabled: Boolean, promise: Promise) {
    try {
      setReminderVibrationEnabled(reactApplicationContext, enabled)
      ensureNotificationChannel(reactApplicationContext)
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("exact_alarm_set_vibration_failed", error)
    }
  }

  @ReactMethod
  fun scheduleNotification(input: ReadableMap, promise: Promise) {
    try {
      if (!canScheduleExactAlarmsInternal()) {
        promise.resolve(false)
        return
      }

      val notificationId = input.getString("notificationId") ?: run {
        promise.resolve(false)
        return
      }
      val planId = input.getString("planId") ?: run {
        promise.resolve(false)
        return
      }
      val type = input.getString("type") ?: run {
        promise.resolve(false)
        return
      }
      val title = input.getString("title") ?: run {
        promise.resolve(false)
        return
      }
      val body = input.getString("body") ?: run {
        promise.resolve(false)
        return
      }
      val scheduledAtMs = if (input.hasKey("scheduledAtMs")) input.getDouble("scheduledAtMs").toLong() else 0L
      if (scheduledAtMs <= System.currentTimeMillis()) {
        promise.resolve(false)
        return
      }

      ensureNotificationChannel(reactApplicationContext)
      val alarmManager =
        reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager

      val alarmIntent = buildAlarmIntent(reactApplicationContext, notificationId).apply {
        putExtra(EXTRA_NOTIFICATION_ID, notificationId)
        putExtra(EXTRA_PLAN_ID, planId)
        putExtra(EXTRA_NOTIFICATION_TYPE, type)
        putExtra(EXTRA_NOTIFICATION_TITLE, title)
        putExtra(EXTRA_NOTIFICATION_BODY, body)
        putExtra(EXTRA_NOTIFICATION_TRIGGER_AT_MS, scheduledAtMs)
      }

      val pendingIntent = PendingIntent.getBroadcast(
        reactApplicationContext,
        requestCodeFor(notificationId),
        alarmIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or pendingIntentImmutableFlag(),
      )

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, scheduledAtMs, pendingIntent)
      } else {
        alarmManager.setExact(AlarmManager.RTC_WAKEUP, scheduledAtMs, pendingIntent)
      }

      addScheduledId(reactApplicationContext, notificationId)
      promise.resolve(true)
    } catch (error: Throwable) {
      promise.reject("exact_alarm_schedule_failed", error)
    }
  }

  @ReactMethod
  fun cancelNotification(notificationId: String, promise: Promise) {
    try {
      cancelScheduledNotification(notificationId)
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("exact_alarm_cancel_failed", error)
    }
  }

  @ReactMethod
  fun dismissNotification(notificationId: String, promise: Promise) {
    try {
      cancelPresentedNotification(reactApplicationContext, notificationId)
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("exact_alarm_dismiss_failed", error)
    }
  }

  @ReactMethod
  fun cancelAllPlanNotifications(promise: Promise) {
    try {
      getScheduledIds(reactApplicationContext).forEach { notificationId ->
        cancelScheduledNotification(notificationId)
      }
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("exact_alarm_cancel_all_failed", error)
    }
  }

  @ReactMethod
  fun consumePendingResponse(promise: Promise) {
    try {
      promise.resolve(payloadToWritableMap(takePendingResponse(reactApplicationContext)))
    } catch (error: Throwable) {
      promise.reject("exact_alarm_consume_response_failed", error)
    }
  }

  @ReactMethod
  fun consumePendingDeliveries(promise: Promise) {
    try {
      promise.resolve(deliveredPayloadsToWritableArray(takePendingDeliveries(reactApplicationContext)))
    } catch (error: Throwable) {
      promise.reject("exact_alarm_consume_deliveries_failed", error)
    }
  }

  @ReactMethod
  fun isRecoveryNeeded(promise: Promise) {
    try {
      promise.resolve(isNotificationsRecoveryNeeded(reactApplicationContext))
    } catch (error: Throwable) {
      promise.reject("exact_alarm_is_recovery_needed_failed", error)
    }
  }

  @ReactMethod
  fun markRecoveryNeeded(reason: String?, promise: Promise) {
    try {
      markNotificationsRecoveryNeeded(reactApplicationContext, reason)
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("exact_alarm_mark_recovery_needed_failed", error)
    }
  }

  @ReactMethod
  fun clearRecoveryNeeded(promise: Promise) {
    try {
      clearNotificationsRecoveryNeeded(reactApplicationContext)
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("exact_alarm_clear_recovery_needed_failed", error)
    }
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required by NativeEventEmitter.
  }

  @ReactMethod
  fun removeListeners(count: Double) {
    // Required by NativeEventEmitter.
  }

  private fun canScheduleExactAlarmsInternal(): Boolean {
    val alarmManager =
      reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      alarmManager.canScheduleExactAlarms()
    } else {
      true
    }
  }

  private fun cancelScheduledNotification(notificationId: String) {
    val alarmManager =
      reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pendingIntent = PendingIntent.getBroadcast(
      reactApplicationContext,
      requestCodeFor(notificationId),
      buildAlarmIntent(reactApplicationContext, notificationId),
      PendingIntent.FLAG_UPDATE_CURRENT or pendingIntentImmutableFlag(),
    )
    alarmManager.cancel(pendingIntent)
    removeScheduledId(reactApplicationContext, notificationId)
  }

  private fun emitResponse(payload: org.json.JSONObject) {
    if (!reactApplicationContext.hasActiveReactInstance()) return
    val map = payloadToWritableMap(payload) ?: return
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EXACT_NOTIFICATION_RESPONSE_EVENT, map)
  }

  private fun emitDelivered(payload: org.json.JSONObject) {
    if (!reactApplicationContext.hasActiveReactInstance()) return
    val map = deliveredPayloadToWritableMap(payload) ?: return
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EXACT_NOTIFICATION_DELIVERED_EVENT, map)
  }

  private fun pendingIntentImmutableFlag(): Int = PendingIntent.FLAG_IMMUTABLE
}
