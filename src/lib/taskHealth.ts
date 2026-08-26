import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Whether the background task is actually running, as opposed to registered.
 *
 * `BackgroundTask.getStatusAsync()` answers a different question from the one
 * anybody is asking. It reports `Available` on a phone the briefing will never
 * reach — measured on the device this app is built for, `am get-standby-bucket`
 * returns 40 (RARE) and the scheduler reports the network cut for this uid — so a
 * screen that showed only that status has been saying "healthy" about a feature
 * that had not run in days. That is most of why this looked broken rather than
 * throttled.
 *
 * The missing evidence is a heartbeat. Registration lives in Android's WorkManager
 * database and says nothing about whether the work was ever *executed*; a stamp
 * written by the task itself says exactly that, because only a run can write it.
 *
 * **This is also the only way to answer "did he come back after the reboot?"**
 * WorkManager persists its own queue and reschedules at boot, so the briefing is
 * expected to survive one — but expected is not observed, and until now confirming
 * it meant `adb logcat` on the one machine that built the APK. Reboot the phone,
 * leave the app closed, and watch whether this stamp advances.
 */

/** Where the heartbeat lives. Small, and written on every run. */
const KEY = 'jarvis_task_heartbeat';

/**
 * What a run did, which matters as much as that it happened.
 *
 * A task that wakes every fifteen minutes and returns `idle` is healthy. One that
 * only ever records `failed` is running and getting nowhere — a distinction the old
 * "Available" badge could not draw, and the difference between a throttling problem
 * and a network one.
 */
export type RunOutcome =
  /** woke, nothing was due */
  | 'idle'
  /** woke and posted a briefing */
  | 'briefed'
  /** woke, a briefing was due, the lookup could not answer */
  | 'failed'
  /** woke, but the gateway is briefing so this run stood down */
  | 'stood-down';

export type Heartbeat = { at: number; outcome: RunOutcome; runs: number };

/**
 * Record that the task woke.
 *
 * Never throws and never blocks the caller's real work: a heartbeat that failed to
 * save is a diagnostic gone missing, while a briefing that failed to arrive is the
 * morning gone missing, and the second must never be caused by the first.
 */
export async function noteRun(outcome: RunOutcome, at: number = Date.now()): Promise<void> {
  try {
    const prev = await readHeartbeat();
    const next: Heartbeat = { at, outcome, runs: (prev?.runs ?? 0) + 1 };
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // diagnostics are never allowed to cost the thing they diagnose
  }
}

/** The last heartbeat, or `null` if the task has never once run. */
export async function readHeartbeat(): Promise<Heartbeat | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const { at, outcome, runs } = parsed as Partial<Heartbeat>;
    // a stamp from an older shape is treated as no stamp rather than as a run,
    // because reporting a run that cannot be described is worse than reporting none
    if (typeof at !== 'number' || !Number.isFinite(at)) return null;
    if (typeof outcome !== 'string') return null;
    return { at, outcome: outcome as RunOutcome, runs: typeof runs === 'number' ? runs : 1 };
  } catch {
    return null;
  }
}

/** Forget the heartbeat. For the reboot check: clear, reboot, watch it come back. */
export async function forgetHeartbeat(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // nothing to do, and nothing worth failing for
  }
}

/** Where the last attempt to arm the task lives. One record; the current one. */
const ARM_KEY = 'jarvis_task_arm';

/**
 * The last time the app asked Android to hold a registration, and what came back.
 *
 * `unarmed` says the fallback is not armed. It does not say why, and there are three
 * whys with three different answers: nothing has ever asked, the ask was refused, or
 * the ask was honoured and the registration has since been dropped. The first wants
 * the app opened, the second wants the platform's complaint read, and the third wants
 * the battery restriction lifted — so one sentence for all three sends two people out
 * of three to the wrong place.
 *
 * **`ok` means verified, not returned.** `registerTaskAsync` resolving proves the call
 * did not throw; only reading the registration back proves Android is holding it. The
 * device on 2026-08-26 had a switch reading ON, a call that had evidently not thrown,
 * and no job for this uid in `dumpsys jobscheduler`.
 */
export type ArmAttempt = {
  at: number;
  /** whether Android was found to be holding the registration afterwards */
  ok: boolean;
  /** the platform's own words when it was not, and `null` when it was */
  reason: string | null;
};

/** Record an attempt. Never throws: a lost diagnostic must not cost the briefing. */
export async function noteArm(a: ArmAttempt): Promise<void> {
  try {
    await AsyncStorage.setItem(ARM_KEY, JSON.stringify(a));
  } catch {
    // diagnostics are never allowed to cost the thing they diagnose
  }
}

/** The last attempt, or `null` if the app has never once tried. */
export async function readArm(): Promise<ArmAttempt | null> {
  try {
    const raw = await AsyncStorage.getItem(ARM_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const { at, ok, reason } = parsed as Partial<ArmAttempt>;
    // the heartbeat's rule, for the heartbeat's reason: a record that cannot be
    // described is reported as no record rather than as an attempt that did not happen
    if (typeof at !== 'number' || !Number.isFinite(at)) return null;
    if (typeof ok !== 'boolean') return null;
    return { at, ok, reason: typeof reason === 'string' ? reason : null };
  } catch {
    return null;
  }
}

/**
 * Android's floor is 15 minutes and it honours something much longer in practice,
 * so a task in a good state can be quiet for a while. Six hours is chosen to be
 * longer than any healthy gap observed and shorter than the gap between two
 * departures, so a stale reading means something rather than merely "it is night".
 */
export const STALE_AFTER_MS = 6 * 3_600_000;

export type Health =
  /** the switch is off; nothing is owed */
  | 'off'
  /**
   * Switched on, and Android holds no registration for it.
   *
   * **The state found on the device on 2026-08-26**, and the reason this reading
   * needed a sixth value. Briefings were arriving on time from the gateway while
   * `dumpsys jobscheduler` listed 657 registered jobs and none for this app — the
   * phone fallback simply was not armed, and nothing could say so, because a failed
   * registration is swallowed by `setCommuteTask`, passed up as `false`, and
   * discarded by `App.tsx`. Collapsing this into `off` would have printed "No
   * departure is switched on" at someone with two of them switched on, which is the
   * kind of confident wrong answer this app exists to avoid.
   */
  | 'unarmed'
  /** registered, and Android says background work is disabled for this app */
  | 'blocked'
  /** registered and permitted, and it has never once executed */
  | 'never-ran'
  /** it has run, but not lately */
  | 'stale'
  /** running */
  | 'alive';

export type HealthReading = {
  health: Health;
  /** ms since the last run, or `null` if it has never run */
  since: number | null;
  beat: Heartbeat | null;
  /** the last attempt to arm it, which is what `unarmed` needs explaining with */
  arm: ArmAttempt | null;
  /**
   * ms since that attempt, or `null` if there has never been one.
   *
   * Carried rather than read from the clock inside `healthLine`, so the sentence
   * stays a pure function of the reading — the same reason `since` is here.
   */
  armAge: number | null;
};

/**
 * The verdict, as a pure function of four facts.
 *
 * Pure so it can be tested without a device, which matters more here than usual:
 * every state below except `alive` is one this phone has actually been in, and none
 * of them could be reproduced on demand. The ordering is deliberate — `off` before
 * `blocked` because a switch that is off explains everything after it, and
 * `never-ran` before `stale` because "it has never worked" and "it has stopped
 * working" want different responses from the person reading it.
 */
export function healthFrom(input: {
  /** whether any departure is switched on — what the user asked for */
  wanted: boolean;
  /** whether Android is actually holding a registration — what is true */
  registered: boolean;
  available: boolean;
  beat: Heartbeat | null;
  /** the last attempt to arm it; optional because most states do not turn on it */
  arm?: ArmAttempt | null;
  now: number;
}): HealthReading {
  const { wanted, registered, available, beat, now } = input;
  const arm = input.arm ?? null;
  const armAge = arm ? Math.max(0, now - arm.at) : null;
  const since = beat ? Math.max(0, now - beat.at) : null;

  // asked for and not held is the defect; not asked for explains everything after it
  if (!wanted) return { health: 'off', since, beat, arm, armAge };
  if (!registered) return { health: 'unarmed', since, beat, arm, armAge };
  if (!available) return { health: 'blocked', since, beat, arm, armAge };
  if (!beat) return { health: 'never-ran', since: null, beat: null, arm, armAge };
  // a stamp from the future is a clock that moved, not a run that has not happened
  return { health: since !== null && since > STALE_AFTER_MS ? 'stale' : 'alive', since, beat, arm, armAge };
}

/**
 * What to tell a person, in the voice the rest of the app uses.
 *
 * Figures before the remark, and no cheerful noise on a broken state — the same
 * rules the briefing itself follows, and for the same reason: these lines are read
 * by someone deciding whether the feature is worth trusting.
 */
export function healthLine(r: HealthReading): string {
  switch (r.health) {
    case 'off':
      return 'Not scheduled. No departure is switched on.';
    case 'unarmed':
      return `Switched on, and Android holds no registration for it. The fallback is not armed. ${whyUnarmed(r.arm, r.armAge)}`.trim();
    case 'blocked':
      return 'Scheduled, and Android has background work disabled for this app. It cannot run.';
    case 'never-ran':
      return 'Scheduled, and it has never once run. That is throttling, not a schedule problem.';
    case 'stale':
      return `Last ran ${ago(r.since ?? 0)}, which is longer than it should be. ${lastDid(r.beat)}`;
    case 'alive':
      return `Last ran ${ago(r.since ?? 0)}. ${lastDid(r.beat)}`;
  }
}

/**
 * The half of `unarmed` that says what to do about it.
 *
 * Three situations wearing one word. A refusal quotes the platform rather than
 * paraphrasing it: the message is the only thing here nobody has guessed at, and a
 * rewrite of an Android error is a rewrite of the one fact in the sentence.
 */
const whyUnarmed = (arm: ArmAttempt | null, age: number | null): string => {
  if (!arm) return 'Nothing has asked it to yet.';
  if (!arm.ok) return `Arming it failed ${ago(age ?? 0)}: ${arm.reason ?? 'no reason given'}.`;
  // the likelier case on this phone, and the one that used to be invisible: the
  // registration was verified and something removed it afterwards without a word
  return `It was armed ${ago(age ?? 0)} and Android has since dropped it.`;
};

const lastDid = (beat: Heartbeat | null): string => {
  if (!beat) return '';
  const what: Record<RunOutcome, string> = {
    idle: 'Nothing was due.',
    briefed: 'It sent a briefing.',
    failed: 'A briefing was due and the forecast could not be reached.',
    'stood-down': 'The gateway was briefing, so it stood down.',
  };
  return `${what[beat.outcome] ?? ''} ${beat.runs} run${beat.runs === 1 ? '' : 's'} recorded.`.trim();
};

/** Rounded down, because "2 hours ago" reads as measured and "1.7" reads as noise. */
export function ago(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
