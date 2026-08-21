import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CLOUD_TTL_HOURS,
  DEFAULT_COMMUTE,
  alreadyBriefed,
  dayKey,
  markCloudArmed,
  saveCommute,
} from '../commute';
import type { CommuteSettings } from '../commute';
import { COMMUTE_TASK, syncCommuteTask } from '../commuteTask';

/**
 * Registering the briefing at launch.
 *
 * The 8pm briefing that never arrived: `setCommuteTask` was reachable only from
 * the switch on the Places screen, and a registration lives in Android's
 * WorkManager database rather than in this app's storage. After a reinstall the
 * switch read ON and nothing was registered.
 */

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(),
}));

jest.mock('expo-background-task', () => ({
  registerTaskAsync: jest.fn().mockResolvedValue(undefined),
  unregisterTaskAsync: jest.fn().mockResolvedValue(undefined),
  getStatusAsync: jest.fn(),
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Available: 1, Restricted: 2 },
}));

const registered = TaskManager.isTaskRegisteredAsync as jest.Mock;
const register = BackgroundTask.registerTaskAsync as jest.Mock;
const unregister = BackgroundTask.unregisterTaskAsync as jest.Mock;

/** the stored settings with a chosen subset of departures switched on */
const withOn = (...ids: string[]): CommuteSettings => ({
  ...DEFAULT_COMMUTE,
  departures: DEFAULT_COMMUTE.departures.map((d) => ({ ...d, on: ids.includes(d.placeId) })),
});

beforeEach(async () => {
  jest.clearAllMocks();
  // the markers and the settings live on disk, so one test would otherwise arrive
  // already briefed by the last one
  await AsyncStorage.clear();
});

describe('syncCommuteTask', () => {
  it('registers the task when a departure is on but nothing is registered', async () => {
    // exactly the state a reinstall leaves behind: the setting survives in
    // AsyncStorage, the WorkManager entry does not
    await saveCommute(withOn('home'));
    registered.mockResolvedValue(false);

    await syncCommuteTask();

    expect(register).toHaveBeenCalledWith(COMMUTE_TASK, { minimumInterval: 15 });
  });

  it('registers for an evening departure with the morning one switched off', async () => {
    // one registration serves both, so the office alone has to be enough to arm it
    await saveCommute(withOn('office'));
    registered.mockResolvedValue(false);

    await syncCommuteTask();

    expect(register).toHaveBeenCalledWith(COMMUTE_TASK, { minimumInterval: 15 });
  });

  it('does not register a second time when one is already live', async () => {
    await saveCommute(withOn('home', 'office'));
    registered.mockResolvedValue(true);

    await syncCommuteTask();

    expect(register).not.toHaveBeenCalled();
  });

  it('unregisters once the last departure is switched off', async () => {
    // the drift runs both ways: a stale registration would wake the phone every
    // 15 minutes to decide it has nothing to say
    await saveCommute(withOn());
    registered.mockResolvedValue(true);

    await syncCommuteTask();

    expect(unregister).toHaveBeenCalledWith(COMMUTE_TASK);
  });

  it('keeps the registration while one departure of two is still on', async () => {
    await saveCommute(withOn('office'));
    registered.mockResolvedValue(true);

    await syncCommuteTask();

    expect(unregister).not.toHaveBeenCalled();
  });

  it('registers nothing when no briefing was ever switched on', async () => {
    await saveCommute(withOn());
    registered.mockResolvedValue(false);

    await syncCommuteTask();

    expect(register).not.toHaveBeenCalled();
    expect(unregister).not.toHaveBeenCalled();
  });
});

/**
 * The task body itself, which no test has ever run.
 *
 * `defineTask` was mocked as a bare `jest.fn()`, so the callback was captured by
 * jest and never invoked. Everything below the registration — the window check, the
 * once-a-day marker, the gateway gate, the `unavailable` path that must not consume
 * the day, and the journal that must never bill the briefing for its own failures —
 * was covered only by reading. Two of this feature's bugs were in exactly that
 * region, and one of them shipped twice.
 *
 * `commute.ts` is deliberately NOT mocked: the real settings, the real markers and
 * the real briefing text run against AsyncStorage, and only `fetch` is stood in
 * for. A mock of the module under the module under test would agree with whatever
 * this file assumed.
 */
jest.mock('../journal/store', () => ({
  openJournal: jest.fn().mockResolvedValue({ allLabels: async () => [] }),
}));
jest.mock('../journal/source', () => ({ androidSource: {} }));
jest.mock('../journal/sync', () => ({ syncUsage: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../journal/rollup', () => ({ rollup: jest.fn().mockResolvedValue({}) }));
jest.mock('../journal/facts', () => ({ shareFacts: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../link/config', () => ({
  loadEndpoints: jest.fn().mockResolvedValue({ deskBase: 'http://d', cloudBase: null }),
  loadToken: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../api/client', () => ({
  createApi: () => ({
    remember: jest.fn().mockResolvedValue(undefined),
    forget: jest.fn().mockResolvedValue(undefined),
  }),
}));
jest.mock('../notify', () => ({ GENERAL_CHANNEL: 'general', postNow: jest.fn().mockResolvedValue('id') }));
jest.mock('../place', () => ({
  currentFix: jest.fn().mockResolvedValue(null),
  hasLocation: jest.fn().mockResolvedValue(false),
  loadShareLocation: jest.fn().mockResolvedValue(false),
}));
jest.mock('../knownPlaces', () => ({
  loadKnown: jest.fn().mockResolvedValue([{ id: 'home', label: 'Home', lat: 22.57, lon: 88.43 }]),
}));

const postNow = jest.requireMock('../notify').postNow as jest.Mock;
const shareFacts = jest.requireMock('../journal/facts').shareFacts as jest.Mock;
const loadKnown = jest.requireMock('../knownPlaces').loadKnown as jest.Mock;

/**
 * Captured at import time. `jest.clearAllMocks()` in `beforeEach` wipes
 * `mock.calls`, and `defineTask` is only ever called once — when the module is
 * imported, before any hook has run.
 */
const taskBody = (TaskManager.defineTask as jest.Mock).mock.calls[0][1] as () => Promise<number>;

/** the departure set to right now, so `dueDeparture` matches without a fake clock */
const dueNow = async (): Promise<Date> => {
  const now = new Date();
  await saveCommute({
    departures: DEFAULT_COMMUTE.departures.map((d) =>
      d.placeId === 'home'
        ? { ...d, on: true, hour: now.getHours(), minute: now.getMinutes() }
        : { ...d, on: false }
    ),
    days: [true, true, true, true, true, true, true],
  });
  return now;
};

/** an Open-Meteo answer for the three hours from `now`, with rain in it */
const forecast = (now: Date, chance = 60) => {
  const day = dayKey(now);
  const hours = [0, 1, 2].map((n) => (now.getHours() + n) % 24);
  return {
    hourly: {
      time: hours.map((h) => `${day}T${String(h).padStart(2, '0')}:00`),
      temperature_2m: [24, 24, 24],
      precipitation_probability: [chance, chance, chance],
      precipitation: [1.2, 0, 0],
      weather_code: [61, 61, 61],
      wind_speed_10m: [8, 8, 8],
    },
  };
};

const answers = (body: unknown, ok = true) => {
  globalThis.fetch = jest.fn().mockResolvedValue({ ok, json: async () => body }) as unknown as typeof fetch;
};

describe('the briefing task, run', () => {
  it('says nothing at all outside a departure window', async () => {
    const now = new Date();
    await saveCommute({
      departures: DEFAULT_COMMUTE.departures.map((d) => ({
        ...d,
        on: true,
        // four hours out, well past the plus-or-minus thirty minute window
        hour: (now.getHours() + 4) % 24,
        minute: now.getMinutes(),
      })),
      days: [true, true, true, true, true, true, true],
    });
    answers(forecast(now));

    expect(await taskBody()).toBe(BackgroundTask.BackgroundTaskResult.Success);
    expect(postNow).not.toHaveBeenCalled();
  });

  it('posts the briefing when one is due and nothing else is sending it', async () => {
    const now = await dueNow();
    answers(forecast(now));

    expect(await taskBody()).toBe(BackgroundTask.BackgroundTaskResult.Success);
    expect(postNow).toHaveBeenCalledTimes(1);
    expect(postNow.mock.calls[0][0].title).toBe('Before you leave Home, sir');
  });

  it('stands down when the gateway holds the schedule', async () => {
    // the whole of the 2026-08-21 duplicate: both senders fired, and this task was
    // described as a fallback while being a second sender
    const now = await dueNow();
    await markCloudArmed();
    answers(forecast(now));

    expect(await taskBody()).toBe(BackgroundTask.BackgroundTaskResult.Success);
    expect(postNow).not.toHaveBeenCalled();
  });

  it('does not reach for the forecast at all once the gateway is armed', async () => {
    // checked before the lookup, because a run that cannot post must not spend a
    // headless task's network budget finding out what it would have said
    const now = await dueNow();
    await markCloudArmed();
    answers(forecast(now));

    await taskBody();

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('takes the briefing back when the gateway has gone quiet for too long', async () => {
    const now = await dueNow();
    await markCloudArmed(Date.now() - (CLOUD_TTL_HOURS + 1) * 3_600_000);
    answers(forecast(now));

    await taskBody();

    expect(postNow).toHaveBeenCalledTimes(1);
  });

  it('does not post the same departure twice in a day', async () => {
    const now = await dueNow();
    answers(forecast(now));

    await taskBody();
    await taskBody();

    expect(postNow).toHaveBeenCalledTimes(1);
  });

  it('does not consume the day when the forecast could not be read', async () => {
    // the bug that lost the briefing for four days: a failed lookup and a quiet
    // morning both returned null, the day was marked briefed, and the next run
    // stayed silent until tomorrow, where it failed identically
    const now = await dueNow();
    answers(null, false);

    expect(await taskBody()).toBe(BackgroundTask.BackgroundTaskResult.Failed);
    expect(await alreadyBriefed('home', dayKey(now))).toBe(false);
    expect(postNow).not.toHaveBeenCalled();
  });

  it('posts on the next run after a failed lookup, rather than waiting for tomorrow', async () => {
    const now = await dueNow();
    answers(null, false);
    await taskBody();

    answers(forecast(now));
    expect(await taskBody()).toBe(BackgroundTask.BackgroundTaskResult.Success);
    expect(postNow).toHaveBeenCalledTimes(1);
  });

  it('never bills the briefing for the journal failing', async () => {
    // the journal runs on every exit and can never change what the task reports
    const now = await dueNow();
    answers(forecast(now));
    shareFacts.mockRejectedValueOnce(new Error('no desk key'));

    expect(await taskBody()).toBe(BackgroundTask.BackgroundTaskResult.Success);
    expect(postNow).toHaveBeenCalledTimes(1);
  });

  it('gives up rather than guessing when the place has no coordinates', async () => {
    const now = await dueNow();
    loadKnown.mockResolvedValueOnce([]);
    answers(forecast(now));

    expect(await taskBody()).toBe(BackgroundTask.BackgroundTaskResult.Failed);
    expect(postNow).not.toHaveBeenCalled();
  });
});
