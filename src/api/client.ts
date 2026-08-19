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
  const postCloud = async (path: string, body: unknown): Promise<unknown> => {
    if (!cfg.cloudUrl) throw new ApiError('no cloud gateway is configured', 0);
    let res: Response;
    try {
      res = await doFetch(`${cfg.cloudUrl}${path}`, {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
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
      await postCloud('/app-push/register', { push_token: pushToken, platform, channels });
    },
    facts: async () => readFacts(await postCloud('/app-fact', {})),
    remember: async (fact) => {
      const raw = await postCloud('/app-fact', { fact });
      return { ...readFacts(raw), stored: (raw as { stored?: unknown })?.stored === true };
    },
    forget: async (fact) => readFacts(await postCloud('/app-fact', { forget: fact })),
  };
}
