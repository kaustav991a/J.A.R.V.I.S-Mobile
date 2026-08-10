import { StyleSheet, Text, View } from 'react-native';
import { Panel } from './Panel';
import { COLOR, TYPE } from '../theme/tokens';
import type { TraceEntry } from '../state/types';

export function TracePanel({ trace }: { trace: TraceEntry[] }) {
  const goal = trace.length ? trace[trace.length - 1].goal : '';
  return (
    <Panel title="trace" accent={COLOR.gold} testID="trace">
      {trace.length === 0 ? (
        <Text style={styles.dim}>AGENT IDLE</Text>
      ) : (
        <View>
          {goal ? <Text style={styles.goal}>{`▸ ${goal}`}</Text> : null}
          {trace.slice(-8).map((t, i) => (
            <Text key={`${t.at}-${i}`} style={styles.line} numberOfLines={2}>
              {`> ${t.event}${t.detail ? ` — ${t.detail}` : ''}`}
            </Text>
          ))}
        </View>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  goal: { ...TYPE.dataValue, color: COLOR.gold, marginBottom: 4 },
  line: { ...TYPE.meta, color: COLOR.dim },
  dim: { ...TYPE.dataLabel, color: COLOR.dim },
});
