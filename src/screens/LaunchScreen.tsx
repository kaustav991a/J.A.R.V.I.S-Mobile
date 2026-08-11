import { useEffect } from 'react';
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
import { LoadingBar } from '../components/LoadingBar';
import { COLOR, HUD_BEZIER, SCRIM, SPACE, TYPE } from '../theme/tokens';
import { useAppearance } from '../theme/appearance';
import { useJarvis } from '../state/JarvisProvider';

/** how long the reactor holds the screen on its own before the tabs take over */
const HOLD_MS = 2400;
const ENTER_MS = 900;
const EXIT_MS = 420;

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

  const enter = useSharedValue(animations ? 0 : 1);
  const stripIn = useSharedValue(animations ? 0 : 1);
  const leave = useSharedValue(1);

  useEffect(() => {
    if (animations) {
      enter.value = withTiming(1, { duration: ENTER_MS, easing: EASE });
      // the readout arrives after the ring has lit, never with it
      stripIn.value = withDelay(ENTER_MS * 0.55, withTiming(1, { duration: 420, easing: EASE }));
    }
    const hold = animations ? HOLD_MS : 700;
    const timer = setTimeout(() => {
      leave.value = withTiming(0, { duration: animations ? EXIT_MS : 0, easing: EASE }, (done) => {
        if (done) runOnJS(onDone)();
      });
    }, hold);
    return () => clearTimeout(timer);
  }, [animations, enter, stripIn, leave, onDone]);

  const skip = () => {
    leave.value = withTiming(0, { duration: animations ? 240 : 0, easing: EASE }, (done) => {
      if (done) runOnJS(onDone)();
    });
  };

  const sheetStyle = useAnimatedStyle(() => ({ opacity: leave.value }));
  const reactorStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: 0.82 + enter.value * 0.18 }],
  }));
  const stripStyle = useAnimatedStyle(() => ({
    opacity: stripIn.value,
    transform: [{ translateY: (1 - stripIn.value) * 10 }],
  }));

  const size = Math.min(width * 0.66, 300);
  /** the faint halo circles the reference draws well outside the tube */
  const halo = { cx: width / 2, cy: height * 0.44 };
  // what the app is actually waiting on, not invented steps
  const bootLabel = connecting ? 'Linking' : connected ? 'Linked' : 'Bringing systems online';

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, sheetStyle]} testID="launch-screen">
      <LinearGradient colors={[...SCRIM]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />

      {/* the wide blue wash the reference has behind the ring — a bloom the
          reactor's own gradient is far too small to throw */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="launch-wash" cx="50%" cy="48%" r="62%">
            <Stop offset="0%" stopColor={accent} stopOpacity={0.16 + glow * 0.2} />
            <Stop offset="45%" stopColor={accent} stopOpacity={0.07 + glow * 0.09} />
            <Stop offset="100%" stopColor={accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#launch-wash)" />
        <Circle cx={halo.cx} cy={halo.cy} r={size * 0.78} stroke={accent} strokeWidth={1} opacity={0.1} fill="none" />
        <Circle cx={halo.cx} cy={halo.cy} r={size * 0.98} stroke={accent} strokeWidth={1} opacity={0.06} fill="none" />
      </Svg>

      <Pressable
        testID="launch-skip"
        accessibilityRole="button"
        accessibilityLabel="Enter Jarvis"
        onPress={skip}
        style={styles.tapArea}
      >
        <Animated.View style={reactorStyle}>
          <ArcReactor size={size} status={hud.status} />
        </Animated.View>
      </Pressable>

      <View style={styles.progress} pointerEvents="none">
        <LoadingBar testID="launch-progress" duration={HOLD_MS} label={bootLabel} width={Math.min(width * 0.5, 220)} />
      </View>

      <Animated.View style={[styles.tagline, stripStyle]} pointerEvents="none">
        <Text testID="launch-tagline" style={styles.taglineText}>
          YOUR INTELLIGENT ASSISTANT
        </Text>
        <Text style={styles.taglineText}>FOR AUTOMATION AND PRODUCTIVITY</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: COLOR.bg, zIndex: 10 },
  /** the ring sits above centre, as in the reference, not on it */
  tapArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: '12%' },
  progress: { position: 'absolute', left: 0, right: 0, bottom: '27%', alignItems: 'center' },
  tagline: { position: 'absolute', left: SPACE.xl, right: SPACE.xl, bottom: '13%', alignItems: 'center', gap: 4 },
  taglineText: { ...TYPE.strip, fontSize: 11, letterSpacing: 1.6, color: 'rgba(214,232,255,0.72)', textAlign: 'center' },
});
