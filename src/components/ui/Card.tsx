import { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLOR, SPACE, TYPE } from '../../theme/tokens';
import { useAppearance } from '../../theme/appearance';

export function Card({ children, testID }: PropsWithChildren<{ testID?: string }>) {
  return (
    <View testID={testID} style={styles.card}>
      {children}
    </View>
  );
}

export type InfoRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** right-hand readout — text, or anything you want to render there */
  value?: ReactNode;
  /** tints the value, e.g. red for a dead link */
  valueColor?: string;
  /** a trailing status dot, matching the reference screens */
  dotColor?: string;
  /** rows draw their own top divider except the first */
  first?: boolean;
  testID?: string;
};

export function InfoRow({ icon, label, value, valueColor, dotColor, first = false, testID }: InfoRowProps) {
  const { accent } = useAppearance();
  return (
    <View style={[styles.row, !first && styles.divided]} testID={testID}>
      <Ionicons name={icon} size={16} color={accent} style={styles.rowIcon} />
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        {typeof value === 'string' ? (
          <Text testID={testID ? `${testID}-value` : undefined} style={[styles.rowValue, valueColor ? { color: valueColor } : null]}>
            {value}
          </Text>
        ) : (
          value
        )}
        {dotColor ? <Text style={[styles.dot, { color: dotColor }]}>●</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLOR.panel,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    paddingHorizontal: SPACE.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACE.md + 2 },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLOR.line },
  rowIcon: { marginRight: SPACE.md },
  rowLabel: { ...TYPE.dataValue, color: COLOR.white, flex: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  rowValue: { ...TYPE.dataValue, color: COLOR.dim },
  dot: { fontSize: 9 },
});
