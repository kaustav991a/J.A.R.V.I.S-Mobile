import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { DEFAULT_ENDPOINTS, Endpoints, LinkMode, LinkStatus, loadToken } from './config';
import { LinkMachine, LinkSnapshot, MachineDeps, MinimalSocket } from './machine';
import { JarvisFrame } from '../ws/frames';

export type UseLinkOptions = {
  endpoints?: Endpoints;
  /**
   * The pairing token to present. Omit it and the stored one is read instead —
   * which is what the app did before any screen could set one. Pass it (even as
   * null) to take ownership, so re-pairing re-dials without a remount.
   */
  token?: string | null;
  onFrame: (frame: JarvisFrame, at: number) => void;
  /** test seam — inject a fake machine */
  machineFactory?: (deps: MachineDeps) => LinkMachine;
  tickMs?: number;
};

export type UseLinkResult = {
  mode: LinkMode;
  status: LinkStatus;
  lastError: string | null;
  send: (text: string) => boolean;
  /** send a recorded clip; the far end transcribes it and answers */
  sendVoice: (clip: ArrayBuffer) => boolean;
  /**
   * Dial now, and revive a link the user had stopped.
   *
   * This is the user-intent path — the CONNECT button, pull to refresh — so it
   * goes through `start()`, which clears the stopped flag first. The automatic
   * triggers use `reprobe()` instead, which stays down: a link switched off by
   * hand must not come back because the app was foregrounded.
   */
  reprobe: () => void;
  /** switch the link off and leave it off, until `reprobe()` is asked for */
  disconnect: () => void;
};

export function useLink(opts: UseLinkOptions): UseLinkResult {
  const { endpoints = DEFAULT_ENDPOINTS, token, onFrame, machineFactory, tickMs = 5000 } = opts;

  // keep the latest onFrame without rebuilding the machine on every render
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const machine = useMemo(() => {
    const deps: MachineDeps = {
      endpoints,
      token: null,
      fetchImpl: fetch,
      wsFactory: (url: string) => new WebSocket(url) as unknown as MinimalSocket,
      now: () => Date.now(),
      onFrame: (frame, at) => onFrameRef.current(frame, at),
    };
    return machineFactory ? machineFactory(deps) : new LinkMachine(deps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoints, machineFactory]);

  const [snap, setSnap] = useState<LinkSnapshot>(machine.snapshot);

  /** which machine has been started — see the token effect below */
  const startedFor = useRef<LinkMachine | null>(null);

  useEffect(() => {
    const off = machine.subscribe(setSnap);
    return () => {
      off();
      machine.stop();
      // a stopped machine has to be startable again, or a remount subscribes to
      // a machine that never dials
      startedFor.current = null;
    };
  }, [machine]);

  /**
   * The token the machine presents, and the only place the machine is started.
   *
   * A caller-supplied token wins; otherwise the stored one is read after first
   * paint, which is what happened before any screen could set one. Re-runs when
   * the token changes, so re-pairing re-dials — and only reprobes when the value
   * actually moved, or every render of a paired app would drop its connection.
   *
   * Starting lives here rather than in the subscribe effect above because it
   * used to run first, dialling with `token: null` before the stored one had
   * been read. The gateway refuses a socket presenting no token, so every launch
   * opened a doomed connection and then a second, real one a moment later —
   * visible on the server as two clients per phone. The first dial now waits for
   * the token, whatever it turns out to be.
   */
  useEffect(() => {
    let cancelled = false;
    const source = token === undefined ? loadToken() : Promise.resolve(token);
    void source.then((next) => {
      if (cancelled) return;
      const deps = (machine as unknown as { deps: MachineDeps }).deps;
      const moved = deps.token !== (next ?? null);
      deps.token = next ?? null;
      if (startedFor.current !== machine) {
        startedFor.current = machine;
        void machine.start();
        return;
      }
      if (moved) void machine.reprobe();
    });
    return () => {
      cancelled = true;
    };
  }, [machine, token]);

  useEffect(() => {
    const id = setInterval(() => {
      void machine.tick();
    }, tickMs);
    return () => clearInterval(id);
  }, [machine, tickMs]);

  /**
   * Spec §3.1 re-probe triggers: foreground and network change. Both are
   * *transitions*, and both sources announce themselves at startup.
   *
   * React Native emits an `'active'` change as a cold start finishes, and
   * `expo-network` hands the listener the current state on subscribe. Read as
   * "something changed", each one re-probed a machine that had just dialled —
   * so a launch put two sockets on the gateway, the second replacing a first
   * that the server then held open until it timed out. Only a real change counts
   * now: background→active, and a network state different from the last seen.
   */
  useEffect(() => {
    /**
     * A live socket is never re-dialled.
     *
     * Both triggers used to re-probe unconditionally, which threw away a working
     * connection and opened a new one — and the gateway greets every connection,
     * so each of those printed "Cloud brain only…" into the chat again. Switching
     * away to read something and coming back was enough to do it.
     *
     * A socket that is open but secretly dead is what the watchdog is for: the
     * keepalive arrives every 20s, so 30s of silence re-probes anyway. The cost of
     * this guard is at most that delay; the cost of not having it was a reconnect
     * every time the app was looked at.
     */
    const reprobeIfDown = () => {
      if (machine.snapshot.status === 'open') return;
      void machine.reprobe();
    };

    let lastAppState: string = AppState.currentState;
    const appSub = AppState.addEventListener('change', (s) => {
      const returned = s === 'active' && lastAppState !== 'active';
      lastAppState = s;
      if (returned) reprobeIfDown();
    });

    let lastNet: string | null = null;
    const netSub = Network.addNetworkStateListener((state) => {
      const seen = `${state?.type ?? '?'}/${state?.isConnected ?? '?'}`;
      const changed = lastNet !== null && lastNet !== seen;
      lastNet = seen;
      // the first callback is the baseline, not an event. A genuine change that
      // arrives as the first callback is lost, which the 5s tick picks up anyway
      if (changed) reprobeIfDown();
    });

    return () => {
      appSub.remove();
      // expo-network has returned both a subscription and nothing across
      // versions; unsubscribing must not be what takes the app down
      netSub?.remove?.();
    };
  }, [machine]);

  const send = useCallback((text: string) => machine.send(text), [machine]);
  const sendVoice = useCallback((clip: ArrayBuffer) => machine.sendVoice(clip), [machine]);
  const disconnect = useCallback(() => {
    machine.stop();
  }, [machine]);
  const reprobe = useCallback(() => {
    // start(), not reprobe(): a machine the user stopped is `stopped`, and
    // reprobe() returns early in that state — the button would do nothing
    void machine.start();
  }, [machine]);

  return { mode: snap.mode, status: snap.status, lastError: snap.lastError, send, sendVoice, reprobe, disconnect };
}
