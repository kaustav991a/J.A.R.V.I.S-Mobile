import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  STALE_AFTER_MS,
  ago,
  forgetHeartbeat,
  healthFrom,
  healthLine,
  noteArm,
  noteRun,
  readArm,
  readHeartbeat,
} from '../taskHealth';
import type { Heartbeat } from '../taskHealth';

/**
 * Whether the background task is running, as opposed to registered.
 *
 * Every state asserted here except `alive` is one this phone has actually been in,
 * and none of them can be reproduced on demand — which is the whole argument for a
 * pure verdict function. The alternative is finding out on a morning when the
 * briefing did not arrive.
 */

const beat = (over: Partial<Heartbeat> = {}): Heartbeat => ({
  at: 1_000_000,
  outcome: 'idle',
  runs: 3,
  ...over,
});

describe('the verdict', () => {
  const now = 1_000_000;

  it('says off when nothing is switched on, because that explains everything after it', () => {
    const r = healthFrom({ wanted: false, registered: false, available: true, beat: beat(), now });
    expect(r.health).toBe('off');
  });

  it('says off even when Android would also refuse, since the switch is the nearer cause', () => {
    // ordering matters: telling someone background work is blocked, when they simply
    // have no departure switched on, sends them into Android settings for nothing
    const r = healthFrom({ wanted: false, registered: false, available: false, beat: null, now });
    expect(r.health).toBe('off');
  });

  /**
   * The state the device was actually in on 2026-08-26, and the reason this reading
   * grew a sixth value.
   *
   * Briefings were arriving on time from the gateway while `dumpsys jobscheduler`
   * listed 657 registered jobs and none for this app. Folding this into `off` would
   * print "No departure is switched on" at someone with two of them switched on.
   */
  it('separates a switch that is off from a registration Android is not holding', () => {
    const off = healthFrom({ wanted: false, registered: false, available: true, beat: null, now });
    const unarmed = healthFrom({ wanted: true, registered: false, available: true, beat: null, now });

    expect(off.health).toBe('off');
    expect(unarmed.health).toBe('unarmed');
  });

  it('calls it unarmed even when it used to run, because the fallback is still not armed', () => {
    // a heartbeat from last week does not make an unregistered task a running one
    const r = healthFrom({ wanted: true, registered: false, available: true, beat: beat(), now });
    expect(r.health).toBe('unarmed');
  });

  it('says blocked when Android has background work disabled', () => {
    const r = healthFrom({ wanted: true, registered: true, available: false, beat: beat(), now });
    expect(r.health).toBe('blocked');
  });

  /**
   * The reading the old screen could not produce.
   *
   * `getStatusAsync()` returns `Available` on this phone and the task had not run in
   * days — RARE standby bucket, background network cut. Registered-and-never-executed
   * is throttling, and it wants a different answer from a schedule that is merely
   * quiet.
   */
  it('separates never having run from having stopped', () => {
    expect(healthFrom({ wanted: true, registered: true, available: true, beat: null, now }).health).toBe('never-ran');
    expect(
      healthFrom({ wanted: true, registered: true, available: true, beat: beat({ at: now - STALE_AFTER_MS - 1 }), now })
        .health
    ).toBe('stale');
  });

  it('is alive right up to the staleness bound, and not past it', () => {
    const edge = healthFrom({ wanted: true, registered: true, available: true, beat: beat({ at: now - STALE_AFTER_MS }), now });
    const over = healthFrom({ wanted: true, registered: true, available: true, beat: beat({ at: now - STALE_AFTER_MS - 1 }), now });

    expect(edge.health).toBe('alive');
    expect(over.health).toBe('stale');
  });

  it('reports a run from the future as current rather than as overdue', () => {
    // a clock that moved, not a run that has not happened — the same reasoning
    // `cloudArmed` uses for a negative age
    const r = healthFrom({ wanted: true, registered: true, available: true, beat: beat({ at: now + 60_000 }), now });

    expect(r.health).toBe('alive');
    expect(r.since).toBe(0);
  });

  it('carries how long it has been, so the line does not have to recompute it', () => {
    const r = healthFrom({ wanted: true, registered: true, available: true, beat: beat({ at: now - 7_200_000 }), now });
    expect(r.since).toBe(7_200_000);
  });

  it('has no elapsed time to report when it has never run', () => {
    expect(healthFrom({ wanted: true, registered: true, available: true, beat: null, now }).since).toBeNull();
  });
});

describe('what it tells a person', () => {
  const now = 1_000_000;
  const line = (over: Parameters<typeof healthFrom>[0]) => healthLine(healthFrom(over));

  it('never exclaims, and never sounds cheerful about a broken state', () => {
    for (const r of [
      { wanted: false, registered: false, available: true, beat: null, now },
      { wanted: true, registered: false, available: true, beat: null, now },
      { wanted: true, registered: true, available: false, beat: null, now },
      { wanted: true, registered: true, available: true, beat: null, now },
      { wanted: true, registered: true, available: true, beat: beat({ at: 0 }), now },
      { wanted: true, registered: true, available: true, beat: beat({ at: now }), now },
    ]) {
      expect(line(r)).not.toContain('!');
    }
  });

  it('says the fallback is not armed, in those words, because that is the finding', () => {
    const said = line({ wanted: true, registered: false, available: true, beat: null, now });
    expect(said).toContain('not armed');
    // and it must not claim the switch is off, which is what it would have said before
    expect(said).not.toContain('No departure is switched on');
  });

  it('names throttling as throttling, rather than as a schedule problem', () => {
    // this is the sentence that would have saved four days of reading the feature as
    // broken when it was being denied a job window
    expect(line({ wanted: true, registered: true, available: true, beat: null, now })).toContain('throttling');
  });

  it('says what the last run actually did, not merely that there was one', () => {
    expect(line({ wanted: true, registered: true, available: true, beat: beat({ outcome: 'briefed', at: now }), now })).toContain(
      'sent a briefing'
    );
    expect(line({ wanted: true, registered: true, available: true, beat: beat({ outcome: 'failed', at: now }), now })).toContain(
      'forecast could not be reached'
    );
    expect(line({ wanted: true, registered: true, available: true, beat: beat({ outcome: 'stood-down', at: now }), now })).toContain(
      'gateway was briefing'
    );
  });

  it('counts one run without the plural', () => {
    expect(line({ wanted: true, registered: true, available: true, beat: beat({ runs: 1, at: now }), now })).toContain('1 run ');
  });
});

describe('elapsed time', () => {
  it('rounds down, because a measured figure reads better than a precise one', () => {
    expect(ago(0)).toBe('just now');
    expect(ago(59_000)).toBe('just now');
    expect(ago(60_000)).toBe('1 minute ago');
    expect(ago(119_000)).toBe('1 minute ago');
    expect(ago(3_600_000)).toBe('1 hour ago');
    expect(ago(86_400_000)).toBe('1 day ago');
    expect(ago(90_000_000)).toBe('1 day ago');
    expect(ago(2 * 86_400_000)).toBe('2 days ago');
  });
});

describe('the stored heartbeat', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('is absent until the task has run once', async () => {
    expect(await readHeartbeat()).toBeNull();
  });

  it('records what the run did, and counts it', async () => {
    await noteRun('briefed', 500);
    expect(await readHeartbeat()).toEqual({ at: 500, outcome: 'briefed', runs: 1 });
  });

  it('counts up across runs, so a quiet task can still be shown to be working', async () => {
    await noteRun('idle', 1);
    await noteRun('idle', 2);
    await noteRun('failed', 3);

    expect(await readHeartbeat()).toEqual({ at: 3, outcome: 'failed', runs: 3 });
  });

  it('can be cleared, which is how the reboot check is run', async () => {
    // clear, reboot, leave the app closed, and see whether it comes back on its own
    await noteRun('idle', 1);
    await forgetHeartbeat();

    expect(await readHeartbeat()).toBeNull();
  });

  it('treats a stamp it cannot describe as no stamp at all', async () => {
    // reporting a run that cannot be described is worse than reporting none: the
    // whole point of the reading is that it can be trusted
    await AsyncStorage.setItem('jarvis_task_heartbeat', JSON.stringify({ at: 'yesterday' }));
    expect(await readHeartbeat()).toBeNull();

    await AsyncStorage.setItem('jarvis_task_heartbeat', 'not json');
    expect(await readHeartbeat()).toBeNull();
  });

  it('accepts a stamp with no count, from before runs were counted', async () => {
    await AsyncStorage.setItem('jarvis_task_heartbeat', JSON.stringify({ at: 42, outcome: 'idle' }));
    expect(await readHeartbeat()).toEqual({ at: 42, outcome: 'idle', runs: 1 });
  });

  /**
   * A heartbeat that failed to save is a diagnostic gone missing. A briefing that
   * failed to arrive is the morning gone missing, and the second must never be
   * caused by the first.
   */
  /**
   * `jest.spyOn(AsyncStorage, 'setItem').mockRestore()` is how this was written, and
   * it is a trap: the async-storage jest mock is *already* a `jest.fn`, so restoring
   * the spy hands back a mock with no implementation at all. Every write for the rest
   * of the file is then silently dropped and every read returns a stale value — which
   * is what happened to the four tests below this one when they were added, and it
   * reads exactly like a storage helper that does not work.
   *
   * `mockRejectedValueOnce` on the existing mock refuses one call and leaves the
   * implementation where it was.
   */
  it('does not throw when storage refuses, because it runs inside the task', async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('no space'));
    await expect(noteRun('idle')).resolves.toBeUndefined();
  });

  it('reads as never-run when storage refuses, rather than failing the screen', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('unavailable'));
    expect(await readHeartbeat()).toBeNull();
  });
});

/**
 * Why the fallback is not armed, which is a different question from whether it is.
 *
 * `unarmed` was found on the device on 2026-08-26 and said one sentence about three
 * different situations: nothing ever tried, the attempt was refused, and the attempt
 * was honoured and has since been dropped. They want three different responses —
 * open the screen, read the platform's complaint, or lift the battery restriction —
 * and a single sentence sends everybody to the wrong one.
 */
describe('the last attempt to arm it', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('is absent until the app has ever tried', async () => {
    expect(await readArm()).toBeNull();
  });

  it('remembers the platform’s own words for a refusal', async () => {
    // the reason was being swallowed by a bare catch in setCommuteTask, which is why
    // a phone with the switch on and no registration could not say what had happened
    await noteArm({ at: 500, ok: false, reason: 'TaskManager is not available' });

    expect(await readArm()).toEqual({ at: 500, ok: false, reason: 'TaskManager is not available' });
  });

  it('keeps only the latest, because a screen asks about now', async () => {
    await noteArm({ at: 1, ok: false, reason: 'first' });
    await noteArm({ at: 2, ok: true, reason: null });

    expect(await readArm()).toEqual({ at: 2, ok: true, reason: null });
  });

  it('is treated as never having tried when the stored shape is older than the code', async () => {
    // the same rule the heartbeat follows: a record that cannot be described is worse
    // than no record, because it would be reported as an attempt that did not happen
    await AsyncStorage.setItem('jarvis_task_arm', JSON.stringify({ ok: true }));

    expect(await readArm()).toBeNull();
  });
});

describe('what it tells a person about not being armed', () => {
  const now = 1_000_000;
  const unarmed = (arm: Parameters<typeof healthFrom>[0]['arm']) =>
    healthLine(healthFrom({ wanted: true, registered: false, available: true, beat: null, arm, now }));

  it('names the platform’s reason when arming was refused', () => {
    expect(unarmed({ at: now, ok: false, reason: 'TaskManager is not available' })).toContain(
      'TaskManager is not available'
    );
  });

  it('says Android dropped it when the last attempt was verified and the registration is gone', () => {
    // distinct from a refusal, and the likelier one on this phone: WorkManager holds
    // the entry and a battery optimiser removes it later, with nothing said
    const said = unarmed({ at: now - 3_600_000, ok: true, reason: null });
    expect(said).toContain('1 hour ago');
    expect(said).toMatch(/dropped/i);
  });

  it('still says the fallback is not armed when nothing has ever tried', () => {
    expect(unarmed(null)).toContain('not armed');
  });

  it('carries the attempt into the reading, so a screen can act on it', () => {
    const arm = { at: now, ok: false, reason: 'no' };
    expect(healthFrom({ wanted: true, registered: false, available: true, beat: null, arm, now }).arm).toEqual(arm);
  });
});
