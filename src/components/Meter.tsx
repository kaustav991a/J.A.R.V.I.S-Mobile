import { StyleSheet, View } from 'react-native';
import { COLOR, SPACE } from '../theme/tokens';

export type MeterProps = {
  /** 0–100. Out-of-range or non-finite input is clamped into range. */
  value: number;
  color?: string;
  /** number of LED segments in the bargraph */
  segments?: number;
};

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

/**
 * Segmented LED bargraph — the instrument idiom. Not a smooth bar: a row of
 * equal-width segments, lit up to the value threshold, dim past it.
 */
export function Meter({ value, color = COLOR.blue, segments = 12 }: MeterProps) {
  const pct = clamp(value);
  const filledCount = Math.round((pct / 100) * segments);

  return (
    <View style={styles.row} testID="meter">
      {Array.from({ length: segments }, (_, i) => {
        const filled = i < filledCount;
        return (
          <View
            key={i}
            testID={filled ? 'meter-segment-filled' : 'meter-segment-empty'}
            style={[styles.segment, { backgroundColor: filled ? color : COLOR.blueDim }]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 3 },
  segment: { flex: 1, height: 5, borderRadius: 999 },
});
