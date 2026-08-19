import { AppState } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { AuthProvider, HOLD_CEILING_MS, SHEET_SETTLE_MS, useAuth } from '../AuthProvider';
import { authenticate, probe } from '../../lib/biometrics';

jest.mock('../../lib/biometrics', () => ({
  probe: jest.fn(),
  authenticate: jest.fn(),
  describeSensor: (k: string[]) => (k.length ? 'Fingerprint' : 'Biometrics'),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const mockProbe = probe as jest.MockedFunction<typeof probe>;
const mockAuth = authenticate as jest.MockedFunction<typeof authenticate>;
const store = SecureStore as jest.Mocked<typeof SecureStore>;

const CAPABLE = {
  hardware: true,
  enrolled: true,
  kinds: ['fingerprint' as const],
  strong: true,
  passcode: true,
};

/** what SecureStore holds for a phone that has app lock switched on */
const saved = (values: Record<string, string>) => {
  store.getItemAsync.mockImplementation(async (key: string) => values[key] ?? null);
};

const mount = async () => await renderHook(() => useAuth(), { wrapper: AuthProvider });

beforeEach(() => {
  jest.clearAllMocks();
  mockProbe.mockResolvedValue(CAPABLE);
  mockAuth.mockResolvedValue({ ok: true });
  saved({});
});

describe('AuthProvider — the gate', () => {
  it('starts unlocked when app lock was never set up', async () => {
    const { result } = await mount();
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.appLock).toBe(false);
    expect(result.current.locked).toBe(false);
  });

  it('starts locked when app lock is on — a cold start is always a gate', async () => {
    saved({ jarvis_app_lock: '1' });
    const { result } = await mount();
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.locked).toBe(true);
  });

  it('does not prompt on its own — the lock screen asks, not the provider', async () => {
    saved({ jarvis_app_lock: '1' });
    const { result } = await mount();
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it('opens on a good finger', async () => {
    saved({ jarvis_app_lock: '1' });
    const { result } = await mount();
    await waitFor(() => expect(result.current.locked).toBe(true));
    await act(async () => {
      await result.current.unlock();
    });
    expect(result.current.locked).toBe(false);
  });

  it('stays shut on a bad finger, and says why', async () => {
    saved({ jarvis_app_lock: '1' });
    mockAuth.mockResolvedValue({ ok: false, reason: 'failed' });
    const { result } = await mount();
    await waitFor(() => expect(result.current.locked).toBe(true));
    await act(async () => {
      await result.current.unlock();
    });
    expect(result.current.locked).toBe(true);
    expect(result.current.lastFailure).toBe('failed');
  });

  it('will not strand you behind a gate the sensor cannot open', async () => {
    // the sensor was wiped in Settings while the app was closed: with app lock
    // on and nothing enrolled, holding the gate shut would brick the app
    saved({ jarvis_app_lock: '1' });
    mockProbe.mockResolvedValue({ ...CAPABLE, enrolled: false, strong: false, passcode: false });
    const { result } = await mount();
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.locked).toBe(false);
  });
});

describe('AuthProvider — setup', () => {
  it('proves the finger works before it turns the lock on', async () => {
    const { result } = await mount();
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      await result.current.setAppLock(true);
    });
    expect(mockAuth).toHaveBeenCalled();
    expect(store.setItemAsync).toHaveBeenCalledWith('jarvis_app_lock', '1');
    expect(result.current.appLock).toBe(true);
  });

  it('does not turn the lock on if that proof fails', async () => {
    mockAuth.mockResolvedValue({ ok: false, reason: 'cancelled' });
    const { result } = await mount();
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      await result.current.setAppLock(true);
    });
    expect(result.current.appLock).toBe(false);
    expect(store.setItemAsync).not.toHaveBeenCalledWith('jarvis_app_lock', '1');
  });

  it('refuses to switch on at all when nothing is enrolled', async () => {
    mockProbe.mockResolvedValue({ ...CAPABLE, enrolled: false });
    const { result } = await mount();
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      await result.current.setAppLock(true);
    });
    expect(result.current.appLock).toBe(false);
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it('also asks for a finger to switch the lock off', async () => {
    // otherwise whoever is holding the unlocked phone just turns it off
    saved({ jarvis_app_lock: '1' });
    const { result } = await mount();
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      await result.current.unlock();
    });
    mockAuth.mockClear();
    await act(async () => {
      await result.current.setAppLock(false);
    });
    expect(mockAuth).toHaveBeenCalled();
    expect(result.current.appLock).toBe(false);
  });
});

describe('AuthProvider — confirming a decision', () => {
  it('passes straight through when approvals are not gated', async () => {
    const { result } = await mount();
    await waitFor(() => expect(result.current.ready).toBe(true));
    let ok = false;
    await act(async () => {
      ok = await result.current.confirm('Approve');
    });
    expect(ok).toBe(true);
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it('demands a strong sensor and a deliberate confirm when gated', async () => {
    saved({ jarvis_approval_lock: '1' });
    const { result } = await mount();
    await waitFor(() => expect(result.current.requireForApprovals).toBe(true));
    await act(async () => {
      await result.current.confirm('Lock the desk');
    });
    expect(mockAuth).toHaveBeenCalledWith('Lock the desk', { strong: true, confirm: true });
  });

  it('refuses the decision when the finger is refused', async () => {
    saved({ jarvis_approval_lock: '1' });
    mockAuth.mockResolvedValue({ ok: false, reason: 'failed' });
    const { result } = await mount();
    await waitFor(() => expect(result.current.requireForApprovals).toBe(true));
    let ok = true;
    await act(async () => {
      ok = await result.current.confirm('Lock the desk');
    });
    expect(ok).toBe(false);
  });

  it('lets an approval through when the sensor is gone, rather than trapping the decision', async () => {
    // a 30-second window is not the moment to discover the gate cannot open
    saved({ jarvis_approval_lock: '1' });
    mockProbe.mockResolvedValue({ ...CAPABLE, enrolled: false, passcode: false });
    const { result } = await mount();
    await waitFor(() => expect(result.current.ready).toBe(true));
    let ok = false;
    await act(async () => {
      ok = await result.current.confirm('Lock the desk');
    });
    expect(ok).toBe(true);
  });
});

describe('AuthProvider — confirmCritical', () => {
  it('asks even when approvals are not gated', async () => {
    // this is the whole point of the split. `confirm` honours the preference,
    // which is right for an agent action and wrong for the desk watch: clearing
    // that alert is what stops a machine locking itself, so if it were opt-in
    // then anyone holding the unlocked phone could dismiss it
    saved({});
    const { result } = await mount();
    await waitFor(() => expect(result.current.requireForApprovals).toBe(false));
    await act(async () => {
      await result.current.confirmCritical('Confirm it was you');
    });
    expect(mockAuth).toHaveBeenCalledWith('Confirm it was you', { strong: true, confirm: true });
  });

  it('refuses the decision when the finger is refused', async () => {
    mockAuth.mockResolvedValue({ ok: false, reason: 'failed' });
    const { result } = await mount();
    await waitFor(() => expect(result.current.ready).toBe(true));
    let ok = true;
    await act(async () => {
      ok = await result.current.confirmCritical('Confirm it was you');
    });
    expect(ok).toBe(false);
  });

  it('still passes through when nothing can open the gate', async () => {
    // a 30-second window is not the moment to discover the sensor is gone
    mockProbe.mockResolvedValue({ ...CAPABLE, enrolled: false, passcode: false });
    const { result } = await mount();
    await waitFor(() => expect(result.current.ready).toBe(true));
    let ok = false;
    await act(async () => {
      ok = await result.current.confirmCritical('Confirm it was you');
    });
    expect(ok).toBe(true);
    expect(mockAuth).not.toHaveBeenCalled();
  });
});

describe('AuthProvider — leaving the foreground', () => {
  /** capture the AppState listener the provider installs */
  const listen = () => {
    const calls: ((s: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_e: string, cb: (s: string) => void) => {
      calls.push(cb);
      return { remove: jest.fn() };
    }) as never);
    return calls;
  };

  const opened = async () => {
    saved({ jarvis_app_lock: '1' });
    const { result } = await mount();
    await waitFor(() => expect(result.current.locked).toBe(true));
    await act(async () => {
      await result.current.unlock();
    });
    expect(result.current.locked).toBe(false);
    // Unlocking leaves the sheet guard raised for SHEET_SETTLE_MS, to absorb the
    // AppState change that trails the OS sheet closing. Wait it out, or these
    // tests measure the guard rather than the gate.
    await act(async () => {
      await new Promise((r) => setTimeout(r, SHEET_SETTLE_MS + 100));
    });
    return result;
  };

  afterEach(() => jest.restoreAllMocks());

  it('shuts the moment the app is sent away', async () => {
    // not on return: by the time anything can be seen of the app — the app
    // switcher's snapshot included — the gate is already up
    const calls = listen();
    const result = await opened();
    await act(async () => {
      calls.forEach((cb) => cb('background'));
    });
    expect(result.current.locked).toBe(true);
  });

  it('treats inactive as leaving too', async () => {
    // a notification shade or an incoming call is exactly when the phone leaves
    // your hand
    const calls = listen();
    const result = await opened();
    await act(async () => {
      calls.forEach((cb) => cb('inactive'));
    });
    expect(result.current.locked).toBe(true);
  });

  it('does not shut behind its own biometric sheet', async () => {
    // the sheet backgrounds the app on some devices; locking on that is a prompt
    // loop — sheet opens, app leaves, gate shuts, sheet opens
    const calls = listen();
    saved({ jarvis_app_lock: '1' });
    let release!: (v: { ok: true }) => void;
    mockAuth.mockImplementation(() => new Promise((r) => (release = r as never)));
    const { result } = await mount();
    await waitFor(() => expect(result.current.locked).toBe(true));

    let pending!: Promise<boolean>;
    await act(async () => {
      pending = result.current.unlock();
    });
    // the sheet is up: the app going away now is us, not the user leaving
    await act(async () => {
      calls.forEach((cb) => cb('background'));
    });
    await act(async () => {
      release({ ok: true });
      await pending;
    });
    expect(result.current.locked).toBe(false);
  });

  it('leaves an unlocked app alone when app lock is off', async () => {
    const calls = listen();
    const { result } = await mount();
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      calls.forEach((cb) => cb('background'));
    });
    expect(result.current.locked).toBe(false);
  });
});


/**
 * `authing` is one flag doing a job that needs a counter.
 *
 * It is raised by our own biometric sheet AND by `holdGate`, which the chat uses
 * around the camera and the microphone permission dialog — both of which send the
 * app away exactly like a user pocketing it. One boolean cannot tell two holders
 * apart, so the first release used to speak for both.
 */
describe('the gate hold, when more than one thing holds it', () => {
  const listen = () => {
    const calls: ((s: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_e: string, cb: (s: string) => void) => {
      calls.push(cb);
      return { remove: jest.fn() };
    }) as never);
    return calls;
  };

  /** app lock on, and already unlocked once, with the sheet guard waited out */
  const opened = async () => {
    saved({ jarvis_app_lock: '1' });
    const { result } = await mount();
    await waitFor(() => expect(result.current.locked).toBe(true));
    await act(async () => {
      await result.current.unlock();
    });
    await waitFor(() => expect(result.current.locked).toBe(false));
    await act(async () => {
      await new Promise((r) => setTimeout(r, SHEET_SETTLE_MS + 100));
    });
    return result;
  };

  afterEach(() => jest.restoreAllMocks());

  const leave = async (calls: ((s: string) => void)[]) => {
    await act(async () => {
      calls.forEach((cb) => cb('background'));
    });
  };
  const settle = async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, SHEET_SETTLE_MS + 100));
    });
  };

  it('stays held when one of two holders lets go', async () => {
    // the camera closes while the microphone dialog is still up: the camera's
    // settle timer used to clear the flag under it, and the answer to "may I
    // record" was a fingerprint prompt over the top of the permission dialog
    const calls = listen();
    const result = await opened();

    await act(async () => {
      result.current.holdGate(true);
    });
    await act(async () => {
      result.current.holdGate(true);
    });
    await act(async () => {
      result.current.holdGate(false);
    });
    await settle();

    await leave(calls);
    expect(result.current.locked).toBe(false);

    await act(async () => {
      result.current.holdGate(false);
    });
    await settle();

    await leave(calls);
    await waitFor(() => expect(result.current.locked).toBe(true));
  });

  it('expires a hold nobody released, rather than disabling the lock for good', async () => {
    // `holdGate(true)` with no matching `false` — a throw between the two, which
    // is one missing try/finally away at every call site. Without a ceiling the
    // app lock is off for the rest of the process and nothing says so.
    const calls = listen();
    const result = await opened();

    // fake timers only from here: the ceiling is five minutes, and `opened()`
    // above needs the real ones to wait out the sheet guard
    jest.useFakeTimers();
    try {
      result.current.holdGate(true);
      // the ceiling is the only timer outstanding, and it mutates refs rather
      // than state — so it needs advancing, not a React flush
      jest.advanceTimersByTime(HOLD_CEILING_MS + 1000);
      jest.useRealTimers();
      await leave(calls);
      expect(result.current.locked).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
