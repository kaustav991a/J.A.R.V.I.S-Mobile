import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConnectionScreen } from '../ConnectionScreen';
import { AppearanceProvider } from '../../theme/appearance';

const pair = jest.fn().mockResolvedValue(true);
const connect = jest.fn();
const ctx: Record<string, unknown> = {};

jest.mock('../../state/JarvisProvider', () => ({
  useJarvis: () => ctx,
}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

const mount = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      {/* ScreenTitle reaches for a navigation object; the screen cannot mount bare */}
      <NavigationContainer>
        <AppearanceProvider>
          <ConnectionScreen />
        </AppearanceProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(ctx, {
    connected: false,
    connecting: false,
    connect,
    mode: 'offline',
    lastError: null,
    simulated: false,
    pairing: { deskBase: 'http://192.168.1.9:8000', cloudBase: null, usingDefault: false, hasToken: false },
    pair,
  });
});

describe('ConnectionScreen', () => {
  it('says plainly that an unpaired phone will be refused', async () => {
    // the gateway closes the socket on a missing token, and a phone sitting dark
    // with no explanation is the worst version of that
    const { findByTestId } = await mount();
    expect(await findByTestId('connection-unpaired')).toBeTruthy();
  });

  it('saves the desk address, the gateway and the token, then re-dials', async () => {
    const { getByTestId } = await mount();
    await fireEvent.changeText(getByTestId('connection-desk-input'), '192.168.1.20:8000');
    await fireEvent.changeText(getByTestId('connection-cloud-input'), 'https://gw.onrender.com');
    await fireEvent.changeText(getByTestId('connection-token-input'), 'sekrit');
    await fireEvent.press(getByTestId('connection-save'));
    await waitFor(() =>
      expect(pair).toHaveBeenCalledWith({
        base: '192.168.1.20:8000',
        cloud: 'https://gw.onrender.com',
        token: 'sekrit',
      })
    );
    await waitFor(() => expect(connect).toHaveBeenCalled());
  });

  it('leaves a stored token alone when the box is left blank', async () => {
    // `pairing` reports only THAT a token is held, never its value, so a blank box
    // cannot mean "clear it" — that would unpair the phone on every save
    ctx.pairing = { deskBase: 'http://d:8000', cloudBase: 'https://gw', usingDefault: false, hasToken: true };
    const { getByTestId } = await mount();
    await fireEvent.press(getByTestId('connection-save'));
    await waitFor(() => expect(pair).toHaveBeenCalled());
    expect(pair.mock.calls[0][0]).not.toHaveProperty('token');
  });

  it('reports an address it could not use instead of pretending it saved', async () => {
    pair.mockResolvedValueOnce(false);
    const { getByTestId, findByTestId } = await mount();
    await fireEvent.changeText(getByTestId('connection-desk-input'), 'not a host');
    await fireEvent.press(getByTestId('connection-save'));
    expect(await findByTestId('connection-note')).toHaveTextContent(/not usable/);
    expect(connect).not.toHaveBeenCalled();
  });
});
