import { lanWsUrl, cloudWsUrl, Endpoints } from '../config';
import { probeLan, probeCloud, chooseMode } from '../probe';

const endpoints: Endpoints = { deskBase: 'http://192.168.1.9:8000', cloudBase: 'https://jarvis.example.com' };

/** the desk answers a bare 200; the cloud must also declare it serves /app-link */
const okFetch = (): typeof fetch =>
  jest.fn(async () => new Response(JSON.stringify({ app_link: true }), { status: 200 })) as unknown as typeof fetch;

const failFetch = (): typeof fetch =>
  jest.fn(async () => {
    throw new Error('ECONNREFUSED');
  }) as unknown as typeof fetch;

/** resolves only after the abort signal fires, i.e. behaves like a dead host */
const hangingFetch = (): typeof fetch =>
  jest.fn((_url: unknown, init?: { signal?: AbortSignal }) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })
  ) as unknown as typeof fetch;

describe('ws url building', () => {
  it('builds a ws:// desk url with the token as a query param', () => {
    expect(lanWsUrl(endpoints, 'sekrit')).toBe('ws://192.168.1.9:8000/ws?token=sekrit');
  });

  it('omits the token param when there is no token', () => {
    expect(lanWsUrl(endpoints, null)).toBe('ws://192.168.1.9:8000/ws');
  });

  it('builds a wss:// cloud app-link url', () => {
    expect(cloudWsUrl(endpoints, 'sekrit')).toBe('wss://jarvis.example.com/app-link?token=sekrit');
  });

  it('returns null for a cloud url with no cloud configured', () => {
    expect(cloudWsUrl({ deskBase: endpoints.deskBase, cloudBase: null }, 'sekrit')).toBeNull();
  });
});

describe('probeLan', () => {
  it('hits /api/health/summary and returns true on 200', async () => {
    const fetchImpl = okFetch();
    await expect(probeLan(endpoints, { fetchImpl })).resolves.toBe(true);
    expect((fetchImpl as jest.Mock).mock.calls[0][0]).toBe('http://192.168.1.9:8000/api/health/summary');
  });

  it('returns false when the desk refuses the connection', async () => {
    await expect(probeLan(endpoints, { fetchImpl: failFetch() })).resolves.toBe(false);
  });

  it('returns false when the desk does not answer inside the timeout', async () => {
    await expect(probeLan(endpoints, { fetchImpl: hangingFetch(), lanTimeoutMs: 20 })).resolves.toBe(false);
  });
});

describe('probeCloud', () => {
  it('hits /health and accepts a gateway that declares app_link', async () => {
    const fetchImpl = okFetch();
    await expect(probeCloud(endpoints, { fetchImpl })).resolves.toBe(true);
    expect((fetchImpl as jest.Mock).mock.calls[0][0]).toBe('https://jarvis.example.com/health');
  });

  it('returns false with no cloud configured, without calling fetch', async () => {
    const fetchImpl = okFetch();
    await expect(probeCloud({ deskBase: endpoints.deskBase, cloudBase: null }, { fetchImpl })).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('chooseMode', () => {
  it('prefers lan when the desk answers', async () => {
    await expect(chooseMode(endpoints, { fetchImpl: okFetch() })).resolves.toBe('lan');
  });

  it('falls back to cloud when only the cloud answers', async () => {
    const fetchImpl = jest.fn(async (url: unknown) => {
      if (String(url).includes('192.168')) throw new Error('ECONNREFUSED');
      return new Response(JSON.stringify({ app_link: true }), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(chooseMode(endpoints, { fetchImpl })).resolves.toBe('cloud');
  });

  it('goes offline when neither answers', async () => {
    await expect(chooseMode(endpoints, { fetchImpl: failFetch() })).resolves.toBe('offline');
  });

  it('treats a non-200 response as unreachable', async () => {
    const fetchImpl = jest.fn(async () => new Response('nope', { status: 503 })) as unknown as typeof fetch;
    await expect(chooseMode(endpoints, { fetchImpl })).resolves.toBe('offline');
  });

  it('never probes the cloud when lan wins', async () => {
    const fetchImpl = okFetch();
    await chooseMode(endpoints, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
