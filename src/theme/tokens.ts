import { Platform, TextStyle, ViewStyle } from 'react-native';

/** Lifted verbatim from jarvis-frontend/src/App.scss and _loginTokens.scss. */
export const COLOR = {
  cyan: '#00ffcc',
  cyanDim: 'rgba(0,255,204,0.1)',
  bg: '#050505',
  panel: 'rgba(6,10,14,0.82)',
  red: '#ff3366',
  green: '#22ff88',
  gold: '#ffd700',
  dim: 'rgba(255,255,255,0.55)',
  /** transparent-cyan gradient stops so no component hand-writes an rgba string */
  cyanGlow: 'rgba(0,255,204,0.22)',
  cyanNone: 'rgba(0,255,204,0)',
} as const;

export const FONT = {
  display: 'Orbitron_700Bold',
  displayRegular: 'Orbitron_400Regular',
  data: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
} as const;

export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/** HUD_EASE — the same cubic-bezier the desk HUD feeds GSAP. */
export const HUD_BEZIER = [0.16, 1, 0.3, 1] as const;

/** radial scrim behind the whole canvas */
export const SCRIM = ['rgba(2,10,12,0.6)', 'rgba(1,4,6,0.94)'] as const;

/**
 * Type scale — named sizes so components stop inventing font sizes.
 * display sizes use FONT.display, data sizes use FONT.data.
 */
export const TYPE = {
  brand: { fontFamily: FONT.display, fontSize: 20, letterSpacing: 4 },
  statusLabel: { fontFamily: FONT.display, fontSize: 12, letterSpacing: 5 },
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

/** A luminous box glow (RN view-shadow equivalent), for the orb and similar. */
export function glowBox(color: string, radius = 12): ViewStyle {
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: radius,
    elevation: radius,
  };
}
