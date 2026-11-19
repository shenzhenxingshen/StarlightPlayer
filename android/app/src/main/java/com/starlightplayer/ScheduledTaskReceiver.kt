package com.starlightplayer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import com.facebook.react.HeadlessJsTaskService
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import androidx.core.app.NotificationCompat

class ScheduledTaskReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val taskId = intent.getStringExtra("taskId") ?: return
    if (!intent.hasExtra("scheduledAt")) return
    val scheduledAt = intent.getLongExtra("scheduledAt", 0)
    if (!ScheduledTaskAlarmScheduler.isCurrentOccurrence(context, taskId, scheduledAt)) return
    ScheduledTaskAlarmScheduler.reschedule(context, taskId)
    if (taskId.startsWith("video-")) {
      // Do not launch an Activity or a silent video service from the background.
      // Foreground JS clock handles autoplay; a notification offers an explicit join.
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val channel = "starlight_video_tasks"
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        manager.createNotificationChannel(NotificationChannel(channel, "视频任务提醒", NotificationManager.IMPORTANCE_DEFAULT))
      }
      val launch = Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        putExtra("videoTaskId", taskId)
        putExtra("videoScheduledAt", scheduledAt)
      }
      val pending = PendingIntent.getActivity(context, taskId.hashCode(), launch,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      try {
        manager.notify(taskId.hashCode(), NotificationCompat.Builder(context, channel)
          .setSmallIcon(R.mipmap.ic_launcher).setContentTitle("星光播放器 · 视频任务")
          .setContentText("任务时刻已到，点击加入并追平当前进度")
          .setContentIntent(pending).setAutoCancel(true).build())
      } catch (_: SecurityException) { /* Notification permission denied; foreground clock still works. */ }
      return
    }
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

