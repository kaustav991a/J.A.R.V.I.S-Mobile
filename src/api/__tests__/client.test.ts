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
