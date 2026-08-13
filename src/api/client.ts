export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type ApiConfig = { baseUrl: string; token: string | null; fetchImpl?: typeof fetch };

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
  registerPush(pushToken: string, platform: string): Promise<void>;
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
    registerPush: async (pushToken, platform) => {
      await post('/app-push/register', { push_token: pushToken, platform });
    },
  };
}
