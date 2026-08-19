import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppearanceProvider } from '../../theme/appearance';
import { UpdateBanner } from '../UpdateBanner';

/**
 * `checkAutomatically` fetches in the background and applies at the NEXT launch,
 * silently. Reported from the device as getting the update with "no prompt or
 * something" — a change that has happened and says nothing is indistinguishable
 * from one that has not.
 */
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const mount = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AppearanceProvider>
        <UpdateBanner />
      </AppearanceProvider>
    </SafeAreaProvider>
  );

describe('the update banner', () => {
  it('says nothing when nothing is waiting', async () => {
    const updates = jest.requireMock('expo-updates') as { useUpdates: jest.Mock };
    updates.useUpdates.mockReturnValue({ isUpdatePending: false });
    const { queryByTestId } = await mount();
    expect(queryByTestId('update-banner')).toBeNull();
  });

  it('offers the restart that applies a downloaded update', async () => {
    const updates = jest.requireMock('expo-updates') as { useUpdates: jest.Mock };
    updates.useUpdates.mockReturnValue({ isUpdatePending: true });
    const { getByTestId } = await mount();
    expect(getByTestId('update-banner')).toBeTruthy();
    expect(getByTestId('update-banner-restart')).toBeTruthy();
  });

  it('can be dismissed, because nothing is broken while it waits', async () => {
    // a bar that cannot be got rid of would be worse than the silence it replaces
    const updates = jest.requireMock('expo-updates') as { useUpdates: jest.Mock };
    updates.useUpdates.mockReturnValue({ isUpdatePending: true });
    const { getByTestId } = await mount();
    expect(getByTestId('update-banner-dismiss')).toBeTruthy();
  });
});
