/// <reference types="node" />
//
// Scoped to this file on purpose. `tsconfig.json` sets `types: ["jest"]` so that app
// code cannot reach a Node global and still typecheck — a real constraint in a React
// Native project, and not one worth relaxing globally for one source scan.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { JarvisProvider, useJarvis } from '../JarvisProvider';

/**
 * Provider effects do not outlive their tree.
 *
 * Two claims, and they are deliberately different in kind. The first is
 * behavioural: a load still in flight when the tree goes away must not come back
 * and touch React. The second is structural, and it is the one that keeps this
 * closed — eight of the nine settle sites in the provider carried a hand-written
 * `alive` guard and the ninth did not, for long enough that it took an inventory
 * to find out which. A guard nobody can forget is worth more than nine guards
 * somebody remembered, so the shape is asserted rather than trusted.
 *
 * **Its own file, per the note at the foot of `jarvisProvider.test.tsx`:** a test
 * that mounts the provider belongs somewhere with a fresh module registry.
 */

let mockReleaseShare: (on: boolean) => void = () => {};
const mockShareLoad = new Promise<boolean>((res) => {
  mockReleaseShare = res;
});

jest.mock('../../link/useLink', () => ({
  useLink: () => ({
    mode: 'desk',
    status: 'open',
    lastError: null,
    send: jest.fn(() => true),
    sendVoice: jest.fn(() => false),
    reprobe: jest.fn(),
    disconnect: jest.fn(),
  }),
}));
jest.mock('../../api/client', () => ({
  createApi: () => ({
    backdoor: jest.fn().mockResolvedValue({}),
    pending: jest.fn().mockResolvedValue({}),
    confirm: jest.fn().mockResolvedValue(undefined),
    answerWatch: jest.fn().mockResolvedValue(undefined),
    tasks: jest.fn().mockResolvedValue({}),
    presence: jest.fn().mockResolvedValue({}),
    registerPush: jest.fn().mockResolvedValue(undefined),
    syncCommute: jest.fn().mockResolvedValue(undefined),
  }),
}));
jest.mock('../../lib/notify', () => ({
  WATCH_CATEGORY: 'watch',
  WATCH_CHANNEL: 'watch',
  GENERAL_CHANNEL: 'general',
  alertFromLaunch: jest.fn().mockResolvedValue(null),
  dismiss: jest.fn().mockResolvedValue(undefined),
  onAlertTapped: jest.fn(() => jest.fn()),
  pendingReplies: jest.fn().mockResolvedValue([]),
  onPushReply: jest.fn(() => jest.fn()),
  replyFromLaunch: jest.fn().mockResolvedValue(null),
  postNow: jest.fn().mockResolvedValue(undefined),
  registerForPush: jest.fn().mockResolvedValue('ExponentPushToken[test]'),
  shouldNotifyReply: jest.fn(() => false),
}));
jest.mock('../../navigation/RootNavigator', () => ({ openChat: jest.fn() }));
jest.mock('../../lib/haptics', () => ({ haptic: { good: jest.fn() } }));
jest.mock('../../lib/journal/rollup', () => ({
  usageForAsk: async () => ({ today: 0, pickups: 0, top: [], usual: 0, days: 0 }),
}));
jest.mock('../chatStore', () => ({
  loadChat: jest.fn().mockResolvedValue([]),
  saveChat: jest.fn().mockResolvedValue(undefined),
  clearChat: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../lib/knownPlaces', () => ({
  loadKnown: jest.fn().mockResolvedValue([]),
  nameFor: jest.fn(() => null),
}));
jest.mock('../../lib/place', () => ({
  FIX_TTL_MS: 60000,
  askForLocation: jest.fn().mockResolvedValue(false),
  currentFix: jest.fn().mockResolvedValue(null),
  forgetTrail: jest.fn().mockResolvedValue(undefined),
  // the load this whole file is about: it does not settle until the test says so
  loadShareLocation: jest.fn(() => mockShareLoad),
  loadTrail: jest.fn().mockResolvedValue([]),
  rememberPlace: jest.fn().mockResolvedValue(undefined),
  saveShareLocation: jest.fn().mockResolvedValue(undefined),
  weatherFor: jest.fn().mockResolvedValue(null),
}));

function Probe() {
  const { hud } = useJarvis();
  return <Text testID="probe">{String(hud.chat.length)}</Text>;
}

describe('a load still in flight when the tree goes away', () => {
  it('does not come back and touch React', async () => {
    /**
     * The act warning is the instrument, because there is no louder one.
     *
     * React 18 dropped the "state update on an unmounted component" warning, so a
     * late settle is silent in the app. Under test it is not: an update outside
     * `act` says so, and enough of those corrupt the environment until every later
     * `render` in the file returns an empty tree. That is the damage being
     * prevented, so that is what is measured.
     */
    const errors: string[] = [];
    const spy = jest.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args.map(String).join(' '));
    });

    try {
      const view = await render(
        <JarvisProvider>
          <Probe />
        </JarvisProvider>
      );
      // gone before the load answers, which is the ordinary case on a fast tab change
      view.unmount();

      await act(async () => {
        mockReleaseShare(true);
        await mockShareLoad;
      });

      expect(errors.filter((e) => /not wrapped in act/i.test(e))).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});

/**
 * The shape of every settle site in the provider, asserted.
 *
 * A source scan rather than a lint rule because it is one file and one pattern,
 * and because the rule worth enforcing is narrower than anything a general linter
 * expresses: inside this provider, a promise that settles into React state goes
 * through a `live()` scope. Yesterday this test would have failed on
 * `loadShareLocation().then(setShareLocationState)` — the single bare settle,
 * indistinguishable by eye from the eight beside it that were guarded.
 */
describe('every settle site in the provider', () => {
  const source = readFileSync(join(__dirname, '..', 'JarvisProvider.tsx'), 'utf8');
  const lines = source.split('\n');

  it('routes its result through a cancellation scope', () => {
    // Plain string checks rather than a regex: the pattern being looked for is a
    // literal, and a regex here would be one more thing to get right in a test whose
    // whole job is to be trusted.
    const bare = lines
      .filter((text) => text.includes('.then('))
      .filter((text) => !text.trimEnd().endsWith('.then(') && !text.includes('l.only('))
      .map((text) => text.trim());

    // `.then(` at the end of a line opens a wrapped handler on the next, so those
    // are fine. The alert registration is the one deliberate exception, and it is
    // named here rather than counted so a second exception cannot appear quietly.
    expect(bare).toEqual(['}).then((id) => {']);
  });

  it('has no hand-written guard left, which is the state that let one be forgotten', () => {
    expect(source).not.toMatch(/let alive = true/);
  });

  it('keeps the one exception explicit: a registration is handed back, not dropped', () => {
    // `l.alive` instead of `l.only` because a dead run has real work to do here —
    // dismissing a notification for an alert that no longer exists.
    expect(source).toMatch(/if \(l\.alive\) watchNote\.current = id;\s*\n\s*else void dismiss\(id\);/);
  });

  it('ends every scope it opens', () => {
    const opened = (source.match(/const l = live\(\);/g) ?? []).length;
    const ended = (source.match(/return l\.end;|l\.end\(\);/g) ?? []).length;

    expect(opened).toBeGreaterThan(0);
    expect(ended).toBe(opened);
  });
});
