import { requireNativeModule } from 'expo';

import type { Call } from '../../src/lib/calls';

/**
 * Android's call log, with the numbers already removed.
 *
 * The native side hashes the number before it crosses into JavaScript, so nothing
 * above this file has ever been given one — see the note in `CallLogModule.kt`. What
 * arrives is a stable id and the name Android had cached against the call.
 *
 * **Resolved lazily, and never at import.** The JavaScript ships over the air and the
 * native half only arrives with an APK, so for the hours between publishing and
 * installing there is a build in the world whose bundle mentions a module it does not
 * have. Requiring it at module scope would crash that app at launch — the whole app,
 * over a feature that reads a call log. It is looked up on first use instead, and a
 * failure is an answer rather than an exception.
 */
let native: { permission: () => string; recent: (since: number, limit: number) => Promise<unknown> } | null =
  null;
let looked = false;

const module_ = () => {
  if (!looked) {
    looked = true;
    try {
      native = requireNativeModule('CallLog');
    } catch {
      native = null;
    }
  }
  return native;
};

/** how far back a read looks: enough to call a gap usual, not enough to be an archive */
export const READ_DAYS = 120;

/**
 * `granted` · `denied` · `unavailable`.
 *
 * Three answers because they want three sentences: a build without the module, a
 * permission that was refused, and a log that can be read are different states, and
 * "no calls" must never be the app's way of saying any of them.
 */
export function permission(): 'granted' | 'denied' | 'unavailable' {
  const m = module_();
  if (!m) return 'unavailable';
  try {
    const said = m.permission();
    return said === 'granted' ? 'granted' : said === 'denied' ? 'denied' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

/**
 * Calls since a moment, newest first, capped.
 *
 * **Nothing is stored.** The call log already lives on the device and is written by
 * the dialler whether this app exists or not; keeping a copy would create a second
 * thing to secure and a second thing to leak, in exchange for a read that takes
 * milliseconds. Every figure is derived from a fresh read and nothing survives it.
 *
 * Voicemail, blocked and rejected-by-carrier arrive as `other` and are dropped: they
 * are neither conversations nor somebody trying to reach you, which are the only two
 * things anything above this cares about.
 */
export async function recent(since: number, limit = 500): Promise<Call[]> {
  const m = module_();
  if (!m) return [];
  try {
    const rows = (await m.recent(since, limit)) as Call[];
    return rows.filter((c) => c.kind === 'in' || c.kind === 'out' || c.kind === 'missed');
  } catch {
    return [];
  }
}

/** the ordinary read: everything recent enough to say what usual looks like */
export async function recentCalls(now: number = Date.now()): Promise<Call[]> {
  if (permission() !== 'granted') return [];
  return recent(now - READ_DAYS * 24 * 60 * 60 * 1000);
}
