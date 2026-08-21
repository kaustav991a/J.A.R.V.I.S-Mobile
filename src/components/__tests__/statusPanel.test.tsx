import { render } from '@testing-library/react-native';
import { StatusPanel } from '../StatusPanel';
import { AppearanceProvider } from '../../theme/appearance';
import type { StatusFacts } from '../../lib/status';

/**
 * The panel exists so a report can name the thing that is off. So the thing it
 * must never do is be ambiguous itself — which is what these pin.
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

const mount = (over: Partial<StatusFacts> = {}) =>
  render(
    <AppearanceProvider>
      <StatusPanel facts={facts(over)} />
    </AppearanceProvider>
  );

describe('the status panel', () => {
  it('draws a row for every seam', async () => {
    const { findByTestId } = await mount();
    for (const id of ['desk', 'link', 'token', 'push', 'schedule', 'location', 'usage', 'lock']) {
      expect(await findByTestId(`status-${id}`)).toBeTruthy();
    }
  });

  it('puts a word beside every dot, never a dot alone', async () => {
    // red against green is the one distinction a colour-blind reader cannot make
    const { findByTestId } = await mount();
    expect((await findByTestId('status-word-link')).props.children).toBe('CLOUD');
  });

  it('says all present when nothing is wrong', async () => {
    const { findByTestId } = await mount();
    expect((await findByTestId('status-summary')).props.children).toBe('ALL PRESENT');
  });

  it('counts what is off, and does not count what is merely unknown', async () => {
    const { findByTestId } = await mount({ usageAccess: 'denied', push: 'unasked' });
    expect((await findByTestId('status-summary')).props.children).toBe('1 OFF');
  });

  it('explains a state that cannot explain itself', async () => {
    const { findByTestId } = await mount({ scheduleAtGateway: false });
    const note = await findByTestId('status-note-schedule');
    expect(note.props.children).toContain('The phone is briefing');
  });

  it('does not call a setting a fault', async () => {
    const { findByTestId } = await mount({ shareLocation: false });
    expect((await findByTestId('status-word-location')).props.children).toBe('OFF BY CHOICE');
  });
});

/**
 * Read aloud, the panel has to keep the pairing it exists for.
 *
 * Unaided, a screen reader announces "The desk", then "ATTACHED", then the note, as
 * three unrelated stops — so the one thing this panel is for, a seam beside its
 * state, is exactly what does not survive being read.
 */
describe('read aloud', () => {
  it('says the seam and its state in one breath', async () => {
    const { findByTestId } = await mount();
    expect((await findByTestId('status-desk')).props.accessibilityLabel).toBe('The desk: ATTACHED.');
  });

  it('carries the explanation into the same announcement', async () => {
    const { findByTestId } = await mount({ scheduleAtGateway: false });
    const label = (await findByTestId('status-schedule')).props.accessibilityLabel;
    expect(label).toContain('Briefing schedule: ON THIS PHONE.');
    expect(label).toContain('The phone is briefing');
  });

  it('is one stop per row, not four', async () => {
    const { findByTestId } = await mount();
    expect((await findByTestId('status-link')).props.accessible).toBe(true);
  });
});
