/**
 * "Open Swiggy" — the first thing this app does *to* the phone rather than about it.
 *
 * Asked for 2026-08-21, and it is rung one of the ladder in `ROADMAP.md` §3.1:
 * launching a named app by intent. Everything above it on that ladder needs a
 * permission that reads other people's messages, and the token split has to land
 * first.
 *
 * **Answered on the phone, like the capability list, and for a stronger reason.** A
 * model cannot launch anything — it can only say it did, which is the worst available
 * outcome. So the phone recognises the instruction, matches it against what is
 * actually installed, and acts. Nothing is asked of the gateway, which is also why
 * this works with the desk asleep and no network.
 *
 * **The two failure modes are not symmetric,** and every decision below follows from
 * that: refusing to open something is a shrug and the model still answers, while
 * opening the wrong app takes over your screen for no reason. So recognition is
 * narrow, matching is strict, and ambiguity always declines.
 */
export type InstalledApp = { label: string; pkg: string };

/**
 * The app name in an instruction to open one, or null.
 *
 * Only imperative forms. "What is Swiggy" and "how do I open Swiggy" are questions
 * about an app and belong to the model — a greedy match on the word "open" would
 * swallow both and answer a question by launching something.
 */
export function asOpenAppCommand(text: string): string | null {
  const t = text.trim().replace(/[?.!]+$/, '');
  // `^` anchored: an instruction starts with the verb. "how do I open swiggy" does not
  const m = t.match(/^(?:open|launch|start)\s+(?:the\s+)?(.+?)(?:\s+app)?(?:\s+please)?$/i);
  if (!m) return null;
  const name = m[1].trim();
  return name.length ? name : null;
}

/**
 * The installed app a name refers to, or null when it is not obvious.
 *
 * Four passes, best first, and **ties always lose**. If a name fits two apps equally
 * well there is no way to know which was meant, so it declines and lets him ask
 * rather than guessing — "google" is Maps to one person and Gmail to the next.
 */
export function matchApp(name: string, installed: InstalledApp[]): InstalledApp | null {
  const want = name.trim().toLowerCase();
  if (!want) return null;

  const only = (found: InstalledApp[]): InstalledApp | null => (found.length === 1 ? found[0] : null);

  const label = (a: InstalledApp) => a.label.toLowerCase();

  // exact name first, so `Maps` beats `Google Maps` when both are installed
  const exact = installed.filter((a) => label(a) === want);
  if (exact.length) return only(exact);

  const starts = installed.filter((a) => label(a).startsWith(want));
  if (starts.length) return only(starts);

  // a whole word inside the name — `maps` finding `Google Maps`. Word-bounded so
  // `art` does not match `Smart Switch`
  const word = installed.filter((a) => new RegExp(`\\b${escape(want)}\\b`).test(label(a)));
  if (word.length) return only(word);

  // and last, the package id, which is how a few apps are better known than their
  // label — but never a bare substring of one, for the reason above
  const pkg = installed.filter((a) => a.pkg.toLowerCase().split('.').includes(want));
  return only(pkg);
}

/** a name typed by a person may contain anything, and it is going into a regex */
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
