import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, SectionLabel } from '../components/ui/Atoms';
import { ScreenTitle } from '../components/ui/ScreenTitle';
import { COLOR, RADIUS, SPACE, TYPE } from '../theme/tokens';
import { LIVE, PENDING } from '../lib/capabilities';
import type { Capability } from '../lib/capabilities';

/**
 * What he can do, browsable rather than asked for.
 *
 * The chat answers the same question — "what can you do" is intercepted in
 * `JarvisProvider` and answered from `lib/capabilities.ts` without a round trip —
 * but asking only works if you already suspect there is an answer. This is the
 * version you find.
 *
 * **One list, two surfaces.** Both read `LIVE` and `PENDING`, so the screen and the
 * spoken answer cannot disagree; a second hand-written list here would be a lie in
 * his voice the first time a feature landed.
 *
 * The "not yet" half is on the screen for the same reason it is in the answer: a
 * feature nobody built is otherwise hunted for and then reported as broken. It is
 * also the shortest honest test list — `TESTING.md` §8 is the long one.
 */
export function CapabilitiesScreen() {
  return (
    <Screen testID="capabilities-screen">
      <ScreenTitle
        title="CAPABILITIES"
        caption={`${LIVE.length} now, ${PENDING.length} not yet`}
        back
      />

      <SectionLabel>What he does</SectionLabel>
      <View style={styles.list}>
        {LIVE.map((c) => (
          <Row key={c.id} capability={c} />
        ))}
      </View>

      <SectionLabel>Not yet</SectionLabel>
      <View style={styles.list}>
        {PENDING.map((c) => (
          <Row key={c.id} capability={c} pending />
        ))}
      </View>

      <Text style={styles.foot}>
        This list is held on the device, so it is the same whether or not anything is
        connected.
      </Text>
    </Screen>
  );
}

function Row({ capability, pending = false }: { capability: Capability; pending?: boolean }) {
  return (
    <View
      testID={`capability-${capability.id}`}
      accessible
      accessibilityRole="text"
      // one stop per capability: the glyph carries live-or-not visually, and a
      // reader needs that stated rather than inferred from an icon name
      accessibilityLabel={`${capability.label}. ${pending ? 'Not yet. ' : ''}${capability.line}`}
      style={styles.row}
    >
      {/*
        A filled dot for what works and a hollow one for what does not, rather than
        two colours alone: a red/green pair is the one distinction a colour-blind
        reader cannot make, and this screen's whole job is telling two states apart.
      */}
      <Ionicons
        name={pending ? 'ellipse-outline' : 'ellipse'}
        size={9}
        color={pending ? COLOR.dim : COLOR.blue}
        style={styles.dot}
      />
      <View style={styles.text}>
        <Text style={styles.label}>{capability.label.toUpperCase()}</Text>
        <Text style={styles.line}>{capability.line}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: SPACE.sm },
  row: {
    flexDirection: 'row',
    backgroundColor: COLOR.panel,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
  },
  dot: { marginRight: SPACE.md, marginTop: 5 },
  text: { flex: 1 },
  label: { ...TYPE.dataLabel, fontSize: 10, letterSpacing: 1.2, color: COLOR.white },
  line: { ...TYPE.meta, fontSize: 12, color: COLOR.dim, marginTop: 3, lineHeight: 17 },
  foot: { ...TYPE.meta, fontSize: 11, color: COLOR.dim, marginTop: SPACE.lg, lineHeight: 16 },
});
