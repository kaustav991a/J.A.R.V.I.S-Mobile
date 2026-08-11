import { ActivityIndicator, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { COLOR, RADIUS, SPACE, TYPE, glowBox } from '../../theme/tokens';
import { useAppearance } from '../../theme/appearance';
import { haptic } from '../../lib/haptics';
import { Touchable } from './Touchable';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  /** filled accent (primary) or outlined (ghost) */
  variant?: 'primary' | 'ghost';
  /** override the accent, e.g. red for a destructive action */
  tint?: string;
  /** swaps the label for a spinner and blocks the press */
  busy?: boolean;
  style?: ViewStyle;
  testID?: string;
};

export function Button({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  tint,
  busy = false,
  style,
  testID,
}: ButtonProps) {
  const { accent, glow } = useAppearance();
  const color = tint ?? accent;
  const primary = variant === 'primary';
  const inert = disabled || busy;

  return (
    <Touchable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inert, busy }}
      onPress={
        onPress
          ? () => {
              haptic.tap();
              onPress();
            }
          : undefined
      }
      disabled={inert}
      style={[
        styles.base,
        primary
          ? [{ backgroundColor: color }, glowBox(color, glow * 14)]
          : { borderWidth: StyleSheet.hairlineWidth, borderColor: color },
        style,
      ]}
    >
      <View style={styles.inner}>
        {busy ? <ActivityIndicator size="small" color={primary ? COLOR.bg : color} /> : null}
        <Text style={[styles.label, { color: primary ? COLOR.bg : color }]}>{label}</Text>
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 50,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.lg,
  },
  inner: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  label: { ...TYPE.dataLabel, fontSize: 13, letterSpacing: 1.5, fontWeight: '600' },
});
