import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  AuthFailure,
  BiometricCapability,
  authenticate,
  describeSensor,
  probe,
} from '../lib/biometrics';

/**
 * How long our own biometric sheet is allowed to look like the app leaving.
 *
 * The gate closes when the app goes away — but asking for a fingerprint *also*
 * sends the app away on some devices, which on its own is a prompt loop: sheet
 * opens, app backgrounds, gate closes, sheet opens. So authentication raises a
 * flag, and this is how long that flag outlives the call, to cover the
 * AppState change that trails the sheet closing.
 *
 * This replaced a 20s "grace period" measured on return. The grace was the wrong
 * instrument: it left the app open to anyone who picked up the phone within
 * twenty seconds, and it showed your data in the app-switcher snapshot.
 */
export const SHEET_SETTLE_MS = 600;

const LOCK_KEY = 'jarvis_app_lock';
const APPROVAL_KEY = 'jarvis_approval_lock';

export type Auth = {
  /** the probe and the stored settings have both landed */
  ready: boolean;
  capability: BiometricCapability | null;
  /** what to call this phone's sensor on screen */
  sensorLabel: string;
  /**
   * Something exists that can open a gate — an enrolled biometric, or failing
   * that the phone's own PIN. When this is false no gate is ever raised: a lock
   * nothing can open is not security, it is a brick.
   */
  usable: boolean;
  /** the app asks for a finger on cold start and whenever it leaves the foreground */
  appLock: boolean;
  /** approving or denying anything asks for a finger */
  requireForApprovals: boolean;
  /** the gate is up right now */
  locked: boolean;
  /** why the last attempt did not open it, for the lock screen to say */
  lastFailure: AuthFailure | null;
  unlock: () => Promise<boolean>;
  /** gate an ordinary decision, if the user asked for approvals to be gated */
  confirm: (reason: string) => Promise<boolean>;
  /**
   * Gate a decision that must not be answerable by whoever is holding the phone —
   * ignores the approvals preference and always asks when the sensor can answer.
   */
  confirmCritical: (reason: string) => Promise<boolean>;
  setAppLock: (on: boolean) => Promise<void>;
  setRequireForApprovals: (on: boolean) => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

const read = async (key: string): Promise<boolean> => {
  if (Platform.OS === 'web') return false;
  try {
    return (await SecureStore.getItemAsync(key)) === '1';
  } catch {
    return false;
  }
};

const write = async (key: string, on: boolean): Promise<void> => {
  if (Platform.OS === 'web') return;
  try {
    if (on) await SecureStore.setItemAsync(key, '1');
    else await SecureStore.deleteItemAsync(key);
  } catch {
    // a setting that cannot be persisted still applies for this session
  }
};

/**
 * Owns the app's own gate, separately from the desk link.
 *
 * Deliberately does *not* prompt by itself. A provider that fired the OS sheet
 * from an effect would race the first paint and put a system dialog over a
 * half-drawn app; the lock screen asks, when it is on screen and ready.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [capability, setCapability] = useState<BiometricCapability | null>(null);
  const [ready, setReady] = useState(false);
  const [appLock, setAppLockState] = useState(false);
  const [requireForApprovals, setRequireState] = useState(false);
  const [locked, setLocked] = useState(false);
  const [lastFailure, setLastFailure] = useState<AuthFailure | null>(null);

  /** true while an OS sheet is up because *we* asked for it */
  const authing = useRef(false);
  /** the effects below read these without wanting to re-subscribe on a change */
  const live = useRef({ appLock: false, usable: false });

  /**
   * Every authentication goes through here, so the gate can tell the difference
   * between the app being sent away and the app asking a question.
   */
  const ask = useCallback(async (reason: string, opts?: { strong?: boolean; confirm?: boolean }) => {
    authing.current = true;
    try {
      return await authenticate(reason, opts);
    } finally {
      setTimeout(() => {
        authing.current = false;
      }, SHEET_SETTLE_MS);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [cap, lock, approvals] = await Promise.all([probe(), read(LOCK_KEY), read(APPROVAL_KEY)]);
      if (!alive) return;
      const canOpen = cap.enrolled || cap.passcode;
      setCapability(cap);
      setAppLockState(lock);
      setRequireState(approvals);
      // a cold start is always a gate — but only one that can be opened
      setLocked(lock && canOpen);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const usable = capability ? capability.enrolled || capability.passcode : false;
  live.current = { appLock, usable };

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') return;
      // Shut as the app leaves rather than when it returns. By the time anything
      // can be seen of it — the app switcher's snapshot included — the gate is
      // already up, and coming back has nothing to wait for.
      //
      // 'inactive' counts as leaving, not just 'background': it is what iOS
      // reports for a notification shade or an incoming call, and those are
      // exactly the moments the phone leaves your hand.
      if (authing.current) return;
      if (live.current.appLock && live.current.usable) setLocked(true);
    });
    return () => sub.remove();
  }, []);

  const unlock = useCallback(async () => {
    const outcome = await ask('Unlock JARVIS');
    if (outcome.ok) {
      setLastFailure(null);
      setLocked(false);
      return true;
    }
    setLastFailure(outcome.reason);
    return false;
  }, [ask]);

  const confirm = useCallback(
    async (reason: string) => {
      if (!requireForApprovals) return true;
      // a 30-second window is not the moment to discover the gate cannot open
      if (!usable) return true;
      const outcome = await ask(reason, { strong: true, confirm: true });
      if (!outcome.ok) setLastFailure(outcome.reason);
      return outcome.ok;
    },
    [requireForApprovals, usable, ask]
  );

  /**
   * For decisions where opt-in is the wrong default.
   *
   * `confirm` honours the approvals preference, which is right for an agent
   * action like clearing build folders. It is wrong for the desk watch: clearing
   * that alert is what stops a machine locking itself, so if it were gated by a
   * preference the user never switched on, anyone holding the unlocked phone
   * could dismiss it. This always asks when the sensor can answer.
   *
   * Still passes through when nothing is enrolled — a 30-second window is not the
   * moment to discover the gate cannot open.
   */
  const confirmCritical = useCallback(
    async (reason: string) => {
      if (!usable) return true;
      const outcome = await ask(reason, { strong: true, confirm: true });
      if (!outcome.ok) setLastFailure(outcome.reason);
      return outcome.ok;
    },
    [usable, ask]
  );

  const setAppLock = useCallback(
    async (on: boolean) => {
      // Turning it on proves the sensor works before anything depends on it —
      // enabling a gate you cannot open is how you lose an app. Turning it off
      // asks too: otherwise whoever is holding the unlocked phone just
      // switches the lock off and keeps it.
      if (on && !(capability?.enrolled ?? false)) return;
      const outcome = await ask(on ? 'Turn on app lock' : 'Turn off app lock');
      if (!outcome.ok) {
        setLastFailure(outcome.reason);
        return;
      }
      setLastFailure(null);
      setAppLockState(on);
      await write(LOCK_KEY, on);
    },
    [capability, ask]
  );

  const setRequireForApprovals = useCallback(
    async (on: boolean) => {
      // only the weakening direction needs proof; switching it on tightens
      if (!on && usable) {
        const outcome = await ask('Stop asking on approvals');
        if (!outcome.ok) {
          setLastFailure(outcome.reason);
          return;
        }
      }
      setRequireState(on);
      await write(APPROVAL_KEY, on);
    },
    [usable, ask]
  );

  const value = useMemo<Auth>(
    () => ({
      ready,
      capability,
      sensorLabel: describeSensor(capability?.kinds ?? []),
      usable,
      appLock,
      requireForApprovals,
      locked,
      lastFailure,
      unlock,
      confirm,
      confirmCritical,
      setAppLock,
      setRequireForApprovals,
    }),
    [
      ready,
      capability,
      usable,
      appLock,
      requireForApprovals,
      locked,
      lastFailure,
      unlock,
      confirm,
      confirmCritical,
      setAppLock,
      setRequireForApprovals,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
