import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { DEFAULT_ENDPOINTS, Endpoints, LinkMode, LinkStatus, loadToken } from './config';
import { LinkMachine, LinkSnapshot, MachineDeps, MinimalSocket } from './machine';
import { JarvisFrame } from '../ws/frames';

export type UseLinkOptions = {
  endpoints?: Endpoints;
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
  reprobe: () => void;
};

export function useLink(opts: UseLinkOptions): UseLinkResult {
  const { endpoints = DEFAULT_ENDPOINTS, onFrame, machineFactory, tickMs = 5000 } = opts;

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

  useEffect(() => {
    const off = machine.subscribe(setSnap);
    void machine.start();
    return () => {
      off();
      machine.stop();
    };
  }, [machine]);

  // the desk token lives in SecureStore and is loaded after first paint
  useEffect(() => {
    let cancelled = false;
    void loadToken().then((token) => {
      if (cancelled || !token) return;
      (machine as unknown as { deps: MachineDeps }).deps.token = token;
      void machine.reprobe();
    });
    return () => {
      cancelled = true;
    };
  }, [machine]);

  useEffect(() => {
    const id = setInterval(() => {
      void machine.tick();
    }, tickMs);
    return () => clearInterval(id);
  }, [machine, tickMs]);

  // spec §3.1 re-probe triggers: foreground and network change
  useEffect(() => {
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void machine.reprobe();
    });
    const netSub = Network.addNetworkStateListener(() => {
      void machine.reprobe();
    });
    return () => {
      appSub.remove();
      // expo-network has returned both a subscription and nothing across
      // versions; unsubscribing must not be what takes the app down
      netSub?.remove?.();
    };
  }, [machine]);

  const send = useCallback((text: string) => machine.send(text), [machine]);
  const reprobe = useCallback(() => {
    void machine.reprobe();
  }, [machine]);

  return { mode: snap.mode, status: snap.status, lastError: snap.lastError, send, reprobe };
}
