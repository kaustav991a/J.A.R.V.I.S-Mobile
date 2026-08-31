import { AccessibilityInfo, Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppearanceProvider, useAppearance } from '../appearance';
import { loadAppearance, saveAppearance } from '../appearanceStore';

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

/**
 * The look, surviving a launch.
 *
 * In-memory until 2026-08-31, so every launch reset accent, glow and motion to the
 * defaults — and the ledger claimed this row as built for days, which is its own
 * lesson about believing a document over a phone.
 *
 * The rule that matters is the one about motion: a stored `null` means the switch
 * was never touched, and the OS must still decide. Restoring `true` for that case
 * would override reduced motion for somebody who had asked the phone for less of it.
 */
describe('the look, across launches', () => {
  const Look = () => {
    const { accentKey, glow, animations, setAccentKey, setGlow } = useAppearance();
    return (
      <>
        <Text testID="accent">{accentKey}</Text>
        <Text testID="glow">{String(glow)}</Text>
        <Text testID="animations">{String(animations)}</Text>
        <Text testID="set-violet" onPress={() => setAccentKey('violet')}>
          violet
        </Text>
        <Text testID="set-glow" onPress={() => setGlow(0.2)}>
          dim
        </Text>
      </>
    );
  };

  const launch = () =>
    render(
      <AppearanceProvider>
        <Look />
      </AppearanceProvider>
    );

  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('starts on the defaults with nothing stored', async () => {
    const view = await launch();
    await waitFor(() => expect(view.getByTestId('accent').props.children).toBe('blue'));
  });

  it('writes the accent it was given, so a later launch has something to open on', async () => {
    const view = await launch();
    fireEvent.press(view.getByTestId('set-violet'));
    await waitFor(async () => expect((await loadAppearance())?.accentKey).toBe('violet'));
  });

  it('opens on the accent that was stored', async () => {
    // seeded rather than written by a previous mount: mounting, unmounting and
    // mounting again inside one test settles a promise outside `act`, and enough of
    // those empty every later render in the file — the failure AGENTS.md describes
    await saveAppearance({ accentKey: 'violet', glow: 0.6, animations: null });
    const view = await launch();
    await waitFor(() => expect(view.getByTestId('accent').props.children).toBe('violet'));
  });

  it('writes the glow too, which is the other half of the look', async () => {
    const view = await launch();
    fireEvent.press(view.getByTestId('set-glow'));
    await waitFor(async () => expect((await loadAppearance())?.glow).toBe(0.2));
  });

  it('opens on the glow that was stored', async () => {
    await saveAppearance({ accentKey: 'blue', glow: 0.2, animations: null });
    const view = await launch();
    await waitFor(() => expect(view.getByTestId('glow').props.children).toBe('0.2'));
  });
  it('does not record a motion choice nobody made', async () => {
    // the OS has to keep deciding until the switch is actually touched
    const view = await launch();
    fireEvent.press(view.getByTestId('set-violet'));
    await waitFor(async () => expect(await loadAppearance()).not.toBeNull());
    expect((await loadAppearance())?.animations).toBeNull();
  });

  it('remembers a motion choice that was made, over what the phone says', async () => {
    reduced = true;
    await saveAppearance({ accentKey: 'blue', glow: 0.6, animations: true });
    const view = await launch();
    // the phone is asking for less motion and the switch says otherwise; the switch
    // is the more specific instruction and it was stored for exactly this moment
    await waitFor(() => expect(view.getByTestId('animations').props.children).toBe('true'));
  });

  it('still follows the phone when nothing was ever chosen', async () => {
    reduced = true;
    await saveAppearance({ accentKey: 'pink', glow: 0.6, animations: null });
    const view = await launch();
    await waitFor(() => expect(view.getByTestId('accent').props.children).toBe('pink'));
    expect(view.getByTestId('animations').props.children).toBe('false');
  });
});
