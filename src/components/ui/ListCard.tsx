import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLOR, RADIUS, SPACE, TYPE } from '../../theme/tokens';
import { useAppearance } from '../../theme/appearance';
import { haptic } from '../../lib/haptics';
import { Touchable } from './Touchable';

export type ListCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  /** rendered at the right edge — a run button, a chevron, a badge */
  trailing?: ReactNode;
  /** a state dot at the right edge, e.g. last run outcome */
  statusTint?: string;
  /** hue for the icon tile; defaults to the app accent */
  tint?: string;
  testID?: string;
};

/** The tappable row used by Scripts and anything else that lists records. */
export function ListCard({ icon, title, subtitle, onPress, trailing, statusTint, tint, testID }: ListCardProps) {
  const { accent } = useAppearance();
  const hue = tint ?? accent;

  return (
    <Touchable testID={testID} accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={styles.card}>
      <View style={[styles.tile, { backgroundColor: `${hue}1f`, borderColor: `${hue}40` }]}>
        <Ionicons name={icon} size={20} color={hue} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {statusTint ? <View style={[styles.statusDot, { backgroundColor: statusTint }]} /> : null}
      {trailing}
    </Touchable>
  );
}

/** The circular play affordance on a script row. */
export function RunButton({ onPress, testID }: { onPress?: () => void; testID?: string }) {
  const { accent } = useAppearance();
  return (
    <Touchable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Run"
      onPress={
        onPress
          ? () => {
              haptic.tap();
              onPress();
            }
          : undefined
      }
      hitSlop={10}
      sink={0.08}
      style={[styles.run, { backgroundColor: accent }]}
    >
      <Ionicons name="play" size={16} color={COLOR.bg} />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    backgroundColor: COLOR.panel,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    padding: SPACE.md,
    marginBottom: SPACE.md,
    minHeight: 64,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: SPACE.md },
  title: { ...TYPE.dataValue, fontSize: 14, color: COLOR.white, marginBottom: 2 },
  subtitle: { ...TYPE.dataLabel, color: COLOR.dim },
  run: { width: 36, height: 36, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
});
