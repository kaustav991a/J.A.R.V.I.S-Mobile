/**
 * PreviewScreen — TEMPORARY fixture harness.
 *
 * This is not part of the plan. It exists only so the HUD can be judged on a
 * real phone in Expo Go, ahead of the real screen. Task 14 of the plan
 * replaces `App.tsx` with the real `HudScreen`, which renders live reducer
 * state instead of these hardcoded fixtures, in this same layout.
 */
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLOR, SCRIM, SPACE, TYPE, glowText } from '../theme/tokens';
import { ArcReactor } from '../components/ArcReactor';
import { StatusStrip } from '../components/StatusStrip';
import { Sheet } from '../components/Sheet';
import { VitalsPanel } from '../components/VitalsPanel';
import { GovernancePanel } from '../components/GovernancePanel';
import { TracePanel } from '../components/TracePanel';
import { CommandBar } from '../components/CommandBar';
import type { LinkMode, LinkStatus } from '../link/config';
import type { TelemetryData } from '../ws/frames';
import type { ParkedAction, TraceEntry } from '../state/types';

/** cycles every 2500ms so status colour + reactor animation are visible on device */
const STATUS_CYCLE = ['online', 'thinking', 'speaking', 'alert'] as const;

/** cycles every 3000ms so all three transport tints are visible on device */
const TRANSPORT_CYCLE: ReadonlyArray<{ mode: LinkMode; status: LinkStatus }> = [
  { mode: 'lan', status: 'open' },
  { mode: 'cloud', status: 'open' },
  { mode: 'offline', status: 'closed' },
];

const ACTIVITY: Record<string, string> = {
  online: 'idle',
  thinking: 'working',
  speaking: 'replying',
  alert: 'approval',
};

const FIXTURE_TELEMETRY: TelemetryData = { cpu: 34, mem: 61, disk: 48, gpu: 12 };

const FIXTURE_TRACE: TraceEntry[] = [
  { goal: 'tidy downloads', event: 'thinking', detail: 'listing files', step: 1, at: 1 },
  { goal: 'tidy downloads', event: 'plan', detail: '3 stale installers', step: 2, at: 2 },
];

const FIXTURE_PARKED: ParkedAction[] = [
  {
    id: 'a1',
    goal: 'tidy downloads',
    action: 'delete 3 files',
    detail: 'setup_old.exe, node_v12.msi, tmp.iso',
    risk: 'high',
    at: 1,
    resolving: false,
  },
];

/** how long the fixture pretends the server takes to confirm a decision */
const DECISION_LATENCY_MS = 900;

export function PreviewScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [statusIndex, setStatusIndex] = useState(0);
  const [transportIndex, setTransportIndex] = useState(0);
  const [parked, setParked] = useState<ParkedAction[]>(FIXTURE_PARKED);
  const pendingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const id = setInterval(() => {
      setStatusIndex((i) => (i + 1) % STATUS_CYCLE.length);
    }, 2500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setTransportIndex((i) => (i + 1) % TRANSPORT_CYCLE.length);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const timers = pendingTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const status = STATUS_CYCLE[statusIndex];
  const transport = TRANSPORT_CYCLE[transportIndex];

  // Fixture-only stand-in for HudScreen's REST call + optimistic dispatch
  // (Task 14): mark the tapped card resolving, then drop it, so ALLOW/DENY
  // look and feel real when this screen is judged on a physical phone.
  const handleDecide = (id: string, _approved: boolean) => {
    setParked((current) => current.map((p) => (p.id === id ? { ...p, resolving: true } : p)));
    pendingTimers.current[id] = setTimeout(() => {
      setParked((current) => current.filter((p) => p.id !== id));
      delete pendingTimers.current[id];
    }, DECISION_LATENCY_MS);
  };

  const reactorSize = Math.min(width * 0.68, 300);
  const sheetHeight = Math.round(height * 0.6);

  return (
    <View style={styles.root}>
      <LinearGradient colors={[...SCRIM]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />

      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.stage, { paddingTop: insets.top + SPACE.md }]}>
          <Text style={styles.brand}>J.A.R.V.I.S</Text>

          <View style={styles.reactorSlot}>
            <ArcReactor size={reactorSize} status={status} />
          </View>

          <Sheet expandedHeight={sheetHeight}>
            <VitalsPanel telemetry={FIXTURE_TELEMETRY} />
            <GovernancePanel parked={parked} onDecide={handleDecide} />
            <TracePanel trace={FIXTURE_TRACE} />
          </Sheet>
        </View>

        <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, SPACE.md) }]}>
          <StatusStrip
            status={status}
            activity={ACTIVITY[status] ?? 'idle'}
            mode={transport.mode}
            linkStatus={transport.status}
          />
          <CommandBar onSubmit={() => {}} onVoice={() => {}} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.bg },
  stage: { flex: 1, paddingHorizontal: SPACE.lg },
  brand: {
    ...TYPE.brand,
    color: COLOR.blue,
    opacity: 0.75,
    textAlign: 'center',
    ...glowText(COLOR.blue, 8),
  },
  reactorSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dock: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.xs },
});
