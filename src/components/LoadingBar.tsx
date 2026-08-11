import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { COLOR, RADIUS, SPACE, TYPE, glowBox } from '../theme/tokens';
import { useAppearance } from '../theme/appearance';

export type LoadingBarProps = {
  /** how long the fill takes to reach the end */
  duration: number;
  /** the word under the track, e.g. what is being brought up */
  label?: string;
  width: number;
  testID?: string;
};

/**
 * The launch progress track: a thin rail, a filling bar of light, and a
 * brighter head that runs ahead of it.
 *
 * It reports the launch hold honestly — the fill lands as the screen hands
 * over — rather than pretending to measure work it cannot see.
 */
export function LoadingBar({ duration, label, width, testID }: LoadingBarProps) {
  const { accent, glow, animations } = useAppearance();
  const fill = useSharedValue(animations ? 0 : 1);
  const sheen = useSharedValue(0);

  useEffect(() => {
    if (!animations) {
      fill.value = 1;
      return;
    }
    fill.value = withTiming(1, { duration, easing: Easing.inOut(Easing.cubic) });
    // a light that sweeps the unfilled rail, so the bar reads as active even
    // while the fill is between steps
    sheen.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 0 })
      ),
      -1,
      false
    );
  }, [animations, duration, fill, sheen]);

  const fillStyle = useAnimatedStyle(() => ({ width: fill.value * width }));
  const headStyle = useAnimatedStyle(() => ({
    opacity: fill.value < 1 ? 1 : 0,
    transform: [{ translateX: fill.value * width - 1 }],
  }));
  const sheenStyle = useAnimatedStyle(() => ({
    opacity: 0.5 - Math.abs(sheen.value - 0.5),
    transform: [{ translateX: sheen.value * width }],
  }));

  return (
    <View testID={testID} style={[styles.wrap, { width }]}>
      <View style={styles.track}>
        <Animated.View style={[styles.sheen, { backgroundColor: accent }, sheenStyle]} />
        <Animated.View style={[styles.fill, { backgroundColor: accent }, glowBox(accent, 6 + glow * 10), fillStyle]} />
        <Animated.View style={[styles.head, { backgroundColor: COLOR.blueBright }, headStyle]} />
      </View>
      {label ? (
        <Text testID={testID ? `${testID}-label` : undefined} style={styles.label}>
          {label.toUpperCase()}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: SPACE.md },
  track: {
    height: 2,
    width: '100%',
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(120,180,255,0.16)',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: { position: 'absolute', left: 0, height: 2, borderRadius: RADIUS.pill },
  head: { position: 'absolute', left: 0, width: 2, height: 6, borderRadius: 1 },
  sheen: { position: 'absolute', left: 0, width: 60, height: 2, opacity: 0.3 },
  label: { ...TYPE.strip, fontSize: 10, letterSpacing: 3, color: COLOR.dim },
});
