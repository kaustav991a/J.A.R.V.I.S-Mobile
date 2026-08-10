import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLOR, SPACE, TYPE } from '../../theme/tokens';
import { useAppearance } from '../../theme/appearance';

export type ListCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  /** rendered at the right edge — a run button, a chevron, a badge */
  trailing?: ReactNode;
  testID?: string;
};

/** The tappable row used by Scripts and anything else that lists records. */
export function ListCard({ icon, title, subtitle, onPress, trailing, testID }: ListCardProps) {
  const { accent } = useAppearance();

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.tile, { backgroundColor: COLOR.blueDim }]}>
        <Ionicons name={icon} size={20} color={accent} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </Pressable>
  );
}

/** The circular play affordance on a script row. */
export function RunButton({ onPress, testID }: { onPress?: () => void; testID?: string }) {
  const { accent } = useAppearance();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Run"
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.run, { backgroundColor: accent }, pressed && styles.pressed]}
    >
      <Ionicons name="play" size={16} color={COLOR.bg} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    backgroundColor: COLOR.panel,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    padding: SPACE.md,
    marginBottom: SPACE.md,
  },
  pressed: { opacity: 0.75 },
  tile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  title: { ...TYPE.dataValue, fontSize: 14, color: COLOR.white, marginBottom: 2 },
  subtitle: { ...TYPE.dataLabel, color: COLOR.dim },
  run: { width: 34, height: 34, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
