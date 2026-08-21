package expo.modules.applauncher

import android.content.Intent
import android.content.pm.PackageManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Launching an installed app, and listing which ones there are to launch.
 *
 * Deliberately knows nothing about JARVIS, the same as `usage-stats`: this is a
 * translation of two PackageManager calls, so everything above it can talk to an
 * interface and be tested against a fake. Kept out of `usage-stats` because that
 * module is a translation of `UsageStatsManager` and this is not — one module per
 * platform API is what makes either of them replaceable.
 *
 * **Package visibility is already declared.** `plugins/withPackageQueries.js` adds a
 * MAIN/LAUNCHER `<queries>` block for the journal's app names, and that is exactly
 * the set of apps a person can launch — so this needs no new permission and no
 * change to the manifest. `QUERY_ALL_PACKAGES` is restricted and would have to be
 * justified to Google; it is not needed for this and must not be added for it.
 */
class AppLauncherModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AppLauncher")

    /** says so out loud when the native side IS loaded — the same trap as usage-stats */
    Function("ping") { "app-launcher native alive" }

    /**
     * Every app with a launcher icon, as label and package.
     *
     * Sorted by label so a caller listing them for a human does not have to, and
     * because the order out of `queryIntentActivities` is not defined.
     *
     * Apps with no launcher activity are absent, which is correct: something with no
     * icon cannot be opened, so offering its name would be offering a dead end.
     */
    AsyncFunction("installed") {
      val ctx = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, String>>()
      val pm = ctx.packageManager
      val main = Intent(Intent.ACTION_MAIN, null).addCategory(Intent.CATEGORY_LAUNCHER)
      pm.queryIntentActivities(main, 0)
        .mapNotNull { resolved ->
          val pkg = resolved.activityInfo?.packageName ?: return@mapNotNull null
          // the label as the launcher shows it; the package is the fallback, because a
          // nameless entry is still launchable and dropping it would hide a real app
          val label = resolved.loadLabel(pm)?.toString()?.trim().takeUnless { it.isNullOrEmpty() } ?: pkg
          mapOf("label" to label, "pkg" to pkg)
        }
        // one entry per package: an app with two launcher activities is still one app
        .distinctBy { it["pkg"] }
        .sortedBy { it["label"]?.lowercase() }
    }

    /**
     * Bring one app to the front. False when it cannot be done, never a throw.
     *
     * `getLaunchIntentForPackage` rather than an intent built by hand: it resolves
     * whichever activity the launcher would use, which is the only definition of
     * "open this app" that survives an app reorganising itself.
     *
     * `NEW_TASK` because this is started from a service context rather than from the
     * activity being replaced — without it Android refuses the start outright.
     */
    AsyncFunction("launch") { pkg: String ->
      val ctx = appContext.reactContext ?: return@AsyncFunction false
      try {
        val intent = ctx.packageManager.getLaunchIntentForPackage(pkg)
          ?: return@AsyncFunction false
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(intent)
        true
      } catch (e: PackageManager.NameNotFoundException) {
        false
      } catch (e: SecurityException) {
        // a package that exists but refuses to be started by us. Nothing to be done
        // about it here, and it must not take the turn down
        false
      }
    }
  }
}
