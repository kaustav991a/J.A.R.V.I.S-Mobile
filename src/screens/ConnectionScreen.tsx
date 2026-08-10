import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { Screen } from '../components/ui/Atoms';
import { Button } from '../components/ui/Button';
import { COLOR, SPACE, TYPE, glowText } from '../theme/tokens';
import { useAppearance } from '../theme/appearance';
import { useJarvis } from '../state/JarvisProvider';
import { DEFAULT_ENDPOINTS } from '../link/config';

/** concentric rings around the link glyph — the reactor's quieter cousin */
function LinkRings({ size, color, connected }: { size: number; color: string; connected: boolean }) {
  const c = size / 2;
  return (
    <View style={[styles.rings, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle cx={c} cy={c} r={c * 0.94} stroke={color} strokeWidth={0.75} fill="none" opacity={0.18} />
        <Circle cx={c} cy={c} r={c * 0.76} stroke={color} strokeWidth={1} fill="none" opacity={0.3} />
        <Circle
          cx={c}
          cy={c}
          r={c * 0.58}
          stroke={color}
          strokeWidth={1.5}
          fill="none"
          opacity={connected ? 0.9 : 0.45}
          strokeDasharray={connected ? undefined : '6 10'}
        />
      </Svg>
      <View style={styles.glyph}>
        <Ionicons name={connected ? 'link' : 'link-outline'} size={size * 0.2} color={color} />
      </View>
    </View>
  );
}

export function ConnectionScreen() {
  const { width } = useWindowDimensions();
  const { accent } = useAppearance();
  const { connected, connecting, connect, mode, lastError } = useJarvis();

  const color = connected ? COLOR.green : accent;
  const state = connecting ? 'Connecting…' : connected ? 'Connected' : 'Disconnected';

  return (
    <Screen testID="connection-screen">
      <View style={styles.hero}>
        <LinkRings size={Math.min(width * 0.55, 230)} color={color} connected={connected} />
      </View>

      <View style={styles.headline}>
        <Text testID="connection-state" style={[styles.state, glowText(color, 8)]}>
          {state}
        </Text>
        <Text style={[styles.dot, { color: connected ? COLOR.green : COLOR.red }]}>●</Text>
      </View>

      <Text style={styles.blurb}>
        {connected
          ? `Linked to the Jarvis server over ${mode.toUpperCase()}.`
          : 'Tap connect to establish connection with Jarvis server.'}
      </Text>

      <Button
        testID="connection-connect"
        label={connecting ? 'CONNECTING…' : connected ? 'RECONNECT' : 'CONNECT'}
        onPress={connect}
        disabled={connecting}
        style={styles.button}
      />

      <Text testID="connection-endpoint" style={styles.endpoint}>
        {DEFAULT_ENDPOINTS.deskBase}
      </Text>
      {lastError ? (
        <Text testID="connection-error" style={styles.error}>
          {lastError}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: SPACE.xl, paddingBottom: SPACE.lg },
  rings: { alignItems: 'center', justifyContent: 'center' },
  glyph: { position: 'absolute' },
  headline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm },
  state: { ...TYPE.wordmark, fontSize: 20, letterSpacing: 1, color: COLOR.white },
  dot: { fontSize: 11 },
  blurb: {
    ...TYPE.meta,
    color: COLOR.dim,
    textAlign: 'center',
    marginTop: SPACE.md,
    paddingHorizontal: SPACE.xl,
  },
  button: { marginTop: SPACE.xl },
  endpoint: { ...TYPE.dataLabel, color: COLOR.dim, textAlign: 'center', marginTop: SPACE.lg, opacity: 0.7 },
  error: { ...TYPE.dataLabel, color: COLOR.red, textAlign: 'center', marginTop: SPACE.sm },
});
