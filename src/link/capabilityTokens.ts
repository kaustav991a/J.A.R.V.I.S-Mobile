import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * One token per door, instead of one secret for the whole house.
 *
 * The pairing token in SecureStore opened five gateway routes at once — the
 * socket onto a brain that answers as him, the push address, the commute
 * schedule, the fact store that feeds every system prompt, and the route that
 * puts words in the assistant's mouth. Any leak of it was a leak of all five,
 * and nothing expired, so a leak was permanent.
 *
 * The gateway now derives a short-lived token per capability from that same
 * master (`POST /app-tokens`, master-only). This module is the phone's half: it
 * exchanges once, keeps the result in SecureStore beside the master, hands the
 * right one to each call, and re-mints before they lapse.
 *
 * **The master never leaves SecureStore except to mint.** That is the whole
 * point: what the app carries around in memory and attaches to requests is a
 * credential that opens one door for a few weeks, and a minting endpoint that
 * refuses everything except the master is what stops a leaked one renewing
 * itself.
 *
 * **Nothing here is load-bearing for reaching him.** Every failure path falls
 * back to the master, which the gateway still accepts on every route. A phone
 * that cannot mint — offline, an older gateway, SecureStore unavailable on web —
 * behaves exactly as it did before this file existed. Security work that can
 * lock him out of his own assistant is not security work.
 */

export const CAPABILITIES = ['link', 'push', 'state', 'memory', 'say'] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Where the derived tokens live, beside the master rather than in place of it. */
export const CAP_TOKENS_KEY = 'jarvis_cap_tokens';

export type CapabilityTokens = {
  /** one per capability; a missing entry simply means "use the master" */
  tokens: Partial<Record<Capability, string>>;
  /** unix SECONDS, as the gateway states it */
  expiresAt: number;
  /** which gateway minted them — pointing the phone elsewhere invalidates these */
  origin: string;
};

/**
 * Re-mint this long before they lapse.
 *
 * Three days rather than three hours: the phone is only guaranteed to be awake
 * and online when he opens the app, and a window that assumes a background run
 * is a window that closes on a quiet weekend. A token that expires unrefreshed
 * still costs nothing — the call falls back to the master — but the fallback is
 * the safety net, not the plan.
 */
export const REFRESH_BEFORE_SECS = 3 * 24 * 60 * 60;

const isCapability = (v: unknown): v is Capability =>
  typeof v === 'string' && (CAPABILITIES as readonly string[]).includes(v);

/** Parse whatever came back from the gateway, keeping only what is usable. */
export function readMinted(raw: unknown, origin: string): CapabilityTokens | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as { tokens?: unknown; expires_at?: unknown };
  if (o.tokens === null || typeof o.tokens !== 'object') return null;
  const tokens: Partial<Record<Capability, string>> = {};
  for (const [cap, token] of Object.entries(o.tokens as Record<string, unknown>)) {
    // an unknown capability is not an error: a newer gateway may mint doors this
    // build has never heard of, and dropping them silently is right
    if (isCapability(cap) && typeof token === 'string' && token.trim()) tokens[cap] = token.trim();
  }
  const expiresAt = typeof o.expires_at === 'number' ? Math.floor(o.expires_at) : 0;
  if (!Object.keys(tokens).length || !expiresAt) return null;
  return { tokens, expiresAt, origin };
}

/**
 * Whether a stored set can still be used for `origin`.
 *
 * The origin check is not paranoia: these are derived from the gateway's own
 * secret, so a set minted by one gateway is refused by another — and a refusal
 * that looks like a broken feature is exactly what pointing the phone at a new
 * URL used to produce.
 */
export function usable(set: CapabilityTokens | null, origin: string, nowSecs: number): boolean {
  return !!set && set.origin === origin && set.expiresAt > nowSecs;
}

export function needsRefresh(set: CapabilityTokens | null, origin: string, nowSecs: number): boolean {
  if (!usable(set, origin, nowSecs)) return true;
  return (set as CapabilityTokens).expiresAt - nowSecs < REFRESH_BEFORE_SECS;
}

/** SecureStore is unavailable on web; there the phone simply uses the master. */
export async function loadCapabilityTokens(): Promise<CapabilityTokens | null> {
  if (Platform.OS === 'web') return null;
  try {
    const raw = await SecureStore.getItemAsync(CAP_TOKENS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CapabilityTokens;
    if (!parsed || typeof parsed !== 'object' || !parsed.tokens) return null;
    return parsed;
  } catch {
    // a corrupt store mints again rather than failing the call
    return null;
  }
}

export async function saveCapabilityTokens(set: CapabilityTokens): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.setItemAsync(CAP_TOKENS_KEY, JSON.stringify(set));
  } catch {
    // one unpersisted mint costs a re-mint on the next launch, never a request
  }
}

export async function clearCapabilityTokens(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.deleteItemAsync(CAP_TOKENS_KEY);
  } catch {
    // nothing stored is the state we wanted anyway
  }
}

type MintDeps = {
  fetchImpl?: typeof fetch;
  now?: () => number;
  load?: () => Promise<CapabilityTokens | null>;
  save?: (set: CapabilityTokens) => Promise<void>;
};

/**
 * Ask the gateway for a fresh set. Returns null if it could not, which is not
 * an error anywhere — every caller falls back to the master.
 */
export async function mint(
  cloudUrl: string,
  master: string,
  deps: MintDeps = {}
): Promise<CapabilityTokens | null> {
  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${cloudUrl}/app-tokens`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${master}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    // 404 is an older gateway that has never heard of capabilities, and it is a
    // perfectly good gateway: say nothing, use the master
    if (!res.ok) return null;
    const set = readMinted(JSON.parse(await res.text()), cloudUrl);
    if (set) await (deps.save ?? saveCapabilityTokens)(set);
    return set;
  } catch {
    return null;
  }
}

/**
 * The set to use right now, minting only when the stored one is missing, stale,
 * or from another gateway.
 *
 * Deliberately not a scheduled refresh. There is no clock in this app that runs
 * while it is closed, and a token store that only stays current if a background
 * job fires is a token store that expires exactly when he has not opened the app
 * for a week.
 */
export async function ensure(
  cloudUrl: string | null | undefined,
  master: string | null | undefined,
  deps: MintDeps = {}
): Promise<CapabilityTokens | null> {
  if (!cloudUrl || !master) return null;
  const nowSecs = Math.floor((deps.now ?? Date.now)() / 1000);
  const stored = await (deps.load ?? loadCapabilityTokens)();
  if (!needsRefresh(stored, cloudUrl, nowSecs)) return stored;
  const minted = await mint(cloudUrl, master, deps);
  // A failed re-mint keeps whatever is still valid: a set with two days left is
  // worth more than nothing, and the fallback to the master is still there under
  // both.
  return minted ?? (usable(stored, cloudUrl, nowSecs) ? stored : null);
}

/**
 * One cache, shared by everything that talks to the gateway.
 *
 * Three callers need the same set: the REST client, the socket dial, and the
 * headless commute task. Each minting its own would triple the exchanges and,
 * worse, would let them disagree about which set is current.
 */
export type CapabilityProvider = {
  /** the token for one door, or null when the master will have to do */
  token: (cap: Capability) => Promise<string | null>;
  /** force a fresh mint — what an expired-token reply asks for */
  refresh: () => Promise<CapabilityTokens | null>;
};

export function makeCapabilityProvider(
  cloudUrl: string | null | undefined,
  master: string | null | undefined,
  deps: MintDeps = {}
): CapabilityProvider {
  let cached: CapabilityTokens | null = null;
  let inFlight: Promise<CapabilityTokens | null> | null = null;

  const load = async (): Promise<CapabilityTokens | null> => {
    if (cached) return cached;
    return await (deps.load ?? loadCapabilityTokens)();
  };

  // Shared, so a screen that fires four requests at once mints once rather than
  // four times — and so the four agree about which set they got.
  const current = async (): Promise<CapabilityTokens | null> => {
    if (!inFlight) {
      inFlight = ensure(cloudUrl, master, { ...deps, load }).finally(() => {
        inFlight = null;
      });
    }
    cached = await inFlight;
    return cached;
  };

  return {
    token: async (cap) => {
      if (!cloudUrl) return null;
      const nowSecs = Math.floor((deps.now ?? Date.now)() / 1000);
      return tokenFor(await current(), cap, cloudUrl, nowSecs);
    },
    refresh: async () => {
      cached = null;
      if (!cloudUrl || !master) return null;
      cached = await mint(cloudUrl, master, deps);
      return cached;
    },
  };
}

/** The token for one door, or null to mean "the master will have to do". */
export function tokenFor(
  set: CapabilityTokens | null,
  cap: Capability,
  origin: string,
  nowSecs: number
): string | null {
  if (!usable(set, origin, nowSecs)) return null;
  return (set as CapabilityTokens).tokens[cap] ?? null;
}
