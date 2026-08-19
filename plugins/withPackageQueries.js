const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Let the app see which packages exist, so it can ask what they are called.
 *
 * Android 11 made package visibility opt-in: without this block,
 * `PackageManager.getApplicationInfo` throws `NameNotFoundException` for every
 * third-party app, and only system packages resolve. Measured on the device
 * before this existed — 86 packages asked about, 36 named. `Google`, `Gallery`
 * and `Security` came back; `com.whatsapp`, `com.truecaller` and
 * `com.idfcfirstbank.optimus` came back as themselves, and the journal's digest
 * read "Gm 2h 12m, Pesam 1h 25m, Katana 26m".
 *
 * A MAIN/LAUNCHER intent rather than `QUERY_ALL_PACKAGES`. It covers exactly the
 * apps a person launches, which is exactly the set whose screen time is worth
 * naming — and it is the declaration Google asks for, where the blanket
 * permission is restricted and would have to be justified. Services with no
 * launcher icon stay unnamed, and nobody wants those named anyway.
 *
 * The usage figures themselves were never affected: those come from
 * `UsageStatsManager`, a system service, and are not filtered by visibility.
 * Only the names were.
 */
module.exports = function withPackageQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const { manifest } = cfg.modResults;
    const queries = manifest.queries ?? [];

    const already = queries.some((q) =>
      (q.intent ?? []).some((i) =>
        (i.action ?? []).some((a) => a?.$?.['android:name'] === 'android.intent.action.MAIN')
      )
    );

    if (!already) {
      queries.push({
        intent: [
          {
            action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
            category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
          },
        ],
      });
    }

    manifest.queries = queries;
    return cfg;
  });
};
