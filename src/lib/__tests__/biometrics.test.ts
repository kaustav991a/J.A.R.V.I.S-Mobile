import * as LocalAuthentication from 'expo-local-authentication';
import { authenticate, describeSensor, probe } from '../biometrics';

jest.mock('expo-local-authentication', () => ({
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
  getEnrolledLevelAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}));

const mocked = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;

/** the common case: an Android phone with a real fingerprint reader enrolled */
const goodPhone = () => {
  mocked.hasHardwareAsync.mockResolvedValue(true);
  mocked.isEnrolledAsync.mockResolvedValue(true);
  mocked.supportedAuthenticationTypesAsync.mockResolvedValue([LocalAuthentication.AuthenticationType.FINGERPRINT]);
  mocked.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG);
};

beforeEach(() => jest.clearAllMocks());

describe('probe', () => {
  it('reports a strong fingerprint phone as ready', async () => {
    goodPhone();
    await expect(probe()).resolves.toEqual({
      hardware: true,
      enrolled: true,
      kinds: ['fingerprint'],
      strong: true,
      passcode: true,
    });
  });

  it('separates having a sensor from having enrolled on it', async () => {
    goodPhone();
    mocked.isEnrolledAsync.mockResolvedValue(false);
    mocked.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.NONE);
    const cap = await probe();
    expect(cap.hardware).toBe(true);
    expect(cap.enrolled).toBe(false);
    // nothing to fall back to either: this phone has no screen lock at all
    expect(cap.passcode).toBe(false);
  });

  it('calls 2D face unlock weak, because it must not gate a lock decision', async () => {
    goodPhone();
    mocked.supportedAuthenticationTypesAsync.mockResolvedValue([
      LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
    ]);
    mocked.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK);
    const cap = await probe();
    expect(cap.kinds).toEqual(['face']);
    expect(cap.strong).toBe(false);
    expect(cap.passcode).toBe(true);
  });

  it('counts a PIN-only phone as having a passcode but no biometric', async () => {
    goodPhone();
    mocked.isEnrolledAsync.mockResolvedValue(false);
    mocked.supportedAuthenticationTypesAsync.mockResolvedValue([]);
    mocked.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.SECRET);
    const cap = await probe();
    expect(cap.enrolled).toBe(false);
    expect(cap.passcode).toBe(true);
    expect(cap.kinds).toEqual([]);
  });

  it('survives the native module being absent entirely', async () => {
    // an older dev build, installed before this dependency existed: the import
    // fails and every function is undefined, so a bare call throws
    // synchronously and no `.catch` ever runs
    const names = [
      'hasHardwareAsync',
      'isEnrolledAsync',
      'supportedAuthenticationTypesAsync',
      'getEnrolledLevelAsync',
    ] as const;
    const bag = mocked as unknown as Record<string, unknown>;
    // clearAllMocks restores call history, not deleted properties — put them
    // back by hand or every later test in this file loses its mocks
    const saved = names.map((n) => [n, bag[n]] as const);
    names.forEach((n) => {
      bag[n] = undefined;
    });
    try {
      await expect(probe()).resolves.toEqual({
        hardware: false,
        enrolled: false,
        kinds: [],
        strong: false,
        passcode: false,
      });
    } finally {
      saved.forEach(([n, fn]) => {
        bag[n] = fn;
      });
    }
  });

  it('treats a module that answers undefined as no capability', async () => {
    goodPhone();
    // present but unimplemented: resolves undefined rather than rejecting, so
    // the catch never fires and a bare `.map` would take the app down
    mocked.supportedAuthenticationTypesAsync.mockResolvedValue(undefined as never);
    mocked.hasHardwareAsync.mockResolvedValue(undefined as never);
    const cap = await probe();
    expect(cap.kinds).toEqual([]);
    expect(cap.hardware).toBe(false);
  });

  it('never throws — a probe that fails reads as no capability', async () => {
    mocked.hasHardwareAsync.mockRejectedValue(new Error('no native module'));
    mocked.isEnrolledAsync.mockRejectedValue(new Error('no native module'));
    mocked.supportedAuthenticationTypesAsync.mockRejectedValue(new Error('no native module'));
    mocked.getEnrolledLevelAsync.mockRejectedValue(new Error('no native module'));
    await expect(probe()).resolves.toEqual({
      hardware: false,
      enrolled: false,
      kinds: [],
      strong: false,
      passcode: false,
    });
  });
});

describe('authenticate', () => {
  it('passes the reason through as the prompt', async () => {
    mocked.authenticateAsync.mockResolvedValue({ success: true });
    await expect(authenticate('Approve the lock request')).resolves.toEqual({ ok: true });
    expect(mocked.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ promptMessage: 'Approve the lock request' })
    );
  });

  it('leaves the device PIN available as a fallback', async () => {
    mocked.authenticateAsync.mockResolvedValue({ success: true });
    await authenticate('Unlock');
    // a finger that will not read on a cold morning must not lock you out of
    // your own alert — the OS passcode sheet is a legitimate second route
    expect(mocked.authenticateAsync).toHaveBeenCalledWith(expect.objectContaining({ disableDeviceFallback: false }));
  });

  it('demands a strong sensor when asked to', async () => {
    mocked.authenticateAsync.mockResolvedValue({ success: true });
    await authenticate('Approve', { strong: true });
    expect(mocked.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ biometricsSecurityLevel: 'strong' })
    );
  });

  it.each([
    ['user_cancel', 'cancelled'],
    ['app_cancel', 'cancelled'],
    ['system_cancel', 'cancelled'],
    ['user_fallback', 'cancelled'],
    ['lockout', 'lockout'],
    ['not_enrolled', 'unavailable'],
    ['not_available', 'unavailable'],
    ['passcode_not_set', 'unavailable'],
    ['authentication_failed', 'failed'],
    ['unknown', 'failed'],
  ])('maps %s to %s', async (error, reason) => {
    mocked.authenticateAsync.mockResolvedValue({ success: false, error } as never);
    await expect(authenticate('Unlock')).resolves.toEqual({ ok: false, reason });
  });

  it('treats a thrown native call as a failure, not a pass', async () => {
    // the one outcome that must never be reachable is a silent success
    mocked.authenticateAsync.mockRejectedValue(new Error('binder died'));
    await expect(authenticate('Unlock')).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('describeSensor', () => {
  it('names what the phone actually has', () => {
    expect(describeSensor(['fingerprint'])).toBe('Fingerprint');
    expect(describeSensor(['face'])).toBe('Face');
    expect(describeSensor(['iris'])).toBe('Iris');
  });

  it('names both when a phone carries both', () => {
    expect(describeSensor(['fingerprint', 'face'])).toBe('Fingerprint or Face');
  });

  it('falls back to a generic word rather than an empty label', () => {
    expect(describeSensor([])).toBe('Biometrics');
  });
});
