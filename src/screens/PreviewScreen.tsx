/**
 * PreviewScreen — TEMPORARY fixture harness.
 *
 * This is not part of the plan. It exists only so the HUD built so far
 * (Panel, Scanline, TransportPill, Reticle, StatusOrb, Meter) can be seen
 * running on a real phone in Expo Go, ahead of the real screen. Task 14 of
 * the plan replaces `App.tsx` with the real `HudScreen`, which renders live
 * reducer state instead of these hardcoded fixtures. Delete this file once
 * `HudScreen` exists.
 */
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLOR, FONT, SCRIM, SPACE, TYPE, glowText } from '../theme/tokens';
import { Panel } from '../components/Panel';
import { Scanline } from '../components/Scanline';
import { TransportPill } from '../components/TransportPill';
import { Reticle } from '../components/Reticle';
import { StatusOrb, statusColor } from '../components/StatusOrb';
import { Meter } from '../components/Meter';
import type { LinkMode, LinkStatus } from '../link/config';

/** cycles every 2500ms so status colour + reticle/orb animation are visible on device */
const STATUS_CYCLE = ['online', 'thinking', 'speaking', 'alert'] as const;

/** cycles every 3000ms so all three transport tints are visible on device */
const TRANSPORT_CYCLE: ReadonlyArray<{ mode: LinkMode; status: LinkStatus }> = [
  { mode: 'lan', status: 'open' },
  { mode: 'cloud', status: 'open' },
  { mode: 'offline', status: 'closed' },
];

const VITALS: ReadonlyArray<{ label: string; value: number }> = [
  { label: 'CPU', value: 34 },
  { label: 'MEM', value: 61 },
  { label: 'DISK', value: 48 },
  { label: 'GPU', value: 12 },
];

export function PreviewScreen() {
  const { height } = useWindowDimensions();
  const [statusIndex, setStatusIndex] = useState(0);
  const [transportIndex, setTransportIndex] = useState(0);

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

  const status = STATUS_CYCLE[statusIndex];
  const transport = TRANSPORT_CYCLE[transportIndex];

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

        <Panel title="vitals" testID="vitals-panel">
          {VITALS.map((v) => (
            <View key={v.label} style={styles.vitalsRow}>
              <View style={styles.vitalsRowHeader}>
                <Text style={styles.vitalsLabel}>{v.label}</Text>
                <Text style={[styles.vitalsValue, glowText(COLOR.cyan, 4)]}>{`${v.value}%`}</Text>
              </View>
              <Meter value={v.value} />
            </View>
          ))}
        </Panel>

        <Panel title="parked ⚠" accent={COLOR.gold}>
          <View style={styles.governanceCard}>
            <Text style={[styles.governanceAction, glowText(COLOR.gold, 6)]}>delete 3 files</Text>
            <Text style={styles.governanceMeta}>{'goal: tidy downloads'}</Text>
            <Text style={styles.governanceMeta}>setup_old.exe, node_v12.msi, tmp.iso</Text>
            <Text style={[styles.governanceRisk, glowText(COLOR.red, 6)]}>RISK HIGH</Text>
            <View style={styles.governanceRow}>
              <Pressable style={[styles.governanceButton, styles.denyButton]}>
                <Text style={[styles.governanceButtonLabel, { color: COLOR.red }]}>DENY</Text>
              </Pressable>
              <Pressable style={[styles.governanceButton, styles.allowButton]}>
                <Text style={[styles.governanceButtonLabel, { color: COLOR.green }]}>ALLOW</Text>
              </Pressable>
            </View>
          </View>
        </Panel>

        <Panel title="trace" accent={COLOR.gold}>
          <Text style={styles.traceLine}>{'▸ tidy downloads'}</Text>
          <Text style={styles.traceLine}>{'> thinking — listing files'}</Text>
          <Text style={styles.traceLine}>{'> plan — 3 stale installers'}</Text>
        </Panel>
      </ScrollView>
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
  vitalsRow: { marginBottom: SPACE.sm },
  vitalsRowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.xs },
  vitalsLabel: { ...TYPE.dataLabel, color: COLOR.dim },
  vitalsValue: { ...TYPE.dataValue, color: COLOR.cyan },
  governanceCard: { paddingBottom: SPACE.sm },
  governanceAction: { ...TYPE.dataValue, fontFamily: FONT.display, color: COLOR.gold, marginBottom: 2 },
  governanceMeta: { ...TYPE.meta, color: COLOR.dim },
  governanceRisk: { ...TYPE.dataLabel, letterSpacing: 1.5, color: COLOR.red, marginTop: SPACE.xs },
  governanceRow: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.sm },
  governanceButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACE.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 2,
  },
  denyButton: { borderColor: COLOR.red },
  allowButton: { borderColor: COLOR.green },
  governanceButtonLabel: { fontFamily: FONT.display, fontSize: 11, letterSpacing: 2 },
  traceLine: { ...TYPE.meta, color: COLOR.dim },
});
