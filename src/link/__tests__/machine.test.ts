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

  /**
   * Going away must close the socket, and must not look like quitting.
   *
   * Backgrounding used to do nothing at all: the socket was left to rot. That is
   * invisible from here and expensive on the far side — a suspended app's socket
   * still swallows a write into an OS buffer, so the gateway records a reply as
   * delivered and never falls back to push. Which is exactly how an answer asked
   * for and then pocketed never arrived.
   *
   * `stop()` cannot be reused for it: that means "the user wants no link" and
   * latches `stopped`, so nothing would reconnect on the way back.
   */
  it('suspend() closes the socket so the far end learns nobody is listening', async () => {
    const h = build(lanUp());
    await h.machine.start();
    FakeSocket.opened[0].open();
    h.machine.suspend();
    expect(FakeSocket.opened[0].closed).toBe(true);
    expect(h.machine.snapshot.status).toBe('closed');
  });

  /**
   * The regression this exists to prevent, caught on the device rather than here.
   *
   * The first version of `suspend()` only tore the socket down. `tick()` bailed on
   * `stopped` alone, so the watchdog saw `status: 'closed'`, read it as dead, and
   * re-dialled — inside the moment before Android froze the JS thread. Measured on
   * the phone: backgrounding took the gateway from `apps_linked: 2` to `3`. The fix
   * made things worse than doing nothing, because now there was a fresh socket to
   * rot instead of an old one.
   */
  it('suspend() survives the watchdog, which used to undo it immediately', async () => {
    const h = build(lanUp());
    await h.machine.start();
    FakeSocket.opened[0].open();
    h.machine.suspend();

    // far past the watchdog window, and the link reads as closed — both of the
    // things that would otherwise trigger a re-dial
    h.clock.t = 90000;
    await h.machine.tick();
    expect(FakeSocket.opened).toHaveLength(1);
  });

  it('ticks again normally once it has been dialled back', async () => {
    const h = build(lanUp());
    await h.machine.start();
    FakeSocket.opened[0].open();
    h.machine.suspend();
    await h.machine.reprobe();
    FakeSocket.opened[1].open();
    expect(FakeSocket.opened).toHaveLength(2);

    // the suspension is over, so the watchdog is allowed to do its job again
    h.clock.t = 200000;
    await h.machine.tick();
    expect(FakeSocket.opened).toHaveLength(3);
  });

  it('suspend() leaves the link free to come back, unlike stop()', async () => {
    const h = build(lanUp());
    await h.machine.start();
    FakeSocket.opened[0].open();
    h.machine.suspend();
    await h.machine.reprobe();
    expect(FakeSocket.opened).toHaveLength(2);
  });

  it('stop() still refuses to come back, which is the whole difference', async () => {
    const h = build(lanUp());
    await h.machine.start();
    FakeSocket.opened[0].open();
    h.machine.stop();
    await h.machine.reprobe();
    expect(FakeSocket.opened).toHaveLength(1);
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

  /**
   * Two probes in flight at once used to leave a live socket behind.
   *
   * `reprobe()` tears down and then awaits `chooseMode`. A second one entering
   * during that await tore down nothing — `socket` was already null — so both
   * reached `connect()`, the second overwrote `this.socket`, and the first was
   * never closed. Its handlers stayed attached and the far end kept counting it:
   * one phone, several entries in the gateway's `_app_clients`, which is the list
   * `deliver()` now trusts before it decides a push is unnecessary.
   *
   * Three callers can overlap in normal use — the 5s watchdog tick, the network
   * state listener, and the return to the foreground — and `chooseMode` does real
   * network work between them.
   */
  it('leaves exactly one socket alive when two probes race', async () => {
    const h = build(lanUp());
    await h.machine.start();
    FakeSocket.opened[0].open();

    // deliberately not awaited in turn: both are in flight before either resolves,
    // which is the whole shape of the bug
    const a = h.machine.reprobe();
    const b = h.machine.reprobe();
    await Promise.all([a, b]);

    expect(FakeSocket.opened.filter((s) => !s.closed)).toHaveLength(1);
  });

  /**
   * A suspend has to win against a probe that was already in the air.
   *
   * Backgrounding calls `suspend()`, which blocks the *watchdog* — but an
   * in-flight `reprobe()` is past that guard and lands afterwards, opening a
   * socket for an app nobody is looking at. That is the phantom the suspend
   * exists to prevent, arriving by another door.
   */
  it('does not open a socket that a suspend beat to it', async () => {
    const h = build(lanUp());
    const probing = h.machine.reprobe();
    h.machine.suspend();
    await probing;
    expect(FakeSocket.opened).toHaveLength(0);
    expect(h.machine.snapshot.status).toBe('closed');
  });

  /**
   * The error that explains a close arrives after it.
   *
   * `onclose` used to null `this.socket`, so the `onerror` that followed failed
   * the `isCurrent()` guard and `lastError` kept whatever it had — usually null.
   * The connection screen then reported a dead link with no reason, which is the
   * one question it exists to answer.
   */
  it('records why a socket died when the error follows the close', async () => {
    const h = build(lanUp());
    await h.machine.start();
    const s = FakeSocket.opened[0];
    s.open();
    s.onclose?.();
    s.onerror?.(new Error('ECONNRESET'));
    expect(h.machine.snapshot.lastError).toBe('ECONNRESET');
  });
});

/**
 * A watchdog that cancels the probe it is waiting on never connects at all.
 *
 * `lastFrameAt` is null until something connects, so `quietFor` is Infinity and
 * `tick()` fires every time. Once `reprobe()` gained a generation counter, each
 * of those ticks invalidated the probe the previous tick had started — and with
 * `chooseMode` slower than one tick on a cold host, `connect()` was never
 * reached. Reported from the device as "connecting" forever.
 */
describe('the watchdog while a probe is in flight', () => {
  it('leaves an unfinished probe alone instead of restarting it', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = jest.fn(async () => {
      await gate;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const h = build(slow);
    const dialling = h.machine.start();
    expect(h.machine.snapshot.status).toBe('probing');

    // several ticks land while the probe is still out
    await h.machine.tick();
    await h.machine.tick();
    await h.machine.tick();

    release();
    await dialling;

    // the original probe survived and opened exactly one socket
    expect(FakeSocket.opened).toHaveLength(1);
    expect(h.machine.snapshot.status).toBe('connecting');
  });
});

/**
 * A refused handshake looked exactly like a connection still being made.
 *
 * The gateway answers 403 to a wrong or missing pairing token. That fires
 * `onerror` and, on Android, does not reliably fire `onclose` — so the machine
 * stayed on `connecting` and the Connection screen read "Connecting… probing the
 * local network, then the cloud gateway" indefinitely, while the far end had
 * already refused. Reported from the device.
 */
describe('a socket that is refused rather than opened', () => {
  it('reports closed, so the screen stops claiming it is still trying', async () => {
    const h = build(lanUp());
    await h.machine.start();
    expect(h.machine.snapshot.status).toBe('connecting');

    FakeSocket.opened[0].onerror?.({ message: 'Unexpected server response: 403' });

    expect(h.machine.snapshot.status).toBe('closed');
    expect(h.machine.snapshot.lastError).toContain('403');
  });

  it('lets the watchdog retry it, because closed is what it looks for', async () => {
    const h = build(lanUp());
    await h.machine.start();
    FakeSocket.opened[0].onerror?.({ message: 'Unexpected server response: 403' });
    await h.machine.tick();
    expect(FakeSocket.opened).toHaveLength(2);
  });

  it('leaves an error on a live socket alone, which onclose already handles', async () => {
    const h = build(lanUp());
    await h.machine.start();
    FakeSocket.opened[0].open();
    FakeSocket.opened[0].onerror?.({ message: 'ECONNRESET' });
    expect(h.machine.snapshot.status).toBe('open');
    expect(h.machine.snapshot.lastError).toContain('ECONNRESET');
  });
});

/**
 * The second attempt at the watchdog guard, and why it had to change again.
 *
 * Guarding on `status === 'probing'` was not the same claim as "a probe is
 * running". A superseded `reprobe()` returns early without touching the
 * snapshot, so that status outlives the probe that set it — and with the
 * foreground return, the network listener and the 5s tick all racing to
 * supersede one another, the machine could sit labelled 'probing' with nothing
 * in flight at all. The watchdog then declined to rescue it, permanently, and
 * the phone showed "connecting" until it was restarted.
 */
describe('the watchdog after probes have raced', () => {
  it('is not left permanently disarmed by a superseded probe', async () => {
    const h = build(allDown());

    // two dials in flight at once, the first superseded by the second
    const a = h.machine.reprobe();
    const b = h.machine.reprobe();
    await Promise.all([a, b]);

    // nothing is in flight now, whatever the snapshot last said
    h.clock.t = 60000;
    await h.machine.tick();

    // the watchdog acted: a fourth probe ran rather than being skipped forever
    expect((h.machine as unknown as { probing: boolean }).probing).toBe(false);
    expect(h.snapshots.filter((s) => s.status === 'probing').length).toBeGreaterThan(2);
  });

  it('still leaves a genuinely live probe alone', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = jest.fn(async () => {
      await gate;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const h = build(slow);
    const dialling = h.machine.start();
    await h.machine.tick();
    await h.machine.tick();

    release();
    await dialling;
    expect(FakeSocket.opened).toHaveLength(1);
  });
});
