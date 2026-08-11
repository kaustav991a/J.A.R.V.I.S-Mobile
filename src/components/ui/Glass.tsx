import { PropsWithChildren, RefObject, createContext, useContext, useRef } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { BlurTargetView, BlurView } from 'expo-blur';
import { RADIUS } from '../../theme/tokens';

/**
 * Expo Go ships one fixed set of native views, and a view it does not have
 * cannot be caught by an error boundary — it takes the process down with no JS
 * error at all, which is exactly how this app was dying there while the
 * compiled build was fine. So in Expo Go the blur target is never mounted and
 * the glass falls back to its tint, which is the whole point of having a tint.
 */
const IN_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const BlurTargetContext = createContext<RefObject<View | null> | null>(null);

/**
 * Owns the one view Android's blur samples.
 *
 * iOS blurs whatever happens to be behind a `BlurView`; Android has to be told
 * what to sample, and that target must be an ancestor of everything the glass
 * should see. One provider at the root is the only arrangement that lets any
 * surface anywhere in the app be glass.
 */
export function BlurTargetProvider({ children }: PropsWithChildren) {
  const ref = useRef<View | null>(null);
  if (IN_EXPO_GO) return <View style={styles.fill}>{children}</View>;
  return (
    <BlurTargetContext.Provider value={ref}>
      <BlurTargetView ref={ref} style={styles.fill}>
        {children}
      </BlurTargetView>
    </BlurTargetContext.Provider>
  );
}

export const useBlurTarget = (): RefObject<View | null> | null => useContext(BlurTargetContext);

export type GlassProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  radius?: number;
  /** 0–100; the Android figure is raised because its blur reads weaker */
  intensity?: number;
  /** the wash over the blur — glass needs a tint or it is just a smear */
  tint?: string;
  /** a one-pixel highlight along the top edge, the way glass catches light */
  sheen?: boolean;
  testID?: string;
}>;

/**
 * A frosted surface: blur, a tint over it, a hairline round it.
 *
 * Worth using where something moves behind the surface — a bar over a scrolling
 * list, a sheet over the canvas. Not worth it on a card sitting on a flat
 * gradient: the blur costs a full-screen sample per frame on Android and buys
 * no depth when what it samples does not change.
 */
export function Glass({
  children,
  style,
  radius = RADIUS.lg,
  intensity,
  tint = 'rgba(8,20,44,0.45)',
  sheen = true,
  testID,
}: GlassProps) {
  const target = useBlurTarget();
  const strength = intensity ?? (Platform.OS === 'android' ? 72 : 60);

  return (
    <View testID={testID} style={[{ borderRadius: radius }, styles.clip, style]}>
      <BlurView
        style={StyleSheet.absoluteFill}
        // the chrome material is what iOS uses for its own bars
        tint={Platform.OS === 'ios' ? 'systemChromeMaterialDark' : 'dark'}
        intensity={strength}
        // Android's blur needs a target it cannot have in Expo Go
        blurMethod={IN_EXPO_GO ? 'none' : 'dimezisBlurViewSdk31Plus'}
        blurTarget={target ?? undefined}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
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
