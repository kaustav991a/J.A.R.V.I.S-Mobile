import { fireEvent, render } from '@testing-library/react-native';

import { WatchingPanel } from '../WatchingPanel';
import { AppearanceProvider } from '../../theme/appearance';
import type { WatchFacts } from '../../lib/watching';

/**
 * Giving the day's remark back, so the next one can be watched rather than waited for.
 *
 * One remark a day is the whole budget, and it makes anticipation the hardest thing in
 * this app to observe: a wrong remark — or simply an early one — costs a day before
 * the next can be seen. `anticipate-v1` sat unexercised on exactly that, with nothing
 * wrong with its triggers.
 *
 * Third lever of the same shape today, after the unarmed fallback and the stale
 * gateway stamp. The pattern is worth naming: **a state nobody can induce is a state
 * nobody can check**, and the answer has each time been a small deliberate control
 * rather than a longer argument about why the check is impossible.
 */
const facts = (over: Partial<WatchFacts> = {}): WatchFacts => ({
  baselineDays: 6,
  placeDays: 6,
  place: 'Office',
  goneBy: 15 * 60 + 40,
  spokenToday: true,
  ...over,
});

const mount = (ui: React.ReactElement) => render(<AppearanceProvider>{ui}</AppearanceProvider>);

describe('clearing the day from the panel', () => {
  it('offers the control once the day has been spent', async () => {
    const { findByTestId } = await mount(<WatchingPanel facts={facts()} onClearToday={jest.fn()} />);
    expect(await findByTestId('watching-clear')).toBeTruthy();
  });

  it('asks for the clear when pressed', async () => {
    const onClearToday = jest.fn();
    const { findByTestId } = await mount(
      <WatchingPanel facts={facts()} onClearToday={onClearToday} />
    );
    fireEvent.press(await findByTestId('watching-clear'));
    expect(onClearToday).toHaveBeenCalled();
  });

  it('offers nothing while the day is still unspent', async () => {
    // a control that would do nothing teaches that the rest of the panel is decoration
    const { queryByTestId, findByTestId } = await mount(
      <WatchingPanel facts={facts({ spokenToday: false })} onClearToday={jest.fn()} />
    );
    await findByTestId('watching-summary');
    expect(queryByTestId('watching-clear')).toBeNull();
  });

  it('stays out of the way where nothing can act on it', async () => {
    // the panel is rendered in places that hold no lever; it must not grow a dead one
    const { queryByTestId, findByTestId } = await mount(<WatchingPanel facts={facts()} />);
    await findByTestId('watching-summary');
    expect(queryByTestId('watching-clear')).toBeNull();
  });
});
