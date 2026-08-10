import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { statusColor } from './StatusOrb';

export function Reticle({ size, status }: { size: number; status: string }) {
  const spin = useSharedValue(0);
  const counter = useSharedValue(0);
  const color = statusColor(status);

  useEffect(() => {
    spin.value = withRepeat(withTiming(360, { duration: 14000, easing: Easing.linear }), -1, false);
    counter.value = withRepeat(withTiming(-360, { duration: 22000, easing: Easing.linear }), -1, false);
  }, [spin, counter]);

  const outer = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const inner = useAnimatedStyle(() => ({ transform: [{ rotate: `${counter.value}deg` }] }));

  const c = size / 2;
  const dash = (r: number, on: number, off: number) => ({
    cx: c,
    cy: c,
    r,
    stroke: color,
    strokeWidth: 1,
    fill: 'none',
    strokeDasharray: `${on} ${off}`,
  });

  return (
    <View testID="reticle" style={[styles.wrap, { width: size, height: size }]}>
      <Animated.View style={[StyleSheet.absoluteFill, outer]}>
        <Svg width={size} height={size}>
          <Circle {...dash(c * 0.94, 24, 10)} opacity={0.7} />
          <G opacity={0.45}>
            <Line x1={c} y1={2} x2={c} y2={12} stroke={color} strokeWidth={1} />
            <Line x1={c} y1={size - 12} x2={c} y2={size - 2} stroke={color} strokeWidth={1} />
          </G>
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, inner]}>
        <Svg width={size} height={size}>
          <Circle {...dash(c * 0.74, 6, 14)} opacity={0.5} />
          <Circle cx={c} cy={c} r={c * 0.56} stroke={color} strokeWidth={0.5} fill="none" opacity={0.25} />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
