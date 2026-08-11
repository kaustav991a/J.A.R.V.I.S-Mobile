import { PropsWithChildren, RefObject, createContext, useContext, useRef } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { RADIUS } from '../../theme/tokens';

/**
 * Real blur is iOS only, and that is settled rather than pending.
 *
 * Android's `BlurView` blurs nothing unless it is given a `BlurTargetView` to
 * sample — and mounting that view takes the process down natively: no JS error,
 * no red screen, nothing an error boundary can catch. It was proven on a
 * running dev build by putting the target back (died on reload), removing it
 * (lived), then rendering a targetless `BlurView` (lived, and blurred nothing).
 *
 * So Android gets a tint heavy enough to read as smoked glass on this palette.
 * Do not reintroduce `BlurTargetView` without testing it on a dev build first —
 * an APK gives no diagnosis, which is what made this cost a day.
 */
const IOS = Platform.OS === 'ios';

const BlurTargetContext = createContext<RefObject<View | null> | null>(null);

/**
 * Kept as the seam for the day Android blur is worth another attempt: it hands
 * down a ref that nothing currently mounts a target for.
 */
export function BlurTargetProvider({ children }: PropsWithChildren) {
  const ref = useRef<View | null>(null);
  return (
    <BlurTargetContext.Provider value={ref}>
      <View style={styles.fill}>{children}</View>
    </BlurTargetContext.Provider>
  );
}

export const useBlurTarget = (): RefObject<View | null> | null => useContext(BlurTargetContext);

export type GlassProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  radius?: number;
  /** 0–100, iOS only */
  intensity?: number;
  /** the wash; on Android it is the whole effect, so it defaults heavier */
  tint?: string;
  /** a one-pixel highlight along the top edge, the way glass catches light */
  sheen?: boolean;
  testID?: string;
}>;

/**
 * A frosted surface: blur where the platform can, a tint over it, a hairline
 * round it.
 *
 * Worth using where something moves behind the surface — a bar over a scrolling
 * list, a sheet over the canvas. Not worth it on a card sitting on a flat
 * gradient, which is why it is not the background for everything.
 */
export function Glass({ children, style, radius = RADIUS.lg, intensity, tint, sheen = true, testID }: GlassProps) {
  const wash = tint ?? (IOS ? 'rgba(8,20,44,0.45)' : 'rgba(7,18,40,0.88)');

  return (
    <View testID={testID} style={[{ borderRadius: radius }, styles.clip, style]}>
      {IOS ? (
        // the chrome material is what iOS uses for its own bars
        <BlurView style={StyleSheet.absoluteFill} tint="systemChromeMaterialDark" intensity={intensity ?? 60} />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: wash }]} />
      {sheen ? <View style={styles.sheen} /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  clip: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(150,196,255,0.20)',
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(160,205,255,0.22)',
  },
});
