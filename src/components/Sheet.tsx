import { PropsWithChildren, useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { COLOR, SPACE } from '../theme/tokens';

export type SheetProps = PropsWithChildren<{
  /** height of the sheet when fully open */
  expandedHeight: number;
  /** how much of the sheet stays visible when closed — the grab handle strip */
  collapsedHeight?: number;
  /** notified on every settled open/closed change, for chrome that reacts to it */
  onToggle?: (open: boolean) => void;
}>;

const SPRING = { damping: 18, stiffness: 180, mass: 0.6 } as const;
/** drag past this share of the travel, or flick faster than FLICK, and it commits */
const COMMIT = 0.3;
const FLICK = 600;

/**
 * A drag-up sheet holding everything that is not the reactor. Closed, it is a
 * single grab handle; open, it covers most of the canvas and scrolls.
 *
 * The pan lives on the handle only. Putting it on the whole sheet would fight
 * the inner ScrollView for the same vertical gesture.
 *
 * Openness is React state, not a read of the shared value: the shared value is
 * mid-spring for most of a transition, so reading it to decide the next target
 * makes rapid taps flip the wrong way.
 */
export function Sheet({ expandedHeight, collapsedHeight = 28, onToggle, children }: SheetProps) {
  const travel = Math.max(0, expandedHeight - collapsedHeight);
  const [open, setOpen] = useState(false);
  const y = useSharedValue(travel); // starts closed
  const startY = useSharedValue(travel);

  const commit = useCallback(
    (next: boolean) => {
      setOpen(next);
      onToggle?.(next);
    },
    [onToggle]
  );

  const settle = (next: boolean) => {
    y.value = withSpring(next ? 0 : travel, SPRING);
    commit(next);
  };

  const pan = Gesture.Pan()
    .onStart(() => {
      startY.value = y.value;
    })
    .onUpdate((e) => {
      y.value = Math.min(travel, Math.max(0, startY.value + e.translationY));
    })
    .onEnd((e) => {
      const wasOpen = startY.value === 0;
      const moved = Math.abs(y.value - startY.value);
      let next = wasOpen;
      if (e.velocityY < -FLICK) next = true;
      else if (e.velocityY > FLICK) next = false;
      else if (moved > travel * COMMIT) next = !wasOpen;
      y.value = withSpring(next ? 0 : travel, SPRING);
      runOnJS(commit)(next);
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  return (
    <Animated.View
      testID="sheet"
      style={[styles.sheet, { height: expandedHeight }, sheetStyle]}
      pointerEvents="box-none"
    >
      <GestureDetector gesture={pan}>
        <Pressable
          testID="sheet-handle"
          accessibilityRole="button"
          accessibilityLabel={open ? 'Hide details' : 'Show details'}
          onPress={() => settle(!open)}
          style={styles.handleZone}
        >
          <View style={styles.handle} />
        </Pressable>
      </GestureDetector>

      <ScrollView
        testID="sheet-body"
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    backgroundColor: COLOR.panel,
    overflow: 'hidden',
  },
  handleZone: { alignItems: 'center', paddingTop: SPACE.sm, paddingBottom: SPACE.sm },
  handle: { width: 44, height: 4, borderRadius: 999, backgroundColor: COLOR.blue, opacity: 0.5 },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.xl },
});
