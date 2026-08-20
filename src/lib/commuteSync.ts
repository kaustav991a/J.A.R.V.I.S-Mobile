import type { CommuteSettings } from './commute';
import type { KnownPlace } from './knownPlaces';

/**
 * The commute schedule, in the shape the gateway is given it.
 *
 * **Why the gateway needs this at all.** The briefing used to be entirely local:
 * a WorkManager job woke up, read Open-Meteo, and posted a notification itself.
 * Measured on the device on 2026-08-20, that cannot work here —
 * `expo-background-task` hardcodes `setRequiredNetworkType(NetworkType.CONNECTED)`
 * (`BackgroundTaskScheduler.kt:108`) and this uid reads
 * `Network: 108 (blocked=REASON_APP_BACKGROUND|REASON_APP_STANDBY)` with
 * `#netAvail=0` in a RARE standby bucket. The job is not deferred, it is stopped;
 * logcat caught it running 200ms after a cold launch and then re-queueing into a
 * window it would be blocked in again. So the app was the only thing that could
 * ever unblock its own briefing, which is exactly how it was reported: "it
 * arrives after I open the app".
 *
 * A high-priority push is exempt from all of that, and the gateway can already
 * send one. What it could not do is know WHEN — so this is that knowledge,
 * travelling in the one direction it has never travelled.
 *
 * `snake_case` because that is the convention on every other body the gateway
 * takes (`push_token`, `platform`).
 */
export type CommuteUpload = {
  /**
   * The zone the schedule is written in, as an IANA name.
   *
   * Part of the contract rather than an assumption: the gateway runs in UTC on
   * Render, and "brief me at 8" means eight o'clock where the phone is. An offset
   * in minutes would have been enough today and wrong the first time either end
   * crossed a DST boundary.
   */
  tz: string;
  /** Which days it runs, indexed the way `Date.getDay()` counts — 0 is Sunday. */
  days: boolean[];
  departures: Array<{
    place_id: string;
    label: string;
    hour: number;
    minute: number;
    lat: number;
    lon: number;
  }>;
};

/**
 * What this device calls its timezone.
 *
 * Wrapped because `Intl` is a Hermes build option rather than a guarantee, and a
 * throw here would take down the settings screen that calls it. `UTC` is a
 * deliberately visible wrong answer — a briefing arriving five and a half hours
 * early says "the zone did not travel" far more clearly than a silent skip.
 */
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Build the upload from what the phone knows.
 *
 * Two things are decided here rather than on the server, because the phone is the
 * only side that holds them:
 *
 * 1. **Which departures are live.** A row that is switched off is not sent, so
 *    turning the feature off is expressed as an empty list — which the gateway can
 *    act on. Sending nothing at all would read as "no change", and a briefing
 *    arriving from a setting the user turned off is the worst thing this feature
 *    could do.
 * 2. **Where the place is.** `KnownPlace` lives on the device; a departure whose
 *    place has never been named has no coordinates, and a row the gateway cannot
 *    forecast for would only ever schedule a briefing that fails. This mirrors
 *    `coordsFor` in `commuteTask.ts`, which already refuses that case — except
 *    that here the refusal is silent rather than reported, so the Places screen
 *    keeps saying which place still needs naming.
 */
export function commutePayload(
  settings: CommuteSettings,
  places: KnownPlace[],
  tz: string = deviceTimezone()
): CommuteUpload {
  const departures: CommuteUpload['departures'] = [];
  for (const d of settings.departures) {
    if (!d.on) continue;
    const at = places.find((p) => p.id === d.placeId);
    if (!at) continue;
    departures.push({
      place_id: d.placeId,
      label: d.label,
      hour: d.hour,
      minute: d.minute,
      lat: at.lat,
      lon: at.lon,
    });
  }
  return { tz, days: [...settings.days], departures };
}
