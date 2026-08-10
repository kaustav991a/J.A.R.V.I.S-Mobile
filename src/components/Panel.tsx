import { PropsWithChildren } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { COLOR, SPACE, TYPE } from '../theme/tokens';

export type PanelProps = PropsWithChildren<{
  title: string;
  accent?: string;
  testID?: string;
}>;

/**
 * A quiet glass card. The bracket-cornered instrument frame the desk HUD uses
 * was dropped here: on a phone it reads as clutter, and the sheet already
 * frames its contents. One rounded fill, one hairline, one letterspaced title.
 */
export function Panel({ title, accent = COLOR.blue, testID, children }: PanelProps) {
  const Backing = Platform.OS === 'ios' ? BlurView : View;
  const backingProps = Platform.OS === 'ios' ? { intensity: 14, tint: 'dark' as const } : {};

  return (
    <View testID={testID} style={styles.frame}>
      <Backing {...backingProps} style={styles.backing}>
        <Text testID={testID ? `${testID}-title` : undefined} style={[styles.title, { color: accent }]}>
          {title.toUpperCase()}
        </Text>
        <View style={styles.body}>{children}</View>
      </Backing>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { marginBottom: SPACE.md },
  backing: {
    backgroundColor: COLOR.panel,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    overflow: 'hidden',
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.md,
    paddingBottom: SPACE.md,
  },
  title: { ...TYPE.panelTitle, opacity: 0.85 },
  body: { paddingTop: SPACE.md },
});
