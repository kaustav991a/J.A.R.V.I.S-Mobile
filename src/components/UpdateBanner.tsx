import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { COLOR, RADIUS, SPACE, TYPE } from '../theme/tokens';
import { useAppearance } from '../theme/appearance';

/**
 * "An update is ready" — said where he is, not where he would have to go looking.
 *
 * `checkAutomatically` fetches a new bundle in the background and applies it at
 * the NEXT launch, silently. So an update could arrive, sit waiting, and leave
 * no trace anywhere in the app: reported from the device as getting the update
 * with "no prompt or something". A change that has happened and says nothing is
 * indistinguishable from one that has not, which is the shape this project keeps
 * paying for.
 *
 * Dismissible, because it is not urgent. Nothing is broken while it waits — the
 * new version simply is not running yet — and a bar that cannot be got rid of
 * would be worse than the silence it replaces. Dismissing is for this session
 * only: the update is still pending on the next launch, and so is this.
 */
export function UpdateBanner() {
  const { isUpdatePending } = Updates.useUpdates();

  /**
   * Check on every return, not only at a cold launch.
   *
   * `checkAutomatically: ON_LOAD` fires once, when the process starts. On a
   * phone that keeps this app resident for days that is almost never — so an
   * update published in the afternoon would wait for a reboot to be noticed,
   * and "reopen it twice" became the way to get anything.
   *
   * There is no background check available: `expo-updates` cannot run while the
   * app is closed and nothing can push it awake. Coming back to the app is the
   * next best moment, and it costs one small request.
   */
  useEffect(() => {
    if (!Updates.isEnabled) return;
    const look = () => {
      void Updates.checkForUpdateAsync()
        .then((found) => (found.isAvailable ? Updates.fetchUpdateAsync() : null))
        // silent: a failed check is not worth interrupting anyone over, and the
        // Updates screen says so plainly when he goes looking
        .catch(() => undefined);
    };
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') look();
    });
    return () => sub.remove();
  }, []);
  const { accent } = useAppearance();
  const insets = useSafeAreaInsets();
  const [dismissed, setDismissed] = useState(false);
  const [restarting, setRestarting] = useState(false);

  if (!isUpdatePending || dismissed) return null;

  const restart = () => {
    setRestarting(true);
    // does not return: the app relaunches on the new bundle
    void Updates.reloadAsync().catch(() => setRestarting(false));
  };

  return (
    <View testID="update-banner" style={[styles.wrap, { top: insets.top + SPACE.sm }]}>
      <View style={[styles.card, { borderColor: `${accent}55` }]}>
        <View style={styles.words}>
          <Text style={styles.title}>Update ready</Text>
          <Text style={styles.body}>Downloaded. Restarting applies it.</Text>
        </View>
        <Pressable
          testID="update-banner-restart"
          onPress={restart}
          disabled={restarting}
          hitSlop={8}
          style={[styles.action, { backgroundColor: accent }]}
        >
          <Text style={styles.actionText}>{restarting ? '…' : 'RESTART'}</Text>
        </Pressable>
        <Pressable testID="update-banner-dismiss" onPress={() => setDismissed(true)} hitSlop={10}>
          <Text style={styles.dismiss}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // absolute so it floats over whatever tab is showing rather than pushing the
  // layout down and reflowing every screen underneath it
  wrap: { position: 'absolute', left: SPACE.md, right: SPACE.md, zIndex: 40 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: COLOR.panel,
  },
  words: { flex: 1 },
  title: { ...TYPE.dataLabel, color: COLOR.white, letterSpacing: 0.4 },
  body: { ...TYPE.dataLabel, color: COLOR.dim, marginTop: 1 },
  action: { paddingVertical: 6, paddingHorizontal: SPACE.sm, borderRadius: RADIUS.sm },
  actionText: { ...TYPE.dataLabel, color: COLOR.bg, letterSpacing: 0.6 },
  dismiss: { ...TYPE.dataLabel, color: COLOR.dim, paddingHorizontal: 2 },
});
