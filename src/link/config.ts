import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type LinkMode = 'lan' | 'cloud' | 'offline';

export type LinkStatus = 'idle' | 'probing' | 'connecting' | 'open' | 'closed';

export type Endpoints = {
  /** e.g. http://192.168.1.9:8000 — no trailing slash */
  deskBase: string;
  /** e.g. https://jarvis.onrender.com — null when no cloud gateway is configured */
  cloudBase: string | null;
};

export const DEFAULT_ENDPOINTS: Endpoints = {
  deskBase: process.env.EXPO_PUBLIC_JARVIS_DESK ?? 'http://127.0.0.1:8787',
  cloudBase: process.env.EXPO_PUBLIC_JARVIS_CLOUD ?? null,
};

const withToken = (url: string, token: string | null): string =>
  token ? `${url}?token=${encodeURIComponent(token)}` : url;

const toWs = (httpBase: string): string => httpBase.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');

export const lanWsUrl = (e: Endpoints, token: string | null): string => withToken(`${toWs(e.deskBase)}/ws`, token);

export const cloudWsUrl = (e: Endpoints, token: string | null): string | null =>
  e.cloudBase ? withToken(`${toWs(e.cloudBase)}/app-link`, token) : null;

export const TOKEN_KEY = 'jarvis_app_token';
export const DESK_KEY = 'jarvis_desk_base';
export const CLOUD_KEY = 'jarvis_cloud_base';

/**
 * Clean up a desk address typed by hand, or reject it.
 *
 * Returns the address to store, or null if it is not usable. Pure, so the rules
 * are testable without a device.
 *
 * People type `192.168.1.5:8000`, and a scheme-less address is not a mistake
 * worth an error message — assume `http://`, since a desk on the LAN is not
 * running TLS. A trailing slash is also not a mistake, but it has to go: every
 * URL is built by concatenation (`${base}/ws`), so a slash left on the end
 * produces `//ws` and a desk that never answers.
 */
export function normaliseBase(input: string): string | null {
  const text = input.trim();
  if (!text) return null;

  const withScheme = /^https?:\/\//i.test(text) ? text : `http://${text}`;
  const trimmed = withScheme.replace(/\/+$/, '');

  const shape = /^(https?):\/\/([a-zA-Z0-9._-]+)(?::(\d{1,5}))?(\/[^\s]*)?$/i.exec(trimmed);
  if (!shape) return null;

  const port = shape[3];
  if (port !== undefined && (Number(port) === 0 || Number(port) > 65535)) return null;

  // the scheme is case-insensitive and the host effectively so; leave any path
  // alone, since that half can be case-sensitive
  return `${shape[1].toLowerCase()}://${shape[2].toLowerCase()}${port ? `:${port}` : ''}${shape[4] ?? ''}`;
}

/** the desk address the user set, or null to fall back to the build's default */
export async function loadDeskBase(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await SecureStore.getItemAsync(DESK_KEY);
  } catch {
    return null;
  }
}

/** pass null to forget it and go back to the default */
export async function saveDeskBase(base: string | null): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (base === null) await SecureStore.deleteItemAsync(DESK_KEY);
    else await SecureStore.setItemAsync(DESK_KEY, base);
  } catch {
    // an address that cannot be persisted still applies for this session
  }
}

/** the gateway address the user set, or null to fall back to the build's default */
export async function loadCloudBase(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await SecureStore.getItemAsync(CLOUD_KEY);
  } catch {
    return null;
  }
}

/** pass null to forget it and go back to the build-time default */
export async function saveCloudBase(base: string | null): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (base === null) await SecureStore.deleteItemAsync(CLOUD_KEY);
    else await SecureStore.setItemAsync(CLOUD_KEY, base);
  } catch {
    // a gateway that cannot be persisted still applies for this session
  }
}

/**
 * The endpoints to actually dial: the build's defaults, with anything the user
 * stored taking precedence.
 *
 * The gateway address was deliberately build-only at first — one fixed brain
 * rather than something to point around. It is settable now because
 * `EXPO_PUBLIC_JARVIS_CLOUD` is baked at bundle time, so a wrong or moved URL
 * otherwise costs a full rebuild to correct, and the phone was left unable to
 * reach anything in the meantime. The danger it was guarding against is real but
 * is answered elsewhere: the gateway refuses every socket that does not present
 * the pairing token, so pointing the phone somewhere new gets you a refusal, not
 * a brain that answers as you.
 */
export async function loadEndpoints(): Promise<Endpoints> {
  const [desk, cloud] = await Promise.all([loadDeskBase(), loadCloudBase()]);
  return {
    deskBase: desk ?? DEFAULT_ENDPOINTS.deskBase,
    cloudBase: cloud ?? DEFAULT_ENDPOINTS.cloudBase,
  };
}

/** SecureStore is unavailable on web; the app degrades to no token there. */
export async function loadToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function saveToken(token: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

/** forget the pairing token — unpairing this phone from the desk */
export async function clearToken(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // nothing stored is the state we wanted anyway
  }
}
