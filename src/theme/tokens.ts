import { Platform } from 'react-native';

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
