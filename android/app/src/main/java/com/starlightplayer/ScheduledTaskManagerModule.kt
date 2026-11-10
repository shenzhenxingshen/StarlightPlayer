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
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import org.json.JSONArray
import org.json.JSONObject

class ScheduledTaskManagerModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "ScheduledTaskManager"

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
        json.put(JSONObject().apply {
          put("id", task.getString("id"))
          put("name", task.getString("name"))
          put("hour", task.getInt("hour"))
          put("minute", task.getInt("minute"))
          put("second", task.getInt("second"))
          put("enabled", task.getBoolean("enabled"))
        })
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
  fun consumePendingTrigger(promise: Promise) = promise.resolve(null)
}

