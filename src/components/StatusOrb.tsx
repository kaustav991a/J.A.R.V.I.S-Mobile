import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { COLOR, HUD_BEZIER, glowBox } from '../theme/tokens';

const CYAN = ['online', 'listening', 'idle', 'ready'];
const GOLD = ['thinking', 'agent', 'agent_step', 'parked', 'working'];
const RED = ['alert', 'lockdown', 'error', 'security'];
const GREEN = ['speaking', 'done', 'confirmed'];

export function statusColor(status: string): string {
  if (CYAN.includes(status)) return COLOR.cyan;
  if (GOLD.includes(status)) return COLOR.gold;
  if (RED.includes(status)) return COLOR.red;
  if (GREEN.includes(status)) return COLOR.green;
  return COLOR.dim;
}

/**
 * The luminous status circles only — no label. The status word collides
 * with the Reticle's outer ring when the orb sits centred inside it, so the
 * caller (PreviewScreen / HudScreen) renders the tracked label line itself.
 */
export function StatusOrb({ status, size = 96 }: { status: string; size?: number }) {
  const color = statusColor(status);
  const pulse = useSharedValue(0.55);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.bezier(HUD_BEZIER[0], HUD_BEZIER[1], HUD_BEZIER[2], HUD_BEZIER[3]) }),
      -1,
      true
    );
  }, [pulse, status]);

  const glow = useAnimatedStyle(() => ({ opacity: pulse.value, transform: [{ scale: 0.9 + pulse.value * 0.12 }] }));

  const r = size / 2;
  return (
    <View style={[styles.wrap, { width: size, height: size }]} testID="status-orb">
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, glow, glowBox(color)]}>
        <Svg width={size} height={size}>
          <Circle testID="status-orb-halo" cx={r} cy={r} r={r * 0.62} fill={color} opacity={0.18} />
          <Circle testID="status-orb-ring" cx={r} cy={r} r={r * 0.34} fill={color} opacity={0.55} />
        </Svg>
      </Animated.View>
      <Svg width={size} height={size}>
        <Circle testID="status-orb-core" cx={r} cy={r} r={r * 0.2} fill={color} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
