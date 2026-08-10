import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { COLOR, HUD_BEZIER } from '../theme/tokens';

const BAND_HEIGHT = 120;
const SWEEP_DURATION_MS = 9000;

/** mirrors the desk HUD's ScanlineTransition.jsx sweep */
export function Scanline({ height }: { height: number }) {
  const y = useSharedValue(-BAND_HEIGHT);

  useEffect(() => {
    y.value = withRepeat(
      withTiming(height, {
        duration: SWEEP_DURATION_MS,
        easing: Easing.bezier(HUD_BEZIER[0], HUD_BEZIER[1], HUD_BEZIER[2], HUD_BEZIER[3]),
      }),
      -1,
      false
    );
  }, [height, y]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, style]}>
      <LinearGradient colors={[COLOR.cyanNone, COLOR.cyanGlow, COLOR.cyanNone]} style={styles.bar} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, top: 0, height: BAND_HEIGHT },
  bar: { flex: 1 },
});
