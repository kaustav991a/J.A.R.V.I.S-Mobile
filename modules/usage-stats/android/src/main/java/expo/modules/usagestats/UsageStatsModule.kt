package expo.modules.usagestats

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Process
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * A translation of Android's usage-stats API, and nothing more.
 *
 * Knows nothing about JARVIS, the journal, or the app around it: everything
 * above talks to the `UsageSource` interface in `src/lib/journal/source.ts`, so
 * the whole feature is testable without a device and this file is the only part
 * that needs one.
 *
 * Nothing here collects. Android records this whether an app asks or not; these
 * calls only read what the system has already written, which is why the journal
 * costs the phone no battery of its own.
 */
class UsageStatsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("UsageStats")

    /**
     * The toolchain proof, and it earns its place permanently.
     *
     * When the native side is not loaded at all — a JS-only reload after a
     * module change, an install of an older build — every other call here fails
     * with a message about a missing native module. This one says so in a
     * sentence, and turns "why is the journal empty" into a one-line answer.
     */
    Function("ping") { "usage-stats native alive" }

    /**
     * There is no `checkSelfPermission` answer for this one.
     *
     * PACKAGE_USAGE_STATS is an app-op, granted by hand in a Settings screen
     * rather than by a runtime prompt, so AppOps is the only truthful check. It
     * can also be revoked at any moment with the app never being told — which is
     * why everything above re-asks on every sync instead of caching an answer.
     */
    Function("permission") {
      val ctx = appContext.reactContext ?: return@Function "unavailable"
      val ops = ctx.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager
        ?: return@Function "unavailable"
      val mode = ops.unsafeCheckOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS,
        Process.myUid(),
        ctx.packageName
      )
      if (mode == AppOpsManager.MODE_ALLOWED) "granted" else "denied"
    }

    Function("openSettings") {
      val ctx = appContext.reactContext ?: return@Function false
      val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
      // there is no activity to start from when this is reached from anywhere
      // but the foreground, and the flag is what lets the application context
      // raise the screen regardless
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(intent)
      true
    }

    /**
     * Per-day totals, which is the half of this API with a long memory.
     *
     * Android keeps daily buckets for up to two years, so a first launch is not
     * a blank slate — it is months of history arriving at once.
     *
     * No launch count: `UsageStats.mLaunchCount` is hidden API with no public
     * getter, and reaching it by reflection works on one phone and returns zero
     * on the next. Pickups are counted from KEYGUARD_HIDDEN events instead.
     */
    AsyncFunction("queryDaily") { from: Long, to: Long ->
      val ctx = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
        ?: return@AsyncFunction emptyList<Map<String, Any>>()
      usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, from, to)
        .filter { it.totalTimeInForeground > 0 }
        .map {
          mapOf(
            "app" to it.packageName,
            "ms" to it.totalTimeInForeground,
            // the bucket is stamped by its own end rather than by the window
            // asked for: one call spans many days, and every row has to land on
            // the day it actually belongs to
            "end" to it.lastTimeStamp
          )
        }
    }

    /**
     * Precise moments, which is the half with a short memory — roughly a week.
     *
     * Only five event types are kept. The rest are the system talking to itself,
     * and carrying them would triple the row count for nothing.
     */
    AsyncFunction("queryEvents") { from: Long, to: Long ->
      val ctx = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any?>>()
      val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
        ?: return@AsyncFunction emptyList<Map<String, Any?>>()
      val out = mutableListOf<Map<String, Any?>>()
      val cursor = usm.queryEvents(from, to)
      val event = UsageEvents.Event()
      while (cursor.hasNextEvent()) {
        cursor.getNextEvent(event)
        val kind = when (event.eventType) {
          UsageEvents.Event.ACTIVITY_RESUMED -> "foreground"
          UsageEvents.Event.ACTIVITY_PAUSED -> "background"
          UsageEvents.Event.SCREEN_INTERACTIVE -> "screen_on"
          UsageEvents.Event.SCREEN_NON_INTERACTIVE -> "screen_off"
          // the keyguard going away is the phone genuinely coming into a hand,
          // which is the only honest definition of a pickup
          UsageEvents.Event.KEYGUARD_HIDDEN -> "unlock"
          else -> null
        } ?: continue
        out.add(
          mapOf(
            "at" to event.timeStamp,
            "kind" to kind,
            // screen and keyguard events carry the system package, which is
            // noise on a row that is about the phone rather than about an app
            "app" to if (kind == "foreground" || kind == "background") event.packageName else null
          )
        )
      }
      out
    }
  }
}
