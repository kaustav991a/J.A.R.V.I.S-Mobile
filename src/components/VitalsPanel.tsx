import { StyleSheet, Text, View } from 'react-native';
import { Panel } from './Panel';
import { Meter } from './Meter';
import { COLOR, SPACE, TYPE, glowText } from '../theme/tokens';
import type { TelemetryData } from '../ws/frames';

const pct = (v: number | null | undefined): string => (typeof v === 'number' ? `${Math.round(v)}%` : '—');

function Vital({ label, value, testID }: { label: string; value: number | null | undefined; testID: string }) {
  const meterValue = typeof value === 'number' ? value : 0;
  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.label}>{label}</Text>
        <Text testID={testID} style={[styles.value, glowText(COLOR.cyan, 4)]}>
          {pct(value)}
        </Text>
      </View>
      <Meter value={meterValue} />
    </View>
  );
}

export function VitalsPanel({ telemetry }: { telemetry: TelemetryData | null }) {
  return (
    <Panel title="vitals" testID="vitals">
      {telemetry === null ? (
        <Text style={styles.waiting}>AWAITING TELEMETRY</Text>
      ) : (
        <View>
          <Vital label="CPU" value={telemetry.cpu} testID="vital-cpu" />
          <Vital label="MEM" value={telemetry.mem} testID="vital-mem" />
          <Vital label="DISK" value={telemetry.disk} testID="vital-disk" />
          <Vital label="GPU" value={telemetry.gpu} testID="vital-gpu" />
        </View>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: SPACE.sm },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.xs },
  label: { ...TYPE.dataLabel, color: COLOR.dim },
  value: { ...TYPE.dataValue, color: COLOR.cyan },
  waiting: { ...TYPE.dataLabel, color: COLOR.dim },
});
