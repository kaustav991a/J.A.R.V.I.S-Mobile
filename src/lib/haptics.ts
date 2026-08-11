import * as Haptics from 'expo-haptics';

/**
 * The app's whole haptic vocabulary. Three taps, no more: a control firing, a
 * thing that worked, a thing that did not.
 *
 * Every call is fire-and-forget and swallows its own failure — a simulator, a
 * device with the taptic engine disabled, or web all reject, and none of that
 * is worth surfacing.
 */
export const haptic = {
  /** a control fired: a button, a run, a detent crossing */
  tap: () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  /** the thing the user asked for happened */
  good: () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  /** it did not — a dead link, a rejected command */
  bad: () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
};
