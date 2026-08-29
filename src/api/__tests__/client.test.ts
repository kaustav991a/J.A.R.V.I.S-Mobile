import { createApi, ApiError } from '../client';

type Call = { url: string; init: RequestInit | undefined };

const recorder = (status = 200, body: unknown = { ok: true }) => {
  const calls: Call[] = [];
  const fetchImpl = jest.fn(async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
};

describe('createApi', () => {
  it('sends a bearer token on every request when one is configured', async () => {
    const { calls, fetchImpl } = recorder();
    const api = createApi({ baseUrl: 'http://desk:8000', token: 'sekrit', fetchImpl });
    await api.telemetry();
    expect(calls[0].url).toBe('http://desk:8000/api/telemetry');
    expect((calls[0].init!.headers as Record<string, string>).Authorization).toBe('Bearer sekrit');
  });

  it('omits the Authorization header when there is no token', async () => {
    const { calls, fetchImpl } = recorder();
    const api = createApi({ baseUrl: 'http://desk:8000', token: null, fetchImpl });
    await api.healthSummary();
    expect((calls[0].init!.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('maps each method to the documented path', async () => {
    const { calls, fetchImpl } = recorder();
    const api = createApi({ baseUrl: 'http://d', token: null, fetchImpl });
    await api.healthSummary();
    await api.telemetry();
    await api.pending();
    await api.tasks();
    await api.presence();
    expect(calls.map((c) => c.url)).toEqual([
      'http://d/api/health/summary',
      'http://d/api/telemetry',
      'http://d/api/agent/pending',
      'http://d/api/tasks',
      'http://d/api/presence/state',
    ]);
  });

  it('posts a backdoor command as json', async () => {
    const { calls, fetchImpl } = recorder();
    const api = createApi({ baseUrl: 'http://d', token: null, fetchImpl });
    await api.backdoor('lights on');
    expect(calls[0].url).toBe('http://d/api/backdoor');
    expect(calls[0].init!.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init!.body))).toEqual({ command: 'lights on' });
  });

  it('posts an approval decision', async () => {
    const { calls, fetchImpl } = recorder();
    const api = createApi({ baseUrl: 'http://d', token: null, fetchImpl });
    await api.confirm('a1', true);
    expect(calls[0].url).toBe('http://d/api/agent/confirm');
    expect(JSON.parse(String(calls[0].init!.body))).toEqual({ id: 'a1', approved: true });
  });

  it('posts a denial decision', async () => {
    const { calls, fetchImpl } = recorder();
    const api = createApi({ baseUrl: 'http://d', token: null, fetchImpl });
    await api.confirm('a1', false);
    expect(JSON.parse(String(calls[0].init!.body))).toEqual({ id: 'a1', approved: false });
  });

  it('throws ApiError carrying the status code on a failure response', async () => {
    const { fetchImpl } = recorder(403, { detail: 'bad token' });
    const api = createApi({ baseUrl: 'http://d', token: 'wrong', fetchImpl });
    await expect(api.telemetry()).rejects.toBeInstanceOf(ApiError);
    await expect(api.telemetry()).rejects.toMatchObject({ status: 403 });
  });

  it('wraps a network failure as ApiError with status 0', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const api = createApi({ baseUrl: 'http://d', token: null, fetchImpl });
    await expect(api.telemetry()).rejects.toMatchObject({ status: 0 });
  });
});

/**
 * The gateway-only routes.
 *
 * `baseUrl` follows the live link and becomes the *desk* once the desk attaches,
 * and the desk serves none of these. `registerPush` was sent to `baseUrl` for that
 * reason and stopped renewing the phone's push address the moment a desk connected
 * — a 404 that looks like a broken feature rather than a wrong address.
 */
describe('gateway-only routes', () => {
  const cloud = 'https://gateway.example.com';

  it('sends facts to the gateway even while the link points at the desk', async () => {
    const { calls, fetchImpl } = recorder(200, { facts: ['he has a dog'], persistent: true });
    const api = createApi({ baseUrl: 'http://desk:8000', cloudUrl: cloud, token: 't', fetchImpl });
    const out = await api.facts();
    expect(calls[0].url).toBe(`${cloud}/app-fact`);
    expect(out).toEqual({ facts: ['he has a dog'], persistent: true });
  });

  it('registers push against the gateway, not whatever is answering', async () => {
    const { calls, fetchImpl } = recorder();
    const api = createApi({ baseUrl: 'http://desk:8000', cloudUrl: cloud, token: 't', fetchImpl });
    await api.registerPush('ExponentPushToken[x]', 'android');
    expect(calls[0].url).toBe(`${cloud}/app-push/register`);
  });

  /**
   * The gateway is the only thing that can deliver a briefing on time.
   *
   * The local WorkManager job cannot: it requires a connected network on every
   * run and this uid has none in the background, so it only ever fires once the
   * app is opened. Sending the schedule to the desk instead would repeat the
   * mistake `registerPush` made — a 404 that reads as a broken feature rather
   * than a wrong address.
   */
  it('sends the commute schedule to the gateway, not to the desk', async () => {
    const { calls, fetchImpl } = recorder();
    const api = createApi({ baseUrl: 'http://desk:8000', cloudUrl: cloud, token: 't', fetchImpl });
    await api.syncCommute({ tz: 'Asia/Kolkata', days: [false, true, true, true, true, true, false], departures: [] });
    expect(calls[0].url).toBe(`${cloud}/app-commute`);
    expect(JSON.parse(String(calls[0].init!.body))).toMatchObject({ tz: 'Asia/Kolkata' });
  });

  it('reports a missing gateway as its own failure rather than calling the desk', async () => {
    // not a network error to retry: the route does not exist, and the screen
    // should say so instead of showing a spinner
    const { calls, fetchImpl } = recorder();
    const api = createApi({ baseUrl: 'http://desk:8000', cloudUrl: null, token: 't', fetchImpl });
    await expect(api.facts()).rejects.toThrow(/no cloud gateway/i);
    expect(calls).toHaveLength(0);
  });

  it('passes a fact to remember and reads back whether it was stored', async () => {
    const { calls, fetchImpl } = recorder(200, { stored: true, persistent: true, facts: ['a', 'b'] });
    const api = createApi({ baseUrl: 'http://desk:8000', cloudUrl: cloud, token: 't', fetchImpl });
    const out = await api.remember('his dog is Kitty');
    expect(JSON.parse(String(calls[0].init!.body))).toEqual({ fact: 'his dog is Kitty' });
    expect(out.stored).toBe(true);
    expect(out.facts).toEqual(['a', 'b']);
  });

  it('reads stored:false as held-not-saved rather than as success', async () => {
    // the gateway says this when it has no DATABASE_URL: the fact is live now and
    // gone on the next restart, which is not what "remember" means to a person
    const { fetchImpl } = recorder(200, { stored: false, persistent: false, facts: ['a'] });
    const api = createApi({ baseUrl: 'http://d', cloudUrl: cloud, token: 't', fetchImpl });
    expect((await api.remember('x')).stored).toBe(false);
  });

  it('sends a forget as its own field so it cannot be mistaken for an add', async () => {
    const { calls, fetchImpl } = recorder(200, { forgotten: true, facts: [] });
    const api = createApi({ baseUrl: 'http://d', cloudUrl: cloud, token: 't', fetchImpl });
    await api.forget('his dog is Kitty');
    expect(JSON.parse(String(calls[0].init!.body))).toEqual({ forget: 'his dog is Kitty' });
  });

  it('survives a gateway that answers without a facts array', async () => {
    const { fetchImpl } = recorder(200, { persistent: true });
    const api = createApi({ baseUrl: 'http://d', cloudUrl: cloud, token: 't', fetchImpl });
    expect((await api.facts()).facts).toEqual([]);
  });
});

/**
 * One token per door.
 *
 * The pairing token opened five gateway routes at once and never expired, so any
 * leak was a leak of all five, for good. The gateway derives a short-lived token
 * per capability now; these pin that the client asks for the right one, and —
 * the part that matters more — that it still reaches him when it cannot get one.
 */
describe('capability tokens', () => {
  const cloud = 'https://gateway.example';
  const withCaps = (fetchImpl: typeof fetch, tokens: Record<string, string>, refresh = jest.fn()) =>
    createApi({
      baseUrl: 'http://d',
      cloudUrl: cloud,
      token: 'the-master',
      capabilityToken: async (cap) => tokens[cap] ?? null,
      refreshCapabilityTokens: refresh,
      fetchImpl,
    });

  const auth = (call: { init: RequestInit | undefined }) =>
    (call.init!.headers as Record<string, string>).Authorization;

  it('registers the push address with a token that can only register a push address', async () => {
    const { calls, fetchImpl } = recorder();
    await withCaps(fetchImpl, { push: 'j1.push.tok' }).registerPush('ExponentPushToken[x]', 'android');
    expect(auth(calls[0])).toBe('Bearer j1.push.tok');
  });

  it('reads and writes facts with the memory token, and the schedule with state', async () => {
    const { calls, fetchImpl } = recorder(200, { facts: [], persistent: true });
    const api = withCaps(fetchImpl, { memory: 'j1.memory.tok', state: 'j1.state.tok' });
    await api.facts();
    await api.remember('a fact');
    await api.forget('a fact');
    await api.syncCommute({ tz: 'Asia/Kolkata', days: [], departures: [] } as never);
    expect(calls.map(auth)).toEqual([
      'Bearer j1.memory.tok',
      'Bearer j1.memory.tok',
      'Bearer j1.memory.tok',
      'Bearer j1.state.tok',
    ]);
  });

  it('falls back to the master for a door it has no token for', async () => {
    // an older gateway, an offline mint, SecureStore unavailable on web — all of
    // them land here, and all of them must still reach him
    const { calls, fetchImpl } = recorder();
    await withCaps(fetchImpl, {}).registerPush('ExponentPushToken[x]', 'android');
    expect(auth(calls[0])).toBe('Bearer the-master');
  });

  it('uses the master when no provider is configured at all', async () => {
    const { calls, fetchImpl } = recorder();
    const api = createApi({ baseUrl: 'http://d', cloudUrl: cloud, token: 'the-master', fetchImpl });
    await api.registerPush('ExponentPushToken[x]', 'android');
    expect(auth(calls[0])).toBe('Bearer the-master');
  });

  it('mints again and retries once when the gateway says the token expired', async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    let tokens: Record<string, string> = { memory: 'stale' };
    const fetchImpl = jest.fn(async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const expired = (init!.headers as Record<string, string>).Authorization === 'Bearer stale';
      return new Response(
        JSON.stringify(expired ? { error: 'token_expired', capability: 'memory' } : { facts: ['x'] }),
        { status: expired ? 401 : 200, headers: { 'content-type': 'application/json' } }
      );
    }) as unknown as typeof fetch;
    const api = createApi({
      baseUrl: 'http://d',
      cloudUrl: cloud,
      token: 'the-master',
      capabilityToken: async (cap) => tokens[cap] ?? null,
      refreshCapabilityTokens: async () => {
        tokens = { memory: 'fresh' };
      },
      fetchImpl,
    });
    expect((await api.facts()).facts).toEqual(['x']);
    expect(calls.map((c) => (c.init!.headers as Record<string, string>).Authorization)).toEqual([
      'Bearer stale',
      'Bearer fresh',
    ]);
  });

  it('does not retry a 401 that is not about expiry', async () => {
    // a wrong token is a bug or an intruder; re-minting for either would turn one
    // refusal into an endless pair of them
    const { calls, fetchImpl } = recorder(401, { error: 'wrong_capability' });
    const refresh = jest.fn();
    await expect(withCaps(fetchImpl, { memory: 'tok' }, refresh).facts()).rejects.toBeInstanceOf(
      ApiError
    );
    expect(calls).toHaveLength(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('leaves desk routes alone: the LAN desk knows nothing about capabilities', async () => {
    const { calls, fetchImpl } = recorder();
    await withCaps(fetchImpl, { memory: 'j1.memory.tok' }).tasks();
    expect(auth(calls[0])).toBe('Bearer the-master');
  });
});
