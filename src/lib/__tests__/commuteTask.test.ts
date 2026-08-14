import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { saveCommute, DEFAULT_COMMUTE } from '../commute';
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

beforeEach(() => {
  jest.clearAllMocks();
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
