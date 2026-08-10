import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLOR, SPACE, TYPE } from '../../theme/tokens';
import { useAppearance } from '../../theme/appearance';

export type SettingsRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  /** replaces the chevron — a switch, an external-link glyph, nothing */
  trailing?: ReactNode;
  /** last row in a group draws no bottom divider */
  last?: boolean;
  testID?: string;
};

export function SettingsRow({ icon, title, subtitle, onPress, trailing, last = false, testID }: SettingsRowProps) {
  const { accent } = useAppearance();

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, !last && styles.divided, pressed && onPress ? styles.pressed : null]}
    >
      <Ionicons name={icon} size={20} color={accent} style={styles.icon} />
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {trailing ?? <Ionicons name="chevron-forward" size={16} color={COLOR.dim} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACE.md + 2, paddingHorizontal: SPACE.lg },
  divided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLOR.line },
  pressed: { opacity: 0.7 },
  icon: { marginRight: SPACE.md },
  text: { flex: 1 },
  title: { ...TYPE.dataValue, fontSize: 14, color: COLOR.white },
  subtitle: { ...TYPE.dataLabel, color: COLOR.dim, marginTop: 2 },
});
