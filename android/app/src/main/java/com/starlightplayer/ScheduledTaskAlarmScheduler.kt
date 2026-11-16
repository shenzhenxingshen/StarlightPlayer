package com.starlightplayer

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.util.TimeZone

object ScheduledTaskAlarmScheduler {
  private const val PREFS = "starlight_scheduled_tasks"
  private const val TASKS_KEY = "tasks_json"
  private const val TAG = "StarlightTasks"

  fun sync(context: Context, tasksJson: String) {
    val previous = readTasks(context)
    previous.forEach { cancel(context, it.optString("id")) }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(TASKS_KEY, tasksJson)
      .apply()
    readTasks(context).filter { it.optBoolean("enabled", false) }.forEach { schedule(context, it) }
  }

  fun restoreAll(context: Context) {
    readTasks(context).filter { it.optBoolean("enabled", false) }.forEach { schedule(context, it) }
  }

  fun reschedule(context: Context, taskId: String) {
    readTasks(context).firstOrNull { it.optString("id") == taskId && it.optBoolean("enabled", false) }
      ?.let { schedule(context, it) }
  }

  fun isCurrentOccurrence(context: Context, taskId: String, scheduledAt: Long): Boolean {
    val task = readTasks(context).firstOrNull {
      it.optString("id") == taskId && it.optBoolean("enabled", false)
    } ?: return false
    return TaskCalendar.matches(scheduledAt, TimeZone.getDefault(),
      task.optInt("hour", -1), task.optInt("minute", -1), task.optInt("second", -1), weekdays(task))
  }

  private fun weekdays(task: JSONObject): Set<Int> {
    if (!task.has("weekdays")) return (1..7).toSet() // Legacy daily tasks.
    val days = task.optJSONArray("weekdays") ?: return emptySet()
    val result = mutableSetOf<Int>()
    for (index in 0 until days.length()) {
      val value = days.opt(index) as? Number ?: return emptySet()
      if (value.toDouble() != value.toInt().toDouble() || value.toInt() !in 1..7) return emptySet()
      result.add(value.toInt())
    }
    return result
  }

  fun canScheduleExactly(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    return (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
  }

  private fun readTasks(context: Context): List<JSONObject> {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(TASKS_KEY, "[]") ?: "[]"
    return try {
      val array = JSONArray(raw)
      (0 until array.length()).mapNotNull { index -> array.optJSONObject(index) }
    } catch (_: Exception) {
      emptyList()
    }
  }

  private fun requestCode(taskId: String): Int = taskId.hashCode() and 0x7fffffff

  private fun pendingIntent(context: Context, taskId: String, scheduledAt: Long): PendingIntent {
    val intent = Intent(context, ScheduledTaskReceiver::class.java).apply {
      action = "${context.packageName}.RUN_SCHEDULED_TASK"
      data = Uri.parse("starlight://scheduled-task/${Uri.encode(taskId)}")
      putExtra("taskId", taskId)
      putExtra("scheduledAt", scheduledAt)
    }
    return PendingIntent.getBroadcast(
      context,
      requestCode(taskId),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun nextTrigger(task: JSONObject): Long? =
    TaskCalendar.next(System.currentTimeMillis(), TimeZone.getDefault(),
      task.optInt("hour", -1), task.optInt("minute", -1), task.optInt("second", -1), weekdays(task))

  private fun schedule(context: Context, task: JSONObject) {
    val taskId = task.optString("id")
    if (taskId.isBlank()) return
    val triggerAt = nextTrigger(task) ?: return
    val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val operation = pendingIntent(context, taskId, triggerAt)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      if (canScheduleExactly(context)) {
        try {
          manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, operation)
        } catch (error: SecurityException) {
          // Permission can be revoked between canScheduleExactAlarms() and this call. Keep a
          // best-effort alarm instead of losing the enabled task entirely.
          Log.w(TAG, "Exact alarm permission changed while scheduling $taskId", error)
          manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, operation)
        }
      } else {
        manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, operation)
      }
    } else {
      manager.setExact(AlarmManager.RTC_WAKEUP, triggerAt, operation)
    }
  }

  private fun cancel(context: Context, taskId: String) {
    if (taskId.isBlank()) return
    val intent = Intent(context, ScheduledTaskReceiver::class.java).apply {
      action = "${context.packageName}.RUN_SCHEDULED_TASK"
      data = Uri.parse("starlight://scheduled-task/${Uri.encode(taskId)}")
    }
    val operation = PendingIntent.getBroadcast(
      context,
      requestCode(taskId),
      intent,
      PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
    ) ?: return
    (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(operation)
    operation.cancel()
  }
}

