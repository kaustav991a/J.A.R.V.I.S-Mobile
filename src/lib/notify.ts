import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Notifications, in two halves.
 *
 * **Local** notifications work today and need nothing from any server: the app
 * posts them itself. That is enough to close the real gap in the desk watch — an
 * alert that only travels down the WebSocket arrives when the app is in the
 * foreground, which is not where the phone is when it matters.
 *
 * **Remote** push is the same surface plus a token. Registering one needs a
 * Firebase project and `google-services.json`, so `registerForPush()` returns
 * null until that exists rather than throwing. Everything else here is
 * unaffected by its absence.
 */

/** Android needs a channel before anything can be posted, and before permission is asked */
/**
 * `-v2` because Android freezes a channel's importance, vibration and light the
 * moment it is created: later changes are ignored, on the principle that the
 * user's own settings win from then on. Getting an emergency vibration and a red
 * light onto this alert therefore means a new channel id, not an edit. The old
 * one is deleted below so it does not linger in the app's notification settings
 * as a dead entry the user can still toggle.
 */
export const WATCH_CHANNEL = 'desk-watch-v2';
const LEGACY_WATCH_CHANNEL = 'desk-watch';
export const GENERAL_CHANNEL = 'general';

/** the actionable category, so an alert can be answered from the shade */
export const WATCH_CATEGORY = 'desk-watch-alert';
export const ACTION_ME = 'watch-it-was-me';
export const ACTION_LOCK = 'watch-lock-now';

export type NotifyCapability = {
  granted: boolean;
  /** the phone can be woken by the desk. Requires the Firebase step. */
  pushToken: string | null;
};

/**
 * How a notification behaves when it lands while the app is already open.
 *
 * Set once, at module scope, because the handler has to be registered before any
 * notification can arrive — registering it inside a component means anything that
 * lands during startup is discarded. The handler must answer within 3 seconds or
 * the notification is dropped, so it does no work.
 */
export function installHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      // the app already plays its own haptics and toasts for anything it is
      // showing on screen; a second sound on top reads as a double alert
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Create the channels and ask for permission.
 *
 * Order matters on Android 13+: the channel must exist *before* the permission
 * prompt, or the prompt does not appear reliably. Safe to call more than once —
 * creating an existing channel updates it.
 */
export async function prepare(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(WATCH_CHANNEL, {
        name: 'Desk watch',
        // MAX, not HIGH: this one is a 30-second window on whether a machine
        // stays unlocked, so it may interrupt
        importance: Notifications.AndroidImportance.MAX,
        // longer and harder than the old [0, 250, 200, 250]: this has to be
        // distinguishable from an ordinary buzz through a pocket, without looking
        // at the screen, because the whole point is the phone is not in your hand
        vibrationPattern: [0, 500, 200, 500, 200, 500],
        // red, not the app's blue. The channel light is the one piece of
        // emergency colour that survives a *pushed* notification: Expo's push API
        // takes channelId, icon and tag on Android and nothing else, so the
        // notification's own tint cannot be set per message from the server.
        lightColor: '#ff4d4f',
        // No `bypassDnd`. It looks exactly right for this alert and it cannot be
        // used: overriding Do Not Disturb needs Notification Policy Access, which
        // this app does not hold, so Android rejects the whole channel and
        // `prepare()`'s catch swallowed the failure — leaving the channel absent
        // and every watch alert falling back to Expo's silent one. Proved on
        // device: `desk-watch-v2` simply did not exist after a launch.
      });
      // the pre-v2 channel, kept out of the user's settings list now that nothing
      // posts to it
      try {
        await Notifications.deleteNotificationChannelAsync(LEGACY_WATCH_CHANNEL);
      } catch {
        // never created on this install, which is the state we wanted anyway
      }
      await Notifications.setNotificationChannelAsync(GENERAL_CHANNEL, {
        name: 'General',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    /**
     * The two answers, as notification actions.
     *
     * Both open the app. `opensAppToForeground: false` would need a background
     * task registered to actually answer the desk, and a button that appears to
     * work while silently doing nothing is worse than one that opens the alert —
     * this decides whether a machine stays unlocked.
     *
     * Android only shows these once the notification is **expanded**, and only if
     * the category was registered before the notification was posted. That
     * ordering is why `prepare()` runs at startup rather than lazily.
     */
    await Notifications.setNotificationCategoryAsync(WATCH_CATEGORY, [
      { identifier: ACTION_ME, buttonTitle: 'It was me', options: { opensAppToForeground: true } },
      { identifier: ACTION_LOCK, buttonTitle: 'Lock it now', options: { opensAppToForeground: true } },
    ]);

    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const asked = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    });
    return asked.granted;
  } catch {
    // a build without the native module still runs; it just cannot notify
    return false;
  }
}

/**
 * Register for remote push.
 *
 * Returns null — not an error — when there is no Firebase config, which is the
 * current state. `getExpoPushTokenAsync` throws `Default FirebaseApp is not
 * initialized` without `google-services.json`, and that must not take the app
 * down or block local notifications.
 */
export async function registerForPush(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token.data ?? null;
  } catch {
    return null;
  }
}

/** everything the UI needs to say truthfully what notifications can do here */
export async function probeNotify(): Promise<NotifyCapability> {
  const granted = await prepare();
  return { granted, pushToken: granted ? await registerForPush() : null };
}

/**
 * Post a notification from the app itself, now.
 *
 * `trigger: null` fires immediately. This is what makes the desk watch reach a
 * pocketed phone without any server: the socket delivers the frame, and the app
 * raises the notification locally.
 */
export async function postNow(opts: {
  title: string;
  body: string;
  channel?: string;
  category?: string;
  data?: Record<string, unknown>;
  /**
   * Ongoing: it cannot be swiped away and it does not get folded into Android's
   * auto-group. For the desk watch, where the window is 30 seconds and silence
   * means the machine locks, a notification quietly collapsed into a stack of
   * others is the same as no notification.
   */
  sticky?: boolean;
  /** Android accent for the notification, e.g. red for the desk watch */
  color?: string;
}): Promise<string | null> {
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: opts.title,
        body: opts.body,
        categoryIdentifier: opts.category,
        data: opts.data ?? {},
        ...(opts.color ? { color: opts.color } : {}),
        ...(opts.sticky ? { sticky: true, autoDismiss: false } : {}),
      },
      /**
       * The channel goes on the TRIGGER. It was on `content` for a while, where
       * it is silently ignored — `NotificationContentInput` has no such field —
       * so every notification this app posted landed on Expo's fallback channel
       * ("Miscellaneous", `AUTO_CANCEL|SILENT`, no vibration) instead of the
       * channel it asked for. Proved on device: the record read
       * `channel=expo_notifications_fallback_notification_channel`, which is why
       * a desk-watch alert on a MAX-importance channel arrived silent.
       *
       * `tsc` cannot catch this. The field was added with an object spread, and a
       * spread turns off excess-property checking.
       *
       * `{channelId}` alone is `ChannelAwareTriggerInput`, documented as
       * delivering immediately — so this keeps `trigger: null`'s timing while
       * naming a channel, which a schedulable trigger could not do.
       */
      trigger: Platform.OS === 'android' ? { channelId: opts.channel ?? GENERAL_CHANNEL } : null,
    });
  } catch {
    return null;
  }
}

/**
 * A desk-watch alert carried in a notification payload.
 *
 * The socket cannot deliver one to a phone that is asleep, so the push carries
 * the whole alert and this rebuilds it when the notification is tapped. Without
 * it the notification opens an app with nothing to show, which is worse than not
 * notifying: it reads as the alert having been dealt with.
 */
export type TappedAlert = {
  id: string;
  /** seconds left *now*, worked out from the deadline the gateway sent */
  expiresIn: number;
  image: string | null;
  user: string | null;
  trigger: string;
};

/**
 * Read an alert out of a notification's data, or return null.
 *
 * Null for anything that is not a watch alert, has no id, or whose window has
 * already closed — a stale alert must never raise a live countdown, because the
 * desk has already locked itself by then and the screen would be a lie.
 */
export function alertFromData(raw: unknown, now: number = Date.now()): TappedAlert | null {
  if (raw === null || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (d.kind !== 'intruder') return null;
  const id = typeof d.id === 'string' ? d.id : '';
  if (!id) return null;
  const deadline = typeof d.expires_at_ms === 'number' ? d.expires_at_ms : null;
  if (deadline === null) return null;
  const expiresIn = Math.round((deadline - now) / 1000);
  if (expiresIn <= 0) return null;
  return {
    id,
    expiresIn,
    image: typeof d.image === 'string' && d.image ? d.image : null,
    user: typeof d.user === 'string' && d.user ? d.user : null,
    trigger: typeof d.trigger === 'string' && d.trigger ? d.trigger : 'unlock',
  };
}

/**
 * The alert that launched the app, if a watch notification is what opened it.
 *
 * Read once at startup: a notification tapped while the app was dead is not
 * delivered to any listener, it is only recoverable from here.
 */
export async function alertFromLaunch(): Promise<TappedAlert | null> {
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    return alertFromData(response?.notification?.request?.content?.data ?? null);
  } catch {
    return null;
  }
}

/** watch alerts tapped while the app is alive */
export function onAlertTapped(cb: (alert: TappedAlert) => void): () => void {
  try {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const alert = alertFromData(response?.notification?.request?.content?.data ?? null);
      if (alert) cb(alert);
    });
    return () => sub.remove();
  } catch {
    return () => {};
  }
}

/** drop a notification once its window has closed, so a dead alert cannot be tapped */
export async function dismiss(id: string | null): Promise<void> {
  if (!id) return;
  try {
    await Notifications.dismissNotificationAsync(id);
  } catch {
    // already gone is the state we wanted
  }
}
