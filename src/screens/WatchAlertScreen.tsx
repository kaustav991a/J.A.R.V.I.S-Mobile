import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { COLOR, RADIUS, SPACE, TYPE, glowBox } from '../theme/tokens';
import { useAppearance } from '../theme/appearance';
import { haptic } from '../lib/haptics';
import { useJarvis } from '../state/JarvisProvider';
import { DEMO_MUGSHOT } from '../state/demoFeed';
import { useAuth } from '../security/AuthProvider';
import type { IntruderAlert } from '../state/hudReducer';

/** the stand-in desk's capture — labelled DEMO CAPTURE on the image itself, so a
 *  screenshot of it can never be mistaken for a real one */
const DEMO_MUGSHOT_ASSET = require('../../assets/demo-mugshot.png') as number;

/** how the desk describes what it saw, in words rather than an enum */
const CAUSE: Record<string, string> = {
  unlock: 'The desk was unlocked',
  wake: 'The desk woke from sleep',
  hello_failed: 'Windows Hello was refused',
};

/** seconds left, floored at zero, from a deadline in epoch ms */
export function secondsLeft(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/**
 * The desk watch alert: a mugshot, a countdown, and two answers.
 *
 * The countdown drawn here is a *readout of the desk's* clock, not a decision
 * timer. Nothing this screen does or fails to do causes the lock — the desk
 * locks itself on silence. That is what makes it safe for the phone to be
 * asleep, out of signal, or flat.
 */
export function WatchAlertScreen({ alert }: { alert: IntruderAlert }) {
  const { width } = useWindowDimensions();
  const { accent } = useAppearance();
  const { answerWatch, expireWatch, deskAsset } = useJarvis();
  const { confirm } = useAuth();
  const toast = useToast();

  const [left, setLeft] = useState(() => secondsLeft(alert.deadline, Date.now()));
  const [asking, setAsking] = useState<'me' | 'lock' | null>(null);
  /** the expiry must fire once, not once per render that happens to be at zero */
  const expired = useRef(false);

  useEffect(() => {
    expired.current = false;
    setLeft(secondsLeft(alert.deadline, Date.now()));
  }, [alert.id, alert.deadline]);

  useEffect(() => {
    // wall-clock, not a decrementing counter: a timer starved while the phone
    // slept would otherwise show time this alert no longer has
    const timer = setInterval(() => {
      const now = secondsLeft(alert.deadline, Date.now());
      setLeft(now);
      if (now === 0 && !expired.current) {
        expired.current = true;
        expireWatch(alert.id);
        toast.show('No answer in time. Desk locked.', 'bad');
      }
    }, 250);
    return () => clearInterval(timer);
  }, [alert.id, alert.deadline, expireWatch, toast]);

  const answer = useCallback(
    async (itWasMe: boolean) => {
      setAsking(itWasMe ? 'me' : 'lock');
      try {
        // Only clearing the alert is gated. Locking is the safe direction and is
        // exactly what happens on silence anyway, so putting a sensor between
        // the user and it would protect nothing and cost seconds.
        if (itWasMe && !(await confirm('Confirm it was you at the desk'))) {
          haptic.bad();
          return;
        }
        await answerWatch(alert.id, itWasMe);
        // The alert unmounts the moment it resolves, so without this the screen
        // just disappears and never says what happened to the machine. The toast
        // lives on the provider above, so it survives this component going away.
        if (itWasMe) {
          haptic.good();
          toast.show('Desk stays unlocked — confirmed as you.', 'good');
        } else {
          haptic.bad();
          toast.show('Desk locked. Windows will ask for your PIN.', 'bad');
        }
      } finally {
        setAsking(null);
      }
    },
    [alert.id, answerWatch, confirm, toast]
  );

  // The stand-in desk has no camera and no URL to serve one from, so it sends a
  // sentinel and the bundled placeholder is swapped in here. Kept local to this
  // screen: `deskAsset` resolves real paths against a real base and has no
  // business knowing about demo mode.
  const demoShot = alert.image === DEMO_MUGSHOT;
  const shot = demoShot ? null : deskAsset(alert.image);
  const source = demoShot ? DEMO_MUGSHOT_ASSET : shot ? { uri: shot } : null;
  const frame = Math.min(width - SPACE.xl * 2, 320);
  const urgent = left <= 10;
  const tint = urgent ? COLOR.red : COLOR.gold;

  return (
    <View style={[StyleSheet.absoluteFill, styles.root]} testID="watch-alert">
      <LinearGradient colors={['#1a0608', '#0d0410', '#01060f']} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />

      <View style={styles.stack}>
        <Text style={[styles.eyebrow, { color: tint }]} testID="watch-eyebrow">
          SOMEONE AT THE DESK
        </Text>
        <Text style={styles.title}>WAS THIS YOU?</Text>

        <View style={[styles.frame, { width: frame, height: frame }, glowBox(tint, 18)]}>
          {source ? (
            <Image
              testID="watch-mugshot"
              source={source}
              style={styles.shot}
              resizeMode="cover"
              accessibilityLabel="Webcam capture from the desk"
            />
          ) : (
            /* no capture is not a reason to stay quiet — the desk is still
               counting down, so the alert stands without a picture */
            <View style={styles.noShot} testID="watch-no-mugshot">
              <Text style={styles.noShotText}>NO IMAGE</Text>
              <Text style={styles.detail}>The camera gave the desk nothing.</Text>
            </View>
          )}
        </View>

        <Text style={styles.detail} testID="watch-cause">
          {CAUSE[alert.trigger] ?? 'The desk saw activity'}
          {alert.user ? ` · ${alert.user}` : ''}
        </Text>

        <Text style={[styles.count, { color: tint }]} testID="watch-count">
          {left}s
        </Text>
        <Text style={styles.detail}>
          {left > 0 ? 'The desk locks itself when this runs out.' : 'Time is up — the desk is locking.'}
        </Text>

        <View style={styles.actions}>
          <Button
            testID="watch-lock"
            label="Lock it now"
            variant="ghost"
            tint={COLOR.red}
            onPress={() => void answer(false)}
            busy={asking === 'lock'}
            disabled={asking !== null || left === 0}
            style={styles.action}
          />
          <Button
            testID="watch-me"
            label="It was me"
            onPress={() => void answer(true)}
            busy={asking === 'me'}
            disabled={asking !== null || left === 0}
            style={styles.action}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // above the gate: an alert that arrives while the app is locked is still the
  // most urgent thing on the phone, and answering it is itself gated
  root: { backgroundColor: COLOR.bg, zIndex: 30, alignItems: 'center', justifyContent: 'center' },
  stack: { alignItems: 'center', paddingHorizontal: SPACE.xl, gap: SPACE.md },
  eyebrow: { ...TYPE.strip, fontSize: 11, letterSpacing: 2 },
  title: { ...TYPE.wordmark, fontSize: 20, color: COLOR.white },
  frame: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLOR.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shot: { width: '100%', height: '100%' },
  noShot: { alignItems: 'center', gap: SPACE.sm, paddingHorizontal: SPACE.lg },
  noShotText: { ...TYPE.strip, fontSize: 12, letterSpacing: 2, color: COLOR.dim },
  detail: { ...TYPE.strip, fontSize: 11, letterSpacing: 1.2, color: 'rgba(214,232,255,0.7)', textAlign: 'center' },
  count: { ...TYPE.wordmark, fontSize: 34, letterSpacing: 2, marginTop: SPACE.xs },
  actions: { flexDirection: 'row', gap: SPACE.md, marginTop: SPACE.lg },
  action: { minWidth: 130 },
});
