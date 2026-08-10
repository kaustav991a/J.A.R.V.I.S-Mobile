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
