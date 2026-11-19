package com.starlightplayer

import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
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
  var aligning = false
  // Queue indices identify occurrences, even when consecutive entries use the same file.
  var lastCheckedBoundary = -1
  val diagnostics = ArrayDeque<String>()

  fun record(event: String, detail: String = "") {
    val line = "${System.currentTimeMillis()} $event $detail"
    diagnostics.addLast(line)
    while (diagnostics.size > 300) diagnostics.removeFirst()
    Log.i("StarlightVideo", line)
  }

  fun pause() {
    generation++
    intendedPlaying = false
    aligning = false
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
        e.lastCheckedBoundary = -1
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
        val generation = e.generation
        player.addListener(object : Player.Listener {
          private var pendingBoundary = -1
          private fun isCurrent() = e.player === player && e.generation == generation

          override fun onPlayerError(error: PlaybackException) {
            if (!isCurrent()) return
            e.record("error", "${error.errorCodeName}: ${error.message}")
            e.error = error.message
            e.pause()
          }
          override fun onPlaybackStateChanged(state: Int) {
            if (!isCurrent()) return
            e.record("state", "state=$state index=${player.currentMediaItemIndex} positionMs=${player.currentPosition}")
            if (state == Player.STATE_ENDED) { e.intendedPlaying = false; e.surface?.keepScreenOn = false }
          }
          override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            if (!isCurrent()) return
            // A seek/load is NOT a fresh natural boundary. In particular, a
            // catch-up seek must never schedule another catch-up.
            pendingBoundary = if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO &&
              e.intendedPlaying && !e.aligning) player.currentMediaItemIndex else -1
          }
          override fun onEvents(ignored: Player, events: Player.Events) {
            if (!isCurrent() || e.aligning || !e.intendedPlaying || !player.isPlaying) return
            val index = pendingBoundary
            if (index < 0) return
            pendingBoundary = -1
            if (index == player.currentMediaItemIndex) checkBoundary(generation, index)
          }
        })
        player.setMediaSources(sources)
        player.prepare()
        e.aligning = true
        e.record("load", "originMs=${e.originMs} spans=${e.starts.size} policy=boundary-only")
        align(generation, 0, System.currentTimeMillis() + 15000L, {
          monitorWindow(generation)
          promise.resolve(null)
        }, { code, message ->
          if (e.generation == generation) { e.error = message; e.pause() }
          promise.reject(code, message)
        })
      } catch (error: Exception) {
        e.error = error.message
        e.stop()
        promise.reject("video_load", error.message, error)
      }
    }
  }

  private fun align(
    generation: Int, attempt: Int, deadline: Long,
    success: () -> Unit, failure: (String, String) -> Unit,
  ) {
    val e = VideoProgramEngine
    val p = e.player
    if (generation != e.generation || p == null) { failure("video_cancelled", "Video command superseded"); return }
    // Slow exact seeks must get more preparation time on retry; repeatedly
    // requesting another target only 350ms ahead cannot converge on such devices.
    // The target remains origin + wall time, never a new task origin.
    val leadMs = 350L * (attempt + 1)
    val targetWall = System.currentTimeMillis() + leadMs
    e.record("align_seek", "attempt=$attempt leadMs=$leadMs targetWallMs=$targetWall")
    if (!e.seekToClock(targetWall.toDouble())) { failure("video_window", "视频流程尚未开始或已经结束"); return }
    fun ready() {
      if (generation != e.generation) { failure("video_cancelled", "Video command superseded"); return }
      if (System.currentTimeMillis() > deadline || p.playerError != null) {
        failure("video_timeout", e.error ?: "视频加载超时"); return
      }
      if (p.playbackState != Player.STATE_READY) { e.handler.postDelayed({ ready() }, 25); return }
      val remaining = targetWall - System.currentTimeMillis()
      if (remaining < 20L) {
        e.record("prepare_late", "attempt=$attempt remainingMs=$remaining")
        if (attempt < 3) align(generation, attempt + 1, deadline, success, failure)
        else failure("video_slow", "视频准备超时，请重试")
        return
      }
      e.handler.postDelayed({
        if (generation != e.generation) failure("video_cancelled", "Video command superseded")
        else {
          e.lastCheckedBoundary = max(e.lastCheckedBoundary, p.currentMediaItemIndex)
          e.aligning = false
          p.play()
          e.intendedPlaying = true
          e.surface?.keepScreenOn = true
          e.record("aligned", "index=${p.currentMediaItemIndex} positionMs=${p.currentPosition}")
          success()
        }
      }, max(0L, remaining))
    }
    ready()
  }

  private fun checkBoundary(generation: Int, index: Int) {
    val e = VideoProgramEngine
    val p = e.player ?: return
    if (e.generation != generation || e.aligning || !e.intendedPlaying ||
      index <= e.lastCheckedBoundary) return
    // Consume BEFORE seeking. A backward correction may cross the same boundary
    // again; a forward correction may skip several occurrences. Neither loops.
    e.lastCheckedBoundary = index
    val expected = ((System.currentTimeMillis() - e.originMs) * 44.1).toLong()
    if (expected < 0 || expected >= e.totalTicks) { e.pause(); return }
    val drift = expected - e.positionTicks()
    e.record("boundary_check", "index=$index driftMs=${drift / 44.1}")
    if (abs(drift) <= 44100L / 4) return
    e.aligning = true
    p.pause() // Keep the generation/intention: this is not a user pause.
    e.record("boundary_correction", "index=$index")
    align(generation, 0, System.currentTimeMillis() + 6000L, {}, { code, message ->
      if (e.generation == generation) {
        e.record("alignment_error", "$code $message")
        e.error = message
        e.pause()
      }
    })
  }

  // Only enforce the immutable task window here. Never seek in the middle of a
  // clip, including after buffering, clock changes, or temporary audio suppression.
  private fun monitorWindow(generation: Int) {
    val e = VideoProgramEngine
    e.handler.postDelayed({
      val p = e.player
      if (generation != e.generation || p == null || !e.intendedPlaying) return@postDelayed
      val expected = ((System.currentTimeMillis() - e.originMs) * 44.1).toLong()
      if (expected >= e.totalTicks || expected < 0) { e.pause(); return@postDelayed }
      monitorWindow(generation)
    }, 500)
  }
  @ReactMethod fun pause(promise: Promise) { VideoProgramEngine.handler.post { VideoProgramEngine.pause(); promise.resolve(null) } }
  @ReactMethod fun stop(promise: Promise) { VideoProgramEngine.handler.post { VideoProgramEngine.stop(); promise.resolve(null) } }
  @ReactMethod fun getStatus(promise: Promise) { VideoProgramEngine.handler.post {
    val e = VideoProgramEngine
    promise.resolve(Arguments.createMap().apply {
      putDouble("position", e.positionTicks() / 44100.0)
      putBoolean("playing", e.player?.isPlaying == true)
      putBoolean("buffering", e.aligning || e.player?.playbackState == Player.STATE_BUFFERING)
      putString("error", e.error ?: "")
    })
  } }
  @ReactMethod fun getDiagnostics(promise: Promise) { VideoProgramEngine.handler.post {
    promise.resolve(Arguments.fromList(VideoProgramEngine.diagnostics.toList()))
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
