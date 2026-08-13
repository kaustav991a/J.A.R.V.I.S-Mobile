import { renderHook, act } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useLink } from '../useLink';
import { LinkMachine, LinkSnapshot, MachineDeps } from '../machine';

// jest-expo automocks expo-network's native module, and every automocked
// native method resolves a Promise rather than returning the real
// EventSubscription shape (see SDK 57 docs: `addNetworkStateListener`
// returns `{ remove(): void }`). Mock it explicitly to match the on-device
// contract so the effect cleanup in useLink has something real to call.
jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
}));

class FakeMachine {
  static last: FakeMachine | null = null;
  started = 0;
  stopped = 0;
  reprobes = 0;
  ticks = 0;
  sent: string[] = [];
  snapshot: LinkSnapshot = { mode: 'offline', status: 'idle', lastError: null };
  private listeners = new Set<(s: LinkSnapshot) => void>();

  constructor(public deps: MachineDeps) {
    FakeMachine.last = this;
  }
  async start() {
    this.started++;
  }
  stop() {
    this.stopped++;
  }
  async reprobe() {
    this.reprobes++;
  }
  async tick() {
    this.ticks++;
  }
  send(text: string) {
    this.sent.push(text);
    return true;
  }
  subscribe(cb: (s: LinkSnapshot) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  push(s: LinkSnapshot) {
    this.snapshot = s;
    for (const cb of this.listeners) cb(s);
  }
}

const factory = (deps: MachineDeps) => new FakeMachine(deps) as unknown as LinkMachine;

/** grab the AppState listener useLink registers, so a change can be simulated */
const appStateListener = () => {
  const spy = AppState.addEventListener as unknown as jest.Mock;
  return spy.mock.calls[spy.mock.calls.length - 1][1] as (s: string) => void;
};

describe('useLink', () => {
  beforeEach(() => {
    FakeMachine.last = null;
    jest.useFakeTimers();
    // a real AppState would emit on its own schedule; the tests drive it
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts the machine on mount and exposes its snapshot', async () => {
    const { result } = await renderHook(() => useLink({ onFrame: jest.fn(), machineFactory: factory }));
    expect(FakeMachine.last?.started).toBe(1);
    expect(result.current.mode).toBe('offline');
    expect(result.current.status).toBe('idle');
  });

  it('dials once, and not until the token it will present is known', async () => {
    // starting used to happen in the subscribe effect, which ran BEFORE the
    // stored token had been read — so every launch opened a socket presenting
    // no token, which the gateway refuses, and then a second real one. The
    // server saw two clients per phone.
    const { result } = await renderHook(() =>
      useLink({ onFrame: jest.fn(), machineFactory: factory, token: 'sekrit' })
    );
    expect(result.current.status).toBe('idle');
    expect(FakeMachine.last?.started).toBe(1);
    expect(FakeMachine.last?.reprobes).toBe(0);
    expect(FakeMachine.last?.deps.token).toBe('sekrit');
  });

  it('re-dials when the token changes, without starting a second machine', async () => {
    const { rerender } = await renderHook(
      ({ token }: { token: string }) => useLink({ onFrame: jest.fn(), machineFactory: factory, token }),
      { initialProps: { token: 'first' } }
    );
    expect(FakeMachine.last?.started).toBe(1);
    await act(async () => {
      await rerender({ token: 'second' });
    });
    expect(FakeMachine.last?.started).toBe(1);
    expect(FakeMachine.last?.reprobes).toBe(1);
    expect(FakeMachine.last?.deps.token).toBe('second');
  });

  it('ignores the active event that trails a cold start', async () => {
    // React Native emits `'active'` as the launch finishes. Treated as a return
    // to the foreground it re-probed a machine that had just dialled, so every
    // launch left two sockets on the gateway instead of one.
    await renderHook(() => useLink({ onFrame: jest.fn(), machineFactory: factory, token: 'sekrit' }));
    await act(async () => {
      appStateListener()('active');
    });
    expect(FakeMachine.last?.started).toBe(1);
    expect(FakeMachine.last?.reprobes).toBe(0);
  });

  it('re-probes on a real return to the foreground', async () => {
    await renderHook(() => useLink({ onFrame: jest.fn(), machineFactory: factory, token: 'sekrit' }));
    await act(async () => {
      const onChange = appStateListener();
      onChange('background');
      onChange('active');
    });
    expect(FakeMachine.last?.reprobes).toBe(1);
  });

  it('leaves a live socket alone when the app comes back to the foreground', async () => {
    // Re-probing unconditionally threw away a working connection and opened a
    // new one — and the gateway greets every connection, so switching away and
    // back printed "Cloud brain only…" into the chat each time. A socket that is
    // open but secretly dead is the watchdog's job, not this trigger's.
    await renderHook(() => useLink({ onFrame: jest.fn(), machineFactory: factory, token: 'sekrit' }));
    await act(async () => {
      FakeMachine.last!.push({ mode: 'cloud', status: 'open', lastError: null });
      const onChange = appStateListener();
      onChange('background');
      onChange('active');
    });
    expect(FakeMachine.last?.reprobes).toBe(0);
  });

  it('does re-probe on return when the link is down', async () => {
    await renderHook(() => useLink({ onFrame: jest.fn(), machineFactory: factory, token: 'sekrit' }));
    await act(async () => {
      FakeMachine.last!.push({ mode: 'offline', status: 'closed', lastError: null });
      const onChange = appStateListener();
      onChange('background');
      onChange('active');
    });
    expect(FakeMachine.last?.reprobes).toBe(1);
  });

  it('stays down after a deliberate disconnect, and revives on request', async () => {
    // `reprobe()` returns early on a stopped machine, so the CONNECT button has
    // to go through start() or it would appear to do nothing
    const { result } = await renderHook(() =>
      useLink({ onFrame: jest.fn(), machineFactory: factory, token: 'sekrit' })
    );
    await act(async () => {
      result.current.disconnect();
    });
    expect(FakeMachine.last?.stopped).toBe(1);
    await act(async () => {
      result.current.reprobe();
    });
    expect(FakeMachine.last?.started).toBe(2);
  });

  it('re-renders when the machine publishes a new snapshot', async () => {
    const { result } = await renderHook(() => useLink({ onFrame: jest.fn(), machineFactory: factory }));
    await act(async () => {
      FakeMachine.last!.push({ mode: 'lan', status: 'open', lastError: null });
    });
    expect(result.current.mode).toBe('lan');
    expect(result.current.status).toBe('open');
  });

  it('forwards send() to the machine', async () => {
    const { result } = await renderHook(() => useLink({ onFrame: jest.fn(), machineFactory: factory }));
    await act(async () => {
      result.current.send('lights on');
    });
    expect(FakeMachine.last!.sent).toEqual(['lights on']);
  });

  it('ticks the machine on the interval', async () => {
    await renderHook(() => useLink({ onFrame: jest.fn(), machineFactory: factory, tickMs: 1000 }));
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(FakeMachine.last!.ticks).toBeGreaterThanOrEqual(3);
  });

  it('stops the machine on unmount', async () => {
    const { unmount } = await renderHook(() => useLink({ onFrame: jest.fn(), machineFactory: factory }));
    await unmount();
    expect(FakeMachine.last!.stopped).toBe(1);
  });

  it('passes onFrame straight through to the machine deps', async () => {
    const onFrame = jest.fn();
    await renderHook(() => useLink({ onFrame, machineFactory: factory }));
    const at = 99;
    FakeMachine.last!.deps.onFrame({ kind: 'status', status: 'online', message: 'x', user: null }, at);
    expect(onFrame).toHaveBeenCalledWith({ kind: 'status', status: 'online', message: 'x', user: null }, at);
  });
});
