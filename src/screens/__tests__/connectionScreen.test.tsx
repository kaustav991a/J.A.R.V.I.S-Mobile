import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConnectionScreen } from '../ConnectionScreen';
import { AppearanceProvider } from '../../theme/appearance';

const pair = jest.fn().mockResolvedValue(true);
const connect = jest.fn();
const disconnect = jest.fn();
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
    hud: { deskLinked: null },
    connected: false,
    connecting: false,
    connect,
    disconnect,
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

  it('offers no way to disconnect when there is nothing connected', async () => {
    const { queryByTestId } = await mount();
    expect(queryByTestId('connection-disconnect')).toBeNull();
  });

  it('can switch a live link off by hand', async () => {
    ctx.connected = true;
    const { getByTestId } = await mount();
    await fireEvent.press(getByTestId('connection-disconnect'));
    expect(disconnect).toHaveBeenCalled();
  });

  it('saves from the keyboard, because the button can sit under it', async () => {
    // Android is in `resize` mode and `KeyboardAvoidingView` gets no `behavior`
    // there, so with the keyboard up SAVE & RECONNECT is below the fold — and the
    // token field is the last thing on the screen. The return key is the only
    // route that does not depend on reaching the button.
    const { getByTestId } = await mount();
    await fireEvent.changeText(getByTestId('connection-token-input'), 'sekrit');
    await fireEvent(getByTestId('connection-token-input'), 'submitEditing');
    await waitFor(() => expect(pair).toHaveBeenCalled());
    expect(pair.mock.calls[0][0].token).toBe('sekrit');
  });

  it('will not re-dial the old address while an edit is sitting unsaved', async () => {
    // the top button re-dials with the STORED settings and never reads these
    // fields, so leaving it live answered a tap by reconnecting to the address
    // the user had just replaced — silently, which reads as the fix being ignored
    const { getByTestId, findByTestId } = await mount();
    await fireEvent.changeText(getByTestId('connection-cloud-input'), 'https://gw.onrender.com');
    expect(await findByTestId('connection-dirty')).toBeTruthy();
    await fireEvent.press(getByTestId('connection-connect'));
    expect(connect).not.toHaveBeenCalled();
  });

  it('does not count a blank token box as an unsaved edit', async () => {
    // blank means "keep the one you have", so it must not disable the re-dial
    ctx.pairing = { deskBase: 'http://d:8000', cloudBase: 'https://gw', usingDefault: false, hasToken: true };
    const { getByTestId, queryByTestId } = await mount();
    expect(queryByTestId('connection-dirty')).toBeNull();
    await fireEvent.press(getByTestId('connection-connect'));
    expect(connect).toHaveBeenCalled();
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
