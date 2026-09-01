import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLOR, RADIUS, SPACE, TYPE } from '../theme/tokens';
import { readyCount, watching } from '../lib/watching';
import type { WatchFacts } from '../lib/watching';

/**
 * What he is watching, and what he is still short of.
 *
 * **Why this is on Home at all.** Anticipation says nothing most days by design, and
 * nothing whatsoever for its first four days by necessity — the place signal needs
 * that many days of sightings before "usually" means anything. Without somewhere to
 * read that, a working feature and a broken one look identical. This project has paid
 * for that confusion more than any other: the briefing was read as broken for four
 * days while it was correctly silent, and an evening went to proving it.
 *
 * So: the same rule as the status panel, pointed at a feature rather than at a seam.
 * Every state names itself, in words, with a figure where a figure exists.
 *
 * It never says when he will next speak. That depends on the day being unusual, which
 * is not knowable in advance, and a promise this panel cannot keep would be worse than
 * no panel.
 */
/**
 * The panel gains one control, and only while the budget is spent.
 *
 * One remark a day makes anticipation the hardest thing here to watch: a wrong
 * remark, or an early one, costs a day before the next can be seen — which is why
 * `anticipate-v1` sat unexercised while its triggers were fine. Clearing the marker
 * lets the next remark be induced instead of waited for.
 *
 * Hidden when nothing has been said today, because a control that would do nothing
 * teaches that the rest of the panel is decoration.
 */
export function WatchingPanel({
  facts,
  onClearToday,
  testID = 'watching-panel',
}: {
  facts: WatchFacts;
  onClearToday?: () => void;
  testID?: string;
}) {
  const rows = watching(facts);
  const ready = readyCount(rows);

  return (
    <View testID={testID} style={styles.panel}>
      <View style={styles.head} accessible accessibilityRole="header">
        <Text style={styles.title}>WATCHING</Text>
        <Text testID="watching-summary" style={styles.count}>
          {`${ready} OF ${rows.length} READY`}
        </Text>
        {facts.spokenToday && onClearToday ? (
          <Pressable
            testID="watching-clear"
            accessibilityRole="button"
            accessibilityLabel="Clear today's remark, so the next one can be seen now"
            hitSlop={8}
            onPress={onClearToday}
            style={({ pressed }) => (pressed ? styles.pressed : undefined)}
          >
            <Text style={styles.clear}>CLEAR</Text>
          </Pressable>
        ) : null}
      </View>

      {rows.map((r) => (
        <View
          key={r.id}
          testID={`watching-${r.id}`}
          accessible
          accessibilityRole="text"
          // one stop per row, the seam beside its state — a reader given three
          // separate announcements loses the pairing the panel exists for
          accessibilityLabel={`${r.label}: ${r.word}.${r.note ? ` ${r.note}` : ''}`}
          style={styles.row}
        >
          <Ionicons
            name={r.ready ? 'ellipse' : 'ellipse-outline'}
            size={9}
            color={r.ready ? COLOR.green : COLOR.dim}
            style={styles.dot}
          />
          <View style={styles.text}>
            <Text style={styles.label}>{r.label}</Text>
            {r.note ? <Text style={styles.note}>{r.note}</Text> : null}
          </View>
          <Text
            testID={`watching-word-${r.id}`}
            style={[styles.word, r.ready ? styles.wordReady : null]}
          >
            {r.word.toUpperCase()}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  clear: { ...TYPE.dataLabel, fontSize: 10, letterSpacing: 1.5, color: COLOR.dim, marginLeft: SPACE.sm },
  pressed: { opacity: 0.55 },
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
  // top-aligned, not centred: a two-line note would otherwise push the dot and the
  // word to the middle of the block, away from the label they belong to
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  // a filled dot for a signal that can speak, hollow for one still learning: the
  // same language as the Capabilities screen, and readable without colour
  dot: { marginRight: SPACE.md, marginTop: 2 },
  text: { flex: 1 },
  label: { ...TYPE.meta, fontSize: 12, color: COLOR.white },
  note: { ...TYPE.meta, fontSize: 11, color: COLOR.dim, marginTop: 1, lineHeight: 15 },
  word: { ...TYPE.dataLabel, fontSize: 9, letterSpacing: 1, marginLeft: SPACE.md, marginTop: 2, color: COLOR.dim },
  wordReady: { color: COLOR.green },
});
