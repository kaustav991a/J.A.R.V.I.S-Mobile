import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLOR, SCRIM, SPACE, TYPE } from '../../theme/tokens';

/** The canvas every screen sits on: one edge-to-edge navy gradient. */
export function Screen({ children, scroll = true, testID }: PropsWithChildren<{ scroll?: boolean; testID?: string }>) {
  return (
    <View style={styles.screen} testID={testID}>
      <LinearGradient colors={[...SCRIM]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={styles.body}>{children}</View>
      )}
    </View>
  );
}

/** Uppercase group heading, e.g. THEME / ACCENT COLOR / ACTIONS. */
export function SectionLabel({ children }: PropsWithChildren) {
  return <Text style={styles.section}>{String(children).toUpperCase()}</Text>;
}

export function Badge({ label, tint = COLOR.green, testID }: { label: string; tint?: string; testID?: string }) {
  return (
    <View testID={testID} style={[styles.badge, { borderColor: tint }]}>
      <Text style={[styles.badgeText, { color: tint }]}>{label}</Text>
    </View>
  );
}

/** The terminal-style output card used for command results. */
export function MonoCard({ text, testID }: { text: string; testID?: string }) {
  return (
    <View style={styles.mono}>
      <Text testID={testID} style={styles.monoText}>
        {text}
      </Text>
    </View>
  );
}

/** Centred empty state — one line, no illustration. */
export function EmptyState({ text, testID }: { text: string; testID?: string }) {
  return (
    <Text testID={testID} style={styles.empty}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.bg },
  body: { flex: 1, paddingHorizontal: SPACE.lg },
  scrollBody: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.md, paddingBottom: SPACE.xl * 2 },
  section: { ...TYPE.dataLabel, color: COLOR.dim, letterSpacing: 1.5, marginBottom: SPACE.sm, marginTop: SPACE.lg },
  badge: {
    alignSelf: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACE.md,
    paddingVertical: 3,
  },
  badgeText: { ...TYPE.dataLabel, fontSize: 11 },
  mono: {
    backgroundColor: 'rgba(4,14,32,0.9)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    padding: SPACE.lg,
  },
  monoText: { ...TYPE.meta, fontSize: 12, lineHeight: 19, color: COLOR.green },
  empty: { ...TYPE.dataLabel, color: COLOR.dim, textAlign: 'center', marginTop: SPACE.xl },
});
