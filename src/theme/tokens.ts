import { Platform, TextStyle, ViewStyle } from 'react-native';

/**
 * Arc-reactor palette. Electric blue on deep navy — the phone client
 * deliberately does NOT copy the desk HUD's cyan-on-black, because the phone
 * is a glanceable single-canvas surface and the desk is an instrument wall.
 * One accent hue, three semantic signal colours, nothing else.
 */
export const COLOR = {
  /** primary accent — rings, values, active text */
  blue: '#3ea6ff',
  /** inner ring highlight, the hottest part of the reactor */
  blueBright: '#9bdcff',
  /** saturated outer bloom */
  blueDeep: '#0b63ff',
  /** unlit meter segments, pill backing */
  blueDim: 'rgba(62,166,255,0.12)',
  /** transparent-blue gradient stops so no component hand-writes an rgba string */
  blueGlow: 'rgba(62,166,255,0.30)',
  blueNone: 'rgba(62,166,255,0)',

  /** page floor, below the gradient */
  bg: '#020814',
  /** gradient crown behind the reactor */
  navy: '#0a1b3d',
  /** sheet and card fill */
  panel: 'rgba(10,24,48,0.72)',
  /** hairline separators */
  line: 'rgba(120,180,255,0.14)',

  red: '#ff4d6a',
  green: '#3ce6a5',
  gold: '#ffbf47',
  white: '#eaf4ff',
  dim: 'rgba(198,222,255,0.55)',
} as const;

export const FONT = {
  display: 'Orbitron_700Bold',
  displayRegular: 'Orbitron_400Regular',
  data: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
} as const;

export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/** HUD_EASE — the same cubic-bezier the desk HUD feeds GSAP. */
export const HUD_BEZIER = [0.16, 1, 0.3, 1] as const;

/** vertical canvas gradient: navy crown, deep middle, near-black floor */
export const SCRIM = ['#0a1b3d', '#051129', '#01060f'] as const;

/**
 * Type scale — named sizes so components stop inventing font sizes.
 * display sizes use FONT.display, data sizes use FONT.data.
 */
export const TYPE = {
  brand: { fontFamily: FONT.display, fontSize: 13, letterSpacing: 6 },
  /** the JARVIS lockup inside the reactor */
  wordmark: { fontFamily: FONT.display, fontSize: 22, letterSpacing: 10 },
  statusLabel: { fontFamily: FONT.display, fontSize: 12, letterSpacing: 5 },
  /** the one-line readout under the reactor */
  strip: { fontFamily: FONT.data, fontSize: 10, letterSpacing: 2 },
  panelTitle: { fontFamily: FONT.display, fontSize: 9, letterSpacing: 3 },
  dataValue: { fontFamily: FONT.data, fontSize: 13 },
  dataLabel: { fontFamily: FONT.data, fontSize: 10, letterSpacing: 1 },
  meta: { fontFamily: FONT.data, fontSize: 11, lineHeight: 16 },
} as const satisfies Record<string, TextStyle>;

/** A luminous text glow — the desk HUD's `text-shadow` idiom, ported to RN. */
export function glowText(color: string, radius = 8): TextStyle {
  return {
    textShadowColor: color,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: radius,
  };
}

/** A luminous box glow (RN view-shadow equivalent), for the reactor and similar. */
export function glowBox(color: string, radius = 12): ViewStyle {
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: radius,
    elevation: radius,
  };
}
