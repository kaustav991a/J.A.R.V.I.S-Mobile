import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { HUD_BEZIER } from '../theme/tokens';

/** mirrors the desk HUD's ScanlineTransition.jsx sweep */
export function Scanline({ height }: { height: number }) {
  const y = useSharedValue(-40);

  useEffect(() => {
    y.value = withRepeat(
      withTiming(height, { duration: 5200, easing: Easing.bezier(HUD_BEZIER[0], HUD_BEZIER[1], HUD_BEZIER[2], HUD_BEZIER[3]) }),
      -1,
      false
    );
  }, [height, y]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, style]}>
      <LinearGradient
        colors={['rgba(0,255,204,0)', 'rgba(0,255,204,0.10)', 'rgba(0,255,204,0)']}
        style={styles.bar}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, top: 0, height: 40 },
  bar: { flex: 1 },
});
