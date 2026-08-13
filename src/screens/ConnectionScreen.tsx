import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { Badge, Screen } from '../components/ui/Atoms';
import { ScreenTitle } from '../components/ui/ScreenTitle';
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

/** one labelled field — the three here differ only in what they hold */
function Field({
  label,
  hint,
  value,
  onChange,
  testID,
  secret = false,
  onSubmit,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
  testID: string;
  secret?: boolean;
  /** the keyboard's own return key saves, so the button need not be reachable */
  onSubmit?: () => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        placeholder={hint}
        placeholderTextColor={COLOR.dim}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={secret}
        /**
         * Submitting from the keyboard is not a convenience here, it is the only
         * reliable route. Android is in `resize` mode and `KeyboardAvoidingView`
         * does nothing without a `behavior`, so with the keyboard up the Save
         * button sits below the fold — and the field being typed into is the last
         * thing on the screen. Return key saves; the keyboard closes with it.
         */
        returnKeyType={onSubmit ? 'done' : 'default'}
        onSubmitEditing={onSubmit}
        style={styles.input}
      />
    </View>
  );
}

export function ConnectionScreen() {
  const { width } = useWindowDimensions();
  const { accent } = useAppearance();
  const { hud, connected, connecting, connect, disconnect, mode, lastError, simulated, pairing, pair } = useJarvis();

  /** the desk reached through the gateway — a cloud link with PC control */
  const fullPower = connected && hud.deskLinked === true;

  const [desk, setDesk] = useState(pairing.deskBase);
  const [cloud, setCloud] = useState(pairing.cloudBase ?? '');
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const color = connected ? COLOR.green : accent;
  const state = connecting ? 'Connecting…' : connected ? 'Connected' : 'Disconnected';

  /**
   * Something typed below differs from what is stored.
   *
   * The button at the top re-dials with the SAVED settings — it does not read
   * these fields. Left live while an edit is pending it answers a tap by
   * reconnecting to the old address, with no error and nothing to read, so the
   * fix looks like it was applied and ignored. It is disabled until the edit is
   * saved or reverted. An empty token box is not an edit: blank means "keep the
   * one you have".
   */
  const dirty =
    desk.trim() !== pairing.deskBase ||
    cloud.trim() !== (pairing.cloudBase ?? '') ||
    token.trim() !== '';

  /**
   * Save, then re-dial.
   *
   * The token is write-only here: `pairing` reports whether one is held, never
   * its value, so an empty box means "leave it alone" rather than "clear it" —
   * otherwise every save from this screen would silently unpair the phone.
   */
  const save = async () => {
    setSaving(true);
    setNote(null);
    const ok = await pair({
      base: desk.trim() || null,
      cloud: cloud.trim() || null,
      ...(token.trim() ? { token: token.trim() } : {}),
    });
    setSaving(false);
    if (!ok) {
      setNote('That address is not usable — check the host and port.');
      return;
    }
    setToken('');
    setNote('Saved. Re-dialling…');
    connect();
  };

  return (
    <Screen testID="connection-screen" liftOnKeyboard>
      <ScreenTitle title="CONNECTION" />
      <View style={styles.hero}>
        <LinkRings size={Math.min(width * 0.55, 230)} color={color} connected={connected} />
      </View>

      <View style={styles.headline}>
        <Text testID="connection-state" style={[styles.state, glowText(color, 8)]}>
          {state}
        </Text>
        <Text style={[styles.dot, { color: connected ? COLOR.green : COLOR.red }]}>●</Text>
      </View>

      {/* a simulated link that looks real is the one thing this screen must
          never do — it is the screen people come to when something is wrong */}
      {simulated ? <Badge testID="connection-simulated" label="SIMULATED" tint={COLOR.gold} /> : null}

      <Text style={styles.blurb}>
        {simulated
          ? 'Demo data is on, so this link is a stand-in. Turn it off in the Home menu to reach a real desk.'
          : connected
            ? fullPower
              ? 'Full power — the desk is attached to the gateway, so PC control is live.'
              : mode === 'cloud'
                ? 'Cloud brain only. The desk is off, so PC control is unavailable.'
                : `Linked to the desk over ${mode.toUpperCase()}.`
            : connecting
              ? 'Probing the local network, then the cloud gateway.'
              : 'Connect to reach the desk. The phone and the desk must be on the same network.'}
      </Text>

      <Button
        testID="connection-connect"
        label={connecting ? 'CONNECTING' : connected ? 'RECONNECT' : 'CONNECT'}
        onPress={connect}
        busy={connecting}
        disabled={dirty}
        style={styles.button}
      />
      {dirty ? (
        <Text testID="connection-dirty" style={styles.note}>
          Unsaved changes below. SAVE &amp; RECONNECT applies them.
        </Text>
      ) : null}

      {/* Offered only when there is something to switch off. Nothing automatic
          brings the link back afterwards — not a foreground, not a network
          change — so the state the user chose is the state they keep. */}
      {connected || connecting ? (
        <Button
          testID="connection-disconnect"
          label="DISCONNECT"
          onPress={disconnect}
          variant="ghost"
          tint={COLOR.red}
          style={styles.disconnect}
        />
      ) : null}

      <Text testID="connection-endpoint" style={styles.endpoint}>
        {connected && mode === 'cloud' ? (pairing.cloudBase ?? DEFAULT_ENDPOINTS.deskBase) : pairing.deskBase}
      </Text>
      {lastError ? (
        <Text testID="connection-error" style={styles.error}>
          {lastError}
        </Text>
      ) : null}

      <Field
        testID="connection-desk-input"
        label="DESK ADDRESS"
        hint="192.168.1.9:8000"
        value={desk}
        onChange={setDesk}
      />
      <Field
        testID="connection-cloud-input"
        label="CLOUD GATEWAY"
        hint="https://jarvis-cloud-gateway.onrender.com"
        value={cloud}
        onChange={setCloud}
      />
      <Field
        testID="connection-token-input"
        label={pairing.hasToken ? 'PAIRING TOKEN — SET' : 'PAIRING TOKEN — NOT SET'}
        hint={pairing.hasToken ? 'leave blank to keep the current one' : 'the gateway APP_TOKEN'}
        value={token}
        onChange={setToken}
        secret
        onSubmit={save}
      />

      <Button
        testID="connection-save"
        label={saving ? 'SAVING' : 'SAVE & RECONNECT'}
        onPress={save}
        busy={saving}
        style={styles.save}
      />
      {note ? (
        <Text testID="connection-note" style={styles.note}>
          {note}
        </Text>
      ) : null}
      {/* the token is what the gateway checks; without one it refuses the socket
          outright, and the phone would sit dark with no explanation */}
      {!pairing.hasToken ? (
        <Text testID="connection-unpaired" style={styles.note}>
          No token yet. The cloud gateway refuses every socket until this matches its APP_TOKEN.
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: SPACE.xl, paddingBottom: SPACE.lg },
  rings: { alignItems: 'center', justifyContent: 'center' },
  glyph: { position: 'absolute' },
  simulatedNote: { marginTop: SPACE.sm },
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
  field: { marginTop: SPACE.md },
  // the action has to sit clear of the last field, or the token box and the
  // button read as one control and the button looks like part of the input
  save: { marginTop: SPACE.xl },
  disconnect: { marginTop: SPACE.md },
  fieldLabel: { ...TYPE.dataLabel, color: COLOR.dim, marginBottom: SPACE.xs },
  input: {
    ...TYPE.meta,
    color: COLOR.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.dim,
    borderRadius: 8,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    minHeight: 44,
  },
  note: { ...TYPE.dataLabel, color: COLOR.dim, textAlign: 'center', marginTop: SPACE.sm },
  endpoint: { ...TYPE.dataLabel, color: COLOR.dim, textAlign: 'center', marginTop: SPACE.lg, opacity: 0.7 },
  error: { ...TYPE.dataLabel, color: COLOR.red, textAlign: 'center', marginTop: SPACE.sm },
});
