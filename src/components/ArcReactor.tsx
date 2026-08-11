import { useEffect, useId } from 'react';
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
  /**
   * A single glyph for sizes too small to carry the wordmark — the ring alone
   * reads as an empty black hole. Drawn over a lit core.
   */
  monogram?: string;
};

/**
 * The single hero of the app: a breathing arc reactor.
 *
 * Rotation lives on wrapping Views, never on animated SVG props — animating
 * `react-native-svg` attributes through reanimated is the least reliable
 * surface in this stack, and a rotated View is visually identical here.
 */
export function ArcReactor({ size, status, label = 'JARVIS', sublabel, monogram }: ArcReactorProps) {
  const { accent, glow, animations } = useAppearance();
  const color = statusColor(status, accent);

  // gradient ids must be unique or a second reactor on screen (About) steals
  // the first one's fills
  const uid = useId().replace(/:/g, '');
  const bloomId = `bloom-${uid}`;
  const wellId = `well-${uid}`;

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
      {/* soft bloom — the light the reactor throws onto the canvas — over a
          well of darkness inside the ring, which is what gives the reference
          image its depth. */}
      <Animated.View style={[StyleSheet.absoluteFill, breathStyle]}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id={bloomId} cx="50%" cy="50%" r="50%">
              <Stop offset="52%" stopColor={color} stopOpacity={0} />
              <Stop offset="76%" stopColor={color} stopOpacity={0.1 + glow * 0.22} />
              <Stop offset="100%" stopColor={color} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id={wellId} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#01060f" stopOpacity={0.9} />
              <Stop offset="70%" stopColor="#01060f" stopOpacity={0.65} />
              <Stop offset="100%" stopColor="#01060f" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={c} cy={c} r={c * 0.78} fill={`url(#${wellId})`} />
          <Circle testID="arc-reactor-bloom" cx={c} cy={c} r={c} fill={`url(#${bloomId})`} />
        </Svg>
      </Animated.View>

      {/* The ring, built like a neon tube: three wide, near-transparent strokes
          stacked under one hot thin stroke. RN has no blur filter for SVG, so
          the halo is faked by the stack — this is what makes it read as light
          rather than as a drawn circle. */}
      <View style={[StyleSheet.absoluteFill, glowBox(color, 10 + glow * 34)]}>
        <Svg width={size} height={size}>
          <Circle {...ring(c * 0.8, c * 0.2, color, 0.05 + glow * 0.06)} />
          <Circle {...ring(c * 0.8, c * 0.12, color, 0.07 + glow * 0.09)} />
          <Circle {...ring(c * 0.8, c * 0.06, color, 0.12 + glow * 0.16)} />
          <Circle testID="arc-reactor-ring" {...ring(c * 0.8, Math.max(3, c * 0.032), color, 1)} />
          {/* the white-hot centre line inside the tube */}
          <Circle {...ring(c * 0.8, Math.max(1, c * 0.01), COLOR.blueBright, 0.9)} />
          {/* thin companion ring, as in the reference */}
          <Circle {...ring(c * 0.68, Math.max(1, c * 0.008), COLOR.blueBright, 0.45)} />
        </Svg>
      </View>

      {/* one bright arc sweeping the outer track */}
      <Animated.View style={[StyleSheet.absoluteFill, sweepStyle]}>
        <Svg width={size} height={size}>
          <Circle testID="arc-reactor-sweep" {...ring(c * 0.92, 2, COLOR.blueBright, 0.7, `${c * 0.7} ${c * 6}`)} />
        </Svg>
      </Animated.View>

      {/* a slow tick track running the other way */}
      <Animated.View style={[StyleSheet.absoluteFill, counterStyle]}>
        <Svg width={size} height={size}>
          <Circle {...ring(c * 0.7, 1, color, 0.3, '3 20')} />
        </Svg>
      </Animated.View>

      {/* the lit core a small reactor needs so its middle is not a black hole */}
      {monogram ? (
        <View style={styles.lockup} pointerEvents="none">
          <Animated.View style={breathStyle}>
            <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
              <Circle cx={c} cy={c} r={c * 0.42} fill={color} opacity={0.1 + glow * 0.12} />
              <Circle cx={c} cy={c} r={c * 0.2} fill={COLOR.blueBright} opacity={0.16 + glow * 0.16} />
            </Svg>
          </Animated.View>
          <Text
            testID="arc-reactor-monogram"
            style={[
              styles.monogram,
              { fontSize: size * 0.34, color: COLOR.white },
              glowText(color, 6 + glow * 12),
            ]}
          >
            {monogram}
          </Text>
        </View>
      ) : null}

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
  monogram: { fontFamily: TYPE.wordmark.fontFamily, letterSpacing: 2, marginLeft: 2 },
});
