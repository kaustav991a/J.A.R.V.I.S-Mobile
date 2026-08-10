import { renderHook, act } from '@testing-library/react-native';
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

describe('useLink', () => {
  beforeEach(() => {
    FakeMachine.last = null;
    jest.useFakeTimers();
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
