import { Endpoints, LinkMode, LinkStatus, cloudWsUrl, lanWsUrl } from './config';
import { chooseMode } from './probe';
import { JarvisFrame, parseFrame } from '../ws/frames';

export type LinkSnapshot = { mode: LinkMode; status: LinkStatus; lastError: string | null };

/** the slice of WebSocket this app uses — lets tests inject a fake, and lets
 *  the integration test inject the node `ws` client. */
export type MinimalSocket = {
  send(data: string | ArrayBuffer): void;
  close(): void;
  onopen: ((e?: unknown) => void) | null;
  onclose: ((e?: unknown) => void) | null;
  onerror: ((e?: unknown) => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
};

export type MachineDeps = {
  endpoints: Endpoints;
  token: string | null;
  fetchImpl: typeof fetch;
  wsFactory: (url: string) => MinimalSocket;
  now: () => number;
  onFrame: (frame: JarvisFrame, at: number) => void;
  reconnectMs?: number;
  /** spec §3.1: re-probe after 30s without a frame */
  watchdogMs?: number;
};

const errText = (e: unknown): string => {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return 'socket error';
};

export class LinkMachine {
  private snap: LinkSnapshot = { mode: 'offline', status: 'idle', lastError: null };
  private listeners = new Set<(s: LinkSnapshot) => void>();
  private socket: MinimalSocket | null = null;
  private lastFrameAt: number | null = null;
  private stopped = false;
  /** away, rather than switched off: blocks the watchdog, not a deliberate dial */
  private suspended = false;
  /**
   * Which dial is the current one. Bumped by every `reprobe()`, and by anything
   * that ends a dial — `stop()` and `suspend()`.
   *
   * `reprobe()` awaits `chooseMode()`, and everything that happens during that
   * await has to be able to invalidate what comes after it. Without this, two
   * overlapping probes both reached `connect()` and the first socket was
   * overwritten rather than closed: still open, still counted by the gateway as a
   * listening phone. Three callers can overlap in ordinary use — the 5s tick, the
   * network listener, the return to the foreground.
   */
  private gen = 0;

  constructor(private deps: MachineDeps) {}

  get snapshot(): LinkSnapshot {
    return this.snap;
  }

  subscribe(cb: (s: LinkSnapshot) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private set(patch: Partial<LinkSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const cb of this.listeners) cb(this.snap);
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.reprobe();
  }

  stop(): void {
    this.stopped = true;
    // a probe already past its `stopped` check must not land after this
    this.gen++;
    this.teardown();
    this.set({ status: 'closed' });
  }

  /**
   * Close the socket because nobody is listening, without latching `stopped`.
   *
   * Backgrounding the app used to do nothing here — the socket was simply left to
   * rot. That reads as harmless from this side and is expensive on the far one: a
   * suspended Android app's socket still accepts a write into an OS buffer, so the
   * gateway's `send_json` succeeds, `emit()` reports the frame as delivered, and
   * `deliver()` therefore never falls back to push. An answer asked for and then
   * pocketed was written into a corpse. Closing deliberately is what tells the
   * gateway to push instead.
   *
   * It also stops the far end accumulating phantoms — `apps_linked: 4` for one
   * phone, each a dead socket from a previous visit, and the gateway gates desk
   * push on that list being empty.
   *
   * Deliberately NOT `stop()`: that means "the user asked for no link" and blocks
   * every reconnect after it. This means "back shortly".
   */
  suspend(): void {
    /**
     * The flag is the whole fix, not the teardown.
     *
     * Closing alone did not work, and made things worse. `tick()` only ever bailed
     * on `stopped`, so the watchdog saw `status: 'closed'`, called `reprobe()`, and
     * opened a fresh socket in the moment before Android froze the JS thread — so
     * backgrounding took the gateway from `apps_linked: 2` to `3`. The link came
     * back only to rot, and the far end still believed a phone was listening.
     *
     * Cleared by `reprobe()`, which is what a deliberate return to the foreground
     * goes through. So this suppresses automatic revival while away, and nothing
     * else.
     */
    this.suspended = true;
    /**
     * And the latch alone is not enough either, for the same reason it was needed.
     *
     * `suspended` blocks `tick()`, but a `reprobe()` already awaiting `chooseMode`
     * is past every guard there is — it lands a moment later and opens a socket for
     * an app nobody is looking at. That is the phantom this method exists to
     * prevent, arriving through the door the latch does not cover.
     */
    this.gen++;
    this.teardown();
    this.set({ status: 'closed' });
  }

  /**
   * Back on screen: let the watchdog work again, whatever the socket is doing.
   *
   * Separate from `reprobe()` because the latch must be cleared even when no dial
   * is wanted. `suspend()` blocks `tick()`, and `tick()` is the only thing that
   * recovers a link nothing else noticed — so a `suspended` flag left set is a
   * permanently dead link until the app is restarted. Clearing it on every `active`
   * event, rather than only on a detected return, means a missed or coalesced
   * transition cannot strand the connection.
   */
  resume(): void {
    this.suspended = false;
  }

  private teardown(): void {
    const s = this.socket;
    this.socket = null;
    if (!s) return;
    s.onopen = null;
    s.onclose = null;
    s.onerror = null;
    s.onmessage = null;
    try {
      s.close();
    } catch {
      /* a socket that refuses to close is already gone */
    }
  }

  async reprobe(): Promise<void> {
    if (this.stopped) return;
    const gen = ++this.gen;
    // a deliberate dial ends the suspension — coming back is exactly what this is
    this.suspended = false;
    this.teardown();
    this.set({ status: 'probing' });

    const mode = await chooseMode(this.deps.endpoints, { fetchImpl: this.deps.fetchImpl });
    // anything that happened during the probe wins: a later dial, a stop, a
    // suspend. Losing the race means going quietly — the winner owns the socket,
    // and touching the snapshot here would report a mode nobody is connected in
    if (this.stopped || gen !== this.gen) return;

    if (mode === 'offline') {
      this.set({ mode, status: 'closed' });
      return;
    }

    const url =
      mode === 'lan'
        ? lanWsUrl(this.deps.endpoints, this.deps.token)
        : cloudWsUrl(this.deps.endpoints, this.deps.token);

    if (!url) {
      this.set({ mode: 'offline', status: 'closed', lastError: 'no cloud gateway configured' });
      return;
    }

    this.set({ mode, status: 'connecting', lastError: null });
    this.connect(url);
  }

  private connect(url: string): void {
    const socket = this.deps.wsFactory(url);
    this.socket = socket;
    this.lastFrameAt = this.deps.now();

    const isCurrent = () => this.socket === socket;

    socket.onopen = () => {
      if (!isCurrent()) return;
      this.set({ status: 'open', lastError: null });
    };
    socket.onclose = () => {
      if (!isCurrent()) return;
      /**
       * The reference is kept, deliberately.
       *
       * Nulling it here made the socket stop being "current", and the `onerror`
       * that explains the close arrives *after* it — so the reason was dropped and
       * the connection screen showed a dead link with no cause, which is the one
       * question it exists to answer. Nothing reads `socket` without also checking
       * `status`, and `teardown()` is what actually clears it.
       */
      this.set({ status: 'closed' });
    };
    socket.onerror = (e) => {
      if (!isCurrent()) return;
      this.set({ lastError: errText(e) });
    };
    socket.onmessage = (e) => {
      if (!isCurrent()) return;
      const at = this.deps.now();
      this.lastFrameAt = at;
      const frame = parseFrame(typeof e.data === 'string' ? e.data : String(e.data));
      if (frame) this.deps.onFrame(frame, at);
    };
  }

  send(text: string): boolean {
    if (!this.socket || this.snap.status !== 'open') return false;
    try {
      this.socket.send(text);
      return true;
    } catch (e) {
      this.set({ lastError: errText(e) });
      return false;
    }
  }

  /**
   * Send a recorded voice clip for the far end to transcribe and answer.
   *
   * A binary frame, not base64 in an envelope: base64 is a third larger, and the
   * clip is already the biggest thing this socket ever carries. The gateway
   * accepts both, so a transport that cannot send bytes can fall back to
   * `send(JSON.stringify({type:'voice',audio,format}))` without a server change.
   */
  sendVoice(clip: ArrayBuffer): boolean {
    if (!this.socket || this.snap.status !== 'open') return false;
    try {
      this.socket.send(clip);
      return true;
    } catch (e) {
      this.set({ lastError: errText(e) });
      return false;
    }
  }

  /** Called on an interval by useLink, and directly by tests. Re-probes when
   *  the link is dead or has gone quiet for longer than the watchdog window. */
  async tick(): Promise<void> {
    // `suspended` as well as `stopped`: without it this watchdog immediately undid
    // every suspend, because a suspended link reads as `closed` and `closed` reads
    // as dead. That reconnect is what kept the gateway believing a pocketed phone
    // was still listening.
    if (this.stopped || this.suspended) return;
    const watchdogMs = this.deps.watchdogMs ?? 30000;
    const quietFor = this.lastFrameAt === null ? Infinity : this.deps.now() - this.lastFrameAt;
    const dead = this.snap.status === 'closed';
    if (dead || quietFor > watchdogMs) await this.reprobe();
  }
}
