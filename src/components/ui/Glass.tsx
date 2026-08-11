import { PropsWithChildren, RefObject, createContext, useContext, useRef } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { RADIUS } from '../../theme/tokens';

/**
 * Real blur is iOS only, for now.
 *
 * Android's blur needs a `BlurTargetView` ancestor and samples it every frame
 * per surface. Wrapping the whole app in one and hanging four blurs off it is
 * what the app started exiting on — silently, with no JS error, which is the
 * signature of a native crash no error boundary can catch. Expo Go fell over on
 * the same view.
 *
 * Until that is diagnosed against a device log, Android gets the tint alone.
 * On this palette the difference is slight; a crash is not.
 */
const REAL_BLUR = Platform.OS === 'ios';

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
  // no BlurTargetView: nothing samples it while Android blur is off
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
  // without a blur behind it the tint has to carry the surface on its own
  tint = REAL_BLUR ? 'rgba(8,20,44,0.45)' : 'rgba(7,18,40,0.88)',
  sheen = true,
  testID,
}: GlassProps) {
  const target = useBlurTarget();
  const strength = intensity ?? (Platform.OS === 'android' ? 72 : 60);

  return (
    <View testID={testID} style={[{ borderRadius: radius }, styles.clip, style]}>
      {REAL_BLUR ? (
        <BlurView
          style={StyleSheet.absoluteFill}
          // the chrome material is what iOS uses for its own bars
          tint="systemChromeMaterialDark"
          intensity={strength}
        />
      ) : null}
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
