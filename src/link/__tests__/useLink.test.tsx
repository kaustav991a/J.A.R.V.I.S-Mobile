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
  suspends = 0;
  resumes = 0;
  suspended = false;
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
  resume() {
    this.resumes++;
    this.suspended = false;
  }
  suspend() {
    this.suspends++;
    this.suspended = true;
    // mirrors the real one: the socket is gone, so the snapshot says closed —
    // which is what `reprobeIfDown` reads on the way back
    this.push({ ...this.snapshot, status: 'closed' });
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

  /**
   * Backgrounding now closes the socket on purpose, so this used to assert the
   * opposite.
   *
   * The old test held that an open socket must survive a background — the concern
   * being that re-dialling replayed the gateway's greeting into the chat every time
   * the app was looked at. That greeting is filtered now (`linkNotice` in
   * `hudReducer` drops `online`/`offline` status messages), and leaving the socket
   * open turned out to cost the thing the app is for: the gateway went on writing
   * replies into a socket Android had already suspended, saw the write succeed, and
   * so never pushed. An answer asked for and then pocketed was lost.
   *
   * What still must not happen is churn, which is what the next test pins.
   */
  it('closes the socket on the way out, so the far end knows to push', async () => {
    await renderHook(() => useLink({ onFrame: jest.fn(), machineFactory: factory, token: 'sekrit' }));
    await act(async () => {
      FakeMachine.last!.push({ mode: 'cloud', status: 'open', lastError: null });
      appStateListener()('background');
    });
    expect(FakeMachine.last?.suspends).toBe(1);
    // and not as a user-initiated disconnect, which would refuse to come back
    expect(FakeMachine.last?.stopped).toBe(0);
  });

  it('re-dials on the way back in, since it closed on the way out', async () => {
    await renderHook(() => useLink({ onFrame: jest.fn(), machineFactory: factory, token: 'sekrit' }));
    await act(async () => {
      FakeMachine.last!.push({ mode: 'cloud', status: 'open', lastError: null });
      const onChange = appStateListener();
      onChange('background');
      onChange('active');
    });
    expect(FakeMachine.last?.reprobes).toBe(1);
  });

  /**
   * A missed transition must not strand the link.
   *
   * `suspend()` latches a flag that blocks the watchdog, and the watchdog is the
   * only thing that recovers a connection nothing else noticed. So a latch left set
   * is a dead link until the app is restarted. Clearing it on every `active` event —
   * rather than only on a `background -> active` pair we managed to observe — is
   * what makes a coalesced or dropped transition survivable.
   */
  it('lifts the suspension on any active event, not just a detected return', async () => {
    await renderHook(() => useLink({ onFrame: jest.fn(), machineFactory: factory, token: 'sekrit' }));
    await act(async () => {
      const onChange = appStateListener();
      onChange('background');
      // the pair the handler would recognise never arrives; this is the coalesced
      // case, where the only thing seen is that we are active again
      onChange('inactive');
      onChange('active');
    });
    expect(FakeMachine.last?.suspended).toBe(false);
    expect(FakeMachine.last?.resumes).toBeGreaterThan(0);
  });

  /**
   * Android does not always hand over `active -> background` cleanly.
   *
   * A power-button press, and some launcher paths, go `active -> inactive ->
   * background`. The handler asked for the pair, so `lastAppState` was already
   * `'inactive'` when `background` arrived, `leaving` was false, and `suspend()`
   * never ran — the socket stayed open, the gateway kept counting this phone as a
   * listening client, and `deliver()` therefore saw no reason to push. That is the
   * pocketed reply going missing again, through a door the fix did not cover.
   *
   * What matters is the state arrived at, not the step before it.
   */
  it('suspends when background arrives by way of inactive, not only straight from active', async () => {
    await renderHook(() => useLink({ onFrame: jest.fn(), machineFactory: factory, token: 'sekrit' }));
    await act(async () => {
      FakeMachine.last!.push({ mode: 'cloud', status: 'open', lastError: null });
      const onChange = appStateListener();
      onChange('inactive');
      onChange('background');
    });
    expect(FakeMachine.last?.suspends).toBe(1);
  });

  it('holds the link through an inactive blip, which is not going away', async () => {
    // a notification shade, a permission sheet, a call overlay — the user is still
    // in the app, and dropping the link for these is the churn the old test feared
    await renderHook(() => useLink({ onFrame: jest.fn(), machineFactory: factory, token: 'sekrit' }));
    await act(async () => {
      FakeMachine.last!.push({ mode: 'cloud', status: 'open', lastError: null });
      const onChange = appStateListener();
      onChange('inactive');
      onChange('active');
    });
    expect(FakeMachine.last?.suspends).toBe(0);
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
