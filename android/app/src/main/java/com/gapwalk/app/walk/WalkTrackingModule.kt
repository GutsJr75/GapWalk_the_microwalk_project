package com.gapwalk.app.walk

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class WalkTrackingModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    private var instance: WalkTrackingModule? = null

    fun emitSnapshot(snapshot: WalkTrackingSnapshot?) {
      instance?.emitWalkUpdate(snapshot)
    }

    fun emitQuickEndEvent(context: Context, snapshot: WalkTrackingSnapshot?) {
      val payload = WalkTrackingStorage.buildQuickEndCompletionPayload(snapshot) ?: return
      val inst = instance
      if (inst == null) {
        WalkTrackingStorage.savePendingQuickEndCompletion(context, payload)
        return
      }
      if (!inst.reactApplicationContext.hasActiveReactInstance()) {
        WalkTrackingStorage.savePendingQuickEndCompletion(context, payload)
        return
      }

      inst.reactApplicationContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(
          "walkQuickEndCompleted",
          WalkTrackingStorage.quickEndPayloadToWritableMap(payload),
        )
    }
  }

  override fun getName(): String = "WalkTracking"

  override fun initialize() {
    super.initialize()
    instance = this
  }

  override fun invalidate() {
    instance = null
    super.invalidate()
  }

  @ReactMethod
  fun startSession(
    planId: String?,
    targetDurationMinutes: Double?,
    startedFromNotification: Boolean,
    notificationTimerMode: String?,
    notificationStatsMode: String?,
    distanceUnit: String?,
    promise: Promise,
  ) {
    try {
      val snapshot = WalkTrackingSessionController.startSession(
        context = reactApplicationContext,
        planId = planId,
        targetDurationMinutes = targetDurationMinutes?.toInt()?.takeIf { it > 0 },
        startedFromNotification = startedFromNotification,
        notificationTimerMode = notificationTimerMode,
        notificationStatsMode = notificationStatsMode,
        distanceUnit = distanceUnit,
      )
      WalkTrackingService.startOrSync(reactApplicationContext)
      emitWalkUpdate(snapshot)
      promise.resolve(WalkTrackingStorage.toWritableMap(snapshot))
    } catch (error: Throwable) {
      promise.reject("walk_start_failed", error)
    }
  }

  @ReactMethod
  fun pauseSession(source: String, promise: Promise) {
    try {
      val snapshot = WalkTrackingSessionController.pause(reactApplicationContext, source)
      WalkTrackingService.startOrSync(reactApplicationContext)
      emitWalkUpdate(snapshot)
      promise.resolve(WalkTrackingStorage.toWritableMap(snapshot))
    } catch (error: Throwable) {
      promise.reject("walk_pause_failed", error)
    }
  }

  @ReactMethod
  fun resumeSession(source: String, promise: Promise) {
    try {
      val snapshot = WalkTrackingSessionController.resume(reactApplicationContext, source)
      WalkTrackingService.startOrSync(reactApplicationContext)
      emitWalkUpdate(snapshot)
      promise.resolve(WalkTrackingStorage.toWritableMap(snapshot))
    } catch (error: Throwable) {
      promise.reject("walk_resume_failed", error)
    }
  }

  @ReactMethod
  fun requestEndConfirmation(promise: Promise) {
    try {
      val snapshot = WalkTrackingSessionController.requestEndConfirmation(reactApplicationContext)
      WalkTrackingService.startOrSync(reactApplicationContext)
      emitWalkUpdate(snapshot)
      promise.resolve(WalkTrackingStorage.toWritableMap(snapshot))
    } catch (error: Throwable) {
      promise.reject("walk_request_end_failed", error)
    }
  }

  @ReactMethod
  fun confirmEndSession(promise: Promise) {
    try {
      val snapshot = WalkTrackingSessionController.confirmEndSession(reactApplicationContext)
      WalkTrackingService.stop(reactApplicationContext)
      emitWalkUpdate(null)
      promise.resolve(WalkTrackingStorage.toWritableMap(snapshot))
    } catch (error: Throwable) {
      promise.reject("walk_confirm_end_failed", error)
    }
  }

  @ReactMethod
  fun cancelEndConfirmation(promise: Promise) {
    try {
      val snapshot = WalkTrackingSessionController.cancelEndConfirmation(reactApplicationContext)
      WalkTrackingService.startOrSync(reactApplicationContext)
      emitWalkUpdate(snapshot)
      promise.resolve(WalkTrackingStorage.toWritableMap(snapshot))
    } catch (error: Throwable) {
      promise.reject("walk_cancel_end_failed", error)
    }
  }

  @ReactMethod
  fun updateNotificationTimerMode(mode: String, promise: Promise) {
    try {
      val snapshot = WalkTrackingSessionController.updateNotificationTimerMode(
        reactApplicationContext,
        mode,
      )
      if (snapshot != null) {
        WalkTrackingService.startOrSync(reactApplicationContext)
      }
      emitWalkUpdate(snapshot)
      promise.resolve(WalkTrackingStorage.toWritableMap(snapshot))
    } catch (error: Throwable) {
      promise.reject("walk_update_notification_timer_mode_failed", error)
    }
  }

  @ReactMethod
  fun updateNotificationStatsMode(mode: String, promise: Promise) {
    try {
      val snapshot = WalkTrackingSessionController.updateNotificationStatsMode(
        reactApplicationContext,
        mode,
      )
      if (snapshot != null) {
        WalkTrackingService.startOrSync(reactApplicationContext)
      }
      emitWalkUpdate(snapshot)
      promise.resolve(WalkTrackingStorage.toWritableMap(snapshot))
    } catch (error: Throwable) {
      promise.reject("walk_update_notification_stats_mode_failed", error)
    }
  }

  @ReactMethod
  fun setEndWalkMode(mode: String, promise: Promise) {
    try {
      reactApplicationContext.getSharedPreferences("gapwalk_settings", Context.MODE_PRIVATE)
        .edit().putString("end_walk_mode", mode).apply()
      promise.resolve(true)
    } catch (error: Throwable) {
      promise.reject("walk_set_end_walk_mode_failed", error)
    }
  }

  @ReactMethod
  fun getSnapshot(promise: Promise) {
    try {
      val snapshot = WalkTrackingSessionController.refreshTick(reactApplicationContext)
      promise.resolve(WalkTrackingStorage.toWritableMap(snapshot))
    } catch (error: Throwable) {
      promise.reject("walk_snapshot_failed", error)
    }
  }

  @ReactMethod
  fun consumePendingQuickEndCompletion(promise: Promise) {
    try {
      promise.resolve(
        WalkTrackingStorage.quickEndPayloadToWritableMap(
          WalkTrackingStorage.takePendingQuickEndCompletion(reactApplicationContext),
        ),
      )
    } catch (error: Throwable) {
      promise.reject("walk_consume_pending_quick_end_failed", error)
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

  private fun emitWalkUpdate(snapshot: WalkTrackingSnapshot?) {
    if (!reactApplicationContext.hasActiveReactInstance()) return

    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("walkSessionUpdated", WalkTrackingStorage.toWritableMap(snapshot))
  }
}
