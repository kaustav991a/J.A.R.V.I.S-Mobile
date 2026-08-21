import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AccessibilityInfo } from 'react-native';
import { COLOR } from './tokens';

export type AccentKey = 'blue' | 'violet' | 'pink' | 'green' | 'amber';

/** the five swatches on the Appearance screen */
export const ACCENTS: Record<AccentKey, string> = {
  blue: COLOR.blue,
  violet: '#a06bff',
  pink: '#ff5c9d',
  green: COLOR.green,
  amber: COLOR.gold,
};

export type AppearanceState = {
  accentKey: AccentKey;
  setAccentKey: (a: AccentKey) => void;
  /** resolved hex for the chosen accent */
  accent: string;
  /** 0–1. Scales every glow radius in the app. */
  glow: number;
  setGlow: (g: number) => void;
  animations: boolean;
  setAnimations: (on: boolean) => void;
};

/**
 * No theme among these, and that is deliberate as of 2026-08-21.
 *
 * The choice was Dark or System, System behaved identically, and the screen said so
 * in a note. A control that changes nothing invites a tap, answers nothing, and
 * teaches that the rest of the screen might be decoration too. The instrument look
 * is the product; a light variant comes back only if a real user asks for one.
 */
const DEFAULTS = { accentKey: 'blue' as AccentKey, glow: 0.6, animations: true };

const AppearanceContext = createContext<AppearanceState | null>(null);

/**
 * Appearance is real state, not a decorative settings screen: the accent
 * tints the reactor, the tab bar and every primary button; glow scales shadow
 * radii; and turning animations off actually stops the reactor's loops.
 *
 * It is deliberately in-memory for now. Persisting it belongs with the token
 * storage work, so that there is one place that owns writing to the device.
 */
export function AppearanceProvider({ children }: PropsWithChildren) {
  const [accentKey, setAccentKey] = useState<AccentKey>(DEFAULTS.accentKey);
  const [glow, setGlow] = useState(DEFAULTS.glow);

  /**
   * Motion follows the phone until somebody says otherwise.
   *
   * Someone who has turned reduced motion on at the OS level has already answered
   * this question, and making them find a second switch inside one app is the app
   * not listening. So the OS supplies the default and keeps supplying it — a phone
   * that changes its mind while this app is open is followed.
   *
   * A deliberate toggle outranks it permanently. Reduced motion is a default, not a
   * veto: reaching into this app's own settings is the more specific instruction, and
   * from then on the OS is not consulted again. `overridden` is a ref rather than
   * state because nothing renders differently for it — it only decides who wins.
   */
  const [animations, setAnimationsState] = useState(DEFAULTS.animations);
  const overridden = useRef(false);

  const setAnimations = useCallback((on: boolean) => {
    overridden.current = true;
    setAnimationsState(on);
  }, []);

  useEffect(() => {
    let alive = true;
    const follow = (reduce: boolean) => {
      if (alive && !overridden.current) setAnimationsState(!reduce);
    };
    // wrapped: this is a native bridge call, and a phone that cannot answer must
    // leave the default alone rather than take the provider down
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(follow)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', follow);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const value = useMemo<AppearanceState>(
    () => ({
      accentKey,
      setAccentKey,
      accent: ACCENTS[accentKey],
      glow,
      setGlow,
      animations,
      setAnimations,
    }),
    [accentKey, glow, animations]
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

/**
 * Falls back to the defaults rather than throwing when there is no provider,
 * so a single component can still be rendered bare in a test.
 */
export function useAppearance(): AppearanceState {
  const ctx = useContext(AppearanceContext);
  if (ctx) return ctx;
  return {
    ...DEFAULTS,
    accent: ACCENTS[DEFAULTS.accentKey],
    setAccentKey: () => {},
    setGlow: () => {},
    setAnimations: () => {},
  };
}
