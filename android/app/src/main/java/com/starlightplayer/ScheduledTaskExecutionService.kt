package com.starlightplayer

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class ScheduledTaskExecutionService : HeadlessJsTaskService() {
  companion object {
    private const val CHANNEL_ID = "starlight_tasks"
    private const val NOTIFICATION_ID = 49031
    private const val SCHEDULER_PREFS = "starlight_scheduled_tasks"
    private const val BACKGROUND_SETUP_ALLOWED_UNTIL = "allow_background_player_setup_until"
    private const val BACKGROUND_SETUP_WINDOW_MS = 120_000L
  }

  override fun onCreate() {
    super.onCreate()
    // RNTP normally rejects first-time setup while the process is backgrounded. This service is
    // started directly by an AlarmManager exact-alarm delivery and is already a foreground media
    // service, so grant only this short-lived, app-private setup exception.
    getSharedPreferences(SCHEDULER_PREFS, MODE_PRIVATE)
      .edit()
      .putLong(BACKGROUND_SETUP_ALLOWED_UNTIL, System.currentTimeMillis() + BACKGROUND_SETUP_WINDOW_MS)
      .apply()
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "定时任务", NotificationManager.IMPORTANCE_LOW),
      )
    }
    val openIntent = PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("星光播放器")
      .setContentText("正在启动定时播放任务…")
      .setContentIntent(openIntent)
      .setOngoing(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val taskId = intent?.getStringExtra("taskId") ?: return null
    val data = Arguments.createMap().apply {
      putString("taskId", taskId)
      putString("source", "android-alarm")
      putDouble("scheduledAt", intent.getLongExtra("scheduledAt", System.currentTimeMillis()).toDouble())
    }
    return HeadlessJsTaskConfig("StarlightScheduledTask", data, 120_000, true)
  }

  override fun onHeadlessJsTaskFinish(taskId: Int) {
    super.onHeadlessJsTaskFinish(taskId)
    clearBackgroundSetupAllowance()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE)
    else @Suppress("DEPRECATION") stopForeground(true)
    stopSelf()
  }

  override fun onDestroy() {
    clearBackgroundSetupAllowance()
    super.onDestroy()
  }

  private fun clearBackgroundSetupAllowance() {
    getSharedPreferences(SCHEDULER_PREFS, MODE_PRIVATE)
      .edit()
      .remove(BACKGROUND_SETUP_ALLOWED_UNTIL)
      .apply()
  }
}

