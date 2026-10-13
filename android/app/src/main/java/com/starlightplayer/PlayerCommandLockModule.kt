package com.starlightplayer

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.ArrayDeque

class PlayerCommandLockModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  private data class Waiter(val token: String, val promise: Promise)

  companion object {
    private const val LEASE_TIMEOUT_MS = 30_000L
    private val monitor = Any()
    private val waiters = ArrayDeque<Waiter>()
    private val handler = Handler(Looper.getMainLooper())
    private var ownerToken: String? = null
    private var leaseGeneration = 0L

    private fun scheduleLease(token: String) {
      val generation = synchronized(monitor) {
        if (ownerToken != token) return
        leaseGeneration += 1
        leaseGeneration
      }
      handler.postDelayed({ releaseInternal(token, generation) }, LEASE_TIMEOUT_MS)
    }

    private fun grant(waiter: Waiter) {
      scheduleLease(waiter.token)
      waiter.promise.resolve(null)
    }

    private fun releaseInternal(token: String, expectedGeneration: Long? = null) {
      val next = synchronized(monitor) {
        if (ownerToken != token) return
        if (expectedGeneration != null && leaseGeneration != expectedGeneration) return
        leaseGeneration += 1
        val waiter = if (waiters.isEmpty()) null else waiters.removeFirst()
        ownerToken = waiter?.token
        waiter
      }
      if (next != null) grant(next)
    }
  }

  override fun getName(): String = "PlayerCommandLock"

  @ReactMethod
  fun acquire(token: String, promise: Promise) {
    val grantNow = synchronized(monitor) {
      val available = ownerToken == null
      if (available) ownerToken = token else waiters.addLast(Waiter(token, promise))
      available
    }
    if (grantNow) grant(Waiter(token, promise))
  }

  @ReactMethod
  fun release(token: String) {
    releaseInternal(token)
  }

  @ReactMethod
  fun renew(token: String) {
    scheduleLease(token)
  }
}
