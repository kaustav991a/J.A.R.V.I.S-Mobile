import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { ArcReactor } from '../components/ArcReactor';
import { Button } from '../components/ui/Button';
import { COLOR, SCRIM, SPACE, TYPE } from '../theme/tokens';
import { useAppearance } from '../theme/appearance';
import { AuthFailure, cancel } from '../lib/biometrics';
import { useAuth } from '../security/AuthProvider';

/** how close to a just-opened sheet an 'active' event is treated as the same event */
const SETTLE_MS = 1_200;

/** what each refusal means in words the screen can say out loud */
const EXCUSE: Record<AuthFailure, string> = {
  cancelled: 'Cancelled.',
  failed: 'Not recognised.',
  lockout: 'Too many attempts. Unlock your phone itself, then come back.',
  unavailable: 'This phone cannot answer for you right now.',
};

/**
 * The gate. Sits over the whole app, unmounted the moment it opens.
 *
 * It — not the provider — is what fires the OS prompt, and it fires it once on
 * mount so the common case is a finger already on the sensor and no taps at
 * all. After a refusal it waits to be asked again: re-prompting in a loop
 * fights the OS lockout counter and traps the user in a sheet they cannot
 * dismiss.
 */
export function LockScreen() {
  const { width, height } = useWindowDimensions();
  const { accent, glow } = useAppearance();
  const { unlock, lastFailure, sensorLabel } = useAuth();
  const [asking, setAsking] = useState(false);
  /** the prompt is fired once by mounting; every later one is a real tap */
  const greeted = useRef(false);
  /** when the sheet was last opened, to tell a genuine return from a cold start */
  const lastAsk = useRef(0);

  const ask = useCallback(async () => {
    lastAsk.current = Date.now();
    setAsking(true);
    try {
      // settle anything left open by a previous attempt before opening another,
      // or Android has two prompts to reason about and answers neither
      await cancel();
      await unlock();
    } finally {
      setAsking(false);
    }
  }, [unlock]);

  useEffect(() => {
    if (greeted.current) return;
    greeted.current = true;
    void ask();
  }, [ask]);

  /**
   * Ask again every time the app comes back, not just when this screen mounts.
   *
   * Two things went wrong without this. The prompt is one-shot per mount, and a
   * screen that is already locked never unmounts — so returning to a locked app
   * showed a lock screen that would not ask for anything. And minimising while
   * the sheet was up left `authenticateAsync` unresolved, so the button sat
   * showing a spinner and refused its own press until the timeout fired.
   *
   * Firing on `active` only. Cancelling as the app *leaves* would abort the very
   * sheet we just opened on devices that report our own prompt as a background.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      // A cold start fires the mount prompt and then an 'active' moments later.
      // Asking again there would cancel the sheet that just opened and flicker
      // it; a real return from the background is always far longer than this.
      if (Date.now() - lastAsk.current < SETTLE_MS) return;
      void ask();
    });
    return () => sub.remove();
  }, [ask]);

  const size = Math.min(width * 0.42, 180);

  return (
    <View style={[StyleSheet.absoluteFill, styles.root]} testID="lock-screen">
      <LinearGradient colors={[...SCRIM]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="lock-wash" cx="50%" cy="42%" r="58%">
            <Stop offset="0%" stopColor={accent} stopOpacity={0.14 + glow * 0.16} />
            <Stop offset="100%" stopColor={accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#lock-wash)" />
      </Svg>

      <View style={styles.stack}>
        {/* `listening` and not `lockdown`: the ring is waiting for you, and a
            red alarm ring on every launch would cry wolf.
            It ignites here too, so the J arrives as the ring closes instead of
            sitting there fully formed before the reactor has drawn itself. */}
        <ArcReactor size={size} status="listening" monogram="J" ignite />

        <Text style={styles.title} testID="lock-title">
          LOCKED
        </Text>
        <Text style={styles.caption}>
          {lastFailure ? EXCUSE[lastFailure] : `${sensorLabel} required to go on.`}
        </Text>

        <Button
          testID="lock-unlock"
          label={`Unlock with ${sensorLabel.toLowerCase()}`}
          onPress={() => void ask()}
          busy={asking}
          style={styles.action}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // above the launch overlay's zIndex 10: if both are up, the gate is on top
  root: { backgroundColor: COLOR.bg, zIndex: 20, alignItems: 'center', justifyContent: 'center' },
  stack: { alignItems: 'center', paddingHorizontal: SPACE.xl, gap: SPACE.lg },
  title: { ...TYPE.wordmark, fontSize: 18, color: COLOR.white, marginTop: SPACE.lg },
  caption: {
    ...TYPE.strip,
    fontSize: 11,
    letterSpacing: 1.4,
    color: 'rgba(214,232,255,0.7)',
    textAlign: 'center',
  },
  action: { marginTop: SPACE.md, minWidth: 240 },
});
