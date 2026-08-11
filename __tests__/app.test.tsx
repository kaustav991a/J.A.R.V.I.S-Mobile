import { render } from '@testing-library/react-native';
import App from '../App';

/**
 * Mounts the whole app exactly as the device does — every provider, the
 * navigator, the glass, the launch overlay.
 *
 * A render crash in a release build takes the process down with no message, so
 * "the app just exits" is all the evidence a phone gives. This is where that
 * class of bug gets caught instead: anything that throws on mount fails here
 * with a stack.
 */
describe('App', () => {
  it('mounts the whole tree without throwing', async () => {
    const { findByTestId } = await render(<App />);
    // the launch overlay sits over the live app, so it is what shows first
    expect(await findByTestId('launch-screen')).toBeTruthy();
  });

  it('has the navigator mounted behind the launch screen', async () => {
    const { findByTestId } = await render(<App />);
    expect(await findByTestId('tab-bar')).toBeTruthy();
  });
});
