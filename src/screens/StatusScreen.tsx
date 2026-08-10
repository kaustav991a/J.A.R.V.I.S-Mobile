import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArcReactor } from '../components/ArcReactor';
import { VitalsPanel } from '../components/VitalsPanel';
import { TracePanel } from '../components/TracePanel';
import { GovernancePanel } from '../components/GovernancePanel';
import { Screen } from '../components/ui/Atoms';
import { Card, InfoRow } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { COLOR, SPACE, TYPE } from '../theme/tokens';
import { useJarvis } from '../state/JarvisProvider';
import type { StatusStackParams } from '../navigation/types';

const MODE_LABEL = { lan: 'LAN', cloud: 'CLOUD', offline: 'DARK' } as const;

export function StatusScreen() {
  const { width } = useWindowDimensions();
  const nav = useNavigation<NativeStackNavigationProp<StatusStackParams>>();
  const { hud, mode, connected, connecting, connect, decide } = useJarvis();

  const reactorSize = Math.min(width * 0.6, 260);
  const activity = hud.parked.length > 0 ? 'approval' : hud.status === 'boot' ? 'idle' : hud.status;

  return (
    <Screen testID="status-screen">
      <View style={styles.hero}>
        <ArcReactor size={reactorSize} status={hud.status} sublabel={activity} />
      </View>

      <Card testID="status-card">
        <InfoRow
          first
          icon="wifi-outline"
          label="Connection"
          testID="row-connection"
          value={connecting ? 'Connecting' : connected ? 'Connected' : 'Disconnected'}
          valueColor={connected ? COLOR.green : COLOR.dim}
          dotColor={connected ? COLOR.green : COLOR.red}
        />
        <InfoRow icon="pulse-outline" label="Mode" testID="row-mode" value={MODE_LABEL[mode]} />
        <InfoRow
          icon="document-text-outline"
          label="Parked actions"
          testID="row-parked"
          value={hud.parked.length ? String(hud.parked.length) : 'None'}
          valueColor={hud.parked.length ? COLOR.gold : undefined}
        />
      </Card>

      <Button
        testID="status-connect"
        label={connected ? 'RECONNECT' : connecting ? 'CONNECTING…' : 'CONNECT'}
        onPress={connected ? () => nav.navigate('Connection') : connect}
        disabled={connecting}
        style={styles.connect}
      />

      {hud.message ? (
        <Text testID="status-message" style={styles.message}>
          {hud.message}
        </Text>
      ) : null}

      {hud.parked.length > 0 ? <GovernancePanel parked={hud.parked} onDecide={decide} /> : null}
      <VitalsPanel telemetry={hud.telemetry} />
      <TracePanel trace={hud.trace} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: SPACE.lg },
  connect: { marginTop: SPACE.lg },
  message: {
    ...TYPE.meta,
    color: COLOR.dim,
    textAlign: 'center',
    marginTop: SPACE.md,
    marginBottom: SPACE.sm,
  },
});
