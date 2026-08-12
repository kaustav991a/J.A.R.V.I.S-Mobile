import { useEffect, useId } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
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
  /**
   * Power on instead of appearing: the hot ring draws itself round from twelve
   * o'clock, and everything that sits on top of it — the lockup, the sweeping
   * arc, the tick track — arrives once the circuit is closed.
   *
   * Off by default, so every reactor already on screen is unaffected.
   */
  ignite?: boolean;
};

/**
 * How the ring *moves* in each state.
 *
 * `statusColor` already gives every state its own colour, but colour alone reads
 * as a palette change rather than a machine doing something — with identical
 * motion, thinking and idle look the same at a glance. These are the tempos, and
 * they are what you can tell apart across a room:
 *
 * - `sweep` / `counter` — ms per revolution of the bright arc and the tick track.
 *   Lower is faster. Working states spin; resting states drift.
 * - `breath` — ms per pulse of the bloom. Fast and shallow reads as effort.
 * - `dash` — multiplier on the sweeping arc's length. A longer arc at speed reads
 *   as urgency; a short one drifting reads as idle.
 */
export type Tempo = { sweep: number; counter: number; breath: number; dash: number };

const TEMPO: Record<string, Tempo> = {
  /** linked and idle: slow, calm, clearly alive */
  online: { sweep: 9000, counter: 24000, breath: 2600, dash: 0.7 },
  /** waiting on you — a touch quicker, attentive rather than busy */
  listening: { sweep: 5600, counter: 17000, breath: 1500, dash: 0.8 },
  /** working: the one that should look unmistakably different */
  thinking: { sweep: 2000, counter: 8000, breath: 900, dash: 1.7 },
  /** talking back: steady and deliberate */
  speaking: { sweep: 3800, counter: 13000, breath: 1150, dash: 1.1 },
  /** something is wrong: fast, long arc, hard pulse */
  alert: { sweep: 1300, counter: 6000, breath: 620, dash: 2.4 },
  /** not linked: barely moving, so a dead link never looks busy */
  boot: { sweep: 15000, counter: 32000, breath: 3400, dash: 0.45 },
};

/**
 * The tempo for a status word, matching how `statusColor` groups them so the
 * colour and the motion always agree.
 */
export function tempoFor(status: string): Tempo {
  const key = status.trim().toLowerCase();
  if (key === 'agent' || key === 'working') return TEMPO.thinking;
  if (key === 'lockdown') return TEMPO.alert;
  return TEMPO[key] ?? TEMPO.boot;
}

/** how long the ring takes to draw itself round */
export const IGNITE_MS = 620;
/** what rides in behind it, once the circuit is closed */
const AFTERGLOW_MS = 260;

/**
 * Animating a `react-native-svg` attribute is the least reliable surface in this
 * stack, which is why rotation here lives on wrapping Views instead. A circle
 * being *drawn* has no View equivalent — dash offset is the only way — so this
 * is the one place that pays the cost, and it pays it on exactly one prop.
 */
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The single hero of the app: a breathing arc reactor.
 *
 * Rotation lives on wrapping Views, never on animated SVG props — animating
 * `react-native-svg` attributes through reanimated is the least reliable
 * surface in this stack, and a rotated View is visually identical here.
 */
export function ArcReactor({
  size,
  status,
  label = 'JARVIS',
  sublabel,
  monogram,
  ignite = false,
}: ArcReactorProps) {
  const { accent, glow, animations } = useAppearance();
  const color = statusColor(status, accent);
  const tempo = tempoFor(status);
  /** an ignition nobody can see is just a delay */
  const igniting = ignite && animations;

  // gradient ids must be unique or a second reactor on screen (About) steals
  // the first one's fills
  const uid = useId().replace(/:/g, '');
  const bloomId = `bloom-${uid}`;
  const wellId = `well-${uid}`;

  const sweep = useSharedValue(0);
  const counter = useSharedValue(0);
  const breath = useSharedValue(0.72);
  /** 0 unlit, 1 closed circuit */
  const arc = useSharedValue(igniting ? 0 : 1);
  /** what rides in behind the ring */
  const after = useSharedValue(igniting ? 0 : 1);

  useEffect(() => {
    if (!igniting) {
      arc.value = 1;
      after.value = 1;
      return;
    }
    arc.value = withTiming(1, {
      duration: IGNITE_MS,
      // the same curve the rest of the HUD uses: fast out of the gate, long
      // tail, so the last few degrees close rather than snap
      easing: Easing.bezier(HUD_BEZIER[0], HUD_BEZIER[1], HUD_BEZIER[2], HUD_BEZIER[3]),
    });
    after.value = withDelay(IGNITE_MS * 0.7, withTiming(1, { duration: AFTERGLOW_MS }));
  }, [igniting, arc, after]);

  useEffect(() => {
    if (!animations) {
      sweep.value = 0;
      counter.value = 0;
      breath.value = 0.9;
      return;
    }
    // restarted whenever the tempo changes, so a status change is visible as a
    // change of pace rather than only a change of colour
    sweep.value = 0;
    counter.value = 0;
    sweep.value = withRepeat(withTiming(360, { duration: tempo.sweep, easing: Easing.linear }), -1, false);
    counter.value = withRepeat(withTiming(-360, { duration: tempo.counter, easing: Easing.linear }), -1, false);
    breath.value = withRepeat(
      withTiming(1, {
        duration: tempo.breath,
        easing: Easing.bezier(HUD_BEZIER[0], HUD_BEZIER[1], HUD_BEZIER[2], HUD_BEZIER[3]),
      }),
      -1,
      true
    );
  }, [sweep, counter, breath, animations, tempo.sweep, tempo.counter, tempo.breath]);

  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${sweep.value}deg` }] }));
  const counterStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${counter.value}deg` }] }));
  const breathStyle = useAnimatedStyle(() => ({
    opacity: breath.value,
    transform: [{ scale: 0.97 + breath.value * 0.05 }],
  }));

  const c = size / 2;
  /** the hot ring's own circumference: the whole length that has to be drawn */
  const lap = 2 * Math.PI * (c * 0.8);

  // A dash the length of the circle, offset by the same amount, is an invisible
  // ring; winding the offset to zero draws it. `lap` is read inside the worklet
  // body, never as a default parameter — a default initialiser is not scanned
  // for closure capture and the value arrives undefined on the UI thread.
  const drawProps = useAnimatedProps(() => ({
    strokeDasharray: [lap, lap],
    strokeDashoffset: lap * (1 - arc.value),
  }));

  const afterStyle = useAnimatedStyle(() => ({ opacity: after.value }));

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
            {/* The bloom both widens and brightens with `glow`. Opacity alone
                moved too little to read as a light control, and on Android it is
                the only thing carrying the setting at all — `glowBox` is inert
                there. */}
            <RadialGradient id={bloomId} cx="50%" cy="50%" r="50%">
              <Stop offset={`${58 - glow * 16}%`} stopColor={color} stopOpacity={0} />
              <Stop offset="78%" stopColor={color} stopOpacity={0.05 + glow * 0.4} />
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
      {/* The tube is drawn at -90° so ignition starts at twelve o'clock; an SVG
          circle's own zero is at three. */}
      <View style={[StyleSheet.absoluteFill, styles.fromTop, glowBox(color, 10 + glow * 34)]}>
        <Svg width={size} height={size}>
          {/* The tube's three halo strokes now thicken with `glow` as well as
              brighten. Fixed widths meant the slider changed the halo's
              brightness by a couple of percent and its size not at all, which is
              not what a glow control is for. */}
          <AnimatedCircle
            {...ring(c * 0.8, c * (0.1 + glow * 0.22), color, 0.04 + glow * 0.09)}
            animatedProps={drawProps}
          />
          <AnimatedCircle
            {...ring(c * 0.8, c * (0.07 + glow * 0.12), color, 0.06 + glow * 0.12)}
            animatedProps={drawProps}
          />
          <AnimatedCircle
            {...ring(c * 0.8, c * (0.04 + glow * 0.05), color, 0.1 + glow * 0.2)}
            animatedProps={drawProps}
          />
          <AnimatedCircle
            testID="arc-reactor-ring"
            {...ring(c * 0.8, Math.max(3, c * 0.032), color, 1)}
            animatedProps={drawProps}
          />
          {/* the white-hot centre line inside the tube */}
          <AnimatedCircle
            {...ring(c * 0.8, Math.max(1, c * 0.01), COLOR.blueBright, 0.9)}
            animatedProps={drawProps}
          />
        </Svg>
      </View>

      {/* The companion ring is not part of the tube, so it arrives with the rest
          rather than being drawn — one thing ignites, not six. */}
      <Animated.View style={[StyleSheet.absoluteFill, afterStyle]} pointerEvents="none">
        <Svg width={size} height={size}>
          <Circle {...ring(c * 0.68, Math.max(1, c * 0.008), COLOR.blueBright, 0.45)} />
        </Svg>
      </Animated.View>

      {/* one bright arc sweeping the outer track */}
      <Animated.View style={[StyleSheet.absoluteFill, sweepStyle, afterStyle]}>
        <Svg width={size} height={size}>
          {/* arc length rides the tempo too: a long arc at speed reads as effort,
              a short one drifting reads as idle */}
          <Circle
            testID="arc-reactor-sweep"
            {...ring(c * 0.92, 2, COLOR.blueBright, 0.7, `${c * 0.7 * tempo.dash} ${c * 6}`)}
          />
        </Svg>
      </Animated.View>

      {/* a slow tick track running the other way */}
      <Animated.View style={[StyleSheet.absoluteFill, counterStyle, afterStyle]}>
        <Svg width={size} height={size}>
          <Circle {...ring(c * 0.7, 1, color, 0.3, '3 20')} />
        </Svg>
      </Animated.View>

      {/* The lit core a small reactor needs so its middle is not a black hole.
          It gets its own absolute-fill layer: nested in the lockup — which is
          absolutely positioned and sized to its text — a size×size canvas blew
          that box out and drew a second orb beside the ring. */}
      {/* The core and the glyph arrive with everything else that sits on the
          ring, so an igniting reactor lights its middle once the circuit closes
          rather than showing a finished centre inside a half-drawn tube. */}
      {monogram ? (
        <Animated.View style={[StyleSheet.absoluteFill, breathStyle, afterStyle]} pointerEvents="none">
          <Svg width={size} height={size}>
            <Circle cx={c} cy={c} r={c * 0.42} fill={color} opacity={0.1 + glow * 0.12} />
            <Circle cx={c} cy={c} r={c * 0.2} fill={COLOR.blueBright} opacity={0.16 + glow * 0.16} />
          </Svg>
        </Animated.View>
      ) : null}

      {monogram ? (
        <Animated.View style={[styles.lockup, afterStyle]} pointerEvents="none">
          <Text
            testID="arc-reactor-monogram"
            style={[styles.monogram, { fontSize: size * 0.34, color: COLOR.white }, glowText(color, 6 + glow * 12)]}
          >
            {monogram}
          </Text>
        </Animated.View>
      ) : null}

      <Animated.View style={[styles.lockup, afterStyle]} pointerEvents="none">
        <Text testID="arc-reactor-wordmark" style={[styles.wordmark, glowText(color, 6 + glow * 14)]}>
          {label}
        </Text>
        {sublabel ? (
          <Text testID="arc-reactor-sublabel" style={[styles.sublabel, { color }]}>
            {sublabel.toUpperCase()}
          </Text>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  /** an SVG circle's zero is at three o'clock; ignition should start at twelve */
  fromTop: { transform: [{ rotate: '-90deg' }] },
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
