import { LinkMachine, MinimalSocket, LinkSnapshot } from '../machine';
import { Endpoints } from '../config';
import { JarvisFrame } from '../../ws/frames';

const endpoints: Endpoints = { deskBase: 'http://desk:8000', cloudBase: 'https://cloud.test' };

class FakeSocket implements MinimalSocket {
  static opened: FakeSocket[] = [];
  sent: string[] = [];
  closed = false;
  onopen: ((e?: unknown) => void) | null = null;
  onclose: ((e?: unknown) => void) | null = null;
  onerror: ((e?: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;

  constructor(public url: string) {
    FakeSocket.opened.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.onclose?.();
  }
  /** test helpers */
  open() {
    this.onopen?.();
  }
  emit(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

const lanUp = (): typeof fetch => jest.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
const allDown = (): typeof fetch =>
  jest.fn(async () => {
    throw new Error('ECONNREFUSED');
  }) as unknown as typeof fetch;
const cloudOnly = (): typeof fetch =>
  jest.fn(async (url: unknown) => {
    if (String(url).includes('desk')) throw new Error('ECONNREFUSED');
    return new Response(JSON.stringify({ app_link: true }), { status: 200 });
  }) as unknown as typeof fetch;

type Harness = {
  machine: LinkMachine;
  frames: Array<{ frame: JarvisFrame; at: number }>;
  snapshots: LinkSnapshot[];
  clock: { t: number };
};

const build = (fetchImpl: typeof fetch): Harness => {
  const frames: Array<{ frame: JarvisFrame; at: number }> = [];
  const snapshots: LinkSnapshot[] = [];
  const clock = { t: 0 };
  const machine = new LinkMachine({
    endpoints,
    token: 'sekrit',
    fetchImpl,
    wsFactory: (url) => new FakeSocket(url),
    now: () => clock.t,
    onFrame: (frame, at) => frames.push({ frame, at }),
    reconnectMs: 100,
    watchdogMs: 30000,
  });
  machine.subscribe((s) => snapshots.push(s));
  return { machine, frames, snapshots, clock };
};

beforeEach(() => {
  FakeSocket.opened = [];
});

describe('LinkMachine', () => {
  it('probes, picks lan, and connects to the desk ws with the token', async () => {
    const h = build(lanUp());
    await h.machine.start();
    expect(h.machine.snapshot.mode).toBe('lan');
    expect(FakeSocket.opened[0].url).toBe('ws://desk:8000/ws?token=sekrit');
    expect(h.machine.snapshot.status).toBe('connecting');
    FakeSocket.opened[0].open();
    expect(h.machine.snapshot.status).toBe('open');
  });

  it('connects to the cloud app-link when the desk is unreachable', async () => {
    const h = build(cloudOnly());
    await h.machine.start();
    expect(h.machine.snapshot.mode).toBe('cloud');
    expect(FakeSocket.opened[0].url).toBe('wss://cloud.test/app-link?token=sekrit');
  });

  it('goes offline and opens no socket when nothing answers', async () => {
    const h = build(allDown());
    await h.machine.start();
    expect(h.machine.snapshot.mode).toBe('offline');
    expect(h.machine.snapshot.status).toBe('closed');
    expect(FakeSocket.opened).toHaveLength(0);
  });

  it('forwards parsed frames with the injected clock time', async () => {
    const h = build(lanUp());
    await h.machine.start();
    FakeSocket.opened[0].open();
    h.clock.t = 4242;
    FakeSocket.opened[0].emit({ status: 'online', message: 'Systems nominal' });
    expect(h.frames).toEqual([
      { frame: { kind: 'status', status: 'online', message: 'Systems nominal', user: null }, at: 4242 },
    ]);
  });

  it('drops ignored and malformed frames without forwarding them', async () => {
    const h = build(lanUp());
    await h.machine.start();
    FakeSocket.opened[0].open();
    FakeSocket.opened[0].emit({ type: 'gesture_state', hand: 'open' });
    FakeSocket.opened[0].onmessage?.({ data: 'garbage' });
    expect(h.frames).toEqual([]);
  });

  it('sends text over an open socket and reports success', async () => {
    const h = build(lanUp());
    await h.machine.start();
    FakeSocket.opened[0].open();
    expect(h.machine.send('lights on')).toBe(true);
    expect(FakeSocket.opened[0].sent).toEqual(['lights on']);
  });

  it('refuses to send when the socket is not open', async () => {
    const h = build(allDown());
    await h.machine.start();
    expect(h.machine.send('lights on')).toBe(false);
  });

  it('re-probes and reconnects after the socket closes', async () => {
    const h = build(lanUp());
    await h.machine.start();
    FakeSocket.opened[0].open();
    FakeSocket.opened[0].onclose?.();
    expect(h.machine.snapshot.status).toBe('closed');
    await h.machine.reprobe();
    expect(FakeSocket.opened).toHaveLength(2);
  });

  it('records an error message when the socket errors', async () => {
    const h = build(lanUp());
    await h.machine.start();
    FakeSocket.opened[0].onerror?.({ message: 'handshake 403' });
    expect(h.machine.snapshot.lastError).toContain('403');
  });

  it('tick() re-probes once the watchdog window passes with no frame', async () => {
    const h = build(lanUp());
    await h.machine.start();
    FakeSocket.opened[0].open();
    h.clock.t = 1000;
    FakeSocket.opened[0].emit({ status: 'online', message: '' });

    h.clock.t = 20000;
    await h.machine.tick();
    expect(FakeSocket.opened).toHaveLength(1);

    h.clock.t = 40000;
    await h.machine.tick();
    expect(FakeSocket.opened).toHaveLength(2);
  });

  it('stop() closes the socket and stops notifying', async () => {
    const h = build(lanUp());
    await h.machine.start();
    FakeSocket.opened[0].open();
    h.machine.stop();
    expect(FakeSocket.opened[0].closed).toBe(true);
    expect(h.machine.snapshot.status).toBe('closed');
  });

  it('unsubscribe stops delivering snapshots', async () => {
    const h = build(lanUp());
    const seen: LinkSnapshot[] = [];
    const off = h.machine.subscribe((s) => seen.push(s));
    off();
    await h.machine.start();
    expect(seen).toHaveLength(0);
  });

  it('ignores frames from a socket that has been superseded', async () => {
    const h = build(lanUp());
    await h.machine.start();
    const stale = FakeSocket.opened[0];
    stale.open();
    await h.machine.reprobe();
    stale.emit({ status: 'online', message: 'from the past' });
    expect(h.frames).toEqual([]);
  });
});
