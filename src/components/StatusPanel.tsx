import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { COLOR, RADIUS, SPACE, TYPE } from '../theme/tokens';
import { useAppearance } from '../theme/appearance';
import { offCount, statusRows } from '../lib/status';
import type { StatusFacts, StatusState } from '../lib/status';

/**
 * What is connected, on the screen you land on.
 *
 * Built so a report can name the thing that is off rather than saying "it did not
 * work" — see the header of `lib/status.ts` for why that is worth a panel.
 *
 * Three rules it follows, each of which this project has paid for once already:
 *
 * 1. **The dot is the glance and the word is the signal.** Red against green is the
 *    one distinction a colour-blind reader cannot make, and telling two states apart
 *    is the whole job here. Every row carries `ON` / `OFF BY CHOICE` / `NOT ASKED`
 *    beside the dot.
 * 2. **One shared value drives every pulse.** A `useSharedValue` per row would be
 *    eight worklets on a screen that also holds the reactor and the vitals panel,
 *    and the frame budget on this phone is real.
 * 3. **It respects the Appearance animation toggle.** With animation off the dots
 *    are simply drawn, which loses nothing: the colour and the word both survive.
 */
const DOT_COLOR: Record<StatusState, string> = {
  on: COLOR.green,
  off: COLOR.red,
  waiting: COLOR.gold,
  unknown: COLOR.dim,
};

/** only what is wrong draws attention; a settled row is a steady dot */
const PULSES: StatusState[] = ['off', 'waiting'];

export function StatusPanel({ facts, testID = 'status-panel' }: { facts: StatusFacts; testID?: string }) {
  const { animations } = useAppearance();
  const rows = statusRows(facts);
  const wrong = offCount(rows);

  /**
   * One clock for every dot on the panel.
   *
   * Shared rather than per-row, and it also means the dots pulse in step — eight
   * lights blinking out of phase reads as noise, and this panel is supposed to be
   * read at a glance rather than watched.
   */
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!animations) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withTiming(0.25, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [animations, pulse]);

  return (
    <View testID={testID} style={styles.panel}>
      <View style={styles.head} accessible accessibilityRole="header">
        <Text style={styles.title}>STATUS</Text>
        {/*
          The caption is a count of what is wrong, never of what is unknown — a
          number that includes "not asked yet" sends someone hunting a fault that
          may not exist.
        */}
        <Text testID="status-summary" style={[styles.count, wrong > 0 ? styles.countBad : null]}>
          {wrong > 0 ? `${wrong} OFF` : 'ALL PRESENT'}
        </Text>
      </View>

      {rows.map((r) => (
        /**
         * One label per row, assembled, rather than four separate texts.
         *
         * A screen reader walking this panel unaided reads "The desk", "ATTACHED" as
         * two unrelated announcements, and the note as a third — so the one thing the
         * panel is for, pairing a seam with its state, is the thing that does not
         * survive. `accessible` collapses the row into a single stop.
         */
        <View
          key={r.id}
          testID={`status-${r.id}`}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${r.label}: ${r.word}.${r.note ? ` ${r.note}` : ''}`}
          style={styles.row}
        >
          {/* the row speaks for all three, so these are decoration to a reader */}
          <Dot state={r.state} pulse={pulse} live={animations && PULSES.includes(r.state)} />
          <View style={styles.text}>
            <Text style={styles.label}>{r.label}</Text>
            {r.note ? (
              <Text testID={`status-note-${r.id}`} style={styles.note}>
                {r.note}
              </Text>
            ) : null}
          </View>
          <Text testID={`status-word-${r.id}`} style={[styles.word, { color: DOT_COLOR[r.state] }]}>
            {r.word}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The light itself.
 *
 * `opacity` rather than a coloured shadow: `shadowColor` and `shadowRadius` are
 * iOS-only, so a glow expressed that way is invisible on the phone this app is
 * mostly used on, and `elevation` draws a grey shadow and reorders siblings.
 */
function Dot({
  state,
  pulse,
  live,
}: {
  state: StatusState;
  pulse: { value: number };
  live: boolean;
}) {
  const style = useAnimatedStyle(() => ({ opacity: live ? pulse.value : 1 }));
  return (
    <Animated.View
      testID={`status-dot-${state}`}
      style={[styles.dot, { backgroundColor: DOT_COLOR[state] }, style]}
    />
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: COLOR.panel,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    gap: SPACE.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...TYPE.dataLabel, fontSize: 11, letterSpacing: 1.4, color: COLOR.white },
  count: { ...TYPE.dataLabel, fontSize: 10, letterSpacing: 1.2, color: COLOR.dim },
  countBad: { color: COLOR.red },
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: SPACE.md },
  text: { flex: 1 },
  label: { ...TYPE.meta, fontSize: 12, color: COLOR.white },
  note: { ...TYPE.meta, fontSize: 11, color: COLOR.dim, marginTop: 1, lineHeight: 15 },
  word: { ...TYPE.dataLabel, fontSize: 9, letterSpacing: 1, marginLeft: SPACE.md },
});
