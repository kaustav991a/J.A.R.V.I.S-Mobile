import * as SecureStore from 'expo-secure-store';
import { CLOUD_KEY, DEFAULT_ENDPOINTS, DESK_KEY, cloudWsUrl, loadCloudBase, loadEndpoints, saveCloudBase } from '../config';
import { LinkMachine, MachineDeps, MinimalSocket } from '../machine';

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

describe('the cloud gateway address', () => {
  it('is remembered, so a moved gateway does not cost an app rebuild', async () => {
    // EXPO_PUBLIC_JARVIS_CLOUD is baked at bundle time. That was fine until the
    // URL was wrong on a phone with no way to correct it.
    await saveCloudBase('https://jarvis-cloud-gateway.onrender.com');
    expect(store.setItemAsync).toHaveBeenCalledWith(CLOUD_KEY, 'https://jarvis-cloud-gateway.onrender.com');
  });

  it('falls back to the build default when nothing is stored', async () => {
    const e = await loadEndpoints();
    expect(e.cloudBase).toBe(DEFAULT_ENDPOINTS.cloudBase);
  });

  it('takes precedence over the build default once set', async () => {
    store.getItemAsync.mockImplementation(async (key: string) =>
      key === CLOUD_KEY ? 'https://elsewhere.onrender.com' : null
    );
    const e = await loadEndpoints();
    expect(e.cloudBase).toBe('https://elsewhere.onrender.com');
  });

  it('does not lose a stored desk address, and vice versa', async () => {
    // loadEndpoints used to rebuild from DEFAULT_ENDPOINTS, which quietly threw
    // away whichever of the two was not being read
    store.getItemAsync.mockImplementation(async (key: string) => {
      if (key === CLOUD_KEY) return 'https://gw.onrender.com';
      if (key === DESK_KEY) return 'http://192.168.1.9:8000';
      return null;
    });
    const e = await loadEndpoints();
    expect(e).toEqual({ deskBase: 'http://192.168.1.9:8000', cloudBase: 'https://gw.onrender.com' });
  });

  it('is forgotten by passing null', async () => {
    await saveCloudBase(null);
    expect(store.deleteItemAsync).toHaveBeenCalledWith(CLOUD_KEY);
  });

  it('survives a SecureStore that throws, because a read failure is not a crash', async () => {
    store.getItemAsync.mockRejectedValue(new Error('keystore locked'));
    await expect(loadCloudBase()).resolves.toBeNull();
  });
});

describe('the /app-link URL', () => {
  it('carries the pairing token as a query parameter', () => {
    // React Native's WebSocket cannot set handshake headers, which is the whole
    // reason the gateway checks a query parameter rather than a header
    expect(cloudWsUrl({ deskBase: 'http://d', cloudBase: 'https://gw.onrender.com' }, 'sekrit')).toBe(
      'wss://gw.onrender.com/app-link?token=sekrit'
    );
  });

  it('is null when no gateway is configured, so nothing dials nowhere', () => {
    expect(cloudWsUrl({ deskBase: 'http://d', cloudBase: null }, 'sekrit')).toBeNull();
  });
});

describe('sending a voice clip', () => {
  const fakeSocket = () => {
    const sent: (string | ArrayBuffer)[] = [];
    const socket: MinimalSocket = {
      send: (data) => sent.push(data),
      close: () => undefined,
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
    };
    return { socket, sent };
  };

  const build = (socket: MinimalSocket) => {
    const deps: MachineDeps = {
      endpoints: { deskBase: 'http://desk', cloudBase: 'https://gw' },
      token: 't',
      fetchImpl: (async () => ({ status: 200, json: async () => ({ app_link: true }) })) as unknown as typeof fetch,
      wsFactory: () => socket,
      now: () => 0,
      onFrame: () => undefined,
    };
    return new LinkMachine(deps);
  };

  it('writes the clip as bytes, not base64', async () => {
    // base64 is a third larger, and the clip is the biggest thing this socket
    // ever carries
    const { socket, sent } = fakeSocket();
    const machine = build(socket);
    await machine.start();
    socket.onopen?.();
    const clip = new ArrayBuffer(8);
    expect(machine.sendVoice(clip)).toBe(true);
    expect(sent[0]).toBe(clip);
  });

  it('refuses when the socket is not open, rather than dropping the clip silently', () => {
    const { socket } = fakeSocket();
    const machine = build(socket);
    expect(machine.sendVoice(new ArrayBuffer(4))).toBe(false);
  });
});
