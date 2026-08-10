import { PropsWithChildren } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { COLOR, FONT, SPACE } from '../theme/tokens';

export type PanelProps = PropsWithChildren<{
  title: string;
  accent?: string;
  testID?: string;
}>;

export function Panel({ title, accent = COLOR.cyan, testID, children }: PanelProps) {
  const Backing = Platform.OS === 'ios' ? BlurView : View;
  const backingProps = Platform.OS === 'ios' ? { intensity: 18, tint: 'dark' as const } : {};

  return (
    <View testID={testID} style={[styles.frame, { borderColor: accent }]}>
      <Backing {...backingProps} style={styles.backing}>
        <View style={styles.header}>
          <Text testID={testID ? `${testID}-title` : undefined} style={[styles.title, { color: accent }]}>
            {title.toUpperCase()}
          </Text>
          <View style={[styles.rule, { backgroundColor: accent }]} />
        </View>
        <View style={styles.body}>{children}</View>
      </Backing>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 2,
    marginBottom: SPACE.md,
    overflow: 'hidden',
  },
  backing: { backgroundColor: COLOR.panel, paddingBottom: SPACE.sm },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.sm, paddingTop: SPACE.sm },
  title: { fontFamily: FONT.display, fontSize: 10, letterSpacing: 2 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, marginLeft: SPACE.sm, opacity: 0.5 },
  body: { paddingHorizontal: SPACE.sm, paddingTop: SPACE.sm },
});
