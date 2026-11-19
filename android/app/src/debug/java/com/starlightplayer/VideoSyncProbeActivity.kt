package com.starlightplayer

import android.app.Activity
import android.os.Bundle
import android.view.TextureView
import android.view.WindowManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.BridgeReactContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.lang.reflect.Proxy

/** Real production ExoPlayer + bundled media, with an isolated applicationId.
 * Not an RN/UI E2E and not an acoustic or physical-device quality measurement. */
class VideoSyncProbeActivity : Activity() {
  private lateinit var module: VideoProgramPlayerModule
  private val results = JSONArray()
  private val e get() = VideoProgramEngine
  private var next = 0
  private var cancelled = false
  private var active = true
  private lateinit var catalog: Map<String, Pair<String, Long>>
  private data class Scenario(
    val name: String, val ids: List<String>, val counts: List<Int>,
    val elapsed: Double, val seconds: Double = 4.0, val shiftMs: Double = 0.0,
    val cancelAtBoundary: Boolean = false,
  )
  private lateinit var scenarios: List<Scenario>

  override fun onCreate(state: Bundle?) {
    super.onCreate(state)
    // Never run fault injection in the ordinary debug app's data/container.
    if (!packageName.endsWith(".videovalidation")) { finish(); return }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    val surface = TextureView(this)
    setContentView(surface)
    e.surface = surface
    module = VideoProgramPlayerModule(BridgeReactContext(applicationContext))
    val manifestAssets = JSONObject(assets.open("video/manifest.json").bufferedReader().use { it.readText() })
      .getJSONArray("assets")
    catalog = (0 until manifestAssets.length()).associate {
      val asset = manifestAssets.getJSONObject(it)
      asset.getString("id") to (asset.getString("file") to asset.getLong("durationTicks"))
    }
    val ids = listOf("intro49", "salutation", "regular", "final", "outro")
    val counts = listOf(1, 1, 48, 1, 1)
    fun seconds(id: String) = catalog.getValue(id).second / 44100.0
    val salutationEnd = seconds("intro49") + seconds("salutation")
    val regularEnd = salutationEnd + 48 * seconds("regular")
    scenarios = listOf(
      // Leave enough time for the real software decoder to join BEFORE the seam.
      Scenario("intro-salutation", ids, counts, 1.0, 6.0),
      Scenario("salutation-regular", ids, counts, salutationEnd - 4, 6.0),
      Scenario("regular-repeat", ids, counts, salutationEnd + seconds("regular") - 4, 6.0),
      Scenario("regular-final", ids, counts, regularEnd - 4, 6.0),
      Scenario("final-outro", ids, counts, regularEnd + seconds("final") - 4, 6.0),
      Scenario("late-98", listOf("intro98") + ids.drop(1), listOf(1, 1, 97, 1, 1), 3600.0),
      Scenario("mid-clip-drift", listOf("regular"), listOf(2), 10.0, 3.0, 1000.0),
      Scenario("boundary-late", listOf("intro49"), listOf(4), 1.0, 6.0, 1000.0),
      Scenario("boundary-early", listOf("intro49"), listOf(4), 1.0, 6.0, -800.0),
      Scenario("boundary-skip", listOf("intro49"), listOf(6), 1.0, 6.0, 11000.0),
      Scenario("boundary-cancel", listOf("intro49"), listOf(4), 1.0, 6.0, 1000.0, true),
      Scenario("window-stops-lagging", listOf("intro49"), listOf(1), 1.0, 4.0, 2000.0),
      Scenario("end-no-wrap", listOf("intro49"), listOf(1), 2.0, 4.0),
      Scenario("already-ended", listOf("intro49"), listOf(1), 6.0),
    )
    e.handler.postDelayed({ runNext() }, 1000)
  }

  private fun promise(success: () -> Unit, failure: (String, String) -> Unit): Promise =
    Proxy.newProxyInstance(Promise::class.java.classLoader, arrayOf(Promise::class.java)) { _, method, args ->
      when (method.name) {
        "resolve" -> success()
        "reject" -> failure(args?.getOrNull(0).toString(), args?.getOrNull(1).toString())
      }
      null
    } as Promise

  private fun runNext() {
    if (!active) return
    if (next >= scenarios.size) {
      e.stop()
      File(filesDir, "video-boundary-validation.json").writeText(JSONObject()
        .put("runId", intent.getStringExtra("runId"))
        .put("scenarios", results).toString(2))
      return
    }
    val scenario = scenarios[next++]
    e.diagnostics.clear()
    cancelled = false
    val spans = scenario.ids.flatMapIndexed { index, id ->
      val asset = catalog.getValue(id)
      List(scenario.counts[index]) { mapOf("file" to asset.first, "durationTicks" to asset.second) }
    }
    val config = Arguments.makeNativeMap(mapOf(
      "timescale" to 44100,
      "startEpochMs" to (System.currentTimeMillis() - scenario.elapsed * 1000),
      "spans" to spans,
    ))
    val result = JSONObject().put("name", scenario.name)
    module.load(config, promise({
      result.put("ready", true)
      e.originMs -= scenario.shiftMs // Test injection, not a system clock change.
      result.put("shiftMs", scenario.shiftMs)
      val samples = JSONArray()
      sample(scenario, result, samples, System.currentTimeMillis() + (scenario.seconds * 1000).toLong())
    }, { code, message ->
      result.put("rejected", code).put("message", message)
      result.put("diagnostics", JSONArray(e.diagnostics.toList()))
      results.put(result)
      runNext()
    }))
  }

  private fun sample(s: Scenario, result: JSONObject, samples: JSONArray, deadline: Long) {
    if (!active) return
    val correctionCount = e.diagnostics.count { it.contains(" boundary_correction ") }
    if (s.cancelAtBoundary && correctionCount > 0 && !cancelled) {
      cancelled = true
      e.pause()
      result.put("cancelledAt", System.currentTimeMillis())
    }
    val p = e.player
    samples.put(JSONObject()
      .put("wallMs", System.currentTimeMillis())
      .put("expectedMs", System.currentTimeMillis() - e.originMs)
      .put("actualMs", e.positionTicks() / 44.1)
      .put("index", p?.currentMediaItemIndex)
      .put("playing", p?.isPlaying == true)
      .put("aligning", e.aligning)
      .put("state", p?.playbackState)
      .put("error", e.error ?: "")
      .put("corrections", correctionCount))
    if (System.currentTimeMillis() >= deadline) {
      result.put("samples", samples).put("diagnostics", JSONArray(e.diagnostics.toList()))
      results.put(result)
      runNext()
    } else e.handler.postDelayed({ sample(s, result, samples, deadline) }, 100)
  }

  override fun onPause() {
    super.onPause()
    if (active) e.pause()
  }
  override fun onDestroy() {
    active = false
    if (::module.isInitialized) module.invalidate()
    super.onDestroy()
  }
}
