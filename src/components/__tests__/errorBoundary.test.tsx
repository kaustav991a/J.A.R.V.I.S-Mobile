import { render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ErrorBoundary } from '../ErrorBoundary';
import { clearCrashes, loadCrashes } from '../../lib/crashLog';

/**
 * The boundary already showed a render crash. What it did not do was remember it.
 *
 * A release build has no red box, so the screen it puts up is the only account of
 * the fault — and it lasts exactly as long as the process does. Restart, and the
 * app has nothing to say about why it restarted. These tests are about the half
 * that survives: the same crash, written down, still there on the next launch.
 */

const Boom = (): never => {
  throw new TypeError('undefined is not a function');
};

const mount = (children: React.ReactNode) => render(<ErrorBoundary>{children}</ErrorBoundary>);

beforeEach(async () => {
  await clearCrashes();
  // React prints the caught error itself; the boundary is the thing under test
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore();
});

describe('a screen that throws while rendering', () => {
  it('still shows what broke', async () => {
    const { findByTestId } = await mount(<Boom />);
    expect((await findByTestId('crash-message')).props.children).toContain(
      'undefined is not a function'
    );
  });

  it('is written down, so the next launch can still answer for it', async () => {
    await mount(<Boom />);
    await waitFor(async () => {
      const [crash] = await loadCrashes();
      expect(crash?.message).toBe('undefined is not a function');
      expect(crash?.kind).toBe('render');
    });
  });

  it('keeps a stack, which is what names the screen that did it', async () => {
    await mount(<Boom />);
    await waitFor(async () => {
      const [crash] = await loadCrashes();
      expect(crash?.frames.length).toBeGreaterThan(0);
    });
  });
});

describe('a tree that renders', () => {
  it('is left alone, and records nothing', async () => {
    const { findByText } = await mount(<Text>all well</Text>);
    expect(await findByText('all well')).toBeTruthy();
    expect(await loadCrashes()).toEqual([]);
  });
});
