import { StyleSheet, Text, View } from 'react-native';
import { VitalsPanel } from '../components/VitalsPanel';
import { TracePanel } from '../components/TracePanel';
import { Badge, EmptyState, MonoCard, Screen, SectionLabel } from '../components/ui/Atoms';
import { ScreenTitle } from '../components/ui/ScreenTitle';
import { COLOR, RADIUS, SPACE, TYPE } from '../theme/tokens';
import { useJarvis } from '../state/JarvisProvider';
import { SCRIPTS } from '../data/fixtures';

const OUTCOME: Record<string, { label: string; tint: string }> = {
  success: { label: 'SUCCESS', tint: COLOR.green },
  failed: { label: 'FAILED', tint: COLOR.red },
  never: { label: 'NEVER RUN', tint: COLOR.dim },
};

/**
 * What the machine has actually reported: live vitals, the agent's trace, and
 * the outcome of every script the desk knows about. It reads the same reducer
 * as every other tab — nothing here polls on its own.
 */
export function ReportsScreen() {
  const { hud, connected, connecting, connect } = useJarvis();

  return (
    <Screen testID="reports-screen" refreshing={connecting} onRefresh={connect}>
      <ScreenTitle title="REPORTS" />
      <SectionLabel>System</SectionLabel>
      <VitalsPanel telemetry={hud.telemetry} />

      <SectionLabel>Agent</SectionLabel>
      <TracePanel trace={hud.trace} />

      <SectionLabel>Script outcomes</SectionLabel>
      {SCRIPTS.length === 0 ? (
        <EmptyState
          testID="reports-empty"
          text="Nothing has run yet"
          hint="Outcomes appear here once a script runs."
        />
      ) : (
        <View style={styles.list}>
          {SCRIPTS.map((s) => {
            const outcome = OUTCOME[s.outcome] ?? OUTCOME.never;
            return (
              <View key={s.id} testID={`report-${s.id}`} style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.name}>{s.name}</Text>
                  <Text style={styles.meta}>{`Last run: ${s.lastRun}`}</Text>
                </View>
                <Badge label={outcome.label} tint={outcome.tint} align="start" />
              </View>
            );
          })}
        </View>
      )}

      <SectionLabel>Last message</SectionLabel>
      <MonoCard
        testID="reports-message"
        text={hud.message || (connected ? 'No message from Jarvis yet.' : 'Disconnected — nothing to report.')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: SPACE.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLOR.panel,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
  },
  rowText: { flex: 1, paddingRight: SPACE.md },
  name: { ...TYPE.dataValue, color: COLOR.white },
  meta: { ...TYPE.meta, fontSize: 11, color: COLOR.dim, marginTop: 2 },
});
