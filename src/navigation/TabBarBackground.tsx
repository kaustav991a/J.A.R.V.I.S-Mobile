import type { RefObject } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { COLOR, CHROME } from '../theme/tokens';

/**
 * The frosted pane behind the floating tab bar.
 *
 * Android does not blur the window for free the way iOS does: `BlurView` there
 * samples a `BlurTargetView` and needs a ref to it, which is why the navigator
 * wraps the whole app in one and hands the ref down. If that blur is a no-op
 * (Android < 31, or an emulator without the GPU path) the tint layer below
 * still reads as smoked glass rather than as a hole in the canvas.
 */
export function TabBarBackground({ target }: { target: RefObject<View | null> }) {
  return (
    <View style={styles.clip}>
      <BlurView
        testID="tab-bar-blur"
        style={StyleSheet.absoluteFill}
        // the iOS chrome material is the one the system uses for its own bars
        tint={Platform.OS === 'ios' ? 'systemChromeMaterialDark' : 'dark'}
        intensity={Platform.OS === 'android' ? 72 : 60}
        blurMethod="dimezisBlurViewSdk31Plus"
        blurTarget={target}
      />
      <View style={styles.tint} />
      <View style={styles.sheen} />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // a true pill, as the reference sets it — half the bar's height
    borderRadius: CHROME.tabBarHeight / 2,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(150,196,255,0.20)',
  },
  tint: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,20,44,0.45)' },
  /** a one-pixel highlight along the top edge, the way glass catches light */
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(160,205,255,0.22)',
  },
});
