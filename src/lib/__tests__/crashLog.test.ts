import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  CRASH_KEY,
  MAX_CRASHES,
  clearCrashes,
  crashReport,
  installCrashHandler,
  loadCrashes,
  makeCrash,
  markSeen,
  recordCrash,
  redact,
  seenAt,
  unseenCount,
} from '../crashLog';
import type { CrashRecord } from '../crashLog';

/**
 * What the app is able to say about the time it died.
 *
 * Today it says nothing. The boundary puts a render crash on screen and forgets it
 * the moment the process restarts, and an error thrown outside render leaves no
 * trace at all — so `adb logcat` on the one machine that built the APK is the whole
 * of the diagnosis, and a crash nobody was cabled up for is a crash nobody can fix.
 *
 * Two rules run through every test below. **Recording a crash must never be the
 * second crash** — this code runs while the app is dying, gets one chance, and
 * swallows everything. And **the record is derived**: an error message quotes its
 * own input, so a parse failure on a gateway frame would otherwise carry that frame
 * — token, chat text and all — into a store whose whole purpose is to be read aloud
 * and pasted into a chat window.
 */

const BUILD = { version: '1.4.0', updateId: '01a042b3', platform: 'android' };

const at = 1_724_800_000_000;

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('what is kept out of the record', () => {
  it('strips a bearer token', () => {
    expect(redact('POST /app-state failed: Bearer sk-9f8a7b6c5d4e3f2a1b0c9d8e')).not.toContain(
      'sk-9f8a7b6c5d4e3f2a1b0c9d8e'
    );
  });

  it('strips a query string, which is where this app puts its token', () => {
    const out = redact('GET https://gateway.example/app-state?token=abc123def456ghi789 timed out');
    expect(out).not.toContain('abc123def456ghi789');
    expect(out).toContain('https://gateway.example/app-state');
  });

  it('strips a long opaque run wherever it appears', () => {
    expect(redact('push registration failed for ExponentPushToken0a1b2c3d4e5f6a7b8c9d')).not.toContain(
      '0a1b2c3d4e5f6a7b8c9d'
    );
  });

  it('keeps a long identifier that is plainly code, not a secret', () => {
    // the frames are the point of the record; a rule that eats them takes the
    // diagnosis with it
    expect(redact('at createNativeStackNavigator')).toContain('createNativeStackNavigator');
  });

  it('truncates a quoted blob, because a parse error quotes what it was given', () => {
    const chat = 'x'.repeat(400);
    const out = redact('Unexpected token in JSON at position 3: "' + chat + '"');
    expect(out).not.toContain(chat);
    expect(out).toContain('Unexpected token in JSON');
  });

  it('caps the message, so one crash cannot fill the store', () => {
    expect(redact('the same words '.repeat(200)).length).toBeLessThanOrEqual(320);
  });
});

describe('the record made from an error', () => {
  const err = Object.assign(new TypeError('undefined is not a function'), {
    stack: [
      'TypeError: undefined is not a function',
      '    at HomeScreen (app:///src/screens/HomeScreen.tsx:41:9)',
      '    at renderWithHooks (app:///node_modules/react-native/index.js:1:1)',
    ].join('\n'),
  });

  const record = makeCrash({ error: err, kind: 'render', fatal: true, at, build: BUILD, screen: 'Home' });

  it('names the error and its type', () => {
    expect(record.name).toBe('TypeError');
    expect(record.message).toBe('undefined is not a function');
  });

  it('keeps the frames, which are what a fix starts from', () => {
    expect(record.frames[0]).toContain('HomeScreen');
  });

  it('drops the header line, which only repeats the message', () => {
    expect(record.frames.join('\n')).not.toContain('TypeError: undefined is not a function');
  });

  it('carries the build, because a crash on an old bundle is a different crash', () => {
    expect(record.build).toEqual(BUILD);
    expect(record.screen).toBe('Home');
  });

  it('survives being handed something that is not an Error at all', () => {
    const thrown = makeCrash({ error: 'boom', kind: 'js', fatal: false, at, build: BUILD });
    expect(thrown.message).toBe('boom');
    expect(thrown.name).toBe('Error');
    expect(thrown.frames).toEqual([]);
  });
});

describe('the store', () => {
  const crash = (n: number): CrashRecord =>
    makeCrash({ error: new Error('crash ' + n), kind: 'js', fatal: true, at: at + n, build: BUILD });

  it('reads back what was written', async () => {
    await recordCrash(crash(1));
    expect((await loadCrashes())[0].message).toBe('crash 1');
  });

  it('puts the newest first, which is the one being asked about', async () => {
    await recordCrash(crash(1));
    await recordCrash(crash(2));
    expect((await loadCrashes()).map((c) => c.message)).toEqual(['crash 2', 'crash 1']);
  });

  it('keeps only the last few', async () => {
    for (let n = 1; n <= MAX_CRASHES + 3; n += 1) await recordCrash(crash(n));
    const kept = await loadCrashes();
    expect(kept).toHaveLength(MAX_CRASHES);
    expect(kept[0].message).toBe('crash ' + (MAX_CRASHES + 3));
  });

  it('reads empty rather than throwing when the store is rubbish', async () => {
    await AsyncStorage.setItem(CRASH_KEY, '{not json');
    expect(await loadCrashes()).toEqual([]);
  });

  it('drops entries that are not records, rather than rendering half of one', async () => {
    await AsyncStorage.setItem(CRASH_KEY, JSON.stringify([{ at: 1 }, 'nonsense']));
    expect(await loadCrashes()).toEqual([]);
  });

  it('never throws when the disk refuses, because it is already mid-crash', async () => {
    // `mockImplementationOnce` rather than `spyOn(...).mockRestore()`: this module's
    // AsyncStorage is already a jest mock, so spying on it returns that same mock and
    // restoring it strips the implementation the whole file depends on. Cost an hour.
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(() =>
      Promise.reject(new Error('no space'))
    );
    await expect(recordCrash(crash(1))).resolves.toBeUndefined();
    expect(await loadCrashes()).toEqual([]);
  });

  it('forgets everything when asked', async () => {
    await recordCrash(crash(1));
    await clearCrashes();
    expect(await loadCrashes()).toEqual([]);
  });
});

describe('what the settings row shows', () => {
  const crash = (n: number): CrashRecord =>
    makeCrash({ error: new Error('crash ' + n), kind: 'js', fatal: true, at: at + n, build: BUILD });

  it('counts every crash before anything has been read', () => {
    expect(unseenCount([crash(1), crash(2)], 0)).toBe(2);
  });

  it('counts only what arrived after the screen was last opened', () => {
    expect(unseenCount([crash(2), crash(1)], at + 1)).toBe(1);
  });

  it('remembers when the screen was last opened', async () => {
    await markSeen(at + 5);
    expect(await seenAt()).toBe(at + 5);
  });

  it('treats never-opened as nothing read', async () => {
    expect(await seenAt()).toBe(0);
  });
});

describe('the errors nothing else catches', () => {
  type Handler = (e: unknown, fatal?: boolean) => void;

  /** installs the handler and hands back the one it wrapped, plus what it replaced */
  const install = (opts: { build?: () => CrashRecord['build']; previous?: Handler | undefined }) => {
    const calls: unknown[][] = [];
    const previous: Handler | undefined =
      'previous' in opts ? opts.previous : (e, f) => calls.push([e, f]);
    let installed: Handler = () => undefined;
    installCrashHandler({
      errorUtils: {
        getGlobalHandler: () => previous,
        setGlobalHandler: (h) => {
          installed = h;
        },
      },
      build: opts.build ?? (() => BUILD),
      now: () => at,
    });
    return { calls, fire: (e: unknown, f?: boolean) => installed(e, f) };
  };

  it('records an error thrown outside render', async () => {
    const h = install({});
    h.fire(new Error('socket died'), true);
    // the handler must not await the write — the fatal path below it has to run on
    // the same tick — so the record lands a few microtasks later
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    expect((await loadCrashes())[0].message).toBe('socket died');
  });

  it('calls the handler it replaced, so the app still dies the way it would have', () => {
    const h = install({});
    const err = new Error('socket died');
    h.fire(err, true);
    expect(h.calls).toEqual([[err, true]]);
  });

  it('calls it even when writing the record throws', () => {
    const h = install({
      build: () => {
        throw new Error('no config');
      },
    });
    const err = new Error('socket died');
    expect(() => h.fire(err, true)).not.toThrow();
    expect(h.calls).toEqual([[err, true]]);
  });

  it('survives there being no handler to replace', () => {
    const h = install({ previous: undefined });
    expect(() => h.fire(new Error('socket died'), true)).not.toThrow();
  });
});

describe('the report that gets pasted into a chat window', () => {
  const record = makeCrash({
    error: Object.assign(new TypeError('undefined is not a function'), {
      stack: 'TypeError: x\n    at HomeScreen (app:///src/screens/HomeScreen.tsx:41:9)',
    }),
    kind: 'render',
    fatal: true,
    at,
    build: BUILD,
  });

  it('says plainly when there is nothing to report', () => {
    expect(crashReport([])).toContain('No crashes recorded');
  });

  it('names the error and the build it happened on', () => {
    const out = crashReport([record]);
    expect(out).toContain('TypeError: undefined is not a function');
    expect(out).toContain('01a042b3');
    expect(out).toContain('1.4.0');
  });

  it('carries the frames, which is the whole point of pasting it', () => {
    expect(crashReport([record])).toContain('HomeScreen');
  });

  it('numbers them, so a report of three is obviously a report of three', () => {
    expect(crashReport([record, record])).toContain('2 of 2');
  });
});
