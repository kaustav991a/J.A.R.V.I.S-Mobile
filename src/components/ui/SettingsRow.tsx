import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLOR, RADIUS, SPACE, TYPE } from '../../theme/tokens';
import { useAppearance } from '../../theme/appearance';
import { Touchable } from './Touchable';

export type SettingsRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  /** replaces the chevron — a switch, an external-link glyph, nothing */
  trailing?: ReactNode;
  /** last row in a group draws no bottom divider */
  last?: boolean;
  /** marks a row whose screen does not exist yet, instead of a dead tap */
  soon?: boolean;
  testID?: string;
};

export function SettingsRow({
  icon,
  title,
  subtitle,
  onPress,
  trailing,
  last = false,
  soon = false,
  testID,
}: SettingsRowProps) {
  const { accent } = useAppearance();
  const inert = !onPress;

  const right =
    trailing ??
    (soon ? (
      <View style={styles.soon}>
        <Text style={styles.soonText}>SOON</Text>
      </View>
    ) : (
      <Ionicons name="chevron-forward" size={16} color={COLOR.dim} />
    ));

  return (
    <Touchable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: inert }}
      onPress={onPress}
      // an inert row still renders, but it neither lights up nor pretends
      disabled={inert}
      sink={0}
      style={[styles.row, !last && styles.divided]}
    >
      <Ionicons name={icon} size={20} color={soon ? COLOR.dim : accent} style={styles.icon} />
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACE.md + 2,
    paddingHorizontal: SPACE.lg,
    minHeight: 56,
  },
  divided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLOR.line },
  soon: {
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 2,
  },
  soonText: { ...TYPE.dataLabel, fontSize: 9, color: COLOR.dim },
  icon: { marginRight: SPACE.md },
  text: { flex: 1 },
  title: { ...TYPE.dataValue, fontSize: 14, color: COLOR.white },
  subtitle: { ...TYPE.dataLabel, color: COLOR.dim, marginTop: 2 },
});
