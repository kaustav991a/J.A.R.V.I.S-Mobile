import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppearanceProvider } from '../../theme/appearance';
import { JournalScreen } from '../JournalScreen';

const mockSync = jest.fn();
const mockSize = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), canGoBack: () => true, navigate: jest.fn() }),
}));

jest.mock('../../lib/journal/sync', () => ({ syncUsage: (...a: unknown[]) => mockSync(...a) }));
jest.mock('../../lib/journal/store', () => ({
  openJournal: async () => ({
    size: async () => mockSize(),
    // what Android calls each package, kept by the journal — without it the
    // digest would print "Katana" where the screen should read "Facebook"
    allLabels: async () => ({ 'com.instagram.android': 'Instagram' }),
    dailyFor: async () => [{ day: '2026-08-19', app: 'com.instagram.android', ms: 3_600_000 }],
    eventsBetween: async () => [{ at: 1, kind: 'unlock', app: null }],
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
        <JournalScreen />
      </AppearanceProvider>
    </SafeAreaProvider>
  );

beforeEach(() => {
  mockSync.mockReset();
  mockSize.mockReset().mockResolvedValue({ events: 12, daily: 3 });
});

describe('the Journal screen', () => {
  it('says what it is holding, so the collector is inspectable', async () => {
    mockSync.mockResolvedValue({ state: 'ok', events: 2, daily: 1 });
    const { getByTestId } = await mount();
    await waitFor(() => expect(getByTestId('journal-size').props.children).toContain('12'));
  });

  it('reads today back in the voice, not as a table', async () => {
    mockSync.mockResolvedValue({ state: 'ok', events: 2, daily: 1 });
    const { getByTestId } = await mount();
    await waitFor(() => expect(getByTestId('journal-digest').props.children).toContain('Instagram'));
  });

  /**
   * The whole reason this screen exists.
   *
   * A denied read and a quiet day both come back with no rows. Calling the
   * first one a quiet day is the confusion this project has already spent an
   * evening on, and usage access is revoked from Settings without the app being
   * told.
   */
  it('says the permission is off rather than showing an empty day', async () => {
    mockSync.mockResolvedValue({ state: 'denied' });
    const { getByTestId } = await mount();
    await waitFor(() => expect(getByTestId('journal-digest').props.children).toContain('cannot see'));
  });

  it('offers the way to fix it when access is denied', async () => {
    mockSync.mockResolvedValue({ state: 'denied' });
    const { getByTestId, queryByTestId } = await mount();
    await waitFor(() => expect(getByTestId('journal-grant')).toBeTruthy());
    // and does not offer a sync that cannot do anything
    expect(queryByTestId('journal-sync')).toBeNull();
  });

  it('names a failure instead of going quiet', async () => {
    mockSync.mockResolvedValue({ state: 'error', problem: 'SQLITE_BUSY' });
    const { getByTestId } = await mount();
    await waitFor(() => expect(getByTestId('journal-digest').props.children).toContain('SQLITE_BUSY'));
  });
});

/**
 * Reported from the device: **Sync now** changed no counts, because there was
 * nothing new — and the screen said nothing at all, so a correct answer and a
 * dead button were indistinguishable.
 */
describe('the Journal screen after a sync', () => {
  it('says a sync that found nothing found nothing', async () => {
    mockSync.mockResolvedValue({ state: 'ok', events: 0, daily: 24 });
    const { getByTestId } = await mount();
    await waitFor(() => expect(getByTestId('journal-last').props.children).toContain('Nothing new'));
  });

  it('says what a sync added when it added something', async () => {
    mockSync.mockResolvedValue({ state: 'ok', events: 5, daily: 24 });
    const { getByTestId } = await mount();
    await waitFor(() => expect(getByTestId('journal-last').props.children).toContain('5 new moments'));
  });
});
