/**
 * PreviewScreen — TEMPORARY fixture harness.
 *
 * This is not part of the plan. It exists only so the HUD built so far
 * can be seen running on a real phone in Expo Go, ahead of the real screen.
 * Task 14 of the plan replaces `App.tsx` with the real `HudScreen`, which
 * renders live reducer state instead of these hardcoded fixtures. Delete
 * this file once `HudScreen` exists.
 */
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLOR, SCRIM, SPACE, TYPE, glowText } from '../theme/tokens';
import { Scanline } from '../components/Scanline';
import { TransportPill } from '../components/TransportPill';
import { Reticle } from '../components/Reticle';
import { StatusOrb, statusColor } from '../components/StatusOrb';
import { VitalsPanel } from '../components/VitalsPanel';
import { GovernancePanel } from '../components/GovernancePanel';
import { TracePanel } from '../components/TracePanel';
import { CommandBar } from '../components/CommandBar';
import type { LinkMode, LinkStatus } from '../link/config';
import type { TelemetryData } from '../ws/frames';
import type { ParkedAction, TraceEntry } from '../state/types';

/** cycles every 2500ms so status colour + reticle/orb animation are visible on device */
const STATUS_CYCLE = ['online', 'thinking', 'speaking', 'alert'] as const;

/** cycles every 3000ms so all three transport tints are visible on device */
const TRANSPORT_CYCLE: ReadonlyArray<{ mode: LinkMode; status: LinkStatus }> = [
  { mode: 'lan', status: 'open' },
  { mode: 'cloud', status: 'open' },
  { mode: 'offline', status: 'closed' },
];

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
  const { height } = useWindowDimensions();
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

  return (
    <View style={styles.root}>
      <LinearGradient colors={[SCRIM[0], SCRIM[1]]} style={StyleSheet.absoluteFill} />
      <Scanline height={height} />

      <ScrollView contentContainerStyle={styles.scrollBody}>
        <View style={styles.header}>
          <Text style={styles.brand}>{'◦ J.A.R.V.I.S'}</Text>
          <TransportPill mode={transport.mode} status={transport.status} />
        </View>

        <View style={styles.reticleWrap}>
          <Reticle size={200} status={status} />
          <View style={styles.orbWrap}>
            <StatusOrb status={status} />
          </View>
        </View>

        <Text style={[styles.statusLabel, { color: statusColor(status) }, glowText(statusColor(status), 6)]}>
          {status.toUpperCase()}
        </Text>

        <Text style={styles.message}>Systems nominal, sir.</Text>

        <VitalsPanel telemetry={FIXTURE_TELEMETRY} />
        <GovernancePanel parked={parked} onDecide={handleDecide} />
        <TracePanel trace={FIXTURE_TRACE} />
      </ScrollView>

      <CommandBar onSubmit={() => {}} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.bg },
  scrollBody: { paddingHorizontal: SPACE.md, paddingTop: SPACE.xl + SPACE.lg, paddingBottom: SPACE.xl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.md,
  },
  brand: { ...TYPE.brand, color: COLOR.cyan, ...glowText(COLOR.cyan, 8) },
  reticleWrap: { alignItems: 'center', justifyContent: 'center', height: 220, marginBottom: SPACE.sm },
  orbWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  statusLabel: { ...TYPE.statusLabel, textAlign: 'center', marginBottom: SPACE.md },
  message: {
    ...TYPE.meta,
    color: COLOR.cyan,
    textAlign: 'center',
    marginBottom: SPACE.md,
  },
});
