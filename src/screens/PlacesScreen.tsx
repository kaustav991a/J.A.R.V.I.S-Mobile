import { useCallback, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Hint, Screen, SectionLabel } from '../components/ui/Atoms';
import { ScreenTitle } from '../components/ui/ScreenTitle';
import { Button } from '../components/ui/Button';
import { Touchable } from '../components/ui/Touchable';
import { useToast } from '../components/ui/Toast';
import { COLOR, SPACE, TYPE } from '../theme/tokens';
import { useAppearance } from '../theme/appearance';
import { useJarvis } from '../state/JarvisProvider';
import { FIXED_SLOTS, forgetPlace, loadKnown, nameHere } from '../lib/knownPlaces';
import type { KnownPlace } from '../lib/knownPlaces';
import { currentFix } from '../lib/place';
import { crossings, forgetCrossing, loadSeen, storeHeld } from '../lib/timeline';
import type { Seen } from '../lib/timeline';
import {
  askForBackgroundLocation,
  sweepsToday,
  backgroundLocationState,
  previewLeaving,
  startWatchingPlaces,
  stopWatchingPlaces,
  watchingPlaces,
} from '../lib/geofence';
import {
  ageCloudStamp,
  cloudArmedState,
  DAY_INITIALS,
  DAY_NAMES,
  DEFAULT_COMMUTE,
  clockLabel,
  hourLabel,
  loadCommute,
  saveCommute,
} from '../lib/commute';
import type { CloudArmedState, CommuteSettings, Departure } from '../lib/commute';
import { commuteTaskAvailable, commuteTaskHealth, previewBriefing, setCommuteTask } from '../lib/commuteTask';
import { forgetHeartbeat, healthLine } from '../lib/taskHealth';
import type { HealthReading } from '../lib/taskHealth';
import { live } from '../state/live';
import type { Live } from '../state/live';
import { haptic } from '../lib/haptics';

/**
 * Teaching J.A.R.V.I.S. where things are, and when you leave.
 *
 * Places are named by standing in them: the phone already knows the coordinates,
 * and the one moment you are certain of a place is while you are there. Typing an
 * address would mean geocoding a string to a point you cannot verify.
 */
export function PlacesScreen() {
  const { accent } = useAppearance();
  const { shareLocation, syncCommute } = useJarvis();
  const toast = useToast();

  const [places, setPlaces] = useState<KnownPlace[]>([]);
  const [commute, setCommute] = useState<CommuteSettings>(DEFAULT_COMMUTE);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [bgReady, setBgReady] = useState(true);
  const [health, setHealth] = useState<HealthReading | null>(null);
  /**
   * Whether the gateway is believed to be holding the schedule.
   *
   * Read here as well as on the Home panel because this is where the lever lives:
   * the stale state cannot happen on demand — the stamp refreshes on every cloud
   * connect — and the only other way to reach it is moving the clock, which would
   * cost the timeline and the journal.
   */
  const [cloudState, setCloudState] = useState<CloudArmedState>('never');

  /**
   * Whether Android is reporting the boundaries of your places being crossed.
   *
   * Two facts, not one: whether the permission is there, and whether a registration
   * is live. A phone can hold the grant and be watching nothing, which is what every
   * launch before this one looked like.
   */
  const [bgLocation, setBgLocation] = useState<'ready' | 'foreground-only' | 'refused'>('refused');
  const [watching, setWatching] = useState(false);

  /**
   * The crossings the store holds, and the bursts it refused today.
   *
   * Read on focus rather than kept live: this is a diagnostic somebody opens to check
   * an answer, not a feed. A crossing arrives every few hours at most.
   */
  const [crossed, setCrossed] = useState<Seen[]>([]);
  const [sweeps, setSweeps] = useState(0);
  const [held, setHeld] = useState({ rows: 0, days: 0 });

  /**
   * The one repair this screen can make, and it makes it once.
   *
   * `unarmed` is the state the device was found in on 2026-08-26: two departures
   * switched on, and no job for this uid in `dumpsys jobscheduler`. Reporting it is
   * better than the old "Available" badge and is still an answer nobody can act on —
   * the only way back is to ask Android again, and the app is the only thing that can.
   *
   * Once per mount, and the guard is the point rather than an optimisation. A refusal
   * is a platform decision, so repeating it turns one refusal into a loop that says
   * the same sentence while the calls keep going. If the second attempt fails, the
   * reason it failed is what the row then shows.
   */
  const rearmed = useRef(false);

  const readHealth = useCallback(async (l: Live) => {
    const first = await commuteTaskHealth();
    l.only(setHealth)(first);
    if (first.health !== 'unarmed' || rearmed.current) return;

    rearmed.current = true;
    await setCommuteTask(true);
    l.only(setHealth)(await commuteTaskHealth());
  }, []);

  useFocusEffect(
    useCallback(() => {
      const l = live();
      void loadKnown().then(l.only(setPlaces));
      void loadCommute().then(l.only(setCommute));
      void commuteTaskAvailable().then(l.only(setBgReady));
      void cloudArmedState().then(l.only(setCloudState));
      void backgroundLocationState().then(l.only(setBgLocation));
      void watchingPlaces().then(l.only(setWatching));
      void loadSeen().then((seen) => l.only(setCrossed)(crossings(seen, new Date())));
      void sweepsToday().then(l.only(setSweeps));
      void storeHeld().then(l.only(setHeld));
      void readHealth(l);
      return l.end;
    }, [readHealth])
  );

  /**
   * Turn the watching on, asking for whatever is missing first.
   *
   * One control rather than a permission button and a start button, because the two
   * are never usefully separate: a grant with nothing registered watches nothing, and
   * a registration without the grant is refused. What it cannot do is say yes on your
   * behalf. On Android 11 and later the second dialog is a trip to Settings, so
   * "still foreground only" is a normal answer and the toast says where to go.
   */
  /**
   * Take a crossing back, when the app was wrong about it.
   *
   * Nothing else in the app can edit this store, and a figure nobody can correct is
   * how "usually gone by 3:40 PM" survived a fortnight.
   */
  const disown = async (c: Seen) => {
    await forgetCrossing(c.at);
    setCrossed((held) => held.filter((x) => x.at !== c.at));
    haptic.tap();
    toast.show('Taken out. It will not count towards your hours.');
  };

  const startWatching = async () => {
    const granted = await askForBackgroundLocation();
    setBgLocation(granted);
    if (granted !== 'ready') {
      haptic.bad();
      toast.show(
        granted === 'refused'
          ? 'Location is off for this app, so nothing can be watched.'
          : 'Android needs Allow all the time, in Settings, before it will report you leaving.'
      );
      return;
    }

    const why = await startWatchingPlaces(places);
    setWatching(await watchingPlaces());
    if (why === 'watching') {
      haptic.good();
      toast.show('Watching your places. Leaving one is now something he can see.');
      return;
    }
    haptic.bad();
    toast.show(
      why === 'nothing-named'
        ? 'Name a place first, there is nothing to watch yet.'
        : why === 'no-permission'
          ? 'Android took the permission back. Allow all the time, in Settings.'
          : 'This build cannot watch places. It needs the newer app installed.'
    );
  };

  /**
   * Post the departure notification now, since the real one needs a walk.
   *
   * A notification nobody has ever seen is a notification nobody knows is silent, on
   * the wrong channel, or cut off in the shade — all three of which this app has
   * shipped before. It writes no sighting and spends no cooldown, so pressing it
   * cannot teach him a departure that never happened.
   */
  const previewDeparture = async () => {
    await previewLeaving(places[0]?.label ?? 'Office');
    haptic.tap();
    toast.show('Sent. That is what a real departure will look like.');
  };

  /**
   * Stop watching, which is also how the row is checked.
   *
   * Android holds the registration across launches, so without this there is no way
   * back to the off state short of reinstalling, and no way to read the sentence this
   * row shows when nothing is being watched.
   */
  const stopWatching = async () => {
    await stopWatchingPlaces();
    setWatching(await watchingPlaces());
    haptic.good();
    toast.show('Stopped. Departures go back to being guessed from when you open the app.');
  };

  /**
   * Start the reboot check.
   *
   * WorkManager persists its own queue and reschedules at boot, so the briefing is
   * *expected* to survive one — and expected is not observed. Confirming it used to
   * mean `adb logcat` on the one machine that built the APK. Clear the count here,
   * reboot, leave the app closed, and come back: a count above zero was written by a
   * run nobody started, which is the whole claim.
   */
  const resetRuns = async () => {
    await forgetHeartbeat();
    setHealth(await commuteTaskHealth());
    haptic.good();
    toast.show('Run count cleared. Reboot, leave the app closed, then look again.');
  };

  /**
   * Unregister the task deliberately, so the unarmed sentence can be read.
   *
   * The row above is the only place the app says the fallback is not armed, and that
   * sentence had never been seen by anybody: the app re-arms at launch and on every
   * visit here, so the state heals faster than it can be looked at. This is the only
   * way to hold it still.
   *
   * Deliberately not re-armed on the same breath. The sentence is the thing being
   * checked, so it has to survive long enough to read — and the repair is one step
   * away and automatic, which the toast says out loud so nobody is left believing
   * they have broken their own briefing.
   */
  const disarmForCheck = async () => {
    await setCommuteTask(false);
    setHealth(await commuteTaskHealth());
    haptic.good();
    toast.show('Unregistered. Read the line above, then leave Places and come back to re-arm.');
  };

  /**
   * Age the gateway stamp, so the panel can be read in its third state.
   *
   * `CANNOT TELL` is the one state on the Home status panel nobody has ever seen, and
   * it needs an upload older than two days. The stamp refreshes on every cloud
   * connect, so it never goes stale on its own, and the only other lever is the
   * phone's clock — which must not move, because the location timeline is mid-count
   * and the journal is time-keyed.
   *
   * So the stamp is written back past its window and nothing else is touched: not the
   * clock, not the schedule, not the copy the gateway holds. The next cloud connect
   * writes a fresh one, which is the same self-healing shape as unregistering the
   * fallback to read its unarmed sentence.
   */
  const ageStamp = async () => {
    await ageCloudStamp();
    setCloudState(await cloudArmedState());
    haptic.good();
    toast.show('Stamp aged. Home now reads CANNOT TELL; the next cloud connect clears it.');
  };

  /**
   * Take the person to the screen that actually decides this.
   *
   * `openSettings()` opens the app's own settings page, from which the battery
   * optimisation list is a menu, a submenu and three taps away — and this row exists
   * because that list is the difference between an armed task and one Android never
   * gives a window to: standby bucket 40 (RARE) on this device, not on the idle
   * whitelist, `Network: blocked=REASON_APP_STANDBY` for this uid.
   *
   * The intent needs no permission, unlike `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`,
   * which is a manifest entry and therefore a new build. It is not guaranteed to
   * resolve on an OEM build without the activity, so a refusal falls back to the long
   * way round rather than leaving a button that does nothing.
   */
  const liftBatteryRestrictions = async () => {
    try {
      await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
    } catch {
      await Linking.openSettings().catch(() => {});
    }
  };

  const setHere = async (id: string, name: string) => {
    if (!shareLocation) {
      toast.show('Turn on location sharing first', 'bad');
      return;
    }
    setBusy(true);
    const fix = await currentFix();
    setBusy(false);
    if (!fix) {
      toast.show('No location fix yet', 'bad');
      return;
    }
    setPlaces(await nameHere(id, name, fix));
    haptic.good();
    toast.show(`${name} set to ${fix.place || 'here'}`);
  };

  const drop = async (id: string, name: string) => {
    setPlaces(await forgetPlace(id));
    toast.show(`${name} forgotten`);
  };

  const persist = async (next: CommuteSettings) => {
    setCommute(next);
    await saveCommute(next);
    // one registration serves both departures; the task decides which is due
    await setCommuteTask(next.departures.some((d) => d.on));
    /**
     * And tell the gateway, which is what will actually deliver it.
     *
     * The local task above is kept as a fallback, not as the mechanism: measured
     * on 2026-08-20, it requires a connected network on every run and this uid
     * has none in the background, so it only ever fires once the app is opened.
     * Sending here rather than on the next connect is the difference between an
     * edit that takes effect this evening and one that takes effect whenever the
     * app is next launched.
     */
    void syncCommute();
  };

  const setDeparture = (placeId: string, patch: Partial<Departure>) =>
    persist({
      ...commute,
      departures: commute.departures.map((d) => (d.placeId === placeId ? { ...d, ...patch } : d)),
    });

  const shift = (placeId: string, field: 'hour' | 'minute', by: number) => {
    const d = commute.departures.find((x) => x.placeId === placeId);
    if (!d) return;
    const wrap = field === 'hour' ? 24 : 60;
    const step = field === 'minute' ? by * 15 : by;
    void setDeparture(placeId, { [field]: (d[field] + step + wrap) % wrap });
  };

  const toggleDay = (index: number) =>
    persist({ ...commute, days: commute.days.map((on, i) => (i === index ? !on : on)) });

  return (
    <Screen testID="places-screen">
      <ScreenTitle title="PLACES" />

      {!shareLocation ? (
        <Hint testID="places-need-location">
          Location sharing is off, so there is nothing to name. Turn it on in Settings → Privacy.
        </Hint>
      ) : null}

      <SectionLabel>Named places</SectionLabel>
      <View style={styles.group}>
        {FIXED_SLOTS.map(({ id, label: name }) => {
          const saved = places.find((p) => p.id === id);
          return (
            <View key={id} style={styles.row}>
              <Ionicons
                name={id === 'home' ? 'home-outline' : 'business-outline'}
                size={19}
                color={saved ? accent : COLOR.dim}
              />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{name}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {saved ? saved.area || `${saved.lat.toFixed(3)}, ${saved.lon.toFixed(3)}` : 'Not set'}
                </Text>
              </View>
              <Touchable
                testID={`place-set-${id}`}
                accessibilityRole="button"
                accessibilityLabel={`Set ${name} to here`}
                hitSlop={8}
                onPress={() => void setHere(id, name)}
              >
                <Text style={[styles.action, { color: accent }]}>{saved ? 'UPDATE' : 'SET HERE'}</Text>
              </Touchable>
              {saved ? (
                <Touchable
                  testID={`place-drop-${id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Forget ${name}`}
                  hitSlop={8}
                  onPress={() => void drop(id, name)}
                >
                  <Ionicons name="close" size={18} color={COLOR.dim} />
                </Touchable>
              ) : null}
            </View>
          );
        })}

        {places
          .filter((p) => !FIXED_SLOTS.some((s) => s.id === p.id))
          .map((p) => (
            <View key={p.id} style={styles.row}>
              <Ionicons name="bookmark-outline" size={19} color={accent} />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{p.label}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {p.area || `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}`}
                </Text>
              </View>
              <Touchable
                testID={`place-drop-${p.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Forget ${p.label}`}
                hitSlop={8}
                onPress={() => void drop(p.id, p.label)}
              >
                <Ionicons name="close" size={18} color={COLOR.dim} />
              </Touchable>
            </View>
          ))}
      </View>

      <SectionLabel>Name where you are</SectionLabel>
      <View style={styles.addRow}>
        <TextInput
          testID="place-label"
          style={styles.input}
          value={label}
          onChangeText={setLabel}
          placeholder="Gym, mum's, the usual chai place…"
          placeholderTextColor={COLOR.dim}
          autoCapitalize="words"
        />
        <Button
          testID="place-add"
          label="ADD"
          busy={busy}
          disabled={!label.trim()}
          onPress={() => {
            const name = label.trim();
            if (!name) return;
            void setHere(`custom-${Date.now()}`, name).then(() => setLabel(''));
          }}
        />
      </View>

      <SectionLabel>Before you leave</SectionLabel>
      {commute.departures.map((d) => {
        const named = places.some((p) => p.id === d.placeId);
        return (
          <View key={d.placeId} style={[styles.group, styles.departure]}>
            <View style={styles.row}>
              <Ionicons name="umbrella-outline" size={19} color={d.on ? accent : COLOR.dim} />
              <View style={styles.rowText}>
                {/* named, not "Morning briefing": it fires at whatever hour is set,
                    and calling it morning is half of why an evening time looked
                    right on the screen that set it */}
                <Text style={styles.rowTitle}>Leaving {d.label}</Text>
                <Text style={styles.rowSub}>
                  {named
                    ? `Rain, heat and wind at ${d.label}`
                    : `Set ${d.label} above — otherwise this needs a live fix and will not run in the background`}
                </Text>
              </View>
              <Switch
                testID={`commute-switch-${d.placeId}`}
                value={d.on}
                onValueChange={(on) => void setDeparture(d.placeId, { on })}
              />
            </View>

            <View style={styles.row}>
              <Ionicons name="time-outline" size={19} color={COLOR.dim} />
              <View style={styles.rowText}>
                {/* 8 PM was set as 08:00 and every label agreed with it right up
                    until the briefing did not arrive. The meridiem is the point. */}
                <Text style={styles.rowTitle} testID={`commute-clock-${d.placeId}`}>
                  {clockLabel(d.hour, d.minute)}
                </Text>
                <Text style={styles.rowSub}>
                  Forecast covers {hourLabel(d.hour)}–{hourLabel((d.hour + 3) % 24)}
                </Text>
              </View>
              <View style={styles.steppers}>
                <Stepper
                  testID={`commute-hour-${d.placeId}`}
                  label="hr"
                  onDown={() => shift(d.placeId, 'hour', -1)}
                  onUp={() => shift(d.placeId, 'hour', 1)}
                />
                <Stepper
                  testID={`commute-min-${d.placeId}`}
                  label="min"
                  onDown={() => shift(d.placeId, 'minute', -1)}
                  onUp={() => shift(d.placeId, 'minute', 1)}
                />
              </View>
            </View>

            <View style={[styles.row, styles.lastRow]}>
              <Ionicons name="notifications-outline" size={19} color={COLOR.dim} />
              <View style={styles.rowText}>
                <Text style={styles.rowSub}>Send this one now, to see what it says</Text>
              </View>
              <Touchable
                testID={`commute-preview-${d.placeId}`}
                accessibilityRole="button"
                accessibilityLabel={`Preview the ${d.label} briefing`}
                hitSlop={8}
                onPress={() => {
                  void previewBriefing(d.placeId).then((problem) => {
                    if (problem) toast.show(problem, 'bad');
                  });
                }}
              >
                <Text style={[styles.action, { color: accent }]}>PREVIEW</Text>
              </Touchable>
            </View>
          </View>
        );
      })}

      <SectionLabel>On these days</SectionLabel>
      <View style={styles.days}>
        {DAY_INITIALS.map((initial, index) => (
          <Touchable
            key={DAY_NAMES[index]}
            testID={`commute-day-${index}`}
            accessibilityRole="button"
            accessibilityState={{ selected: commute.days[index] }}
            accessibilityLabel={DAY_NAMES[index]}
            onPress={() => void toggleDay(index)}
          >
            <View
              style={[
                styles.day,
                commute.days[index] ? { backgroundColor: accent, borderColor: accent } : null,
              ]}
            >
              <Text style={[styles.dayText, commute.days[index] ? styles.dayTextOn : null]}>{initial}</Text>
            </View>
          </Touchable>
        ))}
      </View>
      <Hint testID="commute-days-hint">
        The weekend is off. Tap Saturday when you are working one — it stays on until you tap it again.
      </Hint>

      <Hint testID="places-hint">
        {bgReady
          ? 'Android decides when background checks run, so a briefing arrives within about half an hour of your time — not on the dot. Preview sends one now.'
          : 'Background work is disabled for this app in Android settings, so the briefing cannot run. Preview still works while the app is open.'}
      </Hint>

      {/**
       * The lever that actually decides whether any of this runs.
       *
       * `commuteTaskAvailable()` reports Available on a phone the briefing will
       * still never reach, which is most of why this feature looked broken rather
       * than throttled. Measured on the device it is meant for:
       *
       *     adb shell am get-standby-bucket  ->  40 (RARE)
       *     dumpsys deviceidle whitelist     ->  not listed
       *     jobscheduler, this uid           ->  Network: blocked=REASON_APP_STANDBY
       *
       * RARE allows roughly one job window a day, against a departure window of an
       * hour — and the network is cut for the run even when it does land. Exempting
       * the app from battery optimisation is the only fix, and it cannot be done
       * from code: it is a permission the user grants. So the screen says so and
       * offers the door rather than reporting a healthy background task.
       */}
      {/**
       * Whether it is running, as opposed to registered.
       *
       * The row below this one explains that Android can throttle the task into
       * never running; this one says whether it has. `getStatusAsync()` reports
       * Available on a phone the briefing never reaches, so a screen showing only
       * that has been saying "healthy" about a feature that had not run in days.
       * Only a stamp written by the task itself can distinguish them, because only
       * a run can write one.
       *
       * It is also how "did he come back after the reboot?" gets answered without
       * `adb logcat` on the one machine that built the APK: note the count, reboot,
       * leave the app closed, and come back to see whether it moved.
       */}
      <View style={styles.row}>
        <Ionicons name="pulse-outline" size={19} color={COLOR.dim} />
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>Background briefing</Text>
          <Text style={styles.rowSub} testID="commute-health">
            {health ? healthLine(health) : 'Checking.'}
          </Text>
        </View>
        {/**
         * Take the registration away, so the sentence above can be read for real.
         *
         * `fallback-armed` sat `partial` for days over exactly this: the armed half
         * was proved on the device, and "says so when it is not" could not be
         * induced, because the app re-arms itself at launch and on every visit to
         * this screen. The state the row exists to report healed before anyone could
         * look at it.
         *
         * Unregistering is the only way to see it, and it is safe to offer because
         * the repair is already automatic and already proved: leaving this screen
         * and coming back arms it again, by the same path that fixed the real
         * occurrence on 2026-08-26. It does not touch the stored schedule, so
         * nothing about what he owes you changes — only whether Android is holding
         * the job right now.
         *
         * Offered only while something is actually armed. An action that would do
         * nothing teaches that the controls on this row are decoration.
         */}
        {health && health.health !== 'unarmed' && health.health !== 'off' ? (
          /**
           * A plain `Pressable`, and that is the whole reason this control works.
           *
           * `Touchable` is an animated `Pressable`, and `adb shell input` cannot
           * press one — measured on 2026-08-26 across a tap, a held swipe and an
           * explicit motionevent, none of which fired. This control exists so the
           * unarmed sentence can be checked, and most of the checking on this
           * project is driven from a laptop with the phone on wireless debugging.
           * Built as a `Touchable` it would have been a button that only a finger
           * could reach, on a row whose entire purpose is remote diagnosis.
           *
           * `SettingsRow` takes `input tap` normally for the same reason, which is
           * how Settings → Places is opened from a laptop at all.
           */
          <Pressable
            testID="commute-disarm"
            accessibilityRole="button"
            accessibilityLabel="Unregister the background briefing, to see what the app says when it is not armed"
            hitSlop={8}
            onPress={() => {
              void disarmForCheck();
            }}
            style={({ pressed }) => (pressed ? styles.pressed : undefined)}
          >
            <Text style={[styles.action, { color: COLOR.dim }]}>TEST</Text>
          </Pressable>
        ) : null}
        <Touchable
          testID="commute-reset-runs"
          accessibilityRole="button"
          accessibilityLabel="Clear the run count to start the reboot check"
          hitSlop={8}
          onPress={() => {
            void resetRuns();
          }}
        >
          <Text style={[styles.action, { color: accent }]}>RESET</Text>
        </Touchable>
      </View>

      <View style={styles.row}>
        <Ionicons name="cloud-done-outline" size={19} color={COLOR.dim} />
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>Gateway briefing stamp</Text>
          <Text style={styles.rowSub} testID="cloud-stamp">
            {cloudState === 'armed'
              ? 'The gateway holds your schedule and is briefing from it. The phone stays quiet underneath.'
              : cloudState === 'stale'
                ? 'The last upload is more than two days old, so it proves nothing now. Home reads CANNOT TELL.'
                : 'No upload has ever been accepted, so this phone is the one briefing you.'}
          </Text>
        </View>
        {/*
          Offered only when there is a stamp to age. `never` and `stale` are
          different facts and the panel says different things about them, so a
          control that invented a stamp would make the app claim an upload that
          never happened.
        */}
        {cloudState !== 'never' ? (
          <Pressable
            testID="cloud-stamp-age"
            accessibilityRole="button"
            accessibilityLabel="Age the gateway stamp, to see what the panel says when it is stale"
            hitSlop={8}
            onPress={() => {
              void ageStamp();
            }}
            style={({ pressed }) => (pressed ? styles.pressed : undefined)}
          >
            <Text style={[styles.action, { color: COLOR.dim }]}>TEST</Text>
          </Pressable>
        ) : null}
      </View>

      {/**
       * The row that ends the app-open bias.
       *
       * Every timing in this app came from a sighting written when somebody happened
       * to open it, and 2026-09-01 spent the day paying for that: an office he leaves
       * at seven reported as gone by 3:40 PM, an arrival called early for a man who
       * had slept there. Android reports a boundary crossing with the app closed,
       * which is the only way a departure is ever measured rather than inferred.
       *
       * It says which of the two things is missing, because the fixes are different:
       * a permission is a dialog, a registration is this button, and an old build is
       * an install.
       */}
      <View style={styles.row}>
        <Ionicons name="navigate-circle-outline" size={19} color={COLOR.dim} />
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>Watching your places</Text>
          <Text style={styles.rowSub} testID="geofence-state">
            {watching
              ? 'Android is watching ' +
                (places.length === 1 ? 'one place' : places.length + ' places') +
                ' with the app closed, and will tell you when you leave one. Arrivals are recorded quietly.'
              : bgLocation === 'ready'
                ? 'The permission is there and nothing is registered, so leaving a place still goes unseen.'
                : bgLocation === 'foreground-only'
                  ? 'Location works only while the app is open, so your departures are guessed from when you last used it.'
                  : 'Location is off for this app, so places are only named when you ask.'}
          </Text>
        </View>
        {/*
          Offered only while something is being watched, since a preview of a
          notification that cannot arrive teaches the wrong thing.
        */}
        {watching ? (
          <Pressable
            testID="geofence-preview"
            accessibilityRole="button"
            accessibilityLabel="Send a departure notification now, to see what it looks like"
            hitSlop={8}
            onPress={() => {
              void previewDeparture();
            }}
            style={({ pressed }) => (pressed ? styles.pressed : undefined)}
          >
            <Text style={[styles.action, { color: COLOR.dim }]}>TEST</Text>
          </Pressable>
        ) : null}
        <Pressable
          testID="geofence-toggle"
          accessibilityRole="button"
          accessibilityLabel={
            watching ? 'Stop watching your places' : 'Watch your places in the background'
          }
          hitSlop={8}
          onPress={() => {
            void (watching ? stopWatching() : startWatching());
          }}
          style={({ pressed }) => (pressed ? styles.pressed : undefined)}
        >
          <Text style={[styles.action, { color: watching ? COLOR.dim : accent }]}>
            {watching ? 'STOP' : 'WATCH'}
          </Text>
        </Pressable>
      </View>

      {/**
       * What the app actually recorded, as data rather than as a claim.
       *
       * *"but if sweep is silent then it will add different timings and we can't show
       * it"* — asked an hour after the false departures were silenced, and the honest
       * answer was that a suppressed sweep writes nothing AND nobody could check that.
       * The only window into the sighting store was a notification, and those had just
       * been switched off for the wrong ones.
       *
       * Both halves are here: the crossings that were kept, and how many bursts were
       * refused today. A day with sweeps refused and no notifications is the rule
       * working; a quiet day with a departure missing is the rule failing. Until this
       * row existed those two looked identical.
       */}
      <View style={styles.row}>
        <Ionicons name="git-commit-outline" size={19} color={COLOR.dim} />
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>Crossings recorded</Text>
          {crossed.length ? (
            crossed.map((c) => (
              <View key={`${c.place}-${c.at}`} style={styles.crossing}>
                <Text style={styles.rowSub} testID={`crossing-${c.at}`}>
                  {`${c.via === 'exit' ? 'Left' : 'Reached'} ${c.place} · ${clockLabel(
                    new Date(c.at).getHours(),
                    new Date(c.at).getMinutes()
                  )}`}
                </Text>
                {/*
                  Disowning one, because the app is sometimes wrong about them. A
                  drifting fix wrote "Left Office, 6:12 PM" from a desk he had not
                  left, and until this control existed there was no way to take it
                  back out — the median would have carried it for twelve weeks.
                */}
                <Pressable
                  testID={`crossing-forget-${c.at}`}
                  accessibilityRole="button"
                  accessibilityLabel={`That was wrong: ${c.place}`}
                  hitSlop={8}
                  onPress={() => {
                    void disown(c);
                  }}
                  style={({ pressed }) => (pressed ? styles.pressed : undefined)}
                >
                  <Ionicons name="close" size={15} color={COLOR.dim} />
                </Pressable>
              </View>
            ))
          ) : (
            <Text style={styles.rowSub} testID="crossings-none">
              Nothing yet. A crossing is recorded when you leave or reach a named place with
              the app closed.
            </Text>
          )}
          <Text style={styles.rowSub} testID="crossings-swept">
            {sweeps === 0
              ? 'No bursts refused today.'
              : sweeps === 1
                ? 'One burst refused today — several places at once, which is the platform and not you. Nothing was recorded from it.'
                : `${sweeps} bursts refused today — several places at once, which is the platform and not you. Nothing was recorded from them.`}
          </Text>
          {/*
           * What the store actually holds.
           *
           * A migration nobody can see is a migration nobody can trust. This row is
           * here before anything imports a Timeline export, so that "the import found
           * nothing" and "the store is empty" can never look the same on screen.
           */}
          <Text style={styles.rowSub} testID="crossings-held">
            {held.rows === 0
              ? 'Nothing held yet.'
              : `${held.rows} sightings held, reaching back ${held.days} ${held.days === 1 ? 'day' : 'days'}.`}
          </Text>
        </View>
      </View>

      <View style={styles.row}>
        <Ionicons name="battery-charging-outline" size={19} color={COLOR.dim} />
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>Battery restrictions</Text>
          <Text style={styles.rowSub}>
            Android throttles rarely-used apps and cuts their background network, which stops a
            briefing even when the time and the place are right. Set this app to Unrestricted.
          </Text>
        </View>
        <Touchable
          testID="commute-battery-settings"
          accessibilityRole="button"
          accessibilityLabel="Open Android's battery optimisation list"
          hitSlop={8}
          onPress={() => {
            void liftBatteryRestrictions();
          }}
        >
          <Text style={[styles.action, { color: accent }]}>SETTINGS</Text>
        </Touchable>
      </View>
    </Screen>
  );
}

function Stepper({
  label,
  onUp,
  onDown,
  testID,
}: {
  label: string;
  onUp: () => void;
  onDown: () => void;
  testID: string;
}) {
  // two arrows rather than a picker: a native time picker is another dependency
  // for a value that changes twice a year
  return (
    <View style={styles.stepper}>
      <Touchable testID={`${testID}-up`} accessibilityRole="button" accessibilityLabel={`${label} up`} hitSlop={6} onPress={onUp}>
        <Ionicons name="chevron-up" size={16} color={COLOR.white} />
      </Touchable>
      <Text style={styles.stepperLabel}>{label}</Text>
      <Touchable testID={`${testID}-down`} accessibilityRole="button" accessibilityLabel={`${label} down`} hitSlop={6} onPress={onDown}>
        <Ionicons name="chevron-down" size={16} color={COLOR.white} />
      </Touchable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Pressable has no feedback of its own, and Touchable's is what was given up to
  // make this reachable by adb
  pressed: { opacity: 0.55 },
  group: {
    backgroundColor: COLOR.panel,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    overflow: 'hidden',
  },
  // the time and its disown control on one line, the control small enough not to
  // read as the row's main action
  crossing: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    padding: SPACE.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLOR.line,
  },
  lastRow: { borderBottomWidth: 0 },
  rowText: { flex: 1 },
  rowTitle: { ...TYPE.dataValue, fontSize: 15, color: COLOR.white },
  rowSub: { ...TYPE.dataLabel, color: COLOR.dim, marginTop: 2 },
  action: { ...TYPE.dataLabel },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  input: {
    flex: 1,
    ...TYPE.meta,
    color: COLOR.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.dim,
    borderRadius: 8,
    paddingHorizontal: SPACE.md,
    minHeight: 44,
  },
  steppers: { flexDirection: 'row', gap: SPACE.md },
  stepper: { alignItems: 'center' },
  stepperLabel: { ...TYPE.dataLabel, color: COLOR.dim },
  departure: { marginBottom: SPACE.md },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    backgroundColor: COLOR.panel,
  },
  dayText: { ...TYPE.dataValue, fontSize: 14, color: COLOR.dim },
  dayTextOn: { color: COLOR.bg },
});
