import { PropsWithChildren, ReactNode, RefObject, createContext, useContext, useRef } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { AnimatedStyle } from 'react-native-reanimated';
import { BlurTargetView, BlurView } from 'expo-blur';
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

/**
 * Android blur. **Leave this false.** The reason is now known, and it is not a
 * version or a method problem — it is the shape of the tree.
 *
 * Enabled, the app segfaults about a second after first paint. Captured from a
 * dev build over adb on 2026-08-12 (Xiaomi chenfeng, Android 16, arm64):
 *
 *     F libc: Fatal signal 11 (SIGSEGV), code 2 (SEGV_ACCERR)
 *             in tid 28630 (RenderThread)
 *     Cause: stack pointer is close to top of stack; likely stack overflow.
 *     512 total frames
 *     #00..#511  /system/lib64/libhwui.so
 *                android::uirenderer::computeTransformImpl(DirtyStack const*, Matrix4*)
 *
 * 512 identical frames: HWUI's transform walk recursing until the RenderThread's
 * stack is gone. `BlurTargetView` wraps the whole app, and the `BlurView` that
 * samples it sits *inside* that subtree, so the render-node graph has a cycle —
 * the target contains a view whose content is the target. Walking the parent
 * chain never terminates.
 *
 * `blurMethod: 'dimezisBlurViewSdk31Plus'` was tried and changed nothing,
 * because RenderScript was never involved.
 *
 * **What would actually work:** the `BlurView` must not be a descendant of the
 * `BlurTargetView`. The target has to wrap only the content being blurred, with
 * the blurring surface as a sibling outside it. That is awkward for the tab bar
 * specifically — React Navigation renders the custom `tabBar` inside the same
 * navigator as the scenes, which is why the target ended up around everything.
 * It is straightforward for a surface that is already a sibling of its content:
 * the chat composer over its list, or the Activity sheet.
 *
 * A segfault on the RenderThread is why nothing caught this: no JS error, no red
 * box, nothing an ErrorBoundary sees. The kernel takes the process. Only a dev
 * build plus `adb logcat` shows it, which is why it once cost a day.
 */
const TRY_ANDROID_BLUR = false;

/** real blur is being attempted on this platform */
const ANDROID_BLUR = !IOS && TRY_ANDROID_BLUR;
const BLURRING = IOS || ANDROID_BLUR;

const BlurTargetContext = createContext<RefObject<View | null> | null>(null);

/**
 * Kept as the seam for the day Android blur is worth another attempt: it hands
 * down a ref that nothing currently mounts a target for.
 */
export function BlurTargetProvider({ children }: PropsWithChildren) {
  const ref = useRef<View | null>(null);
  return (
    <BlurTargetContext.Provider value={ref}>
      {ANDROID_BLUR ? (
        // whatever a BlurView samples has to live inside this — so it wraps the
        // whole app, and the floating tab bar blurs the screen behind it
        <BlurTargetView ref={ref} style={styles.fill}>
          {children}
        </BlurTargetView>
      ) : (
        <View style={styles.fill}>{children}</View>
      )}
    </BlurTargetContext.Provider>
  );
}

export const useBlurTarget = (): RefObject<View | null> | null => useContext(BlurTargetContext);

/**
 * Real Android blur, in the one arrangement that cannot recurse.
 *
 * The crash above happens because the `BlurView` samples a target it lives
 * inside — the target contains a view whose content is the target, and HWUI's
 * transform walk never terminates. The fix is structural, not a setting: the
 * target wraps *only* the content being blurred, and the blurring surface is a
 * **sibling** of it that still receives its ref.
 *
 * So this takes two slots rather than children. `content` goes inside the target;
 * `surface` goes outside it, with the context pointing at the target so any
 * `Glass` inside `surface` can sample it. A chat composer over its list is
 * exactly this shape already, which is why it is the first place worth trying.
 *
 * Off by default, and deliberately: the failure mode is a segfault on the
 * RenderThread — no JS error, nothing an ErrorBoundary sees, the kernel simply
 * takes the process. Flipping `TRY_SCOPED_ANDROID_BLUR` needs a device and
 * `adb logcat`, watching for `F DEBUG` frames in `libhwui.so`, not a jest run.
 */
const TRY_SCOPED_ANDROID_BLUR = false;
const SCOPED_ANDROID_BLUR = !IOS && TRY_SCOPED_ANDROID_BLUR;

export function BlurBehind({
  content,
  surface,
  style,
}: {
  content: ReactNode;
  surface: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const ref = useRef<View | null>(null);

  // iOS blurs without a target at all, and Android with the flag off is the
  // smoked-glass tint — either way this is a plain pair of siblings
  if (!SCOPED_ANDROID_BLUR) {
    return (
      <View style={[styles.fill, style]}>
        {content}
        {surface}
      </View>
    );
  }

  return (
    <View style={[styles.fill, style]}>
      <BlurTargetView ref={ref} style={styles.fill}>
        {content}
      </BlurTargetView>
      {/* outside the target, pointed at it: this is the whole point */}
      <BlurTargetContext.Provider value={ref}>{surface}</BlurTargetContext.Provider>
    </View>
  );
}

export type GlassProps = PropsWithChildren<{
  /**
   * Accepts plain and reanimated styles, and arrays mixing the two — the chat
   * composer passes `[styles.composer, animatedPadding]`.
   */
  style?: StyleProp<AnimatedStyle<ViewStyle>>;
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
  const target = useBlurTarget();
  // With no blur behind it the wash *is* the effect, so it has to be heavy enough
  // to stop a scrolling list reading through the bar. Once something is actually
  // being blurred it only has to tint.
  const wash = tint ?? (BLURRING ? 'rgba(8,20,44,0.45)' : 'rgba(7,18,40,0.92)');

  return (
    // Animated.View, not View: the chat composer animates its own padding as the
    // keyboard opens, and that padding has to sit *inside* the glass or the
    // frosted panel stops short and leaves a gap over the keyboard. Plain styles
    // pass through unchanged, so every other caller is unaffected.
    <Animated.View testID={testID} style={[{ borderRadius: radius }, styles.clip, style]}>
      {BLURRING ? (
        // the chrome material is what iOS uses for its own bars
        <BlurView
          style={StyleSheet.absoluteFill}
          tint="systemChromeMaterialDark"
          intensity={intensity ?? 60}
          // Android only, and both are required together: a BlurView with no
          // target blurs nothing, and the default method falls back to
          // RenderScript on older devices. Ignored on iOS.
          {...(ANDROID_BLUR ? { blurTarget: target ?? undefined, blurMethod: 'dimezisBlurViewSdk31Plus' as const } : {})}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: wash }]} />
      {sheen ? <View style={styles.sheen} /> : null}
      {children}
    </Animated.View>
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
