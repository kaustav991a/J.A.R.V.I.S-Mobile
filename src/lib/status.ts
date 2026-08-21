import type { LinkMode } from '../link/config';

/**
 * What is connected, and what is not — one row per seam.
 *
 * **Why the app needs this at all.** "It did not work" is the report this project
 * keeps receiving, and it is not the reporter's fault: what is actually connected is
 * spread across the Connection screen, the transport pill, the gateway's `/health`
 * and, for several of these, nowhere at all. A panel that names the thing that is
 * off turns a sentence into a screenshot.
 *
 * It is the rule this codebase keeps relearning — every state must name itself —
 * applied to the seams rather than to a feature.
 *
 * Assembled on the device from what is already known, like `lib/situation.ts` and
 * for the same reason: this panel is read precisely when nothing is reachable, so it
 * must never need the thing it is reporting on.
 */
export type StatusState =
  /** it is there */
  | 'on'
  /** it is not, and that is worth knowing */
  | 'off'
  /** being established right now */
  | 'waiting'
  /**
   * nothing has been able to ask yet.
   *
   * Kept apart from `off` deliberately. Push registration that was refused and push
   * registration that has not run are different facts, and a red dot meaning either
   * sends someone hunting a fault that may not exist.
   */
  | 'unknown';

export type StatusRow = {
  id: string;
  label: string;
  /**
   * The state in words.
   *
   * Not decoration. A dot carries this at a glance and a red/green pair is the one
   * distinction a colour-blind reader cannot make — so the word is the actual
   * signal and the dot is the glance. Same reasoning as the filled/hollow glyph on
   * `CapabilitiesScreen`.
   */
  word: string;
  state: StatusState;
  /** one short line, when the state alone does not explain itself */
  note?: string;
};

/** everything the panel needs, gathered by the screen so this stays pure */
export type StatusFacts = {
  connected: boolean;
  connecting: boolean;
  mode: LinkMode;
  /** null when nothing is connected, so the desk cannot be asked about */
  deskLinked: boolean | null;
  hasToken: boolean;
  /**
   * `no-token` rather than `refused`: `registerForPush` returns null for a denied
   * permission and for any other failure alike, and the panel must not claim to know
   * which. The consequence is identical either way, and the note says it.
   */
  push: 'registered' | 'no-token' | 'unasked';
  /** the gateway is holding the commute schedule — `cloudArmed()` in `commute.ts` */
  scheduleAtGateway: boolean;
  shareLocation: boolean;
  usageAccess: 'granted' | 'denied' | 'unknown';
  appLock: boolean;
};

const MODE_WORD: Record<LinkMode, string> = { lan: 'WORKSPACE', cloud: 'CLOUD', offline: 'OFFLINE' };

/** what is wrong first, then the written order */
const RANK: Record<StatusState, number> = { off: 0, waiting: 1, unknown: 2, on: 3 };

export function statusRows(f: StatusFacts): StatusRow[] {
  const rows: StatusRow[] = [
    {
      id: 'desk',
      label: 'The desk',
      // a cloud session with no desk behind it holds no PC control, and calling
      // both of those CONNECTED hid the only difference that matters
      ...(f.deskLinked === true
        ? { state: 'on' as const, word: 'ATTACHED' }
        : f.connected
          ? { state: 'off' as const, word: 'ASLEEP', note: 'No PC control, files or terminal.' }
          : { state: 'unknown' as const, word: 'CANNOT ASK', note: 'Nothing is connected to ask through.' }),
    },
    {
      id: 'link',
      label: 'The link',
      ...(f.connected
        ? { state: 'on' as const, word: MODE_WORD[f.mode] }
        : f.connecting
          ? { state: 'waiting' as const, word: 'DIALLING' }
          : { state: 'off' as const, word: 'OFFLINE' }),
    },
    {
      id: 'token',
      label: 'Pairing token',
      ...(f.hasToken
        ? { state: 'on' as const, word: 'HELD' }
        : { state: 'off' as const, word: 'NONE', note: 'Anything needing the gateway will be refused.' }),
    },
    {
      id: 'push',
      label: 'He can reach you',
      // the row that explains a phone the gateway cannot reach: no briefing, no
      // desk-watch alert, no unprompted anything
      ...(f.push === 'registered'
        ? { state: 'on' as const, word: 'REGISTERED' }
        : f.push === 'no-token'
          ? {
              state: 'off' as const,
              word: 'NO TOKEN',
              note: 'Permission refused, or the token could not be fetched. No briefing and no desk alert can arrive.',
            }
          : {
              state: 'unknown' as const,
              word: 'NOT ASKED',
              note: 'Registration runs on a cloud connect; there has not been one.',
            }),
    },
    {
      id: 'schedule',
      label: 'Briefing schedule',
      // explains both failure shapes: while this is off the gateway cannot brief,
      // and the phone posts the briefing itself instead
      ...(f.scheduleAtGateway
        ? { state: 'on' as const, word: 'AT THE GATEWAY' }
        : { state: 'off' as const, word: 'ON THIS PHONE', note: 'The phone is briefing, which it often cannot.' }),
    },
    {
      id: 'location',
      label: 'Location sharing',
      // off here is a decision, not a fault, and the word has to say so — a panel
      // that reads a preference as breakage teaches you to ignore it
      ...(f.shareLocation
        ? { state: 'on' as const, word: 'ON' }
        : { state: 'off' as const, word: 'OFF BY CHOICE' }),
    },
    {
      id: 'usage',
      label: 'Usage access',
      ...(f.usageAccess === 'granted'
        ? { state: 'on' as const, word: 'GRANTED' }
        : f.usageAccess === 'denied'
          ? { state: 'off' as const, word: 'DENIED', note: 'The journal can see nothing.' }
          : { state: 'unknown' as const, word: 'UNREADABLE' }),
    },
    {
      id: 'lock',
      label: 'App lock',
      ...(f.appLock ? { state: 'on' as const, word: 'ON' } : { state: 'off' as const, word: 'OFF BY CHOICE' }),
    },
  ];

  /**
   * What is wrong rises to the top, and a settled panel keeps its written order.
   *
   * Stable within a rank, so nothing shuffles under a finger as states change —
   * a list that reorders while being read is a list that gets mis-reported.
   */
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => RANK[a.r.state] - RANK[b.r.state] || a.i - b.i)
    .map(({ r }) => r);
}

/** how many rows are genuinely wrong, for the caption. Never counts `unknown` */
export const offCount = (rows: StatusRow[]): number => rows.filter((r) => r.state === 'off').length;

/**
 * Whether this phone will let the journal see app usage.
 *
 * Wrapped because it is a native call: off-device, and on any platform without the
 * module, it throws rather than answering. `unknown` is the honest result there —
 * the panel must not report a permission it could not read as denied.
 */
export function usageAccessState(): 'granted' | 'denied' | 'unknown' {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { permission } = require('../../modules/usage-stats');
    const said = String(permission());
    if (said === 'granted') return 'granted';
    if (said === 'denied') return 'denied';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}