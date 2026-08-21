import { statusRows } from '../status';
import type { StatusFacts } from '../status';

/**
 * The Home status panel: what is connected, and what is not.
 *
 * It exists so a report can name the thing that is off instead of saying "it did
 * not work". Which means the panel itself must never be the ambiguous one — the
 * three-state rule below is the whole point.
 */
const facts = (over: Partial<StatusFacts> = {}): StatusFacts => ({
  connected: true,
  connecting: false,
  mode: 'cloud',
  deskLinked: true,
  hasToken: true,
  push: 'registered',
  scheduleAtGateway: true,
  shareLocation: true,
  usageAccess: 'granted',
  appLock: true,
  ...over,
});

const row = (id: string, over: Partial<StatusFacts> = {}) => {
  const found = statusRows(facts(over)).find((r) => r.id === id);
  if (!found) throw new Error(`no row ${id}`);
  return found;
};

describe('every row', () => {
  it('carries a word as well as a state, because a dot alone cannot be read', () => {
    // red and green is the one distinction a colour-blind reader cannot make, and
    // telling two states apart is this panel's entire job
    for (const r of statusRows(facts())) {
      expect(r.word.length).toBeGreaterThan(1);
      expect(r.label.length).toBeGreaterThan(2);
    }
  });

  it('has a stable id', () => {
    const ids = statusRows(facts()).map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the desk', () => {
  it('is on when the desk itself is attached', () => {
    expect(row('desk').state).toBe('on');
  });

  it('is off when something is connected but no desk is behind it', () => {
    // a cloud session with no desk holds no PC control, and naming both CONNECTED
    // hid the only difference that matters
    expect(row('desk', { deskLinked: false }).state).toBe('off');
  });

  it('is unknown rather than off when nothing is connected to ask', () => {
    // the desk may be perfectly awake; this phone simply cannot see it
    expect(row('desk', { connected: false, deskLinked: null }).state).toBe('unknown');
  });
});

describe('the link', () => {
  it('names which transport is carrying it', () => {
    expect(row('link', { mode: 'lan' }).word).toBe('WORKSPACE');
    expect(row('link', { mode: 'cloud' }).word).toBe('CLOUD');
  });

  it('waits rather than failing while a handshake is in flight', () => {
    expect(row('link', { connected: false, connecting: true }).state).toBe('waiting');
  });

  it('is off when nothing is connected and nothing is being tried', () => {
    expect(row('link', { connected: false, connecting: false, mode: 'offline' }).state).toBe('off');
  });
});

describe('push', () => {
  it('is on once the gateway has an address for this phone', () => {
    expect(row('push').state).toBe('on');
  });

  it('is off with no token, without claiming to know why', () => {
    // `registerForPush` returns null for a denied permission and for a failed fetch
    // alike, so the panel says what it knows and the note covers both
    const r = row('push', { push: 'no-token' });
    expect(r.state).toBe('off');
    expect(r.word).toBe('NO TOKEN');
    expect(r.note).toContain('refused');
  });

  it('is unknown before it has been asked, which is not the same as refused', () => {
    // registration only runs on a cloud connect; before one there is nothing to
    // report, and a red dot there would send someone hunting a fault that is not one
    const r = row('push', { push: 'unasked' });
    expect(r.state).toBe('unknown');
  });
});

describe('the briefing schedule', () => {
  it('is on when the gateway is holding it', () => {
    expect(row('schedule').state).toBe('on');
  });

  it('is off when the gateway has not been given it, or has gone stale', () => {
    // this is the row that explains a missing briefing, and the one that explains a
    // duplicate: while it is off, the phone posts the briefing itself
    expect(row('schedule', { scheduleAtGateway: false }).state).toBe('off');
  });
});

describe('the permissions', () => {
  it('reports usage access as the phone reports it', () => {
    expect(row('usage', { usageAccess: 'granted' }).state).toBe('on');
    expect(row('usage', { usageAccess: 'denied' }).state).toBe('off');
  });

  it('does not claim a permission it could not read', () => {
    expect(row('usage', { usageAccess: 'unknown' }).state).toBe('unknown');
  });

  it('reports location sharing, which is a setting rather than a fault', () => {
    const r = row('location', { shareLocation: false });
    expect(r.state).toBe('off');
    // off here is a choice, so the word must not read as breakage
    expect(r.word).toBe('OFF BY CHOICE');
  });

  it('reports the app lock', () => {
    expect(row('lock', { appLock: false }).state).toBe('off');
  });
});

describe('what the panel says as a whole', () => {
  it('counts only what is genuinely off, never what is merely unknown', () => {
    const rows = statusRows(facts({ push: 'unasked', deskLinked: false }));
    expect(rows.filter((r) => r.state === 'off')).toHaveLength(1);
    expect(rows.filter((r) => r.state === 'unknown')).toHaveLength(1);
  });

  it('puts what is wrong at the top, because that is what is being looked for', () => {
    const rows = statusRows(facts({ usageAccess: 'denied' }));
    expect(rows[0].id).toBe('usage');
  });

  it('keeps a settled panel in its written order', () => {
    // nothing wrong means nothing to hunt, so the order stays the one that reads
    // best rather than shuffling on every render
    expect(statusRows(facts()).map((r) => r.id)).toEqual([
      'desk',
      'link',
      'token',
      'push',
      'schedule',
      'location',
      'usage',
      'lock',
    ]);
  });
});
