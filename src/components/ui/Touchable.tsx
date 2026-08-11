import { PropsWithChildren } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { MOTION } from '../../theme/tokens';
import { useAppearance } from '../../theme/appearance';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type TouchableProps = PropsWithChildren<
  Omit<PressableProps, 'style'> & {
    style?: StyleProp<ViewStyle>;
    /** how far it sinks under the finger; 0 disables the scale */
    sink?: number;
  }
>;

/**
 * One press language for the whole app.
 *
 * Before this each surface picked its own `pressed && { opacity: 0.7 | 0.75 }`,
 * which is a different feel per screen and no feel at all on a fast tap — the
 * frame is gone before the eye catches it. A held scale plus a dip reads on
 * both. It honours the animations toggle, which is also the reduced-motion
 * switch.
 */
export function Touchable({ children, style, sink = 0.02, disabled, ...rest }: TouchableProps) {
  const { animations } = useAppearance();
  const down = useSharedValue(0);

  const pressStyle = useAnimatedStyle(() => ({
    opacity: 1 - down.value * 0.25,
    transform: [{ scale: 1 - down.value * sink }],
  }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        down.value = animations ? withTiming(1, { duration: MOTION.press }) : 1;
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        down.value = animations ? withTiming(0, { duration: MOTION.settle }) : 0;
        rest.onPressOut?.(e);
      }}
      style={[style, pressStyle, disabled ? { opacity: 0.4 } : null]}
    >
      {children}
    </AnimatedPressable>
  );
}
