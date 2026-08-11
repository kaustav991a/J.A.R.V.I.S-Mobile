import { PropsWithChildren, useContext } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { HeaderHeightContext } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CHROME, COLOR, RADIUS, SCRIM, SPACE, TYPE } from '../../theme/tokens';
import { useAppearance } from '../../theme/appearance';

export type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  testID?: string;
  /** shows the pull-to-refresh spinner and wires the gesture */
  refreshing?: boolean;
  onRefresh?: () => void;
}>;

/**
 * The canvas every screen sits on: one edge-to-edge navy gradient that runs
 * behind the status bar and under the floating tab bar.
 *
 * Both chrome pieces float, so neither takes space in the layout and the
 * content has to clear them itself. `HeaderHeightContext` is read rather than
 * `useHeaderHeight()` because it returns `undefined` instead of throwing when
 * a screen is rendered bare in a test.
 */
export function Screen({ children, scroll = true, testID, refreshing, onRefresh }: ScreenProps) {
  const headerHeight = useContext(HeaderHeightContext);
  const insets = useSafeAreaInsets();
  const { accent, animations } = useAppearance();
  const pad = {
    // a screen with `headerShown: false` still gets the context, reporting 0 —
    // taking the larger of the two is what keeps Home's own top row out from
    // under the status bar
    paddingTop: Math.max(headerHeight ?? 0, insets.top) + SPACE.md,
    paddingBottom: CHROME.tabBarHeight + Math.max(insets.bottom, CHROME.tabBarGap) + SPACE.lg,
  };

  return (
    <View style={styles.screen} testID={testID}>
      <LinearGradient colors={[...SCRIM]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight ?? 0}
      >
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.scrollBody, pad]}
            showsVerticalScrollIndicator={false}
            // without this a tap that lands while the keyboard is open is spent
            // dismissing it, and the button under the finger never fires
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  refreshing={refreshing ?? false}
                  onRefresh={onRefresh}
                  tintColor={accent}
                  colors={[accent]}
                  progressBackgroundColor={COLOR.bg}
                  progressViewOffset={pad.paddingTop}
                />
              ) : undefined
            }
          >
            {/* no entrance animation: content that slides or springs in on every
                screen change reads as lag, and it fights the scroll position */}
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.body, pad]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

/** A quiet inline note — the voice for "this exists but cannot act yet". */
export function Hint({ children, testID }: PropsWithChildren<{ testID?: string }>) {
  return (
    <Text testID={testID} style={styles.hint}>
      {children}
    </Text>
  );
}

/** Uppercase group heading, e.g. THEME / ACCENT COLOR / ACTIONS. */
export function SectionLabel({ children }: PropsWithChildren) {
  return <Text style={styles.section}>{String(children).toUpperCase()}</Text>;
}

export function Badge({
  label,
  tint = COLOR.green,
  testID,
  align = 'center',
}: {
  label: string;
  tint?: string;
  testID?: string;
  /** 'center' for a hero badge, 'start' for one sitting in a row */
  align?: 'center' | 'start';
}) {
  return (
    <View
      testID={testID}
      style={[styles.badge, { borderColor: tint, backgroundColor: `${tint}14` }, align === 'start' && styles.badgeLeft]}
    >
      <Text style={[styles.badgeText, { color: tint }]}>{label}</Text>
    </View>
  );
}

/** The terminal-style output card used for command results. */
export function MonoCard({ text, testID }: { text: string; testID?: string }) {
  return (
    <View style={styles.mono}>
      <Text testID={testID} style={styles.monoText}>
        {text}
      </Text>
    </View>
  );
}

/**
 * An empty screen is an invitation, not a shrug: it says what belongs here and
 * what to do about it. `text` is the invitation; `hint` is the how.
 */
export function EmptyState({ text, hint, testID }: { text: string; hint?: string; testID?: string }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyRing} />
      <Text testID={testID} style={styles.empty}>
        {text}
      </Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.bg },
  fill: { flex: 1 },
  body: { flex: 1, paddingHorizontal: SPACE.lg },
  scrollBody: { paddingHorizontal: SPACE.lg },
  section: { ...TYPE.dataLabel, color: COLOR.dim, letterSpacing: 1.5, marginBottom: SPACE.sm, marginTop: SPACE.lg },
  badge: {
    alignSelf: 'center',
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACE.md,
    paddingVertical: 3,
  },
  badgeLeft: { alignSelf: 'flex-start' },
  badgeText: { ...TYPE.dataLabel, fontSize: 11 },
  mono: {
    backgroundColor: 'rgba(4,14,32,0.9)',
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    padding: SPACE.lg,
  },
  monoText: { ...TYPE.meta, fontSize: 12, lineHeight: 19, color: COLOR.green },
  emptyWrap: { alignItems: 'center', paddingVertical: SPACE.xl },
  /** a dark reactor with no light in it — the app's own idiom for "nothing" */
  emptyRing: {
    width: 46,
    height: 46,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLOR.line,
    marginBottom: SPACE.md,
  },
  empty: { ...TYPE.dataValue, fontSize: 13, color: COLOR.white, textAlign: 'center' },
  emptyHint: { ...TYPE.meta, fontSize: 12, color: COLOR.dim, textAlign: 'center', marginTop: SPACE.xs },
  hint: { ...TYPE.meta, fontSize: 11, color: COLOR.dim, opacity: 0.8, textAlign: 'center', marginTop: SPACE.md },
});
