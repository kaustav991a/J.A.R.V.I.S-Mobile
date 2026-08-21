import { AccessibilityInfo, Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import { AppearanceProvider, useAppearance } from '../appearance';

/**
 * Motion, and who gets to decide it.
 *
 * The Appearance screen has always had an animation switch, and it defaulted to on
 * whatever the phone had been told. Someone who has turned reduced motion on at the
 * OS level has already answered this question once, and making them find a second
 * switch inside one app is the app not listening.
 *
 * A deliberate toggle still wins. Reduced motion is a default, not a veto: if the
 * switch is touched, that is the more specific instruction and the OS stops being
 * consulted.
 */
let reduced = false;
let listener: ((on: boolean) => void) | null = null;

beforeEach(() => {
  reduced = false;
  listener = null;
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockImplementation(() => Promise.resolve(reduced));
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((event: string, cb: unknown) => {
    if (event === 'reduceMotionChanged') listener = cb as (on: boolean) => void;
    return { remove: jest.fn() };
  }) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function Probe({ turnOn = false }: { turnOn?: boolean }) {
  const { animations, setAnimations } = useAppearance();
  return (
    <>
      <Text testID="animations">{String(animations)}</Text>
      <Text testID="toggle" onPress={() => setAnimations(turnOn)}>
        toggle
      </Text>
    </>
  );
}

const mount = (props: { turnOn?: boolean } = {}) =>
  render(
    <AppearanceProvider>
      <Probe {...props} />
    </AppearanceProvider>
  );

describe('motion, defaulted from the phone', () => {
  it('leaves animation on when the phone has not asked for less', async () => {
    const view = await mount();
    await waitFor(() => expect(view.getByTestId('animations').props.children).toBe('true'));
  });

  it('turns animation off when the phone asks for reduced motion', async () => {
    reduced = true;
    const view = await mount();
    await waitFor(() => expect(view.getByTestId('animations').props.children).toBe('false'));
  });

  it('follows the phone changing its mind, while nobody has touched the switch', async () => {
    const view = await mount();
    await waitFor(() => expect(view.getByTestId('animations').props.children).toBe('true'));

    await act(async () => {
      listener?.(true);
    });

    expect(view.getByTestId('animations').props.children).toBe('false');
  });

  it('stops listening to the phone once the switch has been used', async () => {
    // the more specific instruction wins: someone who reached into this app's own
    // settings has answered for this app
    reduced = true;
    const view = await mount({ turnOn: true });
    await waitFor(() => expect(view.getByTestId('animations').props.children).toBe('false'));

    await act(async () => {
      view.getByTestId('toggle').props.onPress();
    });
    expect(view.getByTestId('animations').props.children).toBe('true');

    // the phone says reduce again, and is ignored, because it has been overruled
    await act(async () => {
      listener?.(true);
    });
    expect(view.getByTestId('animations').props.children).toBe('true');
  });
});
