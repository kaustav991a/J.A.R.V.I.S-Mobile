import { live } from '../live';

/**
 * The primitive itself, without React.
 *
 * Worth testing in isolation precisely because the thing it prevents is invisible:
 * the failure mode of a forgotten guard is a state update on a dead tree, which
 * throws nothing and warns nothing. If the guard is what stands between this app
 * and a class of bug that reads as "the component did not mount", the guard is
 * exactly the thing that must not be taken on trust.
 */
describe('a cancellation scope', () => {
  it('runs the settle while the run is current', () => {
    const l = live();
    const set = jest.fn();

    l.only(set)('a value');

    expect(set).toHaveBeenCalledWith('a value');
  });

  it('drops the settle once the run has ended, which is the whole point', () => {
    const l = live();
    const set = jest.fn();
    const settle = l.only(set);

    l.end();
    settle('a value');

    expect(set).not.toHaveBeenCalled();
  });

  /**
   * The ordering that actually happens: the wrapper is handed to `.then` while the
   * tree is alive and called back after it is gone. A guard evaluated at wrap time
   * rather than at call time would pass every other test here and fail in the app.
   */
  it('decides when it is called, not when it was wrapped', async () => {
    const l = live();
    const set = jest.fn();
    let release: (v: string) => void = () => {};
    const slow = new Promise<string>((res) => {
      release = res;
    });

    const pending = slow.then(l.only(set));
    l.end();
    release('too late');
    await pending;

    expect(set).not.toHaveBeenCalled();
  });

  it('passes every argument through, so it can wrap a reducer settle', () => {
    const l = live();
    const set = jest.fn();

    l.only(set)(1, 'two', { three: true });

    expect(set).toHaveBeenCalledWith(1, 'two', { three: true });
  });

  it('reports its own state, for the settle with real work to do on a dead run', () => {
    const l = live();
    expect(l.alive).toBe(true);
    l.end();
    expect(l.alive).toBe(false);
  });

  /**
   * React calls a cleanup once, but an effect that also tears down a listener ends
   * the scope by hand — so ending twice must be ordinary rather than an edge case.
   */
  it('can be ended more than once', () => {
    const l = live();
    const set = jest.fn();

    l.end();
    l.end();
    l.only(set)('x');

    expect(set).not.toHaveBeenCalled();
  });

  /**
   * The reason this is a factory and not a hook, asserted rather than described.
   *
   * A provider-lifetime guard cannot cancel a dependency change, and the alert
   * registration needs exactly that: when the alert changes, the in-flight
   * registration from the PREVIOUS alert must be dropped while the effect's next
   * run stays live. Two scopes, independent.
   */
  it('gives each run its own scope, so a dependency change cancels only its own run', () => {
    const first = live();
    const second = live();
    const a = jest.fn();
    const b = jest.fn();

    first.end();
    first.only(a)('stale');
    second.only(b)('current');

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith('current');
  });

  it('hands React a cleanup that does not need its object back', () => {
    const l = live();
    const set = jest.fn();
    const cleanup = l.end;

    cleanup();
    l.only(set)('x');

    expect(set).not.toHaveBeenCalled();
  });
});
