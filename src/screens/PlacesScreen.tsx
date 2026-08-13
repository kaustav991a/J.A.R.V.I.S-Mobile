import { useCallback, useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
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
import { DEFAULT_COMMUTE, loadCommute, saveCommute } from '../lib/commute';
import type { CommuteSettings } from '../lib/commute';
import { commuteTaskAvailable, previewBriefing, setCommuteTask } from '../lib/commuteTask';
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
  const { shareLocation } = useJarvis();
  const toast = useToast();

  const [places, setPlaces] = useState<KnownPlace[]>([]);
  const [commute, setCommute] = useState<CommuteSettings>(DEFAULT_COMMUTE);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [bgReady, setBgReady] = useState(true);

  useFocusEffect(
    useCallback(() => {
      void loadKnown().then(setPlaces);
      void loadCommute().then(setCommute);
      void commuteTaskAvailable().then(setBgReady);
    }, [])
  );

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
    await setCommuteTask(next.on);
  };

  const shift = (field: 'hour' | 'minute', by: number) => {
    const wrap = field === 'hour' ? 24 : 60;
    const step = field === 'minute' ? by * 15 : by;
    void persist({ ...commute, [field]: (commute[field] + step + wrap) % wrap });
  };

  const clock = `${String(commute.hour).padStart(2, '0')}:${String(commute.minute).padStart(2, '0')}`;

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
      <View style={styles.group}>
        <View style={styles.row}>
          <Ionicons name="umbrella-outline" size={19} color={commute.on ? accent : COLOR.dim} />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Morning briefing</Text>
            <Text style={styles.rowSub}>Rain, heat and wind for your way out</Text>
          </View>
          <Switch
            testID="commute-switch"
            value={commute.on}
            onValueChange={(on) => void persist({ ...commute, on })}
          />
        </View>

        <View style={styles.row}>
          <Ionicons name="time-outline" size={19} color={COLOR.dim} />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Leaving at {clock}</Text>
            <Text style={styles.rowSub}>The forecast covers this hour and the two after</Text>
          </View>
          <View style={styles.steppers}>
            <Stepper testID="commute-hour" label="hr" onDown={() => shift('hour', -1)} onUp={() => shift('hour', 1)} />
            <Stepper testID="commute-min" label="min" onDown={() => shift('minute', -1)} onUp={() => shift('minute', 1)} />
          </View>
        </View>

        <View style={[styles.row, styles.lastRow]}>
          <Ionicons name="calendar-outline" size={19} color={COLOR.dim} />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Weekdays only</Text>
            <Text style={styles.rowSub}>A Sunday umbrella warning is noise</Text>
          </View>
          <Switch
            testID="commute-weekdays"
            value={commute.weekdaysOnly}
            onValueChange={(weekdaysOnly) => void persist({ ...commute, weekdaysOnly })}
          />
        </View>
      </View>

      <Button
        testID="commute-preview"
        label="PREVIEW THE BRIEFING"
        variant="ghost"
        style={styles.preview}
        onPress={() => {
          void previewBriefing().then((problem) => {
            if (problem) toast.show(problem, 'bad');
          });
        }}
      />

      <Hint testID="places-hint">
        {bgReady
          ? 'Android decides when background checks run, so the briefing arrives within about half an hour of your time — not on the dot. Preview sends one now.'
          : 'Background work is disabled for this app in Android settings, so the briefing cannot run. Preview still works while the app is open.'}
      </Hint>
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
  preview: { marginTop: SPACE.lg },
});
