import { render } from '@testing-library/react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { PreviewScreen } from '../PreviewScreen';

/** the screen reads insets directly, so every render needs a provider */
const mount = () =>
  render(
    <SafeAreaProvider
      initialMetrics={
        initialWindowMetrics ?? {
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }
      }
    >
      <PreviewScreen />
    </SafeAreaProvider>
  );

describe('PreviewScreen', () => {
  it('renders the brand, the reactor and the command bar', async () => {
    const { getByText, getByTestId } = await mount();
    expect(getByText('J.A.R.V.I.S')).toBeTruthy();
    expect(getByTestId('arc-reactor')).toBeTruthy();
    expect(getByTestId('command-input')).toBeTruthy();
    expect(getByTestId('command-voice')).toBeTruthy();
  });

  it('puts the panels inside the drag-up sheet', async () => {
    const { getByTestId, getByText } = await mount();
    expect(getByTestId('sheet')).toBeTruthy();
    expect(getByText('delete 3 files')).toBeTruthy();
  });

  it('shows the status strip under the reactor', async () => {
    const { getByTestId } = await mount();
    expect(getByTestId('status-strip')).toBeTruthy();
    expect(getByTestId('status-strip-status').props.children).toBe('ONLINE');
  });
});
