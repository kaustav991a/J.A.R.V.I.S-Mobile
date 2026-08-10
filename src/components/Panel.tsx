import { PropsWithChildren } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { COLOR, SPACE, TYPE, glowText } from '../theme/tokens';

export type PanelProps = PropsWithChildren<{
  title: string;
  accent?: string;
  testID?: string;
}>;

/**
 * A bracket-cornered instrument panel — not a closed card. Four L-shaped
 * corner ticks read the frame; the top edge is broken by the title and a
 * hairline rule, e.g. `─ VITALS ────────`.
 */
export function Panel({ title, accent = COLOR.cyan, testID, children }: PanelProps) {
  const Backing = Platform.OS === 'ios' ? BlurView : View;
  const backingProps = Platform.OS === 'ios' ? { intensity: 18, tint: 'dark' as const } : {};

  return (
    <View testID={testID} style={styles.frame}>
      <Backing {...backingProps} style={styles.backing}>
        <View style={styles.topHighlight} />
        <View style={styles.header}>
          <Text
            testID={testID ? `${testID}-title` : undefined}
            style={[styles.title, { color: accent }, glowText(accent, 4)]}
          >
            {title.toUpperCase()}
          </Text>
          <View style={[styles.rule, { backgroundColor: accent }]} />
        </View>
        <View style={styles.body}>{children}</View>
      </Backing>

      <View style={[styles.corner, styles.cornerTL, { borderColor: accent }]} />
      <View style={[styles.corner, styles.cornerTR, { borderColor: accent }]} />
      <View style={[styles.corner, styles.cornerBL, { borderColor: accent }]} />
      <View style={[styles.corner, styles.cornerBR, { borderColor: accent }]} />
    </View>
  );
}

const CORNER = 10;

const styles = StyleSheet.create({
  frame: { position: 'relative', marginBottom: SPACE.md },
  backing: { backgroundColor: COLOR.panel, borderRadius: 2, overflow: 'hidden', paddingBottom: SPACE.sm },
  topHighlight: { height: 1, backgroundColor: COLOR.cyanDim },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.md,
    paddingTop: SPACE.xs,
  },
  title: { ...TYPE.panelTitle },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, marginLeft: SPACE.sm, marginRight: SPACE.xs, opacity: 0.5 },
  body: { paddingHorizontal: SPACE.sm, paddingTop: SPACE.sm },
  corner: { position: 'absolute', width: CORNER, height: CORNER },
  cornerTL: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 },
});
