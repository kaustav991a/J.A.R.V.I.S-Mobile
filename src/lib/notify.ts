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
export const WATCH_CHANNEL = 'desk-watch';
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
        vibrationPattern: [0, 250, 200, 250],
        lightColor: '#3ea6ff',
      });
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
}): Promise<string | null> {
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: opts.title,
        body: opts.body,
        categoryIdentifier: opts.category,
        data: opts.data ?? {},
        ...(Platform.OS === 'android' ? { channelId: opts.channel ?? GENERAL_CHANNEL } : {}),
      },
      trigger: null,
    });
  } catch {
    return null;
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
