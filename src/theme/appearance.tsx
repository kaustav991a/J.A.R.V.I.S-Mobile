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
import { live } from '../state/live';
import { loadAppearance, saveAppearance } from './appearanceStore';

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
 * **It survives a launch as of 2026-08-31.** It was in-memory for months on the
 * reasoning that persisting it belonged with the token storage work, so one place
 * would own writing to the device — which never happened, and meanwhile every launch
 * reset the app to blue. A setting that does not survive reads as a setting that did
 * not work, and this one is visible on the first frame.
 *
 * The write is the last thing that happens, never the first: nothing is stored until
 * the stored look has been read, or an empty disk would be written over the real one
 * during the very first render.
 */
export function AppearanceProvider({ children }: PropsWithChildren) {
  const [accentKey, setAccentKey] = useState<AccentKey>(DEFAULTS.accentKey);
  const [glow, setGlow] = useState(DEFAULTS.glow);
  /**
   * Whether the stored look has been read yet.
   *
   * Guards the write-back below. Without it the first render writes the defaults
   * before the read lands, and the look is lost by the very effect meant to keep it.
   */
  const [hydrated, setHydrated] = useState(false);

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

  /**
   * Read the stored look once, before anything is written.
   *
   * Ordered against the reduced-motion effect below deliberately: a stored
   * `animations` is a choice somebody made, so it sets `overridden` and the OS stops
   * being consulted — while a stored `null` means the switch was never touched and
   * the phone keeps deciding. Getting that backwards would override reduced motion
   * for someone who had asked their phone for less of it.
   */
  useEffect(() => {
    // `live()` rather than a hand-rolled `alive` flag: this settles into provider
    // state, and a bare settle after unmount corrupts the act environment until
    // every later `render` in the file returns an empty tree. It did exactly that
    // here before this line existed
    const l = live();
    void loadAppearance()
      .then(
        l.only((stored) => {
          if (stored) {
            setAccentKey(stored.accentKey);
            setGlow(stored.glow);
            if (stored.animations !== null) {
              overridden.current = true;
              setAnimationsState(stored.animations);
            }
          }
          setHydrated(true);
        })
      )
      .catch(() => {
        // an unreadable look is the default look, and the write-back must still
        // arm or the next choice would not be kept either
        l.only(() => setHydrated(true))();
      });
    return l.end;
  }, []);

  /** write only after the read, and only what was actually chosen */
  useEffect(() => {
    if (!hydrated) return;
    void saveAppearance({
      accentKey,
      glow,
      // null rather than the current value: an untouched switch must stay untouched
      // on disk, or the next launch stops following the phone
      animations: overridden.current ? animations : null,
    });
  }, [hydrated, accentKey, glow, animations]);

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
