import { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { ArcReactor } from '../components/ArcReactor';
import { HandoffAnchor, useReactorHandoff } from '../components/ReactorHandoff';
import { LoadingBar } from '../components/LoadingBar';
import { COLOR, HUD_BEZIER, SCRIM, SPACE, TYPE } from '../theme/tokens';
import { useAppearance } from '../theme/appearance';
import { useJarvis } from '../state/JarvisProvider';

const EXIT_MS = 420;

/**
 * The arrival, in order: the ring powers on, the canvas lights around it, then
 * the readout and the tagline arrive. About half a second of choreography, using
 * only what was already on the screen.
 *
 * The reactor no longer fades or scales in at all — `ignite` draws it. A ring
 * that fades up is a picture appearing; a ring that draws itself is a machine
 * starting, and that was the whole point.
 */
/**
 * The wash comes in behind the draw rather than over it. Earlier it started at
 * 120ms and washed the ring out while it was still drawing, which is part of why
 * the ignition was hard to see at all.
 */
const WASH_AT = 380;
const WASH_MS = 700;
/** after the circuit closes, so the bloom is not lighting an unlit ring */
const RAIL_AT = 1250;
const RAIL_MS = 380;
const STRIP_AT = 1450;
const STRIP_MS = 440;

/** the choreography is finished once the tagline has settled */
const SETTLE_AT = STRIP_AT + STRIP_MS;
/**
 * How long the finished composition rests before handing off to Home.
 *
 * Separate from the choreography on purpose. This used to be one `HOLD_MS = 2400`
 * covering both, so retiming any part of the arrival silently ate into the dwell —
 * and the dwell is the part that is actually read. A tap still skips it, so a
 * longer rest is never a wall.
 */
const DWELL_MS = 2200;

/** how long the reactor holds the screen on its own before the tabs take over */
const HOLD_MS = SETTLE_AT + DWELL_MS;

const EASE = Easing.bezier(HUD_BEZIER[0], HUD_BEZIER[1], HUD_BEZIER[2], HUD_BEZIER[3]);

export type LaunchScreenProps = {
  /** called once the screen has faded out; the app is already mounted behind it */
  onDone: () => void;
};

/**
 * The launch canvas: the reactor alone on the gradient over the reference's
 * two-line tagline. It sits over the live app rather than replacing it, so the
 * socket is already probing by the time it lifts.
 *
 * It dismisses itself after {@link HOLD_MS}; a tap anywhere skips the wait.
 */
export function LaunchScreen({ onDone }: LaunchScreenProps) {
  const { width, height } = useWindowDimensions();
  const { accent, glow, animations } = useAppearance();
  const { hud, connected, connecting } = useJarvis();

  const washIn = useSharedValue(animations ? 0 : 1);
  const railIn = useSharedValue(animations ? 0 : 1);
  const stripIn = useSharedValue(animations ? 0 : 1);
  const leave = useSharedValue(1);
  /** 0 at launch size and place, 1 sitting exactly on Home's reactor */
  const fly = useSharedValue(0);

  // Where this reactor is, and where Home's is. Both are measured in window
  // coordinates by `HandoffAnchor`; Home is already laid out behind this overlay,
  // so its frame is there by the time the launch screen lifts.
  const handoff = useReactorHandoff();
  const origin = handoff?.origin ?? null;
  const target = handoff?.target ?? null;
  const handing = Boolean(animations && origin && target);
  const dx = origin && target ? target.x - origin.x : 0;
  const dy = origin && target ? target.y - origin.y : 0;
  const ratio = origin && target ? target.size / origin.size : 1;

  const dismiss = useCallback(
    (ms: number) => {
      // the reactor travels while the canvas clears, so the two finish together
      // and there is no frame where a shrunken ring sits on a lit background
      if (handing) fly.value = withTiming(1, { duration: ms, easing: EASE });
      leave.value = withTiming(0, { duration: ms, easing: EASE }, (done) => {
        if (done) runOnJS(onDone)();
      });
    },
    [handing, fly, leave, onDone]
  );

  useEffect(() => {
    if (animations) {
      // the canvas lights around the ring, a beat after it starts drawing
      washIn.value = withDelay(WASH_AT, withTiming(1, { duration: WASH_MS, easing: EASE }));
      railIn.value = withDelay(RAIL_AT, withTiming(1, { duration: RAIL_MS, easing: EASE }));
      // the readout arrives after the ring has lit, never with it
      stripIn.value = withDelay(STRIP_AT, withTiming(1, { duration: STRIP_MS, easing: EASE }));
    }
    const hold = animations ? HOLD_MS : 700;
    const timer = setTimeout(() => dismiss(animations ? EXIT_MS : 0), hold);
    return () => clearTimeout(timer);
  }, [animations, washIn, railIn, stripIn, dismiss]);

  const skip = () => dismiss(animations ? 240 : 0);

  const canvasStyle = useAnimatedStyle(() => ({ opacity: leave.value }));
  const washStyle = useAnimatedStyle(() => ({ opacity: washIn.value }));
  const flyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dx * fly.value },
      { translateY: dy * fly.value },
      { scale: 1 + (ratio - 1) * fly.value },
    ],
    // Handing off, the ring stays lit the whole way and simply stops existing
    // when the overlay unmounts — Home's own reactor is already underneath it at
    // the destination, so the swap is invisible. With nowhere to fly to, it fades
    // out like everything else instead of vanishing.
    opacity: handing ? 1 : leave.value,
  }));
  const railStyle = useAnimatedStyle(() => ({
    opacity: railIn.value * leave.value,
    transform: [{ translateY: (1 - railIn.value) * 8 }],
  }));
  const stripStyle = useAnimatedStyle(() => ({
    opacity: stripIn.value * leave.value,
    transform: [{ translateY: (1 - stripIn.value) * 10 }],
  }));

  const size = Math.min(width * 0.66, 300);
  /** the faint halo circles the reference draws well outside the tube */
  const halo = { cx: width / 2, cy: height * 0.44 };
  // what the app is actually waiting on, not invented steps
  const bootLabel = connecting ? 'Linking' : connected ? 'Linked' : 'Bringing systems online';

  return (
    <View style={[StyleSheet.absoluteFill, styles.root]} testID="launch-screen">
      {/* Everything except the reactor. The backdrop lives in here rather than on
          the root so that it can clear while the ring is still flying — an opaque
          root would keep Home hidden until the very last frame, which is the cut
          this handoff exists to remove. */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.canvas, canvasStyle]} pointerEvents="none">
        <LinearGradient colors={[...SCRIM]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
        <Animated.View style={[StyleSheet.absoluteFill, washStyle]}>
          <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id="launch-wash" cx="50%" cy="48%" r="62%">
                <Stop offset="0%" stopColor={accent} stopOpacity={0.16 + glow * 0.2} />
                <Stop offset="45%" stopColor={accent} stopOpacity={0.07 + glow * 0.09} />
                <Stop offset="100%" stopColor={accent} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x={0} y={0} width={width} height={height} fill="url(#launch-wash)" />
            {/* one slow tick track, in place of the two static halo rings: a ring
                that never moves is a drawn circle, which is what the reactor's own
                tube spent six strokes not being */}
            <Circle
              cx={halo.cx}
              cy={halo.cy}
              r={size * 0.88}
              stroke={accent}
              strokeWidth={1}
              opacity={0.12}
              fill="none"
              strokeDasharray="2 16"
            />
          </Svg>
        </Animated.View>
      </Animated.View>

      <Pressable
        testID="launch-skip"
        accessibilityRole="button"
        accessibilityLabel="Enter Jarvis"
        onPress={skip}
        style={styles.tapArea}
      >
        {/* no fade, no scale: `ignite` draws the ring round, so it powers on.
            The flying transform sits outside the anchor, so animating it cannot
            disturb the measurement the handoff is aiming with. */}
        <Animated.View style={flyStyle}>
          <HandoffAnchor id="origin">
            <ArcReactor size={size} status={hud.status} ignite />
          </HandoffAnchor>
        </Animated.View>
      </Pressable>

      <Animated.View style={[styles.progress, railStyle]} pointerEvents="none">
        <LoadingBar testID="launch-progress" duration={HOLD_MS} label={bootLabel} width={Math.min(width * 0.5, 220)} />
      </Animated.View>

      <Animated.View style={[styles.tagline, stripStyle]} pointerEvents="none">
        <Text testID="launch-tagline" style={styles.taglineText}>
          YOUR INTELLIGENT ASSISTANT
        </Text>
        <Text style={styles.taglineText}>FOR AUTOMATION AND PRODUCTIVITY</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 10 },
  /** the opaque backdrop, which fades while the reactor is still travelling */
  canvas: { backgroundColor: COLOR.bg },
  /** the ring sits above centre, as in the reference, not on it */
  tapArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: '12%' },
  progress: { position: 'absolute', left: 0, right: 0, bottom: '27%', alignItems: 'center' },
  tagline: { position: 'absolute', left: SPACE.xl, right: SPACE.xl, bottom: '13%', alignItems: 'center', gap: 4 },
  taglineText: { ...TYPE.strip, fontSize: 11, letterSpacing: 1.6, color: 'rgba(214,232,255,0.72)', textAlign: 'center' },
});
