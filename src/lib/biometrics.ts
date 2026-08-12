import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export type BiometricKind = 'fingerprint' | 'face' | 'iris';

export type BiometricCapability = {
  /** the sensor exists on this device */
  hardware: boolean;
  /** a finger or a face has actually been enrolled on it */
  enrolled: boolean;
  /** which sensors, so a prompt can name the real one instead of guessing */
  kinds: BiometricKind[];
  /**
   * The enrolment is class-3: a fingerprint or a depth-mapping face. 2D face
   * unlock is class-2 and can be beaten with a photograph, which is not good
   * enough to authorise locking a machine.
   */
  strong: boolean;
  /** some screen lock exists, so a failed finger has somewhere to fall back to */
  passcode: boolean;
};

const NONE: BiometricCapability = {
  hardware: false,
  enrolled: false,
  kinds: [],
  strong: false,
  passcode: false,
};

export type AuthFailure =
  /** no sensor, nothing enrolled, or the native call itself did not answer */
  | 'unavailable'
  /** the prompt was dismissed — by the user, the app, or the OS */
  | 'cancelled'
  /** too many bad attempts; the OS will not ask again until the device unlocks */
  | 'lockout'
  /** the finger or face was read and rejected */
  | 'failed';

export type AuthOutcome = { ok: true } | { ok: false; reason: AuthFailure };

const KIND: Record<number, BiometricKind> = {
  [LocalAuthentication.AuthenticationType.FINGERPRINT]: 'fingerprint',
  [LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION]: 'face',
  [LocalAuthentication.AuthenticationType.IRIS]: 'iris',
};

/**
 * Everything the UI needs to talk about this phone's sensor truthfully.
 *
 * Each question is asked independently and every one of them is allowed to
 * fail: on web there is no native module at all, and a dev build missing the
 * module throws rather than returning false. A probe that cannot answer reports
 * no capability, which is the safe reading — it closes the door, it does not
 * open it.
 */
export async function probe(): Promise<BiometricCapability> {
  if (Platform.OS === 'web') return NONE;

  // `ask` and not a bare call with `.catch`: when the native module is missing
  // altogether — an older dev build installed before this dependency was added —
  // the import fails and every one of these names is `undefined`, so calling it
  // throws *synchronously*, before there is a promise for `.catch` to attach to.
  // The app has to survive that and simply report no biometrics.
  const ask = async <T,>(call: (() => Promise<T>) | undefined, fallback: T): Promise<T> => {
    try {
      if (typeof call !== 'function') return fallback;
      const value = await call();
      return value === undefined || value === null ? fallback : value;
    } catch {
      return fallback;
    }
  };

  const [hardware, enrolled, types, level] = await Promise.all([
    ask(LocalAuthentication.hasHardwareAsync, false),
    ask(LocalAuthentication.isEnrolledAsync, false),
    ask(LocalAuthentication.supportedAuthenticationTypesAsync, [] as LocalAuthentication.AuthenticationType[]),
    ask(LocalAuthentication.getEnrolledLevelAsync, LocalAuthentication.SecurityLevel.NONE),
  ]);

  return {
    hardware: hardware === true,
    enrolled: enrolled === true,
    // `Array.isArray` and not just the catch above: a module that is present but
    // unimplemented — jest, or a dev build without the native side — resolves
    // `undefined` rather than rejecting, so the catch never fires and `.map`
    // takes the whole app down on the first probe
    kinds: (Array.isArray(types) ? types : []).map((t) => KIND[t]).filter((k): k is BiometricKind => Boolean(k)),
    strong: level === LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG,
    // SecurityLevel escalates: SECRET is a PIN or pattern, and both biometric
    // levels sit above it, so anything past NONE means a lock screen exists
    passcode: level > LocalAuthentication.SecurityLevel.NONE,
  };
}

/** the small set of outcomes a screen can actually do something about */
const FAILURE: Record<string, AuthFailure> = {
  user_cancel: 'cancelled',
  app_cancel: 'cancelled',
  system_cancel: 'cancelled',
  // iOS: the user chose "Enter Password" and then abandoned that sheet
  user_fallback: 'cancelled',
  lockout: 'lockout',
  // no answer, rather than a wrong answer — the lock screen should invite
  // another try, not accuse the finger
  timeout: 'cancelled',
  not_enrolled: 'unavailable',
  not_available: 'unavailable',
  passcode_not_set: 'unavailable',
  invalid_context: 'unavailable',
  no_space: 'unavailable',
};

/**
 * How long to wait for the OS sheet before giving up on it.
 *
 * The sheet times out on its own well inside this, so reaching it means the
 * native call is not coming back at all. Without a ceiling that state is a
 * spinner that never stops on a screen with no way past it — the worst possible
 * place for it. Generous enough that a slow finger is never cut off.
 */
const NATIVE_TIMEOUT_MS = 90_000;

export type AuthOptions = {
  /** require a class-3 sensor — for anything that authorises a real action */
  strong?: boolean;
  /**
   * Android only: keep the extra Confirm tap after the finger reads. Right for
   * a decision, wrong for unlocking the app, where it is one tap of friction on
   * every single launch.
   */
  confirm?: boolean;
};

/**
 * Put the OS prompt up and reduce its answer to pass or a reason.
 *
 * The device passcode stays enabled as a fallback on purpose: a finger that
 * will not read must not be able to lock you out of your own intruder alert,
 * and the phone's PIN is already a credential you trust. On Android that
 * fallback is only offered alongside a class-3 sensor, which is the other
 * reason `strong` is set for decisions.
 *
 * A native call that throws returns `unavailable` rather than propagating: the
 * one outcome that must be unreachable from here is a silent pass.
 */
export async function authenticate(reason: string, opts: AuthOptions = {}): Promise<AuthOutcome> {
  if (Platform.OS === 'web') return { ok: false, reason: 'unavailable' };

  try {
    if (typeof LocalAuthentication.authenticateAsync !== 'function') return { ok: false, reason: 'unavailable' };
    const asked = LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
      requireConfirmation: opts.confirm ?? false,
      // Always 'strong', and not `opts.strong ? 'strong' : 'weak'`.
      //
      // Android's BiometricPrompt refuses BIOMETRIC_WEAK combined with
      // DEVICE_CREDENTIAL — the combination is rejected outright rather than
      // degraded. With the device passcode kept as a fallback above, 'weak' was
      // therefore an invalid request: no prompt was shown and the promise never
      // settled, which on the lock screen is a spinner that never stops and an
      // app nobody can get into.
      //
      // `opts.strong` is kept in the API because it still says what a caller
      // means, and iOS reads nothing from this field.
      biometricsSecurityLevel: 'strong',
    });
    // the guard has to be cleared when the sheet wins the race, or a 90s timer
    // outlives every prompt — enough to hold a jest worker open, and enough to
    // keep the app awake on a phone
    let guard: ReturnType<typeof setTimeout> | undefined;
    const expiry = new Promise<{ success: false; error: string }>((resolve) => {
      guard = setTimeout(() => resolve({ success: false, error: 'timeout' }), NATIVE_TIMEOUT_MS);
    });
    let result: Awaited<typeof asked> | { success: false; error: string };
    try {
      result = await Promise.race([asked, expiry]);
    } finally {
      if (guard) clearTimeout(guard);
    }
    if (result.success) return { ok: true };
    return { ok: false, reason: FAILURE[result.error] ?? 'failed' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

/**
 * Abandon a prompt that is still notionally open.
 *
 * Android dismisses its own sheet when the app is sent away, but
 * `authenticateAsync` does not always resolve — leaving a caller waiting on a
 * prompt that is no longer on screen, and a button stuck showing a spinner.
 * Calling this before asking again settles the old one.
 *
 * Android only; a no-op elsewhere, and never throws.
 */
export async function cancel(): Promise<void> {
  try {
    if (typeof LocalAuthentication.cancelAuthenticate === 'function') {
      await LocalAuthentication.cancelAuthenticate();
    }
  } catch {
    // there may have been nothing to cancel, which is not a problem
  }
}

/** what to call the sensor on screen, in the phone's own terms */
export function describeSensor(kinds: BiometricKind[]): string {
  const names: Record<BiometricKind, string> = {
    fingerprint: 'Fingerprint',
    face: 'Face',
    iris: 'Iris',
  };
  const listed = kinds.map((k) => names[k]);
  if (listed.length === 0) return 'Biometrics';
  if (listed.length === 1) return listed[0];
  return `${listed.slice(0, -1).join(', ')} or ${listed[listed.length - 1]}`;
}
