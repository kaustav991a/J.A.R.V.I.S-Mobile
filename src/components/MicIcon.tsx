import Svg, { Line, Path, Rect } from 'react-native-svg';

/**
 * Hand-drawn so the app takes no icon-font dependency for one glyph.
 * Capsule + pickup arc + stem, on a 24-unit grid.
 */
export function MicIcon({ size = 20, color, active = false }: { size?: number; color: string; active?: boolean }) {
  return (
    <Svg testID="mic-icon" width={size} height={size} viewBox="0 0 24 24">
      <Rect
        x={9}
        y={3}
        width={6}
        height={11}
        rx={3}
        fill={active ? color : 'none'}
        stroke={color}
        strokeWidth={1.6}
        opacity={active ? 1 : 0.95}
      />
      <Path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <Line x1={12} y1={18} x2={12} y2={21} stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}
