import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { CHROME, COLOR, MOTION, RADIUS, SPACE, TYPE } from '../../theme/tokens';
import { useAppearance } from '../../theme/appearance';
import { haptic } from '../../lib/haptics';

export type ToastTone = 'info' | 'good' | 'bad';

type Toast = { text: string; tone: ToastTone };

type ToastApi = { show: (text: string, tone?: ToastTone) => void };

const ToastContext = createContext<ToastApi | null>(null);

const HOLD_MS = 2200;

/**
 * Confirmation for actions whose result lands somewhere else — running a
 * script, sending a command over a dead link. Without it those buttons do
 * nothing observable and read as broken.
 */
export function ToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string, tone: ToastTone = 'info') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ text, tone });
    // one place decides how an outcome feels, so a success can never buzz like
    // a failure somewhere else in the app
    if (tone === 'good') haptic.good();
    else if (tone === 'bad') haptic.bad();
    timer.current = setTimeout(() => setToast(null), HOLD_MS);
  }, []);

  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastBar toast={toast} />
    </ToastContext.Provider>
  );
}

function ToastBar({ toast }: { toast: Toast | null }) {
  const insets = useSafeAreaInsets();
  const { accent, animations } = useAppearance();
  const shown = useSharedValue(0);

  useEffect(() => {
    const to = toast ? 1 : 0;
    shown.value = animations ? withTiming(to, { duration: MOTION.settle }) : to;
  }, [toast, animations, shown]);

  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * 16 }],
  }));

  if (!toast) return null;

  const tint = toast.tone === 'good' ? COLOR.green : toast.tone === 'bad' ? COLOR.red : accent;
  const bottom = CHROME.tabBarHeight + Math.max(insets.bottom, CHROME.tabBarGap) + SPACE.md;

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { bottom }, style]}>
      <View testID="toast" style={[styles.bar, { borderColor: tint }]}>
        <View style={[styles.dot, { backgroundColor: tint }]} />
        <Text testID="toast-text" style={styles.text}>
          {toast.text}
        </Text>
      </View>
    </Animated.View>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  // a component rendered bare in a test should not have to stand one up
  return ctx ?? { show: () => {} };
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: CHROME.tabBarSide, right: CHROME.tabBarSide, alignItems: 'center' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    backgroundColor: 'rgba(6,16,36,0.96)',
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm + 2,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { ...TYPE.meta, fontSize: 12, color: COLOR.white },
});
