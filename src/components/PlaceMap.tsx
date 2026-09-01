import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';

import { labelAt, mapPlot } from '../lib/placeMap';
import type { KnownPlace } from '../lib/knownPlaces';
import { COLOR, RADIUS, SPACE, TYPE } from '../theme/tokens';
import { useAppearance } from '../theme/appearance';

/**
 * Your named places, drawn to scale, with the circles the app matches on.
 *
 * **A diagnostic, not a map.** It exists because Home and a named area about 150
 * metres apart sat inside each other's match circles, so walking between them never
 * changed what the app said — a question about proportion, which is drawing rather
 * than cartography.
 *
 * **Road tiles and a 3D tilt were built here and taken out again on 2026-09-01.**
 * Both worked on the device: OSM tiles aligned in Mercator underneath, and the ground
 * laying back with the reading lifted to its altitude. They were removed on the plain
 * report that the dots were what was wanted. Worth knowing before either is rebuilt —
 * the tiles cost a watermark once CARTO's dark basemap turned out to want an API key,
 * and the tilt turns the circles into ellipses, which ruins the one comparison this
 * panel exists to make. Both are in git if the answer changes.
 *
 * The dashed ring is the reading's own error. When it is wider than the gap between
 * two places the app refuses to name either, and this is where you can see why.
 */
export function PlaceMap({
  places,
  fix,
  size = 260,
}: {
  places: KnownPlace[];
  fix: { lat: number; lon: number; accuracy?: number } | null;
  size?: number;
}) {
  const { accent, animations } = useAppearance();
  const plot = mapPlot({ places, fix, size });

  /**
   * The sonar ring under the reading, on a View rather than an SVG attribute.
   *
   * `useAnimatedProps` on a `react-native-svg` shape silently does nothing on this
   * stack — reanimated 4 with svg 15 — and falls back to the static props with no
   * error at all. `ArcReactor` paid for that with an ignition nobody ever saw.
   */
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!animations) return;
    pulse.value = 0;
    pulse.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) }),
      -1,
      false
    );
  }, [animations, pulse]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - pulse.value),
    transform: [{ scale: 0.4 + pulse.value * 2.2 }],
  }));

  if (!plot.places.length && !plot.you) {
    return (
      <View style={styles.empty} testID="place-map-empty">
        <Text style={styles.caption}>
          Nothing to draw yet. Name a place on the Places screen and it appears here, with the
          circle the app matches on.
        </Text>
      </View>
    );
  }

  /** a scale bar of a round number of metres, so the drawing can be measured by eye */
  const barM = plot.metresPerPixel * size > 600 ? 200 : 50;
  const barPx = barM / plot.metresPerPixel;

  return (
    <View testID="place-map">
      <View style={[styles.frame, { width: size, height: size }]}>
        <Svg width={size} height={size}>
          {plot.places.map((p) => (
            <Circle
              key={`ring-${p.label}`}
              cx={p.x}
              cy={p.y}
              r={p.r}
              fill={accent}
              fillOpacity={0.07}
              stroke={accent}
              strokeOpacity={0.35}
              strokeWidth={1}
            />
          ))}
          {plot.you ? (
            <Circle
              testID="place-map-accuracy"
              cx={plot.you.x}
              cy={plot.you.y}
              r={plot.you.r}
              fill={COLOR.green}
              fillOpacity={0.08}
              stroke={COLOR.green}
              strokeOpacity={0.5}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}
          {plot.places.map((p) => (
            <Circle key={`dot-${p.label}`} cx={p.x} cy={p.y} r={3.5} fill={accent} />
          ))}
          {plot.places.map((p) => {
            // a label centred on a circle at the edge is clipped, not wrapped: the phone
            // rendered "Sector V Metro Station" as "or V Metro Station"
            const label = labelAt(p.x, size);
            return (
              <SvgText
                key={`label-${p.label}`}
                x={label.x}
                y={p.y - 9}
                fill={COLOR.white}
                fontSize={10}
                textAnchor={label.anchor}
              >
                {p.label}
              </SvgText>
            );
          })}
          {plot.you ? <Circle cx={plot.you.x} cy={plot.you.y} r={4.5} fill={COLOR.green} /> : null}
          {/* the scale bar, bottom left, so the circles are a measurement */}
          <Line
            x1={10}
            y1={size - 12}
            x2={10 + barPx}
            y2={size - 12}
            stroke={COLOR.dim}
            strokeWidth={2}
          />
          <SvgText x={10} y={size - 18} fill={COLOR.dim} fontSize={9}>
            {`${barM} m`}
          </SvgText>
        </Svg>

        {/*
          Over the canvas rather than inside it, and only when animation is allowed: a
          toggle in Appearance that stops the reactor must stop this too, or it is a
          setting that half works.
        */}
        {plot.you && animations ? (
          <Animated.View
            testID="place-map-pulse"
            pointerEvents="none"
            style={[
              styles.pulse,
              { left: plot.you.x - PULSE_PX, top: plot.you.y - PULSE_PX },
              ringStyle,
            ]}
          />
        ) : null}
      </View>

      <Text testID="place-map-caption" style={styles.caption}>
        {plot.overlapping
          ? 'Two of these circles overlap. Standing in the overlap, the app cannot tell which place you are at — and says nothing rather than guessing.'
          : 'Each circle is how close you must be for the app to call it that place. The dashed ring is how sure this reading is.'}
        {plot.hidden > 0
          ? ` ${plot.hidden} other named ${plot.hidden === 1 ? 'place is' : 'places are'} too far away to draw at this scale.`
          : ''}
      </Text>
    </View>
  );
}

/** the resting radius of the sonar ring, in pixels, before it is scaled */
const PULSE_PX = 14;

const styles = StyleSheet.create({
  pulse: {
    position: 'absolute',
    width: PULSE_PX * 2,
    height: PULSE_PX * 2,
    borderRadius: PULSE_PX,
    borderWidth: 1.5,
    borderColor: COLOR.green,
  },
  empty: {
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    padding: SPACE.lg,
  },
  frame: { overflow: 'hidden', borderRadius: RADIUS.lg },
  caption: { ...TYPE.meta, fontSize: 11, lineHeight: 17, color: COLOR.dim, marginTop: SPACE.sm },
});
