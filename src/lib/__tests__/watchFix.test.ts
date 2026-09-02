import * as Location from 'expo-location';

import { watchFix } from '../place';

jest.mock('expo-location', () => ({
  Accuracy: { High: 4, Balanced: 3 },
  watchPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(async () => []),
}));

/**
 * A dot that moves.
 *
 * The map panel took one cached fix when Home came into focus, which is right for
 * "where am I" and wrong for watching yourself walk: the dot sat still while the
 * person moved. Asked for on 2026-09-02 — *"im not getting realtime GPS dot as seen
 * on map"*.
 */
describe('watching the fix change', () => {
  const watch = Location.watchPositionAsync as jest.Mock;

  beforeEach(() => {
    watch.mockReset();
  });

  it('hands every new position to the caller, not just the first', async () => {
    let send: (p: unknown) => void = () => {};
    watch.mockImplementation(async (_opts: unknown, cb: (p: unknown) => void) => {
      send = cb;
      return { remove: jest.fn() };
    });

    const seen: number[] = [];
    const stop = await watchFix((fix) => seen.push(fix.lat));
    send({ coords: { latitude: 22.8, longitude: 88.3, accuracy: 12 } });
    send({ coords: { latitude: 22.81, longitude: 88.31, accuracy: 9 } });

    expect(seen).toEqual([22.8, 22.81]);
    stop();
  });

  it('asks for movement rather than a clock, so a stationary phone is cheap', async () => {
    watch.mockResolvedValue({ remove: jest.fn() });
    const stop = await watchFix(() => {});
    const [opts] = watch.mock.calls[0];
    expect(opts.distanceInterval).toBeGreaterThan(0);
    expect(opts.accuracy).toBe(Location.Accuracy.High);
    stop();
  });

  it('stops when told to, because a watch outliving its screen is a battery bug', async () => {
    const remove = jest.fn();
    watch.mockResolvedValue({ remove });
    const stop = await watchFix(() => {});
    stop();
    expect(remove).toHaveBeenCalled();
  });

  it('survives a platform that refuses, rather than taking the screen down', async () => {
    watch.mockRejectedValue(new Error('no permission'));
    const stop = await watchFix(() => {});
    expect(() => stop()).not.toThrow();
  });
});
