import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Panel } from './Panel';
import { COLOR, SPACE, TYPE, glowText } from '../theme/tokens';
import type { ParkedAction } from '../state/types';

export type GovernancePanelProps = {
  parked: ParkedAction[];
  onDecide: (id: string, approved: boolean) => void;
  disabled?: boolean;
};

export function GovernancePanel({ parked, onDecide, disabled = false }: GovernancePanelProps) {
  if (parked.length === 0) return null;

  return (
    <Panel title="parked ⚠" accent={COLOR.gold} testID="governance">
      {parked.map((p) => {
        const locked = disabled || p.resolving;
        return (
          <View key={p.id} testID={`parked-${p.id}`} style={styles.card}>
            <Text style={[styles.action, glowText(COLOR.gold, 6)]}>{p.action}</Text>
            {p.goal ? <Text style={styles.meta}>{`goal: ${p.goal}`}</Text> : null}
            {p.detail ? (
              <Text style={styles.meta} numberOfLines={3}>
                {p.detail}
              </Text>
            ) : null}
            {p.risk ? <Text style={styles.risk}>{`RISK ${p.risk.toUpperCase()}`}</Text> : null}
            <View style={styles.row}>
              <Pressable
                testID={`deny-${p.id}`}
                disabled={locked}
                onPress={() => onDecide(p.id, false)}
                style={[styles.btn, { borderColor: COLOR.red }, locked && styles.locked]}
              >
                <Text style={[styles.btnText, { color: COLOR.red }, glowText(COLOR.red, 4)]}>DENY</Text>
              </Pressable>
              <Pressable
                testID={`allow-${p.id}`}
                disabled={locked}
                onPress={() => onDecide(p.id, true)}
                style={[styles.btn, { borderColor: COLOR.green }, locked && styles.locked]}
              >
                <Text style={[styles.btnText, { color: COLOR.green }, glowText(COLOR.green, 4)]}>ALLOW</Text>
              </Pressable>
            </View>
            {p.resolving ? <Text style={styles.sending}>SENDING…</Text> : null}
          </View>
        );
      })}
    </Panel>
  );
}

const styles = StyleSheet.create({
  card: { paddingBottom: SPACE.sm },
  action: { ...TYPE.dataValue, color: COLOR.gold, marginBottom: 2 },
  meta: { ...TYPE.meta, color: COLOR.dim },
  risk: { ...TYPE.dataLabel, color: COLOR.red, letterSpacing: 1.5, marginTop: SPACE.xs },
  row: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.sm },
  btn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACE.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 2,
  },
  locked: { opacity: 0.35 },
  btnText: { ...TYPE.panelTitle },
  sending: { ...TYPE.dataLabel, color: COLOR.dim, marginTop: SPACE.xs },
});
