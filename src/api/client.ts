import type { CommuteUpload } from '../lib/commuteSync';
import type { Capability } from '../link/capabilityTokens';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type ApiConfig = {
  baseUrl: string;
  /**
   * The cloud gateway, when one is configured, for the routes only it serves.
   *
   * `baseUrl` follows the live link, so it becomes the *desk* the moment the desk
   * attaches — and the desk serves no `/app-fact` or `/app-push/register`. Sending
   * a gateway-only request to whichever machine happens to be answering is a 404
   * that looks like a broken feature.
   */
  cloudUrl?: string | null;
  token: string | null;
  /**
   * The short-lived token for one gateway capability, when the phone has one.
   *
   * `token` above is the MASTER — the pairing secret that opens every route and
   * never expires. It is still what a request falls back to, because the gateway
   * still accepts it and an auth change that locks him out of his own assistant
   * would be worse than the leak it prevents. What this provider adds is that
   * the ordinary case stops being the master: the push address is registered
   * with a credential that can only register a push address.
   *
   * `refresh` is called once when the gateway says a token has expired, and the
   * request is retried with whatever comes back. Once, not in a loop: a second
   * expiry after a fresh mint is a clock problem, and retrying it forever would
   * turn that into a hang.
   */
  capabilityToken?: (cap: Capability) => Promise<string | null>;
  refreshCapabilityTokens?: () => Promise<void>;
  fetchImpl?: typeof fetch;
};

/** what J.A.R.V.I.S. holds as true about him, and whether it will survive a restart */
export type Facts = { facts: string[]; persistent: boolean };

export type Api = {
  healthSummary(): Promise<unknown>;
  telemetry(): Promise<unknown>;
  backdoor(text: string): Promise<unknown>;
  pending(): Promise<unknown>;
  confirm(id: string, approved: boolean): Promise<void>;
  /**
   * Answer a desk-watch alert. Separate from `confirm` on purpose: this one
   * decides whether a machine locks itself, and it must never be reachable by
   * anything that happens to hold an agent action id.
   */
  answerWatch(id: string, itWasMe: boolean): Promise<void>;
  tasks(): Promise<unknown>;
  presence(): Promise<unknown>;
  /**
   * Hand the cloud gateway this install's push address, so it can reach the
   * phone when no socket exists.
   *
   * A socket only survives while the app is running: Android suspends a
   * backgrounded process and the connection dies with it, which is exactly the
   * state the phone is in when the desk wakes up at 2am. Push is the only way
   * that news arrives. Gateway-only — the desk serves no such route.
   */
  registerPush(pushToken: string, platform: string, channels?: Record<string, string>): Promise<void>;
  /**
   * Hand the gateway the commute schedule, so IT can send the briefing.
   *
   * The briefing used to be entirely local, and measured on the device on
   * 2026-08-20 that cannot work: `expo-background-task` requires a connected
   * network for every run, and this uid reads
   * `Network: 108 (blocked=REASON_APP_BACKGROUND|REASON_APP_STANDBY)` with
   * `#netAvail=0` in a RARE standby bucket. The job was not late, it was
   * stopped — logcat caught it running 200ms after a cold launch, which is
   * exactly how the symptom was reported: the briefing arrives when you open
   * the app. A high-priority push is exempt from all of that.
   *
   * Gateway-only, like the routes above it, and idempotent: it replaces the
   * stored schedule rather than adding to it, so re-sending on every connect is
   * the recovery from Render wiping its disk.
   */
  syncCommute(upload: CommuteUpload): Promise<void>;
  /**
   * What the cloud brain believes about him, and the two ways to change it.
   *
   * Gateway-only, and gated by the pairing token there — these go into the system
   * prompt on every turn, so anything that can write here can decide what is true
   * about the operator.
   *
   * `persistent` false means the gateway has no database and the list dies with its
   * next restart. Surfaced rather than hidden: a memory that will quietly forget is
   * worse than one that admits it cannot remember.
   */
  facts(): Promise<Facts>;
  remember(fact: string): Promise<Facts & { stored: boolean }>;
  forget(fact: string): Promise<Facts>;
};

export function createApi(cfg: ApiConfig): Api {
  const doFetch = cfg.fetchImpl ?? fetch;

  const headers = (): Record<string, string> => {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (cfg.token) h.Authorization = `Bearer ${cfg.token}`;
    return h;
  };

  const request = async (path: string, init?: RequestInit): Promise<unknown> => {
    let res: Response;
    try {
      res = await doFetch(`${cfg.baseUrl}${path}`, { ...init, headers: { ...headers(), ...(init?.headers ?? {}) } });
    } catch (e) {
      throw new ApiError(e instanceof Error ? e.message : 'network error', 0);
    }
    if (!res.ok) throw new ApiError(`${path} failed with ${res.status}`, res.status);
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  };

  const post = (path: string, body: unknown): Promise<unknown> =>
    request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  /**
   * POST to the gateway specifically, wherever the live link happens to point.
   *
   * A named failure rather than a request to the wrong machine: with no gateway
   * configured this is not a network problem to retry, it is a route that does not
   * exist, and the screen should say so.
   */
  const postCloud = async (path: string, body: unknown, cap?: Capability): Promise<unknown> => {
    if (!cfg.cloudUrl) throw new ApiError('no cloud gateway is configured', 0);

    /**
     * One attempt, with whichever credential this call is entitled to.
     *
     * The capability token when there is one, the master otherwise — and the
     * master is not a degraded mode, it is what every install presented before
     * this existed and what the gateway still counts on `/health` so the
     * migration is a number rather than a hope.
     */
    const attempt = async (): Promise<Response> => {
      const scoped = cap && cfg.capabilityToken ? await cfg.capabilityToken(cap) : null;
      const auth = scoped ? { Authorization: `Bearer ${scoped}` } : headers();
      try {
        return await doFetch(`${cfg.cloudUrl}${path}`, {
          method: 'POST',
          headers: { ...auth, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (e) {
        throw new ApiError(e instanceof Error ? e.message : 'network error', 0);
      }
    };

    let res = await attempt();
    // Expiry is the ordinary end of a token's life, and the gateway says so in
    // the body rather than leaving a bare 401 to be guessed at. Mint and go
    // again, exactly once.
    if (res.status === 401 && cap && cfg.refreshCapabilityTokens) {
      const said = await res
        .clone()
        .text()
        .catch(() => '');
      if (said.includes('token_expired')) {
        await cfg.refreshCapabilityTokens();
        res = await attempt();
      }
    }
    if (!res.ok) throw new ApiError(`${path} failed with ${res.status}`, res.status);
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  };

  /** the gateway answers every fact route with the full list, so one reader does */
  const readFacts = (raw: unknown): Facts => {
    const o = (raw ?? {}) as { facts?: unknown; persistent?: unknown };
    return {
      facts: Array.isArray(o.facts) ? o.facts.filter((f): f is string => typeof f === 'string') : [],
      persistent: o.persistent === true,
    };
  };

  return {
    healthSummary: () => request('/api/health/summary'),
    telemetry: () => request('/api/telemetry'),
    backdoor: (text) => post('/api/backdoor', { command: text }),
    pending: () => request('/api/agent/pending'),
    confirm: async (id, approved) => {
      await post('/api/agent/confirm', { id, approved });
    },
    answerWatch: async (id, itWasMe) => {
      await post('/api/watch/answer', { id, approved: itWasMe });
    },
    tasks: () => request('/api/tasks'),
    presence: () => request('/api/presence/state'),
    // Gateway-only, and previously sent to `baseUrl` — so once the desk attached,
    // the phone was registering its push address with a machine that has no such
    // route, and push silently stopped being renewed.
    registerPush: async (pushToken, platform, channels) => {
      // The channels travel with the token because ONLY the phone knows what it
      // called them. Android discards a push addressed to a channel that does
      // not exist, and this app has renamed its everyday channel eight times —
      // every one of those renames silently broke replies until the gateway was
      // told, which nobody remembered to do.
      await postCloud('/app-push/register', { push_token: pushToken, platform, channels }, 'push');
    },
    // The schedule replaces whatever the gateway held, so a departure switched
    // off travels as an absence — see `commutePayload`, which is where the
    // filtering happens and why an empty list is meaningful rather than empty.
    syncCommute: async (upload) => {
      await postCloud('/app-commute', upload, 'state');
    },
    facts: async () => readFacts(await postCloud('/app-fact', {}, 'memory')),
    remember: async (fact) => {
      const raw = await postCloud('/app-fact', { fact }, 'memory');
      return { ...readFacts(raw), stored: (raw as { stored?: unknown })?.stored === true };
    },
    forget: async (fact) => readFacts(await postCloud('/app-fact', { forget: fact }, 'memory')),
  };
}
