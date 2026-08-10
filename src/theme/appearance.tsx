import { PropsWithChildren, createContext, useContext, useMemo, useState } from 'react';
import { COLOR } from './tokens';

export type AccentKey = 'blue' | 'violet' | 'pink' | 'green' | 'amber';
export type ThemeChoice = 'dark' | 'system';

/** the five swatches on the Appearance screen */
export const ACCENTS: Record<AccentKey, string> = {
  blue: COLOR.blue,
  violet: '#a06bff',
  pink: '#ff5c9d',
  green: COLOR.green,
  amber: COLOR.gold,
};

export type AppearanceState = {
  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
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

const DEFAULTS = { theme: 'dark' as ThemeChoice, accentKey: 'blue' as AccentKey, glow: 0.6, animations: true };

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
  const [theme, setTheme] = useState<ThemeChoice>(DEFAULTS.theme);
  const [accentKey, setAccentKey] = useState<AccentKey>(DEFAULTS.accentKey);
  const [glow, setGlow] = useState(DEFAULTS.glow);
  const [animations, setAnimations] = useState(DEFAULTS.animations);

  const value = useMemo<AppearanceState>(
    () => ({
      theme,
      setTheme,
      accentKey,
      setAccentKey,
      accent: ACCENTS[accentKey],
      glow,
      setGlow,
      animations,
      setAnimations,
    }),
    [theme, accentKey, glow, animations]
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
    setTheme: () => {},
    setAccentKey: () => {},
    setGlow: () => {},
    setAnimations: () => {},
  };
}
