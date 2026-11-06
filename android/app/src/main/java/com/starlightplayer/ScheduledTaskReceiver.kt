package com.starlightplayer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import com.facebook.react.HeadlessJsTaskService

class ScheduledTaskReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val taskId = intent.getStringExtra("taskId") ?: return
    val scheduledAt = intent.getLongExtra("scheduledAt", System.currentTimeMillis())
    ScheduledTaskAlarmScheduler.reschedule(context, taskId)
    HeadlessJsTaskService.acquireWakeLockNow(context)
    val serviceIntent = Intent(context, ScheduledTaskExecutionService::class.java).apply {
      putExtra("taskId", taskId)
      putExtra("scheduledAt", scheduledAt)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(serviceIntent)
    } else {
      context.startService(serviceIntent)
    }
  }
}

