import { StyleSheet, Text, View } from 'react-native';
import { COLOR, SPACE, TYPE, glowText } from '../theme/tokens';
import { statusColor } from '../theme/status';
import { TransportPill } from './TransportPill';
import type { LinkMode, LinkStatus } from '../link/config';

export type StatusStripProps = {
  status: string;
  /** what the agent is doing right now, e.g. IDLE / WORKING */
  activity: string;
  mode: LinkMode;
  linkStatus: LinkStatus;
};

/**
 * The one-line readout that sits between the reactor and the command bar:
 * state on the left, activity in the middle, transport on the right.
 */
export function StatusStrip({ status, activity, mode, linkStatus }: StatusStripProps) {
  const color = statusColor(status);

  return (
    <View style={styles.strip} testID="status-strip">
      <View style={styles.slot}>
        <Text testID="status-strip-status" style={[styles.label, { color }, glowText(color, 6)]}>
          {status.toUpperCase()}
        </Text>
        <Text style={[styles.dot, { color }]}>●</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.slot}>
        <Text testID="status-strip-activity" style={styles.label}>
          {activity.toUpperCase()}
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.slot}>
        <TransportPill mode={mode} status={linkStatus} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.sm,
  },
  slot: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flex: 1, justifyContent: 'center' },
  divider: { width: StyleSheet.hairlineWidth, height: 14, backgroundColor: COLOR.line },
  label: { ...TYPE.strip, color: COLOR.dim },
  dot: { fontSize: 8, lineHeight: 12 },
});
