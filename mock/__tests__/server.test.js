const WebSocket = require('ws');
const { startMockServer } = require('../server');
// jest-expo's global `fetch` is a stubbed native module and returns no status
// or body — see mock/nodeFetch.js. These tests need a real socket.
const { nodeFetch: fetch } = require('../nodeFetch');

let server;

beforeEach(async () => {
  server = await startMockServer({ port: 0, timeline: false });
});

afterEach(async () => {
  await server.close();
});

const get = async (path) => {
  const res = await fetch(`${server.httpBase}${path}`);
  return { status: res.status, body: await res.json() };
};

describe('mock server rest surface', () => {
  it('answers the lan probe', async () => {
    const { status, body } = await get('/api/health/summary');
    expect(status).toBe(200);
    expect(body).toHaveProperty('status');
  });

  it('serves cold-start telemetry', async () => {
    const { body } = await get('/api/telemetry');
    expect(typeof body.cpu).toBe('number');
    expect(typeof body.mem).toBe('number');
  });

  it('serves pending governance actions, tasks and presence', async () => {
    expect((await get('/api/agent/pending')).status).toBe(200);
    expect((await get('/api/tasks')).status).toBe(200);
    expect((await get('/api/presence/state')).status).toBe(200);
  });

  it('404s an unknown path', async () => {
    const res = await fetch(`${server.httpBase}/api/nope`);
    expect(res.status).toBe(404);
  });
});

describe('mock server websocket', () => {
  const collect = (ws, n) =>
    new Promise((resolve) => {
      const got = [];
      ws.on('message', (raw) => {
        got.push(JSON.parse(String(raw)));
        if (got.length >= n) resolve(got);
      });
    });

  it('greets a new socket with a status frame', async () => {
    const ws = new WebSocket(server.wsUrl);
    const [first] = await collect(ws, 1);
    expect(first).toMatchObject({ status: expect.any(String) });
    ws.close();
  });

  // The connect greeting is written synchronously when the server accepts the
  // socket, so it has already been delivered by the time 'open' fires on the
  // client and this listener attaches. Only the broadcast is counted here.
  it('broadcasts an arbitrary frame to connected clients', async () => {
    const ws = new WebSocket(server.wsUrl);
    await new Promise((r) => ws.on('open', r));
    const pending = collect(ws, 1);
    server.broadcast({ status: 'sync', type: 'telemetry', data: { cpu: 7, mem: 8 } });
    const frames = await pending;
    expect(frames[0]).toEqual({ status: 'sync', type: 'telemetry', data: { cpu: 7, mem: 8 } });
    ws.close();
  });

  it('POST /api/backdoor echoes the command back over the socket', async () => {
    const ws = new WebSocket(server.wsUrl);
    await new Promise((r) => ws.on('open', r));
    const pending = collect(ws, 2);
    await fetch(`${server.httpBase}/api/backdoor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'lights on' }),
    });
    const frames = await pending;
    expect(JSON.stringify(frames)).toContain('lights on');
    ws.close();
  });

  it('POST /api/agent/confirm broadcasts a resolved agent_confirm', async () => {
    const ws = new WebSocket(server.wsUrl);
    await new Promise((r) => ws.on('open', r));
    server.broadcast({ type: 'agent_parked', id: 'p1', goal: 'tidy', action: 'delete 3 files', risk: 'high' });
    const pending = new Promise((resolve) => {
      ws.on('message', (raw) => {
        const f = JSON.parse(String(raw));
        if (f.type === 'agent_confirm') resolve(f);
      });
    });
    await fetch(`${server.httpBase}/api/agent/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'p1', approved: false }),
    });
    const frame = await pending;
    expect(frame).toMatchObject({ type: 'agent_confirm', id: 'p1', resolved: true, approved: false });
    ws.close();
  });

  it('drops a confirmed action from /api/agent/pending', async () => {
    server.broadcast({ type: 'agent_parked', id: 'p2', goal: 'tidy', action: 'rm -rf', risk: 'high' });
    await fetch(`${server.httpBase}/api/agent/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'p2', approved: true }),
    });
    const { body } = await get('/api/agent/pending');
    expect(JSON.stringify(body)).not.toContain('p2');
  });
});
