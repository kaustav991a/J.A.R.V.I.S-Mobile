import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { COLOR, RADIUS, SPACE } from '../../theme/tokens';
import { useAppearance } from '../../theme/appearance';
import { haptic } from '../../lib/haptics';

export type SliderProps = {
  /** 0–1 */
  value: number;
  onChange: (value: number) => void;
  testID?: string;
};

const TRACK = 4;
const THUMB = 22;

/**
 * A slider drawn from views, not native code.
 *
 * `@react-native-community/slider` is the only third-party native module this
 * app ever pulled in, and Expo Go does not bundle it — importing it there took
 * the whole app down at launch while the compiled APK was fine. Gesture handler
 * and reanimated are both in Expo Go, so this costs nothing and keeps the
 * project runnable in both.
 */
export function Slider({ value, onChange, testID }: SliderProps) {
  const { accent } = useAppearance();
  const [width, setWidth] = useState(0);
  const start = useSharedValue(0);
  const at = useSharedValue(value);

  // follow the prop while the finger is off it
  if (!start.value && at.value !== value) at.value = value;

  const commit = (v: number) => {
    onChange(Math.round(v * 100) / 100);
  };

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      start.value = 1;
      if (width > 0) {
        at.value = Math.min(Math.max(e.x / width, 0), 1);
        runOnJS(commit)(at.value);
        runOnJS(haptic.tap)();
      }
    })
    .onUpdate((e) => {
      if (width <= 0) return;
      at.value = Math.min(Math.max(e.x / width, 0), 1);
      runOnJS(commit)(at.value);
    })
    .onFinalize(() => {
      start.value = 0;
    });

  const fillStyle = useAnimatedStyle(() => ({ width: at.value * width }));
  const thumbStyle = useAnimatedStyle(() => ({ left: at.value * width - THUMB / 2 }));

  return (
    <GestureDetector gesture={pan}>
      <View
        testID={testID}
        accessibilityRole="adjustable"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
        style={styles.hit}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        <View style={styles.track}>
          <Animated.View style={[styles.fill, { backgroundColor: accent }, fillStyle]} />
        </View>
        <Animated.View style={[styles.thumb, { borderColor: accent }, thumbStyle]} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  hit: { height: 40, justifyContent: 'center', paddingVertical: SPACE.sm },
  track: { height: TRACK, borderRadius: RADIUS.pill, backgroundColor: COLOR.blueDim, overflow: 'hidden' },
  fill: { height: TRACK, borderRadius: RADIUS.pill },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: RADIUS.pill,
    borderWidth: 2,
    backgroundColor: COLOR.bg,
  },
});
