// Node stand-in for jarvis-backend. Frame shapes mirror what main.py sends;
// if they drift, the app is testing a fiction — update both together.
const http = require('http');
const { WebSocketServer } = require('ws');

const json = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
};

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });

const jitter = (base, spread) => Math.max(0, Math.min(100, Math.round(base + (Math.random() - 0.5) * spread)));

async function startMockServer(opts = {}) {
  const { port = 8787, tickMs = 2000, timeline = true } = opts;

  const state = {
    telemetry: { cpu: 34, mem: 61, disk: 48, gpu: 12, temp: 52, battery: 88, net_up: 120, net_down: 940 },
    parked: [],
    tasks: [{ id: 't1', title: 'Draft the release note', state: 'queued' }],
    presence: { present: true, source: 'app_geofence', since: 'boot' },
  };

  const sockets = new Set();

  const broadcast = (frame) => {
    if (frame.type === 'agent_parked') {
      const id = frame.id || frame.action_id || frame.request_id;
      if (id && !state.parked.some((p) => p.id === id)) state.parked.push({ ...frame, id });
    }
    const raw = JSON.stringify(frame);
    for (const ws of sockets) {
      if (ws.readyState === 1) ws.send(raw);
    }
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;

    if (req.method === 'GET' && path === '/api/health/summary') {
      return json(res, 200, { status: 'ok', uptime_s: 1234, modules: { agent: 'ok', voice: 'ok' } });
    }
    if (req.method === 'GET' && path === '/health') {
      return json(res, 200, { status: 'ok' });
    }
    if (req.method === 'GET' && path === '/api/telemetry') {
      return json(res, 200, state.telemetry);
    }
    if (req.method === 'GET' && path === '/api/agent/pending') {
      return json(res, 200, { pending: state.parked });
    }
    if (req.method === 'GET' && path === '/api/tasks') {
      return json(res, 200, { tasks: state.tasks });
    }
    if (req.method === 'GET' && path === '/api/presence/state') {
      return json(res, 200, state.presence);
    }
    if (req.method === 'POST' && path === '/api/backdoor') {
      const body = await readBody(req);
      const command = String(body.command ?? '');
      broadcast({ status: 'thinking', message: '' });
      setTimeout(() => broadcast({ status: 'speaking', message: `Acknowledged: ${command}`, user: 'sir' }), 200);
      return json(res, 200, { ok: true, command });
    }
    if (req.method === 'POST' && path === '/api/agent/confirm') {
      const body = await readBody(req);
      const id = String(body.id ?? '');
      const approved = body.approved === true;
      state.parked = state.parked.filter((p) => p.id !== id);
      broadcast({ type: 'agent_confirm', id, resolved: true, approved });
      broadcast({
        status: 'speaking',
        message: approved ? 'Action approved. Proceeding.' : 'Action denied. Standing down.',
      });
      return json(res, 200, { ok: true, id, approved });
    }
    return json(res, 404, { detail: 'not found' });
  });

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    sockets.add(ws);
    ws.send(JSON.stringify({ status: 'online', message: 'Good evening. All systems nominal.', user: 'sir' }));
    ws.send(JSON.stringify({ status: 'sync', type: 'telemetry', data: state.telemetry }));
    ws.send(JSON.stringify({ status: 'sync', type: 'weather', data: { temp: 31, desc: 'haze', city: 'Kolkata' } }));
    for (const p of state.parked) ws.send(JSON.stringify({ ...p, type: 'agent_parked' }));
    ws.on('message', (raw) => {
      const text = String(raw);
      broadcast({ status: 'thinking', message: '' });
      setTimeout(() => broadcast({ status: 'speaking', message: `Acknowledged: ${text}`, user: 'sir' }), 200);
    });
    ws.on('close', () => sockets.delete(ws));
  });

  const timers = [];
  if (timeline) {
    timers.push(
      setInterval(() => {
        state.telemetry = {
          ...state.telemetry,
          cpu: jitter(state.telemetry.cpu, 18),
          mem: jitter(state.telemetry.mem, 8),
        };
        broadcast({ status: 'sync', type: 'telemetry', data: state.telemetry });
      }, tickMs)
    );
    timers.push(
      setTimeout(() => {
        broadcast({ type: 'agent_step', goal: 'tidy downloads', event: 'thinking', detail: 'listing files', step: 1 });
        broadcast({ type: 'agent_step', goal: 'tidy downloads', event: 'plan', detail: '3 stale installers', step: 2 });
      }, tickMs * 3)
    );
    timers.push(
      setTimeout(() => {
        broadcast({
          type: 'agent_parked',
          id: 'demo-1',
          goal: 'tidy downloads',
          action: 'delete 3 files',
          detail: 'setup_old.exe, node_v12.msi, tmp.iso',
          risk: 'high',
        });
        broadcast({ status: 'alert', message: 'Approval required, sir.' });
      }, tickMs * 6)
    );
    for (const t of timers) if (typeof t.unref === 'function') t.unref();
  }

  await new Promise((resolve) => server.listen(port, resolve));
  const actualPort = server.address().port;

  return {
    port: actualPort,
    httpBase: `http://127.0.0.1:${actualPort}`,
    wsUrl: `ws://127.0.0.1:${actualPort}/ws`,
    broadcast,
    close: () =>
      new Promise((resolve) => {
        for (const t of timers) {
          clearInterval(t);
          clearTimeout(t);
        }
        for (const ws of sockets) ws.terminate();
        wss.close(() => server.close(resolve));
      }),
  };
}

module.exports = { startMockServer };

if (require.main === module) {
  startMockServer().then((s) => {
    console.log(`mock jarvis backend on ${s.httpBase}  (ws ${s.wsUrl})`);
  });
}
