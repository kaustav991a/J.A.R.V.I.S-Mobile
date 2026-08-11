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
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { CHROME, COLOR, RADIUS, SPACE, TYPE } from '../theme/tokens';
import { useAppearance } from '../theme/appearance';
import { haptic } from '../lib/haptics';
import { Glass } from '../components/ui/Glass';

export type GlassTabBarProps = BottomTabBarProps & {
  icons: Record<string, keyof typeof Ionicons.glyphMap>;
};

/** an unselected tab is a glyph and nothing else */
const IDLE_W = 52;
const RUBBER = 46;
const SNAP = { damping: 17, stiffness: 195, mass: 0.55 } as const;

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
function widthAt(i: number, pos: number, opens: number[]): number {
  'worklet';
  const near = 1 - Math.min(Math.abs(pos - i), 1);
  return IDLE_W + (opens[i] - IDLE_W) * near;
}

/** distance from the strip's left edge to the centre of tab `i` */
function centreOf(i: number, pos: number, opens: number[]): number {
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

  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-14, 14])
    .onBegin(() => {
      start.value = pos.value;
    })
    .onUpdate((e) => {
      // a drag is measured against the closed width: that is what the finger
      // travels between one glyph and the next
      const raw = start.value - e.translationX / IDLE_W;
      const over = raw < 0 ? raw : raw > last ? raw - last : 0;
      const banded = raw < 0 ? (over * RUBBER) / IDLE_W : raw > last ? last + (over * RUBBER) / IDLE_W : raw;
      pos.value = banded;
      const near = Math.round(clamp(banded, 0, last));
      if (near !== detent.value) {
        detent.value = near;
        runOnJS(haptic.tap)();
      }
    })
    .onEnd((e) => {
      const flick = clamp(-e.velocityX / 1200, -1, 1);
      const target = Math.round(clamp(pos.value + flick, 0, last));
      pos.value = animations ? withSpring(target, SNAP) : withTiming(target, { duration: 0 });
      detent.value = target;
      runOnJS(jump)(target);
    });

  const stripStyle = useAnimatedStyle(() => {
    const i = Math.round(clamp(pos.value, 0, last));
    return { transform: [{ translateX: barWidth / 2 - centreOf(i, pos.value, opens) }] };
  });

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
    <View
      testID="tab-bar"
      // stowed, never unmounted: tearing down views that own a running
      // animation is a way to crash Android
      pointerEvents={hidden ? 'none' : 'auto'}
      style={[styles.wrap, { bottom: Math.max(insets.bottom, CHROME.tabBarGap) }, hidden && styles.stowed]}
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

      <GestureDetector gesture={pan}>
        <View style={styles.track}>
          <Animated.View style={[styles.strip, stripStyle]}>
            {state.routes.map((route, index) => {
              const label = labels[index];
              return (
                <TabDetent
                  key={route.key}
                  index={index}
                  pos={pos}
                  opens={opens}
                  label={label}
                  icon={icons[route.name]}
                  accent={accent}
                  selected={state.index === index}
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
    </View>
  );
}

type DetentProps = {
  index: number;
  pos: { value: number };
  opens: number[];
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

function TabDetent({ index, pos, opens, label, icon, accent, selected, onPress, onLongPress }: DetentProps) {
  /** 0 under the lens, 1 a whole tab away — everything here reads off it */
  const away = useDerivedValue(() => Math.min(Math.abs(pos.value - index), 1));
  const nameWidth = labelWidth(label);

  const slotStyle = useAnimatedStyle(() => ({ width: widthAt(index, pos.value, opens) }));

  const iconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(away.value, [0, 1], [1, 0.55], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(away.value, [0, 1], [1, 0.92], Extrapolation.CLAMP) }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(away.value, [0, 0.5], [1, 0], Extrapolation.CLAMP),
    // exactly the name's own width, so there is no slack between it and the
    // icon and the pair sits centred in the capsule
    width: interpolate(away.value, [0, 1], [nameWidth, 0], Extrapolation.CLAMP),
  }));

  const tap = Gesture.Tap()
    .maxDistance(12)
    .onEnd((_e, ok) => {
      if (ok) runOnJS(onPress)();
    });
  const long = Gesture.LongPress().onStart(() => runOnJS(onLongPress)());

  return (
    <GestureDetector gesture={Gesture.Exclusive(long, tap)}>
      <Animated.View
        testID={`tab-${label}`}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        style={[styles.detent, slotStyle]}
      >
        <Animated.View style={iconStyle}>
          <Ionicons name={icon} size={20} color={selected ? accent : COLOR.dim} />
        </Animated.View>
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
