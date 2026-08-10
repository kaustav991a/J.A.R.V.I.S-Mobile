import { Endpoints, LinkMode, LinkStatus, cloudWsUrl, lanWsUrl } from './config';
import { chooseMode } from './probe';
import { JarvisFrame, parseFrame } from '../ws/frames';

export type LinkSnapshot = { mode: LinkMode; status: LinkStatus; lastError: string | null };

/** the slice of WebSocket this app uses — lets tests inject a fake, and lets
 *  the integration test inject the node `ws` client. */
export type MinimalSocket = {
  send(data: string): void;
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
    this.teardown();
    this.set({ status: 'closed' });
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
    this.teardown();
    this.set({ status: 'probing' });

    const mode = await chooseMode(this.deps.endpoints, { fetchImpl: this.deps.fetchImpl });
    if (this.stopped) return;

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
      this.socket = null;
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

  /** Called on an interval by useLink, and directly by tests. Re-probes when
   *  the link is dead or has gone quiet for longer than the watchdog window. */
  async tick(): Promise<void> {
    if (this.stopped) return;
    const watchdogMs = this.deps.watchdogMs ?? 30000;
    const quietFor = this.lastFrameAt === null ? Infinity : this.deps.now() - this.lastFrameAt;
    const dead = this.snap.status === 'closed';
    if (dead || quietFor > watchdogMs) await this.reprobe();
  }
}
