import { useEffect, useState } from 'react';
import { Keyboard, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  clamp,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { CHROME, COLOR, RADIUS, SPACE, TYPE } from '../theme/tokens';
import { useAppearance } from '../theme/appearance';
import { haptic } from '../lib/haptics';
import { Glass } from '../components/ui/Glass';
import { useJarvis } from '../state/JarvisProvider';

/**
 * The tab that carries the conversation, and therefore the only one with news.
 *
 * Named `Commands` in the navigator and labelled `Chat`; the route name is what is
 * matched here, because the label is a display string and has already changed once.
 */
const CHAT_ROUTE = 'Commands';

export type GlassTabBarProps = BottomTabBarProps & {
  icons: Record<string, keyof typeof Ionicons.glyphMap>;
};

/** an unselected tab is a glyph and nothing else */
const IDLE_W = 52;
const RUBBER = 46;
/**
 * The grab. Slightly under-damped (ζ≈0.67) so the dial arrives with a hint of
 * overshoot instead of easing in — that overshoot is what reads as magnetic.
 * This was heavier (damping 22, stiffness 78, mass 1.1), chosen to give the dial
 * mass; on device the mass read as syrup.
 */
const SNAP = { damping: 17, stiffness: 190, mass: 0.85 } as const;
/**
 * How long a flick is treated as still coasting. Multiplied by the release
 * velocity, it says which detent the finger was *aiming* at — the old code
 * clamped the throw to ±1 detent, so a hard swipe could never cross more than
 * one tab and momentum died the instant the finger left the glass.
 */
const COAST_S = 0.22;
/** but a wild swipe should not fly the length of the dial */
const MAX_FLICK = 3;
/** the finger travels further than the strip does — that is the stickiness */
const DRAG = 1.45;
/** waking and settling the dial: quick enough to feel like a response */
const WAKE = { damping: 20, stiffness: 160, mass: 0.7 } as const;
/**
 * How hard a detent holds the dial *while the finger is still down* — 0 is a
 * linear strip, 1 is a pure snap. This is the other half of the Camera feel:
 * the spring on release only ever tidied up after the drag, so mid-drag the
 * dial slid like a scrollview. At 0.55 leaving a tab costs about twice the
 * finger travel that crossing the middle does, and the total travel per detent
 * is unchanged — the magnet redistributes the drag, it does not add friction.
 */
export const MAGNET = 0.68;

/**
 * Labels are set in the data face, which is monospace on both platforms, so a
 * name's width is its length — no measuring pass, and every tab opens to
 * exactly its own name rather than to one width that fits the longest.
 */
const CHAR_W = 7;
const LENS_PAD = SPACE.md;

const labelWidth = (label: string): number => label.length * CHAR_W;
const openWidth = (label: string): number => IDLE_W + labelWidth(label) + SPACE.sm + LENS_PAD;

/** how wide tab `i` is when the dial sits at `pos` — the whole layout follows
 *  from this, so the strip offset and the tabs can never disagree */
export function widthAt(i: number, pos: number, opens: number[]): number {
  'worklet';
  const near = 1 - Math.min(Math.abs(pos - i), 1);
  return IDLE_W + (opens[i] - IDLE_W) * near;
}

/** distance from the strip's left edge to the centre of tab `i` */
export function centreOf(i: number, pos: number, opens: number[]): number {
  'worklet';
  let x = 0;
  for (let j = 0; j < opens.length; j++) {
    const w = widthAt(j, pos, opens);
    if (j === i) return x + w / 2;
    x += w;
  }
  return x;
}

/**
 * Smootherstep: flat at both ends, steep through the middle. Its derivative is
 * zero at 0 and 1, which is exactly the shape of a detent — the dial is
 * reluctant to leave one and eager to arrive at the next.
 */
function detentCurve(t: number): number {
  'worklet';
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Bend a raw dial position toward whichever detent it is nearest, so the dial
 * is sticky under the finger instead of only after it lifts.
 *
 * Blended with the identity rather than used outright: pure smootherstep would
 * bring the dial to a dead stop at each tab, and a control that stops moving
 * while the finger is still moving reads as broken, not as magnetic. The blend
 * keeps the rate between 0.45x and 1.48x — always advancing.
 *
 * Detents land on integers (`magnetize(k) === k`) and the midpoints are
 * untouched, so nothing downstream — the tick, the spring target, the lens —
 * has to know this ran.
 *
 * `strength` is defaulted in the body, not in the signature. The reanimated
 * babel plugin builds a worklet's closure from the identifiers in its *body*,
 * so a default parameter of `= MAGNET` compiles fine, passes under jest — which
 * runs on the JS thread, where the real closure still exists — and then throws
 * `Property 'MAGNET' doesn't exist` on the UI thread on device, once per frame.
 */
export function magnetize(raw: number, strength?: number): number {
  'worklet';
  const pull = strength === undefined ? MAGNET : strength;
  const base = Math.floor(raw);
  const t = raw - base;
  return base + t + pull * (detentCurve(t) - t);
}

/**
 * The strip offset for a *fractional* dial position, lerped between the two
 * detents it lies between.
 *
 * This replaces rounding the dial to the nearest tab and centring that one:
 * because every tab's width follows the dial, the two neighbours' centres are
 * about a tab apart, so the round tripped the strip roughly 60px sideways in a
 * single frame as the dial crossed a boundary — the jump in the middle of every
 * drag.
 */
export function centreAt(pos: number, opens: number[]): number {
  'worklet';
  const last = opens.length - 1;
  const at = clamp(pos, 0, last);
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  const t = at - lo;
  const centre = centreOf(lo, at, opens) * (1 - t) + centreOf(hi, at, opens) * t;
  // Past either end the widths have to stop following the dial. Fed the raw
  // position, `widthAt` narrows the over-dragged edge tab, which walks its own
  // centre back the way the finger came — the band ran backwards. So the layout
  // freezes at the edge and the overscroll shows as plain travel, at the same
  // rate a closed tab moves at.
  return centre + (pos - at) * IDLE_W;
}

/**
 * Which detent a release was aiming at, given where the dial is and how fast it
 * was still travelling.
 *
 * The release velocity is in px/s, so it converts to detents/s through exactly
 * the mapping the drag used — one detent is `IDLE_W * DRAG` of finger travel —
 * and then coasts for {@link COAST_S}. Sign is flipped because dragging left
 * (negative x) advances the dial.
 */
export function projectDetent(pos: number, velocityX: number, last: number): number {
  'worklet';
  const detentsPerSec = -velocityX / (IDLE_W * DRAG);
  const flick = clamp(detentsPerSec * COAST_S, -MAX_FLICK, MAX_FLICK);
  return Math.round(clamp(pos + flick, 0, last));
}

/**
 * The tab bar as the iOS Camera mode picker, on a dial that breathes.
 *
 * Tabs ride a strip that slides under one fixed lens at the centre of the
 * glass. Only the tab under the lens spends width — the rest close up to a
 * glyph, so five tabs read as one control rather than five distant buttons.
 * Because the widths follow the dial's position, the growing and the sliding
 * are the same motion: drag and the next tab opens as it arrives.
 *
 * Let go and it springs to the nearest detent; every detent crossed ticks.
 */
export function GlassTabBar({ state, descriptors, navigation, icons }: GlassTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { accent, animations } = useAppearance();
  /**
   * What the Chat tab has to say about itself.
   *
   * Read here rather than passed down from `RootNavigator` so the chrome owns its
   * own indicators — and because this is the surface that answers the question
   * "did anything come back?" for someone standing on another tab. Before this, a
   * reply arriving off-Chat could only be announced by a system notification,
   * which is the wrong instrument for an app that is already open.
   */
  const { unread, hud } = useJarvis();
  const thinking = hud.status === 'thinking';

  const last = state.routes.length - 1;
  const barWidth = width - CHROME.tabBarSide * 2;

  const labels = state.routes.map((route) => {
    const label = descriptors[route.key].options.tabBarLabel;
    return typeof label === 'string' ? label : route.name;
  });
  const opens = labels.map(openWidth);

  // a floating bar has nowhere to go when the keyboard opens: it would sit on
  // top of whatever is being typed into, and it cannot be reached anyway
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setHidden(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHidden(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  /** 0 resting, 1 armed — a brief press wakes the dial before it is dragged */
  const armed = useSharedValue(0);
  const pos = useSharedValue(state.index);
  const start = useSharedValue(0);
  const detent = useSharedValue(state.index);

  // a tab changed from somewhere else (a quick action, a deep link): follow it
  useEffect(() => {
    detent.value = state.index;
    pos.value = animations ? withSpring(state.index, SNAP) : withTiming(state.index, { duration: 0 });
  }, [state.index, animations, pos, detent]);

  const jump = (index: number) => {
    const route = state.routes[index];
    if (!route || index === state.index) return;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!event.defaultPrevented) navigation.navigate(route.name, route.params);
  };

  const hold = Gesture.LongPress()
    .minDuration(160)
    .maxDistance(1000)
    .shouldCancelWhenOutside(false)
    .onStart(() => {
      armed.value = withSpring(1, WAKE);
      runOnJS(haptic.tap)();
    })
    .onFinalize(() => {
      armed.value = withSpring(0, WAKE);
    });

  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-14, 14])
    .onBegin(() => {
      start.value = pos.value;
      armed.value = withSpring(1, WAKE);
    })
    .onUpdate((e) => {
      // a drag is measured against the closed width: that is what the finger
      // travels between one glyph and the next
      const raw = start.value - e.translationX / (IDLE_W * DRAG);
      const over = raw < 0 ? raw : raw > last ? raw - last : 0;
      const banded =
        raw < 0 ? (over * RUBBER) / (IDLE_W * DRAG) : raw > last ? last + (over * RUBBER) / (IDLE_W * DRAG) : raw;
      // the magnet goes on last, over the band, so inside the strip each tab
      // holds on; past the ends it damps the overscroll a little further, which
      // is the same direction the band is already pulling
      pos.value = magnetize(banded);
    })
    .onEnd((e) => {
      const target = projectDetent(pos.value, e.velocityX, last);
      pos.value = animations ? withSpring(target, SNAP) : withTiming(target, { duration: 0 });
      armed.value = withSpring(0, WAKE);
      runOnJS(jump)(target);
    });

  // One tick per detent, wherever the dial is when it crosses one. Reading the
  // dial rather than the drag means the flick's coast ticks too: the old tick
  // lived in `onUpdate`, so the moment the finger lifted the dial slid past the
  // remaining tabs in silence, which is what made a throw feel weightless.
  useAnimatedReaction(
    () => Math.round(clamp(pos.value, 0, last)),
    (now, before) => {
      if (before === null || now === before) return;
      detent.value = now;
      runOnJS(haptic.tap)();
    }
  );

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + armed.value * 0.035 }],
  }));

  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: barWidth / 2 - centreAt(pos.value, opens) }],
  }));

  // the lens breathes with the dial rather than standing at the widest name:
  // fixed at the maximum it hangs loose around a short one like CHAT
  const lensStyle = useAnimatedStyle(() => {
    const at = clamp(pos.value, 0, last);
    const lo = Math.floor(at);
    const hi = Math.ceil(at);
    const t = at - lo;
    return { width: opens[lo] * (1 - t) + opens[hi] * t };
  });

  return (
    <Animated.View
      testID="tab-bar"
      // stowed, never unmounted: tearing down views that own a running
      // animation is a way to crash Android
      pointerEvents={hidden ? 'none' : 'auto'}
      style={[styles.wrap, { bottom: Math.max(insets.bottom, CHROME.tabBarGap) }, hidden && styles.stowed, barStyle]}
      accessibilityRole="tablist"
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    >
      <Glass style={styles.pane} radius={CHROME.tabBarHeight / 2} />

      {/* the lens: fixed at the centre, the strip moves under it */}
      <View pointerEvents="none" style={styles.lensLayer}>
        <Animated.View
          style={[styles.lens, { borderColor: `${accent}55`, backgroundColor: `${accent}20` }, lensStyle]}
        />
      </View>

      <GestureDetector gesture={Gesture.Simultaneous(hold, pan)}>
        <View style={styles.track}>
          <Animated.View style={[styles.strip, stripStyle]}>
            {state.routes.map((route, index) => {
              const label = labels[index];
              return (
                <TabDetent
                  key={route.key}
                  index={index}
                  pos={pos}
                  armed={armed}
                  opens={opens}
                  label={label}
                  icon={icons[route.name]}
                  accent={accent}
                  selected={state.index === index}
                  // thinking wins: while an answer is still coming, the count of
                  // what already arrived is the less useful of the two, and showing
                  // both puts two marks on one 20px glyph
                  busy={route.name === CHAT_ROUTE && thinking}
                  badge={route.name === CHAT_ROUTE && !thinking ? unread : 0}
                  onPress={() => {
                    haptic.tap();
                    jump(index);
                  }}
                  onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
                />
              );
            })}
          </Animated.View>
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

type DetentProps = {
  index: number;
  pos: { value: number };
  armed: { value: number };
  opens: number[];
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  selected: boolean;
  /** an answer is still on its way, so the glyph pulses instead of counting */
  busy: boolean;
  /** replies seen by nobody yet; 0 draws nothing */
  badge: number;
  onPress: () => void;
  onLongPress: () => void;
};

function TabDetent({
  index,
  pos,
  armed,
  opens,
  label,
  icon,
  accent,
  selected,
  busy,
  badge,
  onPress,
  onLongPress,
}: DetentProps) {
  /** 0 under the lens, 1 a whole tab away — everything here reads off it */
  const away = useDerivedValue(() => Math.min(Math.abs(pos.value - index), 1));
  const nameWidth = labelWidth(label);

  const slotStyle = useAnimatedStyle(() => ({ width: widthAt(index, pos.value, opens) }));

  const iconStyle = useAnimatedStyle(() => ({
    // resting glyphs come up as the dial wakes, so the whole row reads as
    // reachable the moment it is armed
    opacity: interpolate(away.value, [0, 1], [1, 0.55 + armed.value * 0.3], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(away.value, [0, 1], [1, 0.92], Extrapolation.CLAMP) }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(away.value, [0, 0.5], [1, 0], Extrapolation.CLAMP),
    // exactly the name's own width, so there is no slack between it and the
    // icon and the pair sits centred in the capsule
    width: interpolate(away.value, [0, 1], [nameWidth, 0], Extrapolation.CLAMP),
  }));

  /**
   * The thinking pulse.
   *
   * Driven off a shared value rather than a JS interval: this runs on the UI thread
   * and keeps breathing while the bridge is busy carrying the answer, which is
   * precisely when it is on screen.
   *
   * No default parameter anywhere in the worklet — a default is not captured by the
   * closure and throws once per frame on the UI thread. See `AGENTS.md`.
   */
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!busy) {
      pulse.value = withTiming(0, { duration: 160 });
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 620 }), -1, true);
  }, [busy, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + pulse.value * 0.7,
    transform: [{ scale: 0.8 + pulse.value * 0.35 }],
  }));

  const tap = Gesture.Tap()
    .maxDistance(12)
    .onEnd((_e, ok) => {
      if (ok) runOnJS(onPress)();
    });
  const long = Gesture.LongPress().onStart(() => runOnJS(onLongPress)());

  // Race, not Exclusive: Exclusive gives the long press priority, so every
  // tap waited the full 160ms for the hold to fail before it fired — that is
  // the split second before the tab changed
  return (
    <GestureDetector gesture={Gesture.Race(tap, long)}>
      <Animated.View
        testID={`tab-${label}`}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        style={[styles.detent, slotStyle]}
      >
        {/* the glyph is the positioning context for both marks. They sit OUTSIDE
            `iconStyle` on purpose: that style dims a resting tab to 0.55, and an
            unread count you have to squint at is not a notification. The detent
            clips at 44px, so both offsets stay inside the 12px of headroom the
            20px glyph leaves. */}
        <View style={styles.glyph}>
          <Animated.View style={iconStyle}>
            <Ionicons name={icon} size={20} color={selected ? accent : COLOR.dim} />
          </Animated.View>
          {badge > 0 ? (
            <View testID={`tab-unread-${label}`} style={[styles.badge, { backgroundColor: accent }]}>
              {/* 9+ rather than a widening pill: the capsule width is computed from
                  the label, so a three-digit count would push the glyph off centre */}
              <Text style={styles.badgeText}>{badge > 9 ? '9+' : String(badge)}</Text>
            </View>
          ) : null}
          {busy ? (
            <Animated.View
              testID={`tab-thinking-${label}`}
              style={[styles.pulse, { backgroundColor: accent }, pulseStyle]}
            />
          ) : null}
        </View>
        <Animated.Text numberOfLines={1} style={[styles.label, { color: accent }, labelStyle]}>
          {label}
        </Animated.Text>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: CHROME.tabBarSide,
    right: CHROME.tabBarSide,
    height: CHROME.tabBarHeight,
    justifyContent: 'center',
    // the shadow lives out here; clipping happens on the track inside
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  stowed: { opacity: 0, transform: [{ translateY: 200 }] },
  pane: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  lensLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lens: { height: 44, borderRadius: RADIUS.pill, borderWidth: StyleSheet.hairlineWidth },
  track: {
    height: CHROME.tabBarHeight,
    borderRadius: CHROME.tabBarHeight / 2,
    // nothing may render past the pill's edge
    overflow: 'hidden',
    justifyContent: 'center',
  },
  strip: { flexDirection: 'row', alignItems: 'center' },
  detent: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // the icon and the name read as one pair, not two things sharing a pill
    gap: SPACE.sm,
    overflow: 'hidden',
  },
  // sized to the glyph so the two marks below have something to hang off
  glyph: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -7,
    right: -11,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    ...TYPE.dataLabel,
    fontSize: 9,
    lineHeight: 14,
    // dark on accent: the accent is the bright colour here, so the text is the hole
    color: COLOR.bg,
    includeFontPadding: false,
  },
  pulse: { position: 'absolute', top: -5, right: -7, width: 7, height: 7, borderRadius: 3.5 },
  label: {
    ...TYPE.dataLabel,
    fontSize: 11,
    letterSpacing: 0.4,
    textAlign: 'center',
    // Android pads glyphs vertically by default, which sits the name a pixel
    // or two below the icon's centre line
    includeFontPadding: false,
  },
});
