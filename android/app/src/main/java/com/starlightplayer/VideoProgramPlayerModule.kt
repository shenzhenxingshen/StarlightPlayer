package com.starlightplayer

import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.TextureView
import android.widget.FrameLayout
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.google.android.exoplayer2.*
import com.google.android.exoplayer2.audio.AudioAttributes
import com.google.android.exoplayer2.source.ClippingMediaSource
import com.google.android.exoplayer2.source.DefaultMediaSourceFactory
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.max

/** Shared only inside this process. Exact microsecond clipping prevents per-loop ms rounding. */
internal object VideoProgramEngine {
  val handler = Handler(Looper.getMainLooper())
  var player: ExoPlayer? = null
  var surface: TextureView? = null
  var starts = longArrayOf()
  var totalTicks = 0L
  var originMs = 0.0
  var generation = 0
  var error: String? = null
  var intendedPlaying = false

  fun pause() {
    generation++
    intendedPlaying = false
    player?.pause()
    surface?.keepScreenOn = false
  }
  fun stop() {
    pause()
    player?.release()
    player = null
  }
  fun positionTicks(): Long {
    val p = player ?: return 0
    return starts.getOrElse(p.currentMediaItemIndex) { 0L } + p.currentPosition * 44100L / 1000
  }
  fun seekToClock(wallMs: Double): Boolean {
    val ticks = ((wallMs - originMs) * 44.1).toLong()
    if (ticks < 0 || ticks >= totalTicks || starts.isEmpty()) return false
    val index = starts.indexOfLast { it <= ticks }.coerceAtLeast(0)
    player?.seekTo(index, (ticks - starts[index]) * 1000 / 44100)
    return true
  }
}

class VideoProgramPlayerModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context), LifecycleEventListener {
  override fun getName() = "VideoProgramPlayer"
  init { context.addLifecycleEventListener(this) }
  override fun onHostResume() {}
  override fun onHostPause() { VideoProgramEngine.handler.post { VideoProgramEngine.pause() } }
  override fun onHostDestroy() { VideoProgramEngine.handler.post { VideoProgramEngine.stop() } }
  override fun invalidate() {
    context.removeLifecycleEventListener(this)
    VideoProgramEngine.handler.post { VideoProgramEngine.stop() }
    super.invalidate()
  }

  @ReactMethod fun load(config: ReadableMap, promise: Promise) {
    val data = config.toHashMap()
    VideoProgramEngine.handler.post {
      val e = VideoProgramEngine
      try {
        e.stop()
        e.error = null
        val spans = data["spans"] as? List<*> ?: error("Missing video spans")
        require((data["timescale"] as Number).toInt() == 44100 && spans.size in 1..1000)
        e.originMs = (data["startEpochMs"] as Number).toDouble()
        require(e.originMs.isFinite())
        val manifest = JSONObject(context.assets.open("video/manifest.json").bufferedReader().use { it.readText() })
        val catalog = mutableMapOf<String, Long>()
        val assets = manifest.getJSONArray("assets")
        for (i in 0 until assets.length()) {
          val asset = assets.getJSONObject(i)
          catalog[asset.getString("file")] = asset.getLong("durationTicks")
        }
        var cursor = 0L
        val starts = mutableListOf<Long>()
        val factory = DefaultMediaSourceFactory(context)
        val sources = spans.map { raw ->
          val span = raw as Map<*, *>
          val file = span["file"] as String
          val duration = (span["durationTicks"] as Number).toLong()
          require(catalog[file] == duration && duration > 0) { "Video asset manifest mismatch" }
          starts.add(cursor)
          cursor += duration
          require(cursor < 86400L * 44100L)
          val source = factory.createMediaSource(MediaItem.fromUri(Uri.parse("asset:///video/$file")))
          ClippingMediaSource(source, 0L, duration * 1_000_000L / 44100L)
        }
        e.starts = starts.toLongArray()
        e.totalTicks = cursor
        val player = ExoPlayer.Builder(context)
          .setLoadControl(DefaultLoadControl.Builder().setBufferDurationsMs(500, 3000, 100, 100).build())
          .build()
        e.player = player
        player.setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true)
        player.setHandleAudioBecomingNoisy(true)
        player.repeatMode = Player.REPEAT_MODE_OFF
        e.surface?.let { player.setVideoTextureView(it) }
        player.addListener(object : Player.Listener {
          override fun onPlayerError(error: PlaybackException) { e.error = error.message; e.pause() }
          override fun onPlaybackStateChanged(state: Int) {
            if (state == Player.STATE_ENDED) { e.intendedPlaying = false; e.surface?.keepScreenOn = false }
          }
        })
        player.setMediaSources(sources)
        player.prepare()
        val generation = e.generation
        align(generation, 0, System.currentTimeMillis() + 15000L, promise)
      } catch (error: Exception) {
        e.error = error.message
        e.stop()
        promise.reject("video_load", error.message, error)
      }
    }
  }

  private fun align(generation: Int, attempt: Int, deadline: Long, promise: Promise) {
    val e = VideoProgramEngine
    val p = e.player
    if (generation != e.generation || p == null) { promise.reject("video_cancelled", "Video command superseded"); return }
    val targetWall = System.currentTimeMillis() + 350L
    if (!e.seekToClock(targetWall.toDouble())) { promise.reject("video_window", "视频流程尚未开始或已经结束"); return }
    fun ready() {
      if (generation != e.generation) { promise.reject("video_cancelled", "Video command superseded"); return }
      if (System.currentTimeMillis() > deadline || p.playerError != null) {
        e.pause(); promise.reject("video_timeout", e.error ?: "视频加载超时"); return
      }
      if (p.playbackState != Player.STATE_READY) { e.handler.postDelayed({ ready() }, 25); return }
      val remaining = targetWall - System.currentTimeMillis()
      if (remaining < 20L) {
        if (attempt < 3) align(generation, attempt + 1, deadline, promise)
        else { e.pause(); promise.reject("video_slow", "视频准备超时，请重试") }
        return
      }
      e.handler.postDelayed({
        if (generation != e.generation) promise.reject("video_cancelled", "Video command superseded")
        else {
          p.play()
          e.intendedPlaying = true
          e.surface?.keepScreenOn = true
          monitor(generation)
          promise.resolve(null)
        }
      }, max(0L, remaining))
    }
    ready()
  }

  // Clipped playlist plays continuously. Only substantial stalls/clock changes seek;
  // regular segment boundaries do NOT round-trip through JavaScript.
  private fun monitor(generation: Int) {
    val e = VideoProgramEngine
    e.handler.postDelayed({
      val p = e.player
      if (generation != e.generation || p == null || !e.intendedPlaying) return@postDelayed
      val expected = ((System.currentTimeMillis() - e.originMs) * 44.1).toLong()
      if (expected >= e.totalTicks || expected < 0) { e.pause(); return@postDelayed }
      if (p.isPlaying && abs(expected - e.positionTicks()) > 44100L / 4) {
        e.seekToClock(System.currentTimeMillis().toDouble())
      }
      monitor(generation)
    }, 500)
  }
  @ReactMethod fun pause(promise: Promise) { VideoProgramEngine.handler.post { VideoProgramEngine.pause(); promise.resolve(null) } }
  @ReactMethod fun stop(promise: Promise) { VideoProgramEngine.handler.post { VideoProgramEngine.stop(); promise.resolve(null) } }
  @ReactMethod fun getStatus(promise: Promise) { VideoProgramEngine.handler.post {
    val e = VideoProgramEngine
    promise.resolve(Arguments.createMap().apply {
      putDouble("position", e.positionTicks() / 44100.0)
      putBoolean("playing", e.player?.isPlaying == true)
      putString("error", e.error ?: "")
    })
  } }
}

class VideoProgramViewManager : SimpleViewManager<FrameLayout>() {
  override fun getName() = "VideoProgramView"
  override fun createViewInstance(context: ThemedReactContext): FrameLayout {
    val holder = FrameLayout(context)
    val texture = TextureView(context)
    holder.addView(texture, FrameLayout.LayoutParams(-1, -1))
    VideoProgramEngine.surface = texture
    VideoProgramEngine.player?.setVideoTextureView(texture)
    return holder
  }
  override fun onDropViewInstance(view: FrameLayout) {
    val texture = view.getChildAt(0) as? TextureView
    if (VideoProgramEngine.surface === texture) {
      if (texture != null) VideoProgramEngine.player?.clearVideoTextureView(texture)
      VideoProgramEngine.surface = null
    }
    super.onDropViewInstance(view)
  }
}
