import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';

import { mapPlot } from '../lib/placeMap';
import type { KnownPlace } from '../lib/knownPlaces';
import { COLOR, RADIUS, SPACE, TYPE } from '../theme/tokens';
import { useAppearance } from '../theme/appearance';

/**
 * Your named places, drawn to scale, with the circles the app matches on.
 *
 * **This exists because of a specific confusion**, and it is a diagnostic rather than
 * a map: Home and a named area about 150 metres apart, each inside the other's match
 * circle, so walking between them never changed what the app said. Tiles would answer
 * a different question. What was actually asked — *can I see the radius and the
 * overlapped area* — is a question about proportion, and proportion is drawing.
 *
 * `react-native-svg` rather than a map component, and that is not a compromise: it is
 * already a dependency, so this ships over the air, where every real map on Android is
 * a native module and therefore a new build. It also draws the one thing a map would
 * not — the radius itself.
 *
 * The dashed circle is the reading's own error. When it is wider than the gap between
 * two places, the app refuses to name either, and this is where you can see why.
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
  const { accent } = useAppearance();
  const plot = mapPlot({ places, fix, size });

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
        {plot.places.map((p) => (
          <SvgText
            key={`label-${p.label}`}
            x={p.x}
            y={p.y - 9}
            fill={COLOR.white}
            fontSize={10}
            textAnchor="middle"
          >
            {p.label}
          </SvgText>
        ))}
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

const styles = StyleSheet.create({
  empty: {
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    padding: SPACE.lg,
  },
  caption: { ...TYPE.meta, fontSize: 11, lineHeight: 17, color: COLOR.dim, marginTop: SPACE.sm },
});
