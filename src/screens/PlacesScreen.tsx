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
import {
  DAY_INITIALS,
  DAY_NAMES,
  DEFAULT_COMMUTE,
  clockLabel,
  hourLabel,
  loadCommute,
  saveCommute,
} from '../lib/commute';
import type { CommuteSettings, Departure } from '../lib/commute';
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
      void readHealth(l);
      return l.end;
    }, [readHealth])
  );

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
