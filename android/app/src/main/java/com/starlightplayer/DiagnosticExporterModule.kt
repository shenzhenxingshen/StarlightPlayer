package com.starlightplayer

import android.content.Intent
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class DiagnosticExporterModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "DiagnosticExporter"

  @ReactMethod
  fun shareTextFile(content: String, promise: Promise) {
    try {
      val activity = currentActivity
        ?: throw IllegalStateException("当前没有可用的界面，请打开 App 后重试")
      val diagnosticsDirectory = File(reactApplicationContext.cacheDir, "diagnostics")
      if (!diagnosticsDirectory.exists() && !diagnosticsDirectory.mkdirs()) {
        throw IllegalStateException("无法创建诊断文件目录")
      }

      val timestamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
      val file = File(diagnosticsDirectory, "starlight-diagnostics-$timestamp.txt")
      file.writeText(content, Charsets.UTF_8)
      val uri = FileProvider.getUriForFile(
        reactApplicationContext,
        "${reactApplicationContext.packageName}.diagnostics.fileprovider",
        file,
      )

      val shareIntent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_SUBJECT, "星光播放器诊断信息")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      activity.runOnUiThread {
        try {
          activity.startActivity(Intent.createChooser(shareIntent, "导出诊断文件"))
          promise.resolve(file.absolutePath)
        } catch (error: Exception) {
          promise.reject("diagnostic_export_failed", error.message, error)
        }
      }
    } catch (error: Exception) {
      promise.reject("diagnostic_export_failed", error.message, error)
    }
  }
}
