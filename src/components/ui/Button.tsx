import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { COLOR, SPACE, TYPE, glowBox } from '../../theme/tokens';
import { useAppearance } from '../../theme/appearance';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  /** filled accent (primary) or outlined (ghost) */
  variant?: 'primary' | 'ghost';
  /** override the accent, e.g. red for a destructive action */
  tint?: string;
  style?: ViewStyle;
  testID?: string;
};

export function Button({ label, onPress, disabled = false, variant = 'primary', tint, style, testID }: ButtonProps) {
  const { accent, glow } = useAppearance();
  const color = tint ?? accent;
  const primary = variant === 'primary';

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        primary
          ? [{ backgroundColor: color }, glowBox(color, glow * 14)]
          : { borderWidth: StyleSheet.hairlineWidth, borderColor: color },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.label, { color: primary ? COLOR.bg : color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.lg,
  },
  label: { ...TYPE.dataLabel, fontSize: 13, letterSpacing: 1.5, fontWeight: '600' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
});
