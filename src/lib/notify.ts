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
/**
 * Android freezes a channel's importance, vibration and sound at creation, so a
 * channel is not a setting — it is an id, and changing how this one feels costs a
 * new one every time. `general` shipped silent, `general-v2` shipped malformed,
 * and the versions after them were spent tuning the buzz by ear on the device.
 * See the comment where it is created. The shipped ids are deleted below.
 *
 * **Stop the app before renaming a channel.** `-v4` was lost to Fast Refresh: the
 * id here was changed one save before the vibration below it, the running app
 * reloaded in between, and `prepare()` created `general-v4` carrying the *old*
 * pattern. Android froze it there, so the finished edit could never reach a phone
 * that had already reloaded once. A channel id and the settings under it have to
 * arrive in the same launch, which on a machine with a device attached means
 * force-stopping first — a hot reload is enough to spend an id.
 */
export const GENERAL_CHANNEL = 'general-v8';
/**
 * Superseded ids, deleted at start-up so they stop appearing in the user's
 * notification settings as rows nothing posts to.
 *
 * `general` and `general-v2` shipped in pushed builds, so any install can be
 * carrying them. `general-v7` never shipped — but it was created on the test phone
 * during the session that tuned the buzz, and an id has to stay on this list until
 * a launch has actually cleared it. It was briefly dropped on the reasoning that
 * unshipped ids do not matter, which was wrong within the same session: the next
 * change stranded it, visible, on the only phone that runs this.
 *
 * The ids between `-v2` and `-v7` are absent because a launch already deleted them
 * there. Deleting is not what keeps a channel gone — Android tombstones the id and
 * keeps its frozen settings either way — so removing a cleared id from this list
 * cannot bring it back.
 */
const LEGACY_GENERAL_CHANNELS = ['general', 'general-v2', 'general-v7'];

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
    handleNotification: async (notification) => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: shouldAlertWhileOpen(notification?.request?.content?.data),
      shouldSetBadge: false,
    }),
  });
}

/**
 * Whether a notification arriving while the app is open should make noise.
 *
 * **`shouldPlaySound` is also the vibration switch.** There is no separate
 * vibrate field in the behaviour record, and the native builder reads this one
 * for both — `ExpoNotificationBuilder.kt`:
 *
 *     val behaviorAllowsVibration = notificationBehavior?.shouldPlaySound ?: true
 *     if (!shouldPlaySound && !shouldVibrate) builder.setSilent(true)
 *
 * `setSilent(true)` suppresses the buzz as well as the sound, and it is the
 * `SILENT` in a posted record's `flags=AUTO_CANCEL|SILENT`.
 *
 * That flag cost three sessions of misdiagnosis. A blanket `false` here — right
 * for an ordinary notification, since the app is already answering on screen with
 * its own toast and haptic — also silenced **the preview**, which is the one
 * notification pressed specifically to hear what the real thing sounds like, and
 * which can only ever be pressed with the app open. Silence was read as a broken
 * channel, and `general` was rebuilt twice chasing it. The channel was never at
 * fault: it has carried the default sound URI throughout.
 *
 * So the default stays quiet and anything that is *about* being noticed opts in.
 */
function shouldAlertWhileOpen(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  // a preview is a test of the delivery path; answering it silently tests the
  // wrong half
  return d.preview === true || d.alertWhenOpen === true;
}

/**
 * Whether a reply that has just landed earns a system notification.
 *
 * The condition this replaces was `first || chatFocused.current || simulated`, and
 * it got both directions wrong at once.
 *
 * **It buzzed for a reply you were looking at.** Leaving the Chat tab mid-answer
 * made `chatFocused` false, so an answer arriving while the app was open on Home
 * raised a notification — for something the app was already showing, with its own
 * toast and haptic. That is noise, and the unread badge on the Chat tab is the
 * signal that belongs there.
 *
 * **And it stayed silent for a reply you could not see.** React Navigation's blur
 * does not fire when the app is backgrounded — the screen is still focused inside
 * the navigator — so `chatFocused` stays `true` for the Chat tab. Ask a question
 * from Chat, put the phone away, and the guard written to suppress noise suppressed
 * the only notification that mattered. Which is how every question gets asked.
 *
 * So focus was never the question; being on screen at all is. `chatFocused` is no
 * longer part of this decision — it still drives `unread`, where "which tab" is
 * genuinely what is being asked.
 */
export function shouldNotifyReply(o: { appActive: boolean; simulated: boolean }): boolean {
  if (o.simulated) return false;
  return !o.appActive;
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
      /**
       * The everyday channel — briefings, replies — and it was mute.
       *
       * `importance: DEFAULT` alone is not enough. Proved on device: a preview
       * briefing posted as
       *
       *     channel=general flags=AUTO_CANCEL|SILENT vibrate=null sound=null
       *
       * so the leaving briefing had been arriving correctly, silently, into a shade
       * nobody had reason to look at. It read exactly like the feature not working.
       *
       * A channel needs to be *told* to make noise; a bare importance leaves the
       * pattern and the sound null and Android honours that. So both are named here,
       * which is the same treatment the watch channel already had — and the reason
       * that one buzzed while this one never did.
       *
       * **`general-v8`, not `general`.** Android freezes importance, vibration and
       * light when a channel is created, so editing the old one changes nothing on
       * an install that already has it. Every phone that ever ran this app has a
       * silent `general`, and only a new id can escape it.
       *
       * **No `sound` key.** `sound: 'default'` was the v2 attempt and it is not the
       * system-default alias any more: expo-notifications 57 reads any string as a
       * *custom* filename and looks it up in the config plugin's `sounds` array.
       * It is not there, so the call logged
       *
       *     expo-notifications: Custom sound 'default' not found in native app.
       *
       * and Expo stopped before applying the audio attributes. Proved on device —
       * `general-v2` came out with `mAudioAttributes=null` while every other channel
       * on the phone, including `desk-watch-v2`, had them set. So the fix that was
       * supposed to un-mute the briefing shipped a second malformed channel.
       *
       * Omitting the key is what the watch channel does, and that one is the only
       * channel here ever proved audible on hardware. Android then fills in the
       * user's default notification sound itself.
       */
      await Notifications.setNotificationChannelAsync(GENERAL_CHANNEL, {
        name: 'J.A.R.V.I.S.',
        importance: Notifications.AndroidImportance.DEFAULT,
        /**
         * A long pulse then a shorter one, close together — falling, not repeating.
         *
         * Tuned by ear across several attempts, and the route matters because the
         * first instinct was wrong twice over. It began at `[0, 220]` — "shorter
         * and softer than the watch pattern" — which reads as a twitch you are not
         * sure you felt: reported as "just small time buzzed". **A channel cannot
         * ask for a higher amplitude, so duration is the whole of how strong a buzz
         * feels**, and 220ms is under half the contact every other app sends. Then
         * Android's default `[0, 250, 250, 250]` — the pattern WhatsApp gets — a
         * beat slow. Then `[0, 200, 100, 200]`, too light again. Then
         * `[0, 500, 200, 500]`, which was heavy enough but is the watch alert's own
         * shape with a pulse removed, and two even beats against three are not much
         * to tell apart through a pocket.
         *
         * The uneven pair is what fixed that. Equal pulses read as a repeat and
         * invite counting; 400 falling to 250 reads as a single gesture and is told
         * apart from the watch's three even 500s by shape rather than by length.
         * The watch stays the heaviest thing the phone does, and must remain so —
         * if these two are ever confused in use, shorten this one rather than
         * lengthening that one.
         */
        vibrationPattern: [0, 400, 100, 250],
        enableVibrate: true,
        lightColor: '#3ea6ff',
      });
      // the silent original and the malformed v2, removed so they stop appearing
      // in the user's notification settings as channels nothing posts to any more
      for (const dead of LEGACY_GENERAL_CHANNELS) {
        try {
          await Notifications.deleteNotificationChannelAsync(dead);
        } catch {
          // absent on a fresh install, which is the state we wanted anyway
        }
      }
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
