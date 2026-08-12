import * as SecureStore from 'expo-secure-store';
import {
  DEFAULT_ENDPOINTS,
  DESK_KEY,
  lanWsUrl,
  loadDeskBase,
  loadEndpoints,
  normaliseBase,
  saveDeskBase,
} from '../config';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const store = SecureStore as jest.Mocked<typeof SecureStore>;

beforeEach(() => {
  jest.clearAllMocks();
  store.getItemAsync.mockResolvedValue(null);
});

describe('normaliseBase', () => {
  it('takes an address exactly as typed when it is already right', () => {
    expect(normaliseBase('http://192.168.1.5:8000')).toBe('http://192.168.1.5:8000');
    expect(normaliseBase('https://jarvis.example.com')).toBe('https://jarvis.example.com');
  });

  it('assumes http when no scheme is given', () => {
    // people type an IP and a port; a desk on the LAN is not running TLS, so
    // this is not a mistake worth an error message
    expect(normaliseBase('192.168.1.5:8000')).toBe('http://192.168.1.5:8000');
    expect(normaliseBase('desk.local')).toBe('http://desk.local');
  });

  it('strips a trailing slash, which would otherwise break every URL', () => {
    // every url is built by concatenation, so a slash left on produces //ws
    expect(normaliseBase('http://192.168.1.5:8000/')).toBe('http://192.168.1.5:8000');
    expect(normaliseBase('http://192.168.1.5:8000///')).toBe('http://192.168.1.5:8000');
  });

  it('forgives surrounding whitespace, which a paste always brings', () => {
    expect(normaliseBase('  http://192.168.1.5:8000  ')).toBe('http://192.168.1.5:8000');
  });

  it('lowercases the scheme and host but leaves any path alone', () => {
    expect(normaliseBase('HTTP://Desk.Local:8000/Api')).toBe('http://desk.local:8000/Api');
  });

  it('refuses what cannot be dialled', () => {
    expect(normaliseBase('')).toBeNull();
    expect(normaliseBase('   ')).toBeNull();
    expect(normaliseBase('not a host')).toBeNull();
    expect(normaliseBase('http://')).toBeNull();
    expect(normaliseBase('ws://192.168.1.5:8000')).toBeNull();
  });

  it('refuses an impossible port rather than storing it', () => {
    expect(normaliseBase('192.168.1.5:0')).toBeNull();
    expect(normaliseBase('192.168.1.5:99999')).toBeNull();
    expect(normaliseBase('192.168.1.5:8000')).toBe('http://192.168.1.5:8000');
  });

  it('produces something the URL builders can actually use', () => {
    const base = normaliseBase('192.168.1.5:8000/');
    expect(base).not.toBeNull();
    expect(lanWsUrl({ deskBase: base as string, cloudBase: null }, 'abc')).toBe(
      'ws://192.168.1.5:8000/ws?token=abc'
    );
  });
});

describe('the stored desk address', () => {
  it('falls back to the build default when nothing is stored', async () => {
    await expect(loadEndpoints()).resolves.toEqual(DEFAULT_ENDPOINTS);
  });

  it('overrides the desk without touching the cloud gateway', async () => {
    // the two are read under separate keys, so setting one never moves the other.
    // The cloud address IS settable now (see cloudEndpoint.test.ts) — a URL baked
    // at bundle time cost a full rebuild to correct — but the phone still refuses
    // to reach a gateway that cannot serve, and the gateway refuses a phone with
    // no pairing token.
    store.getItemAsync.mockImplementation(async (key: string) =>
      key === DESK_KEY ? 'http://10.0.0.9:8000' : null
    );
    const e = await loadEndpoints();
    expect(e.deskBase).toBe('http://10.0.0.9:8000');
    expect(e.cloudBase).toBe(DEFAULT_ENDPOINTS.cloudBase);
  });

  it('writes under its own key', async () => {
    await saveDeskBase('http://10.0.0.9:8000');
    expect(store.setItemAsync).toHaveBeenCalledWith(DESK_KEY, 'http://10.0.0.9:8000');
  });

  it('forgets it on null, going back to the default', async () => {
    await saveDeskBase(null);
    expect(store.deleteItemAsync).toHaveBeenCalledWith(DESK_KEY);
    expect(store.setItemAsync).not.toHaveBeenCalled();
  });

  it('survives storage refusing to answer', async () => {
    store.getItemAsync.mockRejectedValue(new Error('keystore unavailable'));
    await expect(loadDeskBase()).resolves.toBeNull();
    await expect(loadEndpoints()).resolves.toEqual(DEFAULT_ENDPOINTS);
  });

  it('does not throw when storage refuses a write', async () => {
    store.setItemAsync.mockRejectedValue(new Error('keystore unavailable'));
    await expect(saveDeskBase('http://10.0.0.9:8000')).resolves.toBeUndefined();
  });
});
