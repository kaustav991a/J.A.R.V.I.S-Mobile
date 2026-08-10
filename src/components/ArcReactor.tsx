import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { COLOR, HUD_BEZIER, TYPE, glowBox, glowText } from '../theme/tokens';
import { statusColor } from '../theme/status';
import { useAppearance } from '../theme/appearance';

export type ArcReactorProps = {
  size: number;
  status: string;
  /** the lockup inside the ring */
  label?: string;
  /** small line under the lockup, e.g. the activity word */
  sublabel?: string;
};

/**
 * The single hero of the app: a breathing arc reactor.
 *
 * Rotation lives on wrapping Views, never on animated SVG props — animating
 * `react-native-svg` attributes through reanimated is the least reliable
 * surface in this stack, and a rotated View is visually identical here.
 */
export function ArcReactor({ size, status, label = 'JARVIS', sublabel }: ArcReactorProps) {
  const { accent, glow, animations } = useAppearance();
  const color = statusColor(status, accent);

  const sweep = useSharedValue(0);
  const counter = useSharedValue(0);
  const breath = useSharedValue(0.72);

  useEffect(() => {
    if (!animations) {
      sweep.value = 0;
      counter.value = 0;
      breath.value = 0.9;
      return;
    }
    sweep.value = withRepeat(withTiming(360, { duration: 9000, easing: Easing.linear }), -1, false);
    counter.value = withRepeat(withTiming(-360, { duration: 24000, easing: Easing.linear }), -1, false);
    breath.value = withRepeat(
      withTiming(1, {
        duration: 2200,
        easing: Easing.bezier(HUD_BEZIER[0], HUD_BEZIER[1], HUD_BEZIER[2], HUD_BEZIER[3]),
      }),
      -1,
      true
    );
  }, [sweep, counter, breath, animations]);

  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${sweep.value}deg` }] }));
  const counterStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${counter.value}deg` }] }));
  const breathStyle = useAnimatedStyle(() => ({
    opacity: breath.value,
    transform: [{ scale: 0.97 + breath.value * 0.05 }],
  }));

  const c = size / 2;
  const ring = (r: number, width: number, stroke: string, opacity: number, dash?: string) => ({
    cx: c,
    cy: c,
    r,
    stroke,
    strokeWidth: width,
    strokeLinecap: 'round' as const,
    fill: 'none',
    opacity,
    ...(dash ? { strokeDasharray: dash } : {}),
  });

  return (
    <View testID="arc-reactor" style={[styles.wrap, { width: size, height: size }]}>
      {/* soft bloom — the light the reactor throws onto the canvas */}
      <Animated.View style={[StyleSheet.absoluteFill, breathStyle]}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id="reactorBloom" cx="50%" cy="50%" r="50%">
              <Stop offset="35%" stopColor={color} stopOpacity={0.14 + glow * 0.3} />
              <Stop offset="72%" stopColor={color} stopOpacity={0.04 + glow * 0.1} />
              <Stop offset="100%" stopColor={color} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle testID="arc-reactor-bloom" cx={c} cy={c} r={c} fill="url(#reactorBloom)" />
        </Svg>
      </Animated.View>

      {/* the ring itself, carrying the native glow */}
      <View style={[StyleSheet.absoluteFill, glowBox(color, 8 + glow * 30)]}>
        <Svg width={size} height={size}>
          <Circle {...ring(c * 0.86, 0.75, color, 0.25)} />
          <Circle testID="arc-reactor-ring" {...ring(c * 0.78, 2.5, color, 0.95)} />
          <Circle {...ring(c * 0.7, 0.75, COLOR.blueBright, 0.5)} />
        </Svg>
      </View>

      {/* one bright arc sweeping the outer track */}
      <Animated.View style={[StyleSheet.absoluteFill, sweepStyle]}>
        <Svg width={size} height={size}>
          <Circle testID="arc-reactor-sweep" {...ring(c * 0.86, 1.75, COLOR.blueBright, 0.85, `${c * 0.9} ${c * 6}`)} />
        </Svg>
      </Animated.View>

      {/* a slow tick track running the other way */}
      <Animated.View style={[StyleSheet.absoluteFill, counterStyle]}>
        <Svg width={size} height={size}>
          <Circle {...ring(c * 0.7, 1, color, 0.3, '3 20')} />
        </Svg>
      </Animated.View>

      <View style={styles.lockup} pointerEvents="none">
        <Text testID="arc-reactor-wordmark" style={[styles.wordmark, glowText(color, 6 + glow * 14)]}>
          {label}
        </Text>
        {sublabel ? (
          <Text testID="arc-reactor-sublabel" style={[styles.sublabel, { color }]}>
            {sublabel.toUpperCase()}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  lockup: { position: 'absolute', alignItems: 'center' },
  wordmark: {
    ...TYPE.wordmark,
    color: COLOR.white,
    // letterSpacing pads the right edge in RN; nudge the lockup back to centre
    marginLeft: TYPE.wordmark.letterSpacing,
  },
  sublabel: { ...TYPE.strip, marginTop: 6, marginLeft: 2, opacity: 0.9 },
});
