import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityScreen } from '../ActivityScreen';
import { AppearanceProvider } from '../../theme/appearance';

/**
 * The activity sheet: what happened, whether it has been read, and reading it.
 *
 * The bell carries a count, so there has to be a way to put it back to nothing —
 * otherwise the number only ever grows and stops being read. "Mark all read"
 * clears the *unread* half and deliberately leaves parked approvals alone: an
 * approval is answered, not read.
 */

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => cb(),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true }),
}));

const mockOpenChat = jest.fn();
jest.mock('../../navigation/RootNavigator', () => ({ openChat: () => mockOpenChat() }));

/** jest only lets a factory reach an out-of-scope name prefixed `mock` */
let mockJarvis: Record<string, unknown> = {};
const mockMarkRead = jest.fn();
const mockMarkOne = jest.fn();

jest.mock('../../state/JarvisProvider', () => ({
  useJarvis: () => ({
    hud: jest.requireActual('../../state/hudReducer').initialHudState,
    decide: jest.fn().mockResolvedValue(undefined),
    alertsUnread: 0,
    markAlertsRead: mockMarkRead,
    markRead: mockMarkOne,
    readIds: new Set<string>(),
    ...mockJarvis,
  }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const mount = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AppearanceProvider>
        <ActivityScreen />
      </AppearanceProvider>
    </SafeAreaProvider>
  );

const NOW = Date.now();
const chat = (from: 'user' | 'jarvis', text: string, at: number) => ({ from, text, at });

beforeEach(() => {
  mockJarvis = {};
  mockMarkRead.mockClear();
  mockMarkOne.mockClear();
  mockOpenChat.mockClear();
});

describe('ActivityScreen', () => {
  const state = jest.requireActual('../../state/hudReducer').initialHudState;

  it('opens on the timeline', async () => {
    const { findByTestId } = await mount();
    expect(await findByTestId('activity-screen')).toBeTruthy();
  });

  it('says so plainly when nothing has happened', async () => {
    const { findByTestId } = await mount();
    expect(await findByTestId('activity-empty')).toBeTruthy();
  });

  it('offers no mark-all-read while there is nothing unread', async () => {
    // a control that no-ops most of the time you look at it stops reading as one
    const { queryByTestId } = await mount();
    await waitFor(() => expect(queryByTestId('activity-mark-read')).toBeNull());
  });

  it('offers mark-all-read once something is unread', async () => {
    mockJarvis = { alertsUnread: 4 };
    const { findByTestId } = await mount();
    expect(await findByTestId('activity-mark-read')).toBeTruthy();
  });

  it('marks everything read when pressed', async () => {
    mockJarvis = { alertsUnread: 4 };
    const { findByTestId } = await mount();
    fireEvent.press(await findByTestId('activity-mark-read'));
    expect(mockMarkRead).toHaveBeenCalledTimes(1);
  });

  it('names the number it would clear, for a screen reader', async () => {
    mockJarvis = { alertsUnread: 4 };
    const { findByTestId } = await mount();
    expect((await findByTestId('activity-mark-read')).props.accessibilityLabel).toBe('Mark all 4 as read');
  });

  it('still shows the approvals section, which reading cannot clear', async () => {
    mockJarvis = {
      alertsUnread: 0,
      hud: {
        ...state,
        parked: [{ id: 'p1', goal: 'delete a file', action: 'rm', detail: 'temp.txt', at: 1 }],
      },
    };
    const { queryByTestId, findByTestId } = await mount();
    await findByTestId('activity-screen');
    // nothing unread, so no mark-read control — but the approval is still there
    expect(queryByTestId('activity-mark-read')).toBeNull();
  });
});

/**
 * A briefing is two or three sentences and the row is three lines, so the panel
 * was showing a truncated version of the only thing it exists to show. Reported
 * from the device on 2026-08-21 — "in activity panel notifications are truncated".
 */
describe('opening one entry', () => {
  const oneReply = {
    hud: { ...jest.requireActual('../../state/hudReducer').initialHudState, chat: [chat('jarvis', 'Before you leave Home, sir\nA 62% chance of rain on your way out, around 1.2 mm. An umbrella, unless you have grown fond of arriving wet. (8 AM–11 AM)', NOW)] },
  };

  it('shows the whole message, with nothing cut off', async () => {
    mockJarvis = oneReply;
    const { findByTestId } = await mount();
    fireEvent.press(await findByTestId(`activity-jarvis-${NOW}`));
    const box = await findByTestId('activity-detail');
    // scoped to the box: the row holds the same string, clamped to three lines by
    // `numberOfLines`, so an unscoped query matches the very thing being escaped
    expect(within(box).getByText(/grown fond of arriving wet/)).toBeTruthy();
    expect(within(box).getByText(/Before you leave Home, sir/)).toBeTruthy();
  });

  it('offers the conversation, because a reply has one to go to', async () => {
    mockJarvis = oneReply;
    const { findByTestId } = await mount();
    fireEvent.press(await findByTestId(`activity-jarvis-${NOW}`));
    fireEvent.press(await findByTestId('activity-open-chat'));
    expect(mockOpenChat).toHaveBeenCalledTimes(1);
  });

  it('marks that one read, and only that one', async () => {
    mockJarvis = oneReply;
    const { findByTestId } = await mount();
    fireEvent.press(await findByTestId(`activity-jarvis-${NOW}`));
    expect(mockMarkOne).toHaveBeenCalledWith(`jarvis-${NOW}`);
    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it('does not offer the conversation for a step the agent took', async () => {
    // a trace entry has no turn in the chat to open, so the button would lie
    mockJarvis = {
      hud: {
        ...jest.requireActual('../../state/hudReducer').initialHudState,
        trace: [{ goal: 'tidy up', event: 'ran', detail: 'rm temp.txt', step: 1, at: NOW }],
      },
    };
    const { findByTestId, queryByTestId } = await mount();
    fireEvent.press(await findByTestId(`activity-trace-${NOW}-1`));
    expect(await findByTestId('activity-detail')).toBeTruthy();
    expect(queryByTestId('activity-open-chat')).toBeNull();
  });

  it('closes again', async () => {
    mockJarvis = oneReply;
    const { findByTestId, queryByTestId } = await mount();
    fireEvent.press(await findByTestId(`activity-jarvis-${NOW}`));
    fireEvent.press(await findByTestId('activity-close'));
    await waitFor(() => expect(queryByTestId('activity-detail')).toBeNull());
  });
});

/**
 * The panel rendered a hard `slice(0, 40)` and said nothing about it, so a log
 * longer than that was quietly incomplete — indistinguishable from a log that
 * really was 40 long.
 */
describe('a timeline longer than the panel', () => {
  const many = {
    hud: {
      ...jest.requireActual('../../state/hudReducer').initialHudState,
      chat: Array.from({ length: 30 }, (_, i) => chat('jarvis', `reply ${i}`, NOW - i * 1000)),
    },
  };

  it('shows a page rather than all thirty', async () => {
    mockJarvis = many;
    const { findByTestId, queryByTestId } = await mount();
    await findByTestId(`activity-jarvis-${NOW}`);
    expect(queryByTestId(`activity-jarvis-${NOW - 29000}`)).toBeNull();
  });

  it('says how many are still behind the button', async () => {
    mockJarvis = many;
    const { findByTestId } = await mount();
    const more = await findByTestId('activity-more');
    expect(more.props.accessibilityLabel).toBe('Show 18 more');
  });

  it('reveals the next page when pressed', async () => {
    mockJarvis = many;
    const { findByTestId, queryByTestId } = await mount();
    fireEvent.press(await findByTestId('activity-more'));
    await waitFor(() => expect(queryByTestId(`activity-jarvis-${NOW - 20000}`)).toBeTruthy());
  });

  it('offers no button once everything is shown', async () => {
    mockJarvis = {
      hud: {
        ...jest.requireActual('../../state/hudReducer').initialHudState,
        chat: [chat('jarvis', 'the only one', NOW)],
      },
    };
    const { findByTestId, queryByTestId } = await mount();
    await findByTestId(`activity-jarvis-${NOW}`);
    expect(queryByTestId('activity-more')).toBeNull();
  });
});

/**
 * Grouped by day, the way the chat is. A bare `08:02` is unambiguous only while
 * the log dies with the app; once it survives a restart the same string could be
 * from any morning.
 */
describe('the days', () => {
  it('puts a rule with the day on it between one day and the next', async () => {
    const yesterday = NOW - 86_400_000;
    mockJarvis = {
      hud: {
        ...jest.requireActual('../../state/hudReducer').initialHudState,
        chat: [chat('jarvis', 'today', NOW), chat('jarvis', 'yesterday', yesterday)],
      },
    };
    const { findByText } = await mount();
    expect(await findByText('Today')).toBeTruthy();
    expect(await findByText('Yesterday')).toBeTruthy();
  });
});

/**
 * What the header is allowed to claim, and what the rows have to show.
 */
describe('the header count', () => {
  it('leaves out the message you just typed', async () => {
    mockJarvis = {
      hud: {
        ...jest.requireActual('../../state/hudReducer').initialHudState,
        chat: [chat('user', 'how far is the office', NOW), chat('jarvis', 'Twenty four minutes, sir.', NOW + 1)],
      },
    };
    const { findByText } = await mount();
    expect(await findByText('1 FROM JARVIS')).toBeTruthy();
  });
});

describe('an entry that has not been read', () => {
  it('is marked, so the unread ones can be picked out', async () => {
    mockJarvis = {
      hud: {
        ...jest.requireActual('../../state/hudReducer').initialHudState,
        chat: [chat('jarvis', 'unseen', NOW)],
      },
      readIds: new Set<string>(),
    };
    const { findByTestId } = await mount();
    expect(await findByTestId(`activity-unread-jarvis-${NOW}`)).toBeTruthy();
  });

  it('loses the mark once it has been read', async () => {
    mockJarvis = {
      hud: {
        ...jest.requireActual('../../state/hudReducer').initialHudState,
        chat: [chat('jarvis', 'seen', NOW)],
      },
      readIds: new Set([`jarvis-${NOW}`]),
    };
    const { findByTestId, queryByTestId } = await mount();
    await findByTestId(`activity-jarvis-${NOW}`);
    expect(queryByTestId(`activity-unread-jarvis-${NOW}`)).toBeNull();
  });
});

/**
 * The dot and the count have to agree about what "unread" means.
 *
 * Caught on the phone 2026-08-21: the header count already excluded your own
 * messages, and the dot did not — so a line you had just typed sat there marked
 * unread. Two definitions of the same word on one screen.
 */
describe('what can be unread', () => {
  it('never marks your own message unread, because you have seen it', async () => {
    mockJarvis = {
      hud: {
        ...jest.requireActual('../../state/hudReducer').initialHudState,
        chat: [chat('user', 'yes.. but in weekend I will work', NOW)],
      },
      readIds: new Set<string>(),
    };
    const { findByTestId, queryByTestId } = await mount();
    await findByTestId(`activity-user-${NOW}`);
    expect(queryByTestId(`activity-unread-user-${NOW}`)).toBeNull();
  });

  it('never marks an entry with nothing to read unread', async () => {
    mockJarvis = {
      hud: {
        ...jest.requireActual('../../state/hudReducer').initialHudState,
        trace: [{ goal: '', event: 'woke', detail: '', step: 1, at: NOW }],
      },
      readIds: new Set<string>(),
    };
    const { findByTestId, queryByTestId } = await mount();
    await findByTestId(`activity-trace-${NOW}-1`);
    expect(queryByTestId(`activity-unread-trace-${NOW}-1`)).toBeNull();
  });

  it('still marks what Jarvis said unread', async () => {
    mockJarvis = {
      hud: {
        ...jest.requireActual('../../state/hudReducer').initialHudState,
        chat: [chat('jarvis', 'A welcome reprieve, Sir.', NOW)],
      },
      readIds: new Set<string>(),
    };
    const { findByTestId } = await mount();
    expect(await findByTestId(`activity-unread-jarvis-${NOW}`)).toBeTruthy();
  });
});
