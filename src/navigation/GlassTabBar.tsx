import type { RefObject } from 'react';
import { useEffect, useState } from 'react';
import { Keyboard, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { haptic } from '../lib/haptics';
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
import { CHROME, COLOR, MOTION, RADIUS, SPACE, TYPE } from '../theme/tokens';
import { useAppearance } from '../theme/appearance';
import { TabBarBackground } from './TabBarBackground';

export type GlassTabBarProps = BottomTabBarProps & {
  /** the view Android's blur samples; see TabBarBackground */
  blurTarget: RefObject<View | null>;
  icons: Record<string, keyof typeof Ionicons.glyphMap>;
};

/** one detent of the strip */
const ITEM = 92;
/** how far past the ends the strip can be dragged before it pulls back */
const RUBBER = 46;
const SNAP = { damping: 17, stiffness: 190, mass: 0.55, overshootClamping: false } as const;

/** the detent tick, exactly as the camera dial clicks past a mode */
const tick = () => haptic.tap();

/**
 * The tab bar as the iOS Camera mode picker: the tabs ride on a strip that
 * slides under one fixed lens at the centre of the glass. Dragging moves the
 * strip against a rubber band, letting go springs it to the nearest detent,
 * and each detent it crosses ticks.
 *
 * The selection is the strip's position — there is no separate "active" state
 * to keep in sync. Neighbours fade and shrink with their distance from the
 * lens, which is what makes the row read as a dial rather than five buttons.
 */
export function GlassTabBar({ state, descriptors, navigation, blurTarget, icons }: GlassTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { accent, animations } = useAppearance();

  const count = state.routes.length;
  const barWidth = width - CHROME.tabBarSide * 2;
  const last = count - 1;

  // the strip's offset in detents: 0 is the first tab centred, `last` the final
  const pos = useSharedValue(state.index);
  const start = useSharedValue(0);
  const detent = useSharedValue(state.index);

  // a floating bar has nowhere to go when the keyboard opens: it would sit on
  // top of whatever is being typed into. It is also unreachable while typing,
  // so it stands down until the keyboard is gone.
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setHidden(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHidden(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

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
      const raw = start.value - e.translationX / ITEM;
      // past either end the strip still moves, but only by a fraction — the
      // rubber band that tells you there is nothing more to reach
      const over = raw < 0 ? raw : raw > last ? raw - last : 0;
      const banded = raw < 0 ? (over * RUBBER) / ITEM : raw > last ? last + (over * RUBBER) / ITEM : raw;
      pos.value = banded;
      const near = Math.round(clamp(banded, 0, last));
      if (near !== detent.value) {
        detent.value = near;
        runOnJS(tick)();
      }
    })
    .onEnd((e) => {
      // a flick carries one detent past where the finger stopped
      const flick = clamp(-e.velocityX / 1400, -1, 1);
      const target = Math.round(clamp(pos.value + flick, 0, last));
      pos.value = animations ? withSpring(target, SNAP) : withTiming(target, { duration: 0 });
      detent.value = target;
      runOnJS(jump)(target);
    });

  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: barWidth / 2 - ITEM / 2 - pos.value * ITEM }],
  }));

  return (
    <View
      testID="tab-bar"
      // hidden by moving it out of the way, never unmounted: tearing down views
      // that own a running layout animation is a way to crash Android
      pointerEvents={hidden ? 'none' : 'auto'}
      style={[
        styles.wrap,
        { bottom: Math.max(insets.bottom, CHROME.tabBarGap) },
        hidden && styles.stowed,
      ]}
      accessibilityRole="tablist"
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    >
      <TabBarBackground target={blurTarget} />

      {/* the lens: fixed at the centre, the strip moves under it */}
      <View pointerEvents="none" style={styles.lensLayer}>
        <View style={[styles.lens, { borderColor: `${accent}55`, backgroundColor: `${accent}20` }]} />
      </View>

      <GestureDetector gesture={pan}>
        <View style={styles.track}>
          <Animated.View style={[styles.strip, stripStyle]}>
            {state.routes.map((route, index) => {
              const { options } = descriptors[route.key];
              const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : route.name;
              return (
                <TabDetent
                  key={route.key}
                  index={index}
                  pos={pos}
                  label={label}
                  icon={icons[route.name]}
                  accent={accent}
                  selected={state.index === index}
                  onPress={() => jump(index)}
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
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

function TabDetent({ index, pos, label, icon, accent, selected, onPress, onLongPress }: DetentProps) {
  // distance from the lens, in detents — everything about this tab reads off it
  const away = useDerivedValue(() => Math.abs(pos.value - index));

  const itemStyle = useAnimatedStyle(() => ({
    opacity: interpolate(away.value, [0, 1, 2], [1, 0.5, 0.28], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(away.value, [0, 1], [1, 0.86], Extrapolation.CLAMP) }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(away.value, [0, 0.6], [1, 0], Extrapolation.CLAMP),
    // the name rises into place as its tab reaches the lens
    transform: [{ translateY: interpolate(away.value, [0, 0.6], [0, 4], Extrapolation.CLAMP) }],
  }));

  const iconColor = selected ? accent : COLOR.dim;

  // a plain Pressable inside a pan gesture eats the drag, so the tap is a
  // gesture too and can be told to wait for the pan to fail
  const tap = Gesture.Tap()
    .maxDistance(10)
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
        style={[styles.detent, itemStyle]}
      >
        <Ionicons name={icon} size={20} color={iconColor} />
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
  lensLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lens: {
    width: ITEM - 6,
    height: 46,
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  track: {
    height: CHROME.tabBarHeight,
    borderRadius: CHROME.tabBarHeight / 2,
    // nothing may render past the pill's edge
    overflow: 'hidden',
    justifyContent: 'center',
  },
  strip: { flexDirection: 'row', alignItems: 'center' },
  detent: { width: ITEM, height: 46, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { ...TYPE.dataLabel, fontSize: 10, letterSpacing: 0.8 },
});
