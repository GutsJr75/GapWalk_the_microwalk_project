package com.gapwalk.app.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import org.json.JSONArray
import org.json.JSONObject

const val EXACT_ALARM_MODULE_NAME = "ExactAlarmNotifications"
const val EXACT_NOTIFICATION_RESPONSE_EVENT = "exactNotificationResponse"
const val EXACT_NOTIFICATION_DELIVERED_EVENT = "exactNotificationDelivered"
const val EXACT_NOTIFICATION_ACTION_SHOW = "com.gapwalk.app.notifications.SHOW_PLAN_NOTIFICATION"
const val EXACT_NOTIFICATION_ACTION_BUTTON = "com.gapwalk.app.notifications.NOTIFICATION_BUTTON_ACTION"
const val EXACT_NOTIFICATION_ACTION_RECOVER = "com.gapwalk.app.notifications.RECOVER_PLAN_NOTIFICATIONS"
const val HEADLESS_TASK_NAME = "ExactNotificationActionTask"
const val RECOVERY_HEADLESS_TASK_NAME = "ExactNotificationRecoveryTask"
const val EXTRA_IS_EXACT_NOTIFICATION_RESPONSE = "exact_notification_response"
const val EXTRA_NOTIFICATION_ID = "notification_id"
const val EXTRA_NOTIFICATION_TYPE = "notification_type"
const val EXTRA_PLAN_ID = "plan_id"
const val EXTRA_SESSION_ID = "session_id"
const val EXTRA_ACTION_IDENTIFIER = "action_identifier"
const val EXTRA_RECOVERY_REASON = "recovery_reason"
const val EXTRA_NOTIFICATION_TITLE = "notification_title"
const val EXTRA_NOTIFICATION_BODY = "notification_body"
const val EXTRA_NOTIFICATION_TRIGGER_AT_MS = "notification_trigger_at_ms"
const val DEFAULT_NOTIFICATION_ACTION_IDENTIFIER = "expo.modules.notifications.actions.DEFAULT"
const val EXACT_NOTIFICATION_CHANNEL_ID = "gapwalk-nudges"
private const val NOTIFICATION_PREFERENCES_NAME = "gapwalk_exact_notification_prefs"
private const val PREF_SCHEDULED_IDS = "scheduled_ids"
private const val PREF_PENDING_RESPONSE_JSON = "pending_response_json"
private const val PREF_PENDING_DELIVERIES_JSON = "pending_deliveries_json"
private const val PREF_REMINDER_VIBRATION_ENABLED = "reminder_vibration_enabled"
private const val PREF_RECOVERY_NEEDED = "recovery_needed"
private const val PREF_RECOVERY_REASON = "recovery_reason"
private const val PLATFORM_NOTIFICATION_ID = 4107

fun getWalkNudgeNotificationId(planId: String): String = "walk-nudge:$planId"

fun getWalkAlertNotificationId(planId: String): String = "walk-alert:$planId"

fun getWalkReadyNotificationId(planId: String): String = "walk-ready:$planId"

const val WALK_NUDGE_NOTIFICATION_TYPE = "walk_nudge"
const val WALK_MISSED_NOTIFICATION_TYPE = "walk_missed"
const val WALK_ALERT_NOTIFICATION_TYPE = "walk_alert"
const val WALK_READY_NOTIFICATION_TYPE = "walk_ready"
const val WALK_SUMMARY_NOTIFICATION_TYPE = "walk_summary"
const val WALK_NUDGE_ACTION_START = "START_WALK"
const val WALK_NUDGE_ACTION_SKIP = "SKIP_GAP"
const val WALK_READY_ACTION_YES = "YES_WALK_READY"
const val WALK_READY_ACTION_NOT_NOW = "NOT_NOW_WALK_READY"

fun notificationTag(notificationId: String): String = notificationId

fun requestCodeFor(notificationId: String): Int = notificationId.hashCode()

fun responseRequestCodeFor(notificationId: String, actionIdentifier: String): Int =
  "$notificationId::$actionIdentifier".hashCode()

fun buildAlarmIntent(context: Context, notificationId: String): Intent =
  Intent(context, ExactAlarmNotificationReceiver::class.java).apply {
    action = EXACT_NOTIFICATION_ACTION_SHOW
    data = Uri.parse("gapwalk://plan-notification/$notificationId")
  }

fun buildActionBroadcastIntent(
  context: Context,
  notificationId: String,
  planId: String,
  type: String,
  actionIdentifier: String,
): Intent =
  Intent(context, ExactNotificationActionReceiver::class.java).apply {
    action = EXACT_NOTIFICATION_ACTION_BUTTON
    putExtra(EXTRA_NOTIFICATION_ID, notificationId)
    putExtra(EXTRA_PLAN_ID, planId)
    putExtra(EXTRA_NOTIFICATION_TYPE, type)
    putExtra(EXTRA_ACTION_IDENTIFIER, actionIdentifier)
  }

fun buildResponseIntent(
  context: Context,
  notificationId: String,
  planId: String,
  type: String,
  actionIdentifier: String,
): Intent =
  Intent(context, com.gapwalk.app.MainActivity::class.java).apply {
    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    data = Uri.parse("gapwalk://notification-response/$notificationId/$actionIdentifier")
    putExtra(EXTRA_IS_EXACT_NOTIFICATION_RESPONSE, true)
    putExtra(EXTRA_NOTIFICATION_ID, notificationId)
    putExtra(EXTRA_PLAN_ID, planId)
    putExtra(EXTRA_NOTIFICATION_TYPE, type)
    putExtra(EXTRA_ACTION_IDENTIFIER, actionIdentifier)
  }

private fun prefs(context: Context): SharedPreferences =
  context.getSharedPreferences(NOTIFICATION_PREFERENCES_NAME, Context.MODE_PRIVATE)

fun addScheduledId(context: Context, notificationId: String) {
  val current = prefs(context).getStringSet(PREF_SCHEDULED_IDS, emptySet())?.toMutableSet() ?: mutableSetOf()
  current.add(notificationId)
  prefs(context).edit().putStringSet(PREF_SCHEDULED_IDS, current).apply()
}

fun removeScheduledId(context: Context, notificationId: String) {
  val current = prefs(context).getStringSet(PREF_SCHEDULED_IDS, emptySet())?.toMutableSet() ?: mutableSetOf()
  if (current.remove(notificationId)) {
    prefs(context).edit().putStringSet(PREF_SCHEDULED_IDS, current).apply()
  }
}

fun getScheduledIds(context: Context): Set<String> =
  prefs(context).getStringSet(PREF_SCHEDULED_IDS, emptySet())?.toSet() ?: emptySet()

fun savePendingResponse(context: Context, payload: JSONObject) {
  prefs(context).edit().putString(PREF_PENDING_RESPONSE_JSON, payload.toString()).apply()
}

fun buildDeliveredPayload(
  notificationId: String,
  planId: String?,
  type: String,
): JSONObject =
  JSONObject().apply {
    put("notificationId", notificationId)
    put("planId", planId ?: JSONObject.NULL)
    put("type", type)
    put("sessionId", sessionIdForNotification(notificationId, type) ?: JSONObject.NULL)
  }

private fun readPendingDeliveries(context: Context): JSONArray {
  val raw = prefs(context).getString(PREF_PENDING_DELIVERIES_JSON, null) ?: return JSONArray()
  return runCatching { JSONArray(raw) }.getOrElse { JSONArray() }
}

fun savePendingDelivery(context: Context, payload: JSONObject) {
  val current = readPendingDeliveries(context)
  val next = JSONArray()
  var replaced = false

  for (index in 0 until current.length()) {
    val item = current.optJSONObject(index) ?: continue
    if (item.optString("notificationId") == payload.optString("notificationId")) {
      next.put(payload)
      replaced = true
    } else {
      next.put(item)
    }
  }

  if (!replaced) {
    next.put(payload)
  }

  prefs(context).edit().putString(PREF_PENDING_DELIVERIES_JSON, next.toString()).apply()
}

fun takePendingResponse(context: Context): JSONObject? {
  val raw = prefs(context).getString(PREF_PENDING_RESPONSE_JSON, null) ?: return null
  prefs(context).edit().remove(PREF_PENDING_RESPONSE_JSON).apply()
  return runCatching { JSONObject(raw) }.getOrNull()
}

fun takePendingDeliveries(context: Context): JSONArray {
  val raw = prefs(context).getString(PREF_PENDING_DELIVERIES_JSON, null) ?: return JSONArray()
  prefs(context).edit().remove(PREF_PENDING_DELIVERIES_JSON).apply()
  return runCatching { JSONArray(raw) }.getOrElse { JSONArray() }
}

fun setReminderVibrationEnabled(context: Context, enabled: Boolean) {
  prefs(context).edit().putBoolean(PREF_REMINDER_VIBRATION_ENABLED, enabled).apply()
}

fun isReminderVibrationEnabled(context: Context): Boolean =
  prefs(context).getBoolean(PREF_REMINDER_VIBRATION_ENABLED, true)

fun markNotificationsRecoveryNeeded(context: Context, reason: String?) {
  prefs(context).edit()
    .putBoolean(PREF_RECOVERY_NEEDED, true)
    .putString(PREF_RECOVERY_REASON, reason)
    .apply()
}

fun isNotificationsRecoveryNeeded(context: Context): Boolean =
  prefs(context).getBoolean(PREF_RECOVERY_NEEDED, false)

fun clearNotificationsRecoveryNeeded(context: Context) {
  prefs(context).edit()
    .putBoolean(PREF_RECOVERY_NEEDED, false)
    .remove(PREF_RECOVERY_REASON)
    .apply()
}

fun ensureNotificationChannel(context: Context) {
  if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

  val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  val channel = NotificationChannel(
    EXACT_NOTIFICATION_CHANNEL_ID,
    "GapWalk Nudges",
    NotificationManager.IMPORTANCE_HIGH,
  ).apply {
    description = "GapWalk walk reminders"
    enableVibration(isReminderVibrationEnabled(context))
    setShowBadge(false)
    lightColor = 0xFF6366F1.toInt()
  }

  if (isReminderVibrationEnabled(context)) {
    channel.vibrationPattern = longArrayOf(0L, 250L, 250L, 250L)
  } else {
    channel.vibrationPattern = longArrayOf(0L)
  }

  manager.createNotificationChannel(channel)
}

fun cancelPresentedNotification(context: Context, notificationId: String) {
  val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  manager.cancel(notificationTag(notificationId), PLATFORM_NOTIFICATION_ID)
}

fun platformNotificationId(): Int = PLATFORM_NOTIFICATION_ID

fun parseResponsePayload(intent: Intent?): JSONObject? {
  if (intent?.getBooleanExtra(EXTRA_IS_EXACT_NOTIFICATION_RESPONSE, false) != true) {
    return null
  }
  val notificationId = intent.getStringExtra(EXTRA_NOTIFICATION_ID) ?: return null
  val actionIdentifier =
    intent.getStringExtra(EXTRA_ACTION_IDENTIFIER) ?: DEFAULT_NOTIFICATION_ACTION_IDENTIFIER

  return JSONObject().apply {
    put("notificationId", notificationId)
    put("actionIdentifier", actionIdentifier)
    put("planId", intent.getStringExtra(EXTRA_PLAN_ID))
    put("type", intent.getStringExtra(EXTRA_NOTIFICATION_TYPE))
    put(
      "sessionId",
      intent.getStringExtra(EXTRA_SESSION_ID)
        ?: sessionIdForNotification(notificationId, intent.getStringExtra(EXTRA_NOTIFICATION_TYPE))
        ?: JSONObject.NULL,
    )
  }
}

private fun sessionIdForNotification(notificationId: String, type: String?): String? {
  if (type != WALK_SUMMARY_NOTIFICATION_TYPE) return null
  return notificationId.substringAfter("walk-summary:", "")
    .takeIf { it.isNotEmpty() }
}

fun payloadToWritableMap(payload: JSONObject?): WritableMap? {
  if (payload == null) return null
  return Arguments.createMap().apply {
    putString("notificationId", payload.optString("notificationId"))
    val planId = payload.optString("planId")
    if (planId.isNotEmpty()) putString("planId", planId)
    val type = payload.optString("type")
    if (type.isNotEmpty()) putString("type", type)
    val sessionId = payload.optString("sessionId")
    if (sessionId.isNotEmpty()) putString("sessionId", sessionId)
    putString(
      "actionIdentifier",
      payload.optString("actionIdentifier", DEFAULT_NOTIFICATION_ACTION_IDENTIFIER),
    )
  }
}

fun deliveredPayloadToWritableMap(payload: JSONObject?): WritableMap? {
  if (payload == null) return null
  return Arguments.createMap().apply {
    putString("notificationId", payload.optString("notificationId"))
    val planId = payload.optString("planId")
    if (planId.isNotEmpty()) putString("planId", planId)
    val type = payload.optString("type")
    if (type.isNotEmpty()) putString("type", type)
    val sessionId = payload.optString("sessionId")
    if (sessionId.isNotEmpty()) putString("sessionId", sessionId)
  }
}

fun deliveredPayloadsToWritableArray(payloads: JSONArray?): WritableArray {
  val array = Arguments.createArray()
  if (payloads == null) return array

  for (index in 0 until payloads.length()) {
    val map = deliveredPayloadToWritableMap(payloads.optJSONObject(index)) ?: continue
    array.pushMap(map)
  }

  return array
}
