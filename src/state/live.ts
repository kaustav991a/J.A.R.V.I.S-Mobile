/**
 * Cancellation for an effect that settles after its tree is gone.
 *
 * The problem this exists for, stated exactly: a provider effect that resolves
 * after its tree has unmounted sets state on a dead tree. In the app that is a
 * wasted render; under test it happens outside any `act`, and enough of those
 * corrupt the act environment, after which every later `render` in the file
 * returns an **empty tree** — no throw, no warning, queries that simply find
 * nothing. It reads exactly like a component that failed to mount, and it cost
 * six tests before it was understood.
 *
 * The mitigation that had grown up instead was a hand-written `let alive = true`
 * in each effect with an `if (!alive) return` inside each `.then`. Eight of the
 * nine settle sites in `JarvisProvider` carried one; the ninth did not, and
 * nothing could have told you which. That is the whole argument for a primitive:
 * not that the guard was wrong, but that remembering it was a per-site decision
 * with no failure mode when forgotten.
 *
 * Deliberately **not** a hook, and this is the design point rather than a detail.
 * A guard that lives for the provider's lifetime cannot cancel on a dependency
 * change — and several of these effects need exactly that. The alert
 * registration at `[alert?.id, alert]` re-runs when the alert changes, and its
 * in-flight registration from the *previous* alert must be dropped, not merely
 * the one from the previous mount. So a scope is created inside the effect body,
 * per run, and ended by the effect's own cleanup.
 *
 * ```ts
 * useEffect(() => {
 *   const l = live();
 *   void loadShareLocation().then(l.only(setShareLocationState));
 *   return l.end;
 * }, []);
 * ```
 */

/** A per-run cancellation scope. Created in an effect body, ended by its cleanup. */
export type Live = {
  /**
   * Whether this run is still current.
   *
   * For the settle that has real work to do on a dead tree rather than nothing —
   * a registration that must be handed back, say. Prefer `only` everywhere else,
   * because `only` cannot be forgotten halfway through a handler.
   */
  readonly alive: boolean;
  /**
   * Wrap a settle handler so a dead run drops it instead of setting state.
   *
   * The wrapper is what gets passed to `.then`, so the check is structural: there
   * is no body to add an early return to and no path that skips it.
   */
  only: <A extends unknown[]>(f: (...args: A) => void) => (...args: A) => void;
  /**
   * End this run. Return it from the effect as-is: `return l.end`.
   *
   * Bound on construction rather than being a method that reads `this`, so
   * handing it straight to React cannot lose its scope.
   */
  end: () => void;
};

export function live(): Live {
  let alive = true;
  return {
    get alive() {
      return alive;
    },
    only:
      <A extends unknown[]>(f: (...args: A) => void) =>
      (...args: A) => {
        if (alive) f(...args);
      },
    end: () => {
      alive = false;
    },
  };
}
