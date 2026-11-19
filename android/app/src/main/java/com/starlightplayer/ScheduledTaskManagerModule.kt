package com.starlightplayer

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.common.LifecycleState
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject

class ScheduledTaskManagerModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "ScheduledTaskManager"
  private var listenerCount = 0
  private val activityListener = object : BaseActivityEventListener() {
    override fun onNewIntent(intent: Intent) {
      // A notification may target an already visible Activity: there will be no
      // AppState transition. Keep cold/background intents pending for JS startup.
      if (listenerCount > 0 && reactApplicationContext.lifecycleState == LifecycleState.RESUMED) {
        val trigger = takeTrigger(intent) ?: return
        reactApplicationContext
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("ScheduledTaskDue", trigger)
      }
    }
  }

  init { reactContext.addActivityEventListener(activityListener) }

  override fun invalidate() {
    reactApplicationContext.removeActivityEventListener(activityListener)
    super.invalidate()
  }

  @ReactMethod
  fun addListener(eventName: String) { listenerCount += 1 }

  @ReactMethod
  fun removeListeners(count: Double) { listenerCount = (listenerCount - count.toInt()).coerceAtLeast(0) }

  private fun status() = Arguments.createMap().apply {
    putString("platform", "android")
    putString(
      "notificationPermission",
      if (NotificationManagerCompat.from(reactApplicationContext).areNotificationsEnabled()) "authorized" else "denied",
    )
    putString(
      "exactAlarmPermission",
      when {
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S -> "not-needed"
        ScheduledTaskAlarmScheduler.canScheduleExactly(reactApplicationContext) -> "authorized"
        else -> "denied"
      },
    )
  }

  @ReactMethod
  fun syncTasks(tasks: ReadableArray, promise: Promise) {
    try {
      val json = JSONArray()
      for (index in 0 until tasks.size()) {
        val task = tasks.getMap(index)
        // Keep the scheduling projection executable in JVM tests. Omitting weekdays here
        // would silently turn every selected-day schedule into a legacy daily schedule.
        json.put(JSONObject(ScheduledTaskPayload.fromMap(task.toHashMap())))
      }
      ScheduledTaskAlarmScheduler.sync(reactApplicationContext, json.toString())
      promise.resolve(status())
    } catch (error: Exception) {
      promise.reject("scheduled_task_sync_failed", error.message, error)
    }
  }

  @ReactMethod
  fun getSchedulingStatus(promise: Promise) = promise.resolve(status())

  @ReactMethod
  fun requestSchedulingPermission(promise: Promise) {
    try {
      val activity = currentActivity
      if (
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
        !ScheduledTaskAlarmScheduler.canScheduleExactly(reactApplicationContext)
      ) {
        val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
          data = Uri.parse("package:${reactApplicationContext.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactApplicationContext.startActivity(intent)
        promise.resolve(status())
        return
      }
      if (
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        activity != null &&
        ActivityCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
      ) {
        ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 49032)
        promise.resolve(status())
        return
      }
      promise.resolve(status())
    } catch (error: Exception) {
      promise.reject("scheduled_task_permission_failed", error.message, error)
    }
  }

  @ReactMethod
  fun openBackgroundSettings(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.parse("package:${reactApplicationContext.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactApplicationContext.startActivity(intent)
      promise.resolve(status())
    } catch (error: Exception) {
      promise.reject("scheduled_task_background_settings_failed", error.message, error)
    }
  }

  @ReactMethod
  fun consumePendingTrigger(promise: Promise) {
    promise.resolve(takeTrigger(currentActivity?.intent))
  }

  private fun takeTrigger(intent: Intent?): com.facebook.react.bridge.WritableMap? {
    val id = intent?.getStringExtra("videoTaskId") ?: return null
    val at = intent.getLongExtra("videoScheduledAt", 0)
    intent.removeExtra("videoTaskId")
    intent.removeExtra("videoScheduledAt")
    return Arguments.createMap().apply {
      putString("taskId", id)
      putString("source", "notification-tap")
      putDouble("scheduledAt", at.toDouble())
    }
  }
}

